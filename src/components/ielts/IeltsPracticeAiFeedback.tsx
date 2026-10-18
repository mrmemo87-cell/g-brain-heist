import React, { useEffect, useRef, useState } from 'react';
import { practiceFeedback, requestPracticeFeedback, confirmPracticeFeedback, criterionLabel, type PracticeFeedbackView } from '../../../services/ieltsPracticeFeedback';

/**
 * AI first-pass feedback on practice writing (Diagnostic Bible 2.0.0 section 10.5; Visual & UX Bible 13.3).
 * Students request and read it; teachers confirm it. It never shows an overall band.
 */
export default function IeltsPracticeAiFeedback({ attemptId, mode }: { attemptId: string; mode: 'student' | 'teacher' }) {
  const [view, setView] = useState<PracticeFeedbackView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const lock = useRef(false);
  useEffect(() => { let alive = true; practiceFeedback(attemptId).then(v => { if (alive) { setView(v); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); }); return () => { alive = false; }; }, [attemptId]);
  const run = async (f: () => Promise<PracticeFeedbackView>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { setView(await f()); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  if (!loaded) return null;
  const ready = view?.status === 'ready' && view.fields;
  if (!ready && mode === 'teacher') return null;

  return <section aria-labelledby="practice-ai-feedback" style={{ border: '1px solid #c7d2fe', background: '#f8faff', borderRadius: '0.75rem', padding: '1rem', margin: '1rem 0', textAlign: 'left' }}>
    <h2 id="practice-ai-feedback" style={{ marginTop: 0, fontSize: '1.15rem', color: '#1e293b' }}>
      {view?.confirmed ? `Checked by ${view.confirmed_by ?? 'your teacher'}${view.confirmed_at ? `, ${new Date(view.confirmed_at).toLocaleDateString()}` : ''}` : 'AI practice feedback — your teacher may adjust it'}
    </h2>
    {!ready && <>
      <p style={{ color: '#475569' }}>Get fast feedback on this practice response: what worked, what to fix and one action for each criterion. It is practice feedback, not an official IELTS result.</p>
      <button type="button" className="ix-button ix-button--primary" disabled={busy} onClick={() => void run(() => requestPracticeFeedback(attemptId))}>{busy ? 'Preparing feedback… (up to a minute)' : view?.status === 'failed' ? 'Try AI feedback again' : 'Get AI feedback now'}</button>
    </>}
    {error && <p role="alert" style={{ color: '#b45309' }}>{error}</p>}
    {ready && view?.fields && <>
      {Object.entries(view.fields.criteria).map(([key, c]) => <article key={key} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{criterionLabel[key] ?? key}{c.indication && <span style={{ fontWeight: 400, color: '#475569' }}> · AI practice indication: about {c.indication.low.toFixed(1)}–{c.indication.high.toFixed(1)}</span>}</h3>
        <p style={{ margin: '0.4rem 0' }}>{c.comment}</p>
        {c.evidence.map((e, i) => <p key={i} style={{ margin: '0.25rem 0', color: '#334155' }}><mark style={{ background: '#fef3c7', padding: '0 0.2rem' }}>“{e.quote}”</mark></p>)}
        <p style={{ margin: '0.4rem 0' }}><strong>Try this:</strong> {c.action}</p>
      </article>)}
      <p style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}><strong>Next draft:</strong> {view.fields.next_step}</p>
      {view.teacher_note && <p><strong>Teacher note:</strong> {view.teacher_note}</p>}
      <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Practice indications are ranges for each criterion, not an overall band and not an official IELTS result. Revising and resubmitting is encouraged; revisions count as practice.</p>
      {mode === 'teacher' && !view.confirmed && <div>
        <label style={{ display: 'block' }}>Note to the student (optional)<textarea value={note} maxLength={1200} onChange={e => setNote(e.target.value)} style={{ width: '100%', minHeight: '4rem' }} /></label>
        <button type="button" className="ix-button ix-button--primary" disabled={busy} onClick={() => void run(() => confirmPracticeFeedback(view.id, note))}>{busy ? 'Saving…' : 'Confirm this AI feedback'}</button>
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Confirming shows the student it was checked. Use your own review below to change ratings or comments.</p>
      </div>}
    </>}
  </section>;
}
