import { httpResource } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { EXERCISES_URL } from '../../core/api/training.api';
import { Exercise, MUSCLE_GROUPS } from '../../core/models';
import { motionFor } from '../../core/motion/library';
import { Pictogram } from '../../shared/pictogram';

/** Biblioteca de ejercicios con su animación y la clave técnica de cada uno. */
@Component({
  selector: 'app-exercise-library',
  imports: [Pictogram],
  template: `
    <div class="page-header">
      <div>
        <h1>Ejercicios</h1>
        <p class="muted">Cómo se hace cada ejercicio del catálogo, con su punto técnico clave.</p>
      </div>
      <input
        class="input search"
        type="search"
        placeholder="Buscar ejercicio…"
        aria-label="Buscar ejercicio"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
    </div>

    <div class="filters" role="group" aria-label="Grupo muscular">
      <button type="button" [class.on]="!group()" (click)="group.set(null)">Todos</button>
      @for (g of groups; track g) {
        <button type="button" [class.on]="group() === g" (click)="group.set(g)">{{ g }}</button>
      }
    </div>

    <div class="sheet">
      @for (item of items(); track item.e.id) {
        <article class="item">
          <app-pictogram
            [exercise]="item.e.name"
            [muscleGroup]="item.e.muscleGroup"
            [size]="132"
            [phase]="($index * 0.17) % 1"
          />
          <div class="text">
            <h2>{{ item.e.name }}</h2>
            <p class="meta">{{ item.e.muscleGroup }} · {{ item.e.equipment || 'sin material' }}</p>
            @if (item.cue) {
              <p class="cue">{{ item.cue }}</p>
            }
            @if (item.e.description) {
              <p class="muted small">{{ item.e.description }}</p>
            }
          </div>
        </article>
      } @empty {
        <p class="empty">
          {{ exercises.isLoading() ? 'Cargando…' : 'No hay ejercicios que coincidan.' }}
        </p>
      }
    </div>
  `,
  styles: `
    .search {
      max-width: 260px;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 1.25rem;
    }
    .filters button {
      padding: 0.3rem 0.75rem;
      border: 1px solid var(--border-strong);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: 0.88rem;
      cursor: pointer;
    }
    .filters button:first-letter {
      text-transform: uppercase;
    }
    .filters button.on {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      border-top: 1px solid var(--line);
      border-left: 1px solid var(--line);
    }
    .item {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 1rem;
      align-items: start;
      padding: 1rem;
      background: var(--surface);
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    h2 {
      margin: 0.25rem 0 0.15rem;
      font-size: 1.05rem;
    }
    .meta {
      margin: 0 0 0.5rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .cue {
      margin: 0 0 0.4rem;
      font-size: 0.9rem;
    }
    @media (max-width: 480px) {
      .item {
        grid-template-columns: 96px 1fr;
      }
      .item app-pictogram {
        width: 96px;
      }
    }
  `,
})
export class ExerciseLibrary {
  protected readonly groups = MUSCLE_GROUPS;
  protected readonly query = signal('');
  protected readonly group = signal<string | null>(null);
  protected readonly exercises = httpResource<Exercise[]>(() => EXERCISES_URL, {
    defaultValue: [],
  });

  protected readonly items = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.exercises
      .value()
      .filter(
        (e) =>
          (!this.group() || e.muscleGroup === this.group()) &&
          (!q || e.name.toLowerCase().includes(q)),
      )
      .map((e) => ({ e, cue: motionFor(e.name, e.muscleGroup)?.cue ?? null }));
  });
}
