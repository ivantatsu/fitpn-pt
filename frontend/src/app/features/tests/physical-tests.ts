import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { userBase } from '../../core/api/training.api';
import { optionalId, toIsoDate } from '../../core/date';
import { NotificationService } from '../../core/notification.service';
import {
  TEST_DEFS,
  TestResult,
  TestType,
  formatResult,
  parseResult,
  summarize,
  testDef,
} from '../../core/physical-tests';
import { Chart, ChartPoint } from '../../shared/chart';
import { shortDate } from '../../shared/format';
import { TestCards } from './test-cards';

/** Registro de simulacros de las pruebas físicas y su evolución. */
@Component({
  selector: 'app-physical-tests',
  imports: [ReactiveFormsModule, DatePipe, Chart, TestCards],
  templateUrl: './physical-tests.html',
  styles: `
    .layout {
      --min: 320px;
      align-items: start;
      margin-top: 1rem;
    }
    .hint {
      margin: 0.75rem 0 0;
    }
  `,
})
export class PhysicalTests {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  readonly userId = input(null, { transform: optionalId });
  readonly embedded = input(false);

  protected readonly defs = TEST_DEFS;
  protected readonly results = httpResource<TestResult[]>(
    () => `${userBase(this.userId())}/tests`,
    { defaultValue: [] },
  );
  protected readonly summaries = computed(() => summarize(this.results.value()));

  protected readonly selected = signal<TestType>('run_1000m');
  protected readonly selectedDef = computed(() => testDef(this.selected()));
  protected readonly history = computed(() =>
    this.results
      .value()
      .filter((r) => r.testType === this.selected())
      .reverse(),
  );
  protected readonly chartFormat = computed(() => {
    const type = this.selected();
    return (v: number) => formatResult(type, v);
  });
  protected readonly series = computed<ChartPoint[]>(() =>
    this.results
      .value()
      .filter((r) => r.testType === this.selected())
      .map((r) => ({ label: shortDate(r.performedOn), value: r.result })),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    testType: ['run_1000m' as TestType, Validators.required],
    performedOn: [toIsoDate(), Validators.required],
    result: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
  });
  protected readonly formDef = signal(testDef('run_1000m'));
  protected readonly saving = signal(false);
  protected readonly today = toIsoDate();

  constructor() {
    this.form.controls.testType.valueChanges.subscribe((t) => this.formDef.set(testDef(t)));
  }

  protected fmt(type: TestType, v: number): string {
    return formatResult(type, v);
  }

  protected selectTest(type: TestType): void {
    this.selected.set(type);
    this.form.controls.testType.setValue(type);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const value = parseResult(v.testType, v.result);
    if (this.form.invalid || value === null) {
      this.form.markAllAsTouched();
      this.notify.error('Revisa la marca: ' + testDef(v.testType).hint);
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post<TestResult>(`${userBase(this.userId())}/tests`, {
          testType: v.testType,
          performedOn: v.performedOn,
          result: value,
          notes: v.notes.trim(),
        }),
      );
      this.notify.success(`Marca registrada: ${formatResult(v.testType, value)}`);
      this.selected.set(v.testType);
      this.form.patchValue({ result: '', notes: '' });
      this.form.controls.result.markAsUntouched();
      this.results.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(r: TestResult): Promise<void> {
    if (!confirm(`¿Eliminar la marca ${formatResult(r.testType, r.result)}?`)) return;
    try {
      await firstValueFrom(this.http.delete(`${userBase(this.userId())}/tests/${r.id}`));
      this.results.reload();
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }
}
