import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, input } from '@angular/core';
import { userBase } from '../core/api/training.api';
import { ProgressSummary } from '../core/models';
import { Chart, ChartPoint } from './chart';
import { shortDate } from './format';

/** Resumen de progreso de un usuario (indicadores, gráficos y récords). */
@Component({
  selector: 'app-progress-overview',
  imports: [Chart, DecimalPipe, DatePipe],
  template: `
    @if (summary.error()) {
      <div class="alert alert-error">No se pudo cargar el progreso.</div>
    } @else if (summary.value(); as s) {
      <div class="grid stats">
        <div class="card stat">
          <div class="stat-label">Sesiones (30 días)</div>
          <div class="stat-value">{{ s.workoutsLast30Days }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Volumen (30 días)</div>
          <div class="stat-value">
            {{ s.volumeLast30DaysKg | number: '1.0-0' }} <small>kg</small>
          </div>
        </div>
        <div class="card stat">
          <div class="stat-label">Racha actual</div>
          <div class="stat-value">{{ s.currentStreakWeeks }} <small>sem.</small></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Última sesión</div>
          <div class="stat-value small-value">
            {{ s.lastWorkoutOn ? (s.lastWorkoutOn | date: 'd MMM y') : '—' }}
          </div>
        </div>
      </div>

      <div class="grid charts">
        <section class="card">
          <h2>Volumen semanal</h2>
          <app-chart kind="bar" [points]="weeklyVolume()" unit="kg" title="Volumen semanal (kg)" />
        </section>
        <section class="card">
          <h2>Peso corporal</h2>
          <app-chart
            [points]="bodyWeight()"
            unit="kg"
            title="Evolución del peso corporal"
            emptyText="Registra tus medidas para ver la evolución"
          />
        </section>
      </div>

      <section class="card">
        <h2>Récords personales</h2>
        @if (s.personalRecords.length === 0) {
          <p class="empty">Registra entrenamientos con peso para ver tus mejores marcas.</p>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th class="num">Mejor serie</th>
                  <th class="num">1RM estimado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                @for (pr of s.personalRecords; track pr.exerciseId) {
                  <tr>
                    <td>{{ pr.exerciseName }}</td>
                    <td class="num">{{ pr.weightKg | number: '1.0-1' }} kg × {{ pr.reps }}</td>
                    <td class="num">
                      <strong>{{ pr.estimated1RmKg | number: '1.0-1' }} kg</strong>
                    </td>
                    <td class="nowrap">{{ pr.achievedOn | date: 'd MMM y' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    } @else {
      <p class="muted">Cargando progreso…</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .charts {
      --min: 340px;
    }
    .small-value {
      font-size: 1.2rem;
      padding-top: 0.35rem;
    }
    small {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-muted);
    }
  `,
})
export class ProgressOverview {
  /** Si se indica, se muestra el progreso de ese alumno (vista de administrador). */
  readonly userId = input<number | null>(null);
  readonly weeks = input(12);

  protected readonly summary = httpResource<ProgressSummary>(
    () => `${userBase(this.userId())}/progress/summary?weeks=${this.weeks()}`,
  );

  protected readonly weeklyVolume = computed<ChartPoint[]>(() =>
    (this.summary.value()?.weekly ?? []).map((w) => ({
      label: shortDate(w.weekStart),
      value: Math.round(w.volumeKg),
    })),
  );

  protected readonly bodyWeight = computed<ChartPoint[]>(() =>
    (this.summary.value()?.bodyWeight ?? []).map((p) => ({
      label: shortDate(p.date),
      value: p.weightKg,
    })),
  );
}
