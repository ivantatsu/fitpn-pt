import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 30, left: 52 };

/**
 * Gráfico SVG ligero (línea o barras), sin dependencias externas.
 * Accesible: incluye título y una tabla oculta con los datos.
 */
export function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

@Component({
  selector: 'app-chart',
  imports: [DecimalPipe],
  template: `
    @if (points().length === 0) {
      <p class="empty">{{ emptyText() }}</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="title()">
        <title>{{ title() }}</title>
        @for (t of ticks(); track t.y) {
          <line
            class="grid"
            [attr.x1]="PAD.left"
            [attr.x2]="W - PAD.right"
            [attr.y1]="t.y"
            [attr.y2]="t.y"
          />
          <text class="axis" [attr.x]="PAD.left - 8" [attr.y]="t.y + 4" text-anchor="end">
            {{ t.value | number: '1.0-1' }}
          </text>
        }
        @for (l of xLabels(); track $index) {
          <text class="axis" [attr.x]="l.x" [attr.y]="H - 8" text-anchor="middle">
            {{ l.text }}
          </text>
        }
        @if (kind() === 'bar') {
          @for (b of bars(); track $index) {
            <rect
              class="bar"
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.w"
              [attr.height]="b.h"
              rx="3"
            >
              <title>{{ b.label }}: {{ b.value | number: '1.0-1' }} {{ unit() }}</title>
            </rect>
          }
        } @else {
          <path class="area" [attr.d]="areaPath()" />
          <path class="line" [attr.d]="linePath()" />
          @for (p of coords(); track $index) {
            <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="4">
              <title>{{ p.label }}: {{ p.value | number: '1.0-1' }} {{ unit() }}</title>
            </circle>
          }
        }
      </svg>
      <table class="sr-only">
        <caption>
          {{
            title()
          }}
        </caption>
        @for (p of points(); track $index) {
          <tr>
            <th>{{ p.label }}</th>
            <td>{{ p.value }} {{ unit() }}</td>
          </tr>
        }
      </table>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
    }
    .grid {
      stroke: var(--border);
      stroke-dasharray: 3 4;
    }
    .axis {
      fill: var(--text-muted);
      font-size: 11px;
    }
    .bar {
      fill: var(--chart-1);
      opacity: 0.85;
    }
    .bar:hover {
      opacity: 1;
    }
    .line {
      fill: none;
      stroke: var(--chart-1);
      stroke-width: 2.5;
      stroke-linejoin: round;
    }
    .area {
      fill: color-mix(in srgb, var(--chart-1) 14%, transparent);
    }
    .dot {
      fill: var(--surface);
      stroke: var(--chart-1);
      stroke-width: 2;
    }
  `,
})
export class Chart {
  readonly points = input.required<ChartPoint[]>();
  readonly kind = input<'line' | 'bar'>('line');
  readonly title = input('Gráfico');
  readonly unit = input('');
  readonly emptyText = input('Aún no hay datos suficientes');
  /** Fuerza el eje Y a empezar en cero (por defecto en barras). */
  readonly zeroBased = input<boolean | undefined>(undefined);

  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;

  /** Dominio del eje Y con un paso "redondo" (1, 2, 2.5 o 5 × 10ⁿ). */
  private readonly domain = computed(() => {
    const values = this.points().map((p) => p.value);
    const fromZero = this.zeroBased() ?? this.kind() === 'bar';
    let lo = fromZero ? 0 : Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) {
      hi = hi === 0 ? 1 : hi + Math.abs(hi) * 0.05;
      lo = fromZero ? 0 : lo - Math.abs(lo) * 0.05;
    }
    const step = niceStep((hi - lo) / 4);
    const min = fromZero ? 0 : Math.floor(lo / step) * step;
    const max = Math.max(Math.ceil(hi / step) * step, min + step);
    return { min, max, step };
  });

  private y(value: number): number {
    const { min, max } = this.domain();
    const plotH = H - PAD.top - PAD.bottom;
    return PAD.top + plotH - ((value - min) / (max - min)) * plotH;
  }

  protected readonly ticks = computed(() => {
    const { min, max, step } = this.domain();
    const n = Math.round((max - min) / step);
    return Array.from({ length: n + 1 }, (_, i) => {
      const value = min + step * i;
      return { value, y: this.y(value) };
    });
  });

  private readonly step = computed(() => {
    const n = this.points().length;
    return (W - PAD.left - PAD.right) / Math.max(n, 1);
  });

  protected readonly coords = computed(() => {
    const n = this.points().length;
    const plotW = W - PAD.left - PAD.right;
    return this.points().map((p, i) => ({
      ...p,
      x:
        this.kind() === 'bar'
          ? PAD.left + this.step() * (i + 0.5)
          : PAD.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)),
      y: this.y(p.value),
    }));
  });

  protected readonly bars = computed(() => {
    const w = Math.max(this.step() * 0.65, 2);
    const base = this.y(this.domain().min);
    return this.coords().map((c) => ({
      ...c,
      x: c.x - w / 2,
      w,
      y: c.y,
      h: Math.max(base - c.y, 0),
    }));
  });

  protected readonly linePath = computed(() =>
    this.coords()
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const c = this.coords();
    if (c.length < 2) return '';
    const base = H - PAD.bottom;
    return `${this.linePath()} L${c[c.length - 1].x.toFixed(1)},${base} L${c[0].x.toFixed(1)},${base} Z`;
  });

  /** Como máximo ~6 etiquetas en el eje X para que no se solapen. */
  protected readonly xLabels = computed(() => {
    const c = this.coords();
    const every = Math.max(1, Math.ceil(c.length / 6));
    return c
      .filter((_, i) => i % every === 0 || i === c.length - 1)
      .map((p) => ({ x: p.x, text: p.label }));
  });
}
