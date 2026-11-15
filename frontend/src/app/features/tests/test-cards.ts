import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { formatResult, TestSummary, TestType } from '../../core/physical-tests';
import { Pictogram } from '../../shared/pictogram';

/** Tarjetas con la mejor marca y la tendencia de cada prueba. */
@Component({
  selector: 'app-test-cards',
  imports: [DatePipe, Pictogram],
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
          <span class="head">
            <span class="name">{{ s.def.name }}</span>
            <app-pictogram [exercise]="motionOf(s.def.type)" [size]="54" [phase]="0.4" />
          </span>
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
      --min: 200px;
      gap: 0;
      background: var(--surface);
      border: 1px solid var(--line);
    }
    .test {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2rem;
      padding: 0.9rem 1rem 1rem;
      border: 0;
      border-right: 1px solid var(--line);
      border-top: 3px solid transparent;
      background: none;
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .test:disabled {
      cursor: default;
    }
    .test:not(:disabled):hover {
      background: var(--surface-2);
    }
    .test.selected {
      border-top-color: var(--ink);
      background: var(--surface-2);
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      width: 100%;
    }
    .name {
      font-family: var(--mono);
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .best {
      font-family: var(--mono);
      font-size: 2.5rem;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    .trend {
      font-size: 0.8rem;
      font-weight: 600;
    }
    .up {
      color: var(--success);
    }
    .down {
      color: var(--danger);
    }
  `,
})
export class TestCards {
  readonly summaries = input.required<TestSummary[]>();
  readonly selected = input<TestType | null>(null);
  readonly selectable = input(true);
  readonly select = output<TestType>();

  protected motionOf(type: TestType): string {
    return { agility_circuit: 'agility', pull_ups: 'pullup', bar_hang: 'hang', run_1000m: 'run' }[
      type
    ];
  }

  protected fmt(type: TestType, v: number): string {
    return formatResult(type, v);
  }
}
