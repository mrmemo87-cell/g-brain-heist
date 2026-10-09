import type {
  ReportEvidence,
  LearningSkill,
} from "./ieltsLearningReportService";

/** Formatting only: preserve source snapshots and teacher decisions. */
export function reportProse(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\([^)]*\bsource_id\s*:[^)]*\)/gi, "")
    .replace(/\bsource_id\s*:\s*/gi, "")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "",
    )
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export const isPracticeEvidence = (e: ReportEvidence) =>
  e.kind === "guided_practice" || e.exposure === "same_form_practice";
export function skillEvidence(
  evidence: ReportEvidence[],
  skill: LearningSkill,
) {
  const entries = evidence
    .filter((e) => e.skill === skill)
    .slice()
    .sort(
      (a, b) =>
        a.occurred_at.localeCompare(b.occurred_at) ||
        a.source_id.localeCompare(b.source_id),
    );
  const checks = entries.filter((e) => !isPracticeEvidence(e));
  return {
    starting: checks[0],
    laterChecks: checks.slice(1),
    practice: entries.filter(isPracticeEvidence),
    entries,
  };
}
export function evidenceRole(e: ReportEvidence) {
  if (e.kind === "guided_practice") return "Guided practice";
  if (e.exposure === "same_form_practice") return "Repeat for practice";
  return "Short check";
}
export function responseCoverage(e: ReportEvidence) {
  if (!e.item_observations?.length) return null;
  const answered = e.item_observations.filter(
    (o) => o.response_state === "answered",
  ).length;
  return `${answered} of ${e.item_observations.length} items answered`;
}
export function needsPlanWordingReview(text: string) {
  return /\bsource_id\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?:clear|confirmed|consistent|strong) strengths?\b|\bmore advanced sections\b/i.test(
    text,
  );
}
