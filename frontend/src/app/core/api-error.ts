import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody } from './models';

/** Extrae un mensaje legible de un error de la API. */
export function errorMessage(err: unknown, fallback = 'Ha ocurrido un error inesperado'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se puede conectar con el servidor';
    const body = err.error as Partial<ApiErrorBody> | null;
    return body?.error?.message ?? fallback;
  }
  return fallback;
}

/** Devuelve el código de error de la API (p. ej. `membership_expired`). */
export function errorCode(err: unknown): string | undefined {
  if (err instanceof HttpErrorResponse) {
    return (err.error as Partial<ApiErrorBody> | null)?.error?.code;
  }
  return undefined;
}

/** Errores de validación por campo devueltos con 422. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof HttpErrorResponse && err.status === 422) {
    return (err.error as ApiErrorBody).error.fields ?? {};
  }
  return {};
}
