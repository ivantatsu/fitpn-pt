import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { formatResult, TestSummary, TestType } from '../../core/physical-tests';

/** Tarjetas con la mejor marca y la tendencia de cada prueba. */
@Component({
  selector: 'app-test-cards',
  imports: [DatePipe],
  template: `
    <div class="grid cards">
      @for (s of summaries(); track s.def.type) {
        <button
          type="button"
          class="card test"
          [class.selected]="selected() === s.def.type"
          [attr.aria-pressed]="selectable() ? selected() === s.def.type : null"
          [disabled]="!selectable()"
          (click)="select.emit(s.def.type)"
        >
          <span class="name">{{ s.def.name }}</span>
          @if (s.best; as b) {
            <span class="best">{{ fmt(s.def.type, b.result) }}</span>
            <span class="muted small">Mejor marca · {{ b.performedOn | date: 'd MMM y' }}</span>
            @if (s.improvement !== null) {
              <span class="trend" [class.up]="s.improvement > 0" [class.down]="s.improvement < 0">
                @if (s.improvement > 0) {
                  ▲ Mejora vs. anterior
                } @else if (s.improvement < 0) {
                  ▼ Empeora vs. anterior
                } @else {
                  = Igual que el anterior
                }
              </span>
            }
            <span class="muted small">{{ s.attempts }} intento(s)</span>
          } @else {
            <span class="best muted">—</span>
            <span class="muted small">Sin marcas registradas</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .cards {
      --min: 210px;
    }
    .test {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      padding-top: 1.1rem;
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
      border-top: 2px solid var(--border-strong);
      transition:
        border-color 0.15s,
        background 0.15s;
    }
    .test:not(:disabled):hover {
      border-top-color: var(--primary);
    }
    .test:disabled {
      cursor: default;
    }
    .test.selected {
      border-top-color: var(--amber);
      background: linear-gradient(180deg, rgb(47 107 255 / 22%), var(--surface) 160px);
    }
    .name {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .best {
      font-family: var(--font-display);
      font-size: 3.1rem;
      font-weight: 800;
      font-style: italic;
      line-height: 0.95;
      font-variant-numeric: tabular-nums;
    }
    .trend {
      padding: 0.1rem 0.5rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: var(--surface-3);
    }
    .up {
      color: var(--success);
      background: var(--success-soft);
    }
    .down {
      color: var(--danger);
      background: var(--danger-soft);
    }
  `,
})
export class TestCards {
  readonly summaries = input.required<TestSummary[]>();
  readonly selected = input<TestType | null>(null);
  readonly selectable = input(true);
  readonly select = output<TestType>();

  protected fmt(type: TestType, v: number): string {
    return formatResult(type, v);
  }
}
