import { TestBed } from '@angular/core/testing';
import { AppliedListComponent } from './applied-list.component';
import { JobHuntService } from '../../services/job-hunt.service';
import { Observable, of } from 'rxjs';
import { Application } from '../../models/application.model';

describe('AppliedListComponent', () => {
  const service: {
    applications$: Observable<Application[]>;
    pipelineStats$: Observable<unknown>;
    loadApplications: jasmine.Spy;
    promoteStage: jasmine.Spy;
  } = {
    applications$: of([]),
    pipelineStats$: of(null),
    loadApplications: jasmine.createSpy(),
    promoteStage: jasmine.createSpy().and.returnValue(of({})),
  };

  const app = (overrides: Partial<Application> = {}): Application =>
    ({
      id: '1',
      user_id: 'u1',
      company: 'Acme',
      role: 'Dev',
      source: 'linkedin',
      stage: 'applied',
      applied_date: '2026-01-01',
      follow_up_date: null,
      notes: null,
      created_at: 'x',
      updated_at: 'x',
      ...overrides,
    }) as Application;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppliedListComponent],
      providers: [{ provide: JobHuntService, useValue: service }],
    }).compileComponents();
  });

  it('renders a row per application from the stream', () => {
    service.applications$ = of([
      app({ company: 'Acme' }),
      app({ id: '2', company: 'Globex' }),
    ]);
    const fixture = TestBed.createComponent(AppliedListComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Acme');
    expect(text).toContain('Globex');
  });

  it('calls promoteStage with the next forward stage', () => {
    service.applications$ = of([]);
    const fixture = TestBed.createComponent(AppliedListComponent);
    fixture.detectChanges();

    const due = app({ follow_up_date: '2026-01-01' });
    fixture.componentInstance.promote(due);
    expect(service.promoteStage).toHaveBeenCalledWith('1', 'screened');
  });

  it('does not offer promote for rejected applications', () => {
    service.applications$ = of([app({ stage: 'rejected' })]);
    const fixture = TestBed.createComponent(AppliedListComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Promote');
  });
});