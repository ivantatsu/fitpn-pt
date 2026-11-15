import { InjectionToken } from '@angular/core';

/** Controles del modo demostración (solo existe en el build `demo`). */
export interface DemoControls {
  /** Credenciales de ejemplo que se muestran en el login. */
  accounts: { label: string; email: string; password: string }[];
  /** Restaura los datos de ejemplo. */
  reset(): void;
}

/** `null` en la aplicación real; con valor en el build de demostración. */
export const DEMO_MODE = new InjectionToken<DemoControls | null>('DEMO_MODE', {
  factory: () => null,
});
