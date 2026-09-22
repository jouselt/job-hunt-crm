import { TestBed } from '@angular/core/testing';
import { PipelineOverviewComponent } from './pipeline-overview.component';
import { JobHuntService } from '../../services/job-hunt.service';
import { Observable, of } from 'rxjs';
import { PipelineStats } from '../../models/application.model';

describe('PipelineOverviewComponent', () => {
  const stats: PipelineStats = {
    // Guardar un aviso es una etapa del pipeline, no un cajon aparte: tiene su
    // columna y entra en el total activo.
    saved: { count: 2, pct: 16.7 },
    applied: { count: 4, pct: 33.3 },
    screened: { count: 3, pct: 25 },
    interview: { count: 2, pct: 16.7 },
    offer: { count: 1, pct: 8.3 },
    rejected: { count: 2 },
    avgDaysInStage: 7.4,
  };

  const service: {
    applications$: Observable<unknown>;
    pipelineStats$: Observable<PipelineStats | null>;
    getPipelineStats: jasmine.Spy;
    loadApplications: jasmine.Spy;
  } = {
    applications$: of([]),
    pipelineStats$: of(stats),
    getPipelineStats: jasmine.createSpy(),
    loadApplications: jasmine.createSpy(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineOverviewComponent],
      providers: [{ provide: JobHuntService, useValue: service }],
    }).compileComponents();
  });

  it('renders canonical keys only (no interviewing/offers)', () => {
    const fixture = TestBed.createComponent(PipelineOverviewComponent);
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.stat-label') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent as string).trim());

    expect(labels).toContain('Applied');
    expect(labels).toContain('Screened');
    expect(labels).toContain('Interview');
    expect(labels).toContain('Offer');
    expect(labels).toContain('Rejected');
    // Saved es la entrada del pipeline, y va primero: es lo que todavia no postulaste.
    expect(labels[0]).toBe('Saved');
    expect(labels.join(' ')).not.toMatch(/interviewing|offers/i);
  });

  it('shows rejected separately and avg days in stage', () => {
    const fixture = TestBed.createComponent(PipelineOverviewComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Avg days in stage:');
    expect(text).toContain('7.4');
  });
});