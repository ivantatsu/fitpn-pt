import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Workout } from '../core/models';

/** Tabla de sesiones de entrenamiento. */
@Component({
  selector: 'app-workout-table',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    @if (workouts().length === 0) {
      <p class="empty">{{ emptyText() }}</p>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Sesión</th>
              <th class="num">Ejercicios</th>
              <th class="num">Series</th>
              <th class="num">Volumen</th>
              <th class="num">RPE</th>
            </tr>
          </thead>
          <tbody>
            @for (w of workouts(); track w.id) {
              <tr>
                <td class="nowrap">{{ w.performedOn | date: 'EEE d MMM y' }}</td>
                <td>
                  <a [routerLink]="[linkBase(), w.id]">{{ w.title }}</a>
                </td>
                <td class="num">{{ w.exerciseCount }}</td>
                <td class="num">{{ w.setCount }}</td>
                <td class="num nowrap">{{ w.totalVolumeKg | number: '1.0-0' }} kg</td>
                <td class="num">{{ w.perceivedEffort ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class WorkoutTable {
  readonly workouts = input.required<Workout[]>();
  /** Ruta base del detalle (p. ej. `/entrenamientos`). */
  readonly linkBase = input('/entrenamientos');
  readonly emptyText = input('Todavía no hay entrenamientos registrados.');
}
