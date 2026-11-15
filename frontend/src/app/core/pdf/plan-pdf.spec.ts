import { PlanItem } from '../models';
import { groupByDay, pdfFileName, shortDate } from './plan-pdf';

const item = (dayLabel: string, exerciseId: number): PlanItem => ({
  exerciseId,
  dayLabel,
  sets: 3,
  reps: '10',
  restSeconds: 60,
  notes: '',
});

describe('exportación del plan a PDF', () => {
  it('agrupa por día respetando el orden del plan', () => {
    const days = groupByDay([item('Día 1', 1), item('Día 2', 2), item('Día 1', 3), item('', 4)]);
    expect(days.map((d) => d.label)).toEqual(['Día 1', 'Día 2', 'Sesión']);
    expect(days[0].items.map((i) => i.exerciseId)).toEqual([1, 3]);
  });

  it('genera nombres de archivo seguros', () => {
    expect(pdfFileName('Laura Gómez', 'Preparación pruebas · 3 días')).toBe(
      'plan-laura-gomez-preparacion-pruebas-3-dias.pdf',
    );
  });

  it('formatea la fecha de emisión en corto', () => {
    expect(shortDate(new Date(2026, 10, 15))).toBe('15 nov 2026');
  });
});
