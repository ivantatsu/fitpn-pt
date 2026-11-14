import { formatResult, parseResult, summarize, TestResult } from './physical-tests';

describe('pruebas físicas', () => {
  it('formatea las marcas', () => {
    expect(formatResult('run_1000m', 205.4)).toBe('3:25,4');
    expect(formatResult('run_1000m', 180)).toBe('3:00');
    expect(formatResult('agility_circuit', 11.85)).toBe('11,85 s');
    expect(formatResult('pull_ups', 12)).toBe('12 rep.');
  });

  it('interpreta lo que escribe el usuario', () => {
    expect(parseResult('run_1000m', '3:25')).toBe(205);
    expect(parseResult('run_1000m', '3:25,5')).toBe(205.5);
    expect(parseResult('run_1000m', '3:75')).toBeNull();
    expect(parseResult('agility_circuit', '11,8')).toBe(11.8);
    expect(parseResult('pull_ups', '7.5')).toBeNull();
    expect(parseResult('pull_ups', '')).toBeNull();
  });

  it('calcula mejor marca y mejora según el sentido de la prueba', () => {
    const r = (
      testType: TestResult['testType'],
      result: number,
      performedOn: string,
    ): TestResult => ({
      id: 0,
      testType,
      result,
      performedOn,
      notes: '',
    });
    const [circuit, pullUps] = summarize([
      r('agility_circuit', 12.5, '2026-01-01'),
      r('agility_circuit', 11.9, '2026-01-08'),
      r('agility_circuit', 12.1, '2026-01-15'),
      r('pull_ups', 8, '2026-01-01'),
      r('pull_ups', 10, '2026-01-08'),
    ]);
    expect(circuit.best?.result).toBe(11.9);
    expect(circuit.improvement).toBeCloseTo(-0.2);
    expect(pullUps.best?.result).toBe(10);
    expect(pullUps.improvement).toBe(2);
  });
});
