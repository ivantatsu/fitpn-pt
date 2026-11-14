import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { AdminApi } from '../../core/api/admin.api';
import { EXERCISES_URL } from '../../core/api/training.api';
import { Exercise, Plan, PlanInput, PlanItem } from '../../core/models';
import { NotificationService } from '../../core/notification.service';

/** Formulario de creación/edición de un plan de entrenamiento. */
@Component({
  selector: 'app-plan-editor',
  imports: [ReactiveFormsModule],
  templateUrl: './plan-editor.html',
  styles: `
    .item {
      display: grid;
      grid-template-columns: 1.1fr 2fr 70px 90px 90px 1.5fr auto;
      gap: 0.5rem;
      align-items: end;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--border);
    }
    @media (max-width: 900px) {
      .item {
        grid-template-columns: 1fr 1fr;
      }
    }
    .end {
      justify-content: flex-end;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
    }
  `,
})
export class PlanEditor {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AdminApi);
  private readonly notify = inject(NotificationService);

  readonly userId = input.required<number>();
  /** Plan a editar; si no se indica se crea uno nuevo. */
  readonly plan = input<Plan | null>(null);
  readonly saved = output<Plan>();
  readonly cancelled = output<void>();

  protected readonly exercises = httpResource<Exercise[]>(() => EXERCISES_URL, {
    defaultValue: [],
  });
  protected readonly sortedExercises = computed(() =>
    [...this.exercises.value()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
  );

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(2000)],
    isActive: [true],
    items: this.fb.array([this.newItem()]),
  });
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const p = this.plan();
      if (!p) return;
      this.form.patchValue({ title: p.title, description: p.description, isActive: p.isActive });
      this.form.controls.items.clear();
      p.items.forEach((it) => this.form.controls.items.push(this.newItem(it)));
    });
  }

  private newItem(it?: Partial<PlanItem>) {
    return this.fb.group({
      dayLabel: [it?.dayLabel ?? 'Día 1', Validators.maxLength(40)],
      exerciseId: this.fb.control<number | null>(it?.exerciseId ?? null, Validators.required),
      sets: [it?.sets ?? 3, [Validators.required, Validators.min(1), Validators.max(50)]],
      reps: [it?.reps ?? '8-12', [Validators.required, Validators.maxLength(20)]],
      restSeconds: [it?.restSeconds ?? 90, [Validators.min(0), Validators.max(3600)]],
      notes: [it?.notes ?? '', Validators.maxLength(500)],
    });
  }

  protected addItem(): void {
    const items = this.form.controls.items;
    const lastDay = items.length ? items.at(items.length - 1).controls.dayLabel.value : 'Día 1';
    items.push(this.newItem({ dayLabel: lastDay }));
  }

  protected removeItem(i: number): void {
    this.form.controls.items.removeAt(i);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input: PlanInput = {
      ...v,
      items: v.items.map((it) => ({ ...it, exerciseId: Number(it.exerciseId) })),
    };
    this.saving.set(true);
    try {
      const p = this.plan();
      const saved = await firstValueFrom(
        p
          ? this.api.updatePlan(this.userId(), p.id, input)
          : this.api.createPlan(this.userId(), input),
      );
      this.notify.success('Plan guardado');
      this.saved.emit(saved);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
