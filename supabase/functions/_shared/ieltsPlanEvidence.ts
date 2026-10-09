/** Narrow consistency checks; fresh follow-ups remain legitimate teacher decisions. */
export function planEvidenceIssues(
  fields: {
    study_goal?: string;
    next_action?: string;
    goals?: { action: string; skill?: string }[];
  },
  evidence: { skill: string; review_id?: string | null; kind?: string }[],
): string[] {
  const sentences = [
    fields.study_goal,
    fields.next_action,
    ...(fields.goals ?? []).map((g) => `${g.skill ?? ""}: ${g.action}`),
  ]
    .filter(Boolean)
    .flatMap((t) => t!.split(/[.!?\n]/));
  return ["writing", "speaking"]
    .filter(
      (skill) =>
        evidence.some(
          (e) =>
            e.skill === skill && e.review_id && e.kind !== "guided_practice",
        ) &&
        sentences.some(
          (sentence) =>
            new RegExp(`\\b${skill}\\b`, "i").test(sentence) &&
            /\b(assessments?|samples?|checks?|reviews?)\b/i.test(sentence) &&
            /\b(arrange|schedule|missing|pending|await|need|take|complete|submit)\b/i.test(
              sentence,
            ) &&
            !/\b(fresh|new|next|follow.up|another|repeat|expand|revise|revising|feedback)\b/i.test(
              sentence,
            ),
        ),
    )
    .map(
      (skill) =>
        `${skill[0].toUpperCase() + skill.slice(1)} already has teacher-reviewed evidence. Describe a fresh follow-up or revise the outdated assessment request.`,
    );
}
