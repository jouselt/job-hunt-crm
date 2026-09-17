import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Application, PipelineStats } from '../models/application.model';

const TOKEN_KEY = 'jobhunt_token';

@Injectable({ providedIn: 'root' })
export class JobHuntService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  // Single source of truth per domain: one subject each, no duplicates.
  private readonly applicationsSubject = new BehaviorSubject<Application[]>([]);
  private readonly pipelineStatsSubject = new BehaviorSubject<PipelineStats | null>(null);

  readonly applications$: Observable<Application[]> =
    this.applicationsSubject.asObservable();
  readonly pipelineStats$: Observable<PipelineStats | null> =
    this.pipelineStatsSubject.asObservable();

  private token(): string {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  }

  private authHeaders(): { Authorization: string } {
    return { Authorization: `Bearer ${this.token()}` };
  }

  /** Persist the JWT issued by the backend (or injected for the demo flow). */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /** Remove the stored JWT (used on logout). */
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  loadApplications(): void {
    this.http
      .get<Application[]>(`${this.baseUrl}/applications`, {
        headers: this.authHeaders(),
      })
      .subscribe({
        next: (apps) => this.applicationsSubject.next(apps),
        error: () => this.applicationsSubject.next([]),
      });
  }

  createApplication(dto: Partial<Application>): Observable<Application> {
    return this.http
      .post<Application>(`${this.baseUrl}/applications`, dto, {
        headers: this.authHeaders(),
      })
      .pipe(tap(() => this.loadApplications()));
  }

  promoteStage(id: string, stage: string): Observable<Application> {
    return this.http
      .patch<Application>(`${this.baseUrl}/applications/${id}/stage`, { stage }, {
        headers: this.authHeaders(),
      })
      .pipe(tap(() => this.loadApplications()));
  }

  getPipelineStats(): void {
    this.http
      .get<PipelineStats>(`${this.baseUrl}/analytics/pipeline`, {
        headers: this.authHeaders(),
      })
      .subscribe({
        next: (stats) => this.pipelineStatsSubject.next(stats),
        error: () => this.pipelineStatsSubject.next(null),
      });
  }

  getDueFollowUps(): Observable<Application[]> {
    return this.http.get<Application[]>(`${this.baseUrl}/follow-ups`, {
      headers: this.authHeaders(),
    });
  }

  // --- Settings: per-user Jev API key ---
  getJevKeyMasked(): Observable<{ configured: boolean; masked: string | null }> {
    return this.http.get<{ configured: boolean; masked: string | null }>(
      `${this.baseUrl}/settings/jev-key`,
      { headers: this.authHeaders() },
    );
  }

  saveJevKey(key: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/settings/jev-key`,
      { key },
      { headers: this.authHeaders() },
    );
  }

  // --- Offer triage review ---
  getReviewOffers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/offers/review`, {
      headers: this.authHeaders(),
    });
  }

  sendOffer(id: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/offers/${id}/send`, {}, {
      headers: this.authHeaders(),
    });
  }

  skipOffer(id: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/offers/${id}/skip`, {}, {
      headers: this.authHeaders(),
    });
  }
}