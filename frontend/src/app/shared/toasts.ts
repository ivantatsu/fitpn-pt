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
      border-radius: var(--radius-sm);
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--info);
      box-shadow: 0 6px 20px rgb(0 0 0 / 15%);
    }
    .toast-success {
      border-left-color: var(--primary);
    }
    .toast-error {
      border-left-color: var(--danger);
    }
    .close {
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 1.25rem;
      cursor: pointer;
    }
  `,
})
export class Toasts {
  protected readonly notifications = inject(NotificationService);
}
