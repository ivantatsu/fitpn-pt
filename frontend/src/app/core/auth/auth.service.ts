import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { Session, User } from '../models';

export const AUTH_API = '/api/v1/auth';

/**
 * Gestiona la sesión del usuario.
 *
 * - El access token (JWT de corta duración) se guarda solo en memoria: nunca en
 *   localStorage, para reducir el impacto de un posible XSS.
 * - El refresh token viaja en una cookie httpOnly + SameSite=Strict que el
 *   navegador envía automáticamente a `/api/v1/auth/*`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  private accessToken: string | null = null;
  private refreshInFlight$: Observable<Session | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  get token(): string | null {
    return this.accessToken;
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<Session>(`${AUTH_API}/login`, { email, password }).pipe(
      tap((s) => this.setSession(s)),
      map((s) => s.user),
    );
  }

  /**
   * Obtiene un nuevo access token usando la cookie de refresco.
   * Las llamadas concurrentes comparten una única petición.
   */
  refresh(): Observable<Session | null> {
    this.refreshInFlight$ ??= this.http.post<Session>(`${AUTH_API}/refresh`, null).pipe(
      tap((s) => this.setSession(s)),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
      finalize(() => (this.refreshInFlight$ = null)),
      shareReplay(1),
    );
    return this.refreshInFlight$;
  }

  /** Intenta recuperar la sesión al arrancar la aplicación. */
  async restoreSession(): Promise<void> {
    await firstValueFrom(this.refresh());
  }

  logout(): void {
    this.http.post(`${AUTH_API}/logout`, null).subscribe({ error: () => undefined });
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /** Cierra la sesión local y redirige al login indicando el motivo. */
  expireSession(reason: string): void {
    this.clearSession();
    void this.router.navigate(['/login'], { queryParams: { motivo: reason } });
  }

  setSession(session: Session): void {
    this.accessToken = session.accessToken;
    this._user.set(session.user);
  }

  updateUser(user: User): void {
    this._user.set(user);
  }

  private clearSession(): void {
    this.accessToken = null;
    this._user.set(null);
  }
}
