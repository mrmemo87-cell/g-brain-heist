import React, { useEffect, useState } from 'react';
import { batchPracticeEffect, type BatchPracticeEffect, type PracticeEffectRow, type PracticeEffectVerdict } from '../../../services/ieltsBatchService';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import type { PreparedAssignment } from './IeltsBatchLearningLoop';

// Teacher wording for bh-practice-effect-v1 (provisional). Never "improved" or "did not improve" (Diagnostic Bible 8A.6).
export const verdictLabel: Record<PracticeEffectVerdict, string> = {
  waiting_for_check: 'Waiting for a fresh check',
  no_starting_point: 'No starting point to compare',
  too_few_questions: 'Too few questions to tell',
  higher: 'Higher on the fresh check',
  higher_not_secure: 'Higher, not yet secure',
  similar: 'About the same',
  lower: 'Lower on the fresh check',
  teacher_judged: 'Your judgement',
  not_practised: 'Not practised',
};
const tone: Partial<Record<PracticeEffectVerdict, string>> = { higher: 'up', higher_not_secure: 'up', lower: 'down' };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const score = (s: { opportunities: number; correct: number; at: string | null }) =>
  s.opportunities ? `${s.correct}/${s.opportunities} correct${s.at ? ` (latest ${day(s.at)})` : ''}` : 'no independent evidence';

export function summarise(rows: PracticeEffectRow[]) {
  const auto = rows.filter((r) => r.verdict !== 'teacher_judged');
  const checked = auto.filter((r) => r.after.opportunities > 0);
  return {
    practised: rows.length,
    waiting: auto.filter((r) => r.verdict === 'waiting_for_check').length,
    checked: checked.length,
    higher: auto.filter((r) => r.verdict === 'higher' || r.verdict === 'higher_not_secure').length,
    similar: auto.filter((r) => r.verdict === 'similar').length,
    lower: auto.filter((r) => r.verdict === 'lower').length,
    unclear: auto.filter((r) => r.verdict === 'too_few_questions' || r.verdict === 'no_starting_point').length,
    noCheck: auto.filter((r) => r.verdict === 'waiting_for_check' && !r.fresh_checks.length && !r.pending_checks.length).length,
  };
}

/** "Did it work?": each practised skill, independent evidence before the first practice vs a fresh check after it. */
export default function IeltsBatchPracticeEffect({ batchId, onPrepare }: { batchId: string; onPrepare: (p: PreparedAssignment) => void }) {
  const [data, setData] = useState<BatchPracticeEffect | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setData(null);
    batchPracticeEffect(batchId).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setError('Results could not load. Refresh to retry; saved work is safe.'); });
    return () => { alive = false; };
  }, [batchId, refresh]);

  if (error) return <IeltsNotice error>{error} <IeltsButton onClick={() => setRefresh((n) => n + 1)}>Retry</IeltsButton></IeltsNotice>;
  if (!data) return <p role="status">Comparing each student's evidence before and after practice…</p>;
  const sum = summarise(data.rows);
  const students = [...new Set(data.rows.map((r) => r.student_id))];

  return <section className="ix-list ix-effect" aria-label="Did the practice work?">
    <div className="ix-effect-summary" role="group" aria-label="Summary">
      <div><strong>{sum.practised}</strong><span>skills practised</span></div>
      <div><strong>{sum.checked}</strong><span>with a fresh check after practice</span></div>
      <div><strong>{sum.higher}</strong><span>higher</span></div>
      <div><strong>{sum.similar}</strong><span>about the same</span></div>
      <div><strong>{sum.lower}</strong><span>lower</span></div>
      <div><strong>{sum.waiting}</strong><span>waiting for a fresh check</span></div>
    </div>
    <p className="ix-muted">
      {sum.checked < 5
        ? `Too early to judge the practice: ${sum.checked} fresh ${sum.checked === 1 ? 'check' : 'checks'} so far. Assign a fresh check 1–2 weeks after practice to find out.`
        : `${sum.higher} of ${sum.checked} fresh checks came out higher than before practice.`}
      {sum.noCheck > 0 && ` ${sum.noCheck} practised ${sum.noCheck === 1 ? 'skill has' : 'skills have'} no fresh check written yet.`}
    </p>
    <IeltsButton onClick={() => setRefresh((n) => n + 1)}>Refresh</IeltsButton>

    {!data.rows.length && <p>No one in this batch has practised a mapped skill yet. Assign this week's practice first.</p>}
    {students.map((id) => {
      const rows = data.rows.filter((r) => r.student_id === id);
      return <article key={id} className="ix-row" aria-label={rows[0].student}>
        <h3>{rows[0].student}</h3>
        <ul className="ix-effect-list">
          {rows.map((r) => <li key={r.node_id}>
            <div className="ix-effect-head"><strong>{r.skill_name}</strong><span className={`ix-status ix-effect-${tone[r.verdict] ?? 'neutral'}`}>{verdictLabel[r.verdict]}</span></div>
            <p className="ix-muted">Practised {r.practice_count === 1 ? 'once' : `${r.practice_count} times`} from {day(r.first_practice_at)}{r.practice?.length ? `: ${r.practice.slice(0, 3).join(', ')}` : ''}.</p>
            {r.verdict === 'teacher_judged'
              ? <p>Writing and Speaking change is your call: compare a fresh, comparable task with the earlier one in the review desk.</p>
              : <p><span className="ix-muted">Before practice:</span> {score(r.before)} · <span className="ix-muted">Fresh check after:</span> {r.after.opportunities ? score(r.after) : 'not yet'}</p>}
            {r.verdict !== 'teacher_judged' && r.after.opportunities === 0 && (
              r.pending_checks.length
                ? <p>Fresh check {r.pending_checks.map((c) => c.display_code ?? c.title).join(', ')} is assigned and not done yet.</p>
                : r.fresh_checks.length
                  ? <IeltsButton onClick={() => onPrepare({ task: r.fresh_checks[0].code, students: [r.student_id], reason: `Fresh check after practice on ${r.skill_name}.` })}>Prepare fresh check {r.fresh_checks[0].display_code ?? r.fresh_checks[0].title}</IeltsButton>
                  : <p className="ix-muted">No fresh check exists for this skill yet (content gap).</p>
            )}
          </li>)}
        </ul>
      </article>;
    })}
    <p className="ix-muted ix-effect-note">Only fresh, unseen checks, first screener attempts and mocks count; practice never does. A higher result does not prove the practice caused it. {data.policy}.</p>
  </section>;
}
