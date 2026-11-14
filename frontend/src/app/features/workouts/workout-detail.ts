import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { TrainingApi, userBase } from '../../core/api/training.api';
import { optionalId } from '../../core/date';
import { Workout } from '../../core/models';
import { NotificationService } from '../../core/notification.service';

@Component({
  selector: 'app-workout-detail',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <a [routerLink]="listLink()" class="back">← Volver a entrenamientos</a>

    @if (workout.error()) {
      <div class="alert alert-error">No se encontró el entrenamiento.</div>
    } @else if (workout.value(); as w) {
      <div class="page-header">
        <div>
          <h1>{{ w.title }}</h1>
          <p class="muted">{{ w.performedOn | date: 'EEEE d MMMM y' }}</p>
        </div>
        <div class="row">
          <a class="btn" [routerLink]="[listLink(), w.id, 'editar']">Editar</a>
          <button type="button" class="btn btn-danger" (click)="remove(w)" [disabled]="deleting()">
            Eliminar
          </button>
        </div>
      </div>

      <div class="grid stats">
        <div class="card stat">
          <div class="stat-label">Volumen total</div>
          <div class="stat-value">{{ w.totalVolumeKg | number: '1.0-0' }} kg</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Series</div>
          <div class="stat-value">{{ w.setCount }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Duración</div>
          <div class="stat-value">{{ w.durationMinutes ? w.durationMinutes + ' min' : '—' }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Esfuerzo percibido</div>
          <div class="stat-value">{{ w.perceivedEffort ? w.perceivedEffort + '/10' : '—' }}</div>
        </div>
      </div>

      <div class="stack exercises">
        @for (ex of w.exercises; track $index) {
          <section class="card">
            <h3>{{ ex.exerciseName }}</h3>
            <table class="table">
              <thead>
                <tr>
                  <th>Serie</th>
                  <th class="num">Reps</th>
                  <th class="num">Peso</th>
                </tr>
              </thead>
              <tbody>
                @for (s of ex.sets; track $index) {
                  <tr>
                    <td>{{ $index + 1 }}</td>
                    <td class="num">{{ s.reps }}</td>
                    <td class="num">{{ s.weightKg | number: '1.0-2' }} kg</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        } @empty {
          <p class="empty card">Esta sesión no tiene ejercicios registrados.</p>
        }
      </div>

      @if (w.notes) {
        <section class="card notes">
          <h3>Notas</h3>
          <p>{{ w.notes }}</p>
        </section>
      }
    } @else {
      <p class="muted">Cargando…</p>
    }
  `,
  styles: `
    .back {
      display: inline-block;
      margin-bottom: 1rem;
    }
    .exercises {
      margin-top: 1rem;
    }
    .notes {
      margin-top: 1rem;
      white-space: pre-line;
    }
  `,
})
export class WorkoutDetail {
  private readonly api = inject(TrainingApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly workoutId = input.required({ transform: optionalId });
  readonly userId = input(null, { transform: optionalId });

  protected readonly deleting = signal(false);
  protected readonly listLink = computed(() =>
    this.userId() ? `/admin/usuarios/${this.userId()}/entrenamientos` : '/entrenamientos',
  );

  protected readonly workout = httpResource<Workout>(() =>
    this.workoutId() ? `${userBase(this.userId())}/workouts/${this.workoutId()}` : undefined,
  );

  protected async remove(w: Workout): Promise<void> {
    if (!confirm(`¿Eliminar el entrenamiento "${w.title}"? Esta acción no se puede deshacer.`))
      return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.deleteWorkout(w.id, this.userId()));
      this.notify.success('Entrenamiento eliminado');
      await this.router.navigateByUrl(this.listLink());
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }
}
