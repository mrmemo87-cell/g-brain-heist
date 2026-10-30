/**
 * Printable Class Conquest certificates and badges.
 *
 * Pure string builders (no DOM), so they can be unit tested and reused by the
 * teacher page. The teacher prints from a standalone document so the browser's
 * own print dialog produces an identical A4 landscape PDF everywhere.
 */

import { addDays, mapById, roleForRank, SCORING_DAYS, type ConquestResult, type ConquestWinner } from './classConquest';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** "26 Oct – 30 Oct 2026": the scoring week, Monday to Friday. */
export const weekLabel = (weekStart: string) => {
  const end = addDays(weekStart, SCORING_DAYS - 1);
  const sameYear = weekStart.slice(0, 4) === end.slice(0, 4);
  const start = sameYear ? `${Number(weekStart.slice(8, 10))} ${MONTHS[Number(weekStart.slice(5, 7)) - 1]}` : prettyDate(weekStart);
  return `${start} – ${prettyDate(end)}`;
};

export interface BadgeOptions {
  /** gold = top five of the winning class, silver = member of the winning class, oracle = predicted the winner. */
  kind: 'gold' | 'silver' | 'oracle';
  mapId: string;
  /** 1–5 for gold badges; shown in the ribbon. */
  rank?: number | null;
  /** Short label under the flag, e.g. "W44" or the class name. */
  caption?: string;
  size?: number;
}

/** A shield-shaped badge as inline SVG markup. The flag is the map's; gold shows the heist role rank. */
export function conquestBadgeSvg({ kind, mapId, rank, caption, size = 96 }: BadgeOptions): string {
  const map = mapById(mapId);
  const gold = kind === 'gold';
  const fill = gold ? '#f5c042' : kind === 'oracle' ? '#c084fc' : '#c7d2e0';
  const dark = gold ? '#9a6b05' : kind === 'oracle' ? '#6b21a8' : '#5b6b80';
  const rankText = gold && rank ? `#${rank}` : '';
  const title = gold ? `${roleForRank(rank ?? 1)} · ${map.name}` : kind === 'oracle' ? `Oracle · ${map.name}` : `${map.name} conqueror`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 116" width="${size}" height="${Math.round(size * 1.16)}" role="img" aria-label="${escapeHtml(title)}">`
    + `<defs><linearGradient id="g-${kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`
    + `<path d="M50 4 L92 18 V58 C92 84 72 102 50 112 C28 102 8 84 8 58 V18 Z" fill="url(#g-${kind})" stroke="${dark}" stroke-width="3"/>`
    + `<path d="M50 14 L82 25 V57 C82 77 66 92 50 100 C34 92 18 77 18 57 V25 Z" fill="#0f172a" opacity="0.92"/>`
    + `<text x="50" y="58" text-anchor="middle" font-size="34" font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${map.flag}</text>`
    + (rankText ? `<rect x="30" y="68" width="40" height="16" rx="8" fill="${fill}"/><text x="50" y="80" text-anchor="middle" font-size="11" font-weight="800" fill="#0f172a" font-family="Inter,'IBM Plex Sans',system-ui,sans-serif">${rankText}</text>` : '')
    + (caption ? `<text x="50" y="${rankText ? 94 : 84}" text-anchor="middle" font-size="8" font-weight="800" fill="${fill}" font-family="Inter,'IBM Plex Sans',system-ui,sans-serif">${escapeHtml(caption)}</text>` : '')
    + '</svg>';
}

export type CertificateTheme = 'dark' | 'light';

export interface CertificateDocumentOptions {
  result: ConquestResult;
  /** Shown in the footer, e.g. the school's name. */
  issuer?: string;
  /** ISO date printed as "Issued on"; defaults to the Monday after the week. */
  issuedOn?: string;
  /** dark = the in-app look (best on good printers); light = ink-friendly cream paper with navy and gold. */
  theme?: CertificateTheme;
}

const certificateStyles = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e2e8f0; font-family: 'IBM Plex Sans', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; }
  .toolbar { display: flex; gap: 0.75rem; align-items: center; justify-content: center; padding: 0.75rem; background: #fff; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0; z-index: 2; }
  .toolbar button { min-height: 44px; padding: 0 1.25rem; border: 0; border-radius: 0.75rem; background: #7c3aed; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
  .toolbar p { margin: 0; color: #475569; font-size: 0.9rem; }
  .cert { position: relative; width: 297mm; height: 210mm; margin: 12px auto; padding: 14mm 16mm; overflow: hidden; color: #f8fafc;
          background: radial-gradient(circle at 85% 15%, rgba(245,192,66,0.22), transparent 38%), linear-gradient(145deg, #1e1b4b, #0f172a 55%, #020617); page-break-after: always; break-after: page; }
  .cert:last-child { page-break-after: auto; break-after: auto; }
  .frame { position: absolute; inset: 7mm; border: 1.2mm solid #f5c042; border-radius: 6mm; pointer-events: none; }
  .frame::after { content: ''; position: absolute; inset: 2.5mm; border: 0.4mm solid rgba(245,192,66,0.5); border-radius: 4mm; }
  .watermark { position: absolute; right: 10mm; bottom: 6mm; font-size: 120mm; line-height: 1; opacity: 0.08; filter: grayscale(1); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
  .brand { font-size: 5mm; font-weight: 900; letter-spacing: 0.28em; text-transform: uppercase; color: #f5c042; }
  .case { margin-top: 1.5mm; font-size: 3.4mm; color: #cbd5e1; letter-spacing: 0.08em; text-transform: uppercase; }
  .stamp { transform: rotate(6deg); padding: 2mm 5mm; border: 1.2mm solid #f87171; border-radius: 2mm; color: #f87171; font-size: 5mm; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; }
  .body { display: grid; grid-template-columns: 1fr 58mm; gap: 10mm; align-items: center; margin-top: 12mm; }
  .eyebrow { margin: 0; font-size: 4.2mm; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.18em; }
  .name { margin: 2mm 0 0; font-size: 17mm; line-height: 1.05; font-weight: 900; color: #fff; word-break: break-word; }
  .role { margin: 4mm 0 0; font-size: 9mm; font-weight: 900; color: #f5c042; }
  .text { margin: 5mm 0 0; max-width: 165mm; font-size: 4.6mm; line-height: 1.5; color: #e2e8f0; }
  .text b { color: #fff; }
  .stats { display: flex; gap: 6mm; margin-top: 7mm; }
  .stat { min-width: 34mm; padding: 3mm 5mm; border-radius: 3mm; background: rgba(255,255,255,0.08); border: 0.3mm solid rgba(255,255,255,0.18); }
  .stat b { display: block; font-size: 8mm; line-height: 1; color: #fff; }
  .stat span { font-size: 3.2mm; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.12em; }
  .badge { display: grid; justify-items: center; gap: 3mm; }
  .badge svg { width: 54mm; height: auto; filter: drop-shadow(0 4mm 6mm rgba(0,0,0,0.45)); }
  .badge small { font-size: 3.4mm; color: #cbd5e1; text-align: center; }
  .foot { position: absolute; left: 16mm; right: 16mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; font-size: 3.4mm; color: #cbd5e1; }
  .sign { width: 60mm; border-top: 0.4mm solid #cbd5e1; padding-top: 1.5mm; text-align: center; }
  .top5 { margin: 6mm 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm; }
  .top5 li { padding: 3mm; border-radius: 3mm; background: rgba(255,255,255,0.08); border: 0.3mm solid rgba(255,255,255,0.18); text-align: center; }
  .top5 b { display: block; font-size: 3.9mm; line-height: 1.2; color: #fff; overflow-wrap: anywhere; hyphens: auto; }
  .top5 i { display: block; font-style: normal; font-size: 3.2mm; color: #f5c042; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
  @media print { .toolbar { display: none; } body { background: #fff; } .cert { margin: 0; } }

  /* Light theme: cream paper, navy ink, gold accents. Same layout. */
  .theme-light .cert { color: #0f172a; background: radial-gradient(circle at 85% 15%, rgba(245,192,66,0.28), transparent 40%), linear-gradient(160deg, #fffdf7, #fdf6e3 60%, #f8ecd0); }
  .theme-light .frame { border-color: #b8860b; }
  .theme-light .frame::after { border-color: rgba(184,134,11,0.45); }
  .theme-light .brand { color: #b8860b; }
  .theme-light .case, .theme-light .eyebrow, .theme-light .foot, .theme-light .badge small, .theme-light .stat span, .theme-light .text { color: #334155; }
  .theme-light .name, .theme-light .text b, .theme-light .stat b, .theme-light .top5 b { color: #0f172a; }
  .theme-light .role { color: #9a6b05; }
  .theme-light .stamp { border-color: #b91c1c; color: #b91c1c; }
  .theme-light .stat, .theme-light .top5 li { background: rgba(15,23,42,0.04); border-color: rgba(15,23,42,0.12); }
  .theme-light .top5 i { color: #9a6b05; }
  .theme-light .sign { border-color: #334155; }
  .theme-light .watermark { opacity: 0.1; }
`;

function studentCertificate(result: ConquestResult, student: ConquestWinner, issuer: string, issuedOn: string): string {
  const map = mapById(result.map_id);
  const role = roleForRank(student.rank);
  const label = escapeHtml(result.winner_label ?? '');
  const total = result.standings.length;
  return `<section class="cert" aria-label="Certificate for ${escapeHtml(student.name)}">
    <div class="frame"></div>
    <div class="watermark" aria-hidden="true">${map.flag}</div>
    <header class="head">
      <div><div class="brand">Brains Heist · Class Conquest</div><div class="case">Case file · Operation ${escapeHtml(map.name)} · ${weekLabel(result.week_start)}</div></div>
      <div class="stamp">Case closed</div>
    </header>
    <div class="body">
      <div>
        <p class="eyebrow">This certifies that</p>
        <h1 class="name">${escapeHtml(student.name)}</h1>
        <p class="role">${role} of Grade ${escapeHtml(result.grade)}</p>
        <p class="text">finished <b>#${student.rank} in ${label}</b>, the class that conquered <b>${map.flag} ${escapeHtml(map.name)}</b> against ${total - 1} rival ${total - 1 === 1 ? 'class' : 'classes'} in the week of ${weekLabel(result.week_start)}.</p>
        <div class="stats">
          <div class="stat"><b>${student.missions}</b><span>missions</span></div>
          <div class="stat"><b>${student.correct}</b><span>correct answers</span></div>
          <div class="stat"><b>#${student.rank}</b><span>in ${label}</span></div>
        </div>
      </div>
      <div class="badge">${conquestBadgeSvg({ kind: 'gold', mapId: result.map_id, rank: student.rank, caption: role.toUpperCase(), size: 200 })}<small>${role} badge · kept forever on your profile</small></div>
    </div>
    <footer class="foot">
      <div>Issued on ${prettyDate(issuedOn)}${issuer ? ` · ${escapeHtml(issuer)}` : ''}</div>
      <div class="sign">Teacher</div>
    </footer>
  </section>`;
}

function classCertificate(result: ConquestResult, issuer: string, issuedOn: string): string {
  const map = mapById(result.map_id);
  const winner = result.standings.find((s) => s.class_id === result.winner_class_id);
  const label = escapeHtml(result.winner_label ?? '');
  const top = result.top_students.map((s) => `<li><i>${roleForRank(s.rank)}</i><b>${escapeHtml(s.name)}</b></li>`).join('');
  return `<section class="cert" aria-label="Class certificate for ${label}">
    <div class="frame"></div>
    <div class="watermark" aria-hidden="true">${map.flag}</div>
    <header class="head">
      <div><div class="brand">Brains Heist · Class Conquest</div><div class="case">Case file · Operation ${escapeHtml(map.name)} · ${weekLabel(result.week_start)}</div></div>
      <div class="stamp">Conquered</div>
    </header>
    <div class="body">
      <div>
        <p class="eyebrow">Champions of Grade ${escapeHtml(result.grade)}</p>
        <h1 class="name">${label}</h1>
        <p class="role">conquered ${map.flag} ${escapeHtml(map.name)}</p>
        <p class="text">Every daily mission counted. <b>${label}</b> out-worked ${result.standings.length - 1} rival ${result.standings.length - 1 === 1 ? 'class' : 'classes'} with <b>${winner?.power ?? 0} power</b> from <b>${winner?.missions ?? 0} finished missions</b>.</p>
        <ul class="top5">${top}</ul>
      </div>
      <div class="badge">${conquestBadgeSvg({ kind: 'silver', mapId: result.map_id, caption: (result.winner_label ?? '').toUpperCase(), size: 200 })}<small>Every member of ${label} keeps this badge</small></div>
    </div>
    <footer class="foot">
      <div>Issued on ${prettyDate(issuedOn)}${issuer ? ` · ${escapeHtml(issuer)}` : ''}</div>
      <div class="sign">Teacher</div>
    </footer>
  </section>`;
}

/** A complete, self-contained HTML document: one page per top-five student, then the class page. */
export function buildCertificateDocument({ result, issuer = '', issuedOn, theme = 'dark' }: CertificateDocumentOptions): string {
  const map = mapById(result.map_id);
  const issued = issuedOn ?? addDays(result.week_start, 7);
  const pages = [
    ...result.top_students.slice(0, 5).map((s) => studentCertificate(result, s, issuer, issued)),
    classCertificate(result, issuer, issued),
  ].join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Class Conquest certificates · ${escapeHtml(result.winner_label ?? '')} · ${escapeHtml(map.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700;900&display=swap" rel="stylesheet">
<style>${certificateStyles}</style></head>
<body class="theme-${theme}">
<div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button><p>${result.top_students.length} student certificate${result.top_students.length === 1 ? '' : 's'} + 1 class certificate · A4 landscape · ${theme === 'light' ? 'light (ink-friendly)' : 'dark'} theme</p></div>
${pages}
<script>if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 150); }); }</script>
</body></html>`;
}

/** Open the certificates in a new tab and trigger the print dialog. Returns false when the popup was blocked. */
export function openCertificatePrintWindow(html: string): boolean {
  if (typeof window === 'undefined') return false;
  const win = window.open('', '_blank'); // no 'noopener': we need the handle to write into it
  if (!win) return false;
  try { win.opener = null; } catch { /* some browsers make opener read-only */ }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
