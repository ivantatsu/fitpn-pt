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
import { Vec, rig } from '../core/motion/skeleton';

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
        @for (p of frame().props; track $index) {
          @switch (p.kind) {
            @case ('ground') {
              <line class="ground" x1="-62" y1="0" x2="62" y2="0" />
            }
            @case ('line') {
              <line
                class="prop"
                [attr.x1]="p.from.x"
                [attr.y1]="-p.from.y"
                [attr.x2]="p.to.x"
                [attr.y2]="-p.to.y"
                [attr.stroke-width]="p.weight ?? 3"
              />
            }
            @case ('plate') {
              <circle class="plate" [attr.cx]="p.at.x" [attr.cy]="-p.at.y" [attr.r]="p.r" />
            }
            @case ('rect') {
              <rect
                class="prop-fill"
                [attr.x]="p.x"
                [attr.y]="-(p.y + p.h)"
                [attr.width]="p.w"
                [attr.height]="p.h"
              />
            }
            @case ('cone') {
              <path
                class="prop-fill"
                [attr.d]="'M' + (p.at.x - 5) + ',0 L' + p.at.x + ',-14 L' + (p.at.x + 5) + ',0 Z'"
              />
            }
          }
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
      overflow: visible;
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
      stroke: currentColor;
      stroke-width: 1.5;
      opacity: 0.35;
    }
    .prop {
      stroke: var(--prop, currentColor);
      stroke-linecap: round;
    }
    .plate {
      fill: var(--prop, currentColor);
    }
    .prop-fill {
      fill: var(--prop, currentColor);
      opacity: 0.85;
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
