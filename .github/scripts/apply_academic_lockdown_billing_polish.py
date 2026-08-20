from pathlib import Path


def patch_once(path: str, old: str, new: str, label: str):
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match in {path}, found {count}")
    file.write_text(source.replace(old, new, 1))


# 1) Academic Profile: split English trends by evidence source.
profile_path = 'components/student-progress/StudentAcademicProfileV2.tsx'
patch_once(
    profile_path,
    "const buildTrendEvents = (items: TimelineItem[], subject: string): TrendEvent[] => {",
    "const buildTrendEvents = (items: TimelineItem[], subject: string, sourceType?: TimelineItem['source_type']): TrendEvent[] => {",
    'profile trend helper signature',
)
patch_once(
    profile_path,
    "  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)).forEach((item) => {",
    "  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)\n    && (!sourceType || item.source_type === sourceType)).forEach((item) => {",
    'profile trend source filter',
)
patch_once(
    profile_path,
    "  const trendText = events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';",
    "  const trendText = events.length === 0 ? 'No evidence in this period' : events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';",
    'profile empty trend text',
)
patch_once(
    profile_path,
    "  const trendSubjects = useMemo(() => {\n    if (!profile) return [];\n    const subjects = subject === 'all' ? allSubjects : [subject];\n    return subjects.map((name) => ({ subject: name, events: buildTrendEvents(profile.timeline, name) })).filter((entry) => entry.events.length > 0 || profile.subjects.some((row) => normalizeSubject(row.subject) === normalizeSubject(entry.subject)));\n  }, [allSubjects, profile, subject]);",
    "  const trendSubjects = useMemo(() => {\n    if (!profile) return [];\n    const subjects = subject === 'all' ? allSubjects : [subject];\n    return subjects.flatMap((name) => {\n      const subjectExists = profile.subjects.some((row) => normalizeSubject(row.subject) === normalizeSubject(name));\n      if (normalizeSubject(name) === 'english') {\n        return [\n          { subject: `${name} — Writing Hub`, events: buildTrendEvents(profile.timeline, name, 'writing_attempt') },\n          { subject: `${name} — Assignments`, events: buildTrendEvents(profile.timeline, name, 'assignment_result') },\n        ].filter((entry) => entry.events.length > 0 || subjectExists);\n      }\n      const events = buildTrendEvents(profile.timeline, name);\n      return events.length > 0 || subjectExists ? [{ subject: name, events }] : [];\n    });\n  }, [allSubjects, profile, subject]);",
    'profile English trend split',
)

# 2) Printed report mirrors the English split.
report_path = 'components/student-progress/IndividualStudentAcademicReportV2.tsx'
patch_once(
    report_path,
    "const buildPrintTrendEvents = (items: TimelineItem[], subject: string): PrintTrendEvent[] => {",
    "const buildPrintTrendEvents = (items: TimelineItem[], subject: string, sourceType?: TimelineItem['source_type']): PrintTrendEvent[] => {",
    'print trend helper signature',
)
patch_once(
    report_path,
    "  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)).forEach((item) => {",
    "  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)\n    && (!sourceType || item.source_type === sourceType)).forEach((item) => {",
    'print trend source filter',
)
patch_once(
    report_path,
    "  const trendText = events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';",
    "  const trendText = events.length === 0 ? 'No evidence in this period' : events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';",
    'print empty trend text',
)
patch_once(
    report_path,
    "  const printTrendSubjects = useMemo(() => normalizeAcademicSubjectOptions(profile.timeline.map((item) => item.subject))\n    .map((subject) => ({ subject, events: buildPrintTrendEvents(profile.timeline, subject) }))\n    .filter((entry) => entry.events.length > 0), [profile.timeline]);",
    "  const printTrendSubjects = useMemo(() => normalizeAcademicSubjectOptions(profile.timeline.map((item) => item.subject))\n    .flatMap((subject) => {\n      if (normalizeSubject(subject) === 'english') {\n        return [\n          { subject: `${subject} — Writing Hub`, events: buildPrintTrendEvents(profile.timeline, subject, 'writing_attempt') },\n          { subject: `${subject} — Assignments`, events: buildPrintTrendEvents(profile.timeline, subject, 'assignment_result') },\n        ];\n      }\n      const events = buildPrintTrendEvents(profile.timeline, subject);\n      return events.length > 0 ? [{ subject, events }] : [];\n    }), [profile.timeline]);",
    'print English trend split',
)

# 3) Academic report top contrast.
report_css = Path('components/student-progress/StudentAcademicProfile.css')
css = report_css.read_text()
marker = '/* Academic report top-of-page contrast guard */'
if marker in css:
    raise SystemExit('report contrast guard already present unexpectedly')
css += """

/* Academic report top-of-page contrast guard */
.sap-report-toolbar strong { color: #ffffff !important; }
.sap-report-toolbar span { color: #e2e8f0 !important; }
.sap-print-report .sap-print-header,
.sap-print-report .sap-print-brand strong,
.sap-print-report .sap-print-reference > span,
.sap-print-report .sap-print-title h1 { color: #0f172a !important; }
.sap-print-report .sap-print-brand small,
.sap-print-report .sap-print-reference small,
.sap-print-report .sap-print-title p { color: #475569 !important; }
"""
report_css.write_text(css)

# 4) Mobile Lockdown / Clan Wars question picker touch-scroll chain.
modal_path = 'src/features/clanTerritory/components/QuestionSelectionModal.tsx'
patch_once(
    modal_path,
    '    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6">',
    '    <div className="fixed inset-0 z-[9500] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/85 p-3 backdrop-blur-md sm:items-center sm:p-6">',
    'mobile modal overlay scroll',
)
patch_once(
    modal_path,
    '      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="battle-question-title">',
    '      <section className="my-auto flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl sm:max-h-[92vh]" role="dialog" aria-modal="true" aria-labelledby="battle-question-title">',
    'mobile modal viewport height',
)
patch_once(
    modal_path,
    '        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 p-5 sm:p-7">',
    '        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 p-5 sm:p-7">',
    'mobile modal header shrink',
)
patch_once(
    modal_path,
    '        <div className="grid gap-3 border-b border-slate-800 bg-slate-900/65 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">',
    '        <div className="shrink-0 grid gap-3 border-b border-slate-800 bg-slate-900/65 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">',
    'mobile modal filters shrink',
)
patch_once(
    modal_path,
    '        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 text-xs text-slate-400">',
    '        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 text-xs text-slate-400">',
    'mobile modal summary shrink',
)
patch_once(
    modal_path,
    '        <div className="flex-1 overflow-y-auto p-4 sm:p-6">',
    '        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 sm:p-6" style={{ WebkitOverflowScrolling: \'touch\' }}>',
    'mobile modal list scroll',
)
patch_once(
    modal_path,
    '        <footer className="flex gap-3 border-t border-slate-800 bg-slate-900/75 p-4 sm:p-6">',
    '        <footer className="shrink-0 flex gap-3 border-t border-slate-800 bg-slate-900/75 p-4 sm:p-6">',
    'mobile modal footer shrink',
)

# 5) Pilot billing and dark-highlight contrast.
billing_path = 'components/school-admin/BillingTabUI.tsx'
patch_once(
    billing_path,
    "} from '../../services/tierService';\n",
    "} from '../../services/tierService';\nimport './BillingContrast.css';\n",
    'billing contrast css import',
)
patch_once(
    billing_path,
    "              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. Contracted programmes remain separate from Core access.`}",
    "              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. All programmes are available during the pilot; contracted seat quantities apply only after a paid agreement.`}",
    'pilot status wording',
)
patch_once(
    billing_path,
    "          {planDetails.seats && (isPaid || (isPilot && isActive)) && (\n            <div className=\"flex flex-wrap gap-2 text-xs text-slate-700\">\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.cambridge ?? '∞'} Cambridge</span>\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.ielts ?? '∞'} IELTS</span>\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.game ?? '∞'} Game</span>\n            </div>\n          ))}",
    "          {planDetails.seats && isPaid && (\n            <div className=\"flex flex-wrap gap-2 text-xs text-slate-700\">\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.cambridge ?? '∞'} Cambridge</span>\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.ielts ?? '∞'} IELTS</span>\n              <span className=\"rounded-lg border border-slate-200 bg-white px-3 py-1.5\">{planDetails.seats.game ?? '∞'} Game</span>\n            </div>\n          )}\n          {isPilot && isActive && (\n            <span className=\"rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-950\">Full pilot access · paid seat caps are not applied during the trial</span>\n          )}",
    'pilot paid seat chip suppression',
)

contrast_css = Path('components/school-admin/BillingContrast.css')
if contrast_css.exists():
    raise SystemExit('BillingContrast.css already exists unexpectedly')
contrast_css.write_text("""/* Keep highlighted billing controls readable even when portal theme rules are more specific than Tailwind utilities. */
.billing-tab-ui .billing-on-dark,
.billing-tab-ui button.bg-cyan-700,
.billing-tab-ui button.bg-cyan-800,
.billing-tab-ui button.bg-emerald-600,
.billing-tab-ui button.bg-emerald-700,
.billing-tab-ui button.bg-emerald-800,
.billing-tab-ui span.bg-emerald-800 {
  color: #ffffff !important;
}

/* The live receipt is intentionally dark; never leave dark-cyan copy on it. */
.billing-tab-ui aside.bg-slate-950 .text-cyan-700 {
  color: #ffffff !important;
}

/* Pale green commitment chips (including 0% committed) deliberately keep dark text. */
""")

# Focused source regression coverage.
test_path = Path('tests/academicLockdownBillingPolish.test.ts')
if test_path.exists():
    raise SystemExit('academicLockdownBillingPolish.test.ts already exists unexpectedly')
test_path.write_text("""import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('English Academic Profile trends separate Writing Hub from assignments', () => {
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const report = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  for (const source of [profile, report]) {
    assert.match(source, /English|english/);
    assert.match(source, /Writing Hub/);
    assert.match(source, /Assignments/);
    assert.match(source, /writing_attempt/);
    assert.match(source, /assignment_result/);
    assert.match(source, /No evidence in this period/);
  }
});

test('Academic report header has explicit high contrast text', () => {
  const css = read('components/student-progress/StudentAcademicProfile.css');
  assert.match(css, /Academic report top-of-page contrast guard/);
  assert.match(css, /sap-print-brand strong[\s\S]*#0f172a !important/);
  assert.match(css, /sap-report-toolbar strong[\s\S]*#ffffff !important/);
});

test('Lockdown question picker is touch-scrollable on mobile', () => {
  const modal = read('src/features/clanTerritory/components/QuestionSelectionModal.tsx');
  assert.match(modal, /100dvh/);
  assert.match(modal, /min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain/);
  assert.match(modal, /WebkitOverflowScrolling: 'touch'/);
});

test('pilot billing hides paid seat caps and highlighted controls stay readable', () => {
  const billing = read('components/school-admin/BillingTabUI.tsx');
  const contrast = read('components/school-admin/BillingContrast.css');
  assert.match(billing, /planDetails\.seats && isPaid/);
  assert.doesNotMatch(billing, /isPaid \|\| \(isPilot && isActive\)/);
  assert.match(billing, /Full pilot access/);
  assert.match(contrast, /button\.bg-emerald-600/);
  assert.match(contrast, /button\.bg-emerald-800/);
  assert.match(contrast, /button\.bg-cyan-800/);
  assert.doesNotMatch(contrast, /bg-emerald-100/);
});
""")
