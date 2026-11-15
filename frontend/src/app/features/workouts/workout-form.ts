import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, fieldErrors } from '../../core/api-error';
import { EXERCISES_URL, TrainingApi, userBase } from '../../core/api/training.api';
import { optionalId, toIsoDate } from '../../core/date';
import { Exercise, Plan, Workout, WorkoutInput } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { Pictogram } from '../../shared/pictogram';

type SetGroup = FormGroup<{ reps: FormControl<number>; weightKg: FormControl<number> }>;

/** Alta y edición de una sesión de entrenamiento. */
@Component({
  selector: 'app-workout-form',
  imports: [ReactiveFormsModule, RouterLink, Pictogram],
  templateUrl: './workout-form.html',
  styleUrl: './workout-form.scss',
})
export class WorkoutForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(TrainingApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly workoutId = input(null, { transform: optionalId });
  readonly userId = input(null, { transform: optionalId });
  /** Precarga desde el panel ("Hoy toca"): `?plan=ID&dia=Etiqueta`. */
  readonly plan = input(null, { transform: optionalId });
  readonly dia = input<string>();
  private preloaded = false;

  protected readonly isEdit = computed(() => this.workoutId() !== null);
  protected readonly listLink = computed(() =>
    this.userId() ? `/admin/usuarios/${this.userId()}/entrenamientos` : '/entrenamientos',
  );

  protected readonly exercises = httpResource<Exercise[]>(() => EXERCISES_URL, {
    defaultValue: [],
  });
  protected readonly plans = httpResource<Plan[]>(() => `${userBase(this.userId())}/plans`, {
    defaultValue: [],
  });
  private readonly existing = httpResource<Workout>(() =>
    this.workoutId() ? `${userBase(this.userId())}/workouts/${this.workoutId()}` : undefined,
  );

  /** Días de los planes activos para precargar la sesión. */
  protected readonly planDays = computed(() =>
    this.plans
      .value()
      .filter((p) => p.isActive)
      .flatMap((p) =>
        [...new Set(p.items.map((i) => i.dayLabel || 'Sin día'))].map((day) => ({
          key: `${p.id}|${day}`,
          label: `${p.title} · ${day}`,
          plan: p,
          day,
        })),
      ),
  );

  protected readonly groupedExercises = computed(() => {
    const groups = new Map<string, Exercise[]>();
    for (const e of this.exercises.value()) {
      groups.set(e.muscleGroup, [...(groups.get(e.muscleGroup) ?? []), e]);
    }
    return [...groups.entries()];
  });

  protected readonly form = this.fb.group({
    performedOn: [toIsoDate(), Validators.required],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    durationMinutes: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(1440),
    ]),
    perceivedEffort: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(10)]),
    notes: ['', Validators.maxLength(2000)],
    exercises: this.fb.array<FormGroup>([]),
  });

  protected readonly saving = signal(false);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly today = toIsoDate();

  constructor() {
    // Al editar, carga los datos existentes en el formulario.
    effect(() => {
      const w = this.existing.value();
      if (w) untracked(() => this.patch(w));
    });
    effect(() => {
      const plan = this.plan();
      const dia = this.dia();
      const days = this.planDays();
      if (this.preloaded || !plan || !dia || days.length === 0) return;
      this.preloaded = true;
      untracked(() => this.loadPlanDay(`${plan}|${dia}`));
    });
  }

  protected exerciseOf(id: number | null | undefined): Exercise | undefined {
    return id ? this.exercises.value().find((e) => e.id === Number(id)) : undefined;
  }

  protected get exerciseArray(): FormArray<FormGroup> {
    return this.form.controls.exercises;
  }

  protected setsOf(i: number): FormArray<SetGroup> {
    return this.exerciseArray.at(i).get('sets') as FormArray<SetGroup>;
  }

  private newSet(reps = 10, weightKg = 0): SetGroup {
    return this.fb.group({
      reps: [reps, [Validators.required, Validators.min(0), Validators.max(1000)]],
      weightKg: [weightKg, [Validators.required, Validators.min(0), Validators.max(2000)]],
    });
  }

  protected addExercise(
    exerciseId: number | null = null,
    sets: SetGroup[] = [this.newSet()],
  ): void {
    this.exerciseArray.push(
      this.fb.group({
        exerciseId: this.fb.control<number | null>(exerciseId, Validators.required),
        sets: this.fb.array<SetGroup>(sets),
      }),
    );
  }

  protected removeExercise(i: number): void {
    this.exerciseArray.removeAt(i);
  }

  protected moveExercise(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.exerciseArray.length) return;
    const ctrl = this.exerciseArray.at(i);
    this.exerciseArray.removeAt(i);
    this.exerciseArray.insert(j, ctrl);
  }

  /** Añade una serie copiando los valores de la anterior (lo habitual al entrenar). */
  protected addSet(i: number): void {
    const sets = this.setsOf(i);
    const last = sets.length ? sets.at(sets.length - 1).getRawValue() : { reps: 10, weightKg: 0 };
    sets.push(this.newSet(last.reps, last.weightKg));
  }

  protected removeSet(i: number, j: number): void {
    this.setsOf(i).removeAt(j);
  }

  protected loadPlanDay(key: string): void {
    const entry = this.planDays().find((d) => d.key === key);
    if (!entry) return;
    this.exerciseArray.clear();
    for (const item of entry.plan.items.filter((it) => (it.dayLabel || 'Sin día') === entry.day)) {
      const reps = parseInt(item.reps, 10) || 10;
      this.addExercise(
        item.exerciseId,
        Array.from({ length: item.sets }, () => this.newSet(reps, 0)),
      );
    }
    if (!this.form.controls.title.value) {
      this.form.controls.title.setValue(`${entry.plan.title} · ${entry.day}`);
    }
  }

  private patch(w: Workout): void {
    this.form.patchValue({
      performedOn: w.performedOn,
      title: w.title,
      durationMinutes: w.durationMinutes,
      perceivedEffort: w.perceivedEffort,
      notes: w.notes,
    });
    this.exerciseArray.clear();
    for (const ex of w.exercises ?? []) {
      this.addExercise(
        ex.exerciseId,
        ex.sets.map((s) => this.newSet(s.reps, s.weightKg)),
      );
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input: WorkoutInput = {
      performedOn: raw.performedOn,
      title: raw.title.trim(),
      durationMinutes: raw.durationMinutes ?? null,
      perceivedEffort: raw.perceivedEffort ?? null,
      notes: raw.notes.trim(),
      exercises: this.exerciseArray.controls.map((g, i) => ({
        exerciseId: Number(g.get('exerciseId')!.value),
        sets: this.setsOf(i).getRawValue(),
      })),
    };

    this.saving.set(true);
    this.serverErrors.set({});
    try {
      const id = this.workoutId();
      const saved = await firstValueFrom(
        id
          ? this.api.updateWorkout(id, input, this.userId())
          : this.api.createWorkout(input, this.userId()),
      );
      this.notify.success(id ? 'Entrenamiento actualizado' : '¡Entrenamiento registrado! 💪');
      await this.router.navigate([this.listLink(), saved.id]);
    } catch (err) {
      this.serverErrors.set(fieldErrors(err));
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
