/** Teacher- and student-facing labels for practice materials: never show internal file names, and group by skill. */
export const SKILL_ORDER = ['listening', 'reading', 'writing', 'speaking'] as const;
export const skillName: Record<string, string> = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };

const slug = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/;
/** A readable title. Speaking bank items are stored under file-style names, so their first prompt line is used instead. */
export function friendlyTitle(item: { title: string; description?: string | null }): string {
  if (!slug.test(item.title.trim()) || !item.description) return item.title;
  let s = item.description.split(/\r?\n/)[0].split(/(?<=[.?!])\s/)[0].trim();
  s = s.replace(/^(let'?s talk about|let'?s discuss|describe)\s+/i, '').replace(/[.?!]$/, '');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 70 ? s.slice(0, 67).trimEnd() + '…' : s || item.title;
}

const codeNumber = (c?: string | null) => Number((c ?? '').replace(/\D/g, '')) || 0;
/** Groups items by skill in the usual IELTS order and sorts each group by its display code (L-002 before L-010). */
export function groupBySkill<T extends { skill?: string | null; display_code?: string | null }>(items: T[]): { skill: string; label: string; items: T[] }[] {
  const keys = [...SKILL_ORDER, ...new Set(items.map(i => i.skill ?? 'other').filter(s => !(SKILL_ORDER as readonly string[]).includes(s)))];
  return keys.map(skill => ({ skill, label: skillName[skill] ?? skill, items: items.filter(i => (i.skill ?? 'other') === skill).sort((a, b) => codeNumber(a.display_code) - codeNumber(b.display_code)) }))
    .filter(g => g.items.length);
}
