import { EnvironmentProviders, Provider } from '@angular/core';

/**
 * Proveedores extra del modo demostración. En el build normal está vacío; el build
 * `demo` lo sustituye por `src/demo/demo-providers.ts` (ver angular.json).
 */
export const DEMO_PROVIDERS: (Provider | EnvironmentProviders)[] = [];
