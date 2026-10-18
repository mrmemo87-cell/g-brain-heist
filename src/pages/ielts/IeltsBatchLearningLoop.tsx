import React, { useEffect, useState } from 'react';
import { batchLearningLoop, type BatchLearningLoop, type LoopConstruct } from '../../../services/ieltsBatchService';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import { groupLearningLoop, stateLabel, type SharedTarget } from './batchLearningLoop';

export interface PreparedAssignment { task: string; students: string[]; reason: string }

const evidence = (c: LoopConstruct) => `${c.correct}/${c.opportunities} correct across ${c.sources} ${c.sources === 1 ? 'source' : 'sources'}${c.stale ? ' · evidence needs updating' : ''}`;

/** "This week" view of a batch: who needs what next, who is improving, who is stuck after practice, and bank gaps. */
export default function IeltsBatchLearningLoop({ batchId, onPrepare }: { batchId: string; onPrepare: (p: PreparedAssignment) => void }) {
  const [data, setData] = useState<BatchLearningLoop | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setData(null);
    batchLearningLoop(batchId).then(d => { if (alive) setData(d); }).catch(() => { if (alive) setError('This week\'s targets could not load. Refresh to retry; saved work is safe.'); });
    return () => { alive = false; };
  }, [batchId, refresh]);

  if (error) return <IeltsNotice error>{error} <IeltsButton onClick={() => setRefresh(n => n + 1)}>Retry</IeltsButton></IeltsNotice>;
  if (!data) return <p role="status">Checking each student's evidence…</p>;
  const g = groupLearningLoop(data);

  const practiceLine = (t: SharedTarget) => {
    const targeted = t.practice.filter(p => p.material_type === 'targeted');
    const catalogue = t.practice.filter(p => p.material_type !== 'targeted');
    if (!t.practice.length) return <p className="ix-muted">No reviewed practice is mapped to this skill yet (practice bank gap).</p>;
    return <div className="ix-actions">
      {targeted.map(p => <IeltsButton key={p.material_id} onClick={() => onPrepare({ task: p.material_id, students: t.students.map(s => s.id), reason: `Shared target: ${t.name}. Evidence from each student's screener and checks (provisional policy v1).` })}>Prepare {p.display_code ?? p.title} for {t.students.length} {t.students.length === 1 ? 'student' : 'students'}</IeltsButton>)}
      {catalogue.length > 0 && <span className="ix-muted">Catalogue practice: {catalogue.map(p => p.display_code ?? p.title).join(', ')} (assign under Course materials)</span>}
    </div>;
  };

  return <section className="ix-list" aria-label="This week's learning loop">
    <IeltsNotice>Targets come from each student's own evidence under <strong>bh-learning-policy-v1 (provisional)</strong>. One wrong answer never becomes a weakness; practice tasks show participation, and only fresh checks show improvement.</IeltsNotice>
    <IeltsButton onClick={() => setRefresh(n => n + 1)}>Refresh targets</IeltsButton>

    <section className="ix-row" aria-labelledby="loop-shared"><h3 id="loop-shared">Shared targets · assign this week's practice</h3>
      {!g.shared.length && <p className="ix-muted">No difficulty is supported by the current evidence yet.</p>}
      {g.shared.map(t => <article key={t.node_id} className="ix-row">
        <h4>{t.name} · {t.students.length} {t.students.length === 1 ? 'student' : 'students'}</h4>
        <p className="ix-muted">{t.students.map(s => s.name).join(', ')}</p>
        {t.extension && t.students.length >= 2 && <p><strong>Suggested lesson:</strong> {t.extension} (optional extension lesson)</p>}
        {practiceLine(t)}
      </article>)}
    </section>

    <section className="ix-row" aria-labelledby="loop-needs"><h3 id="loop-needs">Needs a next step · {g.needs.length}</h3>
      {g.needs.map(s => <article key={s.id}><strong>{s.name}</strong><ul>{s.targets.map(t => <li key={t.node_id}>{t.name}: {stateLabel[t.state]} <span className="ix-muted">(provisional policy v1) · {evidence(t)}</span></li>)}</ul></article>)}
    </section>

    <section className="ix-row" aria-labelledby="loop-improving"><h3 id="loop-improving">Improving · {g.improving.length}</h3>
      {!g.improving.length && <p className="ix-muted">Improvement appears after a fresh independent check, not after practice alone.</p>}
      {g.improving.map(s => <p key={s.id}><strong>{s.name}</strong>: {s.targets.map(t => `${t.name} (${stateLabel[t.state]})`).join('; ')}</p>)}
    </section>

    <section className="ix-row" aria-labelledby="loop-stuck"><h3 id="loop-stuck">Stuck after practice · {g.stuck.length}</h3>
      {!g.stuck.length && <p className="ix-muted">Nobody yet. This needs practice, a later fresh check and at least 21 days of evidence; you confirm it.</p>}
      {g.stuck.map(s => <p key={s.id}><strong>{s.name}</strong>: {s.targets.map(t => t.name).join('; ')} — choose a different approach.</p>)}
    </section>

    <section className="ix-row" aria-labelledby="loop-gaps"><h3 id="loop-gaps">Practice bank gaps · {g.gaps.length}</h3>
      {!g.gaps.length ? <p className="ix-muted">Every current target has reviewed practice.</p> : <p>{g.gaps.map(x => x.name).join(', ')}</p>}
    </section>

    {g.noEvidence.length > 0 && <p className="ix-muted"><strong>Initial assessment needed:</strong> {g.noEvidence.map(s => s.name).join(', ')}</p>}
  </section>;
}
