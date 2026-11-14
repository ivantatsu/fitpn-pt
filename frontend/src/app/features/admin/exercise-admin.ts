import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { EXERCISES_URL, TrainingApi } from '../../core/api/training.api';
import { Exercise, MUSCLE_GROUPS } from '../../core/models';
import { NotificationService } from '../../core/notification.service';

/** Gestión del catálogo de ejercicios. */
@Component({
  selector: 'app-exercise-admin',
  imports: [ReactiveFormsModule, FormsModule],
  template: `
    <div class="page-header"><h1>Catálogo de ejercicios</h1></div>

    <div class="grid cols">
      <form [formGroup]="form" (ngSubmit)="save()" class="card stack" novalidate>
        <h2>{{ editingId() ? 'Editar ejercicio' : 'Nuevo ejercicio' }}</h2>
        <div class="field">
          <label for="ex-name">Nombre</label>
          <input id="ex-name" class="input" formControlName="name" />
        </div>
        <div class="form-grid" style="--min: 150px">
          <div class="field">
            <label for="ex-group">Grupo muscular</label>
            <select id="ex-group" class="input" formControlName="muscleGroup">
              @for (g of groups; track g) {
                <option [value]="g">{{ g }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="ex-eq">Material</label>
            <input
              id="ex-eq"
              class="input"
              formControlName="equipment"
              placeholder="barra, mancuernas…"
            />
          </div>
        </div>
        <div class="field">
          <label for="ex-desc">Descripción / técnica</label>
          <textarea id="ex-desc" class="input" formControlName="description"></textarea>
        </div>
        <div class="row end">
          @if (editingId()) {
            <button type="button" class="btn" (click)="reset()">Cancelar</button>
          }
          <button class="btn btn-primary" type="submit" [disabled]="saving()">Guardar</button>
        </div>
      </form>

      <section class="card">
        <input
          class="input search"
          type="search"
          placeholder="Filtrar ejercicios…"
          aria-label="Filtrar"
          [(ngModel)]="filterText"
        />
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th>Grupo</th>
                <th>Material</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (e of filtered(); track e.id) {
                <tr>
                  <td>
                    <strong>{{ e.name }}</strong>
                    <div class="muted small">{{ e.description }}</div>
                  </td>
                  <td>
                    <span class="badge">{{ e.muscleGroup }}</span>
                  </td>
                  <td class="muted">{{ e.equipment }}</td>
                  <td class="num nowrap">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="edit(e)">
                      Editar
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      (click)="remove(e)"
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: `
    .cols {
      grid-template-columns: minmax(280px, 380px) 1fr;
      align-items: start;
    }
    @media (max-width: 860px) {
      .cols {
        grid-template-columns: 1fr;
      }
    }
    .end {
      justify-content: flex-end;
    }
    .search {
      margin-bottom: 0.75rem;
    }
  `,
})
export class ExerciseAdmin {
  private readonly api = inject(TrainingApi);
  private readonly notify = inject(NotificationService);

  protected readonly groups = MUSCLE_GROUPS;
  protected readonly exercises = httpResource<Exercise[]>(() => EXERCISES_URL, {
    defaultValue: [],
  });
  protected readonly filterText = signal('');
  protected readonly filtered = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    return this.exercises
      .value()
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.includes(q));
  });

  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    muscleGroup: [MUSCLE_GROUPS[0] as string, Validators.required],
    equipment: ['', Validators.maxLength(60)],
    description: ['', Validators.maxLength(2000)],
  });

  protected edit(e: Exercise): void {
    this.editingId.set(e.id);
    this.form.setValue({
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      description: e.description,
    });
  }

  protected reset(): void {
    this.editingId.set(null);
    this.form.reset();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const id = this.editingId();
      await firstValueFrom(id ? this.api.updateExercise(id, v) : this.api.createExercise(v));
      this.notify.success(id ? 'Ejercicio actualizado' : 'Ejercicio añadido');
      this.reset();
      this.exercises.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(e: Exercise): Promise<void> {
    if (!confirm(`¿Eliminar "${e.name}" del catálogo?`)) return;
    try {
      await firstValueFrom(this.api.deleteExercise(e.id));
      this.notify.success('Ejercicio eliminado');
      this.exercises.reload();
    } catch (err) {
      this.notify.error(errorMessage(err, 'No se pudo eliminar'));
    }
  }
}
