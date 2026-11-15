import { Component, inject } from '@angular/core';
import { NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of notifications.toasts(); track t.id) {
        <div class="toast" [class]="'toast toast-' + t.kind" role="status">
          <span>{{ t.text }}</span>
          <button
            type="button"
            class="close"
            (click)="notifications.dismiss(t.id)"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: min(380px, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--ink);
      color: #fff;
      border-left: 4px solid var(--on-navy-muted);
      box-shadow: 0 8px 24px rgb(13 23 38 / 25%);
      font-weight: 500;
    }
    .toast-success {
      border-left-color: var(--hivis);
    }
    .toast-error {
      border-left-color: var(--danger);
    }
    .close {
      border: none;
      background: none;
      color: var(--on-navy-muted);
      font-size: 1.25rem;
      cursor: pointer;
    }
  `,
})
export class Toasts {
  protected readonly notifications = inject(NotificationService);
}
