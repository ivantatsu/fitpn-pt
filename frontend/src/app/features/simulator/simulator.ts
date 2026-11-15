import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api-error';
import { userBase } from '../../core/api/training.api';
import { toIsoDate } from '../../core/date';
import { NotificationService } from '../../core/notification.service';
import { TEST_DEFS, TestType, formatResult, parseResult, testDef } from '../../core/physical-tests';
import { Pictogram } from '../../shared/pictogram';

type Phase = 'ready' | 'countdown' | 'running' | 'done';

const MOTION: Record<TestType, string> = {
  agility_circuit: 'agility',
  pull_ups: 'pullup',
  bar_hang: 'hang',
  run_1000m: 'run',
};

/** Tramos de 200 m de la prueba de 1000 m. */
const RUN_SEGMENTS = 5;

/**
 * Modo simulacro: cronómetro a pantalla completa para las pruebas físicas,
 * con cuenta atrás sonora, vueltas y parciales objetivo en los 1000 m y
 * contador de repeticiones en dominadas. La marca se guarda en el historial.
 */
@Component({
  selector: 'app-simulator',
  imports: [FormsModule, RouterLink, Pictogram],
  templateUrl: './simulator.html',
  styleUrl: './simulator.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Simulator {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  protected readonly defs = TEST_DEFS;
  protected readonly test = signal<TestType>('run_1000m');
  protected readonly def = computed(() => testDef(this.test()));
  protected readonly motion = computed(() => MOTION[this.test()]);
  protected readonly isCounter = computed(() => this.test() === 'pull_ups');

  protected readonly phase = signal<Phase>('ready');
  protected readonly countdown = signal(3);
  protected readonly elapsed = signal(0); // ms
  protected readonly reps = signal(0);
  protected readonly laps = signal<number[]>([]); // ms acumulados
  protected readonly target = signal('3:40');
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  private startedAt = 0;
  private raf = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private audio?: AudioContext;
  private wakeLock: { release(): Promise<void> } | null = null;

  /** Marca final en la unidad de la prueba (segundos o repeticiones). */
  protected readonly result = computed(() =>
    this.isCounter() ? this.reps() : Math.round(this.elapsed() / 10) / 100,
  );

  protected readonly readout = computed(() => {
    if (this.isCounter()) return String(this.reps());
    const ms = this.elapsed();
    if (this.test() === 'run_1000m') {
      const total = ms / 1000;
      const min = Math.floor(total / 60);
      const sec = (total - min * 60).toFixed(1).padStart(4, '0').replace('.', ',');
      return `${min}:${sec}`;
    }
    return (ms / 1000).toFixed(this.test() === 'agility_circuit' ? 2 : 1).replace('.', ',');
  });

  protected readonly targetSeconds = computed(() => parseResult('run_1000m', this.target()));

  /** Tabla de parciales cada 200 m frente al objetivo. */
  protected readonly splits = computed(() => {
    const target = this.targetSeconds();
    const laps = this.laps();
    return Array.from({ length: RUN_SEGMENTS }, (_, i) => {
      const goal = target ? (target * (i + 1)) / RUN_SEGMENTS : null;
      const real = laps[i] !== undefined ? laps[i] / 1000 : null;
      return {
        distance: `${(i + 1) * 200} m`,
        goal: goal !== null ? formatResult('run_1000m', Math.round(goal * 10) / 10) : '—',
        real: real !== null ? formatResult('run_1000m', Math.round(real * 10) / 10) : '—',
        delta: goal !== null && real !== null ? Math.round((real - goal) * 10) / 10 : null,
      };
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopClock());
  }

  protected selectTest(type: TestType): void {
    if (this.phase() === 'running' || this.phase() === 'countdown') return;
    this.test.set(type);
    this.reset();
  }

  protected start(): void {
    if (this.phase() !== 'ready') return;
    this.saved.set(false);
    if (this.isCounter()) {
      this.phase.set('running');
      return;
    }
    this.phase.set('countdown');
    this.countdown.set(3);
    this.beep(660, 0.12);
    for (const [i, n] of [2, 1].entries()) {
      this.timers.push(
        setTimeout(
          () => {
            this.countdown.set(n);
            this.beep(660, 0.12);
          },
          (i + 1) * 1000,
        ),
      );
    }
    this.timers.push(setTimeout(() => this.go(), 3000));
  }

  private go(): void {
    this.beep(1046, 0.35);
    this.vibrate(120);
    this.phase.set('running');
    this.startedAt = performance.now();
    void this.keepAwake();
    const tick = () => {
      this.elapsed.set(performance.now() - this.startedAt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  protected stop(): void {
    if (this.phase() === 'countdown') {
      this.reset();
      return;
    }
    if (this.phase() !== 'running') return;
    if (!this.isCounter()) {
      this.elapsed.set(performance.now() - this.startedAt);
      if (this.test() === 'run_1000m' && this.laps().length < RUN_SEGMENTS) {
        this.laps.update((l) => [...l, this.elapsed()]);
      }
    }
    this.stopClock();
    this.beep(440, 0.25);
    this.vibrate(200);
    this.phase.set('done');
  }

  protected lap(): void {
    if (this.phase() !== 'running' || this.test() !== 'run_1000m') return;
    const now = performance.now() - this.startedAt;
    this.laps.update((l) => [...l, now]);
    this.beep(880, 0.08);
    this.vibrate(60);
    if (this.laps().length >= RUN_SEGMENTS) this.stop();
  }

  protected addRep(delta: number): void {
    if (this.phase() !== 'running') return;
    this.reps.update((r) => Math.max(0, r + delta));
    if (delta > 0) this.vibrate(30);
  }

  protected reset(): void {
    this.stopClock();
    this.phase.set('ready');
    this.elapsed.set(0);
    this.reps.set(0);
    this.laps.set([]);
    this.notes.set('');
    this.saved.set(false);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${userBase()}/tests`, {
          testType: this.test(),
          result: this.result(),
          performedOn: toIsoDate(),
          notes: this.notes().trim() || 'Simulacro cronometrado',
        }),
      );
      this.saved.set(true);
      this.notify.success(`Marca guardada: ${formatResult(this.test(), this.result())}`);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Espacio: empezar/parar (o +1 en dominadas). V: vuelta. */
  protected onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.phase() === 'ready') this.start();
      else if (this.phase() === 'running') {
        if (this.isCounter()) this.addRep(1);
        else this.stop();
      } else if (this.phase() === 'countdown') this.stop();
    } else if (e.key.toLowerCase() === 'v') {
      this.lap();
    }
  }

  protected deltaText(d: number): string {
    return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1).replace('.', ',')} s`;
  }

  private stopClock(): void {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    this.timers = [];
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  private beep(freq: number, seconds: number): void {
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.08, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + seconds);
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + seconds);
    } catch {
      /* sin audio disponible */
    }
  }

  private vibrate(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* no disponible */
    }
  }

  private async keepAwake(): Promise<void> {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
      };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      /* la pantalla podría apagarse: no es crítico */
    }
  }
}
