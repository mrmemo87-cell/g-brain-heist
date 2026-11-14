import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyseSpeakingSession,
  setSpeakingPartBands,
  speakingExtras,
  type SpeakingSessionExtras,
} from '../../../services/ieltsSpeakingPilotService';
import type { SpeakingSession } from '../../../services/ieltsSpeakingPilot';
import SpeakingTranscript from './SpeakingTranscript';
import '../../styles/ielts-review-result.css';

/**
 * Speaking interview transcripts and Part 1-3 bands (Diagnostic Bible 2.2.0 section 10.7; Visual & UX Bible 13.9).
 * Teachers see every part's colour-highlighted transcript and pronunciation corrections, and record a band for each
 * part after sharing feedback. Students see the bands and collapsible transcripts once their teacher has shared.
 */
type Props = { session: SpeakingSession };
const bandOptions = Array.from({ length: 19 }, (_, i) => i / 2);
const PARTS = [1, 2, 3] as const;
const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(1) : '—');

export default function SpeakingInterviewInsights({ session }: Props) {
  const teacher = session.can_review;
  const [extras, setExtras] = useState<SpeakingSessionExtras | null>(null);
  const [error, setError] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bands, setBands] = useState<Array<number | null>>([null, null, null]);
  const autoRan = useRef(false);
  const reviewed = Boolean(session.review);

  const load = useCallback(async () => {
    try {
      const next = await speakingExtras(session.id);
      setExtras(next);
      if (next.part_bands) setBands([next.part_bands.part_1, next.part_bands.part_2, next.part_bands.part_3]);
    } catch {
      setError('Transcripts could not load. Check your connection and try again.');
    }
  }, [session.id]);

  const analyse = useCallback(async () => {
    if (analysing) return;
    setAnalysing(true); setError('');
    try { setExtras(await analyseSpeakingSession(session.id)); }
    catch (e) { setError((e as Error).message); }
    finally { setAnalysing(false); }
  }, [analysing, session.id]);

  useEffect(() => { void load(); }, [load, reviewed]);
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
          <label className="sp-insight-band">
            Part {part} band
            <select
              value={bands[part - 1] ?? ''}
              disabled={!extras?.can_set_bands || saving}
              onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); setBands(b => b.map((x, i) => (i === part - 1 ? v : x))); setSaved(false); }}
            >
              <option value="">Choose</option>
              {bandOptions.map(b => <option key={b} value={b}>{b.toFixed(1)}</option>)}
            </select>
          </label>
        </header>
        {body}
      </section>
    );
  });

  if (teacher) {
    const ready = bands.every(b => b !== null);
    return (
      <section className="sp-card sp-insights" aria-labelledby="sp-insights-title">
        <span className="sp-eyebrow">Transcripts · highlights · pronunciation</span>
        <h2 id="sp-insights-title">What the student said, part by part</h2>
        <p>Colours show the criterion each phrase relates to. Pronunciation corrections come from an AI that listened to the audio; check them against the recording.</p>
        {analysing && <div className="sp-loading" role="status">Transcribing and listening to each part… this can take up to two minutes.</div>}
        {error && <p role="alert" className="sp-alert">{error}</p>}
        {!analysing && extras && extras.missing_clips ? (
          <button type="button" className="sp-secondary" onClick={() => void analyse()}>Refresh the transcripts and highlights</button>
        ) : null}
        {transcripts(false)}
        <div className="sp-insight-save">
          {!reviewed ? <p>Share your feedback first, then record a band for each part.</p> : null}
          {extras?.part_bands ? <p className="sp-pill">Saved: Part 1 {fmt(extras.part_bands.part_1)} · Part 2 {fmt(extras.part_bands.part_2)} · Part 3 {fmt(extras.part_bands.part_3)}</p> : null}
          <button
            type="button"
            className="sp-primary"
            disabled={!extras?.can_set_bands || !ready || saving}
            onClick={async () => {
              setSaving(true); setError('');
              try { setExtras(await setSpeakingPartBands(session.id, bands as [number, number, number])); setSaved(true); }
              catch (e) { setError((e as Error).message); }
              finally { setSaving(false); }
            }}
          >
            {saving ? 'Saving…' : extras?.part_bands ? 'Update Part bands' : 'Save Part bands and share with the student'}
          </button>
          {saved && <p role="status">Part bands saved. The student can see them now.</p>}
          <p className="sp-fine">Each band is your judgment for that part only. It is not an official IELTS result and is not averaged into an overall Speaking band.</p>
        </div>
      </section>
    );
  }

  const pb = extras?.part_bands;
  return (
    <div className="rr-speaking sp-insights-student">
      {pb ? (
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
