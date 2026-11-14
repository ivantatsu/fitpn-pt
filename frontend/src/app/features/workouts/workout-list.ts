import { httpResource } from '@angular/common/http';
import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { userBase } from '../../core/api/training.api';
import { optionalId } from '../../core/date';
import { Page, Workout } from '../../core/models';
import { WorkoutTable } from '../../shared/workout-table';

const PAGE_SIZE = 20;

/** Historial de entrenamientos con filtro por fechas y paginación. */
@Component({
  selector: 'app-workout-list',
  imports: [FormsModule, RouterLink, WorkoutTable],
  template: `
    @if (!embedded()) {
      <div class="page-header">
        <h1>Entrenamientos</h1>
        <a class="btn btn-primary" routerLink="nuevo">+ Registrar entrenamiento</a>
      </div>
    }

    <section class="card">
      <div class="row filters">
        <label class="field">
          <span class="small muted">Desde</span>
          <input class="input" type="date" [ngModel]="from()" (ngModelChange)="setFrom($event)" />
        </label>
        <label class="field">
          <span class="small muted">Hasta</span>
          <input class="input" type="date" [ngModel]="to()" (ngModelChange)="setTo($event)" />
        </label>
        @if (from() || to()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="clear()">Limpiar</button>
        }
        <span class="muted small total">{{ page.value()?.total ?? 0 }} sesiones</span>
      </div>

      @if (page.error()) {
        <div class="alert alert-error">No se pudieron cargar los entrenamientos.</div>
      } @else {
        <app-workout-table [workouts]="page.value()?.items ?? []" [linkBase]="linkBase()" />
      }

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
      align-items: flex-end;
    }
    .filters .field {
      max-width: 180px;
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
export class WorkoutList {
  /** Socio cuyo historial se muestra (solo administradores). */
  readonly userId = input(null, { transform: optionalId });
  /** Oculta la cabecera cuando se incrusta en otra página. */
  readonly embedded = input(false);

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly offset = signal(0);

  protected readonly linkBase = computed(() =>
    this.userId() ? `/admin/usuarios/${this.userId()}/entrenamientos` : '/entrenamientos',
  );

  protected readonly page = httpResource<Page<Workout>>(() => ({
    url: `${userBase(this.userId())}/workouts`,
    params: {
      limit: PAGE_SIZE,
      offset: this.offset(),
      ...(this.from() ? { from: this.from() } : {}),
      ...(this.to() ? { to: this.to() } : {}),
    },
  }));

  protected readonly pages = computed(() => Math.ceil((this.page.value()?.total ?? 0) / PAGE_SIZE));
  protected readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_SIZE) + 1);

  protected setFrom(v: string): void {
    this.from.set(v);
    this.offset.set(0);
  }

  protected setTo(v: string): void {
    this.to.set(v);
    this.offset.set(0);
  }

  protected clear(): void {
    this.from.set('');
    this.to.set('');
    this.offset.set(0);
  }

  protected go(delta: number): void {
    this.offset.update((o) => Math.max(0, o + delta * PAGE_SIZE));
  }
}
