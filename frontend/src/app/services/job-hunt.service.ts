import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Application, PipelineStats } from '../models/application.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class JobHuntService {
  private readonly baseUrl = environment.apiUrl || 'http://localhost:3000/api';

  private applicationsSubject = new BehaviorSubject<Application[]>([]);
  private pipelineStatsSubject = new BehaviorSubject<PipelineStats | null>(null);

  applications$: Observable<Application[]> = this.applicationsSubject.asObservable();
  pipelineStats$: Observable<PipelineStats | null> = this.pipelineStatsSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadApplications(token: string): void {
    this.http.get<Application[]>(`${this.baseUrl}/applications`, {
      headers: { Authorization: `Bearer ${token}` },
    }).subscribe({
      next: (apps) => this.applicationsSubject.next(apps),
      error: () => this.applicationsSubject.next([]),
    });
  }

  createApplication(dto: Partial<Application>, token: string): Observable<Application> {
    return this.http.post<Application>(`${this.baseUrl}/applications`, dto, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  promoteStage(id: string, stage: string, token: string): Observable<Application> {
    return this.http.patch<Application>(`${this.baseUrl}/applications/${id}/stage`, { stage }, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  getPipelineStats(token: string): void {
    this.http.get<PipelineStats>(`${this.baseUrl}/analytics/pipeline`, {
      headers: { Authorization: `Bearer ${token}` },
    }).subscribe({
      next: (stats) => this.pipelineStatsSubject.next(stats),
      error: () => this.pipelineStatsSubject.next(null),
    });
  }

  getDueFollowUps(token: string): Observable<Application[]> {
    return this.http.get<Application[]>(`${this.baseUrl}/follow-ups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
