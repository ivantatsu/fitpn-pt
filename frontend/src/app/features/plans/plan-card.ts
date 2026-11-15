import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { catchError, firstValueFrom, of } from 'rxjs';
import { userBase } from '../../core/api/training.api';
import { DEMO_MODE } from '../../core/demo-mode';
import { Plan, PlanItem } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { TestResult, summarize } from '../../core/physical-tests';
import { Pictogram } from '../../shared/pictogram';

/** Muestra un plan agrupado por día. */
@Component({
  selector: 'app-plan-card',
  imports: [DatePipe, Pictogram],
  template: `
    <section class="card">
      <div class="page-header compact">
        <div>
          <h2>{{ plan().title }}</h2>
          <p class="muted small">Actualizado el {{ plan().updatedAt | date: 'd MMM y' }}</p>
        </div>
        <div class="row">
          <span class="badge" [class.badge-success]="plan().isActive">{{
            plan().isActive ? 'Activo' : 'Archivado'
          }}</span>
          <button type="button" class="btn btn-sm" (click)="exportPdf()" [disabled]="exporting()">
            {{ exporting() ? 'Generando PDF…' : 'Descargar PDF' }}
          </button>
        </div>
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
                  <td>
                    <span class="ex">
                      <app-pictogram [exercise]="it.exerciseName ?? ''" [size]="44" />
                      {{ it.exerciseName }}
                    </span>
                  </td>
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
      margin-top: 1.25rem;
    }
    .ex {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
    }
  `,
})
export class PlanCard {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly demo = inject(DEMO_MODE);

  readonly plan = input.required<Plan>();
  /** Nombre del alumno que aparece en el PDF. */
  readonly studentName = input('');
  /** Alumno al que pertenece el plan (vista de instructor); vacío = usuario actual. */
  readonly userId = input<number | null>(null);

  protected readonly exporting = signal(false);

  /** Genera el PDF del plan (con las mejores marcas del alumno) y lo descarga. */
  protected async exportPdf(): Promise<void> {
    this.exporting.set(true);
    try {
      const tests = await firstValueFrom(
        this.http
          .get<TestResult[]>(`${userBase(this.userId())}/tests`)
          .pipe(catchError(() => of([] as TestResult[]))),
      );
      const { exportPlanPdf } = await import('../../core/pdf/plan-pdf');
      await exportPlanPdf({
        plan: this.plan(),
        studentName: this.studentName() || 'Alumno',
        marks: summarize(tests),
      });
      if (this.demo) {
        this.notify.info(
          'PDF generado. Si no se descarga, es porque el visor de la demo bloquea las descargas; en la app instalada se descarga directamente.',
        );
      } else {
        this.notify.success('PDF del plan descargado');
      }
    } catch (err) {
      console.error(err);
      this.notify.error('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      this.exporting.set(false);
    }
  }

  protected readonly days = computed(() => {
    const map = new Map<string, PlanItem[]>();
    for (const it of this.plan().items) {
      const key = it.dayLabel || 'Sin día asignado';
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  });
}
