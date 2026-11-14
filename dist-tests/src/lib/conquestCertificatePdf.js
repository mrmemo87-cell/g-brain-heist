/**
 * Class Conquest certificates as a real PDF (pdf-lib), drawn page by page.
 *
 * Why a PDF: phones re-lay out and shrink web pages when printing, and add their own
 * header and footer (URL, date, page numbers). A PDF page prints exactly as drawn on
 * every device, A4 landscape, one certificate per page. Blank backs follow the same
 * smart print plan as the HTML version, so on a double-sided printer no two
 * certificates are ever printed back to back.
 *
 * This module is pure apart from pdf-lib: fonts, logos and the flag image are passed in,
 * so it runs the same in the browser and in tests.
 */
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, setCharacterSpacing } from 'pdf-lib';
import { addDays, arenaName, mapById, roleForRank } from './classConquest.js';
import { certificateId, planCertificatePrint, weekLabel } from './conquestCertificates.js';
// ─────────────────────────── geometry helpers ───────────────────────────
const PAGE_W = 297;
const PAGE_H = 210;
const pt = (mm) => (mm * 72) / 25.4;
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const PALETTES = {
    light: {
        bg: hex('#fdf8ea'), ink: hex('#0f172a'), muted: hex('#334155'), gold: hex('#9a6b05'), frame: hex('#b8860b'), frameSoft: hex('#d9b864'),
        panel: hex('#f6edd6'), panelLine: hex('#dcc38a'), ribbon: hex('#b8860b'), ribbonInk: hex('#fffdf7'),
        shieldOuter: hex('#e8b53c'), shieldEdge: hex('#9a6b05'), shieldInner: hex('#141c33'), pill: hex('#f5c042'), pillInk: hex('#141c33'), stamp: hex('#b91c1c'),
    },
    dark: {
        bg: hex('#0f172a'), ink: hex('#ffffff'), muted: hex('#cbd5e1'), gold: hex('#f5c042'), frame: hex('#f5c042'), frameSoft: hex('#a8873a'),
        panel: hex('#18213a'), panelLine: hex('#6b5a2a'), ribbon: hex('#f5c042'), ribbonInk: hex('#1e1b4b'),
        shieldOuter: hex('#e8b53c'), shieldEdge: hex('#9a6b05'), shieldInner: hex('#0b1222'), pill: hex('#f5c042'), pillInk: hex('#0b1222'), stamp: hex('#f87171'),
    },
};
/** Emoji and other pictographs cannot be drawn with a text font; drop them. */
const plain = (text) => text.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'BH';
/** Draws text using top-left millimetre coordinates (y = baseline from the top of the page). */
class Pen {
    constructor(page) {
        this.page = page;
    }
    width(text, font, sizeMm, spacingEm = 0) {
        const t = plain(text);
        return (font.widthOfTextAtSize(t, pt(sizeMm)) + pt(sizeMm) * spacingEm * Math.max(0, t.length - 1)) * 25.4 / 72;
    }
    /** Largest size (≤ max) at which the text fits the width. */
    fit(text, font, maxSizeMm, widthMm, minSizeMm = maxSizeMm * 0.5, spacingEm = 0) {
        let size = maxSizeMm;
        while (size > minSizeMm && this.width(text, font, size, spacingEm) > widthMm)
            size -= 0.2;
        return size;
    }
    text(text, x, baseline, font, sizeMm, color, opts = {}) {
        const spacingEm = opts.spacingEm ?? 0;
        let size = sizeMm;
        if (opts.maxWidth)
            size = this.fit(text, font, sizeMm, opts.maxWidth, sizeMm * 0.55, spacingEm);
        const t = plain(text);
        if (!t)
            return 0;
        const w = this.width(t, font, size, spacingEm);
        const left = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
        if (spacingEm)
            this.page.pushOperators(setCharacterSpacing(pt(size) * spacingEm));
        this.page.drawText(t, { x: pt(left), y: pt(PAGE_H - baseline), size: pt(size), font, color });
        if (spacingEm)
            this.page.pushOperators(setCharacterSpacing(0));
        return w;
    }
    rect(x, top, w, h, fill, line) {
        this.page.drawRectangle({
            x: pt(x), y: pt(PAGE_H - top - h), width: pt(w), height: pt(h),
            ...(fill ? { color: fill } : {}),
            ...(line ? { borderColor: line.color, borderWidth: pt(line.width), borderOpacity: line.opacity ?? 1 } : {}),
        });
    }
    roundRect(x, top, w, h, r, fill, line) {
        const s = 1; // path in mm, scaled to points below
        const d = `M ${x + r} ${top} H ${x + w - r} Q ${x + w} ${top} ${x + w} ${top + r} V ${top + h - r} Q ${x + w} ${top + h} ${x + w - r} ${top + h} H ${x + r} Q ${x} ${top + h} ${x} ${top + h - r} V ${top + r} Q ${x} ${top} ${x + r} ${top} Z`;
        this.page.drawSvgPath(d, {
            x: 0, y: pt(PAGE_H), scale: pt(s),
            ...(fill ? { color: fill } : {}),
            ...(line ? { borderColor: line.color, borderWidth: line.width / s } : {}),
        });
    }
    line(x1, y1, x2, y2, color, width, opacity = 1) {
        this.page.drawLine({ start: { x: pt(x1), y: pt(PAGE_H - y1) }, end: { x: pt(x2), y: pt(PAGE_H - y2) }, thickness: pt(width), color, opacity });
    }
    circle(cx, cy, r, fill, line) {
        this.page.drawCircle({
            x: pt(cx), y: pt(PAGE_H - cy), size: pt(r),
            ...(fill ? { color: fill } : {}),
            ...(line ? { borderColor: line.color, borderWidth: pt(line.width) } : {}),
        });
    }
    /** SVG path given in its own units, placed with its origin at (x, top) mm and scaled by mmPerUnit. */
    path(d, x, top, mmPerUnit, fill, line) {
        this.page.drawSvgPath(d, {
            x: pt(x), y: pt(PAGE_H - top), scale: pt(mmPerUnit),
            ...(fill ? { color: fill } : {}),
            ...(line ? { borderColor: line.color, borderWidth: line.width / mmPerUnit } : {}),
        });
    }
    image(img, x, top, w, h) {
        this.page.drawImage(img, { x: pt(x), y: pt(PAGE_H - top - h), width: pt(w), height: pt(h) });
    }
    /** Wrapped paragraph of mixed regular/bold runs. Returns the baseline of the last line. */
    paragraph(runs, x, firstBaseline, width, sizeMm, lineMm, fonts, color, boldColor) {
        const words = [];
        runs.forEach((r) => plain(r.text).split(/\s+/).filter(Boolean).forEach((w) => words.push({ text: w, bold: !!r.bold })));
        const space = fonts.sans.widthOfTextAtSize(' ', pt(sizeMm)) * 25.4 / 72;
        let cx = x;
        let baseline = firstBaseline;
        for (const w of words) {
            const font = w.bold ? fonts.bold : fonts.sans;
            const ww = this.width(w.text, font, sizeMm);
            if (/^[,.;:!?]/.test(w.text) && cx > x)
                cx -= space; // punctuation hugs the previous word
            if (cx > x && cx + ww > x + width) {
                cx = x;
                baseline += lineMm;
            }
            this.text(w.text, cx, baseline, font, sizeMm, w.bold ? boldColor : color);
            cx += ww + space;
        }
        return baseline;
    }
}
// ─────────────────────────── pieces of the design ───────────────────────────
const SHIELD_OUTER = 'M50 4 L92 18 V58 C92 84 72 102 50 112 C28 102 8 84 8 58 V18 Z';
const SHIELD_INNER = 'M50 14 L82 25 V57 C82 77 66 92 50 100 C34 92 18 77 18 57 V25 Z';
function frame({ pen, c }) {
    pen.rect(0, 0, PAGE_W, PAGE_H, c.bg);
    pen.rect(7, 7, PAGE_W - 14, PAGE_H - 14, null, { color: c.frame, width: 1.4 });
    pen.rect(9.6, 9.6, PAGE_W - 19.2, PAGE_H - 19.2, null, { color: c.frameSoft, width: 0.35 });
    // Corner ornaments (16 mm), mirrored into each corner.
    const k = 16 / 100;
    const corners = [[9, 9, 1, 1], [PAGE_W - 9, 9, -1, 1], [9, PAGE_H - 9, 1, -1], [PAGE_W - 9, PAGE_H - 9, -1, -1]];
    for (const [ox, oy, sx, sy] of corners) {
        const P = (u, v) => [ox + sx * u * k, oy + sy * v * k];
        const [a1, a2] = P(4, 60), [b1, b2] = P(4, 4), [d1, d2] = P(60, 4);
        pen.line(a1, a2, b1, b2, c.frame, 0.8);
        pen.line(b1, b2, d1, d2, c.frame, 0.8);
        const [e1, e2] = P(14, 44), [f1, f2] = P(14, 14), [g1, g2] = P(44, 14);
        pen.line(e1, e2, f1, f2, c.frame, 0.4, 0.7);
        pen.line(f1, f2, g1, g2, c.frame, 0.4, 0.7);
        const [h1, h2] = P(14, 14);
        pen.circle(h1, h2, 0.65, c.frame);
    }
}
function fitImage(img, maxW, maxH) {
    const ratio = img.width / img.height;
    let h = maxH, w = h * ratio;
    if (w > maxW) {
        w = maxW;
        h = w / ratio;
    }
    return { w, h };
}
function header(ctx, sealTitle) {
    const { pen, fonts, c, result, issuer, images } = ctx;
    const map = mapById(result.map_id);
    // School (left)
    let textX = 18;
    if (images.school) {
        const { w, h } = fitImage(images.school, 30, 18);
        pen.image(images.school, 18, 16 + (18 - h) / 2, w, h);
        textX = 18 + w + 4;
    }
    else {
        pen.circle(27, 25, 9, null, { color: c.frame, width: 0.8 });
        pen.text(initials(issuer || 'Class Conquest'), 27, 28, fonts.bold, 7, c.gold, { align: 'center' });
        textX = 40;
    }
    pen.text(issuer || 'Class Conquest', textX, 23.5, fonts.bold, 4.4, c.ink, { maxWidth: 92 - textX + 18 });
    pen.text(`${arenaName(result.grade).toUpperCase()} · CLASS CONQUEST`, textX, 28.8, fonts.sans, 2.8, c.muted, { spacingEm: 0.14, maxWidth: 92 - textX + 18 });
    // Seal (centre)
    pen.text(sealTitle, PAGE_W / 2, 26, fonts.serif, 9, c.gold, { align: 'center', maxWidth: 80 });
    pen.line(PAGE_W / 2 - 27, 29, PAGE_W / 2 + 27, 29, c.frame, 0.5);
    pen.text('CERTIFICATE OF ACHIEVEMENT', PAGE_W / 2, 33.2, fonts.sans, 2.8, c.muted, { align: 'center', spacingEm: 0.26 });
    // Brains Heist (right)
    let rightX = PAGE_W - 18;
    if (images.brand) {
        const { w, h } = fitImage(images.brand, 20, 18);
        pen.image(images.brand, rightX - w, 16 + (18 - h) / 2, w, h);
        rightX -= w + 3;
    }
    pen.text('BRAINS HEIST', rightX, 23.5, fonts.bold, 3.4, c.gold, { align: 'right', spacingEm: 0.22 });
    pen.text(`OPERATION ${map.name.toUpperCase()} · ${weekLabel(result.week_start).toUpperCase()}`, rightX, 28.8, fonts.sans, 2.6, c.muted, { align: 'right', spacingEm: 0.08, maxWidth: 78 });
}
function badge(ctx, kind, rank, caption, ribbon, note) {
    const { pen, fonts, c, images } = ctx;
    const cx = PAGE_W - 18 - 31; // centre of the 62 mm right column
    const w = 50, k = w / 100, left = cx - w / 2, top = 46;
    const outer = kind === 'gold' ? c.shieldOuter : hex('#c7d2e0');
    const edge = kind === 'gold' ? c.shieldEdge : hex('#5b6b80');
    pen.path(SHIELD_OUTER, left, top, k, outer, { color: edge, width: 0.6 });
    pen.path(SHIELD_INNER, left, top, k, c.shieldInner);
    if (images.flag) {
        const fw = 24, fh = fw * images.flag.height / images.flag.width;
        pen.image(images.flag, cx - fw / 2, top + 40 * k - fh / 2, fw, fh);
    }
    if (rank) {
        pen.roundRect(cx - 20 * k, top + 66 * k, 40 * k, 16 * k, 8 * k, c.pill);
        pen.text(`#${rank}`, cx, top + 77.5 * k, fonts.bold, 5.2, c.pillInk, { align: 'center' });
    }
    else {
        pen.text(caption, cx, top + 78 * k, fonts.bold, 4.2, hex('#c7d2e0'), { align: 'center', maxWidth: 24 });
    }
    // Ribbon and note
    const ribTop = top + 116 * k + 4;
    pen.rect(cx - 30, ribTop, 60, 8.5, c.ribbon);
    pen.text(ribbon, cx, ribTop + 5.8, fonts.bold, 3.2, c.ribbonInk, { align: 'center', spacingEm: 0.16, maxWidth: 56 });
    const words = plain(note).split(' ');
    let line = '', y = ribTop + 14;
    for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (pen.width(trial, fonts.sans, 2.9) > 58 && line) {
            pen.text(line, cx, y, fonts.sans, 2.9, c.muted, { align: 'center' });
            line = word;
            y += 4.1;
        }
        else
            line = trial;
    }
    if (line)
        pen.text(line, cx, y, fonts.sans, 2.9, c.muted, { align: 'center' });
}
function footer(ctx, id) {
    const { pen, fonts, c, issuer, issuedOn } = ctx;
    pen.line(18, 186, 80, 186, c.muted, 0.35);
    pen.text('CLASS TEACHER', 49, 190.5, fonts.bold, 2.9, c.ink, { align: 'center', spacingEm: 0.08 });
    pen.line(PAGE_W - 80, 186, PAGE_W - 18, 186, c.muted, 0.35);
    pen.text('HEAD OF SCHOOL', PAGE_W - 49, 190.5, fonts.bold, 2.9, c.ink, { align: 'center', spacingEm: 0.08 });
    pen.text(`Issued on ${prettyDate(issuedOn)}${issuer ? ` by ${issuer}` : ''}`, PAGE_W / 2, 186, fonts.sans, 2.9, c.muted, { align: 'center', maxWidth: 120 });
    pen.text(`Certificate no. ${id} · verified by Brains Heist`, PAGE_W / 2, 190.8, fonts.sans, 2.7, c.gold, { align: 'center', maxWidth: 120 });
}
function stat(ctx, x, top, w, value, label) {
    const { pen, fonts, c } = ctx;
    pen.roundRect(x, top, w, 15, 2.2, c.panel, { color: c.panelLine, width: 0.3 });
    pen.text(value, x + 5, top + 8.4, fonts.bold, 7, c.ink);
    pen.text(label.toUpperCase(), x + 5, top + 12.6, fonts.sans, 2.5, c.muted, { spacingEm: 0.14, maxWidth: w - 8 });
}
function studentPage(ctx, student) {
    const { pen, fonts, c, result } = ctx;
    const map = mapById(result.map_id);
    const role = roleForRank(student.rank);
    const label = result.winner_label ?? '';
    const rivals = result.standings.length - 1;
    frame(ctx);
    header(ctx, role);
    pen.text('PROUDLY PRESENTED TO', 18, 58, fonts.bold, 3.2, c.muted, { spacingEm: 0.26 });
    const nameSize = pen.fit(student.name, fonts.serif, 15, 182, 8);
    pen.text(student.name, 18, 58 + 4 + nameSize * 0.82, fonts.serif, nameSize, c.ink);
    const ruleY = 58 + 8 + nameSize * 0.82;
    pen.rect(18, ruleY, 60, 0.6, c.frame);
    pen.text(`${role} of ${arenaName(result.grade)}`, 18, ruleY + 11, fonts.bold, 7.4, c.gold, { maxWidth: 182 });
    pen.text(`RANK #${student.rank} IN ${label}`, 18, ruleY + 16.5, fonts.bold, 2.9, c.muted, { spacingEm: 0.18 });
    const last = pen.paragraph([
        { text: 'For leading' }, { text: label, bold: true }, { text: 'to victory in' }, { text: `Operation ${map.name}`, bold: true },
        { text: '— finishing' }, { text: `${student.missions} daily missions`, bold: true }, { text: 'with' }, { text: `${student.correct} correct answers`, bold: true },
        { text: `, earned at home, every day of the week, against ${rivals} rival ${rivals === 1 ? 'class' : 'classes'}.` },
    ], 18, ruleY + 26, 170, 4, 6, fonts, c.muted, c.ink);
    const statTop = Math.max(last + 9, 126);
    stat(ctx, 18, statTop, 34, String(student.missions), 'Missions');
    stat(ctx, 56, statTop, 44, String(student.correct), 'Correct answers');
    stat(ctx, 104, statTop, 30, `#${student.rank}`, `In ${label}`);
    badge(ctx, 'gold', student.rank, role.toUpperCase(), `${map.name.toUpperCase()} CONQUERED`, `The ${role} badge stays on this student's Brains Heist profile for good.`);
    footer(ctx, certificateId(result, student.student_id));
}
function classPage(ctx) {
    const { pen, fonts, c, result } = ctx;
    const map = mapById(result.map_id);
    const label = result.winner_label ?? '';
    const winner = result.standings.find((s) => s.class_id === result.winner_class_id);
    const rivals = result.standings.length - 1;
    frame(ctx);
    header(ctx, 'Champions');
    pen.text(`CHAMPIONS OF ${arenaName(result.grade).toUpperCase()}`, 18, 58, fonts.bold, 3.2, c.muted, { spacingEm: 0.26 });
    pen.text(label, 18, 77, fonts.serif, 15, c.ink, { maxWidth: 182 });
    pen.rect(18, 81, 60, 0.6, c.frame);
    pen.text(`conquered ${map.name}`, 18, 92, fonts.bold, 7.4, c.gold, { maxWidth: 182 });
    pen.text(`OPERATION ${map.name.toUpperCase()} · ${weekLabel(result.week_start).toUpperCase()}`, 18, 97.5, fonts.bold, 2.9, c.muted, { spacingEm: 0.18, maxWidth: 182 });
    pen.paragraph([
        { text: 'Every daily mission counted.' }, { text: label, bold: true }, { text: `out-worked ${rivals} rival ${rivals === 1 ? 'class' : 'classes'} with` },
        { text: `${winner?.power ?? 0} power`, bold: true }, { text: 'from' }, { text: `${winner?.missions ?? 0} finished missions`, bold: true },
        { text: '— a whole class pulling in the same direction.' },
    ], 18, 107, 170, 4, 6, fonts, c.muted, c.ink);
    const tops = result.top_students.slice(0, 5);
    const gap = 3.5, w = (182 - gap * 4) / 5;
    tops.forEach((s, i) => {
        const x = 18 + i * (w + gap);
        pen.roundRect(x, 128, w, 20, 2.2, c.panel, { color: c.panelLine, width: 0.3 });
        pen.text(roleForRank(s.rank).toUpperCase(), x + w / 2, 134, fonts.bold, 2.5, c.gold, { align: 'center', spacingEm: 0.1, maxWidth: w - 4 });
        pen.text(s.name, x + w / 2, 141.5, fonts.bold, 3.6, c.ink, { align: 'center', maxWidth: w - 4 });
    });
    badge(ctx, 'silver', null, label.toUpperCase(), `${map.name.toUpperCase()} CONQUERED`, `Every member of ${label} keeps this badge.`);
    footer(ctx, certificateId(result, result.winner_class_id ?? 'class'));
}
// ─────────────────────────── the document ───────────────────────────
export async function buildCertificatePdf(options) {
    const { result, assets, theme = 'light', printSides = 'double', only = null } = options;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const map = mapById(result.map_id);
    doc.setTitle(`Class Conquest certificates · ${result.winner_label ?? ''} · ${map.name}`);
    doc.setAuthor(options.issuer || 'Brains Heist');
    doc.setCreator('Brains Heist');
    const fonts = {
        serif: await doc.embedFont(assets.serif, { subset: true }),
        sans: await doc.embedFont(assets.sans, { subset: true }),
        bold: await doc.embedFont(assets.sansBold, { subset: true }),
    };
    const embed = async (img) => {
        if (!img)
            return null;
        try {
            return img.kind === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
        }
        catch {
            return null;
        }
    };
    const images = { school: await embed(assets.schoolLogo), brand: await embed(assets.brandLogo), flag: await embed(assets.flag) };
    const all = [
        ...result.top_students.slice(0, 5).map((s) => (ctx) => studentPage(ctx, s)),
        (ctx) => classPage(ctx),
    ];
    const chosen = only === null || only === undefined ? all : all.filter((_, i) => i === only);
    const plan = planCertificatePrint(chosen.length, printSides);
    const base = { fonts, c: PALETTES[theme], result, issuer: options.issuer ?? '', issuedOn: options.issuedOn ?? addDays(result.week_start, 7), images };
    chosen.forEach((draw, i) => {
        const page = doc.addPage([pt(PAGE_W), pt(PAGE_H)]);
        draw({ ...base, pen: new Pen(page) });
        for (let b = 0; b < plan.padding[i]; b++)
            doc.addPage([pt(PAGE_W), pt(PAGE_H)]); // blank back
    });
    const bytes = await doc.save();
    return { bytes, certificates: chosen.length, pages: doc.getPageCount(), sheets: plan.physicalSheets, blankBacks: plan.blankPages };
}
export const certificatePdfFileName = (result, only = null) => {
    const map = mapById(result.map_id).name.replace(/\s+/g, '-');
    const who = only === null ? (result.winner_label ?? 'class') : only < result.top_students.length ? result.top_students[only].name : `${result.winner_label ?? 'class'}-class`;
    return `Class-Conquest-${map}-${result.week_start}-${who}`.replace(/[^\p{L}\p{N}._-]+/gu, '-') + '.pdf';
};
