import React from 'react';
import type { PracticeAttemptReview } from '../../../services/ieltsPracticeReview';
import { skillTips } from '../../lib/ieltsSkillTips';

/** Results per skill from the set's approved construct mappings, with a tip for each skill the student missed.
 *  Practice only: it shows participation and where to focus, never a band or a confirmed weakness. */
export function skillBreakdown(review: PracticeAttemptReview | null) {
  const rows = new Map<string, { code: string; name: string; correct: number; total: number }>();
  for (const item of review?.items ?? []) {
    const c = item.construct;
    if (!c) continue;
    const row = rows.get(c.code) ?? { code: c.code, name: c.name, correct: 0, total: 0 };
    row.total += 1; if (item.is_correct) row.correct += 1;
    rows.set(c.code, row);
  }
  return [...rows.values()].sort((a, b) => (a.correct / a.total) - (b.correct / b.total) || a.name.localeCompare(b.name));
}

export default function IeltsPracticeSkillResults({ review }: { review: PracticeAttemptReview | null }) {
  const rows = skillBreakdown(review);
  if (!rows.length) return null;
  const missed = rows.filter((r) => r.correct < r.total);
  return (
    <section aria-labelledby="skill-results-title" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
      <h3 id="skill-results-title" style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#0f172a', margin: '0 0 0.75rem' }}>Your skills in this set</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => (
          <li key={r.code} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#1e293b' }}>
            <span>{r.name}</span>
            <strong style={{ color: r.correct === r.total ? '#15803d' : '#b45309' }}>{r.correct}/{r.total}</strong>
          </li>
        ))}
      </ul>
      {missed.length ? (
        <div>
          <h4 style={{ margin: '0 0 0.5rem', color: '#334155' }}>What to practise next</h4>
          {missed.map((r) => (
            <p key={r.code} style={{ margin: '0 0 0.5rem', color: '#334155', lineHeight: 1.5 }}>
              <strong>{r.name}:</strong> {skillTips[r.code] ?? 'Look at the questions you missed and find the exact words in the text or recording that give the answer.'}
            </p>
          ))}
        </div>
      ) : <p style={{ margin: 0, color: '#15803d' }}>All correct in every skill this set practised.</p>}
      <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>Practice results show where to focus. Your teacher sees progress after a fresh check, not from one practice set.</p>
    </section>
  );
}
