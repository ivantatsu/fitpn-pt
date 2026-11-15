import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { userBase } from '../../core/api/training.api';
import { AuthService } from '../../core/auth/auth.service';
import { Page, Plan, Workout } from '../../core/models';
import { summarize, TestResult } from '../../core/physical-tests';
import { Pictogram } from '../../shared/pictogram';
import { ProgressOverview } from '../../shared/progress-overview';
import { StatusBadge } from '../../shared/status-badge';
import { WorkoutTable } from '../../shared/workout-table';
import { TestCards } from '../tests/test-cards';

/** Día del plan que toca hoy: el siguiente al último registrado. */
function nextPlanDay(plan: Plan, last: Workout | undefined) {
  const days = [...new Set(plan.items.map((i) => i.dayLabel || 'Sin día'))];
  if (days.length === 0) return null;
  const lastIdx = last ? days.findIndex((d) => last.title.includes(d)) : -1;
  const label = days[(lastIdx + 1) % days.length];
  return { label, items: plan.items.filter((i) => (i.dayLabel || 'Sin día') === label) };
}

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DatePipe,
    Pictogram,
    ProgressOverview,
    StatusBadge,
    WorkoutTable,
    TestCards,
  ],
  template: `
    @if (auth.user(); as u) {
      <div class="page-header">
        <div>
          <h1>Hola, {{ firstName() }}</h1>
          <p class="access">
            <app-status-badge [status]="u.status" />
            @if (u.activeUntil) {
              <span class="mono">
                Acceso hasta el {{ u.activeUntil | date: 'd MMM y' }} · {{ u.daysRemaining }} días
              </span>
            } @else {
              <span class="mono">Acceso sin caducidad</span>
            }
          </p>
        </div>
        <div class="row">
          <a class="btn" routerLink="/simulacro">Simulacro</a>
          <a class="btn btn-primary" routerLink="/entrenamientos/nuevo">Registrar entrenamiento</a>
        </div>
      </div>
    }

    <div class="stack">
      @if (today(); as day) {
        <section class="card today">
          <h2>Hoy toca · {{ day.label }}</h2>
          <p class="plan-name muted small">
            {{ plan()?.title }} · <a routerLink="/planes">ver plan completo</a>
          </p>
          <ol class="session">
            @for (it of day.items; track $index) {
              <li>
                <app-pictogram
                  [exercise]="it.exerciseName ?? ''"
                  [size]="104"
                  [phase]="$index * 0.23"
                />
                <div>
                  <p class="ex-name">{{ it.exerciseName }}</p>
                  <p class="dose">
                    {{ it.sets }} × {{ it.reps
                    }}{{ it.restSeconds ? ' · ' + it.restSeconds + ' s' : '' }}
                  </p>
                  @if (it.notes) {
                    <p class="muted small">{{ it.notes }}</p>
                  }
                </div>
              </li>
            }
          </ol>
          <div class="row">
            <a
              class="btn btn-primary"
              routerLink="/entrenamientos/nuevo"
              [queryParams]="{ plan: plan()?.id, dia: day.label }"
              >Empezar esta sesión</a
            >
          </div>
        </section>
      } @else if (!plans.isLoading()) {
        <section class="card">
          <h2>Hoy toca</h2>
          <p class="muted">
            Tu instructor aún no te ha asignado un plan. Mientras, registra tus simulacros.
          </p>
        </section>
      }

      <section>
        <div class="section-head">
          <h2>Mis marcas</h2>
          <a routerLink="/pruebas">Evolución por prueba →</a>
        </div>
        <app-test-cards [summaries]="testSummaries()" [selectable]="false" />
      </section>

      <app-progress-overview />

      <section class="card">
        <h2>Últimos entrenamientos</h2>
        <app-workout-table [workouts]="recent.value()?.items ?? []" />
        <p class="more"><a routerLink="/entrenamientos">Ver todos →</a></p>
      </section>
    </div>
  `,
  styles: `
    .access {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .access .mono {
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .plan-name {
      margin: 0 0 1rem;
    }
    .session {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 0;
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--line);
    }
    .session li {
      display: grid;
      grid-template-columns: 104px 1fr;
      gap: 0.75rem;
      align-items: center;
      padding: 0.75rem 0.5rem 0.75rem 0;
      border-bottom: 1px solid var(--line);
    }
    .session p {
      margin: 0;
    }
    .ex-name {
      font-weight: 650;
    }
    .dose {
      font-family: var(--mono);
      font-size: 0.9rem;
    }
    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }
    .section-head h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    .more {
      margin: 0.75rem 0 0;
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  protected readonly recent = httpResource<Page<Workout>>(() => `${userBase()}/workouts?limit=5`);
  protected readonly plans = httpResource<Plan[]>(() => `${userBase()}/plans`);
  private readonly tests = httpResource<TestResult[]>(() => `${userBase()}/tests`, {
    defaultValue: [],
  });

  protected readonly testSummaries = computed(() => summarize(this.tests.value()));
  protected readonly plan = computed(() => this.plans.value()?.find((p) => p.isActive) ?? null);
  protected readonly today = computed(() => {
    const p = this.plan();
    return p ? nextPlanDay(p, this.recent.value()?.items[0]) : null;
  });
}
