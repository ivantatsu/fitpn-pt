import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { userBase } from '../../core/api/training.api';
import { Plan } from '../../core/models';
import { PlanCard } from './plan-card';

/** Planes de entrenamiento asignados al socio. */
@Component({
  selector: 'app-plan-list',
  imports: [PlanCard, RouterLink],
  template: `
    <div class="page-header">
      <h1>Mis planes</h1>
      <a class="btn btn-primary" routerLink="/entrenamientos/nuevo">+ Registrar sesión</a>
    </div>
    <div class="stack">
      @for (p of plans.value(); track p.id) {
        <app-plan-card [plan]="p" />
      } @empty {
        <div class="card empty">
          @if (plans.isLoading()) {
            Cargando…
          } @else {
            Tu entrenador todavía no te ha asignado ningún plan.
          }
        </div>
      }
    </div>
  `,
})
export class PlanList {
  protected readonly plans = httpResource<Plan[]>(() => `${userBase()}/plans`, {
    defaultValue: [],
  });
}
