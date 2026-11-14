import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ADMIN_USERS_URL } from '../../core/api/admin.api';
import { AdminStats, Page, User } from '../../core/models';
import { RenewButton } from './renew-button';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, RenewButton],
  template: `
    <div class="page-header">
      <div>
        <h1>Panel de administración</h1>
        <p class="muted">Estado de los socios y su actividad.</p>
      </div>
      <a class="btn btn-primary" routerLink="usuarios/nuevo">+ Nuevo usuario</a>
    </div>

    @if (stats.value(); as s) {
      <div class="grid stats">
        <a class="card stat link" routerLink="usuarios" [queryParams]="{ status: 'active' }">
          <div class="stat-label">Socios activos</div>
          <div class="stat-value">
            {{ s.activeMembers }}<small> / {{ s.totalMembers }}</small>
          </div>
        </a>
        <a class="card stat link" routerLink="usuarios" [queryParams]="{ status: 'expiring' }">
          <div class="stat-label">Caducan en 7 días</div>
          <div class="stat-value warn">{{ s.expiringMembers }}</div>
        </a>
        <a class="card stat link" routerLink="usuarios" [queryParams]="{ status: 'expired' }">
          <div class="stat-label">Caducados</div>
          <div class="stat-value danger">{{ s.expiredMembers }}</div>
        </a>
        <div class="card stat">
          <div class="stat-label">Sesiones (7 días)</div>
          <div class="stat-value">{{ s.workoutsLast7Days }}</div>
          <div class="muted small">{{ s.activeMembersLast7Days }} socios entrenando</div>
        </div>
      </div>
    }

    <div class="grid lists">
      <section class="card">
        <h2>Caducan pronto</h2>
        @for (u of expiring.value()?.items; track u.id) {
          <div class="user-row">
            <div>
              <a [routerLink]="['usuarios', u.id]"
                ><strong>{{ u.fullName }}</strong></a
              >
              <div class="muted small">
                Caduca el {{ u.activeUntil | date: 'd MMM, HH:mm' }} ({{ u.daysRemaining }} d)
              </div>
            </div>
            <app-renew-button [user]="u" [primary]="true" (renewed)="refresh()" />
          </div>
        } @empty {
          <p class="empty">Ningún socio caduca en los próximos 7 días.</p>
        }
      </section>

      <section class="card">
        <h2>Socios caducados</h2>
        @for (u of expired.value()?.items; track u.id) {
          <div class="user-row">
            <div>
              <a [routerLink]="['usuarios', u.id]"
                ><strong>{{ u.fullName }}</strong></a
              >
              <div class="muted small">Caducó el {{ u.activeUntil | date: 'd MMM y' }}</div>
            </div>
            <app-renew-button [user]="u" (renewed)="refresh()" />
          </div>
        } @empty {
          <p class="empty">No hay socios caducados.</p>
        }
      </section>
    </div>
  `,
  styles: `
    .link {
      color: inherit;
      text-decoration: none;
    }
    .link:hover {
      border-color: var(--primary);
    }
    .warn {
      color: var(--warning);
    }
    .danger {
      color: var(--danger);
    }
    small {
      font-size: 1rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .lists {
      margin-top: 1rem;
      --min: 340px;
      align-items: start;
    }
    .user-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--border);
    }
    .user-row:last-child {
      border-bottom: none;
    }
  `,
})
export class AdminDashboard {
  protected readonly stats = httpResource<AdminStats>(() => '/api/v1/admin/stats');
  protected readonly expiring = httpResource<Page<User>>(
    () => `${ADMIN_USERS_URL}?status=expiring&limit=10`,
  );
  protected readonly expired = httpResource<Page<User>>(
    () => `${ADMIN_USERS_URL}?status=expired&limit=10`,
  );

  protected refresh(): void {
    this.stats.reload();
    this.expiring.reload();
    this.expired.reload();
  }
}
