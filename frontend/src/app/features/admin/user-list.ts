import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ADMIN_USERS_URL } from '../../core/api/admin.api';
import { Page, User } from '../../core/models';
import { StatusBadge } from '../../shared/status-badge';
import { RenewButton } from './renew-button';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-user-list',
  imports: [FormsModule, RouterLink, DatePipe, StatusBadge, RenewButton],
  template: `
    <div class="page-header">
      <h1>Usuarios</h1>
      <a class="btn btn-primary" routerLink="nuevo">+ Nuevo usuario</a>
    </div>

    <section class="card">
      <div class="row filters">
        <input
          class="input search"
          type="search"
          placeholder="Buscar por nombre o email…"
          aria-label="Buscar usuarios"
          [ngModel]="query()"
          (ngModelChange)="onSearch($event)"
        />
        <select
          class="input status"
          aria-label="Filtrar por estado"
          [ngModel]="filter()"
          (ngModelChange)="setFilter($event)"
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="expiring">Caducan pronto</option>
          <option value="expired">Caducados</option>
          <option value="disabled">Deshabilitados</option>
          <option value="admin">Administradores</option>
        </select>
        <span class="muted small total">{{ users.value()?.total ?? 0 }} usuarios</span>
      </div>

      @if (users.error()) {
        <div class="alert alert-error">No se pudo cargar el listado.</div>
      }

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Acceso hasta</th>
              <th>Último acceso</th>
              <th class="num">Renovar</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users.value()?.items; track u.id) {
              <tr>
                <td>
                  <a [routerLink]="[u.id]"
                    ><strong>{{ u.fullName }}</strong></a
                  >
                  <div class="muted small">{{ u.email }}</div>
                </td>
                <td><app-status-badge [status]="u.status" /></td>
                <td class="nowrap">
                  {{ u.activeUntil ? (u.activeUntil | date: 'd MMM y') : '—' }}
                </td>
                <td class="nowrap muted small">
                  {{ u.lastLoginAt ? (u.lastLoginAt | date: 'd MMM y, HH:mm') : 'Nunca' }}
                </td>
                <td class="num">
                  @if (u.role === 'member') {
                    <app-renew-button [user]="u" (renewed)="users.reload()" />
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty">No hay usuarios que coincidan.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (pages() > 1) {
        <div class="row pager">
          <button type="button" class="btn btn-sm" [disabled]="offset() === 0" (click)="go(-1)">
            ← Anterior
          </button>
          <span class="muted small">Página {{ currentPage() }} de {{ pages() }}</span>
          <button
            type="button"
            class="btn btn-sm"
            [disabled]="currentPage() >= pages()"
            (click)="go(1)"
          >
            Siguiente →
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .filters {
      margin-bottom: 1rem;
    }
    .search {
      flex: 1 1 260px;
    }
    .status {
      flex: 0 1 200px;
    }
    .total {
      margin-left: auto;
    }
    .pager {
      justify-content: center;
      margin-top: 1rem;
    }
  `,
})
export class UserList {
  /** Filtro inicial desde la URL (`?status=expired`). */
  readonly status = input<string>();

  protected readonly query = signal('');
  private readonly debouncedQuery = signal('');
  protected readonly filter = signal('');
  protected readonly offset = signal(0);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly users = httpResource<Page<User>>(() => ({
    url: ADMIN_USERS_URL,
    params: {
      q: this.debouncedQuery(),
      status: this.filter(),
      limit: PAGE_SIZE,
      offset: this.offset(),
    },
  }));

  protected readonly pages = computed(() =>
    Math.ceil((this.users.value()?.total ?? 0) / PAGE_SIZE),
  );
  protected readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_SIZE) + 1);

  constructor() {
    effect(() => this.filter.set(this.status() ?? ''));
  }

  protected onSearch(q: string): void {
    this.query.set(q);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.debouncedQuery.set(q.trim());
      this.offset.set(0);
    }, 300);
  }

  protected setFilter(status: string): void {
    this.filter.set(status);
    this.offset.set(0);
  }

  protected go(delta: number): void {
    this.offset.update((o) => Math.max(0, o + delta * PAGE_SIZE));
  }
}
