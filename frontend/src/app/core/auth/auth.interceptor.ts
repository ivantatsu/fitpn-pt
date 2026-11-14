import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { errorCode } from '../api-error';
import { AUTH_API, AuthService } from './auth.service';

const ACCESS_DENIED_CODES = new Set(['membership_expired', 'account_disabled']);

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Añade el access token a las peticiones de la API y, si caduca (401),
 * lo renueva de forma transparente y reintenta la petición una vez.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.url.startsWith(AUTH_API)) {
    return next(req);
  }
  const auth = inject(AuthService);

  return next(withToken(req, auth.token)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      if (err.status === 403 && ACCESS_DENIED_CODES.has(errorCode(err) ?? '')) {
        auth.expireSession(errorCode(err)!);
        return throwError(() => err);
      }
      if (err.status !== 401) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap((session) => {
          if (!session) {
            auth.expireSession('session_expired');
            return throwError(() => err);
          }
          return next(withToken(req, session.accessToken));
        }),
      );
    }),
  );
};
