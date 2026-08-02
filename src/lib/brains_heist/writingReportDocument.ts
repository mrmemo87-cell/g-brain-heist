import type { TeacherWritingReport } from './writingIntegrationService.js';
import { createSchoolDocumentId, schoolDocumentFileName } from '../schoolDocument.js';

export type WritingReportAudience = 'parent' | 'teacher';

export interface WritingReportDocumentOptions {
  audience: WritingReportAudience;
  teacherComment?: string;
  reportStatus?: 'draft' | 'final';
  documentId?: string;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const humanizeWritingTag = (value: string): string => {
  const overrides: Record<string, string> = {
    partial_content_coverage: 'Develop every part of the task more fully',
    missed_content_point: 'Respond to every part of the task',
    weak_genre_convention: 'Use the expected structure and style for this writing type',
    run_on: 'Separate long sentences and control punctuation',
    weak_paragraphing: 'Organize ideas into clear paragraphs',
    weak_linking: 'Connect ideas more smoothly',
    weak_register_control: 'Use a tone that suits the audience and purpose',
    under_length: 'Develop ideas with more relevant detail',
  };
  return overrides[value] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const listHtml = (items: string[], emptyMessage: string): string => {
  const safeItems = items.filter(Boolean).slice(0, 3);
  if (!safeItems.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  return `<ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const scoreValue = (value: number | null | undefined): string =>
  value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value)}/20`;

const scoreBar = (label: string, value: number | null | undefined): string => {
  const numeric = value == null ? 0 : Math.max(0, Math.min(5, Number(value)));
  return `<div class="rubric-row">
    <span>${escapeHtml(label)}</span>
    <div class="rubric-track"><i style="width:${Math.round((numeric / 5) * 100)}%"></i></div>
    <strong>${value == null ? '—' : `${numeric}/5`}</strong>
  </div>`;
};

export const buildProfessionalWritingReportHtml = (
  report: TeacherWritingReport,
  options: WritingReportDocumentOptions
): string => {
  const summary = report.overall_summary;
  const recordedSubmissions = summary.submission_count ?? summary.completed_tasks ?? 0;
  const submissions = Math.max(recordedSubmissions, summary.latest_score == null ? 0 : 1);
  const practiceAssigned = summary.practice_assigned_count ?? summary.total_tasks ?? 0;
  const practiceCompleted = summary.practice_completed_count ?? summary.completed_tasks ?? 0;
  const isBaseline = submissions < 2;
  const title = options.audience === 'parent' ? 'Writing Progress Report' : 'Writing Review & Planning';
  const stage = isBaseline ? 'Starting-point profile' : 'Progress update';
  const strengths = report.strengths.filter(Boolean);
  const growthTargets = report.priority_weak_areas.map(humanizeWritingTag);
  const actions = report.teacher_actions.map((item) =>
    item.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  );
  const rubric = report.rubric_scores ?? {
    content: null,
    communicative_achievement: null,
    organisation: null,
    language: null,
  };
  const schoolName = report.institution?.school_name || 'Brains Heist';
  const schoolLogoUrl = report.institution?.school_logo_url?.trim();
  const safeSchoolLogoUrl = schoolLogoUrl && /^https:\/\//i.test(schoolLogoUrl)
    ? schoolLogoUrl
    : null;
  const teacherName = report.institution?.teacher_name || 'Writing teacher';
  const generated = new Date(report.generated_at || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const integrityLabel = report.integrity?.review_status === 'review_recommended'
    ? 'Teacher review is recommended before this estimate is shared.'
    : report.integrity?.review_status === 'no_concerns_observed'
      ? 'No writing-process concerns were observed in the available evidence.'
      : 'This was completed in practice mode. It supports learning but does not claim to verify authorship.';
  const trendValue = isBaseline || summary.score_trend_delta == null
    ? 'Building baseline'
    : `${summary.score_trend_delta > 0 ? '+' : ''}${summary.score_trend_delta} points`;
  const practiceValue = practiceAssigned > 0 ? `${practiceCompleted}/${practiceAssigned}` : 'Not assigned';
  const scoreProgress = summary.latest_score == null
    ? 0
    : Math.max(0, Math.min(100, Math.round((Number(summary.latest_score) / 20) * 100)));
  const teacherComment = options.teacherComment?.trim() || 'No additional teacher comment has been added.';
  const documentId = options.documentId || createSchoolDocumentId('writing');
  const intro = options.audience === 'parent'
    ? 'A clear, teacher-guided summary of current writing strengths and the next learning steps.'
    : 'A concise evidence summary for feedback, planning and intervention.';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(report.student.student_name)}</title>
  <style>
    @page{size:A4 portrait;margin:9mm}
    *{box-sizing:border-box}
    :root{--ink:#10213b;--muted:#64748b;--line:#dce5ef;--paper:#fff;--wash:#f4f7fb;--navy:#091a31;--teal:#16b8aa;--blue:#4157e8;--rose:#ef6a83;--gold:#d39a2f}
    body{margin:0;background:#e9eef5;color:var(--ink);font-family:Inter,Arial,"Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .report{width:min(210mm,100%);margin:0 auto;background:var(--paper);min-height:100vh;box-shadow:0 18px 55px rgba(15,23,42,.13)}
    .masthead{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end;padding:15mm 15mm 9mm;background:var(--navy);color:#fff;border-bottom:4px solid var(--teal)}
    .brand{display:flex;align-items:center;gap:9px;color:#b8fff5;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    .brand-mark{display:grid;place-items:center;width:30px;height:30px;overflow:hidden;border-radius:9px;background:linear-gradient(135deg,var(--teal),#5765ff);color:#fff;font-size:14px}
    .brand-mark img{width:100%;height:100%;object-fit:contain;background:#fff}
    h1{margin:12px 0 3px;font-size:25px;line-height:1.05;letter-spacing:-.025em}
    .intro{margin:0;max-width:128mm;color:#cbd7e8;font-size:10.5px;line-height:1.4}
    .document-state{text-align:right}
    .document-state strong{display:inline-block;padding:6px 9px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(255,255,255,.08);font-size:8px;letter-spacing:.09em;text-transform:uppercase}
    .document-state span{display:block;margin-top:7px;color:#aebed3;font-size:8.5px}
    .body{padding:8mm 15mm 9mm}
    .identity{display:grid;grid-template-columns:1.3fr 1.3fr .55fr .8fr;gap:7px;padding-bottom:7px;border-bottom:1px solid var(--line)}
    .datum{min-width:0}
    .datum span,.eyebrow{display:block;color:var(--muted);font-size:7.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
    .datum strong{display:block;margin-top:4px;overflow-wrap:anywhere;font-size:10.5px}
    .summary{display:grid;grid-template-columns:1.15fr 2fr;gap:10px;margin-top:10px}
    .score-card{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:12px;border:1px solid #cfd9f8;border-radius:12px;background:linear-gradient(140deg,#f4f8ff,#f1f2ff)}
    .score-ring{display:grid;place-items:center;width:62px;height:62px;border-radius:50%;background:conic-gradient(var(--blue) 0 var(--score-progress),#dce3f3 var(--score-progress) 100%);position:relative}
    .score-ring:before{content:"";position:absolute;inset:7px;border-radius:50%;background:#fff}
    .score-ring strong{position:relative;font-size:15px;color:var(--blue)}
    .score-card h2{margin:4px 0 3px;font-size:13px}
    .score-card p{margin:0;color:var(--muted);font-size:8.5px;line-height:1.4}
    .evidence{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
    .metric{padding:11px;border:1px solid var(--line);border-radius:11px;background:var(--wash)}
    .metric strong{display:block;margin-top:7px;font-size:15px}
    .metric small{display:block;margin-top:3px;color:var(--muted);font-size:7.5px;line-height:1.35}
    .integrity{margin-top:8px;padding:8px 10px;border-left:3px solid var(--gold);border-radius:5px;background:#fff9e9;color:#694e20;font-size:8px;line-height:1.4}
    .learning-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}
    .panel{break-inside:avoid;border:1px solid var(--line);border-radius:11px;padding:11px;background:#fff}
    .panel h2{display:flex;align-items:center;gap:7px;margin:0 0 7px;font-size:11.5px}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--teal);flex:0 0 auto}
    .growth .dot{background:var(--rose)}
    .panel p,.panel li{color:#34435a;font-size:8.5px;line-height:1.43}
    ul{margin:0;padding-left:15px}
    li+li{margin-top:4px}
    .empty{margin:0;color:var(--muted);font-style:italic}
    .planning{display:grid;grid-template-columns:1.15fr .85fr;gap:9px;margin-top:9px}
    .rubric-row{display:grid;grid-template-columns:1.4fr 1fr 28px;gap:7px;align-items:center;color:#34435a;font-size:8px}
    .rubric-row+.rubric-row{margin-top:7px}
    .rubric-track{height:6px;overflow:hidden;border-radius:999px;background:#e6ebf3}
    .rubric-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--teal),var(--blue))}
    .rubric-row strong{text-align:right}
    .comment{margin:0;white-space:pre-wrap;min-height:20px}
    .signoff{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:11px}
    .signoff div{padding-top:5px;border-top:1px solid #9aa8ba;color:var(--muted);font-size:7.5px}
    footer{display:flex;justify-content:space-between;gap:12px;margin-top:9px;padding-top:6px;border-top:1px solid var(--line);color:#8290a3;font-size:7px}
    .actions{position:sticky;bottom:0;display:flex;justify-content:center;gap:8px;padding:12px;background:rgba(9,26,49,.96)}
    .actions button{border:0;border-radius:9px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer}
    .actions button.secondary{background:#dfe7f2;color:var(--ink)}
    body.ink-saver{--wash:#fff;--navy:#111827;--teal:#1f2937;--blue:#111827;--rose:#374151;--gold:#4b5563}.ink-saver .score-card,.ink-saver .metric,.ink-saver .integrity{background:#fff!important}.ink-saver .rubric-track i{background:#111827}
    @media(max-width:720px){
      .masthead{grid-template-columns:1fr;padding:30px 20px 22px}.document-state{text-align:left}
      .body{padding:18px 16px 26px}.identity,.summary,.learning-grid,.planning{grid-template-columns:1fr 1fr}
      .summary{grid-template-columns:1fr}.evidence{grid-template-columns:repeat(3,1fr)}
      .report{min-height:100vh}.score-card{grid-column:1/-1}
    }
    @media(max-width:460px){
      .identity,.learning-grid,.planning{grid-template-columns:1fr}.identity{gap:10px}
      .datum{padding-bottom:7px;border-bottom:1px solid var(--line)}.evidence{grid-template-columns:1fr 1fr}
    }
    @media print{
      body{background:#fff}.report{width:auto;min-height:auto;box-shadow:none}
      .masthead{padding:8mm 9mm 6mm}.body{padding:6mm 9mm 4mm}
      .identity{grid-template-columns:1.3fr 1.3fr .55fr .8fr}
      .summary{grid-template-columns:1.15fr 2fr}.learning-grid{grid-template-columns:1fr 1fr}.planning{grid-template-columns:1.15fr .85fr}
      .actions{display:none}
    }
  </style>
</head>
<body>
<main class="report">
  <header class="masthead">
    <div>
      <div class="brand"><span class="brand-mark">${safeSchoolLogoUrl ? `<img src="${escapeHtml(safeSchoolLogoUrl)}" alt="">` : 'BH'}</span>${escapeHtml(schoolName)} Writing Hub</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(intro)}</p>
    </div>
    <div class="document-state"><strong>${escapeHtml(options.reportStatus ?? 'draft')} · ${escapeHtml(stage)}</strong><span>${escapeHtml(options.audience === 'parent' ? 'Family copy' : 'Teacher working copy')}</span><span>${escapeHtml(documentId)}</span><span>Generated ${escapeHtml(generated)}</span></div>
  </header>
  <div class="body">
    <section class="identity">
      <div class="datum"><span>Student</span><strong>${escapeHtml(report.student.student_name)}</strong></div>
      <div class="datum"><span>Class</span><strong>${escapeHtml(report.student.class_name || 'Not assigned')}</strong></div>
      <div class="datum"><span>Grade</span><strong>${escapeHtml(report.student.grade ?? '—')}</strong></div>
      <div class="datum"><span>Period</span><strong>${escapeHtml(report.period)}</strong></div>
    </section>

    <section class="summary">
      <article class="score-card">
        <div class="score-ring" style="--score-progress:${scoreProgress}%"><strong>${escapeHtml(scoreValue(summary.latest_score))}</strong></div>
        <div><span class="eyebrow">Formative writing estimate</span><h2>${escapeHtml(isBaseline ? 'A starting point, not a final judgement' : 'Current performance')}</h2><p>Use this estimate with the student’s writing evidence and teacher judgement.</p></div>
      </article>
      <div class="evidence">
        <article class="metric"><span class="eyebrow">Writing evidence</span><strong>${escapeHtml(submissions)}</strong><small>${submissions === 1 ? 'submission available' : 'submissions available'}</small></article>
        <article class="metric"><span class="eyebrow">Practice plan</span><strong>${escapeHtml(practiceValue)}</strong><small>${practiceAssigned > 0 ? 'activities completed' : 'No plan set yet'}</small></article>
        <article class="metric"><span class="eyebrow">Recent trend</span><strong>${escapeHtml(trendValue)}</strong><small>${isBaseline ? 'Needs 2 comparable submissions' : 'Compared with recent writing'}</small></article>
      </div>
    </section>

    <div class="integrity"><strong>Writing-process context:</strong> ${escapeHtml(integrityLabel)} Automated feedback is formative and remains subject to teacher judgement.</div>

    <section class="learning-grid">
      <article class="panel"><h2><i class="dot"></i>What is going well</h2>${listHtml(strengths, 'Strengths will appear when enough writing evidence has been collected.')}</article>
      <article class="panel growth"><h2><i class="dot"></i>What to improve next</h2>${listHtml(growthTargets, 'No priority growth target has been identified yet.')}</article>
    </section>

    <section class="planning">
      <article class="panel"><h2><i class="dot"></i>Recommended next steps</h2>${listHtml(actions, 'Complete another writing task and use one feedback target in the revision.')}</article>
      <article class="panel"><h2><i class="dot"></i>Rubric snapshot</h2>
        ${scoreBar('Content', rubric.content)}
        ${scoreBar('Communication', rubric.communicative_achievement)}
        ${scoreBar('Organisation', rubric.organisation)}
        ${scoreBar('Language', rubric.language)}
      </article>
    </section>

    <section class="panel" style="margin-top:9px"><h2><i class="dot"></i>Teacher comment</h2><p class="comment">${escapeHtml(teacherComment.slice(0, 600))}</p></section>
    <section class="signoff"><div>${escapeHtml(teacherName)} · Teacher</div><div>Date / signature</div></section>
    <footer><span>${escapeHtml(schoolName)} Writing Hub · Writing progress report</span><span>Document reference: ${escapeHtml(documentId)} · Confidential student learning record</span></footer>
  </div>
  <div class="actions">
    <button class="secondary" onclick="document.body.classList.toggle('ink-saver')">Ink saver</button>
    <button onclick="printReport()">Print / Save PDF</button>
    <button class="secondary" onclick="window.close()">Close preview</button>
  </div>
</main>
<script>
  async function printReport(){
    if(document.fonts){await document.fonts.ready;}
    await Promise.all(Array.from(document.images).map((image)=>image.complete?Promise.resolve():new Promise((resolve)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    window.print();
  }
</script>
</body>
</html>`;
};

export const openProfessionalWritingReport = (
  report: TeacherWritingReport,
  options: WritingReportDocumentOptions
): boolean => {
  if (typeof window === 'undefined') return false;
  const reportWindow = window.open('', '_blank', 'width=1080,height=900');
  if (!reportWindow) return false;
  const documentId = createSchoolDocumentId('writing');
  const renderedOptions = { ...options, documentId };
  const rawHtml = buildProfessionalWritingReportHtml(report, renderedOptions);
  reportWindow.document.open();
  reportWindow.document.write(rawHtml);
  reportWindow.document.close();
  const schoolId = report.institution?.school_id;
  if (schoolId) {
    const fileName = schoolDocumentFileName(report.institution?.school_name, report.student.student_name, 'Writing_Report', report.period);
    void import('../../../services/supabaseClient').then(({ supabase }) => supabase.from('school_document_records').insert({
      school_id: schoolId,
      document_id: documentId,
      template_key: 'writing-report',
      template_version: 'writing-report-v2',
      title: options.audience === 'parent' ? 'Writing Progress Report' : 'Writing Review & Planning',
      audience: options.audience === 'parent' ? 'family' : 'teacher',
      status: options.reportStatus ?? 'draft',
      confidentiality: options.audience === 'parent' ? 'family-copy' : 'confidential',
      source_type: 'writing_student_period',
      source_id: `${report.student.student_id}:${report.period}`,
      student_user_id: report.student.student_id,
      generated_at: report.generated_at,
      finalized_at: options.reportStatus === 'final' ? report.generated_at : null,
      payload: { rawHtml, fileName },
    }).then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('Writing document audit record was not saved', error.message);
    })).catch((error: unknown) => {
      if (import.meta.env.DEV) console.warn('Writing document registry unavailable', error);
    });
  }
  return true;
};
