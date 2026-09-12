import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { JobHuntService } from './job-hunt.service';
import { Application } from '../models/application.model';

describe('JobHuntService', () => {
  let service: JobHuntService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        JobHuntService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(JobHuntService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('exposes exactly one applications$ and one pipelineStats$ stream', () => {
    expect(service.applications$).toBeTruthy();
    expect(service.pipelineStats$).toBeTruthy();
  });

  it('loadApplications emits the fetched array onto applications$', () => {
    const apps: Application[] = [
      {
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
      },
    ];

    let emitted: Application[] = [];
    service.applications$.subscribe((a) => (emitted = a));

    service.loadApplications();

    const req = httpMock.expectOne((r) =>
      r.url.endsWith('/applications'),
    );
    expect(req.request.method).toBe('GET');
    req.flush(apps);

    expect(emitted).toEqual(apps);
  });

  it('createApplication refreshes the list after POST', () => {
    const created: Application = {
      id: '2',
      user_id: 'u1',
      company: 'B',
      role: 'Dev',
      source: 'indeed',
      stage: 'applied',
      applied_date: '2026-01-01',
      follow_up_date: null,
      notes: null,
      created_at: 'x',
      updated_at: 'x',
    };

    service.createApplication({ company: 'B', role: 'Dev' }).subscribe();

    const post = httpMock.expectOne((r) =>
      r.url.endsWith('/applications') && r.method === 'POST',
    );
    post.flush(created);

    // createApplication triggers a follow-up GET for the refreshed list.
    const get = httpMock.expectOne((r) =>
      r.url.endsWith('/applications') && r.method === 'GET',
    );
    get.flush([created]);

    expect().nothing();
  });
});