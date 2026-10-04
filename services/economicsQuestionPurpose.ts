/** Assessment roles guide selection; server-side provenance determines eligibility. */
export function isReservedReassessmentQuestion(question: { tags?: string[] | null }): boolean {
  return Boolean(question.tags?.includes('purpose:reassessment'));
}

export function questionPurposeLabel(question: { tags?: string[] | null }): string | null {
  if (isReservedReassessmentQuestion(question)) return 'Reassessment candidate';
  if (question.tags?.includes('purpose:practice')) return 'Targeted practice';
  return null;
}
