import React, { useEffect, useState } from 'react';
import { batchProductiveEffect, type BatchProductiveEffect, type ProductiveRating, type ProductiveVerdict } from '../../../services/ieltsBatchService';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';

// IELTS criterion names teachers use (Diagnostic Bible 2.0.0 section 8A.5; bh-productive-effect-v1, provisional).
export const criterionName: Record<string, string> = {
  task_response: 'Task response', coherence_cohesion: 'Coherence and cohesion', lexical_resource: 'Vocabulary (lexical resource)',
  grammar: 'Grammar (range and accuracy)', fluency_coherence: 'Fluency and coherence', pronunciation: 'Pronunciation',
};
export const productiveLabel: Record<ProductiveVerdict, string> = {
  higher: 'Higher on a fresh task', similar: 'About the same', lower: 'Lower on a fresh task',
  waiting_for_fresh_task: 'Waiting for a fresh rated task', different_scales: 'Needs one more band-rated piece', no_rating: 'Not rated yet',
};
const tone: Partial<Record<ProductiveVerdict, string>> = { higher: 'up', lower: 'down' };
const sourceName = { practice: 'practice', screener: 'screener', interview: 'interview' } as const;
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const rating = (r: ProductiveRating | null) => !r ? '—' : r.scale === 'band' ? `band ${Number(r.value).toString()} (${sourceName[r.source]}, ${day(r.at)})` : `${r.value} (${sourceName[r.source]}, ${day(r.at)})`;

/** Writing and Speaking: the teacher's own criterion ratings on an earlier task vs a fresh one. Read-only. */
export default function IeltsBatchProductiveEffect({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchProductiveEffect | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setData(null);
    batchProductiveEffect(batchId).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setError('Writing and Speaking results could not load. Retry; saved work is safe.'); });
    return () => { alive = false; };
  }, [batchId, refresh]);
  if (error) return <IeltsNotice error>{error} <IeltsButton onClick={() => setRefresh((n) => n + 1)}>Retry</IeltsButton></IeltsNotice>;
  if (!data) return <p role="status">Checking teacher ratings for Writing and Speaking…</p>;
  const students = [...new Set(data.rows.map((r) => r.student_id))];
  const compared = data.rows.filter((r) => ['higher', 'similar', 'lower'].includes(r.verdict)).length;
  return <section className="ix-list ix-effect" aria-label="Writing and Speaking change">
    <header><h3>Writing and Speaking · teacher ratings</h3>
      <p className="ix-muted">Each IELTS criterion compares your rating of an earlier task with a fresh task. A rise of one band, or “developing” becoming “observed”, counts as higher. Rewrites of the same task do not count, and screener statuses are never compared with bands.</p>
      <p className="ix-muted">{compared ? `${compared} criterion ${compared === 1 ? 'comparison' : 'comparisons'} so far.` : 'No comparisons yet: each student needs a second rated essay or recording on a new task.'}</p>
    </header>
    {!data.rows.length && <p>No Writing or Speaking work in this batch has been rated yet.</p>}
    {students.map((id) => {
      const rows = data.rows.filter((r) => r.student_id === id);
      return <article key={id} className="ix-row" aria-label={`${rows[0].student} Writing and Speaking`}>
        <h4>{rows[0].student}</h4>
        <div className="ix-table-wrap"><table className="ix-effect-table">
          <thead><tr><th scope="col">Skill</th><th scope="col">Criterion</th><th scope="col">Earlier</th><th scope="col">Fresh task</th><th scope="col">Result</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.skill + r.criterion}>
            <td>{r.skill === 'writing' ? 'Writing' : 'Speaking'}</td><td>{criterionName[r.criterion] ?? r.criterion}</td>
            <td>{rating(r.first)}</td><td>{rating(r.last)}</td>
            <td><span className={`ix-status ix-effect-${tone[r.verdict] ?? 'neutral'}`}>{productiveLabel[r.verdict]}</span></td>
          </tr>)}</tbody>
        </table></div>
      </article>;
    })}
    <p className="ix-muted ix-effect-note">A higher rating does not prove the practice caused it. {data.policy}.</p>
  </section>;
}
