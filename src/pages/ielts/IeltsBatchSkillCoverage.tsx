import React, { useEffect, useState } from 'react';
import { batchSkillCoverage, type BatchSkillCoverage, type CoverageCount, type SkillCoverageRow } from '../../../services/ieltsBatchService';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import { criterionName } from './IeltsBatchProductiveEffect';

// Every IELTS skill the programme diagnoses: is there practice, is there a fresh check, and is it being measured?
// Read-only (bh-ielts-skill-coverage-v1, provisional). Pilot-only tasks are shown separately from released ones.
type Status = 'ready' | 'pilot' | 'no_practice' | 'no_check';
const SKILLS: { key: SkillCoverageRow['skill']; label: string }[] = [
  { key: 'listening', label: 'Listening' }, { key: 'reading', label: 'Reading' }, { key: 'writing', label: 'Writing' }, { key: 'speaking', label: 'Speaking' },
];
const statusLabel: Record<Status, string> = { ready: 'Ready for all students', pilot: 'Pilot only · awaiting approval', no_practice: 'Gap · no practice task', no_check: 'Gap · no fresh check' };
const statusTone: Record<Status, string> = { ready: 'up', pilot: 'neutral', no_practice: 'down', no_check: 'down' };
const total = (c: CoverageCount) => c.released + c.pilot;

export function coverageStatus(r: SkillCoverageRow): Status {
  const productive = r.method === 'teacher_ratings';
  const practice = total(r.practice) + (productive ? r.materials : 0);
  if (!practice) return 'no_practice';
  if (!total(r.checks)) return 'no_check';
  const practiceReleased = r.practice.released + (productive ? r.materials : 0);
  return practiceReleased > 0 && r.checks.released > 0 ? 'ready' : 'pilot';
}

const counts = (c: CoverageCount, noun: string) => {
  const parts = [c.released ? `${c.released} released` : '', c.pilot ? `${c.pilot} pilot` : ''].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} ${noun}${total(c) === 1 ? '' : 's'}` : 'None';
};
const start = (r: SkillCoverageRow) => {
  const s = [r.baseline.screener ? 'screener' : '', r.baseline.interview ? 'speaking interview' : '', r.baseline.mock ? 'mock tests' : ''].filter(Boolean);
  return s.length ? s.join(', ') : 'First fresh check';
};

export default function IeltsBatchSkillCoverage({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchSkillCoverage | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setData(null);
    batchSkillCoverage(batchId).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setError('Skill coverage could not load. Retry; nothing has changed.'); });
    return () => { alive = false; };
  }, [batchId, refresh]);
  if (error) return <IeltsNotice error>{error} <IeltsButton onClick={() => setRefresh((n) => n + 1)}>Retry</IeltsButton></IeltsNotice>;
  if (!data) return <p role="status">Checking practice and measurement for every skill…</p>;
  const statuses = data.rows.map(coverageStatus);
  const n = (s: Status[]) => statuses.filter((x) => s.includes(x)).length;
  return <section className="ix-list ix-effect" aria-label="Skill coverage">
    <header>
      <h3>Skill coverage</h3>
      <p className="ix-muted">Every IELTS skill we diagnose. Listening and Reading are measured with fresh questions the student has not seen; Writing and Speaking with your criterion ratings on a new task. Practice never counts as measurement.</p>
    </header>
    <div className="ix-effect-summary" role="list" aria-label="Coverage summary">
      <div role="listitem"><strong>{n(['ready', 'pilot'])} of {data.rows.length}</strong><span>skills with practice and a fresh check</span></div>
      <div role="listitem"><strong>{n(['ready'])}</strong><span>ready for every student</span></div>
      <div role="listitem"><strong>{n(['pilot'])}</strong><span>pilot only, awaiting approval</span></div>
      <div role="listitem"><strong>{n(['no_practice', 'no_check'])}</strong><span>gaps</span></div>
    </div>
    {SKILLS.map(({ key, label }) => {
      const rows = data.rows.filter((r) => r.skill === key);
      if (!rows.length) return null;
      const productive = rows[0].method === 'teacher_ratings';
      return <article key={key} className="ix-row" aria-label={`${label} coverage`}>
        <h4>{label} · {rows.length} {productive ? 'criteria' : 'skills'}</h4>
        <div className="ix-table-wrap"><table className="ix-effect-table">
          <thead><tr><th scope="col">{productive ? 'Criterion' : 'Skill'}</th><th scope="col">Practice</th><th scope="col">Fresh check</th><th scope="col">Starting point</th><th scope="col">Measured in this batch</th><th scope="col">Status</th></tr></thead>
          <tbody>{rows.map((r) => {
            const s = coverageStatus(r);
            return <tr key={r.code}>
              <th scope="row">{productive ? (criterionName[r.code] ?? r.name) : r.name}</th>
              <td>{productive ? `${r.materials} ${key} tasks${total(r.practice) ? ` · ${counts(r.practice, 'targeted task')}` : ''}` : <>{counts(r.practice, 'task')}{r.materials ? <span className="ix-muted"> · {r.materials} bank materials</span> : null}</>}</td>
              <td>{counts(r.checks, 'check')}</td>
              <td>{start(r)}</td>
              <td>{productive ? `${r.students_measured} compared · ${r.students_rated ?? 0} rated` : `${r.students_measured} of ${data.members} students`}</td>
              <td><span className={`ix-status ix-effect-${statusTone[s]}`}>{statusLabel[s]}</span></td>
            </tr>;
          })}</tbody>
        </table></div>
      </article>;
    })}
    <p className="ix-muted ix-effect-note">“Measured” means the student has independent evidence for the skill (Listening and Reading) or two teacher ratings on different tasks on the same scale (Writing and Speaking). It is not a band. {data.policy}.</p>
  </section>;
}
