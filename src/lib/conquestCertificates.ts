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
  /** School name, printed in the header and signed as the issuer. */
  issuer?: string;
  /** School crest/logo (https). Omitted → a monogram of the school name is drawn instead. */
  schoolLogoUrl?: string | null;
  /** Absolute URL of the Brains Heist logo; the print window has no base URL, so relative paths do not work. */
  brandLogoUrl?: string | null;
  /** ISO date printed as "Issued on"; defaults to the Monday after the week. */
  issuedOn?: string;
  /** dark = the in-app look (best on good printers); light = ink-friendly cream paper with navy and gold. */
  theme?: CertificateTheme;
}

const certificateStyles = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e2e8f0; font-family: 'IBM Plex Sans', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .serif { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; }
  .toolbar { display: flex; gap: 0.75rem; align-items: center; justify-content: center; padding: 0.75rem; background: #fff; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0; z-index: 2; }
  .toolbar button { min-height: 44px; padding: 0 1.25rem; border: 0; border-radius: 0.75rem; background: #7c3aed; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
  .toolbar p { margin: 0; color: #475569; font-size: 0.9rem; }

  .cert { position: relative; width: 297mm; height: 210mm; margin: 12px auto; padding: 16mm 18mm 14mm; overflow: hidden; color: #f8fafc;
          background: radial-gradient(circle at 85% 20%, rgba(245,192,66,0.22), transparent 38%), linear-gradient(145deg, #1e1b4b, #0f172a 55%, #020617); page-break-after: always; break-after: page; }
  .cert:last-child { page-break-after: auto; break-after: auto; }
  /* Double frame with corner ornaments */
  .frame { position: absolute; inset: 7mm; border: 1.4mm solid #f5c042; border-radius: 3mm; pointer-events: none; }
  .frame::before { content: ''; position: absolute; inset: 2.2mm; border: 0.35mm solid rgba(245,192,66,0.6); border-radius: 2mm; }
  .corner { position: absolute; width: 16mm; height: 16mm; pointer-events: none; }
  .corner svg { width: 100%; height: 100%; }
  .corner.tl { top: 9mm; left: 9mm; } .corner.tr { top: 9mm; right: 9mm; transform: scaleX(-1); }
  .corner.bl { bottom: 9mm; left: 9mm; transform: scaleY(-1); } .corner.br { bottom: 9mm; right: 9mm; transform: scale(-1); }
  .watermark { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); font-size: 120mm; line-height: 1; opacity: 0.05; filter: grayscale(1); pointer-events: none; }

  .head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6mm; }
  .school { display: flex; align-items: center; gap: 4mm; min-width: 0; }
  .school img, .brand img { height: 18mm; width: auto; max-width: 42mm; object-fit: contain; }
  .monogram { display: grid; place-items: center; width: 18mm; height: 18mm; border-radius: 50%; border: 0.8mm solid #f5c042; color: #f5c042; font-size: 8mm; font-weight: 900; }
  .school-name { font-size: 4.6mm; font-weight: 800; color: #fff; line-height: 1.15; }
  .school-sub { font-size: 3mm; color: #cbd5e1; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 1mm; }
  .brand { display: flex; align-items: center; justify-content: flex-end; gap: 3mm; text-align: right; }
  .brand-name { font-size: 3.6mm; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: #f5c042; }
  .brand-sub { font-size: 2.8mm; color: #cbd5e1; letter-spacing: 0.1em; text-transform: uppercase; }
  .seal { display: grid; justify-items: center; gap: 1mm; }
  .seal-title { font-size: 9.5mm; font-weight: 700; color: #f5c042; letter-spacing: 0.06em; line-height: 1; }
  .seal-rule { width: 54mm; height: 0.5mm; background: linear-gradient(90deg, transparent, #f5c042, transparent); }
  .seal-sub { font-size: 3mm; color: #cbd5e1; letter-spacing: 0.26em; text-transform: uppercase; }

  .body { display: grid; grid-template-columns: 1fr 62mm; gap: 10mm; align-items: center; min-height: 118mm; margin-top: 4mm; }
  .eyebrow { margin: 0; font-size: 3.6mm; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.26em; }
  .name { margin: 2mm 0 0; font-size: 17mm; line-height: 1.02; font-weight: 700; color: #fff; word-break: break-word; }
  .name-rule { width: 60mm; height: 0.6mm; margin-top: 3mm; background: #f5c042; }
  .role { margin: 4mm 0 0; font-size: 8.4mm; font-weight: 800; color: #f5c042; }
  .role small { display: block; font-size: 3.4mm; font-weight: 700; color: #cbd5e1; letter-spacing: 0.18em; text-transform: uppercase; margin-top: 0.5mm; }
  .text { margin: 4.5mm 0 0; max-width: 168mm; font-size: 4.4mm; line-height: 1.5; color: #e2e8f0; }
  .text b { color: #fff; }
  .stats { display: flex; gap: 5mm; margin-top: 6mm; }
  .stat { min-width: 34mm; padding: 2.6mm 5mm; border-radius: 2.5mm; background: rgba(255,255,255,0.08); border: 0.3mm solid rgba(245,192,66,0.45); }
  .stat b { display: block; font-size: 8mm; line-height: 1; color: #fff; }
  .stat span { font-size: 3mm; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.14em; }
  .badge { display: grid; justify-items: center; gap: 2.5mm; }
  .badge svg { width: 56mm; height: auto; filter: drop-shadow(0 4mm 6mm rgba(0,0,0,0.45)); }
  .ribbon { padding: 1.6mm 6mm; border-radius: 1.5mm; background: #f5c042; color: #1e1b4b; font-size: 3.4mm; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }
  .badge small { font-size: 3.1mm; color: #cbd5e1; text-align: center; max-width: 56mm; line-height: 1.4; }

  .foot { position: absolute; left: 18mm; right: 18mm; bottom: 13mm; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8mm; font-size: 3.2mm; color: #cbd5e1; }
  .sign { width: 62mm; border-top: 0.4mm solid #cbd5e1; padding-top: 1.5mm; text-align: center; }
  .sign b { display: block; color: #fff; font-size: 3.2mm; letter-spacing: 0.08em; text-transform: uppercase; }
  .sign.right { justify-self: end; }
  .issue { text-align: center; line-height: 1.5; }
  .issue b { color: #fff; }
  .issue code { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 2.9mm; color: #f5c042; letter-spacing: 0.08em; }

  .top5 { margin: 5mm 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(5, 1fr); gap: 3.5mm; }
  .top5 li { padding: 3mm 2mm; border-radius: 2.5mm; background: rgba(255,255,255,0.08); border: 0.3mm solid rgba(245,192,66,0.45); text-align: center; }
  .top5 b { display: block; font-size: 3.9mm; line-height: 1.2; color: #fff; overflow-wrap: anywhere; hyphens: auto; }
  .top5 i { display: block; font-style: normal; font-size: 2.9mm; color: #f5c042; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1mm; }
  @media print { .toolbar { display: none; } body { background: #fff; } .cert { margin: 0; } }

  /* Light theme: cream paper, navy ink, gold accents. Same layout. */
  .theme-light .cert { color: #0f172a; background: radial-gradient(circle at 85% 20%, rgba(245,192,66,0.3), transparent 40%), linear-gradient(160deg, #fffdf7, #fdf6e3 60%, #f8ecd0); }
  .theme-light .frame { border-color: #b8860b; }
  .theme-light .frame::before { border-color: rgba(184,134,11,0.5); }
  .theme-light .monogram { border-color: #b8860b; color: #9a6b05; }
  .theme-light .school-name, .theme-light .name, .theme-light .text b, .theme-light .stat b, .theme-light .top5 b, .theme-light .issue b, .theme-light .sign b { color: #0f172a; }
  .theme-light .school-sub, .theme-light .brand-sub, .theme-light .seal-sub, .theme-light .eyebrow, .theme-light .text, .theme-light .stat span, .theme-light .badge small, .theme-light .foot, .theme-light .role small { color: #334155; }
  .theme-light .brand-name, .theme-light .seal-title, .theme-light .role, .theme-light .top5 i, .theme-light .issue code { color: #9a6b05; }
  .theme-light .name-rule, .theme-light .seal-rule { background: #b8860b; }
  .theme-light .stat, .theme-light .top5 li { background: rgba(15,23,42,0.035); border-color: rgba(184,134,11,0.45); }
  .theme-light .ribbon { background: #b8860b; color: #fffdf7; }
  .theme-light .sign { border-color: #334155; }
  .theme-light .watermark { opacity: 0.05; }
`;

const CORNER = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M4 60 V4 H60" fill="none" stroke="#f5c042" stroke-width="5" stroke-linecap="round"/><path d="M14 44 V14 H44" fill="none" stroke="#f5c042" stroke-width="2.5" opacity="0.7"/><circle cx="14" cy="14" r="4" fill="#f5c042"/></svg>`;
const corners = () => ['tl', 'tr', 'bl', 'br'].map((c) => `<div class="corner ${c}">${CORNER}</div>`).join('');

/** Short, stable certificate number so families can quote it and the school can look it up. */
export function certificateId(result: ConquestResult, subject: string): string {
  let h = 2166136261;
  for (const ch of `${result.week_start}|${result.grade}|${result.map_id}|${subject}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `BH-${result.week_start.slice(2, 4)}${result.week_start.slice(5, 7)}${result.week_start.slice(8, 10)}-${h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'BH';

function header(result: ConquestResult, issuer: string, schoolLogoUrl: string | null | undefined, brandLogoUrl: string | null | undefined, sealTitle: string): string {
  const map = mapById(result.map_id);
  const school = issuer
    ? `<div class="school">${schoolLogoUrl ? `<img src="${escapeHtml(schoolLogoUrl)}" alt="">` : `<div class="monogram" aria-hidden="true">${escapeHtml(initials(issuer))}</div>`}<div><div class="school-name">${escapeHtml(issuer)}</div><div class="school-sub">Grade ${escapeHtml(result.grade)} · Class Conquest</div></div></div>`
    : `<div class="school"><div class="monogram" aria-hidden="true">${map.flag}</div><div><div class="school-name">Class Conquest</div><div class="school-sub">Grade ${escapeHtml(result.grade)}</div></div></div>`;
  const brand = `<div class="brand"><div><div class="brand-name">Brains Heist</div><div class="brand-sub">Operation ${escapeHtml(map.name)} · ${weekLabel(result.week_start)}</div></div>${brandLogoUrl ? `<img src="${escapeHtml(brandLogoUrl)}" alt="Brains Heist">` : ''}</div>`;
  return `<header class="head">${school}<div class="seal"><div class="seal-title serif">${sealTitle}</div><div class="seal-rule"></div><div class="seal-sub">Certificate of Achievement</div></div>${brand}</header>`;
}

function footer(issuer: string, issuedOn: string, id: string): string {
  return `<footer class="foot">
    <div class="sign"><b>Class Teacher</b></div>
    <div class="issue">Issued on <b>${prettyDate(issuedOn)}</b>${issuer ? ` by <b>${escapeHtml(issuer)}</b>` : ''}<br>Certificate no. <code>${id}</code> · verified by Brains Heist</div>
    <div class="sign right"><b>Head of School</b></div>
  </footer>`;
}

function studentCertificate(result: ConquestResult, student: ConquestWinner, o: Required<Pick<CertificateDocumentOptions, 'issuer' | 'issuedOn'>> & CertificateDocumentOptions): string {
  const map = mapById(result.map_id);
  const role = roleForRank(student.rank);
  const label = escapeHtml(result.winner_label ?? '');
  const rivals = result.standings.length - 1;
  return `<section class="cert" aria-label="Certificate for ${escapeHtml(student.name)}">
    <div class="frame"></div>${corners()}
    <div class="watermark" aria-hidden="true">${map.flag}</div>
    ${header(result, o.issuer, o.schoolLogoUrl, o.brandLogoUrl, role)}
    <div class="body">
      <div>
        <p class="eyebrow">Proudly presented to</p>
        <h1 class="name serif">${escapeHtml(student.name)}</h1>
        <div class="name-rule"></div>
        <p class="role">${role} of Grade ${escapeHtml(result.grade)}<small>Rank #${student.rank} in ${label}</small></p>
        <p class="text">For leading <b>${label}</b> to victory in <b>Operation ${escapeHtml(map.name)}</b> — finishing <b>${student.missions} daily missions</b> with <b>${student.correct} correct answers</b>, earned at home, every day of the week, against ${rivals} rival ${rivals === 1 ? 'class' : 'classes'}.</p>
        <div class="stats">
          <div class="stat"><b>${student.missions}</b><span>Missions</span></div>
          <div class="stat"><b>${student.correct}</b><span>Correct answers</span></div>
          <div class="stat"><b>#${student.rank}</b><span>In ${label}</span></div>
        </div>
      </div>
      <div class="badge">${conquestBadgeSvg({ kind: 'gold', mapId: result.map_id, rank: student.rank, caption: role.toUpperCase(), size: 200 })}<div class="ribbon">${map.flag} ${escapeHtml(map.name)} conquered</div><small>The ${role} badge stays on this student’s Brains Heist profile for good.</small></div>
    </div>
    ${footer(o.issuer, o.issuedOn, certificateId(result, student.student_id))}
  </section>`;
}

function classCertificate(result: ConquestResult, o: Required<Pick<CertificateDocumentOptions, 'issuer' | 'issuedOn'>> & CertificateDocumentOptions): string {
  const map = mapById(result.map_id);
  const winner = result.standings.find((s) => s.class_id === result.winner_class_id);
  const label = escapeHtml(result.winner_label ?? '');
  const rivals = result.standings.length - 1;
  const top = result.top_students.map((s) => `<li><i>${roleForRank(s.rank)}</i><b>${escapeHtml(s.name)}</b></li>`).join('');
  return `<section class="cert" aria-label="Class certificate for ${label}">
    <div class="frame"></div>${corners()}
    <div class="watermark" aria-hidden="true">${map.flag}</div>
    ${header(result, o.issuer, o.schoolLogoUrl, o.brandLogoUrl, 'Champions')}
    <div class="body">
      <div>
        <p class="eyebrow">Champions of Grade ${escapeHtml(result.grade)}</p>
        <h1 class="name serif">${label}</h1>
        <div class="name-rule"></div>
        <p class="role">conquered ${map.flag} ${escapeHtml(map.name)}<small>Operation ${escapeHtml(map.name)} · ${weekLabel(result.week_start)}</small></p>
        <p class="text">Every daily mission counted. <b>${label}</b> out-worked ${rivals} rival ${rivals === 1 ? 'class' : 'classes'} with <b>${winner?.power ?? 0} power</b> from <b>${winner?.missions ?? 0} finished missions</b> — a whole class pulling in the same direction.</p>
        <ul class="top5">${top}</ul>
      </div>
      <div class="badge">${conquestBadgeSvg({ kind: 'silver', mapId: result.map_id, caption: (result.winner_label ?? '').toUpperCase(), size: 200 })}<div class="ribbon">${map.flag} ${escapeHtml(map.name)} conquered</div><small>Every member of ${label} keeps this badge.</small></div>
    </div>
    ${footer(o.issuer, o.issuedOn, certificateId(result, result.winner_class_id ?? 'class'))}
  </section>`;
}

/** A complete, self-contained HTML document: one page per top-five student, then the class page. */
export function buildCertificateDocument(options: CertificateDocumentOptions): string {
  const { result, theme = 'dark' } = options;
  const o = { ...options, issuer: options.issuer ?? '', issuedOn: options.issuedOn ?? addDays(result.week_start, 7) };
  const map = mapById(result.map_id);
  const pages = [
    ...result.top_students.slice(0, 5).map((s) => studentCertificate(result, s, o)),
    classCertificate(result, o),
  ].join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Class Conquest certificates · ${escapeHtml(result.winner_label ?? '')} · ${escapeHtml(map.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700;900&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
<style>${certificateStyles}</style></head>
<body class="theme-${theme}">
<div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button><p>${result.top_students.length} student certificate${result.top_students.length === 1 ? '' : 's'} + 1 class certificate · A4 landscape · ${theme === 'light' ? 'light (ink-friendly)' : 'dark'} theme</p></div>
${pages}
<script>if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 250); }); }</script>
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
