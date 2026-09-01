from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_replace_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, updated)


HELPER = r'''import type {
  LearningObservationType,
  LearningStatus,
} from '../../services/studentAcademicProfileService';

export type ComparableTrendEvent = {
  observedAt: string;
  score: number;
  comparableKey: string;
};

export const isActiveSupportStatus = (status: LearningStatus): boolean =>
  status === 'new_focus' || status === 'recurring' || status === 'persistent';

export const isEvidenceToConfirmStatus = (status: LearningStatus): boolean =>
  status === 'insufficient_evidence';

export const isTeacherReviewStatus = (status: LearningStatus): boolean =>
  status === 'contradictory';

export const calendarDayKey = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

export const observationDisplayLabel = (type: LearningObservationType): string => {
  if (type === 'focus') return 'Needs support';
  if (type === 'strength') return 'Positive evidence';
  return 'Developing evidence';
};

export const evidenceConfirmationLabel = (latestType?: LearningObservationType | null): string => {
  if (latestType === 'strength') return 'Positive evidence · more evidence needed';
  if (latestType === 'developing') return 'Developing evidence · more evidence needed';
  if (latestType === 'focus') return 'Potential support signal · more evidence needed';
  return 'More evidence needed';
};

export const focusStatusLabel = (
  status: LearningStatus,
  latestType?: LearningObservationType | null,
  firstObservedAt?: string | null,
  lastObservedAt?: string | null,
): string => {
  switch (status) {
    case 'insufficient_evidence':
      return evidenceConfirmationLabel(latestType);
    case 'contradictory':
      return 'Teacher review needed';
    case 'new_focus':
      return 'New focus area';
    case 'recurring':
      return calendarDayKey(firstObservedAt) === calendarDayKey(lastObservedAt)
        ? 'Repeated focus area'
        : 'Recurring focus area';
    case 'persistent':
      return 'Persistent focus area';
    case 'improving':
      return 'Making progress';
    case 'resolved':
      return 'Now secure';
    case 'emerging_strength':
      return 'Emerging strength';
    case 'consistent_strength':
      return 'Established strength';
  }
};

export const reportingStatusTone = (
  status: LearningStatus,
  latestType?: LearningObservationType | null,
): 'critical' | 'focus' | 'improving' | 'resolved' | 'strong' | 'neutral' | 'review' => {
  if (status === 'contradictory') return 'review';
  if (status === 'persistent') return 'critical';
  if (status === 'new_focus' || status === 'recurring') return 'focus';
  if (status === 'insufficient_evidence') {
    return latestType === 'strength' ? 'strong' : latestType === 'focus' ? 'neutral' : 'neutral';
  }
  if (status === 'improving') return 'improving';
  if (status === 'resolved') return 'resolved';
  return 'strong';
};

export const comparableTrendSegments = <T extends ComparableTrendEvent>(events: T[]): Array<[T, T]> => {
  const ordered = [...events].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const bySkill = new Map<string, T[]>();
  ordered.forEach((event) => {
    const rows = bySkill.get(event.comparableKey) || [];
    rows.push(event);
    bySkill.set(event.comparableKey, rows);
  });
  const segments: Array<[T, T]> = [];
  bySkill.forEach((rows) => {
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (calendarDayKey(previous.observedAt) !== calendarDayKey(current.observedAt)) {
        segments.push([previous, current]);
      }
    }
  });
  return segments;
};

export const summarizeComparableTrend = (events: ComparableTrendEvent[]): string => {
  if (!events.length) return 'No evidence in this period';
  if (events.length === 1) return 'One evidence point so far';

  const bySkill = new Map<string, ComparableTrendEvent[]>();
  events.forEach((event) => {
    const rows = bySkill.get(event.comparableKey) || [];
    rows.push(event);
    bySkill.set(event.comparableKey, rows);
  });

  const deltas: number[] = [];
  bySkill.forEach((rows) => {
    const latestByDay = new Map<string, ComparableTrendEvent>();
    [...rows].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).forEach((row) => {
      latestByDay.set(calendarDayKey(row.observedAt), row);
    });
    const distinctDays = [...latestByDay.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    if (distinctDays.length >= 2) {
      deltas.push(distinctDays[distinctDays.length - 1].score - distinctDays[0].score);
    }
  });

  if (!deltas.length) return 'Not enough comparable evidence yet';
  const movingUp = deltas.some((delta) => delta >= 10);
  const movingDown = deltas.some((delta) => delta <= -10);
  if (movingUp && movingDown) return 'Mixed movement across comparable skills';
  if (movingUp) return 'Comparable evidence shows positive movement';
  if (movingDown) return 'Recent comparable evidence needs attention';
  return 'Comparable evidence is broadly steady';
};

export const buildAcademicSnapshot = (input: {
  studentName: string;
  completedAssignments: number;
  supportLabels: string[];
  positiveEvidenceLabels: string[];
  teacherReviewCount: number;
}): string => {
  const name = input.studentName || 'This student';
  const sentences: string[] = [];
  if (input.completedAssignments < 3) {
    sentences.push(`${name} has limited completed-assignment evidence so far, so conclusions are kept deliberately cautious.`);
  } else {
    sentences.push(`${name}'s profile is based on ${input.completedAssignments} completed assignments plus qualified skill-level evidence.`);
  }
  if (input.supportLabels.length) {
    sentences.push(`The main current support area is ${input.supportLabels[0]}.`);
  } else {
    sentences.push('No current support area is established from the available evidence.');
  }
  if (input.positiveEvidenceLabels.length) {
    sentences.push(`${input.positiveEvidenceLabels[0]} shows positive recent evidence, but needs more evidence before it is treated as an established strength.`);
  }
  if (input.teacherReviewCount) {
    sentences.push(`${input.teacherReviewCount === 1 ? 'One area needs' : `${input.teacherReviewCount} areas need`} teacher review because the evidence points in different directions.`);
  }
  return sentences.join(' ');
};
'''

TEST = r'''import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evidenceConfirmationLabel,
  isActiveSupportStatus,
  summarizeComparableTrend,
} from '../components/student-progress/academicReportingSemantics';

const read = (path: string) => readFileSync(path, 'utf8');

const migrationPath = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_fix_academic_profile_reporting_integrity.sql'))
  .sort()
  .at(-1);

test('low-data positive evidence is never presented as a support state', () => {
  assert.equal(isActiveSupportStatus('insufficient_evidence'), false);
  assert.match(evidenceConfirmationLabel('strength'), /Positive evidence/);
  assert.match(evidenceConfirmationLabel('strength'), /more evidence needed/);
});

test('subject trend only compares the same skill across separate dates', () => {
  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 0, comparableKey: 'future-tense' },
    { observedAt: '2026-08-21T09:00:00Z', score: 100, comparableKey: 'vocabulary' },
  ]), 'Not enough comparable evidence yet');

  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 0, comparableKey: 'future-tense' },
    { observedAt: '2026-08-20T14:00:00Z', score: 20, comparableKey: 'future-tense' },
  ]), 'Not enough comparable evidence yet');

  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 20, comparableKey: 'future-tense' },
    { observedAt: '2026-08-28T09:00:00Z', score: 80, comparableKey: 'future-tense' },
  ]), 'Comparable evidence shows positive movement');
});

test('academic profile and report share the trustworthy reporting vocabulary', () => {
  const service = read('services/studentAcademicProfileService.ts');
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const report = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  assert.match(service, /'insufficient_evidence'/);
  assert.match(service, /'contradictory'/);
  assert.match(service, /writing_assessment_review/);
  assert.match(profile, /Evidence to confirm/);
  assert.match(profile, /Teacher snapshot/);
  assert.match(profile, /Established strengths/);
  assert.match(report, /Evidence to confirm/);
  assert.match(report, /Established strengths/);
  assert.doesNotMatch(profile, /\['insufficient_evidence', 'new_focus', 'recurring', 'persistent'\]/);
  assert.doesNotMatch(report, /\['new_focus', 'recurring', 'persistent', 'insufficient_evidence'\]/);
});

test('classifier fallback never turns recovery evidence into a fresh support label', () => {
  assert.ok(migrationPath, 'reporting-integrity migration must exist');
  const migration = read(`supabase/migrations/${migrationPath}`);
  assert.match(migration, /if v_latest = ''focus'' then/);
  assert.match(migration, /v_status := ''insufficient_evidence''/);
  assert.match(migration, /student_learning_refresh_focus_state/);
});
'''

CSS_APPEND = r'''

/* Academic Profile reporting-integrity layer: keep evidence confidence visually distinct from support. */
.sap-trust-summary {
  margin: 0 0 18px;
  padding: 18px 20px;
  border: 1px solid #dbe7f4;
  border-radius: 18px;
  background: linear-gradient(135deg, #f8fbff 0%, #f5faf8 100%);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}
.sap-trust-summary > span { display: block; margin-bottom: 5px; color: #315b78; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.sap-trust-summary > p { margin: 0; color: #243447; font-size: 0.98rem; line-height: 1.65; }
.sap-status--neutral { background: #f1f5f9 !important; color: #475569 !important; border-color: #cbd5e1 !important; }
.sap-status--review { background: #fff7ed !important; color: #9a3412 !important; border-color: #fed7aa !important; }
.sap-confirm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.sap-confirm-card { padding: 16px; border: 1px solid #dbe4ee; border-radius: 16px; background: #fbfdff; }
.sap-confirm-card.is-positive { border-color: #b9e3d0; background: #f5fbf8; }
.sap-confirm-card.is-review { border-color: #fed7aa; background: #fffaf5; }
.sap-confirm-card h3 { margin: 7px 0 4px; color: #172033; font-size: 1rem; }
.sap-confirm-card p { margin: 0; color: #607084; font-size: 0.84rem; }
.sap-confirm-card small { display: block; margin-top: 10px; color: #536579; line-height: 1.45; }
.sap-confirm-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0 0; }
.sap-confirm-card dl div { padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.82); }
.sap-confirm-card dt { color: #748399; font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; }
.sap-confirm-card dd { margin: 2px 0 0; color: #1f2d3d; font-weight: 800; }
@media (max-width: 720px) {
  .sap-trust-summary { padding: 15px 16px; }
  .sap-confirm-grid { grid-template-columns: 1fr; }
}
'''

MIGRATION = r'''-- Academic Profile reporting integrity.
--
-- A recovery/developing observation that has not yet met the governed gates for
-- "improving" or "resolved" must never fall through to a fresh support label.
-- Keep the conclusion withheld as insufficient evidence unless the latest
-- qualified observation itself is a focus signal.

do $migration$
declare
  v_def text;
  v_old text := E'  else\n    v_status := ''new_focus''; v_trend := ''stable'';\n  end if;';
  v_new text := E'  else\n    if v_latest = ''focus'' then\n      v_status := ''new_focus''; v_trend := ''stable'';\n    else\n      v_status := ''insufficient_evidence'';\n      v_trend := case when v_latest in (''strength'', ''developing'') then ''improving'' else ''stable'' end;\n    end if;\n  end if;';
begin
  select pg_get_functiondef('public.student_learning_classify_progress(jsonb)'::regprocedure)
  into v_def;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected student_learning_classify_progress fallback not found';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;

-- Re-evaluate only states that could have been mislabeled by the old fallback.
do $refresh$
declare
  r record;
begin
  for r in
    select distinct s.student_id, s.skill_key
    from public.student_learning_focus_states s
    join lateral (
      select o.observation_type
      from public.student_learning_observations o
      where o.student_id = s.student_id
        and o.skill_key = s.skill_key
        and public.student_learning_observation_is_qualified(
          o.source_type,
          o.contributes_to_focus_state,
          o.evidence
        )
      order by o.observed_at desc, o.created_at desc, o.id desc
      limit 1
    ) latest on true
    where s.current_status = 'new_focus'
      and latest.observation_type in ('strength', 'developing')
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
  end loop;
end
$refresh$;

comment on function public.student_learning_classify_progress(jsonb) is
  'Deterministic progress classifier. Recovery evidence that is not yet improvement/resolution eligible is withheld as insufficient evidence instead of being relabeled as a new focus.';
'''


def patch_service() -> None:
    path = 'services/studentAcademicProfileService.ts'
    replace_once(path,
        "export type LearningStatus =\n  | 'new_focus'",
        "export type LearningStatus =\n  | 'insufficient_evidence'\n  | 'contradictory'\n  | 'new_focus'")
    replace_once(path,
        "source_type: 'assignment_result' | 'writing_attempt' | 'teacher_observation' | 'import';",
        "source_type: 'assignment_result' | 'writing_attempt' | 'writing_assessment_review' | 'teacher_observation' | 'import' | 'cambridge_attempt';")
    replace_once(path,
        "  switch (status) {\n    case 'new_focus': return 'New focus area';",
        "  switch (status) {\n    case 'insufficient_evidence': return 'More evidence needed';\n    case 'contradictory': return 'Teacher review needed';\n    case 'new_focus': return 'New focus area';")
    replace_once(path, "    case 'consistent_strength': return 'Consistent strength';", "    case 'consistent_strength': return 'Established strength';")


def patch_profile() -> None:
    path = 'components/student-progress/StudentAcademicProfileV2.tsx'
    replace_once(path,
        "import { AcademicProgressHeader, normalizeAcademicSubjectOptions } from './AcademicProgressSuite';",
        "import { AcademicProgressHeader, normalizeAcademicSubjectOptions } from './AcademicProgressSuite';\nimport {\n  buildAcademicSnapshot,\n  calendarDayKey,\n  comparableTrendSegments,\n  evidenceConfirmationLabel,\n  focusStatusLabel,\n  isActiveSupportStatus,\n  isEvidenceToConfirmStatus,\n  isTeacherReviewStatus,\n  observationDisplayLabel,\n  reportingStatusTone,\n  summarizeComparableTrend,\n} from './academicReportingSemantics';")
    replace_once(path, "  score: number;\n  label: string;", "  score: number;\n  comparableKey: string;\n  label: string;")
    replace_once(path,
        "const statusBand = (status: string) => status === 'persistent' ? 'critical' : ['insufficient_evidence', 'recurring', 'new_focus'].includes(status) ? 'focus' : status === 'improving' ? 'improving' : status === 'resolved' ? 'resolved' : 'strong';",
        "const statusBand = (status: FocusItem['status'], latestType?: TimelineItem['observation_type'] | null) => reportingStatusTone(status, latestType);")
    replace_once(path, "  if (item.source_type === 'writing_attempt') {", "  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') {")
    replace_once(path,
        "  if (item.observation_type === 'strength') return `This assessed work shows secure performance in ${item.subskill || item.skill}.`;",
        "  if (item.observation_type === 'strength') return `This assessed work provides positive evidence in ${item.subskill || item.skill}. More evidence may still be needed before this becomes an established strength.`;")
    regex_replace_once(path,
        r"const observationSignal = \(item: TimelineItem\) => \{.*?\n\};\n\nconst trendPositionLabel = \(score: number\) => score >= 78 \? 'Strong evidence' : score >= 46 \? 'Developing evidence' : 'Needs support';\nconst evidenceBandClass = \(score: number\) => score >= 78 \? 'strong' : score >= 46 \? 'developing' : 'support';",
        "const observationSignal = (item: TimelineItem) => {\n  const pct = item.evidence_percentage == null ? null : Number(item.evidence_percentage);\n  const bounded = pct == null || Number.isNaN(pct) ? null : Math.max(0, Math.min(100, pct));\n  if (bounded != null) return bounded;\n  if (item.observation_type === 'focus') return 30;\n  if (item.observation_type === 'strength') return 90;\n  return 65;\n};\n\nconst trendPositionLabel = (score: number) => score >= 80 ? 'Strong evidence' : score >= 60 ? 'Developing evidence' : 'Needs support';\nconst evidenceBandClass = (score: number) => score >= 80 ? 'strong' : score >= 60 ? 'developing' : 'support';",
        flags=re.S)
    replace_once(path, "    values: number[];\n    observedAt: string;", "    values: number[];\n    comparableKey: string;\n    observedAt: string;")
    replace_once(path,
        "    const meta = sourceMeta(item);\n    const key = `${item.source_type}:${item.source_id || item.observed_at}`;",
        "    const meta = sourceMeta(item);\n    const comparableKey = `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;\n    const key = `${item.source_type}:${item.source_id || item.observed_at}:${comparableKey}`;")
    replace_once(path, "      values: [],\n      observedAt: item.observed_at,", "      values: [],\n      comparableKey,\n      observedAt: item.observed_at,")
    replace_once(path, "    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),\n    label: group.label,", "    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),\n    comparableKey: group.comparableKey,\n    label: group.label,")
    regex_replace_once(path,
        r"  const overallDelta = allEvents.length > 1 \? allEvents\[allEvents.length - 1\]\.event\.score - allEvents\[0\]\.event\.score : 0;\n  const trendText = allEvents.length === 0.*?  const activePoint =",
        "  const trendText = summarizeComparableTrend(allEvents.map(({ event }) => ({\n    observedAt: event.observedAt,\n    score: event.score,\n    comparableKey: event.comparableKey,\n  })));\n  const activePoint =",
        flags=re.S)
    replace_once(path,
        "  const activeSeriesIndex = activePoint ? activePoint.series.events.findIndex((event) => event.key === activePoint.event.key) : -1;\n  const previousEvent = activePoint && activeSeriesIndex > 0 ? activePoint.series.events[activeSeriesIndex - 1] : null;\n  const pointDelta = activePoint && previousEvent ? activePoint.event.score - previousEvent.score : null;",
        "  const previousComparable = activePoint ? activePoint.series.events\n    .filter((event) => event.comparableKey === activePoint.event.comparableKey\n      && event.observedAt < activePoint.event.observedAt\n      && calendarDayKey(event.observedAt) !== calendarDayKey(activePoint.event.observedAt))\n    .sort((a, b) => a.observedAt.localeCompare(b.observedAt)) : [];\n  const previousEvent = previousComparable.length ? previousComparable[previousComparable.length - 1] : null;\n  const pointDelta = activePoint && previousEvent ? activePoint.event.score - previousEvent.score : null;")
    regex_replace_once(path,
        r"\{activeSeries\.map\(\(trendSeries\) => trendSeries\.events\.length > 1 \? <polyline\n            key=\{`\$\{trendSeries\.key\}:line`\}.*?          /> : null\)\}",
        "{activeSeries.flatMap((trendSeries) => comparableTrendSegments(trendSeries.events).map(([start, end], index) => <line\n            key={`${trendSeries.key}:segment:${index}`}\n            x1={xAt(start)}\n            y1={yAt(start.score)}\n            x2={xAt(end)}\n            y2={yAt(end.score)}\n            className={`sap-trend-line sap-trend-line--${trendSeries.tone}`}\n          />))}",
        flags=re.S)
    replace_once(path,
        "{pointDelta == null ? null : <em className={pointDelta >= 0 ? 'is-up' : 'is-down'}>{pointDelta >= 0 ? '↑' : '↓'} {Math.abs(pointDelta)} from previous {activePoint.series.label.toLowerCase()} activity</em>}",
        "{pointDelta == null ? null : <em className={pointDelta >= 0 ? 'is-up' : 'is-down'}>{pointDelta >= 0 ? '↑' : '↓'} {Math.abs(pointDelta)} from previous comparable result</em>}")
    replace_once(path, "<span>Strength</span><b>{activePoint.event.strengthCount}</b>", "<span>Positive evidence</span><b>{activePoint.event.strengthCount}</b>")
    replace_once(path,
        "  const currentFocus = useMemo(() => profile?.focus_areas.filter((item) => ['insufficient_evidence', 'new_focus', 'recurring', 'persistent'].includes(String(item.status))) ?? [], [profile]);\n  const strengths =",
        "  const currentFocus = useMemo(() => profile?.focus_areas.filter((item) => isActiveSupportStatus(item.status)) ?? [], [profile]);\n  const evidenceToConfirm = useMemo(() => profile?.focus_areas.filter((item) => isEvidenceToConfirmStatus(item.status)) ?? [], [profile]);\n  const reviewItems = useMemo(() => profile?.focus_areas.filter((item) => isTeacherReviewStatus(item.status)) ?? [], [profile]);\n  const strengths =")
    replace_once(path,
        "    return map;\n  }, [profile]);\n\n  const trendSubjects",
        "    return map;\n  }, [profile]);\n\n  const latestForFocusItem = (item: FocusItem) => latestTimelineForFocus.get(`${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`) || null;\n  const positiveEvidenceToConfirm = evidenceToConfirm.filter((item) => latestForFocusItem(item)?.observation_type === 'strength');\n\n  const trendSubjects")
    replace_once(path,
        "        const writingEvents = buildTrendEvents(profile.timeline, name, 'writing_attempt');",
        "        const writingEvents = [\n          ...buildTrendEvents(profile.timeline, name, 'writing_assessment_review'),\n          ...buildTrendEvents(profile.timeline, name, 'writing_attempt'),\n        ].sort((a, b) => a.observedAt.localeCompare(b.observedAt));")
    replace_once(path,
        "  const supportCount = profile.summary.persistent_focus_count + profile.summary.recurring_focus_count;\n  const formatStatus = (item: FocusItem) => String(item.status) === 'insufficient_evidence' ? 'New support signal' : formatLearningStatus(item.status);",
        "  const supportCount = currentFocus.length;\n  const formatStatus = (item: FocusItem) => focusStatusLabel(item.status, latestForFocusItem(item)?.observation_type, item.first_observed_at, item.last_observed_at);\n  const snapshotText = buildAcademicSnapshot({\n    studentName: profile.student.name,\n    completedAssignments: profile.summary.completed_assignments,\n    supportLabels: currentFocus.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),\n    positiveEvidenceLabels: positiveEvidenceToConfirm.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),\n    teacherReviewCount: reviewItems.length,\n  });")
    replace_once(path,
        "      <article><span>Assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed</small></article>\n      <article><span>Needs support</span><strong>{supportCount}</strong><small>{profile.summary.persistent_focus_count} long-running</small></article>\n      <article><span>Making progress</span><strong className=\"sap-positive\">{profile.summary.improving_count}</strong><small>Moving in the right direction</small></article>\n      <article><span>Now secure</span><strong className=\"sap-positive\">{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></article>\n      <article><span>Strengths</span><strong className=\"sap-positive\">{profile.summary.strength_count}</strong><small>Positive evidence</small></article>",
        "      <article><span>Completed assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>Based on {profile.summary.completed_assignments} completed assignment{profile.summary.completed_assignments === 1 ? '' : 's'}</small></article>\n      <article><span>Needs support</span><strong>{supportCount}</strong><small>{profile.summary.persistent_focus_count} long-running</small></article>\n      <article><span>Making progress</span><strong className=\"sap-positive\">{profile.summary.improving_count}</strong><small>Established movement over time</small></article>\n      <article><span>Now secure</span><strong className=\"sap-positive\">{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></article>\n      <article><span>Established strengths</span><strong className=\"sap-positive\">{profile.summary.strength_count}</strong><small>{positiveEvidenceToConfirm.length ? `${positiveEvidenceToConfirm.length} positive signal${positiveEvidenceToConfirm.length === 1 ? '' : 's'} awaiting more evidence` : 'Longitudinally supported strengths'}</small></article>")
    replace_once(path,
        "    </div>\n\n    <section className=\"sap-panel sap-overview-panel\">",
        "    </div>\n\n    <section className=\"sap-trust-summary\" aria-label=\"Teacher snapshot\"><span>Teacher snapshot</span><p>{snapshotText}</p></section>\n\n    <section className=\"sap-panel sap-overview-panel\">")
    replace_once(path,
        "        const subjectFocus = currentFocus.filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;\n        return <article key={entry.subject} className=\"sap-subject-card\"><div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed</span></div><strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><dl><div><dt>Needs support</dt><dd>{subjectFocus}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Secure</dt><dd>{entry.resolved_count}</dd></div><div><dt>Strengths</dt><dd>{entry.strength_count}</dd></div></dl><small>Latest evidence {formatDate(entry.latest_evidence_at)}</small></article>;",
        "        const subjectFocus = currentFocus.filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;\n        const subjectConfirm = evidenceToConfirm.filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;\n        return <article key={entry.subject} className=\"sap-subject-card\"><div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed</span></div><strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><dl><div><dt>Needs support</dt><dd>{subjectFocus}</dd></div><div><dt>Evidence to confirm</dt><dd>{subjectConfirm}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Secure</dt><dd>{entry.resolved_count}</dd></div><div><dt>Established strengths</dt><dd>{entry.strength_count}</dd></div></dl><small>Latest evidence {formatDate(entry.latest_evidence_at)}</small></article>;")
    replace_once(path,
        "description=\"One timeline per subject. English combines assignments and Writing Hub as separate colour-coded evidence streams.\"",
        "description=\"Trends compare the same skill across separate assessment dates. Same-day or cross-skill evidence is shown without being called progress. English keeps assignments and Writing Hub as separate evidence streams.\"")
    replace_once(path, "<div><dt>Evidence</dt><dd>{item.evidence_items}</dd></div><div><dt>Latest result</dt>", "<div><dt>Assessment records</dt><dd>{item.evidence_items}</dd></div><div><dt>Assessed items</dt><dd>{item.evidence_occurrences}</dd></div><div><dt>Latest result</dt>")
    marker = '    <ProfileDisclosure tone="progress" eyebrow="Positive movement" title="Progress and strengths"'
    insert = '''    <ProfileDisclosure tone="progress" eyebrow="Evidence to confirm" title="What is promising but not established yet?" description="Low-data signals stay separate from support needs and established strengths until enough qualified evidence exists." meta={`${evidenceToConfirm.length + reviewItems.length} item${evidenceToConfirm.length + reviewItems.length === 1 ? '' : 's'}`}>
      <div className="sap-confirm-grid">
        {evidenceToConfirm.map((item) => {
          const latest = latestForFocusItem(item);
          const positive = latest?.observation_type === 'strength';
          return <article key={item.skill_key} className={`sap-confirm-card ${positive ? 'is-positive' : ''}`}><span className={`sap-status sap-status--${statusBand(item.status, latest?.observation_type)}`}>{evidenceConfirmationLabel(latest?.observation_type)}</span><h3>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p><small>{latest ? evidenceExplanation(latest) : 'More qualified evidence is needed before making a stronger conclusion.'}</small><dl><div><dt>Assessment records</dt><dd>{item.evidence_items}</dd></div><div><dt>Assessed items</dt><dd>{item.evidence_occurrences}</dd></div><div><dt>Latest result</dt><dd>{item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`}</dd></div><div><dt>Confidence</dt><dd>More evidence needed</dd></div></dl></article>;
        })}
        {reviewItems.map((item) => <article key={item.skill_key} className="sap-confirm-card is-review"><span className="sap-status sap-status--review">Teacher review needed</span><h3>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p><small>Recent qualified evidence points in different directions. Review the underlying work before making a support or strength conclusion.</small></article>)}
        {!evidenceToConfirm.length && !reviewItems.length ? <div className="sap-empty">No evidence is currently waiting for confirmation or teacher review.</div> : null}
      </div>
    </ProfileDisclosure>

'''
    replace_once(path, marker, insert + marker)
    replace_once(path, "<div><h3>Strengths</h3>", "<div><h3>Established strengths</h3>")
    replace_once(path,
        "description=\"Chronological source evidence for deeper review. This stays closed until detail is needed.\"",
        "description=\"Chronological qualified skill-level evidence for deeper review. A positive evidence record is not automatically an established strength.\"")
    replace_once(path,
        "{item.observation_type === 'focus' ? 'Needs support' : item.observation_type === 'strength' ? 'Strength' : 'Developing'}",
        "{observationDisplayLabel(item.observation_type)}")
    replace_once(path,
        "description=\"Completed assignment outcomes for the selected period.\"",
        "description=\"Official completed assignment outcomes used for the assignment average. Skill-level evidence may contain additional qualified diagnostic records.\"")
    replace_once(path,
        "<div><strong>Confidence</strong><span>How complete, recent and consistent the evidence is. It is not a mark.</span></div>",
        "<div><strong>Evidence to confirm</strong><span>Promising, developing or potential support evidence that is not yet strong enough for a longitudinal conclusion.</span></div><div><strong>Established strength</strong><span>A strength supported by enough qualified evidence over time, not just one high result.</span></div><div><strong>Teacher review needed</strong><span>Qualified evidence points in different directions, so the system withholds a simple conclusion.</span></div><div><strong>Confidence</strong><span>How complete, recent and consistent the evidence is. It is not a mark.</span></div>")


def patch_report() -> None:
    path = 'components/student-progress/IndividualStudentAcademicReportV2.tsx'
    replace_once(path,
        "import { normalizeAcademicSubjectOptions } from './AcademicProgressSuite';",
        "import { normalizeAcademicSubjectOptions } from './AcademicProgressSuite';\nimport {\n  buildAcademicSnapshot,\n  comparableTrendSegments,\n  evidenceConfirmationLabel,\n  focusStatusLabel,\n  isActiveSupportStatus,\n  isEvidenceToConfirmStatus,\n  isTeacherReviewStatus,\n  observationDisplayLabel,\n  summarizeComparableTrend,\n} from './academicReportingSemantics';")
    replace_once(path,
        "type PrintTrendEvent = { key: string; observedAt: string; score: number; source: string; detail: string; label: string };",
        "type PrintTrendEvent = { key: string; observedAt: string; score: number; comparableKey: string; source: string; detail: string; label: string };")
    replace_once(path, "  if (item.source_type === 'writing_attempt') {", "  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') {")
    replace_once(path, "  if (item.source_type === 'writing_attempt') return 'Writing Hub';", "  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') return 'Writing Hub';")
    regex_replace_once(path,
        r"const observationSignal = \(item: TimelineItem\) => \{.*?\n\};\nconst trendPositionLabel = \(score: number\) => score >= 78 \? 'Strong evidence' : score >= 46 \? 'Developing evidence' : 'Needs support';",
        "const observationSignal = (item: TimelineItem) => {\n  const pct = item.evidence_percentage == null ? null : Number(item.evidence_percentage);\n  const bounded = pct == null || Number.isNaN(pct) ? null : Math.max(0, Math.min(100, pct));\n  if (bounded != null) return bounded;\n  if (item.observation_type === 'focus') return 30;\n  if (item.observation_type === 'strength') return 90;\n  return 65;\n};\nconst trendPositionLabel = (score: number) => score >= 80 ? 'Strong evidence' : score >= 60 ? 'Developing evidence' : 'Needs support';",
        flags=re.S)
    replace_once(path,
        "  const groups = new Map<string, { values: number[]; observedAt: string; source: string; detail: string; label: string }>();",
        "  const groups = new Map<string, { values: number[]; comparableKey: string; observedAt: string; source: string; detail: string; label: string }>();")
    replace_once(path,
        "    const key = `${item.source_type}:${item.source_id || item.observed_at}`;\n    const group = groups.get(key) || {\n      values: [],",
        "    const comparableKey = `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;\n    const key = `${item.source_type}:${item.source_id || item.observed_at}:${comparableKey}`;\n    const group = groups.get(key) || {\n      values: [],\n      comparableKey,")
    replace_once(path,
        "    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),\n    source: group.source,",
        "    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),\n    comparableKey: group.comparableKey,\n    source: group.source,")
    replace_once(path,
        "  const points = events.map((event, index) => `${xAt(index)},${yAt(event.score)}`).join(' ');\n  const delta = events.length > 1 ? events[events.length - 1].score - events[0].score : 0;\n  const trendText = events.length === 0 ? 'No evidence in this period' : events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';",
        "  const trendText = summarizeComparableTrend(events.map((event) => ({ observedAt: event.observedAt, score: event.score, comparableKey: event.comparableKey })));\n  const indexFor = (event: PrintTrendEvent) => Math.max(0, events.findIndex((row) => row.key === event.key));")
    replace_once(path,
        "      {events.length > 1 ? <polyline points={points} className=\"sap-print-trend-line\"/> : null}",
        "      {comparableTrendSegments(events).map(([start, end], index) => <line key={`segment:${index}`} x1={xAt(indexFor(start))} y1={yAt(start.score)} x2={xAt(indexFor(end))} y2={yAt(end.score)} className=\"sap-print-trend-line\"/>)}")
    replace_once(path,
        "  const currentFocus = profile.focus_areas.filter((item) => ['new_focus', 'recurring', 'persistent', 'insufficient_evidence'].includes(String(item.status)));\n  const strengths =",
        "  const currentFocus = profile.focus_areas.filter((item) => isActiveSupportStatus(item.status));\n  const evidenceToConfirm = profile.focus_areas.filter((item) => isEvidenceToConfirmStatus(item.status));\n  const reviewItems = profile.focus_areas.filter((item) => isTeacherReviewStatus(item.status));\n  const latestForFocusItem = (focus: StudentAcademicProfile['focus_areas'][number]) => profile.timeline\n    .filter((item) => normalizeSubject(item.subject) === normalizeSubject(focus.subject)\n      && item.skill.toLowerCase() === focus.skill.toLowerCase()\n      && String(item.subskill || '').toLowerCase() === String(focus.subskill || '').toLowerCase())\n    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0] || null;\n  const positiveEvidenceToConfirm = evidenceToConfirm.filter((item) => latestForFocusItem(item)?.observation_type === 'strength');\n  const snapshotText = buildAcademicSnapshot({\n    studentName: profile.student.name,\n    completedAssignments: profile.summary.completed_assignments,\n    supportLabels: currentFocus.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),\n    positiveEvidenceLabels: positiveEvidenceToConfirm.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),\n    teacherReviewCount: reviewItems.length,\n  });\n  const strengths =")
    replace_once(path,
        "{ subject: `${subject} — Writing Hub`, events: buildPrintTrendEvents(profile.timeline, subject, 'writing_attempt') },",
        "{ subject: `${subject} — Writing Hub`, events: [\n            ...buildPrintTrendEvents(profile.timeline, subject, 'writing_assessment_review'),\n            ...buildPrintTrendEvents(profile.timeline, subject, 'writing_attempt'),\n          ].sort((a, b) => a.observedAt.localeCompare(b.observedAt)) },")
    replace_once(path, "<span>Assignment average</span>", "<span>Completed assignment average</span>")
    replace_once(path,
        "<div><span>Needs support</span><strong>{profile.summary.persistent_focus_count + profile.summary.recurring_focus_count}</strong>",
        "<div><span>Needs support</span><strong>{currentFocus.length}</strong>")
    replace_once(path,
        "<div><span>Strengths</span><strong>{profile.summary.strength_count}</strong><small>Positive evidence</small></div>",
        "<div><span>Established strengths</span><strong>{profile.summary.strength_count}</strong><small>{positiveEvidenceToConfirm.length ? `${positiveEvidenceToConfirm.length} positive signal${positiveEvidenceToConfirm.length === 1 ? '' : 's'} awaiting more evidence` : 'Longitudinally supported strengths'}</small></div>")
    replace_once(path,
        "          <section className=\"sap-print-student-grid\"><div><span>Student</span>",
        "          <section className=\"sap-print-student-grid\"><div><span>Student</span>")
    replace_once(path,
        "</section>\n          <section className=\"sap-print-summary\">",
        "</section>\n          <section className=\"sap-print-trust-summary\"><span>Teacher snapshot</span><p>{snapshotText}</p></section>\n          <section className=\"sap-print-summary\">")
    replace_once(path,
        "<th>Strengths</th>",
        "<th>Established strengths</th>")
    replace_once(path,
        "<p>{String(item.status) === 'insufficient_evidence' ? 'New support signal' : formatLearningStatus(item.status)} · {item.evidence_items} evidence item{item.evidence_items === 1 ? '' : 's'} · first seen {formatDate(item.first_observed_at)} · latest {formatDate(item.last_observed_at)}</p>",
        "<p>{focusStatusLabel(item.status, latestForFocusItem(item)?.observation_type, item.first_observed_at, item.last_observed_at)} · {item.evidence_items} assessment record{item.evidence_items === 1 ? '' : 's'} · {item.evidence_occurrences} assessed item{item.evidence_occurrences === 1 ? '' : 's'} · first seen {formatDate(item.first_observed_at)} · latest {formatDate(item.last_observed_at)}</p>")
    old_strengths = "{includeStrengths ? <section className=\"sap-print-section\"><div className=\"sap-print-section-heading\"><span>{sectionNumbers.strengths}</span><div><h2>Strengths and progress</h2><p>Areas that are improving, secure or consistently strong.</p></div></div><div className=\"sap-print-three\"><div><h3>Making progress</h3>{improving.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Now secure</h3>{resolved.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Strengths</h3>{strengths.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div></div></section> : null}"
    new_strengths = "{includeStrengths ? <section className=\"sap-print-section\"><div className=\"sap-print-section-heading\"><span>{sectionNumbers.strengths}</span><div><h2>Strengths, progress and evidence to confirm</h2><p>Established positive conclusions stay separate from low-data evidence that still needs confirmation.</p></div></div><div className=\"sap-print-three\"><div><h3>Making progress</h3>{improving.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Now secure</h3>{resolved.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Established strengths</h3>{strengths.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div></div>{evidenceToConfirm.length || reviewItems.length ? <div className=\"sap-print-focus-grid\"><h3>Evidence to confirm</h3>{evidenceToConfirm.map((item) => <article key={`confirm:${item.skill_key}`}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}</span><p>{evidenceConfirmationLabel(latestForFocusItem(item)?.observation_type)} · latest {item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`} · {item.evidence_items} assessment record{item.evidence_items === 1 ? '' : 's'}</p></article>)}{reviewItems.map((item) => <article key={`review:${item.skill_key}`}><strong>{item.skill}</strong><span>{item.subject}</span><p>Teacher review needed · qualified evidence points in different directions.</p></article>)}</div> : null}</section> : null}"
    replace_once(path, old_strengths, new_strengths)
    replace_once(path,
        "<h2>Assignment results</h2><p>Completed assignments only.</p>",
        "<h2>Official completed assignment outcomes</h2><p>These outcomes are the denominator for the completed-assignment average.</p>")
    replace_once(path,
        "<h2>Learning timeline and subject trends</h2><p>The graph is printed with numbered point details so the evidence remains understandable without hover.</p>",
        "<h2>Learning timeline and subject trends</h2><p>Trend lines only connect the same skill across separate assessment dates. Same-day and cross-skill evidence remains visible without being labelled progress.</p>")
    replace_once(path,
        "{item.observation_type === 'focus' ? 'needs support' : item.observation_type === 'strength' ? 'strength' : 'developing'}",
        "{observationDisplayLabel(item.observation_type).toLowerCase()}")


def patch_css() -> None:
    path = 'components/student-progress/StudentAcademicProfileV2Enhancements.css'
    text = read(path)
    if 'Academic Profile reporting-integrity layer' not in text:
        write(path, text.rstrip() + CSS_APPEND + '\n')
    report_css = 'components/student-progress/StudentAcademicProfile.css'
    report_text = read(report_css)
    marker = 'Academic Profile print trust summary'
    if marker not in report_text:
        report_text = report_text.rstrip() + r'''

/* Academic Profile print trust summary */
.sap-print-trust-summary { margin: 12px 0 16px; padding: 12px 14px; border: 1px solid #dbe7f4; border-radius: 12px; background: #f8fbff; }
.sap-print-trust-summary > span { display: block; margin-bottom: 4px; color: #315b78; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.sap-print-trust-summary > p { margin: 0; color: #243447; font-size: 10px; line-height: 1.55; }
''' + '\n'
        write(report_css, report_text)


def patch_classifier_migration(migration_path: str) -> None:
    target = ROOT / migration_path
    if not target.exists():
        raise RuntimeError(f"Migration path does not exist: {migration_path}")
    target.write_text(MIGRATION, encoding='utf-8')


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: patcher <generated-migration-path>')
    migration_path = sys.argv[1]
    write('components/student-progress/academicReportingSemantics.ts', HELPER)
    write('tests/academicProfileReportingIntegrity.test.ts', TEST)
    patch_service()
    patch_profile()
    patch_report()
    patch_css()
    patch_classifier_migration(migration_path)
    print('Academic Profile reporting-integrity patch applied.')


if __name__ == '__main__':
    main()
