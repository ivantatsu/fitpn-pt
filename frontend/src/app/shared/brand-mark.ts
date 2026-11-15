import { Component, input } from '@angular/core';

/**
 * Emblema de FitPN: escudo genérico con una mancuerna, de diseño propio
 * (deliberadamente distinto de cualquier emblema oficial).
 */
@Component({
  selector: 'app-brand-mark',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 6 9v13c0 11.5 7.6 19.6 18 23 10.4-3.4 18-11.5 18-23V9L24 3Z" fill="#fff" />
      <path
        d="M24 7.5 10 12.2v9.9c0 9.1 5.9 15.6 14 18.6 8.1-3 14-9.5 14-18.6v-9.9L24 7.5Z"
        fill="var(--navy)"
      />
      <rect x="11" y="20.5" width="3.5" height="9" fill="#fff" />
      <rect x="15.5" y="18" width="3.5" height="14" fill="#fff" />
      <rect x="19" y="23.5" width="10" height="3" fill="var(--flag-yellow)" />
      <rect x="29" y="18" width="3.5" height="14" fill="#fff" />
      <rect x="33.5" y="20.5" width="3.5" height="9" fill="#fff" />
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
