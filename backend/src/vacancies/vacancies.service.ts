import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Offer } from '../offer-triage/offer.entity';
import { TriageProfileService } from '../offer-triage/triage-profile.service';
import { Vacancy } from './vacancy.entity';
import { admit, scoreVacancy, skillWeights, type ScoreResult } from './vacancy-scoring';

/** El feed comunitario de devsChile. Su API es publica y no pide auth. */
const PEGAS_API = 'https://pegas.devschile.cl/api/pegas';
const PEGAS_SOURCE = 'pegas-devschile';
/**
 * La API responde 403 al User-Agent por defecto de un cliente HTTP y corta la
 * conexion si se la consulta en rafaga. UA de navegador, pausa entre paginas y
 * reintentos: es un sitio comunitario y no hay que martillarlo.
 */
const PEGAS_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36';
const PER_PAGE = 50;
const PAGE_DELAY_MS = 1000;
const MAX_PAGES = 60;
const FETCH_TIMEOUT_MS = 20000;
const UPSERT_CHUNK = 250;
const REJECTED_SAMPLE = 200;

/** Empleadores que el feed usa como "sin dato" y no como nombre real. */
const EMPTY_EMPLOYER = new Set(['no especificado', 'no especificada', '', 'n/a', '-']);

export interface RefreshOptions {
  query?: string;
  category?: string;
  maxPages?: number;
}

export interface RefreshJob {
  status: 'idle' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  pages: number;
  fetched: number;
  upserted: number;
  admitted: number;
  total: number;
  message: string;
  error?: string;
}

export interface ScoreboardItem {
  kind: 'offer' | 'vacancy';
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  category: string | null;
  postedAt: string | null;
  /** Solo en ofertas del CRM: en que columna del tablero esta. */
  status?: string;
  /** Solo en ofertas del CRM: el fit numerico de Jev (0..3) y el veredicto de la compuerta. */
  jevFitScore?: number | null;
  jevDecision?: string | null;
  score: number;
  matchedSkills: string[];
  titleSkills: string[];
  primaryMatches: number;
  signals: string[];
  scoredFrom: 'offer' | 'index' | 'description';
}

/**
 * Trae vacantes de un feed externo, las puntua contra el perfil y las sirve.
 *
 * El puntaje es local y reproducible: no cuesta una llamada por vacante y se puede
 * recalcular el universo entero cuando el perfil cambia. El de Jev sigue siendo el
 * que decide en la cola de triage; este es el que ordena el tablero.
 */
@Injectable()
export class VacanciesService {
  private readonly logger = new Logger(VacanciesService.name);
  private readonly jobs = new Map<string, RefreshJob>();

  constructor(
    @InjectRepository(Vacancy) private readonly vacancies: Repository<Vacancy>,
    @InjectRepository(Offer) private readonly offers: Repository<Offer>,
    @Inject(TriageProfileService) private readonly profiles: TriageProfileService,
  ) {}

  /**
   * Ingesta y puntua. Devuelve enseguida porque tarda: son unas 33 paginas con
   * una pausa de un segundo entre cada una, o sea medio minuto largo.
   *
   * Un request que tarda treinta segundos es un request que el navegador corta, y
   * un boton que parece colgado. Por eso corre en segundo plano y el progreso se
   * consulta en `GET /vacancies/refresh`.
   */
  async startRefresh(userId: string, options: RefreshOptions = {}): Promise<RefreshJob> {
    const running = this.jobs.get(userId);
    if (running?.status === 'running') return running;

    const job: RefreshJob = {
      status: 'running',
      startedAt: new Date().toISOString(),
      pages: 0,
      fetched: 0,
      upserted: 0,
      admitted: 0,
      total: 0,
      message: 'Contactando el feed',
    };
    this.jobs.set(userId, job);

    // Sin await a proposito: el request ya respondio.
    void this.runRefresh(userId, options, job).catch((error) => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.message = 'El refresco fallo';
      job.finishedAt = new Date().toISOString();
      this.logger.error(`refresh de vacantes fallo para ${userId}: ${job.error}`);
    });

    return job;
  }

  getJob(userId: string): RefreshJob {
    return (
      this.jobs.get(userId) ?? {
        status: 'idle',
        pages: 0,
        fetched: 0,
        upserted: 0,
        admitted: 0,
        total: 0,
        message: 'Nunca se refresco',
      }
    );
  }

  /** El refresco diario, para los usuarios que ya tienen vacantes guardadas. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async scheduledRefresh(): Promise<void> {
    const rows = await this.vacancies
      .createQueryBuilder('v')
      .select('DISTINCT v."userId"', 'userId')
      .getRawMany<{ userId: string }>();
    for (const { userId } of rows) {
      if (this.jobs.get(userId)?.status === 'running') continue;
      const job = await this.startRefresh(userId, {});
      this.logger.log(`refresco programado de vacantes para ${userId}: ${job.status}`);
    }
  }

  private async runRefresh(
    userId: string,
    options: RefreshOptions,
    job: RefreshJob,
  ): Promise<void> {
    const profile = await this.profiles.getForUser(userId);
    const weights = skillWeights(profile);
    const today = new Date();

    const { rows, total } = await this.fetchFeed(options, job);
    job.total = total;
    job.fetched = rows.length;
    job.message = `Puntuando ${rows.length} vacantes`;

    const entities: Partial<Vacancy>[] = [];
    let admitted = 0;
    for (const row of rows) {
      const entity = this.toEntity(userId, row, weights, today);
      if (entity.admitted) admitted += 1;
      entities.push(entity);
    }
    job.admitted = admitted;

    job.message = `Guardando ${entities.length} vacantes`;
    for (let index = 0; index < entities.length; index += UPSERT_CHUNK) {
      const chunk = entities.slice(index, index + UPSERT_CHUNK);
      await this.vacancies.upsert(chunk, ['userId', 'source', 'externalId']);
      job.upserted += chunk.length;
    }

    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    job.message = `Listo: ${job.upserted} vacantes, ${admitted} pasan la compuerta`;
  }

  /** Recorre la paginacion del feed hasta agotar el total que declara. */
  private async fetchFeed(
    options: RefreshOptions,
    job: RefreshJob,
  ): Promise<{ rows: any[]; total: number }> {
    const maxPages = Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES);
    const base: Record<string, string> = { porPagina: String(PER_PAGE) };
    if (options.query) base.q = options.query;
    if (options.category) base.categoria = options.category;

    const first = await this.getJson(this.feedUrl(base));
    const total = Number(first?.total ?? 0);
    const rows: any[] = Array.isArray(first?.pegas) ? [...first.pegas] : [];
    job.pages = 1;
    job.message = `${rows.length} de ${total}`;

    let page = 2;
    while (rows.length < total && page <= maxPages) {
      await this.sleep(PAGE_DELAY_MS);
      const chunk = await this.getJson(this.feedUrl({ ...base, pagina: String(page) }));
      const batch = Array.isArray(chunk?.pegas) ? chunk.pegas : [];
      if (batch.length === 0) break;
      rows.push(...batch);
      job.pages = page;
      job.message = `${rows.length} de ${total}`;
      page += 1;
    }

    return { rows, total };
  }

  private feedUrl(params: Record<string, string>): string {
    return `${PEGAS_API}?${new URLSearchParams(params).toString()}`;
  }

  /**
   * Un GET con reintentos.
   *
   * La API corta la conexion de vez en cuando, asi que un fallo de red no puede
   * tumbar el refresco entero: se reintenta con una espera creciente.
   */
  private async getJson(url: string, attempts = 4): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await (globalThis as any).fetch(url, {
          headers: { 'User-Agent': PEGAS_UA, Accept: '*/*' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        await this.sleep(500 * (attempt + 1));
      }
    }
    throw new Error(`el feed no respondio: ${String(lastError)}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Mapea una fila del feed a una vacante puntuada. */
  private toEntity(
    userId: string,
    row: any,
    weights: Record<string, number>,
    today: Date,
  ): Partial<Vacancy> {
    const title = String(row?.titulo ?? '').trim();
    const company = this.cleanEmployer(row?.empleador);
    const location = this.cleanText(row?.ubicacion);
    const description = this.cleanText(row?.descripcion);
    // El indice del feed trae una descripcion de ~59 caracteres que repite el
    // titulo y la ubicacion. Puntuar sobre eso es puntuar sobre el titulo, y el
    // puntaje tiene que decir de donde salio.
    const scoredFrom = 'index';
    const result = scoreVacancy({ title, company, location, description, date: this.postedAt(row) }, weights, today);
    const verdict = admit(result);

    return {
      userId,
      source: PEGAS_SOURCE,
      portal: this.cleanText(row?.fuente),
      externalId: String(row?.id ?? row?.url ?? title),
      title,
      company,
      location,
      category: this.cleanText(row?.categoria),
      salary: this.cleanText(row?.sueldo),
      url: this.cleanText(row?.url),
      postedAt: this.postedAt(row),
      description,
      scoredFrom,
      score: result.score,
      breakdown: result,
      admitted: verdict.admitted,
      rejectReason: verdict.reason ?? null,
      scoredAt: new Date(),
    };
  }

  private postedAt(row: any): string | null {
    const value = this.cleanText(row?.fecha_publicacion);
    if (!value) return null;
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    return match ? match[0] : null;
  }

  /**
   * El feed manda `"None"` como texto cuando no hay sueldo.
   *
   * Es un `None` de Python serializado, no un null de JSON, asi que compararlo
   * contra null no alcanza y el tablero mostraria un sueldo que dice "None".
   */
  private cleanText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'none' || text.toLowerCase() === 'null') return null;
    return text;
  }

  private cleanEmployer(value: unknown): string | null {
    const text = this.cleanText(value);
    if (!text || EMPTY_EMPLOYER.has(text.toLowerCase())) return null;
    return text;
  }

  /** Recalcula los puntajes guardados, sin tocar la red. */
  async rescore(userId: string): Promise<{ rescored: number; admitted: number }> {
    const profile = await this.profiles.getForUser(userId);
    const weights = skillWeights(profile);
    const today = new Date();
    const rows = await this.vacancies.find({ where: { userId } });
    let admitted = 0;
    const entities: Partial<Vacancy>[] = rows.map((vacancy) => {
      const result = scoreVacancy(
        {
          title: vacancy.title,
          company: vacancy.company,
          location: vacancy.location,
          description: vacancy.description,
          date: vacancy.postedAt,
        },
        weights,
        today,
      );
      const verdict = admit(result);
      if (verdict.admitted) admitted += 1;
      return {
        id: vacancy.id,
        score: result.score,
        breakdown: result,
        admitted: verdict.admitted,
        rejectReason: verdict.reason ?? null,
        scoredAt: new Date(),
      };
    });
    for (let index = 0; index < entities.length; index += UPSERT_CHUNK) {
      await this.vacancies.save(entities.slice(index, index + UPSERT_CHUNK));
    }
    return { rescored: entities.length, admitted };
  }

  /**
   * El tablero: todo lo postulable, con un solo puntaje y un solo perfil.
   *
   * Las ofertas del CRM se puntuan al leer porque son pocas y cambian: recalcular
   * cuatro filas es mas barato que mantener una columna sincronizada. Las vacantes
   * ingeridas ya vienen puntuadas de la ingesta, que son 1615.
   */
  async scoreboard(userId: string): Promise<{
    items: ScoreboardItem[];
    rejected: { kind: string; id: string; title: string; company: string | null; url: string | null; reason: string }[];
    totals: { offers: number; vacancies: number; admitted: number; rejected: number };
    meta: { profileSkills: number; weights: Record<string, number>; scoredAt: string };
  }> {
    const profile = await this.profiles.getForUser(userId);
    const weights = skillWeights(profile);
    const today = new Date();

    const [offers, vacancies] = await Promise.all([
      this.offers.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.vacancies.find({ where: { userId }, order: { score: 'DESC' } }),
    ]);

    const items: ScoreboardItem[] = [];
    const rejected: { kind: string; id: string; title: string; company: string | null; url: string | null; reason: string }[] = [];

    for (const offer of offers) {
      // La oferta no guarda fecha de publicacion, asi que no hay bonus de
      // frescura que aplicar. Inventarlo seria puntuar algo que no sabemos.
      const result = scoreVacancy(
        {
          title: offer.title,
          company: offer.company,
          location: offer.location,
          description: offer.description,
          date: null,
        },
        weights,
        today,
      );
      const verdict = admit(result);
      if (!verdict.admitted) {
        rejected.push({
          kind: 'offer',
          id: offer.id,
          title: offer.title,
          company: offer.company ?? null,
          url: offer.url ?? null,
          reason: verdict.reason ?? 'sin motivo',
        });
        continue;
      }
      items.push({
        ...this.itemFromResult('offer', offer.id, result),
        title: offer.title,
        company: offer.company ?? null,
        location: offer.location ?? null,
        url: offer.url ?? null,
        salary: null,
        category: null,
        postedAt: null,
        status: offer.status,
        jevFitScore: offer.fitScore ?? null,
        jevDecision: offer.decision ?? null,
        scoredFrom: 'offer',
      });
    }

    for (const vacancy of vacancies) {
      if (!vacancy.admitted) {
        if (rejected.length < REJECTED_SAMPLE) {
          rejected.push({
            kind: 'vacancy',
            id: vacancy.id,
            title: vacancy.title,
            company: vacancy.company ?? null,
            url: vacancy.url ?? null,
            reason: vacancy.rejectReason ?? 'sin motivo',
          });
        }
        continue;
      }
      const result = (vacancy.breakdown ?? {}) as ScoreResult;
      items.push({
        ...this.itemFromResult('vacancy', vacancy.id, result),
        score: vacancy.score,
        title: vacancy.title,
        company: vacancy.company ?? null,
        location: vacancy.location ?? null,
        url: vacancy.url ?? null,
        salary: vacancy.salary ?? null,
        category: vacancy.category ?? null,
        postedAt: vacancy.postedAt ?? null,
        scoredFrom: vacancy.scoredFrom === 'description' ? 'description' : 'index',
      });
    }

    // Un solo orden para las dos fuentes, porque las dos usan el mismo puntaje.
    // Desempata por cuantas skills del daily stack nombra, que es mas informativo
    // que el alfabeto.
    items.sort(
      (a, b) =>
        b.score - a.score ||
        b.primaryMatches - a.primaryMatches ||
        a.title.localeCompare(b.title),
    );

    return {
      items,
      rejected,
      totals: {
        offers: offers.length,
        vacancies: vacancies.length,
        admitted: items.length,
        rejected: rejected.length,
      },
      meta: {
        profileSkills: Object.keys(weights).length,
        weights,
        scoredAt: new Date().toISOString(),
      },
    };
  }

  private itemFromResult(
    kind: 'offer' | 'vacancy',
    id: string,
    result: ScoreResult,
  ): ScoreboardItem {
    return {
      kind,
      id,
      title: '',
      company: null,
      location: null,
      url: null,
      salary: null,
      category: null,
      postedAt: null,
      score: result.score,
      matchedSkills: result.matchedSkills ?? [],
      titleSkills: result.titleSkills ?? [],
      primaryMatches: result.primaryMatches ?? 0,
      signals: result.signals ?? [],
      scoredFrom: 'offer',
    };
  }
}
