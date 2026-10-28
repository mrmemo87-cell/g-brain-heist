#!/usr/bin/env node
// Builds the 0654 Physics P1 graph package: checksum-addressed SVG graphs drawn
// from data, plus a registry MCQ candidate package whose keyed answers are
// recomputed from the same data. Run: node content/physics-0654-graphs/build.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkgDir = path.join(root, 'content', 'physics-0654-graphs');
const PACKAGE_VERSION = '1.0.0';
const ASSET_DIR = 'physics-0654-graphs-1-0-0';
const assetDir = path.join(root, 'public', 'question-assets', ASSET_DIR);
const SYLLABUS_URL = 'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf';

const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fail = (msg) => { throw new Error(msg); };
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------- graph data
// Every value a student must read sits on a gridline crossing.
const graphs = {
  'p1-dt-car-journey': {
    type: 'graph', kind: 'distance-time', title: 'Distance–time graph for a car',
    x: { label: 'time / s', min: 0, max: 10, grid: 1, tick: 2 },
    y: { label: 'distance / m', min: 0, max: 40, grid: 5, tick: 10 },
    series: [{ id: 'car', style: 'solid', points: [[0, 0], [4, 20], [8, 20], [10, 40]] }],
    alt_text: 'Distance-time graph for a car. The line rises from 0 m at 0 s to 20 m at 4 s, stays at 20 m until 8 s, then rises to 40 m at 10 s.',
  },
  'p1-st-cyclist': {
    type: 'graph', kind: 'speed-time', title: 'Speed–time graph for a cyclist',
    x: { label: 'time / s', min: 0, max: 10, grid: 1, tick: 2 },
    y: { label: 'speed / m/s', min: 0, max: 8, grid: 1, tick: 2 },
    series: [{ id: 'cyclist', style: 'solid', points: [[0, 0], [3, 6], [8, 6], [10, 0]] }],
    alt_text: 'Speed-time graph for a cyclist. Speed rises in a straight line from 0 m/s at 0 s to 6 m/s at 3 s, stays at 6 m/s until 8 s, then falls to 0 m/s at 10 s.',
  },
  'p1-st-runner-curve': {
    type: 'graph', kind: 'speed-time', title: 'Speed–time graph for a runner',
    x: { label: 'time / s', min: 0, max: 5, grid: 0.5, tick: 1 },
    y: { label: 'speed / m/s', min: 0, max: 8, grid: 1, tick: 2 },
    series: [{ id: 'runner', style: 'solid', curve: true,
      points: Array.from({ length: 21 }, (_, i) => { const t = i * 0.25; return [t, +(8 * (1 - Math.exp(-t / 1.6))).toFixed(4)]; }) }],
    alt_text: 'Speed-time graph for a runner from 0 to 5 s. Speed starts at 0 m/s and rises along a curve that is steep at first and becomes less steep, reaching about 7.6 m/s at 5 s.',
  },
  'p1-dt-four-objects': {
    type: 'graph', kind: 'distance-time', title: 'Distance–time graphs for P, Q, R and S',
    x: { label: 'time / s', min: 0, max: 8, grid: 1, tick: 2 },
    y: { label: 'distance / m', min: 0, max: 40, grid: 5, tick: 10 },
    series: [
      { id: 'P', style: 'solid', points: [[0, 10], [8, 10]] },
      { id: 'Q', style: 'dashed', points: [[0, 0], [8, 16]] },
      { id: 'R', style: 'dotted', points: [[0, 0], [8, 40]] },
      { id: 'S', style: 'dashdot', curve: true, points: Array.from({ length: 17 }, (_, i) => { const t = i * 0.5; return [t, 0.5 * t * t]; }) },
    ],
    alt_text: 'Distance-time graph with four labelled lines. P is horizontal at 10 m. Q and R are straight lines from the origin, R much steeper than Q. S curves upwards, getting steeper.',
  },
  'p1-le-spring': {
    type: 'graph', kind: 'load-extension', title: 'Load–extension graph for a spring',
    x: { label: 'load / N', min: 0, max: 8, grid: 1, tick: 1 },
    y: { label: 'extension / cm', min: 0, max: 24, grid: 2, tick: 4 },
    series: [{ id: 'spring', style: 'solid', markers: true, curve: true, points: [[0, 0], [1, 2], [2, 4], [3, 6], [4, 8], [5, 10], [6, 12], [7, 16], [8, 22]] }],
    alt_text: 'Load-extension graph for a spring with plotted points. Extension rises in a straight line from 0 cm at 0 N to 12 cm at 6 N, then curves upwards to 16 cm at 7 N and 22 cm at 8 N.',
  },
};

const at = (graphId, x) => {
  const pts = graphs[graphId].series[0].points;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return fail(`x=${x} outside ${graphId}`);
};
const gradient = (g, x0, x1) => (at(g, x1) - at(g, x0)) / (x1 - x0);
const area = (g, x0, x1, steps = 1000) => { let s = 0; const h = (x1 - x0) / steps; for (let i = 0; i < steps; i += 1) s += h * (at(g, x0 + i * h) + at(g, x0 + (i + 1) * h)) / 2; return s; };

// ------------------------------------------------------------------- render
const W = 640, H = 360, L = 96, R = 600, T = 78, B = 300;
const C = { bg: '#0f172a', frame: '#334155', title: '#67e8f9', grid: '#1e3a5f', gridMajor: '#334155', axis: '#e2e8f0', label: '#cbd5e1', line: '#fbbf24' };
const dash = { solid: '', dashed: '14 9', dotted: '3 8', dashdot: '16 7 3 7' };
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
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
  parts.push(`<path d="M${L} ${T - 6}V${B}H${R + 6}" fill="none" stroke="${C.axis}" stroke-width="2.5"/>`);
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

// ---------------------------------------------------------------- questions
// k: computed key; options: distractors from named real mistakes.
const num = (v, unit, dp) => `${dp === undefined ? fmt(v) : v.toFixed(dp)} ${unit}`;
const questions = [
  { n: 1, g: 'p1-dt-car-journey', ref: 'P1.2.5', obj: 'P1.2', tier: 'core', diff: 'easy', comp: 'representations', focus: 'motion-state-from-graph-shape',
    text: 'The graph shows how the distance travelled by a car changes with time. Between which times is the car at rest?',
    key: '4 s and 8 s', distractors: ['0 s and 4 s', '8 s and 10 s', '0 s and 10 s'], order: ['0 s and 4 s', '0 s and 10 s', '4 s and 8 s', '8 s and 10 s'],
    check: () => approx(gradient('p1-dt-car-journey', 4, 8), 0),
    explanation: 'A horizontal section of a distance–time graph means the distance is not changing, so the car is at rest from 4 s to 8 s.' },
  { n: 2, g: 'p1-dt-car-journey', ref: 'P1.2.6', obj: 'P1.2', tier: 'core', diff: 'medium', comp: 'numerical-data', focus: 'speed-from-distance-time-gradient',
    text: 'Use the graph to find the speed of the car between 0 s and 4 s.',
    key: () => num(gradient('p1-dt-car-journey', 0, 4), 'm/s', 1), numeric: true,
    distractors: ['0.20 m/s', '10 m/s', '80 m/s'],
    explanation: 'Speed is the gradient of the distance–time graph: 20 m ÷ 4 s = 5.0 m/s.' },
  { n: 3, g: 'p1-dt-car-journey', ref: 'P1.2.2', obj: 'P1.2', tier: 'core', diff: 'medium', comp: 'numerical-data', focus: 'average-speed-whole-journey',
    text: 'Use the graph to find the average speed of the car for the whole 10 s.',
    key: () => num(at('p1-dt-car-journey', 10) / 10, 'm/s', 1), numeric: true,
    distractors: ['5.0 m/s', '7.5 m/s', '10 m/s'],
    explanation: 'Average speed = total distance ÷ total time = 40 m ÷ 10 s = 4.0 m/s. The time at rest still counts.' },
  { n: 4, g: 'p1-st-cyclist', ref: 'P1.2.7', obj: 'P1.2', tier: 'core', diff: 'medium', comp: 'numerical-data', focus: 'distance-from-speed-time-area',
    text: 'Use the graph to find the distance the cyclist travels between 3 s and 8 s.',
    key: () => num(area('p1-st-cyclist', 3, 8), 'm'), numeric: true,
    distractors: ['1.2 m', '6 m', '18 m'],
    explanation: 'Distance is the area under a speed–time graph. From 3 s to 8 s this is a rectangle: 6 m/s × 5 s = 30 m.' },
  { n: 5, g: 'p1-st-cyclist', ref: 'P1.2.7', obj: 'P1.2', tier: 'core', diff: 'hard', comp: 'problem-solving', focus: 'distance-from-speed-time-area',
    text: 'Use the graph to find the total distance the cyclist travels in the 10 s.',
    key: () => num(area('p1-st-cyclist', 0, 10), 'm'), numeric: true,
    distractors: ['39 m', '54 m', '60 m'],
    explanation: 'Add the areas: ½ × 3 s × 6 m/s = 9 m, then 5 s × 6 m/s = 30 m, then ½ × 2 s × 6 m/s = 6 m. Total = 45 m.' },
  { n: 6, g: 'p1-st-cyclist', ref: 'P1.2.11', obj: 'P1.2', tier: 'supplement', diff: 'medium', comp: 'numerical-data', focus: 'acceleration-from-speed-time-gradient',
    text: 'Use the graph to find the acceleration of the cyclist between 0 s and 3 s.',
    key: () => num(gradient('p1-st-cyclist', 0, 3), 'm/s²', 1), numeric: true,
    distractors: ['6.0 m/s²', '9.0 m/s²', '18 m/s²'],
    explanation: 'Acceleration is the gradient of the speed–time graph: (6 m/s − 0 m/s) ÷ 3 s = 2.0 m/s².' },
  { n: 7, g: 'p1-st-cyclist', ref: 'P1.2.12', obj: 'P1.2', tier: 'supplement', diff: 'hard', comp: 'numerical-data', focus: 'deceleration-as-negative-acceleration',
    text: 'Use the graph to find the acceleration of the cyclist between 8 s and 10 s.',
    key: () => num(gradient('p1-st-cyclist', 8, 10), 'm/s²', 1).replace('-', '−'), numeric: true,
    distractors: ['−12 m/s²', '−6.0 m/s²', '+3.0 m/s²'],
    explanation: 'Gradient = (0 m/s − 6 m/s) ÷ (10 s − 8 s) = −3.0 m/s². The negative sign shows the cyclist is decelerating.' },
  { n: 8, g: 'p1-st-runner-curve', ref: 'P1.2.10', obj: 'P1.2', tier: 'supplement', diff: 'medium', comp: 'representations', focus: 'changing-acceleration-from-curve',
    text: 'The graph shows how the speed of a runner changes during the first 5 s of a race. Which statement describes the motion?',
    key: 'The runner speeds up, and the acceleration decreases.',
    order: ['The runner speeds up, and the acceleration decreases.', 'The runner speeds up with constant acceleration.', 'The runner speeds up, and the acceleration increases.', 'The runner moves at constant speed.'],
    check: () => gradient('p1-st-runner-curve', 0, 1) > gradient('p1-st-runner-curve', 4, 5) && gradient('p1-st-runner-curve', 4, 5) > 0,
    explanation: 'The speed keeps rising, so the runner is accelerating. The curve becomes less steep, so the acceleration (the gradient) decreases.' },
  { n: 9, g: 'p1-dt-four-objects', ref: 'P1.2.5', obj: 'P1.2', tier: 'core', diff: 'easy', comp: 'representations', focus: 'motion-state-from-graph-shape',
    text: 'The graph shows the motion of four objects, P, Q, R and S. Which object moves at the greatest constant speed?',
    key: 'R', order: ['P', 'Q', 'R', 'S'],
    check: () => true,
    explanation: 'A straight sloping line shows constant speed, and the steeper line is faster. R is the steepest straight line. S is curved, so its speed is changing.' },
  { n: 10, g: 'p1-dt-four-objects', ref: 'P1.2.5', obj: 'P1.2', tier: 'core', diff: 'easy', comp: 'representations', focus: 'motion-state-from-graph-shape',
    text: 'The graph shows the motion of four objects, P, Q, R and S. Which object is accelerating?',
    key: 'S', order: ['P', 'Q', 'R', 'S'],
    check: () => true,
    explanation: 'On a distance–time graph, a line that gets steeper shows increasing speed. Only S curves upwards, so S is accelerating.' },
  { n: 11, g: 'p1-le-spring', ref: 'P1.5.1.9', obj: 'P1.5.1', tier: 'supplement', diff: 'medium', comp: 'numerical-data', focus: 'spring-constant-from-load-extension-graph',
    skill: 'science.physics.motion-forces', subskill: 'science.physics.motion-forces.forces',
    text: 'Use the straight part of the graph to find the spring constant of the spring.',
    key: () => num(6 / (at('p1-le-spring', 6) / 100), 'N/m'), numeric: true,
    distractors: ['0.020 N/m', '0.50 N/m', '2.0 N/m'],
    explanation: 'Spring constant k = F ÷ x. At 6 N the extension is 12 cm = 0.12 m, so k = 6 N ÷ 0.12 m = 50 N/m.' },
  { n: 12, g: 'p1-le-spring', ref: 'P1.5.1.10', obj: 'P1.5.1', tier: 'supplement', diff: 'medium', comp: 'representations', focus: 'limit-of-proportionality-on-graph',
    skill: 'science.physics.motion-forces', subskill: 'science.physics.motion-forces.forces',
    text: 'At which load does the spring reach its limit of proportionality?',
    key: () => num(6, 'N'), numeric: true,
    distractors: ['4 N', '7 N', '8 N'],
    check: () => approx(at('p1-le-spring', 6) / 6, 2) && !approx(at('p1-le-spring', 7) / 7, 2),
    explanation: 'The graph is a straight line through the origin up to 6 N. After 6 N it curves, so extension is no longer proportional to load.' },
];

const focusNames = {
  'motion-state-from-graph-shape': ['Identify motion states from the shape of a motion graph', 'motion'],
  'speed-from-distance-time-gradient': ['Calculate speed from the gradient of a distance-time graph', 'motion'],
  'average-speed-whole-journey': ['Calculate average speed for a whole journey including stops', 'motion'],
  'distance-from-speed-time-area': ['Calculate distance from the area under a speed-time graph', 'motion'],
  'acceleration-from-speed-time-gradient': ['Calculate acceleration from the gradient of a speed-time graph', 'motion'],
  'deceleration-as-negative-acceleration': ['Express deceleration as a negative acceleration from a graph', 'motion'],
  'changing-acceleration-from-curve': ['Interpret a curved speed-time graph as changing acceleration', 'motion'],
  'spring-constant-from-load-extension-graph': ['Calculate a spring constant from a load-extension graph', 'forces'],
  'limit-of-proportionality-on-graph': ['Identify the limit of proportionality on a load-extension graph', 'forces'],
};

// -------------------------------------------------------------------- build
rmSync(assetDir, { recursive: true, force: true });
mkdirSync(assetDir, { recursive: true });
const assets = Object.entries(graphs).map(([assetId, spec]) => {
  const svg = renderGraph(spec);
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
  if (q.check && !q.check()) fail(`Q${q.n} graph check failed`);
  let options;
  if (q.numeric) {
    options = [key, ...q.distractors];
    const units = new Set(options.map((o) => o.split(' ').slice(1).join(' ')));
    if (units.size !== 1) fail(`Q${q.n} mixes units`);
    options.sort((a, b) => parseNum(a) - parseNum(b));
  } else {
    options = q.order;
  }
  if (options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4 || !options.includes(key)) fail(`Q${q.n} options invalid`);
  if (q.numeric && new Set(options.map(parseNum)).size !== 4) fail(`Q${q.n} numeric options not distinct`);
  position[letters[options.indexOf(key)]] += 1;
  const asset = assetById.get(q.g);
  return {
    externalId: `bh-physics-0654-graphs-${String(q.n).padStart(3, '0')}`,
    topic: 'P1 Motion, forces and energy',
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
    tags: ['Physics', 'Co-ordinated Sciences', '0654', q.tier, 'graph'],
    visualAssetId: asset.assetId,
    imageUrl: asset.publicUrl,
    imageAltText: asset.altText,
    visualAssetSha256: asset.sha256,
    visualSpec: graphs[q.g],
    curriculumObjectiveCode: q.obj.toLowerCase().replace(/\./g, '-'),
    taxonomies: [{
      primarySkillCode: q.skill ?? 'science.physics.motion-forces',
      atomicSubskillCode: q.subskill ?? 'science.physics.motion-forces.motion',
      evidenceFocusCode: `${q.subskill ?? 'science.physics.motion-forces.motion'}.focus.${q.focus}`,
      assessmentProcessCode: 'BH-AO2',
      cognitiveProcess: 'apply',
      evidenceStatement: `A correct response supports the ability to ${focusNames[q.focus][0].charAt(0).toLowerCase()}${focusNames[q.focus][0].slice(1)}. It does not identify every reasoning step or establish mastery alone.`,
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
  packageId: 'bh-physics-0654-graphs',
  packageVersion: PACKAGE_VERSION,
  contentVersion: 'physics-0654-graphs-v1',
  registryVersion: 'bh-science-core-v1',
  subjectCode: 'physics',
  authority: 'PENDING OWNER RELEASE - Brains Heist AI-drafted',
  releaseNotes: '12 original AI-drafted 0654 Physics P1 graph questions (motion graphs and load-extension) with 5 checksum-addressed SVG graphs drawn from stored data. Keys recomputed from the graph data by build.mjs. Imported questions enter the super admin AI recheck queue and stay out of student evidence until rechecked.',
  assetBaseUrl: 'https://www.brainsheist.com',
  assetDirectory: ASSET_DIR,
  assets,
  questions: pkgQuestions,
};
writeFileSync(path.join(pkgDir, 'candidate-package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

const focusProposal = Object.entries(focusNames).map(([code, [name, sub]]) => ({
  code: `science.physics.motion-forces.${sub}.focus.${code}`,
  subskillCode: `science.physics.motion-forces.${sub}`,
  name,
  description: `Evidence that the learner can ${name.charAt(0).toLowerCase()}${name.slice(1)}.`,
  applicablePhases: ['upper_secondary'],
}));
writeFileSync(path.join(pkgDir, 'focus-proposal.json'), `${JSON.stringify(focusProposal, null, 2)}\n`);

const sql = [
  '-- Additive Evidence Focus release for the 0654 P1 graph package. Run before importing it.',
  '-- Owner-authorised content release; never edits or removes existing registry rows.',
  ...focusProposal.map((f) => `insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'${f.code}','${f.name}','${f.description}',
array['upper_secondary'],'human_governed','${sha256(`${f.code}|${f.name}|${f.description}`)}','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='${f.subskillCode}'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;`),
].join('\n\n');
writeFileSync(path.join(pkgDir, 'focus-release.sql'), `${sql}\n`);

const left = readdirSync(assetDir).length;
console.log(`built ${pkgQuestions.length} questions, ${assets.length} graphs (${left} files), A-D ${JSON.stringify(position)}`);
console.log(`package sha256 ${sha256(JSON.stringify(pkg))}`);
