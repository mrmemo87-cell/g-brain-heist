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
  type SpeakingHighlight,
  type WritingHighlight,
} from '../../../services/ieltsPracticeFeedback';
import { useIeltsAudience, type IeltsAudience } from '../../lib/ieltsAudience';
import '../../styles/ielts-feedback.css';
import { IeltsWorkingGlyph } from './IeltsMotion';
import SpeakingTranscript from './SpeakingTranscript';
import WritingEssayHighlights from './WritingEssayHighlights';

/**
 * Practice feedback on Writing and Speaking (Diagnostic Bible 2.4.0 sections 10.5-10.9; Visual & UX Bible 13.3, 13.6,
 * 13.9, 13.10). Writing adds the colour-highlighted essay with corrections and the AI estimated task band, which the
 * teacher confirms or changes when finalizing the review.
 * School learners see "AI practice feedback — your teacher may adjust it"; self-paced learners see
 * "Brains Heist feedback — an estimate, not an official IELTS result". Never an overall band.
 */
type Props = {
  attemptId: string;
  mode: 'student' | 'teacher';
  skill?: 'writing' | 'speaking';
  /** Speaking only: returns the learner's original practice recording (the teacher view passes the student's). */
  loadRecording?: () => Promise<Blob>;
  /** Start feedback as soon as the panel loads, if none exists yet (Speaking needs loadRecording). */
  autoStart?: boolean;
  /** Called after feedback is generated or confirmed, so a host page can refresh its own copy. */
  onFeedback?: (view: PracticeFeedbackView) => void;
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

export default function IeltsPracticeAiFeedback({ attemptId, mode, skill = 'writing', loadRecording, onFeedback, autoStart = false, audience: forced }: Props) {
  const detected = useIeltsAudience();
  const audience = forced ?? detected;
  const independent = mode === 'student' && audience === 'independent';
  const [view, setView] = useState<PracticeFeedbackView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [showEssay, setShowEssay] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    const read = skill === 'speaking' ? speakingPracticeFeedback : practiceFeedback;
    read(attemptId).then(v => { if (alive) { setView(v); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [attemptId, skill]);

  const run = async (f: () => Promise<PracticeFeedbackView>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const next = await f(); setView(next); onFeedback?.(next); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  const request = () => run(() => (skill === 'speaking'
    ? requestSpeakingPracticeFeedback(attemptId, loadRecording ?? (() => Promise.reject(new Error('recording_unavailable'))), { asTeacher: mode === 'teacher' })
    : requestPracticeFeedback(attemptId, { asTeacher: mode === 'teacher' })));

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !loaded || (skill === 'speaking' && !loadRecording)) return;
    if (view) return; // already working, ready, or failed (a failure waits for the learner's own retry)
    autoStarted.current = true;
    void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, loaded, view, skill]);
  // Writing feedback made before highlights existed: a school teacher can upgrade it in place (Bible 10.9).
  const writingUpgradable = skill === 'writing' && mode === 'teacher' && view?.status === 'ready' && !!view.fields && view.fields.highlights === undefined;

  if (!loaded || (mode === 'student' && !audience)) return null;
  const ready = view?.status === 'ready' && view.fields;
  // A teacher may run feedback when the student never did, so every reviewed essay and recording gets highlights.
  if (!ready && mode === 'teacher' && skill === 'speaking' && !loadRecording) return null;
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
              <IeltsWorkingGlyph variant={skill === 'speaking' ? 'speaking' : 'writing'} />
              <span>{skill === 'speaking' ? 'Listening to your recording…' : 'Reading your writing…'} This takes up to a minute.</span>
            </div>
          ) : (
            <>
              <p>
                {mode === 'teacher'
                  ? skill === 'speaking'
                    ? 'This recording has not been transcribed yet. Run the AI check to get the transcript with colour highlights, pronunciation corrections and a practice range for each criterion.'
                    : 'This essay has no AI check yet. Run it to get the essay with colour highlights and corrections, a practice range for each criterion and an estimated band for you to confirm.'
                  : skill === 'speaking'
                  ? 'Get feedback on fluency, vocabulary, grammar and pronunciation from your actual recording: what worked, what to fix and one thing to practise for each.'
                  : 'Get fast feedback on this response: your essay with colour highlights and corrections, an estimated band, and one action for each criterion.'}
                {' '}It is practice feedback, not an official IELTS result.
              </p>
              <button type="button" className="pf-cta" disabled={busy} onClick={() => void request()}>
                {view?.status === 'failed' ? 'Try feedback again' : mode === 'teacher' ? (skill === 'speaking' ? 'Transcribe and run AI check' : 'Run AI check') : independent ? 'Get my feedback' : 'Get AI feedback now'}
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="pf-error">{error}</p>}

      {ready && fields && (
        <>
          {skill === 'speaking' && typeof fields.transcript === 'string' && (
            mode === 'teacher' ? (
              <div className="pf-transcript pf-transcript--open">
                {fields.highlights === undefined && loadRecording ? (
                  <div className="pf-upgrade" role="note">
                    <p><strong>Older feedback.</strong> It was made before colour highlights and word-by-word pronunciation corrections were added.</p>
                    <button type="button" className="pf-cta" disabled={busy} onClick={() => void request()}>
                      {busy ? 'Upgrading…' : 'Upgrade with highlights and pronunciation'}
                    </button>
                  </div>
                ) : null}
                <SpeakingTranscript
                  title="Transcript with assessment highlights"
                  audience="teacher"
                  transcript={fields.transcript}
                  highlights={fields.highlights as SpeakingHighlight[] | undefined}
                  pronunciationWords={fields.pronunciation_words}
                  pronunciationAssessed={fields.pronunciation_assessed !== false}
                />
              </div>
            ) : (
              <div className="pf-transcript">
                <button type="button" className="pf-link" aria-expanded={showTranscript} onClick={() => setShowTranscript(v => !v)}>
                  {showTranscript ? 'Hide' : 'Show'} what we heard{fields.highlights ? ', with colour highlights' : ''}
                </button>
                {showTranscript && (
                  <SpeakingTranscript
                    transcript={fields.transcript}
                    highlights={fields.highlights as SpeakingHighlight[] | undefined}
                    pronunciationWords={fields.pronunciation_words}
                    pronunciationAssessed={fields.pronunciation_assessed !== false}
                  />
                )}
              </div>
            )
          )}
          {skill === 'writing' && (
            <WritingEstimate fields={fields} mode={mode} independent={independent} confirmed={!!view?.confirmed} />
          )}
          {skill === 'writing' && typeof fields.essay === 'string' && (
            mode === 'teacher' ? (
              <div className="pf-transcript pf-transcript--open">
                <WritingEssayHighlights
                  title="Essay with assessment highlights"
                  audience="teacher"
                  essay={fields.essay}
                  taskNumber={fields.task_number}
                  highlights={fields.highlights as WritingHighlight[] | undefined}
                />
              </div>
            ) : (
              <div className="pf-transcript">
                <button type="button" className="pf-link" aria-expanded={showEssay} onClick={() => setShowEssay(v => !v)}>
                  {showEssay ? 'Hide' : 'Show'} your essay with colour highlights and corrections
                </button>
                {showEssay && (
                  <WritingEssayHighlights essay={fields.essay} taskNumber={fields.task_number} highlights={fields.highlights as WritingHighlight[] | undefined} />
                )}
              </div>
            )
          )}
          {writingUpgradable && (
            <div className="pf-upgrade" role="note">
              <p><strong>Older feedback.</strong> It was made before colour highlights, corrections and the estimated band were added.</p>
              <button type="button" className="pf-cta" disabled={busy} onClick={() => void request()}>
                {busy ? 'Upgrading…' : 'Upgrade with highlights and estimated band'}
              </button>
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
            {skill === 'writing'
              ? 'The estimated band is for this one task only, worked out from the four criterion ranges. It is not a full Writing band and not an official IELTS result.'
              : 'Estimates are ranges for each criterion, not an overall band and not an official IELTS result.'}
            {independent ? ' This feedback is for practice only and is never used as a score.' : ''} Trying again is encouraged; new attempts count as practice.
          </p>
          {mode === 'teacher' && !view?.confirmed && view && (
            <div className="pf-teacher">
              <label>Note to the student (optional)<textarea value={note} maxLength={1200} onChange={e => setNote(e.target.value)} /></label>
              <button type="button" className="pf-cta" disabled={busy} onClick={() => void run(() => (skill === 'speaking' ? confirmSpeakingPracticeFeedback : confirmPracticeFeedback)(view.id, note))}>{busy ? 'Saving…' : 'Confirm this AI feedback'}</button>
              <p className="pf-fine">{skill === 'writing'
                ? 'Confirming shows the student the highlights and comments were checked. Confirm or change the estimated band in Your bands, then finalize.'
                : 'Confirming shows the student it was checked. Use your own review below to change ratings or comments.'}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const fmtBand = (n: number) => n.toFixed(1);

/** AI estimated band for this Writing task (Bible 10.9): computed on the server from the four criterion ranges. */
function WritingEstimate({ fields, mode, independent, confirmed }: { fields: NonNullable<PracticeFeedbackView['fields']>; mode: 'student' | 'teacher'; independent: boolean; confirmed: boolean }) {
  const e = fields.estimate;
  const task = fields.task_number === 1 ? 'Task 1' : 'Task 2';
  if (fields.estimate === undefined) return null; // made before estimated bands existed
  return (
    <div className="pf-band" role="group" aria-label={`Estimated ${task} band`}>
      <div className="pf-band-main">
        <p className="pf-band-label">{independent ? 'Brains Heist estimate' : 'AI estimated band'} · {task}</p>
        {e ? (
          <>
            <p className="pf-band-num"><span className="pf-sr">Estimated band about </span>{fmtBand(e.band)}</p>
            <p className="pf-band-range">Likely range {fmtBand(e.low)}–{fmtBand(e.high)}</p>
          </>
        ) : <p className="pf-band-none">Not enough writing to estimate a band yet.</p>}
      </div>
      <div className="pf-band-meta">
        <span className={`pf-band-chip${confirmed ? ' pf-band-chip--ok' : ''}`}>
          {mode === 'teacher'
            ? 'Suggestion only · you confirm or change it in Your bands'
            : independent ? 'An estimate, not an official IELTS result'
            : confirmed ? 'Feedback checked by your teacher' : 'Waiting for your teacher to confirm'}
        </span>
        <span className="pf-band-chip pf-band-chip--quiet">Not an official IELTS result</span>
      </div>
    </div>
  );
}
