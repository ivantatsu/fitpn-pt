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
                  ▲ Mejora en el último intento
                } @else if (s.improvement < 0) {
                  ▼ Peor que el intento anterior
                } @else {
                  = Igual que el intento anterior
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
    }
    .test {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2rem;
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
      border-top: 3px solid var(--primary);
    }
    .test:disabled {
      cursor: default;
    }
    .test.selected {
      outline: 2px solid var(--primary);
      border-top-color: var(--gold);
    }
    .name {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .best {
      font-family: var(--font-display);
      font-size: 2.2rem;
      font-weight: 700;
      line-height: 1.1;
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

  protected fmt(type: TestType, v: number): string {
    return formatResult(type, v);
  }
}
