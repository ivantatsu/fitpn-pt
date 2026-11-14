import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { adminGuard, authGuard } from './guards';

describe('guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  const run = (guard: typeof authGuard, path = 'panel') =>
    TestBed.runInInjectionContext(() =>
      guard({} as Route, [new UrlSegment(path, {})], {} as never),
    );

  it('authGuard redirige al login conservando la ruta', () => {
    const result = run(authGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Fpanel');
  });

  it('adminGuard bloquea a los socios', () => {
    TestBed.inject(AuthService).setSession({
      accessToken: 't',
      expiresAt: '',
      user: { role: 'member' } as never,
    });
    expect(run(adminGuard)).toBeInstanceOf(UrlTree);
  });

  it('adminGuard permite a los administradores', () => {
    TestBed.inject(AuthService).setSession({
      accessToken: 't',
      expiresAt: '',
      user: { role: 'admin' } as never,
    });
    expect(run(adminGuard)).toBe(true);
  });
});
