import { Component, computed, input } from '@angular/core';
import { MembershipStatus } from '../core/models';

const LABELS: Record<MembershipStatus, [string, string]> = {
  active: ['Activo', 'badge-success'],
  expiring: ['Caduca pronto', 'badge-warning'],
  expired: ['Caducado', 'badge-danger'],
  disabled: ['Deshabilitado', ''],
  unlimited: ['Administrador', 'badge-info'],
};

/** Insignia con el estado de la suscripción de un usuario. */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge ' + info()[1]">{{ info()[0] }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<MembershipStatus>();
  protected readonly info = computed(() => LABELS[this.status()]);
}
