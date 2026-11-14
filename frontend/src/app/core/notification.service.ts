import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

/** Notificaciones efímeras ("toasts") de la aplicación. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text, 6000);
  }

  info(text: string): void {
    this.push('info', text);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], text: string, ttl = 3500): void {
    const id = this.nextId++;
    // Como máximo 3 avisos visibles a la vez.
    this._toasts.update((list) => [...list, { id, kind, text }].slice(-3));
    setTimeout(() => this.dismiss(id), ttl);
  }
}
