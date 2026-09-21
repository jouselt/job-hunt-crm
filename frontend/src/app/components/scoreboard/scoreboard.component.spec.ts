import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { JobHuntService } from '../../services/job-hunt.service';
import { RefreshJob, Scoreboard } from '../../models/scoreboard.model';
import { ScoreboardComponent } from './scoreboard.component';

const VACANCY = {
  kind: 'vacancy' as const,
  id: 'v1',
  title: 'Senior Angular Developer',
  company: 'Acme',
  location: 'Remoto',
  url: 'https://example.test/v1',
  salary: 'USD 2000-2800',
  category: 'Full Stack',
  postedAt: '2026-09-20',
  score: 25,
  matchedSkills: ['Angular', 'TypeScript'],
  titleSkills: ['Angular'],
  primaryMatches: 2,
  signals: ['remote'],
  // Puntuada solo por el titulo: la vista tiene que decirlo.
  scoredFrom: 'index' as const,
  tracked: false,
};

const OFFER = {
  kind: 'offer' as const,
  id: 'o1',
  title: 'Fullstack Developer',
  company: 'Globex',
  location: 'Santiago, Chile',
  url: null,
  salary: null,
  category: null,
  postedAt: null,
  status: 'REVIEW',
  jevFitScore: 2.5,
  jevDecision: 'SEND',
  score: 14,
  matchedSkills: ['NestJS'],
  titleSkills: [],
  primaryMatches: 1,
  signals: [],
  scoredFrom: 'offer' as const,
};

const SCOREBOARD: Scoreboard = {
  items: [VACANCY, OFFER],
  rejected: [
    {
      kind: 'vacancy',
      id: 'v9',
      title: 'Senior Java Developer',
      company: 'Globex',
      url: null,
      reason: 'stack outside the profile with no TS/JS: java',
    },
  ],
  totals: { offers: 1, vacancies: 1, admitted: 2, rejected: 1 },
  meta: {
    profileSkills: 33,
    weights: { Angular: 5 },
    scoredAt: '2026-09-21T13:00:00.000Z',
    // El mejor de la lista: la vacante. Su relativo tiene que dar 100.
    maxScore: 25,
  },
};

const IDLE_JOB: RefreshJob = {
  status: 'idle',
  pages: 0,
  fetched: 0,
  upserted: 0,
  admitted: 0,
  total: 0,
  message: 'Nunca se refresco',
};

function build(overrides: Partial<Record<keyof JobHuntService, unknown>> = {}) {
  const service = {
    getScoreboard: () => of(SCOREBOARD),
    getRefreshJob: () => of(IDLE_JOB),
    startVacancyRefresh: () => of(IDLE_JOB),
    rescoreVacancies: () => of({ rescored: 2, admitted: 1 }),
    trackVacancy: () => of({ created: true, applicationId: 'app-1' }),
    ...overrides,
  };
  TestBed.configureTestingModule({
    imports: [ScoreboardComponent],
    providers: [{ provide: JobHuntService, useValue: service }],
  });
  const fixture: ComponentFixture<ScoreboardComponent> = TestBed.createComponent(
    ScoreboardComponent,
  );
  fixture.detectChanges();
  return fixture;
}

describe('ScoreboardComponent', () => {
  it('renders every scored item with its score and source', () => {
    const fixture = build();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Senior Angular Developer');
    expect(text).toContain('Fullstack Developer');
    expect(text).toContain('25');
    expect(text).toContain('14');
    // Las dos fuentes se distinguen: una oferta del CRM no se lee igual que una
    // vacante del feed puntuada solo por su titulo.
    expect(text).toContain('CRM · REVIEW');
    expect(text).toContain('Feed · titulo');
  });

  it('says how many items were scored from the title alone', () => {
    // El feed no publica la descripcion del aviso, asi que un puntaje sobre el
    // titulo es evidencia mas debil y la vista lo advierte en vez de taparlo.
    const fixture = build();
    const caveat = fixture.nativeElement.querySelector('.caveat') as HTMLElement;

    expect(caveat).toBeTruthy();
    expect(caveat.textContent).toContain('1 of 2');
    expect(fixture.componentInstance.titleOnlyCount).toBe(1);
  });

  it('filters by title, company or skill', () => {
    const fixture = build();

    fixture.componentInstance.filter = 'angular';
    fixture.detectChanges();
    expect(fixture.componentInstance.items.length).toBe(1);
    expect(fixture.componentInstance.items[0].id).toBe('v1');

    fixture.componentInstance.filter = 'globex';
    fixture.detectChanges();
    expect(fixture.componentInstance.items.length).toBe(1);
    expect(fixture.componentInstance.items[0].id).toBe('o1');

    fixture.componentInstance.filter = '  ';
    fixture.detectChanges();
    expect(fixture.componentInstance.items.length).toBe(2);
  });

  it('renders the Jev score and verdict next to the local one', () => {
    const fixture = build();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Jev 2.50');
    expect(text).toContain('SEND');
  });

  it('shows the score relative to the best in the list, not as a bare number', () => {
    // El puntaje crudo es una suma sin techo, asi que un 37 no es un 37%: se lee
    // como una nota que no es. El relativo responde la pregunta que importa.
    const fixture = build();
    const text = fixture.nativeElement.textContent as string;

    expect(fixture.componentInstance.relativeScore(VACANCY)).toBe(100);
    expect(fixture.componentInstance.relativeScore(OFFER)).toBe(56);
    expect(text).toContain('100');
    // El crudo sigue a la vista: es el valor que produce el ranker Python.
    expect(text).toMatch(/25\s*pts/);
  });

  it('numbers the rows so the ranking survives a filter', () => {
    const fixture = build();

    expect(fixture.componentInstance.rank(VACANCY)).toBe(1);
    expect(fixture.componentInstance.rank(OFFER)).toBe(2);
    expect(fixture.nativeElement.textContent as string).toContain('#1');
  });

  it('turns a vacancy into an application from the row', async () => {
    const calls: string[] = [];
    const fixture = build({
      trackVacancy: (id: string) => {
        calls.push(id);
        return of({ created: true, applicationId: 'app-1' });
      },
    });

    const button = fixture.nativeElement.querySelector(
      '.row-actions button',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain('Track');

    button.click();
    fixture.changeDetectorRef.detectChanges();
    await fixture.whenStable();

    expect(calls).toEqual(['v1']);
    expect(fixture.componentInstance.scoreboard?.items[0].tracked).toBe(true);
    expect(fixture.componentInstance.notice).toContain('entro al pipeline');

    const after = fixture.nativeElement.querySelector(
      '.row-actions button',
    ) as HTMLButtonElement;
    expect(after.textContent).toContain('Tracked');
    expect(after.disabled).toBe(true);
  });

  it('renders Open as a plain link that navigates in place', () => {
    // Sin target=_blank a proposito: Arc en iOS abre las pestañas nuevas como
    // tarjetas, y si la tarjeta no aparece donde estas mirando el tap parece no
    // hacer nada. Navegar en la misma pestaña no se puede bloquear ni esconder, y
    // el href queda para quien quiera abrirlo en otra pestaña con long-press.
    const fixture = build();
    const link = fixture.nativeElement.querySelector('a.btn-link') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://example.test/v1');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('does not offer Track on a CRM offer, which is already in the pipeline', () => {
    const fixture = build();
    const rows = fixture.nativeElement.querySelectorAll('.row');

    expect((rows[0] as HTMLElement).querySelector('button')).toBeTruthy();
    expect((rows[1] as HTMLElement).querySelector('button')).toBeFalsy();
  });

  it('keeps the filtered-out list behind a toggle, with the reason', async () => {
    const fixture = build();

    expect(fixture.nativeElement.querySelector('.rejected')).toBeFalsy();

    fixture.componentInstance.showRejected = true;
    // Esta app es zoneless (zone.js no esta en el proyecto), asi que mutar una
    // propiedad y llamar a detectChanges() NO refresca la vista: el spec pasa por
    // verde mintiendo si solo se lee el getter de la instancia. Hay que forzar el
    // chequeo del componente y esperar a que el scheduler se estabilice.
    fixture.changeDetectorRef.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rejected = fixture.nativeElement.querySelector('.rejected') as HTMLElement;
    expect(rejected).toBeTruthy();
    // Un rechazo sin motivo es un rechazo que nadie puede auditar.
    expect(rejected.textContent).toContain('stack outside the profile with no TS/JS: java');
  });

  it('reports a load failure instead of rendering an empty board', () => {
    const fixture = build({
      getScoreboard: () => throwError(() => new Error('boom')),
    });

    expect(fixture.componentInstance.error).toContain('No se pudo cargar');
    expect(fixture.componentInstance.scoreboard).toBeNull();
  });

  it('shows the feed progress while a refresh runs', () => {
    const fixture = build({
      getRefreshJob: () =>
        of({
          ...IDLE_JOB,
          status: 'running' as const,
          fetched: 500,
          total: 1615,
          pages: 11,
          message: '500 de 1615',
        }),
    });

    expect(fixture.componentInstance.running).toBe(true);
    expect(fixture.componentInstance.progressPercent).toBe(31);
    expect((fixture.nativeElement.textContent as string)).toContain('500 / 1615');
  });

  it('tiers the score and labels the source', () => {
    const component = build().componentInstance;

    expect(component.scoreTier(25)).toBe('tier-high');
    expect(component.scoreTier(14)).toBe('tier-mid');
    expect(component.scoreTier(3)).toBe('tier-low');

    expect(component.sourceLabel(VACANCY)).toBe('Feed · titulo');
    expect(component.sourceLabel(OFFER)).toBe('CRM · REVIEW');
  });
});
