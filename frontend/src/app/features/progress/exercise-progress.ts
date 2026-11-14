import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { userBase } from '../../core/api/training.api';
import { optionalId } from '../../core/date';
import { ExercisePoint, ProgressSummary } from '../../core/models';
import { Chart, ChartPoint } from '../../shared/chart';
import { shortDate } from '../../shared/format';

type Metric = 'estimated1RmKg' | 'maxWeightKg' | 'volumeKg' | 'totalReps';

/** Evolución sesión a sesión de un ejercicio concreto. */
@Component({
  selector: 'app-exercise-progress',
  imports: [FormsModule, Chart, DatePipe, DecimalPipe],
  template: `
    @if (!embedded()) {
      <div class="page-header">
        <div>
          <h1>Progreso por ejercicio</h1>
          <p class="muted">Compara tu rendimiento a lo largo del tiempo.</p>
        </div>
      </div>
    }

    @if (options().length === 0) {
      <div class="card empty">
        @if (summary.isLoading()) {
          Cargando…
        } @else {
          Registra entrenamientos con peso para ver tu progresión.
        }
      </div>
    } @else {
      <section class="card">
        <div class="row controls">
          <label class="field">
            <span class="small muted">Ejercicio</span>
            <select
              class="input"
              [ngModel]="exerciseId()"
              (ngModelChange)="exerciseId.set(+$event)"
            >
              @for (o of options(); track o.exerciseId) {
                <option [ngValue]="o.exerciseId">{{ o.exerciseName }}</option>
              }
            </select>
          </label>
          <div class="tabs" role="tablist">
            @for (m of metrics; track m.key) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="metric() === m.key"
                (click)="metric.set(m.key)"
              >
                {{ m.label }}
              </button>
            }
          </div>
        </div>

        <app-chart [points]="series()" [unit]="metricInfo().unit" [title]="metricInfo().label" />

        @if (best(); as b) {
          <p class="muted small best">
            Mejor 1RM estimado: <strong>{{ b.estimated1RmKg | number: '1.0-1' }} kg</strong> ({{
              b.weightKg | number: '1.0-1'
            }}
            kg × {{ b.reps }} el {{ b.achievedOn | date: 'd MMM y' }}). Fórmula de Epley: peso × (1
            + reps / 30).
          </p>
        }
      </section>

      <section class="card history">
        <h2>Historial</h2>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th class="num">Peso máx.</th>
                <th class="num">1RM est.</th>
                <th class="num">Reps</th>
                <th class="num">Volumen</th>
              </tr>
            </thead>
            <tbody>
              @for (p of reversed(); track p.date) {
                <tr>
                  <td class="nowrap">{{ p.date | date: 'd MMM y' }}</td>
                  <td class="num">{{ p.maxWeightKg | number: '1.0-1' }} kg</td>
                  <td class="num">{{ p.estimated1RmKg | number: '1.0-1' }} kg</td>
                  <td class="num">{{ p.totalReps }}</td>
                  <td class="num">{{ p.volumeKg | number: '1.0-0' }} kg</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    .controls {
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 1rem;
    }
    .controls .field {
      min-width: 240px;
    }
    .controls .tabs {
      margin: 0;
      border: none;
    }
    .best {
      margin: 0.75rem 0 0;
    }
    .history {
      margin-top: 1rem;
    }
  `,
})
export class ExerciseProgress {
  readonly userId = input(null, { transform: optionalId });
  readonly embedded = input(false);

  protected readonly metrics: { key: Metric; label: string; unit: string }[] = [
    { key: 'estimated1RmKg', label: '1RM estimado', unit: 'kg' },
    { key: 'maxWeightKg', label: 'Peso máximo', unit: 'kg' },
    { key: 'volumeKg', label: 'Volumen', unit: 'kg' },
    { key: 'totalReps', label: 'Repeticiones', unit: 'reps' },
  ];
  protected readonly metric = signal<Metric>('estimated1RmKg');
  protected readonly metricInfo = computed(() =>
    this.metrics.find((m) => m.key === this.metric())!,
  );
  protected readonly exerciseId = signal<number | null>(null);

  protected readonly summary = httpResource<ProgressSummary>(
    () => `${userBase(this.userId())}/progress/summary?weeks=1`,
  );
  protected readonly options = computed(() =>
    [...(this.summary.value()?.personalRecords ?? [])].sort((a, b) =>
      a.exerciseName.localeCompare(b.exerciseName, 'es'),
    ),
  );
  protected readonly best = computed(() =>
    this.options().find((o) => o.exerciseId === this.exerciseId()),
  );

  protected readonly points = httpResource<ExercisePoint[]>(
    () =>
      this.exerciseId()
        ? `${userBase(this.userId())}/progress/exercises/${this.exerciseId()}`
        : undefined,
    { defaultValue: [] },
  );

  protected readonly series = computed<ChartPoint[]>(() =>
    this.points.value().map((p) => ({ label: shortDate(p.date), value: p[this.metric()] })),
  );
  protected readonly reversed = computed(() => [...this.points.value()].reverse());

  constructor() {
    // Selecciona el primer ejercicio disponible.
    effect(() => {
      const first = this.options()[0];
      if (first && this.exerciseId() === null) this.exerciseId.set(first.exerciseId);
    });
  }
}
