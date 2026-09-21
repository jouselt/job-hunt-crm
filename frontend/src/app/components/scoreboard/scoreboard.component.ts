import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { JobHuntService } from '../../services/job-hunt.service';
import { RefreshJob, Scoreboard, ScoreboardItem } from '../../models/scoreboard.model';

/**
 * El tablero: todo lo postulable, con un puntaje calculado contra el perfil.
 *
 * Las ofertas del CRM y las vacantes traidas del feed de devsChile aparecen en la
 * misma lista porque las dos las puntua la misma regla sobre el mismo perfil. Lo
 * que no se mezcla es la procedencia del texto: una vacante puntuada solo por su
 * titulo lleva su marca, porque un numero calculado sobre el titulo no vale lo
 * mismo que uno calculado sobre el aviso entero.
 */
@Component({
  selector: 'app-scoreboard',
  imports: [DecimalPipe, DatePipe, FormsModule],
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.css'],
})
export class ScoreboardComponent implements OnInit, OnDestroy {
  private readonly jobHunt = inject(JobHuntService);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  scoreboard: Scoreboard | null = null;
  job: RefreshJob | null = null;
  loading = true;
  busy = false;
  error = '';
  notice = '';
  filter = '';
  showRejected = false;

  /** Posicion en el ranking, por `kind:id`. Se arma al cargar, no en cada render. */
  private ranks = new Map<string, number>();

  ngOnInit(): void {
    this.load();
    this.loadJob();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  load(): void {
    this.loading = true;
    this.jobHunt.getScoreboard().subscribe({
      next: (scoreboard) => {
        this.scoreboard = scoreboard;
        // La posicion se calcula sobre la lista completa, no sobre la filtrada: si
        // filtras, "#7" sigue diciendo el lugar real que ocupa en el ranking.
        this.ranks = new Map(
          scoreboard.items.map((item, index) => [this.key(item), index + 1]),
        );
        this.loading = false;
        this.error = '';
      },
      error: () => {
        this.loading = false;
        this.error = 'No se pudo cargar el tablero.';
      },
    });
  }

  private loadJob(): void {
    this.jobHunt.getRefreshJob().subscribe({
      next: (job) => {
        this.job = job;
        if (job.status === 'running') this.startPolling();
      },
      error: () => undefined,
    });
  }

  /** Dispara la ingesta del feed y sigue el progreso hasta que termina. */
  refresh(): void {
    this.busy = true;
    this.notice = '';
    this.jobHunt.startVacancyRefresh({}).subscribe({
      next: (job) => {
        this.job = job;
        this.busy = false;
        this.startPolling();
      },
      error: () => {
        this.busy = false;
        this.error = 'No se pudo arrancar el refresco.';
      },
    });
  }

  /** Recalcula con el perfil actual, sin volver a bajar el feed. */
  rescore(): void {
    this.busy = true;
    this.notice = '';
    this.jobHunt.rescoreVacancies().subscribe({
      next: (result) => {
        this.busy = false;
        this.notice = `Recalculadas ${result.rescored} vacantes, ${result.admitted} pasan la compuerta.`;
        this.load();
      },
      error: () => {
        this.busy = false;
        this.error = 'No se pudo recalcular.';
      },
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollHandle = setInterval(() => {
      this.jobHunt.getRefreshJob().subscribe({
        next: (job) => {
          this.job = job;
          if (job.status !== 'running') {
            this.stopPolling();
            this.load();
          }
        },
        error: () => this.stopPolling(),
      });
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  get items(): ScoreboardItem[] {
    const needle = this.filter.trim().toLowerCase();
    const items = this.scoreboard?.items ?? [];
    if (!needle) return items;
    return items.filter((item) =>
      [item.title, item.company, item.location, item.matchedSkills.join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  /**
   * Cuantas de las que se muestran se puntuaron solo por el titulo.
   *
   * Se muestra a proposito: si la mayoria de la lista se decidio sin leer el
   * aviso, el puntaje es mas debil de lo que parece y hay que decirlo.
   */
  get titleOnlyCount(): number {
    return (this.scoreboard?.items ?? []).filter((item) => item.scoredFrom === 'index').length;
  }

  get running(): boolean {
    return this.job?.status === 'running';
  }

  get progressPercent(): number {
    if (!this.job || this.job.total === 0) return 0;
    return Math.min(100, Math.round((this.job.fetched / this.job.total) * 100));
  }

  get lastScored(): string {
    const scoredAt = this.scoreboard?.meta.scoredAt;
    if (!scoredAt) return '';
    return new Date(scoredAt).toLocaleString();
  }

  /** El color del puntaje, por tramos. Alto es bueno, pero el numero manda. */
  scoreTier(score: number): string {
    if (score >= 20) return 'tier-high';
    if (score >= 12) return 'tier-mid';
    return 'tier-low';
  }

  sourceLabel(item: ScoreboardItem): string {
    if (item.kind === 'offer') return item.status ? `CRM · ${item.status}` : 'CRM';
    return item.scoredFrom === 'index' ? 'Feed · titulo' : 'Feed · aviso';
  }

  private key(item: ScoreboardItem): string {
    return `${item.kind}:${item.id}`;
  }

  /** El lugar en el ranking completo. 0 solo si todavia no cargo. */
  rank(item: ScoreboardItem): number {
    return this.ranks.get(this.key(item)) ?? 0;
  }

  /**
   * El puntaje como numero relativo (0..100) contra el mejor de la lista.
   *
   * El puntaje crudo es una suma sin techo, asi que un 37 no es un 37%: se lee como
   * una nota que no es. El relativo responde la pregunta que importa, que es que tan
   * cerca esta esto de lo mejor que hay en la lista.
   *
   * Ojo: es relativo a la lista, no a una escala fija. Si un refresco trae algo
   * mejor, los relativos de abajo bajan aunque su puntaje crudo no cambie.
   */
  relativeScore(item: ScoreboardItem): number {
    const max = this.scoreboard?.meta.maxScore ?? 0;
    if (max <= 0) return 0;
    return Math.min(100, Math.round((item.score / max) * 100));
  }

  /** Convierte la vacante en postulacion del CRM. Idempotente en el backend. */
  track(item: ScoreboardItem): void {
    this.busy = true;
    this.notice = '';
    this.error = '';
    this.jobHunt.trackVacancy(item.id).subscribe({
      next: (result) => {
        this.busy = false;
        this.notice = result.created
          ? `"${item.title}" entro al pipeline.`
          : `"${item.title}" ya estaba en el pipeline.`;
        item.tracked = true;
      },
      error: () => {
        this.busy = false;
        this.error = 'No se pudo trackear la vacante.';
      },
    });
  }
}
