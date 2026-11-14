import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { userBase } from '../../core/api/training.api';
import { AuthService } from '../../core/auth/auth.service';
import { Page, Plan, Workout } from '../../core/models';
import { ProgressOverview } from '../../shared/progress-overview';
import { StatusBadge } from '../../shared/status-badge';
import { WorkoutTable } from '../../shared/workout-table';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, ProgressOverview, StatusBadge, WorkoutTable],
  template: `
    <div class="page-header">
      <div>
        <h1>Hola, {{ firstName() }} 👋</h1>
        <p class="muted">Este es el resumen de tu progreso.</p>
      </div>
      <a class="btn btn-primary" routerLink="/entrenamientos/nuevo">+ Registrar entrenamiento</a>
    </div>

    <div class="stack">
      <div class="grid top">
        <section class="card">
          <h2>Mi suscripción</h2>
          @if (auth.user(); as u) {
            <div class="row">
              <app-status-badge [status]="u.status" />
              @if (u.activeUntil) {
                <span
                  >Activa hasta el <strong>{{ u.activeUntil | date: 'd MMMM y' }}</strong></span
                >
              } @else {
                <span>Sin fecha de caducidad</span>
              }
            </div>
            @if (u.daysRemaining !== null) {
              <p class="muted small days">Te quedan {{ u.daysRemaining }} día(s) de acceso.</p>
            }
          }
        </section>

        <section class="card">
          <h2>Plan actual</h2>
          @if (activePlan(); as p) {
            <p>
              <strong>{{ p.title }}</strong>
            </p>
            <p class="muted small">{{ p.items.length }} ejercicios prescritos</p>
            <a routerLink="/planes">Ver plan completo →</a>
          } @else {
            <p class="muted">Tu entrenador aún no te ha asignado un plan.</p>
          }
        </section>
      </div>

      <app-progress-overview />

      <section class="card">
        <div class="page-header compact">
          <h2>Últimos entrenamientos</h2>
          <a routerLink="/entrenamientos">Ver todos →</a>
        </div>
        <app-workout-table [workouts]="recent.value()?.items ?? []" />
      </section>
    </div>
  `,
  styles: `
    .top {
      --min: 300px;
    }
    .days {
      margin: 0.75rem 0 0;
    }
    .compact {
      margin-bottom: 0.5rem;
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  protected readonly recent = httpResource<Page<Workout>>(() => `${userBase()}/workouts?limit=5`);
  private readonly plans = httpResource<Plan[]>(() => `${userBase()}/plans`);
  protected readonly activePlan = computed(() => this.plans.value()?.find((p) => p.isActive));
}
