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
import { summarize, TestResult } from '../../core/physical-tests';
import { TestCards } from '../tests/test-cards';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, ProgressOverview, StatusBadge, WorkoutTable, TestCards],
  template: `
    @if (auth.user(); as u) {
      <section class="hero">
        <div class="hero-main">
          <span class="eyebrow"
            >{{ u.role === 'admin' ? 'Instructor' : 'Alumno' }} · En preparación</span
          >
          <h1>
            {{ firstName() }}<span class="last">{{ lastName() }}</span>
          </h1>
          <div class="row meta">
            <app-status-badge [status]="u.status" />
            @if (activePlan(); as p) {
              <a routerLink="/planes" class="plan-link">Plan: {{ p.title }} →</a>
            } @else {
              <span class="muted small">Sin plan asignado todavía</span>
            }
          </div>
          <div class="row actions">
            <a class="btn btn-primary" routerLink="/entrenamientos/nuevo">+ Entrenamiento</a>
            <a class="btn" routerLink="/pruebas">+ Simulacro</a>
          </div>
        </div>

        <div class="countdown" [class.warn]="u.status === 'expiring'">
          @if (u.daysRemaining !== null) {
            <span class="big">{{ u.daysRemaining }}</span>
            <span class="label">días de acceso</span>
            <span class="muted small">Hasta el {{ u.activeUntil | date: 'd MMM y' }}</span>
          } @else {
            <span class="big">∞</span>
            <span class="label">Acceso sin caducidad</span>
          }
        </div>
      </section>
    }

    <div class="stack">
      <section class="stack tests">
        <div class="section-head">
          <h2>Pruebas físicas · mejores marcas</h2>
          <a routerLink="/pruebas">Ver evolución →</a>
        </div>
        <app-test-cards [summaries]="testSummaries()" [selectable]="false" />
      </section>

      <app-progress-overview />

      <section class="card">
        <div class="section-head">
          <h2>Últimos entrenamientos</h2>
          <a routerLink="/entrenamientos">Ver todos →</a>
        </div>
        <app-workout-table [workouts]="recent.value()?.items ?? []" />
      </section>
    </div>
  `,
  styles: `
    .hero {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 1.5rem;
      align-items: end;
      margin-bottom: 1.5rem;
      padding: 2rem 2rem 2.25rem;
      overflow: hidden;
      background:
        linear-gradient(100deg, var(--surface-2) 0 55%, transparent 55%),
        linear-gradient(
          100deg,
          transparent 55%,
          var(--primary) 55% 82%,
          #fff 82% 83%,
          var(--amber) 83% 100%
        );
      border: 1px solid var(--border);
      clip-path: var(--chamfer);
    }
    .hero-main {
      position: relative;
      z-index: 1;
      min-width: 0;
    }
    .eyebrow {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--amber);
    }
    h1 {
      margin: 0.4rem 0 1rem;
      font-size: clamp(3rem, 7vw, 5.5rem);
      line-height: 0.85;
    }
    .last {
      display: block;
      color: transparent;
      -webkit-text-stroke: 1.5px rgb(255 255 255 / 75%);
    }
    .meta {
      margin-bottom: 1.25rem;
    }
    .plan-link {
      font-weight: 600;
    }
    .countdown {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: 1rem 1.25rem;
      background: var(--navy-900);
      border-top: 3px solid var(--success);
      min-width: 190px;
    }
    .countdown.warn {
      border-top-color: var(--warning);
    }
    .big {
      font-family: var(--font-display);
      font-size: 5rem;
      font-weight: 800;
      font-style: italic;
      line-height: 0.9;
      color: #fff;
    }
    .label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .section-head h2 {
      margin: 0;
    }
    .tests {
      gap: 0;
    }
    @media (max-width: 720px) {
      .hero {
        grid-template-columns: 1fr;
        padding: 1.5rem 1.25rem;
        background: linear-gradient(
          170deg,
          var(--surface-2) 0 70%,
          var(--primary) 70% 88%,
          #fff 88% 89%,
          var(--amber) 89%
        );
      }
      .countdown {
        align-items: flex-start;
      }
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  protected readonly lastName = computed(() =>
    (this.auth.user()?.fullName ?? '').split(' ').slice(1).join(' '),
  );
  protected readonly recent = httpResource<Page<Workout>>(() => `${userBase()}/workouts?limit=5`);
  private readonly plans = httpResource<Plan[]>(() => `${userBase()}/plans`);
  private readonly tests = httpResource<TestResult[]>(() => `${userBase()}/tests`, {
    defaultValue: [],
  });
  protected readonly testSummaries = computed(() => summarize(this.tests.value()));
  protected readonly activePlan = computed(() => this.plans.value()?.find((p) => p.isActive));
}
