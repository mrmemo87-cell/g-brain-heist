export interface PoolQuestionIdentity {
  teacher_id?: string | null;
  is_mine?: boolean | null;
}

export type QuestionPoolFilter = "all" | "brains-heist" | "mine";

export const normalizeClanWarSubject = (value: string) => {
  let normalized = value.trim().toLocaleLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  normalized = normalized.replace(/^(?:cambridge |cie )?(?:international )?(?:as(?: level)?|a level|gcse|igcse)\s+/, "");
  if (["math", "maths", "mathematics"].includes(normalized)) return "maths";
  if (normalized === "english language") return "english";
  return normalized;
};

/** Use the ownership flag produced by get_all_active_questions. teacher_id is a
 * teacher-profile id, not the authenticated user id, so those ids cannot be
 * compared to determine whether a question belongs to the current teacher. */
export const questionBelongsToPool = (
  question: PoolQuestionIdentity,
  pool: QuestionPoolFilter,
) => {
  const isMine = question.is_mine === true;
  if (pool === "mine") return isMine;
  if (pool === "brains-heist") return !isMine;
  return true;
};
