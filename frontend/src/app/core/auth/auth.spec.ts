import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Session, User } from '../models';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const user: User = {
  id: 1,
  email: 'socio@fitpn.test',
  fullName: 'Socio Uno',
  role: 'member',
  activeUntil: '2030-01-01T00:00:00Z',
  disabled: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  status: 'active',
  hasAccess: true,
  daysRemaining: 30,
};

const session = (token: string): Session => ({ accessToken: token, expiresAt: '', user });

describe('AuthService + authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  it('guarda la sesión al hacer login', () => {
    auth.login('socio@fitpn.test', 'secret-123').subscribe();
    backend.expectOne('/api/v1/auth/login').flush(session('token-1'));

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
    expect(auth.token).toBe('token-1');
  });

  it('añade el token Bearer a las peticiones de la API', () => {
    auth.setSession(session('token-1'));
    http.get('/api/v1/me').subscribe();
    const req = backend.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush(user);
  });

  it('renueva el token ante un 401 y reintenta la petición', () => {
    auth.setSession(session('expired'));
    let result: unknown;
    http.get('/api/v1/me').subscribe((r) => (result = r));

    backend.expectOne('/api/v1/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh').flush(session('fresh'));
    const retry = backend.expectOne('/api/v1/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush(user);

    expect(result).toEqual(user);
  });

  it('comparte una única petición de refresh entre llamadas concurrentes', () => {
    auth.refresh().subscribe();
    auth.refresh().subscribe();
    backend.expectOne('/api/v1/auth/refresh').flush(session('fresh'));
    expect(auth.token).toBe('fresh');
  });

  it('cierra la sesión y redirige si la suscripción ha caducado', () => {
    auth.setSession(session('token-1'));
    http.get('/api/v1/me/workouts').subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/me/workouts')
      .flush(
        { error: { code: 'membership_expired', message: 'caducada' } },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { motivo: 'membership_expired' },
    });
  });
});
