import { TestBed } from '@angular/core/testing';
import { Chart, niceStep } from './chart';

describe('Chart', () => {
  it('muestra un mensaje cuando no hay datos', async () => {
    const fixture = TestBed.createComponent(Chart);
    fixture.componentRef.setInput('points', []);
    fixture.componentRef.setInput('emptyText', 'Sin datos');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin datos');
  });

  it('dibuja una línea con un punto por valor', async () => {
    const fixture = TestBed.createComponent(Chart);
    fixture.componentRef.setInput('points', [
      { label: 'a', value: 80 },
      { label: 'b', value: 79 },
      { label: 'c', value: 78.5 },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('circle').length).toBe(3);
    expect(el.querySelector('path.line')?.getAttribute('d')).toMatch(/^M/);
  });

  it('dibuja barras en modo bar', async () => {
    const fixture = TestBed.createComponent(Chart);
    fixture.componentRef.setInput('kind', 'bar');
    fixture.componentRef.setInput('points', [
      { label: 'a', value: 0 },
      { label: 'b', value: 1000 },
    ]);
    await fixture.whenStable();
    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll('rect.bar');
    expect(bars.length).toBe(2);
    expect(Number(bars[0].getAttribute('height'))).toBe(0);
    expect(Number(bars[1].getAttribute('height'))).toBeGreaterThan(0);
  });
});

describe('niceStep', () => {
  it('redondea a 1, 2, 2.5, 5 o 10 × 10ⁿ', () => {
    expect(niceStep(882)).toBe(1000);
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(17)).toBe(20);
    expect(niceStep(2.2)).toBe(2.5);
  });
});
