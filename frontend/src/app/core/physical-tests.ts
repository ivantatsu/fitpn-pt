/** Definición de las pruebas físicas de la oposición y utilidades de formato. */

export type TestType = 'agility_circuit' | 'pull_ups' | 'bar_hang' | 'run_1000m';

export interface TestResult {
  id: number;
  testType: TestType;
  result: number;
  performedOn: string;
  notes: string;
}

export interface TestDef {
  type: TestType;
  name: string;
  /** Unidad para mostrar/introducir la marca. */
  kind: 'clock' | 'seconds' | 'reps';
  lowerIsBetter: boolean;
  placeholder: string;
  hint: string;
}

export const TEST_DEFS: readonly TestDef[] = [
  {
    type: 'agility_circuit',
    name: 'Circuito de agilidad',
    kind: 'seconds',
    lowerIsBetter: true,
    placeholder: 'p. ej. 11,8',
    hint: 'Tiempo en segundos (con décimas). Menos es mejor.',
  },
  {
    type: 'pull_ups',
    name: 'Dominadas',
    kind: 'reps',
    lowerIsBetter: false,
    placeholder: 'p. ej. 12',
    hint: 'Repeticiones válidas completas. Más es mejor.',
  },
  {
    type: 'bar_hang',
    name: 'Suspensión en barra',
    kind: 'seconds',
    lowerIsBetter: false,
    placeholder: 'p. ej. 58',
    hint: 'Segundos con la barbilla sobre la barra. Más es mejor.',
  },
  {
    type: 'run_1000m',
    name: 'Carrera 1000 m',
    kind: 'clock',
    lowerIsBetter: true,
    placeholder: 'mm:ss (p. ej. 3:25)',
    hint: 'Tiempo en minutos y segundos. Menos es mejor.',
  },
];

export function testDef(type: TestType): TestDef {
  return TEST_DEFS.find((d) => d.type === type)!;
}

const num = (v: number, decimals: number) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimals });

/** Formatea una marca: "3:25,4", "11,8 s" o "12 rep.". */
export function formatResult(type: TestType, value: number): string {
  const def = testDef(type);
  switch (def.kind) {
    case 'clock': {
      const min = Math.floor(value / 60);
      const sec = value - min * 60;
      const secText = sec.toLocaleString('es-ES', {
        minimumIntegerDigits: 2,
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      return `${min}:${secText}`;
    }
    case 'seconds':
      return `${num(value, 2)} s`;
    case 'reps':
      return `${num(value, 0)} rep.`;
  }
}

/** Interpreta lo que escribe el usuario. Devuelve null si no es válido. */
export function parseResult(type: TestType, text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (testDef(type).kind === 'clock' && t.includes(':')) {
    const [m, s] = t.split(':');
    const min = Number(m);
    const sec = Number(s);
    if (!Number.isInteger(min) || !Number.isFinite(sec) || sec < 0 || sec >= 60) return null;
    return Math.round((min * 60 + sec) * 100) / 100;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  if (testDef(type).kind === 'reps' && !Number.isInteger(n)) return null;
  return n;
}

export interface TestSummary {
  def: TestDef;
  attempts: number;
  best: TestResult | null;
  last: TestResult | null;
  /** Mejora respecto al intento anterior (positivo = mejor), en unidades de la prueba. */
  improvement: number | null;
}

/** Resume las marcas de cada prueba. `results` debe venir en orden cronológico. */
export function summarize(results: TestResult[]): TestSummary[] {
  return TEST_DEFS.map((def) => {
    const list = results.filter((r) => r.testType === def.type);
    const better = (a: TestResult, b: TestResult) =>
      def.lowerIsBetter ? a.result < b.result : a.result > b.result;
    const best = list.reduce<TestResult | null>(
      (acc, r) => (!acc || better(r, acc) ? r : acc),
      null,
    );
    const last = list.at(-1) ?? null;
    const prev = list.at(-2);
    const improvement =
      last && prev
        ? def.lowerIsBetter
          ? prev.result - last.result
          : last.result - prev.result
        : null;
    return { def, attempts: list.length, best, last, improvement };
  });
}
