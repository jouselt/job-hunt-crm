import { TestBed } from '@angular/core/testing';
import { KanbanBoardComponent } from './kanban-board.component';
import { JobHuntService } from '../../services/job-hunt.service';
import { Observable, of } from 'rxjs';
import { Application } from '../../models/application.model';

describe('KanbanBoardComponent', () => {
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
      imports: [KanbanBoardComponent],
      providers: [{ provide: JobHuntService, useValue: service }],
    }).compileComponents();
  });

  it('renders exactly 4 columns in forward order', () => {
    const fixture = TestBed.createComponent(KanbanBoardComponent);
    fixture.detectChanges();

    const headers = Array.from(
      fixture.nativeElement.querySelectorAll('.column-header h3') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent as string).trim());

    expect(headers).toEqual(['Applied', 'Screened', 'Interview', 'Offer']);
  });

  it('excludes rejected applications from every column', () => {
    service.applications$ = of([app({ stage: 'rejected', company: 'RejectCo' })]);
    const fixture = TestBed.createComponent(KanbanBoardComponent);
    fixture.detectChanges();

    const allCards = Array.from(
      fixture.nativeElement.querySelectorAll('.card-company') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent as string);
    expect(allCards).not.toContain('RejectCo');
  });

  it('promote() advances forward-only (applied -> screened)', () => {
    const fixture = TestBed.createComponent(KanbanBoardComponent);
    const applied = app({ stage: 'applied' });

    fixture.componentInstance.promote(applied);
    expect(service.promoteStage).toHaveBeenCalledWith('1', 'screened');
  });
});