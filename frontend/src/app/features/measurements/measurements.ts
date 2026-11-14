import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { TrainingApi, userBase } from '../../core/api/training.api';
import { optionalId, toIsoDate } from '../../core/date';
import { Measurement } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { Chart, ChartPoint } from '../../shared/chart';
import { shortDate } from '../../shared/format';

type Metric = 'weightKg' | 'bodyFatPct' | 'waistCm';

/** Registro y evolución de medidas corporales. */
@Component({
  selector: 'app-measurements',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, Chart],
  templateUrl: './measurements.html',
  styles: `
    .layout {
      --min: 320px;
      align-items: start;
    }
    .metric-tabs {
      margin-bottom: 0.5rem;
    }
  `,
})
export class Measurements {
  private readonly api = inject(TrainingApi);
  private readonly notify = inject(NotificationService);

  readonly userId = input(null, { transform: optionalId });
  readonly embedded = input(false);

  protected readonly list = httpResource<Measurement[]>(
    () => `${userBase(this.userId())}/measurements`,
    { defaultValue: [] },
  );

  protected readonly metrics: { key: Metric; label: string; unit: string }[] = [
    { key: 'weightKg', label: 'Peso', unit: 'kg' },
    { key: 'bodyFatPct', label: '% Grasa', unit: '%' },
    { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  ];
  protected readonly metric = signal<Metric>('weightKg');
  protected readonly metricInfo = computed(() =>
    this.metrics.find((m) => m.key === this.metric())!,
  );

  protected readonly series = computed<ChartPoint[]>(() =>
    [...this.list.value()]
      .reverse()
      .filter((m) => m[this.metric()] !== null)
      .map((m) => ({ label: shortDate(m.measuredOn), value: m[this.metric()]! })),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    measuredOn: [toIsoDate(), Validators.required],
    weightKg: [null as number | null, [Validators.min(1), Validators.max(500)]],
    bodyFatPct: [null as number | null, [Validators.min(1), Validators.max(75)]],
    waistCm: [null as number | null, [Validators.min(1), Validators.max(300)]],
    notes: ['', Validators.maxLength(2000)],
  });
  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.form.invalid || (v.weightKg === null && v.bodyFatPct === null && v.waistCm === null)) {
      this.form.markAllAsTouched();
      this.notify.error('Indica al menos una medida válida');
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.createMeasurement({ ...v, notes: v.notes.trim() }, this.userId()),
      );
      this.notify.success('Medidas guardadas');
      this.form.reset({
        measuredOn: toIsoDate(),
        weightKg: null,
        bodyFatPct: null,
        waistCm: null,
        notes: '',
      });
      this.list.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(m: Measurement): Promise<void> {
    if (!confirm('¿Eliminar este registro de medidas?')) return;
    try {
      await firstValueFrom(this.api.deleteMeasurement(m.id, this.userId()));
      this.list.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }
}
