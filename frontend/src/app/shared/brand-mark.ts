import { Component, input } from '@angular/core';

/**
 * Emblema de la aplicación: escudo genérico con una mancuerna.
 * Diseño propio, deliberadamente distinto de cualquier emblema oficial.
 */
@Component({
  selector: 'app-brand-mark',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M24 3 6 9v13c0 11.5 7.6 19.6 18 23 10.4-3.4 18-11.5 18-23V9L24 3Z"
        fill="var(--navy-700)"
        stroke="var(--gold)"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <rect x="10" y="20" width="4" height="10" rx="1.5" fill="#fff" />
      <rect x="15" y="17.5" width="4" height="15" rx="1.5" fill="#fff" />
      <rect x="19" y="23.5" width="10" height="3" rx="1" fill="var(--gold)" />
      <rect x="29" y="17.5" width="4" height="15" rx="1.5" fill="#fff" />
      <rect x="34" y="20" width="4" height="10" rx="1.5" fill="#fff" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class BrandMark {
  readonly size = input(36);
}
