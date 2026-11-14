import { Component, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { AdminApi } from '../../core/api/admin.api';
import { User } from '../../core/models';
import { NotificationService } from '../../core/notification.service';

/** Botón de renovación rápida (+N meses) de un alumno. */
@Component({
  selector: 'app-renew-button',
  template: `
    <button
      type="button"
      class="btn btn-sm"
      [class.btn-primary]="primary()"
      (click)="renew()"
      [disabled]="busy()"
    >
      {{ busy() ? 'Renovando…' : '+' + months() + (months() === 1 ? ' mes' : ' meses') }}
    </button>
  `,
})
export class RenewButton {
  private readonly api = inject(AdminApi);
  private readonly notify = inject(NotificationService);

  readonly user = input.required<User>();
  readonly months = input(1);
  readonly primary = input(false);
  readonly renewed = output<User>();

  protected readonly busy = signal(false);

  protected async renew(): Promise<void> {
    this.busy.set(true);
    try {
      const u = await firstValueFrom(this.api.renew(this.user().id, this.months()));
      const until = new Date(u.activeUntil!).toLocaleDateString('es-ES');
      this.notify.success(`${u.fullName}: acceso renovado hasta el ${until}`);
      this.renewed.emit(u);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
