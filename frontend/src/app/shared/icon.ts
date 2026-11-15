import { Component, computed, input } from '@angular/core';

/** Trazos de los iconos (24×24, línea de 2 px). */
const PATHS: Record<string, string> = {
  panel: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  stopwatch: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9 2h6M19 6l1.5-1.5',
  dumbbell: 'M2 12h2M20 12h2M6 7v10M18 7v10M4 9v6M20 9v6M6 12h12',
  plan: 'M8 4h12M8 10h12M8 16h12M3 4h1M3 10h1M3 16h1M8 22h7',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  scale: 'M4 7h16l-2 13H6zM12 7V4M9 12a3 3 0 0 1 6 0',
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  command: 'M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6zM8 12l3 3 5-6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  menu: 'M3 6h18M3 12h18M3 18h12',
};

/** Icono de línea propio (sin dependencias). */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden="true"
    >
      <path [attr.d]="d()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(20);
  protected readonly d = computed(() => PATHS[this.name()] ?? '');
}
