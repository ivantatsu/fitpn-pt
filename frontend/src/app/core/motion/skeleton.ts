/**
 * Motor de pictogramas: esqueleto 2D visto de perfil con cinemática inversa
 * (dos huesos) para brazos y piernas. Las coordenadas son de "mundo": el suelo
 * está en y = 0, el eje y crece hacia arriba y la figura mira hacia +x.
 */

export interface Vec {
  x: number;
  y: number;
}

/** Material de la escena. `front` lo dibuja delante de la figura; `light` en tono claro. */
export type Prop = { front?: boolean; light?: boolean } & (
  | { kind: 'ground' }
  | { kind: 'line'; from: Vec; to: Vec; weight?: number }
  | { kind: 'plate'; at: Vec; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'cone'; at: Vec }
  | { kind: 'marker'; at: Vec }
);

/** Forma SVG lista para pintar (coordenadas ya invertidas en y). */
export interface Shape {
  d: string;
  style: 'ground' | 'stroke' | 'fill' | 'light-stroke' | 'light-fill';
  width?: number;
  front: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Convierte el material de la escena en trazados SVG. */
export function propShapes(props: Prop[]): Shape[] {
  const out: Shape[] = [];
  for (const p of props) {
    const front = !!p.front;
    const stroke = p.light ? 'light-stroke' : 'stroke';
    const fill = p.light ? 'light-fill' : 'fill';
    switch (p.kind) {
      case 'ground':
        out.push({ d: 'M-62,0H62', style: 'ground', front });
        break;
      case 'line':
        out.push({
          d: `M${r1(p.from.x)},${r1(-p.from.y)}L${r1(p.to.x)},${r1(-p.to.y)}`,
          style: stroke,
          width: p.weight ?? 3,
          front,
        });
        break;
      case 'plate': {
        const { x, y } = p.at;
        out.push({
          d: `M${r1(x - p.r)},${r1(-y)}a${p.r},${p.r} 0 1,0 ${2 * p.r},0a${p.r},${p.r} 0 1,0 ${-2 * p.r},0`,
          style: fill,
          front,
        });
        break;
      }
      case 'rect':
        out.push({
          d: `M${r1(p.x)},${r1(-(p.y + p.h))}h${r1(p.w)}v${r1(p.h)}h${r1(-p.w)}Z`,
          style: fill,
          front,
        });
        break;
      case 'cone': {
        const { x, y } = p.at;
        out.push({
          d: `M${r1(x - 5)},${r1(-y)}L${r1(x)},${r1(-y - 15)}L${r1(x + 5)},${r1(-y)}Z`,
          style: fill,
          front,
        });
        break;
      }
      case 'marker': {
        const { x, y } = p.at;
        out.push({ d: `M${r1(x)},${r1(-y)}V${r1(-y - 30)}`, style: stroke, width: 2, front });
        out.push({
          d: `M${r1(x)},${r1(-y - 30)}h11v8h-11Z`,
          style: fill,
          front,
        });
        break;
      }
    }
  }
  return out;
}

export interface Pose {
  hip: Vec;
  /** Inclinación del tronco en grados respecto a la vertical (+ hacia delante). */
  torso: number;
  /** Objetivos de las manos y los pies: [cercano, lejano]. */
  hands: [Vec, Vec];
  feet: [Vec, Vec];
  /** Sentido de flexión (+1 / -1) de codos y rodillas: [cercano, lejano]. */
  elbows?: [number, number];
  knees?: [number, number];
  props?: Prop[];
}

export const BONES = {
  thigh: 23,
  shin: 23,
  torso: 28,
  neck: 3,
  head: 6.5,
  upperArm: 16,
  forearm: 15,
} as const;

const RAD = Math.PI / 180;

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

/** Hombro a partir de la cadera y la inclinación del tronco. */
export function shoulderOf(hip: Vec, torso: number): Vec {
  return {
    x: hip.x + BONES.torso * Math.sin(torso * RAD),
    y: hip.y + BONES.torso * Math.cos(torso * RAD),
  };
}

/** Inclinación que lleva el hombro desde `hip` hasta `shoulder`. */
export function torsoAngle(hip: Vec, shoulder: Vec): number {
  return Math.atan2(shoulder.x - hip.x, shoulder.y - hip.y) / RAD;
}

/** Cinemática inversa de dos huesos: devuelve la articulación intermedia y el extremo alcanzado. */
export function solveLimb(root: Vec, target: Vec, a: number, b: number, bend: number) {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy);
  const d = Math.min(Math.max(dist, Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const offset = Math.acos(Math.max(-1, Math.min(1, cos)));
  const angle = base + Math.sign(bend || 1) * offset;
  const joint = { x: root.x + a * Math.cos(angle), y: root.y + a * Math.sin(angle) };
  const end = { x: root.x + (dx / (dist || 1)) * d, y: root.y + (dy / (dist || 1)) * d };
  return { joint, end };
}

export interface Rig {
  head: Vec;
  neck: Vec;
  shoulder: Vec;
  hip: Vec;
  arms: { elbow: Vec; hand: Vec }[];
  legs: { knee: Vec; foot: Vec }[];
  props: Prop[];
}

export function rig(p: Pose): Rig {
  const shoulder = shoulderOf(p.hip, p.torso);
  const dir = { x: Math.sin(p.torso * RAD), y: Math.cos(p.torso * RAD) };
  const neck = add(shoulder, { x: dir.x * BONES.neck, y: dir.y * BONES.neck });
  const head = add(neck, { x: dir.x * BONES.head, y: dir.y * BONES.head });
  const elbows = p.elbows ?? [-1, -1];
  const knees = p.knees ?? [1, 1];
  return {
    head,
    neck,
    shoulder,
    hip: p.hip,
    arms: [0, 1].map((i) => {
      const s = solveLimb(shoulder, p.hands[i], BONES.upperArm, BONES.forearm, elbows[i]);
      return { elbow: s.joint, hand: s.end };
    }),
    legs: [0, 1].map((i) => {
      const s = solveLimb(p.hip, p.feet[i], BONES.thigh, BONES.shin, knees[i]);
      return { knee: s.joint, foot: s.end };
    }),
    props: p.props ?? [],
  };
}

// ---------- Utilidades de animación ----------

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerpV = (a: Vec, b: Vec, k: number): Vec => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
});
/** Suavizado seno (0→1). */
export const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, k)));
/** Ida y vuelta suavizada: 0 → 1 → 0 a lo largo del ciclo. */
export const wave = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
/** Como `wave` pero con pausas en los extremos (más natural para repeticiones). */
export const rep = (t: number) => ease(Math.min(1, Math.max(0, (wave(t) - 0.08) / 0.84)));

/** Interpola dos poses completas. */
export function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    hip: lerpV(a.hip, b.hip, k),
    torso: lerp(a.torso, b.torso, k),
    hands: [lerpV(a.hands[0], b.hands[0], k), lerpV(a.hands[1], b.hands[1], k)],
    feet: [lerpV(a.feet[0], b.feet[0], k), lerpV(a.feet[1], b.feet[1], k)],
    elbows: k < 0.5 ? a.elbows : b.elbows,
    knees: k < 0.5 ? a.knees : b.knees,
    props: a.props,
  };
}

/** Animación por fotogramas clave (`at` en [0, 1], el último debe ser 1). */
export function keyframes(frames: { at: number; pose: Pose }[], t: number): Pose {
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i].at) {
      const prev = frames[i - 1];
      const k = (t - prev.at) / (frames[i].at - prev.at || 1);
      return blend(prev.pose, frames[i].pose, ease(k));
    }
  }
  return frames[frames.length - 1].pose;
}
