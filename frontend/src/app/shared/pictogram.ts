import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MOTIONS, Motion, motionFor } from '../core/motion/library';
import { Vec, propShapes, rig } from '../core/motion/skeleton';

/** Fotogramas por segundo de la animación (suficiente para un pictograma). */
const FPS = 30;

/**
 * Pictograma animado de un ejercicio, al estilo de la señalética deportiva.
 * Solo se anima mientras está visible y respeta `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-pictogram',
  template: `
    @if (motion(); as m) {
      <svg
        viewBox="-62 -126 124 136"
        role="img"
        [attr.aria-label]="'Animación: ' + m.label"
        [attr.width]="size()"
        [attr.height]="size()"
      >
        @for (sh of back(); track $index) {
          <path [attr.d]="sh.d" [attr.class]="sh.style" [attr.stroke-width]="sh.width ?? null" />
        }
        <g class="far">
          <polyline [attr.points]="pts(frame().legs[1])" />
          <polyline [attr.points]="pts(frame().arms[1])" />
        </g>
        <line
          class="torso"
          [attr.x1]="frame().hip.x"
          [attr.y1]="-frame().hip.y"
          [attr.x2]="frame().neck.x"
          [attr.y2]="-frame().neck.y"
        />
        <circle [attr.cx]="frame().head.x" [attr.cy]="-frame().head.y" r="6.5" />
        <g class="halo">
          <polyline [attr.points]="pts(frame().legs[0])" />
          <polyline [attr.points]="pts(frame().arms[0])" />
        </g>
        <polyline [attr.points]="pts(frame().legs[0])" />
        <polyline [attr.points]="pts(frame().arms[0])" />
        @for (sh of front(); track $index) {
          <path [attr.d]="sh.d" [attr.class]="sh.style" [attr.stroke-width]="sh.width ?? null" />
        }
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      color: var(--ink);
      line-height: 0;
    }
    svg {
      overflow: hidden;
      max-width: 100%;
      height: auto;
    }
    polyline,
    .torso {
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 7;
    }
    .torso {
      stroke-width: 10;
    }
    circle {
      fill: currentColor;
    }
    .far {
      opacity: 0.38;
    }
    /* Halo del color del fondo: separa los miembros cercanos del tronco. */
    .halo polyline {
      stroke: var(--halo, var(--surface));
      stroke-width: 12;
    }
    .ground {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      opacity: 0.35;
    }
    .stroke {
      fill: none;
      stroke: var(--prop, currentColor);
      stroke-linecap: round;
    }
    .fill {
      fill: var(--prop, currentColor);
    }
    .light-stroke {
      fill: none;
      stroke: var(--prop-light, #fff);
      stroke-linecap: round;
    }
    .light-fill {
      fill: var(--prop-light, #fff);
    }
  `,
})
export class Pictogram {
  /** Id de movimiento (`squat`, `pullup`…) o nombre de ejercicio del catálogo. */
  readonly exercise = input.required<string>();
  readonly muscleGroup = input<string>();
  readonly size = input<number | string>(96);
  /** Fase inicial (0-1), útil para que varias figuras no vayan sincronizadas. */
  readonly phase = input(0.3);

  protected readonly motion = computed<Motion | null>(
    () => MOTIONS[this.exercise()] ?? motionFor(this.exercise(), this.muscleGroup()),
  );
  private readonly t = signal<number | null>(null);

  protected readonly frame = computed(() => {
    const m = this.motion()!;
    return rig(m.pose(this.t() ?? this.phase()));
  });

  private readonly shapes = computed(() => propShapes(this.frame().props));
  protected readonly back = computed(() => this.shapes().filter((p) => !p.front));
  protected readonly front = computed(() => this.shapes().filter((p) => p.front));

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') return;

      let visible = false;
      let raf = 0;
      let last = 0;
      const start = performance.now() - this.phase() * 1000 * (this.motion()?.seconds ?? 2);

      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (now - last < 1000 / FPS) return;
        last = now;
        const seconds = this.motion()?.seconds ?? 2;
        this.t.set((((now - start) / 1000) % seconds) / seconds);
      };
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) raf = requestAnimationFrame(tick);
      });
      observer.observe(host);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(raf);
      });
    });
  }

  protected pts(limb: { knee?: Vec; elbow?: Vec; foot?: Vec; hand?: Vec }): string {
    const f = this.frame();
    const root = 'knee' in limb ? f.hip : f.shoulder;
    const mid = (limb.knee ?? limb.elbow)!;
    const end = (limb.foot ?? limb.hand)!;
    return `${root.x},${-root.y} ${mid.x},${-mid.y} ${end.x},${-end.y}`;
  }
}
