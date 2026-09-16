import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { JobHuntService } from './job-hunt.service';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly jobHunt = inject(JobHuntService);
  private readonly baseUrl = environment.apiUrl;

  readonly user = signal<AuthUser | null>(null);

  constructor() {
    this.hydrate();
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/register`, { email, password })
      .pipe(tap((res) => this.apply(res)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.apply(res)));
  }

  logout(): void {
    this.jobHunt.clearToken();
    this.user.set(null);
  }

  get isAuthenticated(): boolean {
    return !!localStorage.getItem('jobhunt_token');
  }

  private apply(res: AuthResponse): void {
    this.jobHunt.setToken(res.access_token);
    this.user.set(res.user);
  }

  /** Recover the session from a stored JWT after a page refresh. */
  private hydrate(): void {
    const token = localStorage.getItem('jobhunt_token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.user.set({ id: payload.sub, email: payload.email });
    } catch {
      /* corrupt token — ignore, guard will redirect to login */
    }
  }
}
