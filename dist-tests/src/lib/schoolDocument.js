import { normalizeBrandLogoUrl, PRODUCT_LOGO_URL, PRODUCT_NAME } from './schoolBranding.js';
const AUDIENCE_LABELS = {
    family: 'Family copy',
    student: 'Student copy',
    teacher: 'Teacher working copy',
    internal: 'Internal school copy',
};
const CONFIDENTIALITY_LABELS = {
    'school-use': 'For authorised school use',
    confidential: 'Confidential',
    'family-copy': 'Prepared for the student and family',
};
const DOCUMENT_PREFIXES = {
    admission: 'ADM',
    assignment: 'ASN',
    cambridge: 'CAM',
    class: 'CLS',
    ielts: 'IEL',
    question: 'QST',
    answer: 'ANS',
    geometry: 'GEO',
    attendance: 'ATT',
    'teacher-allocation': 'TAL',
    clan: 'CLN',
    roster: 'RST',
    writing: 'WRT',
};
const DOCUMENT_TYPE_LABELS = {
    'admission-family-v1': 'Admission assessment summary',
    'admission-internal-v1': 'Admission committee report',
    'admin-class-register-v1': 'Attendance register',
    'admin-class-roster-v1': 'Class roster',
    'class-register-v1': 'Attendance register',
    'class-roster-v1': 'Class roster',
    'class-achievement-v1': 'Class achievement report',
    'cambridge-performance-v2': 'Cambridge performance report',
    'cambridge-student-overview-v2': 'Cambridge student overview',
    'assignment-student-v2': 'Student learning report',
    'cambridge-answer-reflection-v1': 'Cambridge answer reflection',
    'geometry-diagram-sheet-v1': 'Geometry diagram sheet',
    'teacher-allocation-v1': 'Teacher allocation register',
    'teacher-answer-key-v1': 'Teacher answer key',
    'student-question-paper-v1': 'Student question paper',
    'clan-wars-operations-v1': 'Clan Wars operations pack',
    'ielts-exam-operations-v1': 'IELTS exam operations pack',
    'ielts-session-evidence-v1': 'IELTS teacher evidence',
    'ielts-session-summary-v1': 'IELTS session summary',
    'ielts-productive-review-v1': 'IELTS productive-skill review',
    'writing-report-v2': 'Writing progress report',
};
export const schoolDocumentTypeLabel = (templateVersion, title) => {
    const known = DOCUMENT_TYPE_LABELS[templateVersion.toLowerCase()];
    if (known)
        return known;
    if (title?.trim())
        return title.trim();
    const cleaned = templateVersion.replace(/-v\d+$/i, '').replace(/[-_]+/g, ' ').trim();
    return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'School document';
};
const prefixForKind = (kind) => {
    const normalized = kind.toLowerCase();
    if (normalized.includes('answer'))
        return 'ANS';
    if (normalized.includes('question'))
        return 'QST';
    if (normalized.includes('geometry'))
        return 'GEO';
    if (normalized.includes('allocation'))
        return 'TAL';
    if (normalized.includes('attendance') || normalized.includes('register'))
        return 'ATT';
    if (normalized.includes('roster'))
        return 'RST';
    if (normalized.includes('admission'))
        return 'ADM';
    if (normalized.includes('assignment'))
        return 'ASN';
    if (normalized.includes('cambridge'))
        return 'CAM';
    if (normalized.includes('ielts'))
        return 'IEL';
    if (normalized.includes('writing'))
        return 'WRT';
    if (normalized.includes('clan'))
        return 'CLN';
    if (normalized.includes('class'))
        return 'CLS';
    return DOCUMENT_PREFIXES[normalized] || 'DOC';
};
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const randomDocumentSuffix = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        let value = bytes.reduce((accumulator, byte) => (accumulator << 8n) | BigInt(byte), 0n) & ((1n << 60n) - 1n);
        let result = '';
        for (let index = 0; index < 12; index += 1) {
            result = CROCKFORD[Number(value & 31n)] + result;
            value >>= 5n;
        }
        return result;
    }
    return Array.from({ length: 12 }, () => CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)]).join('');
};
export const createSchoolDocumentId = (kind) => {
    const prefix = prefixForKind(kind);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${prefix}-${date}-${randomDocumentSuffix()}`;
};
export const escapeSchoolDocumentHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
export const schoolDocumentFileName = (...parts) => {
    const value = parts
        .filter(Boolean)
        .map((part) => String(part).trim().replace(/[^a-z0-9\-]+/gi, '_').replace(/^_+|_+$/g, ''))
        .filter(Boolean)
        .join('_');
    return `${value || 'School_Document'}.pdf`;
};
export const safeCsvCell = (value) => {
    const raw = String(value ?? '');
    const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${formulaSafe.replace(/"/g, '""')}"`;
};
const renderMetaItem = (label, value) => value
    ? `<div class="school-document__meta-item"><span>${escapeSchoolDocumentHtml(label)}</span><strong>${escapeSchoolDocumentHtml(value)}</strong></div>`
    : '';
const documentCss = `
  :root{color-scheme:light;--doc-ink:#13213c;--doc-muted:#5d6b82;--doc-line:#dce3ed;--doc-soft:#f4f7fb;--doc-accent:#165dff;--doc-accent-dark:#0b2f70;--doc-success:#087f5b;--doc-warning:#9a6700;--doc-danger:#b42318}
  *{box-sizing:border-box}
  .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
  html,body{margin:0;min-height:100%;background:#e9eef6;color:var(--doc-ink);font-family:Inter,"Noto Sans",Arial,sans-serif;font-size:10.5pt;line-height:1.48}
  body{padding:74px 20px 32px}
  .school-document__toolbar{position:fixed;z-index:10;inset:0 0 auto;min-height:58px;padding:10px 18px;background:#08162e;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 8px 28px rgba(8,22,46,.24)}
  .school-document__toolbar strong{display:block;font-size:13px}.school-document__toolbar small{display:block;color:#b8c7e3;font-size:10px}
  .school-document__toolbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .school-document__toolbar button,.school-document__toolbar select{min-height:36px;border:1px solid #3b4c68;border-radius:8px;background:#152847;color:#fff;padding:7px 11px;font:700 12px/1 inherit;cursor:pointer}
  .school-document__toolbar button.primary{background:#fff;color:#0b244b;border-color:#fff}
  .school-document{width:210mm;min-height:297mm;margin:0 auto;background:#fff;box-shadow:0 18px 60px rgba(19,33,60,.18);position:relative;padding:27mm 15mm 22mm}
  body[data-paper="Letter"] .school-document{width:216mm;min-height:279mm}
  body[data-orientation="landscape"] .school-document{width:297mm;min-height:210mm}
  body[data-paper="Letter"][data-orientation="landscape"] .school-document{width:279mm;min-height:216mm}
  .school-document__repeating-header{position:absolute;inset:0 0 auto;height:21mm;padding:7mm 15mm 4mm;border-bottom:1px solid var(--doc-line);display:flex;align-items:center;justify-content:space-between;gap:12mm}
  .school-document__brand{display:flex;align-items:center;gap:3mm;min-width:0}.school-document__brand img{width:12mm;height:12mm;object-fit:contain}.school-document__brand-mark{width:12mm;height:12mm;border-radius:3mm;background:var(--doc-accent-dark);color:#fff;display:grid;place-items:center;font-weight:900;font-size:8px}.school-document__brand strong{display:block;font-size:12px}.school-document__brand span{display:block;color:var(--doc-muted);font-size:8px;letter-spacing:.08em;text-transform:uppercase}
  .school-document__header-id{text-align:right;font-size:8px;color:var(--doc-muted)}.school-document__header-id strong{display:block;color:var(--doc-ink);font:700 9px/1.3 "Courier New",monospace}
  .school-document__hero{padding:0 0 7mm;border-bottom:2px solid var(--doc-accent-dark);display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:end}.school-document__eyebrow{margin:0 0 2mm;color:var(--doc-accent);font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.school-document h1{margin:0;font-size:24px;line-height:1.12;letter-spacing:-.02em}.school-document__subtitle{margin:2mm 0 0;color:var(--doc-muted)}
  .school-document__badges{display:flex;gap:2mm;justify-content:flex-end;flex-wrap:wrap}.school-document__badge{border:1px solid var(--doc-line);border-radius:999px;background:var(--doc-soft);padding:1.5mm 3mm;font-size:8px;font-weight:800}.school-document__badge--draft{border-color:#efc66a;background:#fff8e6;color:#7b4b00}.school-document__badge--confidential{border-color:#f3b4ad;background:#fff2f0;color:#8f2118}
  .school-document__meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2.5mm;margin:5mm 0 7mm}.school-document__meta-item{border:1px solid var(--doc-line);border-radius:2mm;background:var(--doc-soft);padding:2.5mm 3mm}.school-document__meta-item span{display:block;color:var(--doc-muted);font-size:7.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.school-document__meta-item strong{display:block;margin-top:.8mm;font-size:10px;overflow-wrap:anywhere}
  .school-document__body h2{margin:7mm 0 2.5mm;padding-bottom:1.5mm;border-bottom:1px solid var(--doc-line);font-size:15px;color:var(--doc-accent-dark);break-after:avoid}.school-document__body h3{margin:4mm 0 2mm;font-size:12px;break-after:avoid}.school-document__body p{margin:0 0 3mm}.school-document__body ul,.school-document__body ol{margin:2mm 0 4mm;padding-left:6mm}.school-document__body li{margin-bottom:1mm}.school-document__body .document-callout{border-left:1.2mm solid var(--doc-accent);border-radius:1.5mm;background:#eef4ff;padding:3mm 4mm;margin:3mm 0}.school-document__body .document-callout--warning{border-color:#e0a100;background:#fff8e5}.school-document__body .document-callout--private{border-color:#b42318;background:#fff3f2}.school-document__body .document-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm}.school-document__body .document-card{border:1px solid var(--doc-line);border-radius:2mm;padding:3.5mm;break-inside:avoid}.school-document__body .document-card strong{display:block;margin-bottom:1mm}.school-document__body table{width:100%;border-collapse:collapse;margin:2mm 0 5mm;font-size:8.5px}.school-document__body thead{display:table-header-group}.school-document__body tr{break-inside:avoid}.school-document__body th{background:var(--doc-accent-dark);color:#fff;text-align:left;font-size:7.5px;text-transform:uppercase;letter-spacing:.04em}.school-document__body th,.school-document__body td{border:1px solid var(--doc-line);padding:2mm;vertical-align:top}.school-document__body tbody tr:nth-child(even){background:var(--doc-soft)}.school-document__body .document-page-break{break-before:page}.school-document__body .document-appendix{break-before:page}.school-document__body .document-signatures{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:12mm}.school-document__body .document-signature{border-top:1px solid var(--doc-ink);padding-top:2mm;color:var(--doc-muted);font-size:8px}
  .school-document__page-footer{position:absolute;inset:auto 15mm 7mm;border-top:1px solid var(--doc-line);padding-top:2.5mm;display:flex;justify-content:space-between;gap:8mm;color:var(--doc-muted);font-size:7.5px}.school-document__page-footer span:last-child{text-align:right}
  .school-document__draft-watermark{display:none}.school-document[data-status="draft"] .school-document__draft-watermark{display:block;position:fixed;z-index:0;inset:42% 0 auto;transform:rotate(-26deg);text-align:center;font-size:80px;font-weight:900;letter-spacing:.18em;color:rgba(154,103,0,.08);pointer-events:none}
  body.ink-saver{--doc-accent:#1f2937;--doc-accent-dark:#111827;--doc-soft:#fff}.ink-saver .school-document__body tbody tr:nth-child(even){background:#fff}.ink-saver .school-document__body th{background:#fff;color:#111;border-width:1.5px}.ink-saver .school-document__badge,.ink-saver .school-document__meta-item,.ink-saver .document-callout{background:#fff}
  @media(max-width:900px){body{padding:68px 0 0}.school-document__toolbar{align-items:flex-start}.school-document__toolbar>div:first-child{display:none}.school-document__toolbar-actions{justify-content:flex-start}.school-document{width:100%!important;min-height:0!important;box-shadow:none;padding-left:16px;padding-right:16px}.school-document__meta{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media print{
    html,body{background:#fff!important}.school-document__toolbar{display:none!important}body{padding:0!important}.school-document{width:auto!important;min-height:0!important;margin:0!important;box-shadow:none!important;padding:23mm 0 18mm!important}.school-document__repeating-header{position:fixed;inset:0 0 auto;height:18mm;padding:3mm 0;border-bottom:1px solid var(--doc-line)}.school-document__page-footer{position:fixed;inset:auto 0 0;padding-top:2mm}.school-document__draft-watermark{position:fixed}.school-document__body a{color:inherit;text-decoration:none}.no-print{display:none!important}
  }
`;
const previewScript = `
  (() => {
    const body = document.body;
    const pageStyle = document.getElementById('school-document-page-style');
    const syncPage = () => {
      const paper = body.dataset.paper || 'A4';
      const orientation = body.dataset.orientation || 'portrait';
      pageStyle.textContent = '@page{size:' + paper + ' ' + orientation + ';margin:18mm 15mm 16mm}';
    };
    document.getElementById('document-print')?.addEventListener('click', async () => {
      await document.fonts?.ready;
      await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.addEventListener('load', resolve, { once:true }); image.addEventListener('error', resolve, { once:true }); })));
      window.print();
    });
    document.getElementById('document-ink')?.addEventListener('click', () => body.classList.toggle('ink-saver'));
    document.getElementById('document-close')?.addEventListener('click', () => window.close());
    document.getElementById('document-paper')?.addEventListener('change', (event) => { body.dataset.paper = event.target.value; syncPage(); });
    document.getElementById('document-orientation')?.addEventListener('change', (event) => { body.dataset.orientation = event.target.value; syncPage(); });
    syncPage();
  })();
`;
export const renderSchoolDocumentHtml = ({ meta, bodyHtml, orientation = 'portrait', paper = 'A4', fileName, inkSaver = false }) => {
    const safeSchoolName = meta.schoolName.trim() || PRODUCT_NAME;
    const logoUrl = normalizeBrandLogoUrl(meta.schoolLogoUrl) || (safeSchoolName === PRODUCT_NAME ? PRODUCT_LOGO_URL : null);
    const brandInitials = safeSchoolName.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 3).join('').toUpperCase();
    const generatedAt = new Date(meta.generatedAt);
    const generatedLabel = Number.isNaN(generatedAt.getTime()) ? meta.generatedAt : generatedAt.toLocaleString();
    const resolvedFileName = fileName || schoolDocumentFileName(safeSchoolName, meta.title, new Date().toISOString().slice(0, 10));
    const confidentialityLabel = CONFIDENTIALITY_LABELS[meta.confidentiality];
    const confidentialClass = meta.confidentiality === 'confidential' ? ' school-document__badge--confidential' : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeSchoolDocumentHtml(resolvedFileName.replace(/\.pdf$/i, ''))}</title><style>${documentCss}</style><style id="school-document-page-style"></style></head><body data-paper="${paper}" data-orientation="${orientation}" class="${inkSaver ? 'ink-saver' : ''}">
    <nav class="school-document__toolbar" aria-label="Document controls">
      <div><strong>School document preview</strong><small>${escapeSchoolDocumentHtml(resolvedFileName)}</small></div>
      <div class="school-document__toolbar-actions">
        <label><span class="sr-only">Paper size</span><select id="document-paper" aria-label="Paper size"><option value="A4"${paper === 'A4' ? ' selected' : ''}>A4</option><option value="Letter"${paper === 'Letter' ? ' selected' : ''}>Letter</option></select></label>
        <label><span class="sr-only">Orientation</span><select id="document-orientation" aria-label="Orientation"><option value="portrait"${orientation === 'portrait' ? ' selected' : ''}>Portrait</option><option value="landscape"${orientation === 'landscape' ? ' selected' : ''}>Landscape</option></select></label>
        <button id="document-ink" type="button">Ink saver</button><button id="document-print" class="primary" type="button">Print / Save PDF</button><button id="document-close" type="button">Close</button>
      </div>
    </nav>
    <main class="school-document" data-status="${meta.status}">
      <div class="school-document__draft-watermark" aria-hidden="true">DRAFT</div>
      <header class="school-document__repeating-header">
        <div class="school-document__brand">${logoUrl ? `<img src="${escapeSchoolDocumentHtml(logoUrl)}" alt="${escapeSchoolDocumentHtml(safeSchoolName)} logo">` : `<span class="school-document__brand-mark">${escapeSchoolDocumentHtml(brandInitials || 'SCH')}</span>`}<div><strong>${escapeSchoolDocumentHtml(safeSchoolName)}</strong><span>Official school document</span></div></div>
        <div class="school-document__header-id"><span>Document ID</span><strong>${escapeSchoolDocumentHtml(meta.documentId)}</strong></div>
      </header>
      <section class="school-document__hero"><div><p class="school-document__eyebrow">${escapeSchoolDocumentHtml(AUDIENCE_LABELS[meta.audience])}</p><h1>${escapeSchoolDocumentHtml(meta.title)}</h1>${meta.subtitle ? `<p class="school-document__subtitle">${escapeSchoolDocumentHtml(meta.subtitle)}</p>` : ''}</div><div class="school-document__badges"><span class="school-document__badge${meta.status === 'draft' ? ' school-document__badge--draft' : ''}">${meta.status === 'draft' ? 'Draft' : 'Final'}</span><span class="school-document__badge${confidentialClass}">${escapeSchoolDocumentHtml(confidentialityLabel)}</span></div></section>
      <section class="school-document__meta">
        ${renderMetaItem('Student', meta.studentName)}${renderMetaItem('Class', meta.className)}${renderMetaItem('Subject', meta.subject)}${renderMetaItem('Academic year', meta.academicYear)}${renderMetaItem('Term / period', meta.term)}${renderMetaItem('Generated by', meta.generatedBy)}${renderMetaItem('Generated', generatedLabel)}${renderMetaItem('Document type', meta.documentTypeLabel || schoolDocumentTypeLabel(meta.templateVersion, meta.title))}
      </section>
      <article class="school-document__body">${bodyHtml}</article>
      <footer class="school-document__page-footer"><span>${escapeSchoolDocumentHtml(safeSchoolName)} · ${escapeSchoolDocumentHtml(confidentialityLabel)}</span><span>Document reference: ${escapeSchoolDocumentHtml(meta.documentId)}</span></footer>
    </main><script>${previewScript}<\/script></body></html>`;
};
export const registerSchoolDocumentRecord = async (options) => {
    if (options.meta.schoolId) {
        const resolvedFileName = options.fileName || schoolDocumentFileName(options.meta.schoolName, options.meta.title, new Date().toISOString().slice(0, 10));
        const canPersistPayload = options.persistPayload !== false && options.bodyHtml.length <= 250_000 && !options.bodyHtml.includes('data:image/');
        await import('../../services/supabaseClient').then(({ supabase }) => supabase
            .from('school_document_records')
            .insert({
            school_id: options.meta.schoolId,
            document_id: options.meta.documentId,
            template_key: options.meta.templateVersion.replace(/-v\d+$/i, ''),
            template_version: options.meta.templateVersion,
            title: options.meta.title,
            audience: options.meta.audience,
            status: options.meta.status,
            confidentiality: options.meta.confidentiality,
            source_type: options.meta.sourceType ?? null,
            source_id: options.meta.sourceId ?? null,
            student_user_id: options.meta.studentUserId ?? null,
            class_id: options.meta.classId ?? null,
            visibility_scope: options.meta.visibilityScope ?? 'private',
            generated_at: options.meta.generatedAt,
            finalized_at: options.meta.status === 'final' ? options.meta.generatedAt : null,
            payload: canPersistPayload
                ? { meta: options.meta, bodyHtml: options.bodyHtml, orientation: options.orientation ?? 'portrait', paper: options.paper ?? 'A4', inkSaver: options.inkSaver ?? false, fileName: resolvedFileName }
                : { meta: options.meta, payloadOmitted: true, fileName: resolvedFileName },
        })
            .then(({ error }) => {
            if (error && import.meta.env.DEV)
                console.warn('School document audit record was not saved', error.message);
        }))
            .catch((error) => {
            if (import.meta.env.DEV)
                console.warn('School document registry unavailable', error);
        });
    }
};
export const openSchoolDocumentPreview = (options) => {
    const preview = window.open('', '_blank');
    if (!preview)
        throw new Error('The document preview was blocked. Allow pop-ups for Brains Heist and try again.');
    preview.opener = null;
    preview.document.open();
    preview.document.write(renderSchoolDocumentHtml(options));
    preview.document.close();
    void registerSchoolDocumentRecord(options);
    return preview;
};
