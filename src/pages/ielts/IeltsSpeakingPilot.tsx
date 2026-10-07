import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  speakingHome,
  speakingSession,
  speakingRpc,
  speakingAudio,
  speakingAi,
  type SpeakingHome,
} from "../../../services/ieltsSpeakingPilotService";
import {
  SPEAKING_CRITERIA,
  emptySpeakingFeedback,
  validateSpeakingFeedback,
  speakingTime,
  type SpeakingSession,
  type SpeakingFeedback,
  type SpeakingKey,
  type SpeakingClip,
} from "../../../services/ieltsSpeakingPilot";
import { SpeakingRecorder } from "../../components/ielts/SpeakingRecorder";
import "../../styles/ielts-speaking-pilot.css";
type Session = SpeakingSession & { source_hash: string; can_record: boolean };
function SoundMark() {
  return (
    <svg
      className="sp-sound-mark"
      viewBox="0 0 160 160"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="80" cy="80" r="67" stroke="currentColor" opacity=".16" />
      <circle cx="80" cy="80" r="51" stroke="currentColor" opacity=".28" />
      {[22, 42, 66, 88, 54, 32, 18].map((h, i) => (
        <path
          key={i}
          d={`M${38 + i * 14} ${80 - h / 2}v${h}`}
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
function Cue({ session }: { session: SpeakingSession }) {
  const card = session.package.parts.find((p) => p.part === 2)?.cue_card;
  return card ? (
    <article className="sp-cue">
      <span className="sp-eyebrow">Part 2 · Topic card</span>
      <h2>{card.topic}</h2>
      <p>You should say:</p>
      <ul>
        {card.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="sp-cue-explain">{card.explain}</p>
      <small>
        One minute to prepare. Speak for up to two minutes. You may make notes
        on paper.
      </small>
    </article>
  ) : null;
}
function ClipPlayer({ clip }: { clip: SpeakingClip }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const load = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setUrl(await speakingAudio(clip.path));
    } catch {
      setError("We could not open this clip. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="sp-clip">
      <div>
        <strong>
          Part {clip.part} · {speakingTime(clip.duration_seconds)}
        </strong>
        <span className="sp-pill">
          {clip.interrupted
            ? "Interrupted · review conditions"
            : "Saved recording"}
        </span>
      </div>
      {url ? (
        <audio
          ref={audio}
          controls
          src={url}
          preload="metadata"
          aria-label={`Part ${clip.part} recording`}
          onError={() => {
            setUrl("");
            setError("Playback expired or failed. Open the recording again.");
          }}
        />
      ) : (
        <button
          type="button"
          className="sp-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Opening…" : "Listen to recording"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export default function IeltsSpeakingPilot() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const [home, setHome] = useState<SpeakingHome | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [part, setPart] = useState(1),
    [question, setQuestion] = useState(0),
    [consent, setConsent] = useState(false),
    [approval, setApproval] = useState(false),
    [reviewNotes, setReviewNotes] = useState("");
  const [feedback, setFeedback] = useState<SpeakingFeedback>(
      emptySpeakingFeedback,
    ),
    [confirmed, setConfirmed] = useState(false),
    [dirty, setDirty] = useState(false),
    [aiId, setAiId] = useState<string | null>(null),
    [aiBusy, setAiBusy] = useState(false);
  const [active, setActive] = useState<SpeakingKey>("fluency_coherence"),
    [clipId, setClipId] = useState(""),
    [start, setStart] = useState("0"),
    [end, setEnd] = useState("10"),
    [now, setNow] = useState(Date.now()),
    [recordActive, setRecordActive] = useState(false);
  const actionLock = useRef(false),
    request = useRef<AbortController | null>(null),
    reviewId = useRef<string | null>(null),
    startId = useRef<string | null>(null),
    beforeAi = useRef<SpeakingFeedback | null>(null);
  useEffect(() => {
    let alive = true;
    request.current?.abort();
    request.current = null;
    setLoading(true);
    setSession(null);
    setHome(null);
    setError("");
    setDirty(false);
    setAiId(null);
    setConfirmed(false);
    setPart(1);
    setQuestion(0);
    setRecordActive(false);
    reviewId.current = null;
    beforeAi.current = null;
    (sessionId ? speakingSession(sessionId) : speakingHome())
      .then((value) => {
        if (!alive) return;
        if (sessionId) {
          const s = value as Session;
          setSession(s);
          setFeedback(s.review?.fields ?? emptySpeakingFeedback());
          setClipId(s.clips[0]?.id ?? "");
        } else setHome(value as SpeakingHome);
      })
      .catch(() => {
        if (alive)
          setError(
            "We could not open this Speaking workspace. Check your access and connection, then try again.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      request.current?.abort();
      request.current = null;
    };
  }, [sessionId, retry]);
  useEffect(() => {
    if (session?.status !== "in_progress" || !session.preparation_started_at) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [session?.status, session?.preparation_started_at]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const act = async (fn: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not confirm that step. Try again.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const edit = (
    key: SpeakingKey,
    patch: Partial<SpeakingFeedback["observations"][SpeakingKey]>,
  ) => {
    setFeedback((f) => ({
      ...f,
      observations: {
        ...f.observations,
        [key]: { ...f.observations[key], ...patch },
      },
    }));
    setConfirmed(false);
    setDirty(true);
    reviewId.current = null;
  };
  const draft = async () => {
    if (!session || request.current || busy) return;
    const source = session;
    const controller = new AbortController();
    request.current = controller;
    setAiBusy(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 100000);
    try {
      const d = await speakingAi(source.id, controller.signal);
      if (request.current !== controller) return;
      if (d.source_hash !== source.source_hash)
        throw new Error(
          "The recording changed. Reload the review before using AI.",
        );
      const f = validateSpeakingFeedback(d.fields, source.clips);
      beforeAi.current = structuredClone(feedback);
      setFeedback(f);
      setAiId(d.id);
      setConfirmed(false);
      setDirty(true);
      reviewId.current = null;
    } catch (reason) {
      if (request.current === controller)
        setError(
          reason instanceof Error
            ? reason.message
            : "AI could not finish. Your notes are unchanged.",
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setAiBusy(false);
      }
    }
  };
  const addEvidence = () => {
    try {
      const span = {
        clip_id: clipId,
        start_seconds: Number(start),
        end_seconds: Number(end),
      };
      const clip = session?.clips.find((c) => c.id === span.clip_id);
      if (
        !clip ||
        !start.trim() ||
        !end.trim() ||
        !Number.isFinite(span.start_seconds) ||
        !Number.isFinite(span.end_seconds) ||
        span.start_seconds < 0 ||
        span.end_seconds <= span.start_seconds ||
        span.end_seconds > clip.duration_seconds
      )
        throw new Error(
          "Choose a saved clip and a start/end time within its duration.",
        );
      edit(active, {
        evidence: [...feedback.observations[active].evidence, span].slice(-3),
      });
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const readiness = (() => {
    if (!session) return false;
    try {
      validateSpeakingFeedback(feedback, session.clips);
      return !(
        (session.incidents || session.clips.some((c) => c.interrupted)) &&
        feedback.delivery_comment.trim().length < 10
      );
    } catch {
      return false;
    }
  })();
  const header = (
    <header className="sp-hero">
      <div>
        <a className="sp-back" href="/ielts">
          ← IELTS dashboard
        </a>
        <span className="sp-eyebrow">Brains Heist · Speaking studio</span>
        <h1>
          {session?.status === "submitted"
            ? session.can_review
              ? "Listen. Notice. Guide."
              : session.review
                ? "Your voice. Your next step."
                : "Your interview is saved."
            : "A conversation that reveals your starting point."}
        </h1>
        <p>
          {session
            ? `${session.student_name} · ${session.evidence_kind === "same_form_practice" ? "Same-form practice" : "First sitting"} · Confidence: low`
            : "Three parts. A real conversation. Clear feedback from your teacher."}
        </p>
      </div>
      <SoundMark />
    </header>
  );
  return (
    <main className="sp-page">
      {header}
      {error && (
        <div className="sp-alert" role="alert">
          {error}
          <button
            className="sp-secondary"
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            disabled={busy || recordActive || aiBusy || dirty}
          >
            Check access again
          </button>
        </div>
      )}
      {loading ? (
        <section className="sp-card" role="status">
          Opening your Speaking workspace…
        </section>
      ) : home ? (
        home.available ? (
          <>
            <section className="sp-card sp-intro">
              <span className="sp-pill">
                {home.approved ? "Named-user pilot" : "Content review · draft"}
              </span>
              <h2>
                {home.can_teacher
                  ? `Your first interview with ${home.student_name}`
                  : "Your Speaking starting point"}
              </h2>
              <p>
                {home.can_teacher
                  ? "Conduct the interview in person. This device records both speakers. The student can open the topic card from their account."
                  : "Your teacher will guide the interview and record your answers. Your feedback will appear here after review."}
              </p>
              <div className="sp-three">
                {[
                  "1 · Familiar topics",
                  "2 · Your long turn",
                  "3 · Deeper discussion",
                ].map((t, i) => (
                  <div key={t}>
                    <span>{t}</span>
                    <strong>
                      {i === 1 ? "1 min to prepare" : "4–5 minutes"}
                    </strong>
                    <small>
                      {i === 1
                        ? "Then speak for up to 2 minutes"
                        : "Natural answers and follow-up questions"}
                    </small>
                  </div>
                ))}
              </div>
              {home.can_teacher && home.approved && (
                <>
                  <label className="sp-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    The student agrees to recording and understands that the
                    teacher may use AI to draft feedback.
                  </label>
                  <button
                    className="sp-primary"
                    disabled={busy || !consent}
                    onClick={() =>
                      void act(async () => {
                        startId.current ??= crypto.randomUUID();
                        const id = await speakingRpc<string>(
                          "rpc_ielts_start_speaking_pilot",
                          { p_session_id: startId.current, p_consent: true },
                        );
                        navigate(`/ielts/speaking-pilot/${id}`);
                      })
                    }
                  >
                    {busy
                      ? "Preparing…"
                      : home.sessions?.some((s) => s.status === "in_progress")
                        ? "Continue interview"
                        : "Start interview"}
                  </button>
                </>
              )}
              {!home.approved && !home.can_teacher && (
                <p>
                  The teacher is reviewing the interview questions before the
                  pilot begins.
                </p>
              )}
            </section>
            {home.can_teacher && home.package && (
              <details className="sp-card" open={!home.approved}>
                <summary>
                  Review the interview package · {home.package.version}
                </summary>
                <p>{home.package.rights}</p>
                <h3>Teacher guidance</h3>
                <ol>
                  {home.package.teacher_instructions.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                {home.package.parts.map((p) => (
                  <section key={p.part}>
                    <h3>
                      Part {p.part} · {p.title}
                    </h3>
                    {p.cue_card && (
                      <>
                        <p>
                          <strong>{p.cue_card.topic}</strong>
                        </p>
                        <ul>
                          {p.cue_card.points.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                        <p>{p.cue_card.explain}</p>
                      </>
                    )}
                    <ol>
                      {[...p.questions, ...(p.follow_ups ?? [])].map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                    <small>
                      Samples: {p.constructs.join(", ").replaceAll("_", " ")}
                    </small>
                  </section>
                ))}
                <h3>Assessment criteria</h3>
                {home.package.criteria.map((c) => (
                  <p key={c.key}>
                    <strong>{c.label}:</strong> {c.focus}
                  </p>
                ))}
                {!home.approved && home.can_approve && (
                  <fieldset disabled={busy}>
                    <legend>
                      Approve this exact version for Gulzada’s pilot
                    </legend>
                    <label className="sp-check">
                      <input
                        type="checkbox"
                        checked={approval}
                        onChange={(e) => setApproval(e.target.checked)}
                      />
                      I reviewed the instructions, task design, skill mapping,
                      timing and original-content rights.
                    </label>
                    <label>
                      Review note
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="What you checked and any conditions for this pilot"
                      />
                    </label>
                    <button
                      className="sp-primary"
                      disabled={!approval || reviewNotes.trim().length < 10}
                      onClick={() =>
                        void act(async () =>
                          setHome(
                            await speakingRpc<SpeakingHome>(
                              "rpc_ielts_approve_speaking_pilot",
                              {
                                p_content_hash: home.content_hash,
                                p_review_record: {
                                  editorial: true,
                                  task_design: true,
                                  taxonomy: true,
                                  difficulty_timing: true,
                                  rights: true,
                                  notes: reviewNotes,
                                },
                              },
                            ),
                          ),
                        )
                      }
                    >
                      Approve and enable Gulzada’s pilot
                    </button>
                    <p>
                      This enables only the named pilot. Public access remains
                      closed.
                    </p>
                  </fieldset>
                )}
              </details>
            )}
            {!!home.sessions?.length && (
              <section className="sp-card">
                <h2>Saved interviews</h2>
                {home.sessions.map((s) => (
                  <article className="sp-session-row" key={s.id}>
                    <div>
                      <strong>
                        {s.reviewed
                          ? "Teacher feedback ready"
                          : s.status === "submitted"
                            ? "Awaiting teacher review"
                            : "Interview in progress"}
                      </strong>
                      <p>
                        {new Date(s.created_at).toLocaleDateString()} ·{" "}
                        {s.evidence_kind === "same_form_practice"
                          ? "Same-form practice"
                          : "First sitting"}
                      </p>
                    </div>
                    <button
                      className="sp-secondary"
                      onClick={() => navigate(`/ielts/speaking-pilot/${s.id}`)}
                    >
                      Open interview →
                    </button>
                  </article>
                ))}
              </section>
            )}
          </>
        ) : (
          <section className="sp-card">
            <h2>Speaking pilot is not available for this account yet.</h2>
            <p>
              Continue with your available IELTS practice from the dashboard.
            </p>
          </section>
        )
      ) : session ? (
        <>
          {session.status === "in_progress" && session.can_record ? (
            <>
              <nav className="sp-steps" aria-label="Interview parts">
                {session.package.parts.map((p) => (
                  <button
                    key={p.part}
                    aria-current={part === p.part ? "step" : undefined}
                    className={part === p.part ? "is-active" : ""}
                    disabled={
                      recordActive ||
                      busy ||
                      (p.part > 1 &&
                        !session.clips.some((c) => c.part === p.part - 1))
                    }
                    onClick={() => {
                      setPart(p.part);
                      setQuestion(0);
                    }}
                  >
                    <span>0{p.part}</span>
                    {p.title}
                    <small>
                      {session.clips.some((c) => c.part === p.part)
                        ? "Recording saved"
                        : "To record"}
                    </small>
                  </button>
                ))}
              </nav>
              <div className="sp-interview-grid">
                <section className="sp-card sp-question">
                  {part === 2 ? (
                    <>
                      <Cue session={session} />
                      <div className="sp-preparation">
                        <strong>
                          {session.preparation_started_at
                            ? speakingTime(
                                Math.max(
                                  0,
                                  60 -
                                    (now -
                                      Date.parse(
                                        session.preparation_started_at,
                                      )) /
                                      1000,
                                ),
                              )
                            : "1:00"}
                        </strong>
                        <p>
                          {session.preparation_started_at
                            ? "Preparation time remaining"
                            : "Give the student the topic card and paper for notes."}
                        </p>
                        {!session.preparation_started_at && (
                          <button
                            className="sp-primary"
                            disabled={busy || recordActive}
                            onClick={() =>
                              void act(async () =>
                                setSession(
                                  await speakingRpc<Session>(
                                    "rpc_ielts_speaking_prepare",
                                    { p_session_id: session.id },
                                  ),
                                ),
                              )
                            }
                          >
                            Start one-minute preparation
                          </button>
                        )}
                      </div>
                      <details>
                        <summary>
                          Brief follow-up questions after the long turn
                        </summary>
                        <ul>
                          {session.package.parts[1].follow_ups?.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                        <p>
                          Ask these aloud after stopping the two-minute
                          recording. Record a separate brief follow-up clip if
                          needed.
                        </p>
                      </details>
                    </>
                  ) : (
                    <>
                      <span className="sp-eyebrow">
                        Part {part} · Question {question + 1}
                      </span>
                      <h2>
                        {
                          session.package.parts.find((p) => p.part === part)
                            ?.questions[question]
                        }
                      </h2>
                      <p className="sp-coach">
                        Ask naturally, then listen. Use a neutral follow-up when
                        helpful. Move on without correcting the student.
                      </p>
                      <div className="sp-actions">
                        <button
                          className="sp-secondary"
                          disabled={question === 0}
                          onClick={() => setQuestion((q) => q - 1)}
                        >
                          Previous
                        </button>
                        <button
                          className="sp-primary"
                          disabled={
                            question >=
                            (session.package.parts.find((p) => p.part === part)
                              ?.questions.length ?? 0) -
                              1
                          }
                          onClick={() => setQuestion((q) => q + 1)}
                        >
                          Next question →
                        </button>
                      </div>
                    </>
                  )}
                  <details>
                    <summary>Interview guidance</summary>
                    <ul>
                      {session.package.teacher_instructions.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </details>
                </section>
                <aside className="sp-card">
                  <h2>Capture the conversation</h2>
                  <SpeakingRecorder
                    session={session}
                    part={part}
                    onSaved={(s) => setSession(s as Session)}
                    onActiveChange={setRecordActive}
                    enabled={
                      part !== 2 ||
                      (!!session.preparation_started_at &&
                        now - Date.parse(session.preparation_started_at) >=
                          60000)
                    }
                  />
                  <p className="sp-muted">
                    Record both voices. Microphone checks are discarded;
                    interview clips remain in the attempt.
                  </p>
                </aside>
              </div>
              <section className="sp-card">
                <h2>Saved evidence</h2>
                {session.clips.map((c) => (
                  <ClipPlayer key={c.id} clip={c} />
                ))}
                {session.clips.length === 0 && (
                  <p>
                    Your recordings will appear here after upload is confirmed.
                  </p>
                )}
                <button
                  className="sp-primary"
                  disabled={
                    busy ||
                    recordActive ||
                    ![1, 2, 3].every((p) =>
                      session.clips.some((c) => c.part === p),
                    )
                  }
                  onClick={() =>
                    void act(async () =>
                      setSession(
                        await speakingRpc<Session>(
                          "rpc_ielts_submit_speaking_pilot",
                          { p_session_id: session.id },
                        ),
                      ),
                    )
                  }
                >
                  Finish interview and open review
                </button>
                <p>
                  Short or interrupted answers are preserved as limited
                  evidence. Timing alone never becomes a language score.
                </p>
              </section>
            </>
          ) : session.status === "in_progress" ? (
            <section className="sp-card">
              <p>
                Your teacher is guiding and recording the interview. Open this
                topic card when your teacher tells you to.
              </p>
              <Cue session={session} />
              <button
                className="sp-secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                Check for saved feedback
              </button>
            </section>
          ) : (
            <>
              <section className="sp-card">
                <span className="sp-pill">
                  {session.review
                    ? "Teacher reviewed"
                    : "Awaiting teacher review"}{" "}
                  · Confidence: low
                </span>
                <h2>Your Speaking starting point</h2>
                <p>
                  This interview samples all three parts. It does not give a
                  Speaking or overall IELTS band. These observations refer to
                  this sitting.
                </p>
                {session.evidence_kind === "same_form_practice" && (
                  <p>
                    These questions were used before. This repeat is practice
                    and does not measure improvement.
                  </p>
                )}
                {(session.incidents > 0 ||
                  session.clips.some((c) => c.interrupted)) && (
                  <p className="sp-alert">
                    An interruption was recorded. Your teacher will consider the
                    conditions when reviewing.
                  </p>
                )}
              </section>
              <div className="sp-review-grid">
                <section className="sp-card">
                  <span className="sp-eyebrow">Original recordings</span>
                  <h2>Listen to the evidence</h2>
                  {session.clips.map((c) => (
                    <ClipPlayer key={c.id} clip={c} />
                  ))}
                  <details>
                    <summary>Questions and topic card</summary>
                    {session.package.parts.map((p) => (
                      <section key={p.part}>
                        <h3>Part {p.part}</h3>
                        <ul>
                          {p.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                    <Cue session={session} />
                  </details>
                </section>
                {session.can_review ? (
                  <section className="sp-card sp-review">
                    <div className="sp-ai" aria-busy={aiBusy}>
                      <span className="sp-eyebrow">
                        Your expertise. A little AI help.
                      </span>
                      <h2>Turn listening into a clear next step.</h2>
                      <p>
                        AI listens to the saved audio and drafts all four
                        criteria. Check the student’s voice, comments and
                        suggested time spans before sharing.
                      </p>
                      <button
                        className="sp-primary"
                        disabled={aiBusy || busy || !!aiId}
                        onClick={() => void draft()}
                      >
                        {aiBusy
                          ? "Listening and preparing your feedback…"
                          : "Draft feedback with AI"}
                      </button>
                      {aiBusy && (
                        <div className="sp-loading" role="status">
                          AI is listening to the interview. Your notes stay
                          unchanged until the complete draft is ready.
                        </div>
                      )}
                      {aiId && beforeAi.current && (
                        <button
                          className="sp-secondary"
                          disabled={busy}
                          onClick={() => {
                            setFeedback(beforeAi.current!);
                            beforeAi.current = null;
                            setAiId(null);
                            setConfirmed(false);
                            setDirty(true);
                          }}
                        >
                          Restore notes from before AI
                        </button>
                      )}
                    </div>
                    <fieldset disabled={busy || aiBusy}>
                      <legend className="sp-sr">Teacher review</legend>
                      <nav className="sp-criteria" aria-label="Review criteria">
                        {SPEAKING_CRITERIA.map((c) => (
                          <button
                            className={active === c.key ? "is-active" : ""}
                            key={c.key}
                            type="button"
                            onClick={() => {
                              setActive(c.key);
                              setError("");
                            }}
                            aria-pressed={active === c.key}
                          >
                            {c.label}
                            <small>
                              {feedback.observations[c.key].comment.trim()
                                .length >= 20 &&
                              (feedback.observations[c.key].status ===
                                "insufficient_evidence" ||
                                feedback.observations[c.key].evidence.length)
                                ? "Draft complete"
                                : "Needs input"}
                            </small>
                          </button>
                        ))}
                      </nav>
                      <h3>
                        {SPEAKING_CRITERIA.find((c) => c.key === active)?.label}
                      </h3>
                      <p>
                        {SPEAKING_CRITERIA.find((c) => c.key === active)?.focus}
                      </p>
                      <label>
                        Observation
                        <select
                          value={feedback.observations[active].status}
                          onChange={(e) =>
                            edit(active, {
                              status: e.target
                                .value as SpeakingFeedback["observations"][SpeakingKey]["status"],
                            })
                          }
                        >
                          <option value="insufficient_evidence">
                            Not enough evidence
                          </option>
                          <option value="observed">
                            Observed in this interview
                          </option>
                          <option value="developing">Practise next</option>
                        </select>
                      </label>
                      <label>
                        ★ Your feedback to the student
                        <textarea
                          value={feedback.observations[active].comment}
                          maxLength={900}
                          rows={5}
                          onChange={(e) =>
                            edit(active, { comment: e.target.value })
                          }
                          placeholder="What went well? What should the student try next? Use simple language."
                        />
                      </label>
                      <div className="sp-evidence">
                        <strong>Audio evidence</strong>
                        <p>
                          {feedback.observations[active].status ===
                          "insufficient_evidence"
                            ? "Optional when there is not enough evidence."
                            : "Attach at least one time span that supports your observation."}{" "}
                          Listen to the clip and check the suggested times.
                        </p>
                        {feedback.observations[active].evidence.map((e, i) => (
                          <div key={i} className="sp-span">
                            Part{" "}
                            {
                              session.clips.find((c) => c.id === e.clip_id)
                                ?.part
                            }{" "}
                            · {speakingTime(e.start_seconds)}–
                            {speakingTime(e.end_seconds)}
                            <button
                              type="button"
                              onClick={() =>
                                edit(active, {
                                  evidence: feedback.observations[
                                    active
                                  ].evidence.filter((_, n) => n !== i),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <label>
                          Recording
                          <select
                            value={clipId}
                            onChange={(e) => setClipId(e.target.value)}
                          >
                            <option value="">Choose a clip</option>
                            {session.clips.map((c, i) => (
                              <option key={c.id} value={c.id}>
                                Part {c.part} · Clip {i + 1} ·{" "}
                                {speakingTime(c.duration_seconds)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="sp-time-inputs">
                          <label>
                            Start · seconds
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={start}
                              onChange={(e) => setStart(e.target.value)}
                            />
                          </label>
                          <label>
                            End · seconds
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={end}
                              onChange={(e) => setEnd(e.target.value)}
                            />
                          </label>
                          <button
                            className="sp-secondary"
                            type="button"
                            onClick={addEvidence}
                          >
                            Attach span
                          </button>
                        </div>
                      </div>
                      <label>
                        ★ Next practice step
                        <textarea
                          value={feedback.next_step}
                          maxLength={900}
                          onChange={(e) => {
                            setFeedback((f) => ({
                              ...f,
                              next_step: e.target.value,
                            }));
                            setConfirmed(false);
                            setDirty(true);
                            reviewId.current = null;
                          }}
                        />
                      </label>
                      <label>
                        ★ Note on interview conditions
                        <textarea
                          value={feedback.delivery_comment}
                          maxLength={900}
                          onChange={(e) => {
                            setFeedback((f) => ({
                              ...f,
                              delivery_comment: e.target.value,
                            }));
                            setConfirmed(false);
                            setDirty(true);
                            reviewId.current = null;
                          }}
                          placeholder="Required after an interruption. Explain the conditions without guessing their effect."
                        />
                      </label>
                      <label className="sp-check">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        I listened to the student, checked all four criteria and
                        supporting time spans, and approve this feedback for
                        sharing.
                      </label>
                      <button
                        className="sp-primary"
                        disabled={!readiness || !confirmed}
                        onClick={() =>
                          void act(async () => {
                            reviewId.current ??= crypto.randomUUID();
                            const s = await speakingRpc<Session>(
                              "rpc_ielts_share_speaking_review",
                              {
                                p_session_id: session.id,
                                p_review_id: reviewId.current,
                                p_expected_review_id:
                                  session.review?.id ?? null,
                                p_source_hash: session.source_hash,
                                p_fields: feedback,
                                p_confirmed: confirmed,
                                p_ai_draft_id: aiId,
                              },
                            );
                            setSession(s);
                            setDirty(false);
                            setConfirmed(false);
                          })
                        }
                      >
                        {busy
                          ? "Sharing…"
                          : session.review
                            ? "Share updated feedback"
                            : "Share feedback with student"}
                      </button>
                      {!readiness && (
                        <p>
                          Complete all four comments, attach evidence where
                          required, and add the next practice step before
                          sharing.
                        </p>
                      )}
                      {session.review && !dirty && (
                        <p role="status">
                          Your checked feedback is saved and available to the
                          student.
                        </p>
                      )}
                    </fieldset>
                  </section>
                ) : (
                  <section className="sp-card">
                    {session.review ? (
                      <>
                        <span className="sp-eyebrow">★ Teacher feedback</span>
                        <h2>Your next step starts here.</h2>
                        {SPEAKING_CRITERIA.map((c) => (
                          <article key={c.key} className="sp-student-note">
                            <h3>{c.label}</h3>
                            <span className="sp-pill">
                              {session.review!.fields.observations[c.key]
                                .status === "insufficient_evidence"
                                ? "More evidence needed"
                                : session.review!.fields.observations[c.key]
                                      .status === "developing"
                                  ? "Practise next"
                                  : "Observed in this interview"}
                            </span>
                            <p>
                              <strong>★ Your teacher says</strong>
                            </p>
                            <p>
                              {
                                session.review!.fields.observations[c.key]
                                  .comment
                              }
                            </p>
                          </article>
                        ))}
                        <article className="sp-student-note">
                          <h3>★ Your teacher’s next practice step</h3>
                          <p>{session.review.fields.next_step}</p>
                        </article>
                        {session.review.fields.delivery_comment && (
                          <article className="sp-student-note">
                            <h3>★ Your teacher’s note on conditions</h3>
                            <p>{session.review.fields.delivery_comment}</p>
                          </article>
                        )}
                      </>
                    ) : (
                      <>
                        <h2>Your teacher will review your interview.</h2>
                        <p>
                          Your recordings are saved. Come back here to read your
                          teacher’s feedback and next practice step.
                        </p>
                        <button
                          className="sp-secondary"
                          onClick={() => setRetry((n) => n + 1)}
                        >
                          Check for feedback
                        </button>
                      </>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </>
      ) : null}
      <footer className="sp-footer">
        Brains Heist development snapshot · Not an official IELTS result.
      </footer>
    </main>
  );
}
