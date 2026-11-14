import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyseSpeakingSession,
  speakingExtras,
  type SpeakingSessionExtras,
} from '../../../services/ieltsSpeakingPilotService';
import type { SpeakingSession } from '../../../services/ieltsSpeakingPilot';
import SpeakingTranscript from './SpeakingTranscript';
import { CRITERION_BANDS } from './SpeakingBandsPanel';
import '../../styles/ielts-review-result.css';

/**
 * Speaking interview transcripts and the shared result (Diagnostic Bible 2.3.0 sections 10.7 and 10.8; Visual & UX
 * Bible 1.9.0 section 13.9). Teachers see every part's colour-highlighted transcript and pronunciation corrections as
 * step 1 of the guided review; bands are set in step 3 and shared with the feedback. Students see the Teacher Speaking
 * band, Part and criterion bands and collapsible transcripts once their teacher has shared.
 */
type Props = { session: SpeakingSession; onExtras?: (extras: SpeakingSessionExtras) => void };
const PARTS = [1, 2, 3] as const;
const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(1) : '—');

export default function SpeakingInterviewInsights({ session, onExtras }: Props) {
  const teacher = session.can_review;
  const [extras, setExtrasState] = useState<SpeakingSessionExtras | null>(null);
  const [error, setError] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const autoRan = useRef(false);
  const reviewKey = session.review?.id ?? '';
  const notify = useRef(onExtras);
  notify.current = onExtras;
  const setExtras = useCallback((next: SpeakingSessionExtras) => { setExtrasState(next); notify.current?.(next); }, []);

  const load = useCallback(async () => {
    try {
      setExtras(await speakingExtras(session.id));
    } catch {
      setError('Transcripts could not load. Check your connection and try again.');
    }
  }, [session.id, setExtras]);

  const analyse = useCallback(async () => {
    if (analysing) return;
    setAnalysing(true); setError('');
    try { setExtras(await analyseSpeakingSession(session.id)); }
    catch (e) { setError((e as Error).message); }
    finally { setAnalysing(false); }
  }, [analysing, session.id, setExtras]);

  useEffect(() => { void load(); }, [load, reviewKey]);
  useEffect(() => {
    if (!teacher || autoRan.current || !extras || session.status !== 'submitted' || !extras.missing_clips) return;
    autoRan.current = true;
    void analyse();
  }, [teacher, extras, session.status, analyse]);

  if (session.status !== 'submitted') return null;
  if (!teacher && !extras?.analysis.length && !extras?.part_bands) return null;

  const partTitle = (part: number) => session.package.parts.find(p => p.part === part)?.title ?? '';
  const clipsFor = (part: number) => (extras?.analysis ?? []).filter(a => a.part === part);

  const transcripts = (collapsible: boolean) => PARTS.map(part => {
    const clips = clipsFor(part);
    if (!clips.length) return null;
    const body = clips.map((a, i) => (
      <SpeakingTranscript
        key={a.clip_id}
        title={clips.length > 1 ? `Recording ${i + 1}` : undefined}
        audience={teacher ? 'teacher' : 'student'}
        transcript={a.transcript}
        highlights={a.highlights}
        pronunciationWords={a.pronunciation?.words}
        teacherLines={a.speaker_turns?.teacher ?? []}
        pronunciationAssessed={a.pronunciation?.assessed !== false}
      />
    ));
    return collapsible ? (
      <details key={part} className="rr-transcript">
        <summary>
          <span className="rr-summary-icon" aria-hidden="true">🎙️</span>
          <span><strong>Part {part} · {partTitle(part)}</strong><small>Your transcript with colour highlights and pronunciation help</small></span>
          <span className="rr-summary-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="rr-transcript-body">{body}</div>
      </details>
    ) : (
      <section key={part} className="sp-insight-part">
        <header className="sp-insight-head">
          <h3>Part {part} · {partTitle(part)}</h3>
<span className="sp-pill">{clips.length > 1 ? `${clips.length} recordings` : '1 recording'}</span>
        </header>
        {body}
      </section>
    );
  });

  if (teacher) {
    return (
      <section className="sp-card sp-insights" aria-labelledby="sp-insights-title">
        <span className="sp-eyebrow">Step 1 · Listen and read</span>
        <h2 id="sp-insights-title">What the student said, part by part</h2>
        <p>Colours show the criterion each phrase relates to. Grey lines are your questions. Pronunciation words come from an AI that listened to the audio; check them against the recording.</p>
        {analysing && <div className="sp-loading" role="status">Transcribing and listening to each part… this can take up to two minutes. You can start reading the AI feedback below meanwhile.</div>}
        {error && <p role="alert" className="sp-alert">{error}</p>}
        {!analysing && extras && extras.missing_clips ? (
          <button type="button" className="sp-secondary" onClick={() => void analyse()}>Prepare the missing transcripts</button>
        ) : null}
        {transcripts(false)}
      </section>
    );
  }

  const pb = extras?.part_bands;
  return (
    <div className="rr-speaking sp-insights-student">
      {pb && pb.overall !== null && pb.overall !== undefined ? (
        <section className="rr-hero" aria-labelledby="sp-speaking-band">
          <div className="rr-hero-glow" aria-hidden="true" />
          <p className="rr-eyebrow">IELTS Speaking interview · Parts 1–3 · teacher-checked</p>
          <div className="rr-hero-row">
            <div>
              <p className="rr-band-label" id="sp-speaking-band">Teacher Speaking band</p>
              <p className="rr-band">{fmt(pb.overall)}</p>
            </div>
            <div className="rr-hero-meta">
              <span className="rr-chip">Checked by {pb.teacher_name ?? 'your teacher'} · {new Date(pb.created_at).toLocaleDateString()}</span>
              <span className="rr-chip rr-chip--quiet">Not an official IELTS result</span>
              <span className="rr-chip rr-chip--quiet">Confidence: low</span>
            </div>
          </div>
          <div className="rr-part-bands">
            {PARTS.map(part => (
              <div key={part} className="rr-part">
                <span>Part {part}</span>
                <b>{fmt(pb[`part_${part}` as 'part_1'])}</b>
                <small>{partTitle(part)}</small>
              </div>
            ))}
          </div>
          <p className="rr-hero-note">Your teacher listened to all three parts and chose this band. It is a practice result for this interview, not an IELTS Test Report Form.</p>
        </section>
      ) : null}
      {pb && pb.overall !== null && pb.overall !== undefined && CRITERION_BANDS.every(c => pb[c.key as 'pronunciation'] !== null) ? (
        <section className="rr-criteria" aria-label="Band for each criterion">
          {CRITERION_BANDS.map((c, i) => {
            const v = pb[c.key as 'pronunciation'] as number;
            return (
              <article key={c.key} className={`rr-crit rr-tone-${c.tone}`} style={{ ['--i' as string]: i } as React.CSSProperties}>
                <span className="rr-crit-tag" aria-hidden="true">{c.short}</span>
                <h3>{c.label}</h3>
                <p className="rr-crit-band">{fmt(v)}</p>
                <div className="rr-meter" aria-hidden="true"><span style={{ width: `${(v / 9) * 100}%` }} /></div>
              </article>
            );
          })}
        </section>
      ) : null}
      {pb && (pb.overall === null || pb.overall === undefined) ? (
        <section className="rr-hero" aria-labelledby="sp-part-bands">
          <div className="rr-hero-glow" aria-hidden="true" />
          <p className="rr-eyebrow">IELTS Speaking interview · teacher-checked</p>
          <h2 id="sp-part-bands" className="rr-band-label">Your band for each part</h2>
          <div className="rr-part-bands">
            {PARTS.map(part => (
              <div key={part} className="rr-part">
                <span>Part {part}</span>
                <b>{fmt(pb[`part_${part}` as 'part_1'])}</b>
                <small>{partTitle(part)}</small>
              </div>
            ))}
          </div>
          <div className="rr-hero-meta rr-hero-meta--row">
            <span className="rr-chip">Checked by {pb.teacher_name ?? 'your teacher'} · {new Date(pb.created_at).toLocaleDateString()}</span>
            <span className="rr-chip rr-chip--quiet">Not an official IELTS result</span>
          </div>
          <p className="rr-hero-note">Each band is your teacher's judgment for that part of this interview. It is not a full IELTS Speaking band.</p>
        </section>
      ) : null}
      {transcripts(true)}
    </div>
  );
}
