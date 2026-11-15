/**
 * Biblioteca de movimientos: cada ejercicio es una función del tiempo
 * normalizado t ∈ [0, 1) que devuelve la pose del esqueleto.
 */
import {
  Pose,
  Prop,
  add,
  keyframes,
  lerp,
  lerpV,
  rep,
  shoulderOf,
  torsoAngle,
  v,
} from './skeleton';

export interface Motion {
  id: string;
  label: string;
  /** Duración de un ciclo en segundos. */
  seconds: number;
  /** Punto de enfoque técnico que se muestra junto a la animación. */
  cue: string;
  pose(t: number): Pose;
}

const GROUND: Prop = { kind: 'ground' };
const plate = (at: { x: number; y: number }, r = 8): Prop => ({ kind: 'plate', at, r });

/** Brazos colgando rectos desde el hombro. */
const hangingHands = (hip: { x: number; y: number }, torso: number, dx = 1) => {
  const s = shoulderOf(hip, torso);
  return v(s.x + dx, s.y - 30.5);
};

const squat: Motion = {
  id: 'squat',
  label: 'Sentadilla',
  seconds: 2.6,
  cue: 'Rodillas en la línea de los pies, espalda neutra, bajar por debajo del paralelo.',
  pose(t) {
    const k = rep(t);
    const hip = v(lerp(-3, -16, k), lerp(46, 26, k));
    const torso = lerp(6, 44, k);
    const s = shoulderOf(hip, torso);
    const hand = add(s, v(-6, 1));
    return {
      hip,
      torso,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(4, 0), v(2, 0)],
      elbows: [1, 1],
      props: [GROUND, plate(add(s, v(-3, 1)), 9)],
    };
  },
};

const deadlift: Motion = {
  id: 'deadlift',
  label: 'Peso muerto',
  seconds: 3,
  cue: 'La barra pegada a las piernas; empuja el suelo y extiende cadera y rodilla a la vez.',
  pose(t) {
    const k = rep(t);
    const hip = lerpV(v(-1, 46), v(-14, 27), k);
    const torso = lerp(2, 64, k);
    const hand = hangingHands(hip, torso, 1);
    return {
      hip,
      torso,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(3, 0), v(1, 0)],
      props: [GROUND, plate(v(hand.x, Math.max(hand.y, 9)), 9)],
    };
  },
};

const bench: Motion = {
  id: 'bench',
  label: 'Press banca',
  seconds: 2.4,
  cue: 'Escápulas juntas, la barra baja al pecho y sube en línea recta.',
  pose(t) {
    const k = rep(t);
    const hand = v(-19, lerp(54, 31, k));
    return {
      hip: v(8, 23),
      torso: -90,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(22, 0), v(25, 0)],
      elbows: [-1, -1],
      knees: [1, 1],
      props: [
        GROUND,
        { kind: 'rect', x: -38, y: 15, w: 52, h: 4 },
        { kind: 'line', from: v(-30, 0), to: v(-30, 15), weight: 3 },
        { kind: 'line', from: v(6, 0), to: v(6, 15), weight: 3 },
        plate(hand, 9),
      ],
    };
  },
};

const overheadPress: Motion = {
  id: 'press',
  label: 'Press militar',
  seconds: 2.4,
  cue: 'Glúteos y abdomen firmes; la cabeza "atraviesa" la barra al final.',
  pose(t) {
    const k = rep(t);
    const hip = v(-1, 46);
    const s = shoulderOf(hip, 0);
    const hand = v(lerp(s.x + 7, s.x + 2, k), lerp(s.y + 3, s.y + 30, k));
    return {
      hip,
      torso: 0,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(2, 0), v(0, 0)],
      elbows: [-1, -1],
      props: [GROUND, plate(hand, 8)],
    };
  },
};

const PULL_BAR: Prop[] = [
  { kind: 'line', from: v(-24, 110), to: v(24, 110), weight: 3 },
  { kind: 'line', from: v(-24, 110), to: v(-24, 118), weight: 3 },
  { kind: 'line', from: v(24, 110), to: v(24, 118), weight: 3 },
];

const pullUp: Motion = {
  id: 'pullup',
  label: 'Dominadas',
  seconds: 2.8,
  cue: 'Desde brazos extendidos hasta superar la barra con la barbilla, sin balanceo.',
  pose(t) {
    const k = rep(t);
    const hip = v(-1, lerp(47, 71, k));
    return {
      hip,
      torso: lerp(0, -4, k),
      hands: [v(3, 110), v(2, 110)],
      feet: [add(hip, v(-7, -42)), add(hip, v(-5, -43))],
      elbows: [1, 1],
      knees: [-1, -1],
      props: PULL_BAR,
    };
  },
};

const barHang: Motion = {
  id: 'hang',
  label: 'Suspensión en barra',
  seconds: 2,
  cue: 'Barbilla por encima de la barra, sin apoyarla; aguanta sin balancearte.',
  pose(t) {
    const tremor = Math.sin(t * Math.PI * 16) * 0.35;
    const hip = v(-1 + tremor, 71);
    return {
      hip,
      torso: -4,
      hands: [v(3, 110), v(2, 110)],
      feet: [add(hip, v(-7, -42)), add(hip, v(-5, -43))],
      elbows: [1, 1],
      knees: [-1, -1],
      props: PULL_BAR,
    };
  },
};

const plank: Motion = {
  id: 'plank',
  label: 'Plancha',
  seconds: 3,
  cue: 'Línea recta de talones a cabeza; aprieta glúteos y abdomen.',
  pose(t) {
    const breath = Math.sin(t * Math.PI * 2) * 0.6;
    const hip = v(6, 15 + breath);
    return {
      hip,
      torso: -76,
      hands: [v(-35, 1.5), v(-36, 1.5)],
      feet: [v(49, 0), v(50, 0)],
      elbows: [1, 1],
      knees: [-1, -1],
      props: [GROUND],
    };
  },
};

const lunge: Motion = {
  id: 'lunge',
  label: 'Zancadas',
  seconds: 2.6,
  cue: 'Paso largo, tronco erguido; la rodilla de atrás casi roza el suelo.',
  pose(t) {
    const k = rep(t);
    const hip = v(-1, lerp(45, 28, k));
    const hand = hangingHands(hip, 3, 0);
    return {
      hip,
      torso: 3,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(15, 0), v(-17, lerp(0, 2, k))],
      knees: [1, 1],
      props: [GROUND, plate(hand, 4), plate(add(hand, v(-1, 0)), 4)],
    };
  },
};

// ---------- Carrera: zancada con fase de vuelo ----------

interface Gait {
  lean: number; // inclinación del tronco
  stride: number; // media zancada
  kick: number; // altura del talón en el recobro
  arm: number; // amplitud del braceo
  bounce: number; // oscilación vertical de la cadera
}

/** Pie en el ciclo de carrera: apoyo (empuja hacia atrás) y recobro (talón alto y rodilla al frente). */
function footInGait(p: number, g: Gait) {
  const u = ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (u < Math.PI) return v(g.stride * Math.cos(u), 0);
  const k = (u - Math.PI) / Math.PI;
  return v(-g.stride * Math.cos(Math.PI * k), g.kick * Math.sin(Math.PI * k) * (1.3 - 0.6 * k));
}

function gait(phi: number, g: Gait): Pose {
  const hip = v(0, 44 + g.bounce * Math.cos(2 * phi));
  const s = shoulderOf(hip, g.lean);
  const near = footInGait(phi, g);
  const far = footInGait(phi + Math.PI, g);
  // Cada brazo acompaña a la pierna contraria.
  const hand = (foot: { x: number; y: number }) => {
    const swing = foot.x / g.stride;
    return add(s, v(-swing * g.arm + 4, -17 + 3 * Math.abs(swing)));
  };
  return {
    hip,
    torso: g.lean,
    hands: [hand(near), hand(far)],
    feet: [near, far],
    elbows: [-1, -1],
    knees: [1, 1],
  };
}

/** Desplazamiento periódico del decorado (para que el bucle encaje). */
const scroll = (x: number, offset: number, period: number) =>
  ((((x - offset) % period) + period) % period) - period / 2;

const ENDURANCE: Gait = { lean: 7, stride: 13, kick: 15, arm: 8, bounce: 1.6 };
const RUN_STRIDES = 3; // zancadas completas por bucle

const run: Motion = {
  id: 'run',
  label: 'Carrera 1000 m',
  seconds: 2.25,
  cue: 'Ritmo constante, tronco erguido, braceo relajado a 90° y apoyo bajo la cadera.',
  pose(t) {
    const phi = 2 * Math.PI * RUN_STRIDES * t;
    // El suelo avanza lo mismo que barre el pie en apoyo: 4 medias zancadas por ciclo.
    const travel = 4 * ENDURANCE.stride * RUN_STRIDES * t;
    const lane: Prop[] = [-3, -2, -1, 0, 1, 2, 3].map((i) => {
      const x = scroll(i * 26, travel, 182);
      return { kind: 'line', from: v(x, -3), to: v(x + 10, -3), weight: 1.5, light: true };
    });
    return {
      ...gait(phi, ENDURANCE),
      props: [
        { kind: 'rect', x: -62, y: -6, w: 124, h: 6 }, // pista de tartán
        ...lane,
        { kind: 'marker', at: v(scroll(40, travel, 156), 0) }, // poste de distancia
      ],
    };
  },
};

// ---------- Circuito de agilidad: salida tumbado, valla, slalom ----------

const SPRINT: Gait = { lean: 18, stride: 16, kick: 20, arm: 13, bounce: 1.2 };
const SPRINT_STRIDES = 7;
const SPEED = 4 * SPRINT.stride * SPRINT_STRIDES; // avance del decorado por unidad de t

const PRONE: Pose = {
  hip: v(-8, 6),
  torso: 82,
  hands: [v(23, 0), v(22, 0)],
  feet: [v(-52, 0), v(-50, 0)],
  elbows: [1, 1],
  knees: [-1, -1],
};
const PUSH: Pose = {
  hip: v(-6, 17),
  torso: 70,
  hands: [v(21, 0), v(20, 0)],
  feet: [v(-46, 0), v(-44, 0)],
  elbows: [1, 1],
  knees: [-1, -1],
};
const CROUCH: Pose = {
  hip: v(-7, 22),
  torso: 42,
  hands: [v(14, 0), v(13, 0)],
  feet: [v(1, 0), v(-3, 0)],
};
const UPRIGHT: Pose = {
  hip: v(-1, 46),
  torso: 4,
  hands: [v(2, 43), v(0, 43)],
  feet: [v(2, 0), v(0, 0)],
};

/** Distancia recorrida en el instante t (arranque, crucero y frenada). */
function travelled(t: number): number {
  const a0 = 0.12;
  const a1 = 0.24;
  const d0 = 0.9;
  const d1 = 0.95;
  const accel = (SPEED * (a1 - a0)) / 2;
  if (t <= a0) return 0;
  if (t <= a1) return (SPEED * (t - a0) ** 2) / (2 * (a1 - a0));
  if (t <= d0) return accel + SPEED * (t - a1);
  const cruise = accel + SPEED * (d0 - a1);
  const dt = Math.min(t, d1) - d0;
  return cruise + SPEED * (dt - dt ** 2 / (2 * (d1 - d0)));
}

const HURDLE_AT = 0.46;
const CONES_AT = [0.62, 0.7, 0.78, 0.86];

const agility: Motion = {
  id: 'agility',
  label: 'Circuito de agilidad',
  seconds: 5.5,
  cue: 'Salida tumbado y explosiva, ataque a la valla sin frenar y pasos cortos en cada cono.',
  pose(t) {
    const phi = 2 * Math.PI * SPRINT_STRIDES * t;
    const w = travelled(t);
    let pose: Pose;

    if (t < 0.12) {
      // Tumbado boca abajo tras la línea de salida, esperando la señal.
      pose = { ...PRONE, hip: v(-8, 6 + 0.4 * Math.sin(t * 60)) };
    } else if (t < 0.24) {
      pose = keyframes(
        [
          { at: 0, pose: PRONE },
          { at: 0.3, pose: PUSH },
          { at: 0.65, pose: CROUCH },
          { at: 1, pose: gait(2 * Math.PI * SPRINT_STRIDES * 0.24, SPRINT) },
        ],
        (t - 0.12) / 0.12,
      );
    } else if (t < 0.9) {
      pose = gait(phi, SPRINT);
      // Salto de valla: pierna de ataque extendida y pierna de impulso recogida.
      const hk = (t - (HURDLE_AT - 0.06)) / 0.12;
      if (hk > 0 && hk < 1) {
        const lift = Math.sin(Math.PI * hk);
        const hip = v(0, 44 + 20 * lift);
        const s = shoulderOf(hip, 32);
        const clear: Pose = {
          hip,
          torso: 32,
          hands: [add(s, v(-14, -16)), add(s, v(26, -8))],
          feet: [add(hip, v(42, -12)), add(hip, v(-20, -12))],
          elbows: [-1, -1],
          knees: [1, 1],
        };
        pose = {
          ...pose,
          ...keyframes(
            [
              { at: 0, pose },
              { at: 0.5, pose: clear },
              { at: 1, pose },
            ],
            hk,
          ),
        };
      }
      // Cambio de dirección en cada cono: cadera más baja y tronco más inclinado.
      for (const c of CONES_AT) {
        const ck = 1 - Math.abs(t - c) / 0.03;
        if (ck > 0) {
          const dip = Math.sin((Math.PI / 2) * ck);
          pose = { ...pose, hip: v(pose.hip.x, pose.hip.y - 5 * dip), torso: pose.torso + 8 * dip };
        }
      }
    } else {
      pose = keyframes(
        [
          { at: 0, pose: gait(2 * Math.PI * SPRINT_STRIDES * 0.9, SPRINT) },
          { at: 0.35, pose: UPRIGHT },
          { at: 0.65, pose: CROUCH },
          { at: 1, pose: PRONE },
        ],
        (t - 0.9) / 0.1,
      );
    }

    // Decorado: línea de salida, valla y conos, a su posición según lo recorrido.
    const at = (when: number, dx = 0) => travelled(when) - w + dx;
    const hurdleX = at(HURDLE_AT, 4);
    const props: Prop[] = [
      { kind: 'ground' },
      { kind: 'line', from: v(at(0, 34), 0), to: v(at(0, 34), 4), weight: 4 },
      { kind: 'line', from: v(hurdleX, 0), to: v(hurdleX, 40), weight: 3 },
      { kind: 'line', from: v(hurdleX - 9, 0), to: v(hurdleX + 5, 0), weight: 3 },
      { kind: 'rect', x: hurdleX - 3, y: 34, w: 6, h: 8, front: true },
      ...CONES_AT.map((c, i): Prop => ({ kind: 'cone', at: v(at(c, 2), 0), front: i % 2 === 0 })),
    ];
    return { ...pose, props };
  },
};

const dips: Motion = {
  id: 'dips',
  label: 'Fondos en paralelas',
  seconds: 2.6,
  cue: 'Baja hasta 90° de codo con el tronco algo inclinado y sube sin bloquear.',
  pose(t) {
    const k = rep(t);
    const hip = v(-3, lerp(62, 46, k));
    return {
      hip,
      torso: lerp(8, 20, k),
      hands: [v(1, 60), v(0, 60)],
      feet: [add(hip, v(-16, -32)), add(hip, v(-14, -33))],
      elbows: [-1, -1],
      knees: [-1, -1],
      props: [
        GROUND,
        { kind: 'line', from: v(-14, 58), to: v(18, 58), weight: 3 },
        { kind: 'line', from: v(-12, 0), to: v(-12, 58), weight: 3 },
        { kind: 'line', from: v(16, 0), to: v(16, 58), weight: 3 },
      ],
    };
  },
};

const row: Motion = {
  id: 'row',
  label: 'Remo',
  seconds: 2.4,
  cue: 'Espalda fija a unos 45°; lleva la barra al ombligo juntando escápulas.',
  pose(t) {
    const k = rep(t);
    const hip = v(-13, 34);
    const torso = 58;
    const s = shoulderOf(hip, torso);
    const hand = lerpV(v(s.x + 1, s.y - 30), v(s.x - 9, s.y - 12), k);
    return {
      hip,
      torso,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(3, 0), v(1, 0)],
      elbows: [-1, -1],
      props: [GROUND, plate(hand, 8)],
    };
  },
};

const hipThrust: Motion = {
  id: 'hipthrust',
  label: 'Hip thrust',
  seconds: 2.6,
  cue: 'Escápulas en el banco, empuja con los talones y bloquea glúteos arriba.',
  pose(t) {
    const k = rep(t);
    const shoulder = v(-24, 24);
    const hip = v(lerp(-2, 2, k), lerp(12, 26, k));
    return {
      hip,
      torso: torsoAngle(hip, shoulder),
      hands: [add(hip, v(1, 4)), add(hip, v(0, 4))],
      feet: [v(18, 0), v(20, 0)],
      elbows: [1, 1],
      knees: [1, 1],
      props: [GROUND, { kind: 'rect', x: -44, y: 16, w: 18, h: 6 }, plate(add(hip, v(1, 6)), 8)],
    };
  },
};

const curl: Motion = {
  id: 'curl',
  label: 'Curl de bíceps',
  seconds: 2.2,
  cue: 'Codos pegados al cuerpo; sube y baja controlando, sin balanceo.',
  pose(t) {
    const k = rep(t);
    const hip = v(-1, 46);
    const s = shoulderOf(hip, 0);
    const hand = lerpV(v(s.x + 1, s.y - 30), v(s.x + 7, s.y - 6), k);
    return {
      hip,
      torso: 0,
      hands: [hand, add(hand, v(-1, 0))],
      feet: [v(2, 0), v(0, 0)],
      elbows: [-1, -1],
      props: [GROUND, plate(hand, 4)],
    };
  },
};

const erg: Motion = {
  id: 'erg',
  label: 'Remoergómetro',
  seconds: 2.2,
  cue: 'Piernas, tronco y brazos al tirar; brazos, tronco y piernas al volver.',
  pose(t) {
    // Tirón rápido (40 % del ciclo) y recuperación lenta.
    const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
    const legs = Math.min(1, k / 0.6);
    const arms = Math.max(0, (k - 0.55) / 0.45);
    const hip = v(lerp(10, -16, legs), 9);
    const torso = lerp(28, -18, Math.min(1, k / 0.8));
    const s = shoulderOf(hip, torso);
    const handle = v(lerp(s.x + 22, s.x + 9, arms) + (1 - k) * 4, s.y - 8);
    return {
      hip,
      torso,
      hands: [handle, add(handle, v(-1, 0))],
      feet: [v(36, 8), v(35, 8)],
      elbows: [-1, -1],
      knees: [1, 1],
      props: [
        GROUND,
        { kind: 'line', from: v(-34, 4), to: v(40, 4), weight: 3 },
        { kind: 'rect', x: hip.x - 8, y: 4, w: 16, h: 3 },
        { kind: 'line', from: v(40, 4), to: v(40, 20), weight: 3 },
        { kind: 'plate', at: v(44, 18), r: 7 },
      ],
    };
  },
};

const STAND: Pose = {
  hip: v(-1, 46),
  torso: 0,
  hands: [v(0, 44), v(-1, 44)],
  feet: [v(2, 0), v(0, 0)],
};

const burpee: Motion = {
  id: 'burpee',
  label: 'Burpee',
  seconds: 2.4,
  cue: 'Manos al suelo, pies atrás, pecho al suelo, recoge y salta con palmada arriba.',
  pose(t) {
    const crouch: Pose = {
      hip: v(-8, 22),
      torso: 38,
      hands: [v(14, 0), v(13, 0)],
      feet: [v(2, 0), v(0, 0)],
    };
    const plankPose: Pose = {
      hip: v(6, 20),
      torso: -70,
      hands: [v(-20, 0), v(-21, 0)],
      feet: [v(49, 0), v(50, 0)],
      knees: [-1, -1],
    };
    const jump: Pose = {
      hip: v(-1, 58),
      torso: 0,
      hands: [v(1, 116), v(0, 116)],
      feet: [v(1, 10), v(-1, 10)],
    };
    return {
      ...keyframes(
        [
          { at: 0, pose: STAND },
          { at: 0.18, pose: crouch },
          { at: 0.36, pose: plankPose },
          { at: 0.5, pose: plankPose },
          { at: 0.66, pose: crouch },
          { at: 0.82, pose: jump },
          { at: 1, pose: STAND },
        ],
        t,
      ),
      props: [GROUND],
    };
  },
};

export const MOTIONS: Record<string, Motion> = Object.fromEntries(
  [
    squat,
    deadlift,
    bench,
    overheadPress,
    pullUp,
    barHang,
    plank,
    lunge,
    run,
    agility,
    dips,
    row,
    hipThrust,
    curl,
    burpee,
    erg,
  ].map((m) => [m.id, m]),
);

/** Palabras clave del nombre del ejercicio → movimiento. El orden importa. */
const BY_NAME: [RegExp, string][] = [
  [/suspensi[oó]n/i, 'hang'],
  [/dominad/i, 'pullup'],
  [/peso muerto/i, 'deadlift'],
  [/sentadilla|prensa/i, 'squat'],
  [/banca/i, 'bench'],
  [/militar|elevaciones|hombro/i, 'press'],
  [/plancha|rueda/i, 'plank'],
  [/zancad/i, 'lunge'],
  [/circuito|agilidad/i, 'agility'],
  [/erg[oó]metro/i, 'erg'],
  [/carrera|series|1000|200 m|sprint/i, 'run'],
  [/fondos/i, 'dips'],
  [/remo con|remo$/i, 'row'],
  [/hip thrust|puente/i, 'hipthrust'],
  [/curl|b[ií]ceps|tr[ií]ceps/i, 'curl'],
  [/burpee/i, 'burpee'],
];

const BY_GROUP: Record<string, string> = {
  piernas: 'squat',
  pecho: 'bench',
  espalda: 'row',
  hombros: 'press',
  brazos: 'curl',
  core: 'plank',
  cardio: 'run',
  'cuerpo completo': 'burpee',
};

/** Elige la animación más adecuada para un ejercicio del catálogo. */
export function motionFor(name: string, muscleGroup?: string): Motion | null {
  const byName = BY_NAME.find(([re]) => re.test(name));
  const id = byName?.[1] ?? (muscleGroup ? BY_GROUP[muscleGroup] : undefined);
  return id ? MOTIONS[id] : null;
}

/** Fase más representativa de cada movimiento para imágenes estáticas (PDF, miniaturas). */
const KEY_FRAMES: Record<string, number> = { run: 0.17, agility: 0.46, burpee: 0.84, erg: 0.38 };

export function keyFrame(m: Motion): number {
  return KEY_FRAMES[m.id] ?? 0.5;
}
