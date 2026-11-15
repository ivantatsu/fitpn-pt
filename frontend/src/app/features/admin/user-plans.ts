import { httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { AdminApi } from '../../core/api/admin.api';
import { userBase } from '../../core/api/training.api';
import { Plan } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { PlanCard } from '../plans/plan-card';
import { PlanEditor } from './plan-editor';

/** Gestión de los planes asignados a un alumno. */
@Component({
  selector: 'app-user-plans',
  imports: [PlanCard, PlanEditor],
  template: `
    @if (editing(); as e) {
      <app-plan-editor
        [userId]="userId()"
        [plan]="e === 'new' ? null : e"
        (saved)="onSaved()"
        (cancelled)="editing.set(null)"
      />
    } @else {
      <div class="row end">
        <button type="button" class="btn btn-primary btn-sm" (click)="editing.set('new')">
          + Nuevo plan
        </button>
      </div>
      <div class="stack">
        @for (p of plans.value(); track p.id) {
          <app-plan-card [plan]="p" [studentName]="studentName()" [userId]="userId()">
            <div class="row end actions">
              <button type="button" class="btn btn-sm" (click)="editing.set(p)">Editar</button>
              <button type="button" class="btn btn-danger btn-sm" (click)="remove(p)">
                Eliminar
              </button>
            </div>
          </app-plan-card>
        } @empty {
          <p class="card empty">Este alumno no tiene planes asignados.</p>
        }
      </div>
    }
  `,
  styles: `
    .end {
      justify-content: flex-end;
    }
    .row.end:first-child {
      margin-bottom: 0.75rem;
    }
    .actions {
      margin-top: 1rem;
    }
  `,
})
export class UserPlans {
  private readonly api = inject(AdminApi);
  private readonly notify = inject(NotificationService);

  readonly userId = input.required<number>();
  readonly studentName = input('');
  protected readonly editing = signal<Plan | 'new' | null>(null);
  protected readonly plans = httpResource<Plan[]>(() => `${userBase(this.userId())}/plans`, {
    defaultValue: [],
  });

  protected onSaved(): void {
    this.editing.set(null);
    this.plans.reload();
  }

  protected async remove(p: Plan): Promise<void> {
    if (!confirm(`¿Eliminar el plan "${p.title}"?`)) return;
    try {
      await firstValueFrom(this.api.deletePlan(this.userId(), p.id));
      this.notify.success('Plan eliminado');
      this.plans.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }
}
