import type { ScanSession, ScanSheet } from './layout';
export type ScanBooklet = { session: ScanSession; pages: ScanSheet[]; ready: boolean };
/** Sessions arrive newest scan first. A newer partial scan must not finalize an older booklet. */
export function scanInbox(sessions: ScanSession[], students: { id: string; status: string; existingAnswerCount?: number }[]): ScanBooklet[] {
  const candidates: { session: ScanSession; key: string; pages: ScanSheet[]; time: number }[] = [];
  const seen = new Set<string>();
  const result: ScanBooklet[] = [];
  for (const session of sessions) {
    const groups = new Map<string, ScanSheet[]>();
    for (const page of session.sheets) {
      const key = page.studentId || page.guestId;
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), page]);
    }
    for (const [key, pages] of groups) candidates.push({ session, key, pages, time: Math.max(0, ...pages.map(page => Date.parse(page.scannedAt || "") || 0)) });
  }
  // Per-student scan time matters: a new scan for another student in an old
  // session must not resurrect this student's superseded booklet.
  candidates.sort((a, b) => b.time - a.time);
  for (const { session, key, pages } of candidates) {
      if (seen.has(key) || !pages.some(page => page.scanId)) continue;
      seen.add(key);
      const student = students.find(student => student.id === pages[0].studentId);
      if (student?.status === 'completed' || pages.every(page => page.confirmedAt || page.heldAt)) continue;
      const count = pages[0].pageCount;
      const complete = count > 0 && pages.length === count && new Set(pages.map(page => page.pageNumber)).size === count && pages.every(page => page.pageCount === count && page.pageNumber >= 1 && page.pageNumber <= count && page.scanId && page.reviewedAnswers && !page.confirmedAt && !page.heldAt);
      result.push({ session, pages, ready: complete && !!student && !student.existingAnswerCount });
  }
  return result;
}
