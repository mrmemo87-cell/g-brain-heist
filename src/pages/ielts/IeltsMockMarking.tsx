import React, { useEffect, useState } from 'react';
import '../../styles/ielts-mock-cbt.css';
import { WritingResult } from '../../components/ielts/mock/MockResultView';
import {
  fetchMockMarkingQueue,
  fetchMockResult,
  markMockWriting,
  type MockMarkingRow,
  type MockResult,
  type MockWritingCriteria,
} from '../../../services/ieltsMockCbtService';

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);
const T1 = [['ta', 'Task Achievement'], ['cc', 'Coherence and Cohesion'], ['lr', 'Lexical Resource'], ['gra', 'Grammatical Range and Accuracy']] as const;
const T2 = [['tr', 'Task Response'], ['cc', 'Coherence and Cohesion'], ['lr', 'Lexical Resource'], ['gra', 'Grammatical Range and Accuracy']] as const;

/**
 * Brains Heist marking desk for computer mock Writing (Diagnostic Bible 9.5: a Writing range needs human-confirmed
 * criterion bands for both tasks, Task 2 weighted double). Superadmin only; the server checks this on every call.
 */
const IeltsMockMarking: React.FC = () => {
  const [queue, setQueue] = useState<MockMarkingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MockResult | null>(null);
  const [t1, setT1] = useState<Record<string, string>>({});
  const [t2, setT2] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const loadQueue = () => fetchMockMarkingQueue().then(setQueue).catch((e: unknown) => setError(e instanceof Error ? e.message : 'The queue could not load.'));
  useEffect(() => { void loadQueue(); }, []);

  const openAttempt = async (id: string) => {
    setError(null);
    try {
      const r = await fetchMockResult(id);
      setOpen(r);
      const c = r.skills.writing.review?.criteria;
      setT1(c ? { ta: String(c.t1.ta), cc: String(c.t1.cc), lr: String(c.t1.lr), gra: String(c.t1.gra) } : {});
      setT2(c ? { tr: String(c.t2.tr), cc: String(c.t2.cc), lr: String(c.t2.lr), gra: String(c.t2.gra) } : {});
      setComment(r.skills.writing.review?.comment ?? '');
      window.scrollTo({ top: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'The attempt could not load.'); }
  };

  const save = async () => {
    if (!open) return;
    setSaving(true);
    setError(null);
    try {
      const criteria: MockWritingCriteria = {
        t1: { ta: Number(t1['ta']), cc: Number(t1['cc']), lr: Number(t1['lr']), gra: Number(t1['gra']) },
        t2: { tr: Number(t2['tr']), cc: Number(t2['cc']), lr: Number(t2['lr']), gra: Number(t2['gra']) },
      };
      setOpen(await markMockWriting(open.attempt_id, criteria, comment));
      void loadQueue();
    } catch (e) { setError(e instanceof Error ? e.message : 'The marks could not be saved.'); }
    finally { setSaving(false); }
  };

  const select = (task: 't1' | 't2', key: string, label: string) => {
    const state = task === 't1' ? t1 : t2;
    const set = task === 't1' ? setT1 : setT2;
    return (
      <label key={`${task}${key}`} className="mk-mark-field">{label}
        <select value={state[key] ?? ''} onChange={(e) => set({ ...state, [key]: e.target.value })}>
          <option value="">–</option>
          {BANDS.map((b) => <option key={b} value={String(b)}>{b.toFixed(1)}</option>)}
        </select>
      </label>
    );
  };
  const complete = T1.every(([k]) => t1[k]) && T2.every(([k]) => t2[k]);

  return (
    <div className="mk-result mk-marking">
      <header className="mk-result-head">
        <p className="mk-eyebrow">Brains Heist IELTS · marking desk</p>
        <h1>Mock test Writing</h1>
        <p>Give each task a band for its four criteria. The learner then sees an indicative Writing range: (Task 1 + 2 × Task 2) ÷ 3, rounded to the nearest half band, ± 0.5.</p>
      </header>
      {error && <p className="mk-note" role="alert">{error}</p>}

      {open && (
        <section className="mk-card">
          <div className="mk-home-top">
            <h2>{open.title} · attempt {open.attempt_no}{open.practice ? ' (practice)' : ''}</h2>
            <button type="button" className="mk-btn" onClick={() => setOpen(null)}>Close</button>
          </div>
          <div className="mk-mark-grid">
            <div>
              <h3>Task 1 · {open.skills.writing.t1_words} words</h3>
              <p className="mk-small">{open.payload.writing?.task1.prompt}</p>
              {open.payload.writing?.task1.figure && <img className="mk-mark-fig" src={open.payload.writing.task1.figure.src} alt={open.payload.writing.task1.figure.alt} />}
              <div className="mk-essay">{open.skills.writing.t1 || '(no answer)'}</div>
              <div className="mk-mark-fields">{T1.map(([k, l]) => select('t1', k, l))}</div>
            </div>
            <div>
              <h3>Task 2 · {open.skills.writing.t2_words} words</h3>
              <p className="mk-small">{open.payload.writing?.task2.prompt}</p>
              <div className="mk-essay">{open.skills.writing.t2 || '(no answer)'}</div>
              <div className="mk-mark-fields">{T2.map(([k, l]) => select('t2', k, l))}</div>
            </div>
          </div>
          <label className="mk-mark-field mk-mark-comment">Comment for the learner (optional)
            <textarea value={comment} maxLength={4000} onChange={(e) => setComment(e.target.value)} rows={4} />
          </label>
          <button type="button" className="mk-btn mk-btn--primary" disabled={!complete || saving} onClick={() => { void save(); }}>
            {saving ? 'Saving…' : open.skills.writing.review ? 'Save new marks' : 'Save marks'}
          </button>
          {open.skills.writing.review && <WritingResult result={open} />}
        </section>
      )}

      <section className="mk-card">
        <h2>Submitted tests</h2>
        {!queue && <p className="mk-note">Loading…</p>}
        {queue && queue.length === 0 && <p className="mk-note">No completed mock tests yet.</p>}
        {queue && queue.length > 0 && (
          <ul className="mk-attempts">
            {queue.map((q) => (
              <li key={q.attempt_id}>
                <button type="button" onClick={() => { void openAttempt(q.attempt_id); }}>
                  <span><b>{q.student}</b> · {q.code.replace('IELTS-', '')}{q.practice ? ' · practice' : ''}</span>
                  <span>{new Date(q.completed_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {q.t1_words} + {q.t2_words} words</span>
                  <span>{q.reviewed_at ? 'Marked' : 'To mark'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default IeltsMockMarking;
