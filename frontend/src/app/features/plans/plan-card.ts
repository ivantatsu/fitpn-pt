import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Plan, PlanItem } from '../../core/models';

/** Muestra un plan agrupado por día. */
@Component({
  selector: 'app-plan-card',
  imports: [DatePipe],
  template: `
    <section class="card">
      <div class="page-header compact">
        <div>
          <h2>{{ plan().title }}</h2>
          <p class="muted small">Actualizado el {{ plan().updatedAt | date: 'd MMM y' }}</p>
        </div>
        <span class="badge" [class.badge-success]="plan().isActive">{{
          plan().isActive ? 'Activo' : 'Archivado'
        }}</span>
      </div>
      @if (plan().description) {
        <p class="description">{{ plan().description }}</p>
      }
      @for (day of days(); track day.label) {
        <h3 class="day">{{ day.label }}</h3>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th class="num">Series</th>
                <th class="num">Reps</th>
                <th class="num">Descanso</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              @for (it of day.items; track $index) {
                <tr>
                  <td>{{ it.exerciseName }}</td>
                  <td class="num">{{ it.sets }}</td>
                  <td class="num">{{ it.reps }}</td>
                  <td class="num">{{ it.restSeconds ? it.restSeconds + ' s' : '—' }}</td>
                  <td class="muted small">{{ it.notes }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @empty {
        <p class="empty">Este plan no tiene ejercicios.</p>
      }
      <ng-content />
    </section>
  `,
  styles: `
    .compact {
      margin-bottom: 0.5rem;
    }
    .compact p {
      margin: 0;
    }
    .description {
      white-space: pre-line;
    }
    .day {
      margin-top: 1rem;
      color: var(--primary-strong);
    }
  `,
})
export class PlanCard {
  readonly plan = input.required<Plan>();

  protected readonly days = computed(() => {
    const map = new Map<string, PlanItem[]>();
    for (const it of this.plan().items) {
      const key = it.dayLabel || 'Sin día asignado';
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  });
}
