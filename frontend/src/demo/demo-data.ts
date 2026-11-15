/**
 * Datos de ejemplo del modo demostración. Las fechas son relativas a hoy para que
 * la demo siempre parezca actual. Nada de esto se incluye en el build normal.
 */
import { Exercise, Measurement, Plan, Renewal, Role, WorkoutExercise } from '../app/core/models';
import { TestResult, TestType } from '../app/core/physical-tests';

export interface DemoUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  activeUntil: string | null;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  password: string;
}

export interface DemoWorkout {
  id: number;
  userId: number;
  performedOn: string;
  title: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  notes: string;
  createdAt: string;
  exercises: WorkoutExercise[];
}

export interface DemoDb {
  seq: number;
  sessionUserId: number | null;
  users: DemoUser[];
  exercises: Exercise[];
  workouts: DemoWorkout[];
  measurements: (Measurement & { userId: number })[];
  plans: Plan[];
  tests: (TestResult & { userId: number })[];
  renewals: (Renewal & { userId: number })[];
}

export const DEMO_PASSWORD = 'demo1234';

const DAY = 86_400_000;

export function isoDay(daysFromToday: number): string {
  const d = new Date(Date.now() + daysFromToday * DAY);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const isoTime = (daysFromToday: number) => new Date(Date.now() + daysFromToday * DAY).toISOString();

const EXERCISES: [string, string, string, string][] = [
  ['Sentadilla trasera', 'piernas', 'barra', 'Sentadilla con barra apoyada en trapecios.'],
  ['Peso muerto', 'espalda', 'barra', 'Levantamiento desde el suelo con espalda neutra.'],
  ['Press banca', 'pecho', 'barra', 'Press horizontal tumbado en banco plano.'],
  ['Press militar', 'hombros', 'barra', 'Press vertical de pie por encima de la cabeza.'],
  ['Remo con barra', 'espalda', 'barra', 'Remo inclinado con barra hacia el abdomen.'],
  ['Dominadas', 'espalda', 'peso corporal', 'Tracción vertical en barra fija.'],
  ['Fondos en paralelas', 'pecho', 'peso corporal', 'Empuje vertical en paralelas.'],
  ['Zancadas', 'piernas', 'mancuernas', 'Zancada alterna con mancuernas.'],
  ['Hip thrust', 'piernas', 'barra', 'Extensión de cadera con espalda apoyada en banco.'],
  ['Prensa de piernas', 'piernas', 'máquina', 'Empuje de piernas en máquina de prensa.'],
  ['Curl de bíceps', 'brazos', 'mancuernas', 'Flexión de codo con mancuernas.'],
  ['Extensión de tríceps', 'brazos', 'polea', 'Extensión de codo en polea alta.'],
  ['Elevaciones laterales', 'hombros', 'mancuernas', 'Abducción de hombro con mancuernas.'],
  ['Plancha', 'core', 'peso corporal', 'Isométrico abdominal en antebrazos (reps = segundos).'],
  ['Rueda abdominal', 'core', 'rueda', 'Extensión anterior con rueda abdominal.'],
  [
    'Remo en ergómetro',
    'cardio',
    'máquina',
    'Trabajo cardiovascular en remoergómetro (reps = minutos).',
  ],
  ['Burpees', 'cuerpo completo', 'peso corporal', 'Ejercicio metabólico de cuerpo completo.'],
  [
    'Dominadas pronas (agarre oposición)',
    'espalda',
    'barra fija',
    'Agarre prono, partiendo de brazos extendidos y superando la barbilla.',
  ],
  [
    'Suspensión en barra con brazos flexionados',
    'brazos',
    'barra fija',
    'Mantener la barbilla por encima de la barra el máximo tiempo (reps = segundos).',
  ],
  [
    'Series de 200 m',
    'cardio',
    'pista',
    'Intervalos a ritmo de prueba de 1000 m (reps = número de series).',
  ],
  [
    'Técnica de circuito de agilidad',
    'cuerpo completo',
    'conos y vallas',
    'Práctica por tramos del circuito: salidas, cambios de dirección, vallas y conos.',
  ],
];

/** IDs de los ejercicios usados en el plan de ejemplo. */
const EX = {
  squat: 1,
  deadlift: 2,
  bench: 3,
  ohp: 4,
  row: 5,
  pullOps: 18,
  hang: 19,
  run200: 20,
  agility: 21,
  plank: 14,
};

export function createSeed(): DemoDb {
  let seq = 1000;
  const id = () => ++seq;

  const user = (
    uid: number,
    fullName: string,
    email: string,
    role: Role,
    activeUntilDays: number | null,
    createdDays: number,
    lastLoginDays: number | null,
  ): DemoUser => ({
    id: uid,
    email,
    fullName,
    role,
    activeUntil: activeUntilDays === null ? null : isoTime(activeUntilDays),
    disabled: false,
    lastLoginAt: lastLoginDays === null ? null : isoTime(lastLoginDays),
    createdAt: isoTime(createdDays),
    updatedAt: isoTime(createdDays),
    password: DEMO_PASSWORD,
  });

  const users: DemoUser[] = [
    user(1, 'Instructor Demo', 'admin@demo.fitpn', 'admin', null, -120, -0.1),
    user(2, 'Laura Gómez', 'laura@demo.fitpn', 'member', 19, -72, -0.5),
    user(3, 'Carlos Ruiz', 'carlos@demo.fitpn', 'member', 3, -27, -2),
    user(4, 'Marta Sánchez', 'marta@demo.fitpn', 'member', -12, -102, -14),
    user(5, 'Javier Moreno', 'javier@demo.fitpn', 'member', 24, -36, -1),
    user(6, 'Lucía Fernández', 'lucia@demo.fitpn', 'member', 6, -54, -4),
  ];

  const exercises: Exercise[] = EXERCISES.map(([name, muscleGroup, equipment, description], i) => ({
    id: i + 1,
    name,
    muscleGroup,
    equipment,
    description,
  }));

  // ---- Plan de Laura ----
  const plans: Plan[] = [
    {
      id: id(),
      userId: 2,
      title: 'Preparación pruebas · 3 días',
      description:
        'Bloque de 8 semanas orientado a las pruebas físicas. Calienta 10 minutos antes de cada sesión y registra tus simulacros cada 2 semanas.',
      isActive: true,
      createdAt: isoTime(-60),
      updatedAt: isoTime(-14),
      items: [
        {
          exerciseId: EX.squat,
          dayLabel: 'Día 1 · Fuerza',
          sets: 4,
          reps: '5',
          restSeconds: 150,
          notes: 'RPE 8',
        },
        {
          exerciseId: EX.pullOps,
          dayLabel: 'Día 1 · Fuerza',
          sets: 5,
          reps: 'máx.',
          restSeconds: 120,
          notes: 'Técnica estricta',
        },
        {
          exerciseId: EX.bench,
          dayLabel: 'Día 1 · Fuerza',
          sets: 4,
          reps: '6-8',
          restSeconds: 120,
          notes: '',
        },
        {
          exerciseId: EX.run200,
          dayLabel: 'Día 2 · Carrera',
          sets: 1,
          reps: '8 × 200 m',
          restSeconds: 90,
          notes: 'Ritmo objetivo de 1000 m',
        },
        {
          exerciseId: EX.agility,
          dayLabel: 'Día 2 · Carrera',
          sets: 4,
          reps: 'circuito',
          restSeconds: 180,
          notes: 'Cronometra cada intento',
        },
        {
          exerciseId: EX.deadlift,
          dayLabel: 'Día 3 · Tracción',
          sets: 3,
          reps: '5',
          restSeconds: 180,
          notes: '',
        },
        {
          exerciseId: EX.row,
          dayLabel: 'Día 3 · Tracción',
          sets: 4,
          reps: '8-10',
          restSeconds: 90,
          notes: '',
        },
        {
          exerciseId: EX.hang,
          dayLabel: 'Día 3 · Tracción',
          sets: 3,
          reps: 'máx. (s)',
          restSeconds: 120,
          notes: '',
        },
        {
          exerciseId: EX.plank,
          dayLabel: 'Día 3 · Tracción',
          sets: 3,
          reps: '45 s',
          restSeconds: 60,
          notes: '',
        },
      ],
    },
    {
      id: id(),
      userId: 5,
      title: 'Base de fuerza',
      description: 'Plan de iniciación de 4 semanas.',
      isActive: true,
      createdAt: isoTime(-30),
      updatedAt: isoTime(-30),
      items: [
        {
          exerciseId: EX.squat,
          dayLabel: 'Día 1',
          sets: 3,
          reps: '8',
          restSeconds: 120,
          notes: '',
        },
        {
          exerciseId: EX.bench,
          dayLabel: 'Día 1',
          sets: 3,
          reps: '8',
          restSeconds: 120,
          notes: '',
        },
        {
          exerciseId: EX.pullOps,
          dayLabel: 'Día 2',
          sets: 4,
          reps: 'máx.',
          restSeconds: 120,
          notes: '',
        },
      ],
    },
  ];
  for (const p of plans) {
    for (const it of p.items) it.exerciseName = exercises[it.exerciseId - 1].name;
  }

  // ---- Entrenamientos ----
  const workouts: DemoWorkout[] = [];
  const addWorkout = (
    userId: number,
    daysAgo: number,
    title: string,
    rpe: number,
    duration: number,
    entries: [number, number, number, number][], // [exerciseId, sets, reps, kg]
    notes = '',
  ) =>
    workouts.push({
      id: id(),
      userId,
      performedOn: isoDay(-daysAgo),
      title,
      durationMinutes: duration,
      perceivedEffort: rpe,
      notes,
      createdAt: isoTime(-daysAgo),
      exercises: entries.map(([exerciseId, sets, reps, kg]) => ({
        exerciseId,
        sets: Array.from({ length: sets }, () => ({ reps, weightKg: kg })),
      })),
    });

  for (let week = 7; week >= 0; week--) {
    const p = 7 - week; // progresión
    const base = week * 7;
    addWorkout(2, base + 5, 'Día 1 · Fuerza', 8, 70, [
      [EX.squat, 4, 5, 55 + p * 2.5],
      [EX.pullOps, 5, 4 + Math.floor(p / 2), 0],
      [EX.bench, 4, 7, 35 + p * 1.25],
    ]);
    addWorkout(
      2,
      base + 3,
      'Día 2 · Carrera',
      9,
      55,
      [
        [EX.run200, 1, 8, 0],
        [EX.agility, 4, 1, 0],
      ],
      week === 0 ? 'Muy buenas sensaciones en las series.' : '',
    );
    if (week !== 0) {
      addWorkout(2, base + 1, 'Día 3 · Tracción', 8, 65, [
        [EX.deadlift, 3, 5, 70 + p * 2.5],
        [EX.row, 4, 9, 35 + p * 1.25],
        [EX.plank, 3, 45, 0],
      ]);
    }
  }
  for (let week = 3; week >= 0; week--) {
    const p = 3 - week;
    addWorkout(5, week * 7 + 2, 'Día 1', 7, 60, [
      [EX.squat, 3, 8, 70 + p * 5],
      [EX.bench, 3, 8, 60 + p * 2.5],
    ]);
    addWorkout(3, week * 7 + 4, 'Fuerza general', 7, 50, [
      [EX.squat, 3, 6, 80 + p * 5],
      [EX.deadlift, 3, 5, 100 + p * 5],
    ]);
  }
  addWorkout(6, 5, 'Pierna y core', 7, 50, [
    [EX.squat, 4, 6, 50],
    [EX.plank, 3, 40, 0],
  ]);

  // ---- Medidas ----
  const measurements: DemoDb['measurements'] = [];
  [64.8, 64.5, 64.3, 63.9, 63.8, 63.4, 63.1, 62.9].forEach((w, i) =>
    measurements.push({
      id: id(),
      userId: 2,
      measuredOn: isoDay(-(7 - i) * 7),
      weightKg: w,
      bodyFatPct: Math.round((24 - i * 0.4) * 10) / 10,
      waistCm: Math.round((74 - i * 0.5) * 10) / 10,
      notes: '',
    }),
  );
  [82.4, 81.9, 81.6, 81.0].forEach((w, i) =>
    measurements.push({
      id: id(),
      userId: 5,
      measuredOn: isoDay(-(3 - i) * 7),
      weightKg: w,
      bodyFatPct: null,
      waistCm: null,
      notes: '',
    }),
  );

  // ---- Pruebas físicas ----
  const tests: DemoDb['tests'] = [];
  const addTests = (userId: number, type: TestType, values: number[], everyDays = 14) =>
    values.forEach((result, i) =>
      tests.push({
        id: id(),
        userId,
        testType: type,
        result,
        performedOn: isoDay(-(values.length - 1 - i) * everyDays),
        notes: i === values.length - 1 ? 'Último simulacro' : '',
      }),
    );
  addTests(2, 'run_1000m', [248, 241, 236.5, 231, 226]);
  addTests(2, 'agility_circuit', [13.4, 13.1, 12.8, 12.9, 12.5]);
  addTests(2, 'bar_hang', [38, 45, 49, 56, 62]);
  addTests(5, 'run_1000m', [222, 214, 209], 10);
  addTests(5, 'pull_ups', [7, 9, 11], 10);
  addTests(5, 'agility_circuit', [11.6, 11.2, 11.3], 10);
  addTests(3, 'run_1000m', [218, 215], 14);
  addTests(3, 'pull_ups', [10, 12], 14);

  // ---- Renovaciones ----
  const renewals: DemoDb['renewals'] = [
    {
      id: id(),
      userId: 2,
      months: 1,
      previousUntil: isoTime(-41),
      newUntil: isoTime(-11),
      renewedByName: 'Instructor Demo',
      createdAt: isoTime(-42),
    },
    {
      id: id(),
      userId: 2,
      months: 1,
      previousUntil: isoTime(-11),
      newUntil: isoTime(19),
      renewedByName: 'Instructor Demo',
      createdAt: isoTime(-12),
    },
    {
      id: id(),
      userId: 4,
      months: 3,
      previousUntil: isoTime(-102),
      newUntil: isoTime(-12),
      renewedByName: 'Instructor Demo',
      createdAt: isoTime(-100),
    },
  ];

  return {
    seq,
    sessionUserId: null,
    users,
    exercises,
    workouts,
    measurements,
    plans,
    tests,
    renewals,
  };
}
