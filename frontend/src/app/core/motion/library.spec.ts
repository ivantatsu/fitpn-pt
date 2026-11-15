import { MOTIONS, motionFor } from './library';
import { BONES, rig, solveLimb, v } from './skeleton';

describe('motor de pictogramas', () => {
  it('la cinemática inversa respeta la longitud de los huesos', () => {
    const { joint, end } = solveLimb(v(0, 0), v(20, -10), 16, 15, 1);
    expect(Math.hypot(joint.x, joint.y)).toBeCloseTo(16, 5);
    expect(Math.hypot(end.x - joint.x, end.y - joint.y)).toBeCloseTo(15, 5);
  });

  it('todas las animaciones generan poses válidas a lo largo del ciclo', () => {
    for (const m of Object.values(MOTIONS)) {
      for (let t = 0; t < 1; t += 0.05) {
        const r = rig(m.pose(t));
        const points = [
          r.head,
          r.hip,
          r.shoulder,
          ...r.arms.flatMap((a) => [a.elbow, a.hand]),
          ...r.legs.flatMap((l) => [l.knee, l.foot]),
        ];
        for (const p of points) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${m.id} t=${t}`).toBe(true);
        }
        // Ningún pie atraviesa el suelo.
        for (const leg of r.legs) expect(leg.foot.y, `${m.id} t=${t}`).toBeGreaterThan(-1);
        // El tronco mantiene su longitud.
        expect(Math.hypot(r.shoulder.x - r.hip.x, r.shoulder.y - r.hip.y)).toBeCloseTo(
          BONES.torso,
          3,
        );
      }
    }
  });

  it('asocia cada ejercicio del catálogo a su animación', () => {
    expect(motionFor('Dominadas pronas (agarre oposición)')?.id).toBe('pullup');
    expect(motionFor('Suspensión en barra con brazos flexionados')?.id).toBe('hang');
    expect(motionFor('Remo en ergómetro')?.id).toBe('erg');
    expect(motionFor('Remo con barra')?.id).toBe('row');
    expect(motionFor('Series de 200 m')?.id).toBe('run');
    expect(motionFor('Ejercicio inventado', 'core')?.id).toBe('plank');
    expect(motionFor('Ejercicio inventado')).toBeNull();
  });
});
