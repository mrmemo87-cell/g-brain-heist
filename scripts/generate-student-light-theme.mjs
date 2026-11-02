#!/usr/bin/env node
// Generates src/styles/student-light-theme.generated.css: the utility-class remaps for the
// student "Light" appearance. It scans the student-facing sources for every Tailwind colour
// utility they use and emits an override for each dark-intended one, scoped to body.student-light.
// Run: node scripts/generate-student-light-theme.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const files = [
  ...globSync('components/**/*.tsx'),
  ...globSync('src/**/*.tsx'),
  'App.tsx',
].filter((f) => !/\/ielts\/|Ielts|admin|teacher|SchoolHead|superadmin/i.test(f));

const GREYS = 'white|black|slate|gray|zinc|neutral|stone';
const ACCENTS = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const re = new RegExp(`(?<![\\w-])((?:[\\w-]+:)*)(bg|text|border|ring|from|via|to|divide|placeholder)-(${GREYS}|${ACCENTS})(?:-(\\d{2,3}))?(?:/(\\d{1,3}))?(?![\\w-])`, 'g');

const seen = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const [, variants, prop, color, shade, alpha] = m;
    const key = `${prop}-${color}${shade ? `-${shade}` : ''}${alpha ? `/${alpha}` : ''}`;
    if (!seen.has(key)) seen.set(key, new Set());
    for (const v of variants.split(':').filter(Boolean)) seen.get(key).add(v);
  }
}

const INK = { 900: '#0f172a', 800: '#1e293b', 700: '#334155', 600: '#475569', 500: '#64748b', 400: '#94a3b8' };
const SURFACE = { page: '#f8fafc', card: '#ffffff', sunk: '#f1f5f9', line: '#e2e8f0', lineStrong: '#cbd5e1' };

/** Returns the light-mode CSS value for a dark-intended class, or null to leave it alone. */
function remap(prop, color, shade, alpha) {
  const n = shade ? Number(shade) : null;
  const a = alpha ? Number(alpha) : 100;
  const grey = /^(slate|gray|zinc|neutral|stone)$/.test(color);
  if (prop === 'bg') {
    if (color === 'white') return a < 100 ? `rgba(15, 23, 42, ${(a / 100) * 0.5})` : null; // subtle highlight → subtle tint
    if (color === 'black') return a >= 50 ? null : SURFACE.sunk; // ≥50 is a modal scrim: keep
    if (grey) {
      if (n >= 900) return a < 100 && a <= 40 ? `rgba(255, 255, 255, ${Math.max(0.7, a / 100)})` : SURFACE.card;
      if (n >= 700) return SURFACE.sunk;
      if (n === 600) return SURFACE.line;
      if (n === 500) return SURFACE.lineStrong;
      return null;
    }
    // Accents: dark tinted panels (900/950) become light tints; everything else already reads on white.
    if (n >= 900) return `color-mix(in srgb, var(--sl-${color}-600) 10%, white)`;
    return null;
  }
  if (prop === 'text' || prop === 'placeholder') {
    if (color === 'white') return a < 100 ? `rgba(15, 23, 42, ${Math.max(0.55, a / 100)})` : INK[900];
    if (color === 'black') return null;
    if (grey) {
      if (n <= 200) return INK[800];
      if (n === 300) return INK[700];
      if (n === 400) return INK[600];
      if (n === 500) return INK[500];
      return null;
    }
    // Pastel accent text (50–400) is unreadable on white: deepen it.
    if (n <= 200) return `var(--sl-${color}-700)`;
    if (n === 300) return `var(--sl-${color}-700)`;
    if (n === 400) return `var(--sl-${color}-600)`;
    return null;
  }
  if (prop === 'border' || prop === 'ring' || prop === 'divide') {
    if (color === 'white') return a <= 25 ? SURFACE.line : SURFACE.lineStrong;
    if (color === 'black') return SURFACE.line;
    if (grey) {
      if (n >= 700) return SURFACE.line;
      if (n >= 400) return SURFACE.lineStrong;
      return null;
    }
    return null;
  }
  if (prop === 'from' || prop === 'via' || prop === 'to') {
    if (color === 'black') return a >= 50 && a < 100 ? null : SURFACE.sunk; // solid black gradient stops become a light surface
    if (color === 'white') return a < 100 ? `rgba(15, 23, 42, ${(a / 100) * 0.4})` : null;
    if (grey) {
      if (n >= 900) return SURFACE.card;
      if (n >= 700) return SURFACE.sunk;
      if (n >= 500) return SURFACE.line;
      return null;
    }
    if (n >= 900) return `color-mix(in srgb, var(--sl-${color}-600) 12%, white)`;
    return null;
  }
  return null;
}

const esc = (cls) => cls.replace(/\//g, '\\/').replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
const VARIANT_SUFFIX = { hover: ':hover', focus: ':focus', 'focus-visible': ':focus-visible', active: ':active', disabled: ':disabled' };
const propCss = (prop, value) => {
  switch (prop) {
    case 'bg': return `background-color: ${value} !important;`;
    case 'text': return `color: ${value} !important;`;
    case 'placeholder': return `color: ${value} !important;`;
    case 'border': return `border-color: ${value} !important;`;
    case 'divide': return `border-color: ${value} !important;`;
    case 'ring': return `--tw-ring-color: ${value} !important;`;
    case 'from': return `--tw-gradient-from: ${value} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;`;
    case 'via': return `--tw-gradient-stops: var(--tw-gradient-from), ${value}, var(--tw-gradient-to) !important;`;
    case 'to': return `--tw-gradient-to: ${value} !important;`;
    default: return '';
  }
};

let out = `/* GENERATED by scripts/generate-student-light-theme.mjs — do not edit by hand.
 * Light appearance for student school surfaces: remaps the dark-intended Tailwind colour
 * utilities the student screens use. Active only while <body class="student-light">.
 */\n`;
let count = 0;
for (const [key, variants] of [...seen.entries()].sort()) {
  const m = key.match(/^(\w+)-(\w+?)(?:-(\d{2,3}))?(?:\/(\d{1,3}))?$/);
  if (!m) continue;
  const [, prop, color, shade, alpha] = m;
  const value = remap(prop, color, shade, alpha);
  if (!value) continue;
  const decl = propCss(prop, value);
  if (!decl) continue;
  const selectors = [`html body.student-light .${esc(key)}`];
  if (prop === 'placeholder') selectors[0] += '::placeholder';
  if (prop === 'divide') selectors[0] += ' > :not([hidden]) ~ :not([hidden])';
  for (const v of variants) {
    if (VARIANT_SUFFIX[v]) selectors.push(`html body.student-light .${esc(`${v}:${key}`)}${VARIANT_SUFFIX[v]}`);
  }
  out += `${selectors.join(',\n')} { ${decl} }\n`;
  count += 1;
}
writeFileSync('src/styles/student-light-theme.generated.css', out);
console.log(`student light theme: ${count} utility remaps from ${seen.size} colour classes in ${files.length} files`);
