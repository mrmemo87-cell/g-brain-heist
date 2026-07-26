import type { TeacherWritingReport } from './writingIntegrationService.js';

export type WritingReportAudience = 'parent' | 'teacher';

export interface WritingReportDocumentOptions {
  audience: WritingReportAudience;
  teacherComment?: string;
  reportStatus?: 'draft' | 'final';
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
  const safeItems = items.filter(Boolean);
  if (!safeItems.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  return `<ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const scoreValue = (value: number | null | undefined): string =>
  value == null || Number.isNaN(Number(value)) ? 'Not available' : `${Number(value)}/20`;

const scoreBar = (label: string, value: number | null | undefined): string => {
  const numeric = value == null ? 0 : Math.max(0, Math.min(5, Number(value)));
  return `<div class="rubric-row">
    <div class="rubric-label"><span>${escapeHtml(label)}</span><strong>${value == null ? '-' : `${numeric}/5`}</strong></div>
    <div class="rubric-track"><i style="width:${Math.round((numeric / 5) * 100)}%"></i></div>
  </div>`;
};

export const buildProfessionalWritingReportHtml = (
  report: TeacherWritingReport,
  options: WritingReportDocumentOptions
): string => {
  const summary = report.overall_summary;
  const submissions = summary.submission_count ?? summary.completed_tasks ?? 0;
  const practiceAssigned = summary.practice_assigned_count ?? summary.total_tasks ?? 0;
  const practiceCompleted = summary.practice_completed_count ?? summary.completed_tasks ?? 0;
  const isBaseline = submissions < 2;
  const title = options.audience === 'parent'
    ? isBaseline ? 'Writing Baseline Report' : 'Writing Progress Report'
    : isBaseline ? 'Teacher Writing Baseline' : 'Teacher Writing Review';
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
  const schoolName = report.institution?.school_name || 'Brain Heist School';
  const schoolLogoUrl = report.institution?.school_logo_url?.trim();
  const safeSchoolLogoUrl = schoolLogoUrl && /^https?:\/\//i.test(schoolLogoUrl)
    ? schoolLogoUrl
    : null;
  const teacherName = report.institution?.teacher_name || 'Writing teacher';
  const generated = new Date(report.generated_at || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const integrityLabel = report.integrity?.review_status === 'review_recommended'
    ? 'Teacher review recommended'
    : report.integrity?.review_status === 'no_concerns_observed'
      ? 'No integrity concerns observed'
      : 'Practice submission - authorship not verified';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(report.student.student_name)}</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{margin:0;background:#eef3fb;color:#12203a;font-family:Arial,"Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .report{width:min(210mm,100%);margin:0 auto;background:#fff;min-height:273mm;box-shadow:0 20px 60px rgba(15,23,42,.12)}
    .hero{padding:22mm 18mm 13mm;background:linear-gradient(135deg,#071427 0%,#102d5e 58%,#3b3ee8 100%);color:#fff;position:relative;overflow:hidden}
    .hero:after{content:"";position:absolute;width:130mm;height:130mm;border-radius:50%;right:-65mm;top:-75mm;background:radial-gradient(circle,rgba(45,212,191,.42),transparent 66%)}
    .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:11px;color:#9ff6ec}
    .brand-mark{display:grid;place-items:center;width:34px;height:34px;overflow:hidden;border-radius:11px;background:linear-gradient(135deg,#15d4cc,#635bff);color:#fff;font-size:17px}
    .brand-mark img{width:100%;height:100%;object-fit:contain;background:#fff}
    h1{font-size:30px;line-height:1.08;margin:18px 0 7px;max-width:145mm}
    .subtitle{margin:0;color:#d8e5ff;font-size:13px}
    .status{display:inline-flex;margin-top:14px;padding:7px 10px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.12);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    .body{padding:12mm 18mm 15mm}
    .identity{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:8px;margin-top:-19mm;position:relative}
    .identity-card{padding:13px;border:1px solid #dbe5f4;border-radius:13px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    .identity-card span,.metric span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7b94;font-weight:800}
    .identity-card strong{display:block;margin-top:5px;font-size:14px;color:#10203b}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:13px 0}
    .metric{border-radius:13px;padding:13px;background:#f6f8fd;border:1px solid #e0e7f2}
    .metric strong{display:block;margin-top:6px;font-size:20px;color:#14264a}
    .metric small{display:block;margin-top:4px;color:#71809a;font-size:9px}
    .metric.score{background:linear-gradient(145deg,#edf5ff,#eef0ff);border-color:#cbd8ff}
    .metric.score strong{color:#2a48d7}
    .notice{border-radius:12px;padding:10px 12px;background:#fff8e8;border:1px solid #f4d487;color:#765312;font-size:10px;line-height:1.45}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:12px}
    .section{break-inside:avoid;border:1px solid #dde6f2;border-radius:14px;padding:14px;background:#fff}
    .section h2{display:flex;align-items:center;gap:8px;margin:0 0 9px;font-size:14px;color:#14264a}
    .section h2 i{width:8px;height:8px;border-radius:50%;background:#2dd4bf}
    .section.growth h2 i{background:#fb7185}
    .section p,.section li{font-size:10.5px;line-height:1.55;color:#35435c}
    ul{margin:0;padding-left:17px}
    li+li{margin-top:6px}
    .empty{color:#7a879a;font-style:italic}
    .rubric{margin-top:12px}
    .rubric-row+.rubric-row{margin-top:8px}
    .rubric-label{display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px;color:#35435c}
    .rubric-track{height:7px;border-radius:999px;background:#e8edf5;overflow:hidden}
    .rubric-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#18c8b8,#4b5ef5)}
    .teacher-note{min-height:30mm;white-space:pre-wrap}
    .signature{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:18px}
    .signature div{border-top:1px solid #93a1b5;padding-top:5px;font-size:9px;color:#71809a}
    footer{display:flex;justify-content:space-between;gap:10px;margin-top:14px;padding-top:8px;border-top:1px solid #e1e8f2;color:#7a879a;font-size:8.5px}
    .actions{position:sticky;bottom:0;display:flex;justify-content:center;gap:8px;padding:12px;background:rgba(7,20,39,.94)}
    .actions button{border:0;border-radius:9px;padding:10px 14px;background:#4b5ef5;color:#fff;font-weight:800;cursor:pointer}
    .actions button.secondary{background:#dbe5f4;color:#14264a}
    @media(max-width:720px){.hero{padding:28px 20px 70px}.body{padding:0 14px 24px}.identity{grid-template-columns:1fr 1fr}.metrics,.grid{grid-template-columns:1fr 1fr}.report{min-height:100vh}.actions{display:flex}}
    @media print{body{background:#fff}.report{box-shadow:none;min-height:auto}.actions{display:none}.hero{padding-top:14mm}.body{padding-bottom:0}}
  </style>
</head>
<body>
<main class="report">
  <header class="hero">
    <div class="brand"><span class="brand-mark">${safeSchoolLogoUrl ? `<img src="${escapeHtml(safeSchoolLogoUrl)}" alt="">` : 'BH'}</span>${escapeHtml(schoolName)} Writing Hub</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(options.audience === 'parent' ? 'A clear summary of current writing performance and the next learning steps.' : 'Evidence-led writing review for teacher planning and intervention.')}</p>
    <span class="status">${escapeHtml(options.reportStatus ?? 'draft')} report</span>
  </header>
  <div class="body">
    <section class="identity">
      <div class="identity-card"><span>Student</span><strong>${escapeHtml(report.student.student_name)}</strong></div>
      <div class="identity-card"><span>Class</span><strong>${escapeHtml(report.student.class_name || 'Not assigned')}</strong></div>
      <div class="identity-card"><span>Grade</span><strong>${escapeHtml(report.student.grade ?? '-')}</strong></div>
      <div class="identity-card"><span>Period</span><strong>${escapeHtml(report.period)}</strong></div>
    </section>
    <section class="metrics">
      <div class="metric score"><span>Formative estimate</span><strong>${escapeHtml(scoreValue(summary.latest_score))}</strong><small>Teacher validation available</small></div>
      <div class="metric"><span>Writing submissions</span><strong>${escapeHtml(submissions)}</strong><small>${isBaseline ? 'Baseline evidence' : 'Comparable attempts'}</small></div>
      <div class="metric"><span>Practice plan</span><strong>${escapeHtml(`${practiceCompleted}/${practiceAssigned}`)}</strong><small>Tasks completed</small></div>
      <div class="metric"><span>Recent trend</span><strong>${escapeHtml(isBaseline ? '-' : summary.score_trend_delta ?? '-')}</strong><small>${isBaseline ? 'Needs 2 submissions' : 'Score movement'}</small></div>
    </section>
    <div class="notice"><strong>Integrity context:</strong> ${escapeHtml(integrityLabel)}. Automated scores are formative estimates and should be interpreted with the student evidence and teacher judgement.</div>
    <section class="grid">
      <article class="section"><h2><i></i>What is going well</h2>${listHtml(strengths, 'Strengths will appear when enough evidence has been collected.')}</article>
      <article class="section growth"><h2><i></i>What to improve next</h2>${listHtml(growthTargets, 'No priority growth target has been identified yet.')}</article>
      <article class="section"><h2><i></i>Recommended next steps</h2>${listHtml(actions, 'Complete another writing task and use one feedback target in the revision.')}</article>
      <article class="section"><h2><i></i>Rubric snapshot</h2><div class="rubric">
        ${scoreBar('Content', rubric.content)}
        ${scoreBar('Communicative achievement', rubric.communicative_achievement)}
        ${scoreBar('Organisation', rubric.organisation)}
        ${scoreBar('Language', rubric.language)}
      </div></article>
    </section>
    <section class="section" style="margin-top:11px"><h2><i></i>Teacher comment</h2><p class="teacher-note">${escapeHtml(options.teacherComment?.trim() || 'No additional teacher comment has been added yet.')}</p></section>
    <section class="signature"><div>${escapeHtml(teacherName)} - Teacher</div><div>Date / signature</div></section>
    <footer><span>Generated ${escapeHtml(generated)} by Brain Heist Writing Hub</span><span>Confidential student learning record</span></footer>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save PDF</button>
    <button class="secondary" onclick="window.close()">Close preview</button>
  </div>
</main>
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
  reportWindow.document.open();
  reportWindow.document.write(buildProfessionalWritingReportHtml(report, options));
  reportWindow.document.close();
  return true;
};
