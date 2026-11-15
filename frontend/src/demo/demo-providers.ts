import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { HttpBackend } from '@angular/common/http';
import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_MODE, DemoControls } from '../app/core/demo-mode';
import { AuthService } from '../app/core/auth/auth.service';
import { DemoBackend } from './demo-backend';
import { DEMO_PASSWORD } from './demo-data';

/**
 * Proveedores del build `demo` (sustituye a `src/app/demo-providers.ts`):
 * API simulada en el navegador, rutas con # y credenciales de ejemplo en el login.
 */
export const DEMO_PROVIDERS: (Provider | EnvironmentProviders)[] = [
  DemoBackend,
  { provide: HttpBackend, useExisting: DemoBackend },
  { provide: LocationStrategy, useClass: HashLocationStrategy },
  {
    provide: DEMO_MODE,
    useFactory: (): DemoControls => {
      const backend = inject(DemoBackend);
      const auth = inject(AuthService);
      const router = inject(Router);
      return {
        accounts: [
          { label: 'Instructor (admin)', email: 'admin@demo.fitpn', password: DEMO_PASSWORD },
          { label: 'Alumna con historial', email: 'laura@demo.fitpn', password: DEMO_PASSWORD },
          {
            label: 'Alumno a punto de caducar',
            email: 'carlos@demo.fitpn',
            password: DEMO_PASSWORD,
          },
          { label: 'Alumna caducada', email: 'marta@demo.fitpn', password: DEMO_PASSWORD },
        ],
        reset: () => {
          backend.reset();
          auth.expireSession('demo_reset');
          void router.navigate(['/login']);
        },
      };
    },
  },
  // En el visor de la demo los diálogos nativos no se muestran: las confirmaciones se aceptan.
  provideAppInitializer(() => {
    window.confirm = () => true;
  }),
];
