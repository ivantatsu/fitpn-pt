/**
 * Exportación de un plan de entrenamiento a PDF (A4), generado en el navegador.
 *
 * La librería (jsPDF) y las fuentes se cargan solo al exportar, así que no
 * afectan al tamaño inicial de la aplicación. Los pictogramas se dibujan como
 * vectores con el mismo motor de movimiento que la app.
 */
import type { jsPDF } from 'jspdf';
import { Plan, PlanItem } from '../models';
import { keyFrame, motionFor } from '../motion/library';
import { Prop, Vec, rig } from '../motion/skeleton';
import { TestSummary, formatResult } from '../physical-tests';

export interface PlanPdfInput {
  plan: Plan;
  studentName: string;
  /** Mejores marcas del alumno (opcional). */
  marks?: TestSummary[];
}

// ---------- Paleta y medidas (mm) ----------

const C = {
  navy: '#14294b',
  ink: '#0d1726',
  muted: '#5b6678',
  line: '#d3d9e2',
  paper: '#eef0f3',
  tile: '#f3f5f8',
  prop: '#c1121f',
  red: '#c60b1e',
  yellow: '#ffc400',
  white: '#ffffff',
  onNavy: '#9fb0cc',
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // margen lateral
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 16;
const ROW_H = 24;
const PICTO = 20;
const LOG_WEEKS = 4;

const FONTS = [
  { file: 'Archivo-Regular.ttf', family: 'Archivo', style: 'normal' },
  { file: 'Archivo-SemiBold.ttf', family: 'Archivo', style: 'bold' },
  { file: 'ArchivoSemiExpanded-ExtraBold.ttf', family: 'ArchivoX', style: 'bold' },
  { file: 'IBMPlexMono-Regular.ttf', family: 'Plex', style: 'normal' },
  { file: 'IBMPlexMono-SemiBold.ttf', family: 'Plex', style: 'bold' },
] as const;

let fontCache: Promise<{ file: string; data: string }[]> | null = null;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Descarga (una sola vez) las fuentes TTF del PDF, servidas desde /fonts/pdf. */
function loadFonts(): Promise<{ file: string; data: string }[]> {
  fontCache ??= Promise.all(
    FONTS.map(async (f) => {
      const res = await fetch(`fonts/pdf/${f.file}`);
      if (!res.ok) throw new Error(`No se pudo cargar la fuente ${f.file}`);
      return { file: f.file, data: toBase64(await res.arrayBuffer()) };
    }),
  ).catch((err) => {
    fontCache = null;
    throw err;
  });
  return fontCache;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha corta independiente de la configuración regional del navegador: "15 nov 2026". */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Agrupa los ejercicios por día respetando el orden del plan. */
export function groupByDay(items: PlanItem[]): { label: string; items: PlanItem[] }[] {
  const days = new Map<string, PlanItem[]>();
  for (const it of items) {
    const key = it.dayLabel.trim() || 'Sesión';
    days.set(key, [...(days.get(key) ?? []), it]);
  }
  return [...days.entries()].map(([label, list]) => ({ label, items: list }));
}

/** Nombre de archivo seguro: plan-laura-gomez-preparacion-pruebas.pdf */
export function pdfFileName(student: string, title: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  return `plan-${slug(student)}-${slug(title)}.pdf`;
}

// ---------- Pictograma vectorial ----------

function drawPictogram(doc: jsPDF, name: string, x: number, y: number, size: number): void {
  doc.setFillColor(C.tile);
  doc.rect(x, y, size, size, 'F');

  const motion = motionFor(name);
  if (!motion) return;
  const f = rig(motion.pose(keyFrame(motion)));

  // Encuadre ajustado a la figura y al material visible (no a todo el lienzo).
  const pts: Vec[] = [
    f.head,
    f.neck,
    f.hip,
    ...f.arms.flatMap((a) => [a.elbow, a.hand]),
    ...f.legs.flatMap((l) => [l.knee, l.foot]),
    ...f.props.flatMap(propPoints),
  ].filter((p) => p.x >= -62 && p.x <= 62);
  const minX = Math.min(...pts.map((p) => p.x)) - 8;
  const maxX = Math.max(...pts.map((p) => p.x)) + 8;
  const onGround = f.props.some((p) => p.kind === 'ground');
  const minY = Math.min(onGround ? 0 : Infinity, ...pts.map((p) => p.y)) - 4;
  const maxY = Math.max(...pts.map((p) => p.y)) + 9;
  const s = (size * 0.86) / Math.max(maxX - minX, maxY - minY);
  const ox = x + size / 2 - ((minX + maxX) / 2) * s;
  const oy = y + size / 2 + ((minY + maxY) / 2) * s;
  const px = (p: Vec) => ox + p.x * s;
  const py = (p: Vec) => oy - p.y * s;

  doc.saveGraphicsState();
  doc.rect(x, y, size, size, null);
  doc.clip();
  doc.discardPath();
  doc.setLineCap('round');
  doc.setLineJoin('round');

  for (const p of f.props) drawProp(doc, p, px, py, s, false);

  const limb = (a: Vec, b: Vec, c: Vec, width: number, color: string) => {
    doc.setDrawColor(color);
    doc.setLineWidth(width * s);
    doc.lines(
      [
        [px(b) - px(a), py(b) - py(a)],
        [px(c) - px(b), py(c) - py(b)],
      ],
      px(a),
      py(a),
      [1, 1],
      'S',
      false,
    );
  };
  const far = '#b7c0cd';
  limb(f.hip, f.legs[1].knee, f.legs[1].foot, 7, far);
  limb(f.shoulder, f.arms[1].elbow, f.arms[1].hand, 7, far);

  doc.setDrawColor(C.ink);
  doc.setLineWidth(10 * s);
  doc.line(px(f.hip), py(f.hip), px(f.neck), py(f.neck));
  doc.setFillColor(C.ink);
  doc.circle(px(f.head), py(f.head), 6.5 * s, 'F');

  // Halo del color del fondo para separar los miembros cercanos del tronco.
  limb(f.hip, f.legs[0].knee, f.legs[0].foot, 12, C.tile);
  limb(f.shoulder, f.arms[0].elbow, f.arms[0].hand, 12, C.tile);
  limb(f.hip, f.legs[0].knee, f.legs[0].foot, 7, C.ink);
  limb(f.shoulder, f.arms[0].elbow, f.arms[0].hand, 7, C.ink);

  for (const p of f.props) drawProp(doc, p, px, py, s, true);
  doc.restoreGraphicsState();
}

/** Puntos que delimitan cada elemento de material (para el encuadre). */
function propPoints(p: Prop): Vec[] {
  switch (p.kind) {
    case 'ground':
      return [];
    case 'line':
      return [p.from, p.to];
    case 'plate':
      return [
        { x: p.at.x - p.r, y: p.at.y - p.r },
        { x: p.at.x + p.r, y: p.at.y + p.r },
      ];
    case 'rect':
      return [
        { x: p.x, y: p.y },
        { x: p.x + p.w, y: p.y + p.h },
      ];
    case 'cone':
      return [p.at, { x: p.at.x, y: p.at.y + 15 }];
    case 'marker':
      return [p.at, { x: p.at.x + 11, y: p.at.y + 30 }];
  }
}

function drawProp(
  doc: jsPDF,
  p: Prop,
  px: (v: Vec) => number,
  py: (v: Vec) => number,
  s: number,
  front: boolean,
): void {
  if (!!p.front !== front) return;
  const color = p.light ? C.white : C.prop;
  doc.setDrawColor(color);
  doc.setFillColor(color);
  switch (p.kind) {
    case 'ground':
      doc.setDrawColor('#9aa5b5');
      doc.setLineWidth(1.5 * s);
      doc.line(px({ x: -400, y: 0 }), py({ x: 0, y: 0 }), px({ x: 400, y: 0 }), py({ x: 0, y: 0 }));
      break;
    case 'line':
      doc.setLineWidth((p.weight ?? 3) * s);
      doc.line(px(p.from), py(p.from), px(p.to), py(p.to));
      break;
    case 'plate':
      doc.circle(px(p.at), py(p.at), p.r * s, 'F');
      break;
    case 'rect':
      doc.rect(px({ x: p.x, y: 0 }), py({ x: 0, y: p.y + p.h }), p.w * s, p.h * s, 'F');
      break;
    case 'cone':
      doc.triangle(
        px({ x: p.at.x - 5, y: 0 }),
        py(p.at),
        px(p.at),
        py({ x: 0, y: p.at.y + 15 }),
        px({ x: p.at.x + 5, y: 0 }),
        py(p.at),
        'F',
      );
      break;
    case 'marker':
      doc.setLineWidth(2 * s);
      doc.line(px(p.at), py(p.at), px(p.at), py({ x: 0, y: p.at.y + 30 }));
      doc.rect(px(p.at), py({ x: 0, y: p.at.y + 30 }), 11 * s, 8 * s, 'F');
      break;
  }
}

// ---------- Emblema ----------

function drawBrandMark(doc: jsPDF, x: number, y: number, size: number): void {
  const k = size / 48;
  const shield = (inset: number, color: string) => {
    const t = (px: number, py: number): [number, number] => [x + px * k, y + py * k];
    doc.setFillColor(color);
    const [sx, sy] = t(24, 3 + inset);
    doc.moveTo(sx, sy);
    doc.lineTo(...t(6 + inset * 0.9, 9 + inset * 0.6));
    doc.lineTo(...t(6 + inset * 0.9, 22));
    doc.curveTo(...t(6 + inset, 33.5), ...t(13.6, 41.6), ...t(24, 45 - inset));
    doc.curveTo(...t(34.4, 41.6), ...t(42 - inset, 33.5), ...t(42 - inset * 0.9, 22));
    doc.lineTo(...t(42 - inset * 0.9, 9 + inset * 0.6));
    doc.close();
    doc.fill();
  };
  shield(0, C.white);
  shield(4.5, C.navy);
  doc.setFillColor(C.white);
  doc.rect(x + 11 * k, y + 20.5 * k, 3.5 * k, 9 * k, 'F');
  doc.rect(x + 15.5 * k, y + 18 * k, 3.5 * k, 14 * k, 'F');
  doc.rect(x + 29 * k, y + 18 * k, 3.5 * k, 14 * k, 'F');
  doc.rect(x + 33.5 * k, y + 20.5 * k, 3.5 * k, 9 * k, 'F');
  doc.setFillColor(C.yellow);
  doc.rect(x + 19 * k, y + 23.5 * k, 10 * k, 3 * k, 'F');
}

// ---------- Documento ----------

export async function exportPlanPdf(input: PlanPdfInput): Promise<void> {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  for (const f of FONTS) {
    doc.addFileToVFS(f.file, fonts.find((x) => x.file === f.file)!.data);
    doc.addFont(f.file, f.family, f.style);
  }
  doc.setProperties({
    title: `${input.plan.title} · ${input.studentName}`,
    subject: 'Plan de entrenamiento',
    author: 'FitPN',
    creator: 'FitPN',
  });

  const { plan } = input;
  const days = groupByDay(plan.items);
  const issued = shortDate(new Date());

  const font = (
    family: 'Archivo' | 'ArchivoX' | 'Plex',
    style: 'normal' | 'bold',
    size: number,
    color = C.ink,
  ) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const label = (
    text: string,
    x: number,
    y: number,
    color = C.muted,
    align: 'left' | 'right' = 'left',
  ) => {
    font('Plex', 'bold', 6.5, color);
    doc.setCharSpace(0.25);
    doc.text(text.toUpperCase(), x, y, { align });
    doc.setCharSpace(0);
  };
  const hairline = (y: number, x1 = M, x2 = PAGE_W - M, color = C.line, width = 0.25) => {
    doc.setDrawColor(color);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
  };

  // ---- Cabecera ----
  font('ArchivoX', 'bold', 24, C.white);
  const titleLines: string[] = doc.splitTextToSize(plan.title, CONTENT_W);
  const bandH = 34 + (titleLines.length - 1) * 9.5;
  doc.setFillColor(C.navy);
  doc.rect(0, 0, PAGE_W, bandH, 'F');
  // Franja rojigualda
  doc.setFillColor(C.red);
  doc.rect(0, 0, PAGE_W, 2.2, 'F');
  doc.setFillColor(C.yellow);
  doc.rect(PAGE_W * 0.25, 0, PAGE_W * 0.5, 2.2, 'F');

  drawBrandMark(doc, M, 7.5, 8.5);
  font('ArchivoX', 'bold', 11, C.white);
  doc.text('FitPN', M + 11, 13.4);
  label('Plan de entrenamiento', PAGE_W - M, 13.2, C.onNavy, 'right');
  font('ArchivoX', 'bold', 24, C.white);
  doc.text(titleLines, M, 28);

  // ---- Ficha del alumno ----
  let y = bandH + 9;
  const cells = [
    { k: 'Alumno', v: input.studentName },
    { k: 'Emitido', v: issued },
    { k: 'Estado', v: plan.isActive ? 'Plan activo' : 'Archivado' },
    {
      k: 'Contenido',
      v: `${days.length} ${days.length === 1 ? 'sesión' : 'sesiones'} · ${plan.items.length} ejercicios`,
    },
  ];
  const cellW = CONTENT_W / cells.length;
  let infoH = 1;
  cells.forEach((c, i) => {
    const cx = M + i * cellW;
    if (i > 0) {
      doc.setDrawColor(C.line);
      doc.setLineWidth(0.25);
      doc.line(cx - 3, y - 4, cx - 3, y + 6);
    }
    label(c.k, cx, y - 1);
    font('Archivo', 'bold', 10.5);
    const lines: string[] = doc.splitTextToSize(c.v, cellW - 6);
    doc.text(lines.slice(0, 2), cx, y + 4.5, { lineHeightFactor: 1.25 });
    infoH = Math.max(infoH, lines.slice(0, 2).length);
  });
  y += 6 + infoH * 4.6;
  hairline(y, M, PAGE_W - M, C.ink, 0.5);
  y += 7;

  // ---- Indicaciones ----
  if (plan.description.trim()) {
    label('Indicaciones del instructor', M, y);
    font('Archivo', 'normal', 9.5, C.ink);
    const lines: string[] = doc.splitTextToSize(plan.description.trim(), CONTENT_W);
    doc.text(lines, M, y + 5, { lineHeightFactor: 1.45 });
    y += 5 + lines.length * 4.9 + 4;
  }

  // ---- Mejores marcas ----
  const marks = (input.marks ?? []).filter((m) => m.best);
  if (marks.length) {
    label('Mejores marcas actuales · pruebas físicas', M, y);
    y += 3;
    const w = CONTENT_W / 4;
    for (const [i, m] of (input.marks ?? []).entries()) {
      const bx = M + i * w;
      doc.setFillColor(C.tile);
      doc.rect(bx, y, w - 2, 15, 'F');
      font('Archivo', 'normal', 7.5, C.muted);
      doc.text(m.def.name, bx + 3, y + 5);
      font('Plex', 'bold', 13, m.best ? C.ink : C.muted);
      doc.text(m.best ? formatResult(m.def.type, m.best.result) : '—', bx + 3, y + 12);
    }
    y += 22;
  }

  // ---- Sesiones ----
  const COL = {
    name: M + PICTO + 4,
    dose: M + 88,
    rest: M + 130,
    log: M + 148,
  };
  const DOSE_W = COL.rest - COL.dose - 3;
  const logW = (PAGE_W - M - COL.log) / LOG_WEEKS;

  const dayHeader = (
    day: { label: string; items: PlanItem[] },
    index: number,
    continued: boolean,
  ) => {
    doc.setFillColor(C.navy);
    doc.rect(M, y, CONTENT_W, 9, 'F');
    font('Plex', 'bold', 7, C.onNavy);
    doc.text(`SESIÓN ${String(index + 1).padStart(2, '0')}`, M + 3, y + 5.9);
    font('ArchivoX', 'bold', 11, C.white);
    doc.text(day.label + (continued ? ' (continuación)' : ''), M + 24, y + 6.1);
    font('Plex', 'normal', 7.5, C.onNavy);
    doc.text(`${day.items.length} ejercicios`, PAGE_W - M - 3, y + 6, { align: 'right' });
    y += 9 + 5;
    label('Ejercicio', COL.name, y);
    label('Series × reps', COL.dose, y);
    label('Descanso', COL.rest, y);
    label('Registro de carga', COL.log, y);
    y += 2.5;
    hairline(y, M, PAGE_W - M, C.ink, 0.4);
  };

  const newPage = () => {
    doc.addPage();
    // Cabecera reducida en páginas siguientes
    doc.setFillColor(C.navy);
    doc.rect(0, 0, PAGE_W, 12, 'F');
    doc.setFillColor(C.red);
    doc.rect(0, 0, PAGE_W, 1.6, 'F');
    doc.setFillColor(C.yellow);
    doc.rect(PAGE_W * 0.25, 0, PAGE_W * 0.5, 1.6, 'F');
    font('ArchivoX', 'bold', 9, C.white);
    doc.text(plan.title, M, 8.3);
    font('Plex', 'normal', 7.5, C.onNavy);
    doc.text(input.studentName, PAGE_W - M, 8.3, { align: 'right' });
    y = 20;
  };

  const bottom = PAGE_H - FOOTER_H - 6;

  days.forEach((day, di) => {
    // La cabecera de la sesión nunca queda sola al final de una página.
    if (y + 16 + ROW_H > bottom) newPage();
    else if (di > 0) y += 6;
    dayHeader(day, di, false);

    for (const it of day.items) {
      if (y + ROW_H > bottom) {
        newPage();
        dayHeader(day, di, true);
      }
      const top = y + 2;
      drawPictogram(doc, it.exerciseName ?? '', M, top, PICTO);

      font('Archivo', 'bold', 10.5);
      const nameLines: string[] = doc.splitTextToSize(
        it.exerciseName ?? 'Ejercicio',
        COL.dose - COL.name - 4,
      );
      doc.text(nameLines.slice(0, 2), COL.name, top + 5);
      if (it.notes) {
        font('Archivo', 'normal', 8, C.muted);
        const noteLines: string[] = doc.splitTextToSize(it.notes, COL.dose - COL.name - 4);
        doc.text(
          noteLines.slice(0, 2),
          COL.name,
          top + 5 + nameLines.slice(0, 2).length * 4.4 + 0.6,
        );
      }

      // Si las repeticiones ya describen la serie ("8 × 200 m"), no se antepone "1 ×".
      const dose = it.sets === 1 && /[^\d\s-]/.test(it.reps) ? it.reps : `${it.sets} × ${it.reps}`;
      let size = 13;
      font('Plex', 'bold', size);
      while (size > 8.5 && doc.getTextWidth(dose) > DOSE_W) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      const doseLines: string[] = doc.splitTextToSize(dose, DOSE_W);
      doc.text(doseLines.slice(0, 2), COL.dose, top + 6, { lineHeightFactor: 1.15 });
      font('Plex', 'normal', 9.5, it.restSeconds ? C.ink : C.muted);
      doc.text(it.restSeconds ? `${it.restSeconds} s` : '—', COL.rest, top + 6);

      // Casillas para anotar la carga de cada semana.
      doc.setDrawColor(C.line);
      doc.setLineWidth(0.3);
      for (let w = 0; w < LOG_WEEKS; w++) {
        const bx = COL.log + w * logW;
        doc.rect(bx, top + 1, logW - 1.5, 13, 'S');
        font('Plex', 'normal', 5.5, C.muted);
        doc.text(`S${w + 1}`, bx + 1.2, top + 3.6);
      }

      y += ROW_H;
      hairline(y);
    }
  });

  // ---- Observaciones (si caben en la página) ----
  if (y + 42 <= bottom) {
    y += 9;
    label('Observaciones y sensaciones', M, y);
    for (let i = 1; i <= 4; i++) hairline(y + i * 8);
  }

  // ---- Pie de página ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const fy = PAGE_H - FOOTER_H + 4;
    hairline(fy, M, PAGE_W - M, C.ink, 0.4);
    font('Archivo', 'bold', 8, C.ink);
    doc.text('FitPN · Preparación física', M, fy + 5);
    font('Archivo', 'normal', 6.5, C.muted);
    doc.text(
      'Plataforma independiente de preparación física. No vinculada a la Dirección General de la Policía.',
      M,
      fy + 9,
    );
    font('Plex', 'normal', 7.5, C.muted);
    doc.text(`${p} / ${total}`, PAGE_W - M, fy + 5, { align: 'right' });
  }

  doc.save(pdfFileName(input.studentName, plan.title));
}
