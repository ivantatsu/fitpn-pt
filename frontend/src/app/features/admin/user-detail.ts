import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ADMIN_USERS_URL } from '../../core/api/admin.api';
import { optionalId } from '../../core/date';
import { User } from '../../core/models';
import { ProgressOverview } from '../../shared/progress-overview';
import { StatusBadge } from '../../shared/status-badge';
import { Measurements } from '../measurements/measurements';
import { ExerciseProgress } from '../progress/exercise-progress';
import { WorkoutList } from '../workouts/workout-list';
import { PhysicalTests } from '../tests/physical-tests';
import { RenewButton } from './renew-button';
import { UserAccount } from './user-account';
import { UserPlans } from './user-plans';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'pruebas', label: 'Pruebas físicas' },
  { id: 'entrenamientos', label: 'Entrenamientos' },
  { id: 'planes', label: 'Planes' },
  { id: 'progreso', label: 'Progreso' },
  { id: 'medidas', label: 'Medidas' },
  { id: 'cuenta', label: 'Cuenta y suscripción' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Ficha de un usuario para el administrador. */
@Component({
  selector: 'app-user-detail',
  imports: [
    RouterLink,
    DatePipe,
    StatusBadge,
    RenewButton,
    ProgressOverview,
    WorkoutList,
    Measurements,
    ExerciseProgress,
    UserPlans,
    UserAccount,
    PhysicalTests,
  ],
  template: `
    <a routerLink="/admin/usuarios" class="back">← Volver a usuarios</a>

    @if (user.error()) {
      <div class="alert alert-error">Usuario no encontrado.</div>
    } @else if (user.value(); as u) {
      <div class="page-header">
        <div>
          <h1>{{ u.fullName }}</h1>
          <div class="row">
            <app-status-badge [status]="u.status" />
            <span class="muted">{{ u.email }}</span>
            @if (u.activeUntil) {
              <span class="muted"
                >· Acceso hasta el {{ u.activeUntil | date: 'd MMM y, HH:mm' }}</span
              >
            }
          </div>
        </div>
        @if (u.role === 'member') {
          <div class="row">
            <app-renew-button [user]="u" [primary]="true" (renewed)="user.set($event)" />
            <app-renew-button [user]="u" [months]="3" (renewed)="user.set($event)" />
          </div>
        }
      </div>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === t.id"
            (click)="select(t.id)"
          >
            {{ t.label }}
          </button>
        }
      </div>

      @switch (activeTab()) {
        @case ('resumen') {
          <app-progress-overview [userId]="u.id" />
        }
        @case ('pruebas') {
          <app-physical-tests [userId]="u.id" [embedded]="true" />
        }
        @case ('entrenamientos') {
          <div class="row end">
            <a class="btn btn-primary btn-sm" [routerLink]="['entrenamientos', 'nuevo']"
              >+ Registrar sesión para el alumno</a
            >
          </div>
          <app-workout-list [userId]="u.id" [embedded]="true" />
        }
        @case ('planes') {
          <app-user-plans [userId]="u.id" />
        }
        @case ('progreso') {
          <app-exercise-progress [userId]="u.id" [embedded]="true" />
        }
        @case ('medidas') {
          <app-measurements [userId]="u.id" [embedded]="true" />
        }
        @case ('cuenta') {
          <app-user-account [user]="u" (changed)="user.set($event)" />
        }
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
    .end {
      justify-content: flex-end;
      margin-bottom: 0.75rem;
    }
  `,
})
export class UserDetail {
  private readonly router = inject(Router);

  readonly userId = input.required({ transform: optionalId });
  /** Pestaña activa desde `?tab=`. */
  readonly tab = input<string>();

  protected readonly tabs = TABS;
  protected readonly activeTab = computed<TabId>(() =>
    TABS.some((t) => t.id === this.tab()) ? (this.tab() as TabId) : 'resumen',
  );

  protected readonly user = httpResource<User>(() =>
    this.userId() ? `${ADMIN_USERS_URL}/${this.userId()}` : undefined,
  );

  protected select(tab: TabId): void {
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }
}
