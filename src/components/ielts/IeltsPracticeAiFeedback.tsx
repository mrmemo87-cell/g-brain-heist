import React, { useEffect, useRef, useState } from 'react';
import {
  practiceFeedback,
  requestPracticeFeedback,
  confirmPracticeFeedback,
  confirmSpeakingPracticeFeedback,
  speakingPracticeFeedback,
  requestSpeakingPracticeFeedback,
  criterionLabel,
  type PracticeFeedbackView,
} from '../../../services/ieltsPracticeFeedback';
import { useIeltsAudience, type IeltsAudience } from '../../lib/ieltsAudience';
import '../../styles/ielts-feedback.css';

/**
 * Practice feedback on Writing and Speaking (Diagnostic Bible 2.1.0 sections 10.5-10.6; Visual & UX Bible 13.3, 13.6).
 * School learners see "AI practice feedback — your teacher may adjust it"; self-paced learners see
 * "Brains Heist feedback — an estimate, not an official IELTS result". Never an overall band.
 */
type Props = {
  attemptId: string;
  mode: 'student' | 'teacher';
  skill?: 'writing' | 'speaking';
  /** Speaking only: returns the learner's original practice recording. */
  loadRecording?: () => Promise<Blob>;
  /** Overrides the detected audience (tests, previews). */
  audience?: IeltsAudience;
};

const scaleMarks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RangeBar({ low, high }: { low: number; high: number }) {
  return (
    <div className="pf-scale" aria-hidden="true">
      <div className="pf-scale-track">
        <span className="pf-scale-range" style={{ left: `${(low / 9) * 100}%`, width: `${((high - low) / 9) * 100}%` }} />
      </div>
      <div className="pf-scale-marks">{scaleMarks.map((n) => <span key={n}>{n}</span>)}</div>
    </div>
  );
}

export default function IeltsPracticeAiFeedback({ attemptId, mode, skill = 'writing', loadRecording, audience: forced }: Props) {
  const detected = useIeltsAudience();
  const audience = forced ?? detected;
  const independent = mode === 'student' && audience === 'independent';
  const [view, setView] = useState<PracticeFeedbackView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    const read = skill === 'speaking' ? speakingPracticeFeedback : practiceFeedback;
    read(attemptId).then(v => { if (alive) { setView(v); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [attemptId, skill]);

  const run = async (f: () => Promise<PracticeFeedbackView>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { setView(await f()); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  const request = () => run(() => (skill === 'speaking'
    ? requestSpeakingPracticeFeedback(attemptId, loadRecording ?? (() => Promise.reject(new Error('recording_unavailable'))))
    : requestPracticeFeedback(attemptId)));

  if (!loaded || (mode === 'student' && !audience)) return null;
  const ready = view?.status === 'ready' && view.fields;
  if (!ready && mode === 'teacher') return null;
  if (skill === 'speaking' && !ready && mode === 'student' && !loadRecording) return null;

  const title = view?.confirmed
    ? `Checked by ${view.confirmed_by ?? 'your teacher'}${view.confirmed_at ? `, ${new Date(view.confirmed_at).toLocaleDateString()}` : ''}`
    : independent ? 'Brains Heist feedback — an estimate, not an official IELTS result' : 'AI practice feedback — your teacher may adjust it';
  const estimateLabel = independent ? 'Brains Heist practice estimate' : 'AI practice indication';
  const fields = view?.fields;

  return (
    <section aria-labelledby="practice-ai-feedback" className={`pf-panel pf-panel--${skill}`} data-audience={independent ? 'independent' : 'school'}>
      <header className="pf-head">
        <span className="pf-spark" aria-hidden="true">{skill === 'speaking' ? '🎙️' : '✍️'}</span>
        <div>
          <p className="pf-eyebrow">{skill === 'speaking' ? 'Speaking practice' : 'Writing practice'} · feedback</p>
          <h2 id="practice-ai-feedback">{title}</h2>
        </div>
      </header>

      {!ready && (
        <div className="pf-intro">
          {busy ? (
            <div className="pf-working" role="status">
              <span className="pf-wave" aria-hidden="true">{Array.from({ length: 7 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</span>
              <span>{skill === 'speaking' ? 'Listening to your recording…' : 'Reading your writing…'} This takes up to a minute.</span>
            </div>
          ) : (
            <>
              <p>
                {skill === 'speaking'
                  ? 'Get feedback on fluency, vocabulary, grammar and pronunciation from your actual recording: what worked, what to fix and one thing to practise for each.'
                  : 'Get fast feedback on this response: what worked, what to fix and one action for each criterion.'}
                {' '}It is practice feedback, not an official IELTS result.
              </p>
              <button type="button" className="pf-cta" disabled={busy} onClick={() => void request()}>
                {view?.status === 'failed' ? 'Try feedback again' : independent ? 'Get my feedback' : 'Get AI feedback now'}
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="pf-error">{error}</p>}

      {ready && fields && (
        <>
          {skill === 'speaking' && fields.transcript && (
            <div className="pf-transcript">
              <button type="button" className="pf-link" aria-expanded={showTranscript} onClick={() => setShowTranscript(v => !v)}>
                {showTranscript ? 'Hide' : 'Show'} what we heard
              </button>
              {showTranscript && <blockquote>{fields.transcript}</blockquote>}
            </div>
          )}
          <div className="pf-criteria">
            {Object.entries(fields.criteria).map(([key, c], index) => (
              <article key={key} className="pf-card" style={{ ['--n' as string]: index } as React.CSSProperties}>
                <div className="pf-card-head">
                  <h3>{criterionLabel[key] ?? key}</h3>
                  {c.indication ? (
                    <span className="pf-estimate">
                      <span className="pf-sr">{estimateLabel}: about {c.indication.low.toFixed(1)}–{c.indication.high.toFixed(1)}</span>
                      <small aria-hidden="true">{independent ? 'Estimate' : 'AI indication'}</small>
                      <b aria-hidden="true">{c.indication.low.toFixed(1)}–{c.indication.high.toFixed(1)}</b>
                    </span>
                  ) : (
                    <span className="pf-chip pf-chip--muted">{key === 'pronunciation' && fields.pronunciation_assessed === false ? 'Pronunciation was not assessed' : 'Not enough to judge'}</span>
                  )}
                </div>
                {c.indication && <RangeBar low={c.indication.low} high={c.indication.high} />}
                <p className="pf-comment">{c.comment}</p>
                {c.evidence.length > 0 && (
                  <ul className="pf-quotes" aria-label="From your response">
                    {c.evidence.map((e, i) => <li key={i}><mark>“{e.quote}”</mark></li>)}
                  </ul>
                )}
                <p className="pf-action"><strong>Try this</strong> {c.action}</p>
              </article>
            ))}
          </div>
          <div className="pf-next">
            <span aria-hidden="true">🧭</span>
            <p><strong>{skill === 'speaking' ? 'Next time' : 'Next draft'}:</strong> {fields.next_step}</p>
          </div>
          {view?.teacher_note && <p className="pf-note"><strong>Teacher note:</strong> {view.teacher_note}</p>}
          <p className="pf-fine">
            Estimates are ranges for each criterion, not an overall band and not an official IELTS result.
            {independent ? ' This feedback is for practice only and is never used as a score.' : ''} Trying again is encouraged; new attempts count as practice.
          </p>
          {mode === 'teacher' && !view?.confirmed && view && (
            <div className="pf-teacher">
              <label>Note to the student (optional)<textarea value={note} maxLength={1200} onChange={e => setNote(e.target.value)} /></label>
              <button type="button" className="pf-cta" disabled={busy} onClick={() => void run(() => (skill === 'speaking' ? confirmSpeakingPracticeFeedback : confirmPracticeFeedback)(view.id, note))}>{busy ? 'Saving…' : 'Confirm this AI feedback'}</button>
              <p className="pf-fine">Confirming shows the student it was checked. Use your own review below to change ratings or comments.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
