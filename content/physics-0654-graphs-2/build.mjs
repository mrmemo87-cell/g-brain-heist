#!/usr/bin/env node
// Builds the 0654 Physics graph and circuit package, set 2: P4 current–voltage
// graphs and circuit diagrams, a P3 wave graph and a harder P1 speed–time
// graph. Visuals are drawn from stored data; numeric keys are recomputed from
// the same data. Run: node content/physics-0654-graphs-2/build.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkgDir = path.join(root, 'content', 'physics-0654-graphs-2');
const PACKAGE_VERSION = '1.0.0';
const ASSET_DIR = 'physics-0654-graphs-2-1-0-0';
const assetDir = path.join(root, 'public', 'question-assets', ASSET_DIR);
const SYLLABUS_URL = 'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf';

const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fail = (msg) => { throw new Error(msg); };
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// ------------------------------------------------------------------- render
const W = 640, H = 360, L = 96, R = 600, T = 78, B = 300;
const C = { bg: '#0f172a', frame: '#334155', title: '#67e8f9', grid: '#1e3a5f', gridMajor: '#334155', axis: '#e2e8f0', label: '#cbd5e1', line: '#fbbf24' };
const dash = { solid: '', dashed: '14 9', dotted: '3 8', dashdot: '16 7 3 7' };
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2))).replace('-', '−');
const text = (x, y, v, size = 18, fill = C.label, weight = 600, anchor = 'middle', extra = '') =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${extra}>${esc(v)}</text>`;

function renderGraph(spec) {
  const sx = (v) => L + ((v - spec.x.min) / (spec.x.max - spec.x.min)) * (R - L);
  const sy = (v) => B - ((v - spec.y.min) / (spec.y.max - spec.y.min)) * (B - T);
  const parts = [];
  const steps = (ax) => Math.round((ax.max - ax.min) / ax.grid);
  for (let i = 0; i <= steps(spec.x); i += 1) {
    const v = spec.x.min + i * spec.x.grid; const major = approx((v / spec.x.tick) % 1, 0) || approx(Math.abs(v / spec.x.tick) % 1, 1);
    parts.push(`<path d="M${sx(v).toFixed(1)} ${T}V${B}" stroke="${major ? C.gridMajor : C.grid}" stroke-width="${major ? 1.6 : 1}"/>`);
    if (major) parts.push(text(sx(v), B + 26, fmt(v), 20));
  }
  for (let i = 0; i <= steps(spec.y); i += 1) {
    const v = spec.y.min + i * spec.y.grid; const major = approx((v / spec.y.tick) % 1, 0) || approx(Math.abs(v / spec.y.tick) % 1, 1);
    parts.push(`<path d="M${L} ${sy(v).toFixed(1)}H${R}" stroke="${major ? C.gridMajor : C.grid}" stroke-width="${major ? 1.6 : 1}"/>`);
    if (major) parts.push(text(L - 10, sy(v) + 7, fmt(v), 20, C.label, 600, 'end'));
  }
  const ax0 = spec.y.min < 0 && spec.y.max > 0 ? sy(0) : B;
  parts.push(`<path d="M${L} ${T - 6}V${B}" fill="none" stroke="${C.axis}" stroke-width="2.5"/>`);
  parts.push(`<path d="M${L} ${ax0.toFixed(1)}H${R + 6}" fill="none" stroke="${C.axis}" stroke-width="2.5"/>`);
  parts.push(text((L + R) / 2, B + 52, spec.x.label, 20, C.label, 700));
  parts.push(text(26, (T + B) / 2, spec.y.label, 20, C.label, 700, 'middle', ` transform="rotate(-90 26 ${((T + B) / 2).toFixed(1)})"`));
  for (const s of spec.series) {
    const d = s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('');
    parts.push(`<path d="${d}" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${dash[s.style] ? ` stroke-dasharray="${dash[s.style]}"` : ''}/>`);
    if (s.markers) for (const [x, y] of s.points) parts.push(`<path d="M${(sx(x) - 6).toFixed(1)} ${(sy(y) - 6).toFixed(1)}l12 12m0-12l-12 12" stroke="#f8fafc" stroke-width="2.5"/>`);
    if (spec.series.length > 1) {
      const [lx, ly] = s.points[s.points.length - 1];
      parts.push(`<circle cx="${(sx(lx) - 2).toFixed(1)}" cy="${(sy(ly) - 2).toFixed(1)}" r="14" fill="${C.bg}" stroke="${C.line}" stroke-width="2"/>`);
      parts.push(text(sx(lx) - 2, sy(ly) + 4, s.id, 17, '#f8fafc', 800));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>${esc(spec.title)}</title>
  <rect width="${W}" height="${H}" rx="24" fill="${C.bg}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="23" fill="none" stroke="${C.frame}" stroke-width="2"/>
  ${text(32, 42, spec.title.toUpperCase(), 17, C.title, 800, 'start')}
  ${parts.join('\n  ')}
</svg>\n`;
}


// ------------------------------------------------------------------ circuits
// Cambridge symbols: cell (long thin + short thick plate), resistor (rectangle),
// ammeter (circle with A). Components are drawn over the wire with the panel
// colour so the wire appears to pass through them.
const WIRE = C.axis;
const wire = (d) => `<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="3" stroke-linejoin="round"/>`;
const resistor = (cx, cy, label, vertical = false) => {
  const w = vertical ? 26 : 72; const h = vertical ? 72 : 26;
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${C.bg}" stroke="${WIRE}" stroke-width="3"/>`
    + text(vertical ? cx + 30 : cx, vertical ? cy + 7 : cy + 42, label, 20, C.line, 800, vertical ? 'start' : 'middle');
};
const ammeter = (cx, cy, name, below = false) => `<circle cx="${cx}" cy="${cy}" r="21" fill="${C.bg}" stroke="${WIRE}" stroke-width="3"/>`
  + text(cx, cy + 7, 'A', 20, '#f8fafc', 800)
  + (name ? (below ? text(cx, cy + 48, name, 18, C.label, 700) : text(cx - 30, cy + 7, name, 18, C.label, 700, 'end')) : '');
const cell = (cx, cy, label) => `<rect x="${cx - 16}" y="${cy - 26}" width="32" height="52" fill="${C.bg}"/>`
  + `<path d="M${cx - 9} ${cy - 24}V${cy + 24}" stroke="${WIRE}" stroke-width="3"/>`
  + `<path d="M${cx + 9} ${cy - 12}V${cy + 12}" stroke="${WIRE}" stroke-width="7"/>`
  + text(cx, cy - 36, label, 20, C.line, 800);
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="${WIRE}"/>`;

function renderCircuit(spec) {
  const parts = [];
  if (spec.layout === 'series') {
    parts.push(wire('M140 110H500V290H140Z'));
    parts.push(cell(320, 110, spec.supply));
    parts.push(ammeter(140, 200, spec.ammeters[0]));
    spec.resistors.forEach((r, i) => parts.push(resistor(260 + i * 140, 290, r)));
  } else if (spec.layout === 'parallel') {
    parts.push(wire('M140 110H500V250H440M200 250H140V110'));
    parts.push(wire('M200 210V300M440 210V300M200 210H440M200 300H440'));
    parts.push(cell(320, 110, spec.supply));
    parts.push(ammeter(140, 185, spec.ammeters[0]));
    parts.push(resistor(320, 210, spec.resistors[0]));
    parts.push(resistor(270, 300, spec.resistors[1]));
    parts.push(ammeter(380, 300, spec.ammeters[1], true));
    parts.push(dot(200, 250), dot(440, 250));
  } else fail(`unknown circuit layout ${spec.layout}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>${esc(spec.title)}</title>
  <rect width="${W}" height="${H}" rx="24" fill="${C.bg}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="23" fill="none" stroke="${C.frame}" stroke-width="2"/>
  ${text(32, 42, spec.title.toUpperCase(), 17, C.title, 800, 'start')}
  ${parts.join('\n  ')}
</svg>\n`;
}

// -------------------------------------------------------------------- data
const visuals = {
  'p4-iv-two-resistors': {
    type: 'graph', kind: 'current-voltage', title: 'Current–voltage graphs for resistors X and Y',
    x: { label: 'potential difference / V', min: 0, max: 6, grid: 0.5, tick: 1 },
    y: { label: 'current / A', min: 0, max: 0.4, grid: 0.02, tick: 0.1 },
    series: [
      { id: 'X', style: 'solid', points: [[0, 0], [6, 0.3]] },
      { id: 'Y', style: 'dashed', points: [[0, 0], [6, 0.12]] },
    ],
    alt_text: 'Current-voltage graph with two straight lines through the origin. Line X reaches 0.30 A at 6 V. Line Y is less steep and reaches 0.12 A at 6 V.',
  },
  'p4-circuit-series': {
    type: 'diagram', kind: 'circuit', layout: 'series', title: 'Series circuit',
    supply: '12 V', resistors: ['4.0 Ω', '8.0 Ω'], ammeters: [''],
    values: { supplyV: 12, resistorsOhm: [4, 8] },
    alt_text: 'Circuit diagram. A 12 V cell, an ammeter and two resistors of 4.0 ohms and 8.0 ohms are connected in one series loop.',
  },
  'p4-circuit-parallel': {
    type: 'diagram', kind: 'circuit', layout: 'parallel', title: 'Parallel circuit',
    supply: '6.0 V', resistors: ['3.0 Ω', '6.0 Ω'], ammeters: ['A1', 'A2'],
    values: { supplyV: 6, resistorsOhm: [3, 6] },
    alt_text: 'Circuit diagram. A 6.0 V cell and ammeter A1 are in the main circuit. Two branches in parallel hold a 3.0 ohm resistor and a 6.0 ohm resistor with ammeter A2.',
  },
  'p3-wave-displacement': {
    type: 'graph', kind: 'displacement-distance', title: 'Displacement–distance graph for a wave',
    x: { label: 'distance / cm', min: 0, max: 20, grid: 1, tick: 2 },
    y: { label: 'displacement / cm', min: -3, max: 3, grid: 0.5, tick: 1 },
    series: [{ id: 'wave', style: 'solid', curve: true,
      points: Array.from({ length: 81 }, (_, i) => { const x = i * 0.25; return [x, +(2 * Math.sin((2 * Math.PI * x) / 8)).toFixed(4)]; }) }],
    alt_text: 'Displacement-distance graph for a transverse wave from 0 to 20 cm. The wave rises to 2 cm and falls to minus 2 cm, repeating every 8 cm.',
  },
  'p1-st-train': {
    type: 'graph', kind: 'speed-time', title: 'Speed–time graph for a train',
    x: { label: 'time / s', min: 0, max: 120, grid: 10, tick: 20 },
    y: { label: 'speed / m/s', min: 0, max: 40, grid: 5, tick: 10 },
    series: [{ id: 'train', style: 'solid', points: [[0, 10], [40, 30], [100, 30], [120, 20]] }],
    alt_text: 'Speed-time graph for a train. Speed rises in a straight line from 10 m/s at 0 s to 30 m/s at 40 s, stays at 30 m/s until 100 s, then falls to 20 m/s at 120 s.',
  },
};

const seriesAt = (id, sIdx, x) => {
  const pts = visuals[id].series[sIdx].points;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return fail(`x=${x} outside ${id}`);
};
const at = (id, x) => seriesAt(id, 0, x);
const gradient = (g, x0, x1) => (at(g, x1) - at(g, x0)) / (x1 - x0);
const area = (g, x0, x1, steps = 1000) => { let s = 0; const h = (x1 - x0) / steps; for (let i = 0; i < steps; i += 1) s += h * (at(g, x0 + i * h) + at(g, x0 + (i + 1) * h)) / 2; return s; };
const series = visuals['p4-circuit-series'].values;
const parallel = visuals['p4-circuit-parallel'].values;
const sig = (v, n = 2) => { const s = Number(v).toPrecision(n); if (/e/.test(s)) fail(`cannot format ${v} to ${n} s.f.`); return s; };
const num = (v, unit, n = 2) => `${sig(v, n).replace('-', '−')} ${unit}`;

const ELEC = ['science.physics.electricity', 'science.physics.electricity.circuits'];
const WAVE = ['science.physics.waves', 'science.physics.waves.properties'];
const MOTION = ['science.physics.motion-forces', 'science.physics.motion-forces.motion'];

const questions = [
  { n: 1, g: 'p4-iv-two-resistors', ref: 'P4.2.4.3', obj: 'P4.2.4', tier: 'supplement', diff: 'medium', comp: 'numerical-data', tax: ELEC, focus: 'resistance-from-current-voltage-graph',
    text: 'Use the graph to find the resistance of resistor X.',
    key: () => num(4 / seriesAt('p4-iv-two-resistors', 0, 4), 'Ω'), numeric: true, distractors: ['0.050 Ω', '0.80 Ω', '50 Ω'],
    explanation: 'Read one point on line X: at 4.0 V the current is 0.20 A. R = V ÷ I = 4.0 V ÷ 0.20 A = 20 Ω.' },
  { n: 2, g: 'p4-iv-two-resistors', ref: 'P4.2.4.3', obj: 'P4.2.4', tier: 'supplement', diff: 'medium', comp: 'representations', tax: ELEC, focus: 'compare-resistances-from-current-voltage-graph',
    text: 'Which statement about resistors X and Y is correct?',
    key: 'X has the smaller resistance, and both resistances stay constant.',
    order: ['X has the larger resistance, and both resistances stay constant.', 'Y has the smaller resistance, and both resistances increase.', 'X has the smaller resistance, and both resistances increase.', 'X has the smaller resistance, and both resistances stay constant.'],
    check: () => seriesAt('p4-iv-two-resistors', 0, 6) > seriesAt('p4-iv-two-resistors', 1, 6),
    explanation: 'Both graphs are straight lines through the origin, so each resistance is constant. X carries more current for the same p.d., so X has the smaller resistance.' },
  { n: 3, g: 'p4-circuit-series', ref: 'P4.3.2.3', obj: 'P4.3.2', tier: 'core', diff: 'easy', comp: 'numerical-data', tax: ELEC, focus: 'series-combined-resistance',
    text: 'What is the combined resistance of the two resistors in the circuit?',
    key: () => num(series.resistorsOhm[0] + series.resistorsOhm[1], 'Ω'), numeric: true, distractors: ['2.7 Ω', '4.0 Ω', '8.0 Ω'],
    explanation: 'In series, resistances add: 4.0 Ω + 8.0 Ω = 12 Ω.' },
  { n: 4, g: 'p4-circuit-series', ref: 'P4.2.4.1', obj: 'P4.2.4', tier: 'core', diff: 'medium', comp: 'problem-solving', tax: ELEC, focus: 'current-from-pd-and-total-resistance',
    text: 'What is the reading on the ammeter?',
    key: () => num(series.supplyV / (series.resistorsOhm[0] + series.resistorsOhm[1]), 'A'), numeric: true, distractors: ['1.5 A', '3.0 A', '4.5 A'],
    explanation: 'Total resistance = 4.0 Ω + 8.0 Ω = 12 Ω. I = V ÷ R = 12 V ÷ 12 Ω = 1.0 A. The current is the same everywhere in a series circuit.' },
  { n: 5, g: 'p4-circuit-parallel', ref: 'P4.3.2.8', obj: 'P4.3.2', tier: 'supplement', diff: 'hard', comp: 'numerical-data', tax: ELEC, focus: 'parallel-combined-resistance',
    text: 'What is the combined resistance of the two resistors in parallel?',
    key: () => num(1 / (1 / parallel.resistorsOhm[0] + 1 / parallel.resistorsOhm[1]), 'Ω'), numeric: true, distractors: ['0.50 Ω', '4.5 Ω', '9.0 Ω'],
    explanation: '1/R = 1/3.0 Ω + 1/6.0 Ω = 0.50 per Ω, so R = 2.0 Ω. The combined resistance is less than either resistor.' },
  { n: 6, g: 'p4-circuit-parallel', ref: 'P4.3.2.7', obj: 'P4.3.2', tier: 'supplement', diff: 'hard', comp: 'problem-solving', tax: ELEC, focus: 'parallel-junction-current',
    text: 'What is the reading on ammeter A1?',
    key: () => num(parallel.supplyV / parallel.resistorsOhm[0] + parallel.supplyV / parallel.resistorsOhm[1], 'A'), numeric: true, distractors: ['0.67 A', '1.0 A', '2.0 A'],
    explanation: 'Each branch has the full 6.0 V. Currents: 6.0 ÷ 3.0 = 2.0 A and 6.0 ÷ 6.0 = 1.0 A. A1 measures their sum: 3.0 A.' },
  { n: 7, g: 'p3-wave-displacement', ref: 'P3.1.3', obj: 'P3.1', tier: 'core', diff: 'easy', comp: 'representations', tax: WAVE, focus: 'amplitude-from-wave-graph',
    text: 'What is the amplitude of the wave?',
    key: () => num(Math.max(...visuals['p3-wave-displacement'].series[0].points.map(([, y]) => y)), 'cm', 1), numeric: true, distractors: ['3 cm', '4 cm', '8 cm'],
    explanation: 'Amplitude is the maximum displacement from the rest position: 2 cm. 4 cm is crest to trough, and 8 cm is the wavelength.' },
  { n: 8, g: 'p3-wave-displacement', ref: 'P3.1.3', obj: 'P3.1', tier: 'core', diff: 'medium', comp: 'representations', tax: WAVE, focus: 'wavelength-from-wave-graph',
    text: 'What is the wavelength of the wave?',
    key: () => num(8, 'cm', 1), numeric: true, distractors: ['2 cm', '4 cm', '16 cm'],
    check: () => approx(at('p3-wave-displacement', 2), 2) && approx(at('p3-wave-displacement', 10), 2),
    explanation: 'Wavelength is the distance between two neighbouring crests. The crests are at 2 cm and 10 cm, so the wavelength is 8 cm.' },
  { n: 9, g: 'p3-wave-displacement', ref: 'P3.1.5', obj: 'P3.1', tier: 'core', diff: 'hard', comp: 'problem-solving', tax: WAVE, focus: 'wave-speed-from-graph-and-frequency',
    text: 'The wave has a frequency of 5.0 Hz. Use the graph to find the speed of the wave.',
    key: () => num(5 * 0.08, 'm/s'), numeric: true, distractors: ['10 m/s', '40 m/s', '63 m/s'],
    explanation: 'v = f × λ. The wavelength is 8 cm = 0.08 m, so v = 5.0 Hz × 0.08 m = 0.40 m/s.' },
  { n: 10, g: 'p1-st-train', ref: 'P1.2.7', obj: 'P1.2', tier: 'core', diff: 'hard', comp: 'problem-solving', tax: MOTION, focus: 'distance-from-speed-time-area', existingFocus: true,
    text: 'Use the graph to find the distance the train travels in the first 40 s.',
    key: () => num(area('p1-st-train', 0, 40), 'm', 3), numeric: true, distractors: ['400 m', '1200 m', '1600 m'],
    explanation: 'The area from 0 s to 40 s is a trapezium: ½ × (10 m/s + 30 m/s) × 40 s = 800 m. Counting only the triangle on top gives 400 m.' },
  { n: 11, g: 'p1-st-train', ref: 'P1.2.11', obj: 'P1.2', tier: 'supplement', diff: 'hard', comp: 'numerical-data', tax: MOTION, focus: 'acceleration-from-speed-time-gradient', existingFocus: true,
    text: 'Use the graph to find the acceleration of the train in the first 40 s.',
    key: () => num(gradient('p1-st-train', 0, 40), 'm/s²'), numeric: true, distractors: ['0.25 m/s²', '0.75 m/s²', '2.0 m/s²'],
    explanation: 'Acceleration = change in speed ÷ time = (30 m/s − 10 m/s) ÷ 40 s = 0.50 m/s². The speed does not start at zero.' },
  { n: 12, g: 'p1-st-train', ref: 'P1.2.12', obj: 'P1.2', tier: 'supplement', diff: 'hard', comp: 'numerical-data', tax: MOTION, focus: 'deceleration-as-negative-acceleration', existingFocus: true,
    text: 'Use the graph to find the acceleration of the train between 100 s and 120 s.',
    key: () => num(gradient('p1-st-train', 100, 120), 'm/s²'), numeric: true, distractors: ['−10 m/s²', '−1.5 m/s²', '+0.50 m/s²'],
    explanation: 'Gradient = (20 m/s − 30 m/s) ÷ (120 s − 100 s) = −0.50 m/s². The negative sign shows the train is slowing down.' },
];

const focusNames = {
  'resistance-from-current-voltage-graph': 'Calculate resistance from a current-voltage graph',
  'compare-resistances-from-current-voltage-graph': 'Compare resistances using current-voltage graphs',
  'series-combined-resistance': 'Calculate the combined resistance of resistors in series',
  'current-from-pd-and-total-resistance': 'Calculate circuit current from p.d. and total resistance',
  'parallel-combined-resistance': 'Calculate the combined resistance of two resistors in parallel',
  'parallel-junction-current': 'Calculate supply current as the sum of parallel branch currents',
  'amplitude-from-wave-graph': 'Read the amplitude of a wave from a displacement-distance graph',
  'wavelength-from-wave-graph': 'Read the wavelength of a wave from a displacement-distance graph',
  'wave-speed-from-graph-and-frequency': 'Calculate wave speed from a wave graph and its frequency',
  'distance-from-speed-time-area': 'Calculate distance from the area under a speed-time graph',
  'acceleration-from-speed-time-gradient': 'Calculate acceleration from the gradient of a speed-time graph',
  'deceleration-as-negative-acceleration': 'Express deceleration as a negative acceleration from a graph',
};

// -------------------------------------------------------------------- build
rmSync(assetDir, { recursive: true, force: true });
mkdirSync(assetDir, { recursive: true });
const assets = Object.entries(visuals).map(([assetId, spec]) => {
  const svg = spec.type === 'graph' ? renderGraph(spec) : renderCircuit(spec);
  const hash = sha256(svg);
  const file = `${assetId}.${hash.slice(0, 12)}.svg`;
  writeFileSync(path.join(assetDir, file), svg);
  const publicPath = `/question-assets/${ASSET_DIR}/${file}`;
  if (/correct answer|the answer is/i.test(spec.alt_text) || spec.alt_text.length < 20 || spec.alt_text.length > 240) fail(`bad alt text ${assetId}`);
  return { assetId, sourceFile: `public${publicPath}`, publicPath, publicUrl: `https://www.brainsheist.com${publicPath}`, mimeType: 'image/svg+xml', sha256: hash, width: W, height: H, altText: spec.alt_text, license: 'Brains Heist original educational artwork', source: 'Brains Heist Visual System' };
});
const assetById = new Map(assets.map((a) => [a.assetId, a]));

const parseNum = (s) => Number(String(s).replace('−', '-').replace('+', '').split(' ')[0]);
const letters = 'ABCD';
const position = { A: 0, B: 0, C: 0, D: 0 };
const pkgQuestions = questions.map((q) => {
  const key = typeof q.key === 'function' ? q.key() : q.key;
  if (q.check && !q.check()) fail(`Q${q.n} visual check failed`);
  let options;
  if (q.numeric) {
    options = [key, ...q.distractors];
    if (new Set(options.map((o) => o.split(' ').slice(1).join(' '))).size !== 1) fail(`Q${q.n} mixes units`);
    options.sort((a, b) => parseNum(a) - parseNum(b));
    if (new Set(options.map(parseNum)).size !== 4) fail(`Q${q.n} numeric options not distinct`);
  } else options = q.order;
  if (options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4 || !options.includes(key)) fail(`Q${q.n} options invalid: ${key} / ${options}`);
  position[letters[options.indexOf(key)]] += 1;
  const asset = assetById.get(q.g);
  const [skill, subskill] = q.tax;
  const focusName = focusNames[q.focus];
  return {
    externalId: `bh-physics-0654-graphs2-${String(q.n).padStart(3, '0')}`,
    topic: { P1: 'P1 Motion, forces and energy', P3: 'P3 Waves', P4: 'P4 Electricity and magnetism' }[q.obj.slice(0, 2)],
    questionText: q.text,
    questionType: 'multiple_choice',
    options,
    correctAnswer: key,
    explanation: q.explanation,
    difficulty: q.diff,
    points: 1,
    timeLimit: q.diff === 'hard' ? 120 : q.diff === 'medium' ? 90 : 60,
    language: 'en',
    eligibleGrades: [9, 10, 11],
    curriculumPhase: 'upper_secondary',
    tags: ['Physics', 'Co-ordinated Sciences', '0654', q.tier, visuals[q.g].type],
    visualAssetId: asset.assetId,
    imageUrl: asset.publicUrl,
    imageAltText: asset.altText,
    visualAssetSha256: asset.sha256,
    visualSpec: visuals[q.g],
    curriculumObjectiveCode: q.obj.toLowerCase().replace(/\./g, '-'),
    taxonomies: [{
      primarySkillCode: skill,
      atomicSubskillCode: subskill,
      evidenceFocusCode: `${subskill}.focus.${q.focus}`,
      assessmentProcessCode: 'BH-AO2',
      cognitiveProcess: 'apply',
      evidenceStatement: `A correct response supports the ability to ${focusName.charAt(0).toLowerCase()}${focusName.slice(1)}. It does not identify every reasoning step or establish mastery alone.`,
    }],
    assessmentProfile: {
      providerName: 'Cambridge International Education',
      programmeCode: '0654',
      sourceVersion: '2025-2027',
      paperComponent: q.tier === 'core' ? 'paper_1' : 'paper_2',
      evidenceMode: 'mcq',
      primaryAssessmentObjective: 'AO2',
      assessmentObjectives: ['AO2'],
      syllabusTier: q.tier,
      syllabusReference: q.ref,
      objectiveComponents: [`BH-CIE0654-AO2-${q.comp}`],
      sourceReference: `Original Brains Heist question; aligned to ${q.ref}; ${SYLLABUS_URL}. Not a Cambridge exam item or endorsement.`,
    },
  };
});

if (Object.values(position).some((v) => v !== pkgQuestions.length / 4)) fail(`A-D balance broken: ${JSON.stringify(position)}`);
for (const a of assets) if (!pkgQuestions.some((q) => q.visualAssetId === a.assetId)) fail(`unused asset ${a.assetId}`);

const pkg = {
  schemaVersion: 2,
  packageId: 'bh-physics-0654-graphs-2',
  packageVersion: PACKAGE_VERSION,
  contentVersion: 'physics-0654-graphs-2-v1',
  registryVersion: 'bh-science-core-v1',
  subjectCode: 'physics',
  authority: 'PENDING OWNER RELEASE - Brains Heist AI-drafted',
  releaseNotes: '12 original AI-drafted 0654 Physics questions: P4 current-voltage graphs and circuit diagrams, a P3 wave graph and a harder P1 speed-time graph. 5 checksum-addressed SVG visuals drawn from stored data; keys recomputed by build.mjs.',
  assetBaseUrl: 'https://www.brainsheist.com',
  assetDirectory: ASSET_DIR,
  assets,
  questions: pkgQuestions,
};
writeFileSync(path.join(pkgDir, 'candidate-package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

const newFocuses = questions.filter((q) => !q.existingFocus).map((q) => ({ code: `${q.tax[1]}.focus.${q.focus}`, subskillCode: q.tax[1], name: focusNames[q.focus] }))
  .filter((f, i, all) => all.findIndex((g) => g.code === f.code) === i)
  .map((f) => ({ ...f, description: `Evidence that the learner can ${f.name.charAt(0).toLowerCase()}${f.name.slice(1)}.`, applicablePhases: ['upper_secondary'] }));
writeFileSync(path.join(pkgDir, 'focus-proposal.json'), `${JSON.stringify(newFocuses, null, 2)}\n`);
const sql = [
  '-- Additive Evidence Focus release for 0654 Physics graph set 2. Run before importing it.',
  '-- Owner-authorised content release; never edits or removes existing registry rows.',
  ...newFocuses.map((f) => `insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'${f.code}','${f.name}','${f.description}',
array['upper_secondary'],'human_governed','${sha256(`${f.code}|${f.name}|${f.description}`)}','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='${f.subskillCode}'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;`),
].join('\n\n');
writeFileSync(path.join(pkgDir, 'focus-release.sql'), `${sql}\n`);

console.log(`built ${pkgQuestions.length} questions, ${assets.length} visuals, A-D ${JSON.stringify(position)}, ${newFocuses.length} new focuses`);
