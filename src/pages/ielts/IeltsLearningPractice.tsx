import IeltsMaterialProvenance from "../../components/ielts/IeltsMaterialProvenance";
import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  learningWorkspace,
  learningDetail,
  learningAudio,
  learningIncident,
  saveLearning,
  submitLearning,
  shareLearningReview,
  type LearningWorkspace,
  type LearningDetail,
  type LearningFeedback,
  type FeedbackKey,
  learningRecordingAudio,
  learningReviewContext,
  draftLearningFeedback,
  type LearningReviewContext,
} from "../../../services/ieltsLearningService";
import {
  restoreIeltsAudioCheckpoint,
  saveIeltsAudioCheckpoint,
} from "../../../services/ieltsAudioCheckpoint";
import LearningSpeakingRecorder from "../../components/ielts/LearningSpeakingRecorder";
import "../../styles/ielts-learning.css";
import IeltsSchoolLearnerLinks from "../../components/ielts/IeltsSchoolLearnerLinks";
import { IeltsTargetedTaskCards } from "../../components/ielts/IeltsTargetedPractice";
const criterionLabels: Record<string, string> = {
  task_response: "Answering and developing the task",
  coherence_cohesion: "Organising and linking ideas",
  lexical_resource: "Using words accurately",
  grammar_range_accuracy: "Using varied, accurate sentences",
  fluency_coherence: "Speaking clearly and connecting ideas",
  pronunciation: "Making your speech easy to understand",
};
function RecordingPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    learningRecordingAudio(path)
      .then((u) => active && setUrl(u))
      .catch(() => active && setError("The saved clip could not load."));
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <div>
      {url && (
        <audio
          controls
          preload="metadata"
          src={url}
          aria-label="Saved student response"
        />
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() =>
              void learningRecordingAudio(path)
                .then((u) => {
                  setUrl(u);
                  setError("");
                })
                .catch(() => setError("The saved clip could not load."))
            }
          >
            Reload saved clip
          </button>
        </p>
      )}
    </div>
  );
}
const feedbackLabels: Record<FeedbackKey, string> = {
  went_well: "What went well",
  work_on: "What to work on",
  practice: "How to practise",
  check_again: "How we will check again",
};
const blankFeedback: LearningFeedback = {
  went_well: "",
  work_on: "",
  practice: "",
  check_again: "",
};
export default function IeltsLearningPractice() {
  const navigate = useNavigate();
  const [teacherContext, setTeacherContext] = useState<LearningReviewContext | null>(null);
  const [contextError, setContextError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(true);
  const reviewToggle = useRef<HTMLButtonElement | null>(null);
  const [aiDraft, setAiDraft] = useState<string>();
  const [proposedDraft, setProposedDraft] = useState<{ id: string; fields: LearningFeedback } | null>(null);
  const teacherRoute = "/ielts?programmeSection=reviews" + (teacherContext ? "&school=" + encodeURIComponent(teacherContext.school_id) : "");
  const loadTeacherContext = async (id: string) => {
    setContextError("");
    try { const c = await learningReviewContext(id); if (current.current?.id === id) setTeacherContext(c); }
    catch { if (current.current?.id === id) setContextError("The answer key and source evidence could not load. Saved work is safe. Try loading them again."); }
  };
  const { allocationId } = useParams<{ allocationId: string }>();
  const [workspace, setWorkspace] = useState<LearningWorkspace | null>(null),
    [detail, setDetail] = useState<LearningDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState("Loading your practice…"),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<LearningFeedback>(blankFeedback),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0);
  const [recordingActive, setRecordingActive] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null),
    current = useRef<LearningDetail | null>(null),
    draft = useRef(answers),
    saved = useRef("{}"),
    saving = useRef(false),
    changed = useRef(false);
  const checkpointReady = useRef(false),
    checkpointSavedAt = useRef(0);
  const reviewRequest = useRef(crypto.randomUUID());
  const key = detail ? `bh_learning_${detail.student_id}_${detail.id}` : "";
  const positionKey = key + "_audio_" + (detail?.audio_sha256 ?? "");
  const persistLocal = (value: Record<string, string>) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  useEffect(() => {
    let active = true;
    setTeacherContext(null);
    setContextError("");
    setAiBusy(false);
    setReviewOpen(true);
    setAiDraft(undefined);
    setProposedDraft(null);
    setDetail(null);
    setWorkspace(null);
    setError("");
    setMessage("Loading your practice…");
    setUrl("");
    setPending(null);
    setPosition(0);
    setRecordingActive(false);
    checkpointReady.current = false;
    setPlaying(false);
    current.current = null;
    changed.current = false;
    if (!allocationId) {
      learningWorkspace()
        .then((w) => {
          if (active) {
            setWorkspace(w);
            setMessage("");
          }
        })
        .catch(
          () =>
            active &&
            setError("We could not load your practice. Please try again."),
        );
      return () => {
        active = false;
      };
    }
    learningDetail(allocationId)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        current.current = d;
        if (d.manager) void loadTeacherContext(d.id);
        setAnswers(d.answers);
        draft.current = d.answers;
        saved.current = JSON.stringify(d.answers);
        setMessage("Your saved work is ready.");
        setFeedback(d.review?.fields ?? blankFeedback);
        setReviewOpen(!d.review);
        if (!d.result) {
          try {
            const raw = localStorage.getItem(
              `bh_learning_${d.student_id}_${d.id}`,
            );
            if (raw && raw !== JSON.stringify(d.answers))
              setPending(JSON.parse(raw));
          } catch {
            /* Server work remains available. */
          }
        }
        if ((d.skill ?? "listening") !== "listening") return;
        return learningAudio(d)
          .then((u) => active && setUrl(u))
          .catch(
            () =>
              active &&
              setError(
                "The recording could not load. Your saved answers are available. Use Reload recording.",
              ),
          );
      })
      .catch(
        () =>
          active &&
          setError(
            "We could not open this task. Check your access and try again.",
          ),
      );
    return () => {
      active = false;
      audio.current?.pause();
    };
  }, [allocationId]);
  const save = useCallback(async () => {
    const d = current.current;
    if (!d || d.manager || d.result || saving.current) return false;
    const snapshot = JSON.stringify(draft.current);
    if (snapshot === saved.current) return true;
    saving.current = true;
    setMessage("Saving…");
    try {
      const revision = await saveLearning(
        d.id,
        d.revision,
        JSON.parse(snapshot),
      );
      if (current.current?.id !== d.id) return false;
      current.current = { ...d, revision };
      saved.current = snapshot;
      setMessage(
        snapshot === JSON.stringify(draft.current)
          ? "All answers saved."
          : "Latest changes are waiting to save.",
      );
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Saving could not be confirmed. Keep this page open and retry.",
      );
      return false;
    } finally {
      saving.current = false;
    }
  }, []);
  useEffect(() => {
    if (!detail || detail.manager || detail.result) return;
    const timer = window.setInterval(
      () => {
        if (navigator.onLine) void save();
      },
      5000 + Math.random() * 2000,
    );
    return () => window.clearInterval(timer);
  }, [detail?.id, detail?.result, detail?.manager, save]);
  useEffect(() => {
    if (!detail || detail.manager || detail.result) return;
    const interrupt = () => {
      audio.current?.pause();
      if (document.visibilityState === "hidden" || !navigator.onLine) {
        void learningIncident(detail.id, "interruption").catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", interrupt);
    window.addEventListener("offline", interrupt);
    return () => {
      document.removeEventListener("visibilitychange", interrupt);
      window.removeEventListener("offline", interrupt);
    };
  }, [detail?.id, detail?.manager, detail?.result]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (changed.current && saved.current !== JSON.stringify(draft.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const update = (value: Record<string, string>) => {
    draft.current = value;
    changed.current = true;
    setAnswers(value);
    setMessage(
      persistLocal(value)
        ? "Changes saved on this device; waiting to sync."
        : "Keep this page open until saving is confirmed.",
    );
  };
  const play = async (restart = false) => {
    if (!detail || !audio.current) return;
    setError("");
    if (playing && !restart) {
      audio.current.pause();
      return;
    }
    try {
      // Start within the tap gesture, including Safari and offline cached playback.
      if (restart) audio.current.currentTime = 0;
      const started = audio.current.play();
      if (!detail.manager && !detail.result) {
        if (restart) void learningIncident(detail.id, "replay").catch(() => {});
        void learningIncident(detail.id, "play").catch(() => {});
      }
      await started;
    } catch {
      setError("Playback could not start. Your answers are safe. Try again.");
    }
  };
  const recordingSaved = useCallback((next: LearningDetail) => {
    if (current.current?.id !== next.id) return;
    current.current = { ...current.current, recordings: next.recordings };
    setDetail((d) =>
      d?.id === next.id ? { ...d, recordings: next.recordings } : d,
    );
    setMessage("Recording saved and checked. You can submit when ready.");
  }, []);
  const skill = detail?.skill ?? "listening";
  const disabled =
    !!detail?.manager ||
    !!detail?.result ||
    working ||
    !!pending ||
    detail?.status === "closed";
  const criteriaKeys =
    skill === "writing"
      ? [
          "task_response",
          "coherence_cohesion",
          "lexical_resource",
          "grammar_range_accuracy",
        ]
      : skill === "speaking"
        ? [
            "fluency_coherence",
            "lexical_resource",
            "grammar_range_accuracy",
            "pronunciation",
          ]
        : [];
  const submit = async () => {
    const d = current.current;
    if (!d || recordingActive || pending) return;
    setWorking(true);
    setError("");
    audio.current?.pause();
    try {
      if (!(await save())) return;
      const next = await submitLearning(d.id, current.current!.revision);
      setDetail(next);
      current.current = next;
      try {
        localStorage.removeItem(key);
      } catch {}
      setMessage("Your work is submitted. Your teacher can now review it.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission could not be confirmed. Retry safely.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <main className="il-shell">
      <header>
        <p className="il-eyebrow">BRAINS HEIST · PURPOSEFUL PRACTICE</p>
        <h1>{ieltsMaterialTitle(detail?.display_code, detail?.title ?? "Targeted Practice")}<IeltsMaterialProvenance label={detail?.originality_label}/></h1>
        <Link to={detail?.manager ? teacherRoute : "/ielts/journey"}>{detail?.manager ? "← Review desk" : "← IELTS Journey"}</Link>
        {detail?.manager && <p className="il-eyebrow">TEACHER REVIEW{teacherContext ? " · " + teacherContext.student_name : ""}</p>}
      </header>
      {!detail?.manager && <IeltsSchoolLearnerLinks onNavigate={navigate} active="targeted" />}
      {!allocationId && <p>Short tasks chosen by your teacher. Start a task, continue saved work or read your feedback.</p>}
      {error && (
        <p role="alert" className="il-alert">
          {error}
        </p>
      )}
      {workspace && <IeltsTargetedTaskCards tasks={workspace.allocations} />}
      {detail && (
        <>
          <section className="il-card">
            <p className="il-eyebrow">
              {detail.purpose === "guided_practice"
                ? "Guided practice"
                : "Fresh check · conditions recorded"}
            </p>
            <h2>Why this task?</h2>
            <p>{detail.reason}</p>
            <h3>{detail.manager ? "Practice goal" : "Your goal"}</h3>
            <p>{detail.success_description}</p>
            <p>{detail.instructions}</p>
            <p className="il-muted">
              This short task does not give an IELTS band or establish
              improvement by itself.
            </p>
            {detail.manager ? (
              <>
                {contextError && <p role="alert">{contextError} <button onClick={() => void loadTeacherContext(detail.id)}>Reload review evidence</button></p>}
                {teacherContext ? <>
                  <details className="il-preview">
                    <summary>Answer key and teaching notes</summary>
                    {teacherContext.questions.filter(q => q.accepted_answers?.length).map((q, i) => <p key={q.id}><strong>{i + 1}. {q.prompt}</strong><br />{q.accepted_answers!.join(" / ")}</p>)}
                    {teacherContext.teacher_notes && <p className="il-key-notes">{teacherContext.teacher_notes}</p>}
                  </details>
                  {(skill === "listening" || skill === "reading") ? <details className="il-preview">
                    <summary>View original screener evidence</summary>
                    {teacherContext.source ? <>
                      <p>{teacherContext.source.score} / {teacherContext.source.total} · Confidence: low</p>
                      <p>These are the original screener answers. This practice is a separate task. Neither result alone establishes improvement.</p>
                      {teacherContext.source.integrity_state !== "clear" && <p>Check the original assessment conditions before drawing conclusions.</p>}
                      {teacherContext.source.items.map((item, i) => <article key={item.id} className="il-source-item">
                        <h3>{i + 1}. {item.prompt}</h3>
                        <p><strong>Student answer:</strong> {item.response || "No answer saved"}</p>
                        <p><strong>Accepted answer:</strong> {item.accepted_answers.join(" / ")}</p>
                        <p>{item.response_state === "answered" ? item.correct ? "Correct" : "Incorrect" : "No valid answer"} · {item.construct}</p>
                      </article>)}
                    </> : <p>The original screener evidence is unavailable for review. Check the student’s record in the review desk.</p>}
                  </details> : <Link to={skill === "writing" ? "/ielts/writing-screener/reviews/" + detail.source_attempt_id : detail.source_route}>Review original {skill} evidence →</Link>}
                </> : !contextError && <p role="status">Loading teacher key and source evidence…</p>}
              </>
            ) : <Link to={detail.source_route ?? "/ielts/screener-result/" + detail.source_attempt_id}>View the source evidence</Link>}
          </section>
          <section className="il-card">
            <h2>
              {skill === "listening"
                ? "Listen and respond"
                : skill === "reading"
                  ? "Read and explain"
                  : "Your response"}
            </h2>
            {skill === "listening" && (
              <>
                <p>
                  The recording includes 30 seconds to read and 15 seconds to
                  finish.
                </p>
                {url && (
                  <audio
                    ref={audio}
                    src={url}
                    preload="metadata"
                    onLoadedMetadata={() => {
                      if (audio.current) {
                        checkpointReady.current = restoreIeltsAudioCheckpoint(
                          audio.current,
                          positionKey,
                        );
                        if (checkpointReady.current)
                          setPosition(audio.current.currentTime);
                      }
                    }}
                    onCanPlay={() => {
                      if (audio.current && !checkpointReady.current) {
                        checkpointReady.current = restoreIeltsAudioCheckpoint(
                          audio.current,
                          positionKey,
                        );
                        if (checkpointReady.current)
                          setPosition(audio.current.currentTime);
                      }
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => {
                      setPlaying(false);
                      if (checkpointReady.current && audio.current)
                        saveIeltsAudioCheckpoint(
                          positionKey,
                          audio.current.currentTime,
                        );
                    }}
                    onEnded={() => setPlaying(false)}
                    onTimeUpdate={() => {
                      if (!checkpointReady.current) return;
                      const p = audio.current?.currentTime ?? 0;
                      setPosition(p);
                      if (Date.now() - checkpointSavedAt.current >= 1000) {
                        saveIeltsAudioCheckpoint(positionKey, p);
                        checkpointSavedAt.current = Date.now();
                      }
                    }}
                    onError={() => {
                      setError(
                        "The recording was interrupted. Reload it, then resume.",
                      );
                      if (!detail.manager && !detail.result)
                        void learningIncident(detail.id, "audio_failure").catch(
                          () => {},
                        );
                    }}
                  />
                )}
                <div className="il-actions">
                  <button
                    disabled={!url || working || detail.status === "closed"}
                    onClick={() => void play()}
                  >
                    {playing
                      ? "Pause"
                      : position > 0
                        ? "Resume recording"
                        : "Play recording"}
                  </button>
                  {detail.purpose === "guided_practice" && (
                    <button
                      disabled={!url || working}
                      onClick={() => void play(true)}
                    >
                      Replay from start
                    </button>
                  )}
                  <button
                    onClick={() =>
                      void learningAudio(detail)
                        .then(setUrl)
                        .catch(() =>
                          setError(
                            "Recording is unavailable. Please try again.",
                          ),
                        )
                    }
                  >
                    Reload recording
                  </button>
                </div>
                <p className="il-muted">
                  Saved position: {Math.floor(position / 60)}:
                  {String(Math.floor(position % 60)).padStart(2, "0")} ·
                  playback resumes only when you choose.
                </p>
              </>
            )}
            {pending && !detail.manager && !detail.result && (
              <div className="il-alert">
                <p>This device has answers that differ from the server copy.</p>
                <button
                  onClick={() => {
                    update(pending);
                    setPending(null);
                  }}
                >
                  Use my device answers
                </button>
                <button
                  onClick={() => {
                    persistLocal(answers);
                    setPending(null);
                  }}
                >
                  Keep server answers
                </button>
              </div>
            )}
            {detail.content?.passage && (
              <article className="il-passage">
                <h3>The passage</h3>
                <p>{detail.content.passage}</p>
              </article>
            )}
            {detail.content?.prompt && <h3>{detail.content.prompt}</h3>}
            {detail.content?.scaffold && (
              <p className="il-support">
                Guided support: {detail.content.scaffold}
              </p>
            )}
            {skill === "listening" || skill === "reading" ? (
              detail.questions.map((q, i) => (
                <div key={q.id} className="il-answer">
                  <label>
                    {i + 1}. {q.prompt}
                    {skill === "reading" ? (
                      <select
                        value={answers[q.id] ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          update({ ...draft.current, [q.id]: e.target.value })
                        }
                      >
                        <option value="">Choose an answer</option>
                        {["TRUE", "FALSE", "NOT GIVEN"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        maxLength={120}
                        value={answers[q.id] ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          update({ ...draft.current, [q.id]: e.target.value })
                        }
                      />
                    )}
                  </label>
                  {skill === "reading" && (
                    <label>
                      Your evidence or the missing fact
                      <textarea
                        maxLength={1000}
                        value={answers["e" + (i + 1)] ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          update({
                            ...draft.current,
                            ["e" + (i + 1)]: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  {detail.result && (
                    <span>
                      {detail.result.outcomes.find((o) => o.id === q.id)
                        ?.correct
                        ? "Correct"
                        : "Review this answer"}{" "}
                      · Accepted:{" "}
                      {detail.result.outcomes
                        .find((o) => o.id === q.id)
                        ?.accepted_answers.join(" / ")}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <label className="il-answer">
                {skill === "writing"
                  ? "Your paragraph"
                  : "Preparation notes (optional)"}
                <textarea
                  className="il-response"
                  maxLength={12000}
                  value={answers.response ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    update({ ...draft.current, response: e.target.value })
                  }
                />
                {skill === "writing" && (
                  <span>
                    {
                      (answers.response ?? "")
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean).length
                    }{" "}
                    words · Aim for 80–120 words. This is a practice guide.
                  </span>
                )}
              </label>
            )}
            {skill === "speaking" && (
              <>
                <p>
                  Save your clip before submitting. Keep this tab open while
                  recording.
                </p>
                {!detail.manager &&
                  !detail.result &&
                  detail.status !== "closed" && (
                    <LearningSpeakingRecorder
                      detail={detail}
                      enabled={!disabled}
                      onSaved={recordingSaved}
                      onActiveChange={setRecordingActive}
                    />
                  )}{" "}
                {(detail.recordings ?? []).map((clip, i) => (
                  <article key={clip.id}>
                    <h3>
                      Saved clip {i + 1} · {Math.round(clip.duration_seconds)}{" "}
                      seconds
                    </h3>
                    {clip.interrupted && (
                      <p>
                        An interruption was recorded. Your teacher will consider
                        the conditions.
                      </p>
                    )}
                    <RecordingPlayer path={clip.path} />
                  </article>
                ))}
              </>
            )}
            {skill !== "listening" && (
              <label className="il-answer">
                Any help or interruption? (optional)
                <textarea
                  maxLength={1200}
                  value={answers.assistance ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    update({ ...draft.current, assistance: e.target.value })
                  }
                />
              </label>
            )}
            {detail.result && detail.content?.teacher_notes && (
              <details>
                <summary>Review the task explanation</summary>
                <p className="il-passage">{detail.content.teacher_notes}</p>
              </details>
            )}
            {!detail.manager &&
              !detail.result &&
              detail.status !== "closed" && (
                <div className="il-actions">
                  <button
                    disabled={
                      working ||
                      !!pending ||
                      recordingActive ||
                      (skill === "speaking" &&
                        !(detail.recordings ?? []).length)
                    }
                    onClick={() => void submit()}
                  >
                    {working ? "Submitting…" : "Submit for review"}
                  </button>
                  <button
                    disabled={working || !!pending}
                    onClick={() => void save()}
                  >
                    Save now
                  </button>
                </div>
              )}
            <p role="status">{message}</p>
          </section>
          {detail.result && (
            <section className="il-card">
              <h2>
                {detail.result.total === null
                  ? "Your response is saved"
                  : `Task result: ${detail.result.score} / ${detail.result.total}`}
              </h2>
              <p>
                Responses saved.{" "}
                {detail.review
                  ? "Your teacher’s feedback is ready."
                  : "Your teacher will review the details and choose the next step."}
              </p>
              {detail.conditions_need_review && (
                <p>
                  Delivery conditions need teacher review. This is not a
                  judgement about your ability.
                </p>
              )}
              {detail.manager && skill === "listening" && (
                <p>
                  Recorded playback starts: {detail.play_count}. Playback
                  metadata is a delivery observation, not proof of independence.
                </p>
              )}
            </section>
          )}
          {detail.review && !detail.manager && (
            <section className="il-card il-teacher">
              <p className="il-eyebrow">
                TEACHER FEEDBACK · {detail.review.reviewer}
              </p>
              {detail.review.fields.criteria &&
                Object.entries(detail.review.fields.criteria).map(
                  ([k, value]) => (
                    <div key={k}>
                      <h3>{criterionLabels[k] ?? k}</h3>
                      <p>{value}</p>
                    </div>
                  ),
                )}
              {(Object.keys(feedbackLabels) as FeedbackKey[]).map((k) => (
                <div key={k}>
                  <h3>{feedbackLabels[k]}</h3>
                  <p>{detail.review!.fields[k]}</p>
                </div>
              ))}
              <p className="il-muted">
                Shared {new Date(detail.review.reviewed_at).toLocaleString()}
              </p>
            </section>
          )}
          {detail.manager && detail.result && (
            <section className="il-card">
              <h2>{detail.review ? "Feedback shared" : "Review and share feedback"}</h2>
              {detail.review && (
                <>
                  <p className="il-muted">Shared by {detail.review.reviewer} · {new Date(detail.review.reviewed_at).toLocaleString()}</p>
                  <button ref={reviewToggle} aria-expanded={reviewOpen} aria-controls="learning-review-fields" onClick={() => setReviewOpen(open => !open)}>
                    {reviewOpen ? "Collapse feedback" : "View or edit feedback"}
                  </button>
                </>
              )}
              <div id="learning-review-fields" hidden={!reviewOpen}>
              {detail.review && <p className="il-muted">Changes stay private until you confirm and share again.</p>}
              <p>
                Use simple language and refer to the student’s actual answers. A
                fresh score alone does not establish improvement.
              </p>
              {(skill === "listening" || skill === "reading") && <div className="il-ai-help">
                <button disabled={working || aiBusy || !teacherContext || !!proposedDraft} aria-busy={aiBusy} onClick={async () => {
                  const id = detail.id;
                  setAiBusy(true); setError("");
                  try {
                    const proposal = await draftLearningFeedback(id);
                    if (current.current?.id !== id) return;
                    if (Object.values(feedback).some(v => typeof v === "string" && v.trim())) setProposedDraft(proposal);
                    else { setFeedback(proposal.fields); setAiDraft(proposal.id); reviewRequest.current = crypto.randomUUID(); setMessage("AI draft ready. Check and edit every field before sharing."); }
                  } catch (e) { if (current.current?.id === id) setError(e instanceof Error ? e.message : "AI help is unavailable. Your feedback is safe."); }
                  finally { if (current.current?.id === id) setAiBusy(false); }
                }}>{aiBusy ? "AI magic is being applied…" : "AI help · Draft all feedback"}</button>
                <p role="status">{aiBusy ? "Reading the saved answers and key. Your feedback will stay private until you confirm and share." : aiDraft ? "AI draft · Check the evidence, edit the wording and confirm before sharing." : "Fills all four feedback boxes using the saved answers and key. You check and edit before sharing."}</p>
                {proposedDraft && <div className="il-alert">
                  <p>Your existing feedback is still here. Apply the AI draft to replace all four boxes, or keep your wording.</p>
                  <button onClick={() => { setFeedback(proposedDraft.fields); setAiDraft(proposedDraft.id); setProposedDraft(null); reviewRequest.current = crypto.randomUUID(); }}>Apply AI draft</button>
                  <button onClick={() => setProposedDraft(null)}>Keep my feedback</button>
                </div>}
              </div>}
              {criteriaKeys.map((k) => (
                <label className="il-answer" key={k}>
                  {criterionLabels[k]}
                  <textarea
                    disabled={aiBusy || working}
                    maxLength={900}
                    value={feedback.criteria?.[k] ?? ""}
                    onChange={(e) => {
                      reviewRequest.current = crypto.randomUUID();
                      setFeedback({
                        ...feedback,
                        criteria: { ...feedback.criteria, [k]: e.target.value },
                      });
                    }}
                  />
                </label>
              ))}
              {skill === "speaking" && (
                <label className="il-answer">
                  <span>
                    <input
                      type="checkbox"
                      checked={feedback.audio_checked ?? false}
                      onChange={(e) => {
                        reviewRequest.current = crypto.randomUUID();
                        setFeedback({
                          ...feedback,
                          audio_checked: e.target.checked,
                        });
                      }}
                    />{" "}
                    I listened to the saved student recording and checked these
                    observations against the audio.
                  </span>
                </label>
              )}
              {(Object.keys(feedbackLabels) as FeedbackKey[]).map((k) => (
                <label className="il-answer" key={k}>
                  {feedbackLabels[k]}
                  <textarea
                    disabled={aiBusy || working}
                    maxLength={1200}
                    value={feedback[k]}
                    onChange={(e) => {
                      reviewRequest.current = crypto.randomUUID();
                      setFeedback({ ...feedback, [k]: e.target.value });
                    }}
                  />
                </label>
              ))}
              <button
                disabled={
                  working || aiBusy || !!proposedDraft ||
                  (Object.keys(feedbackLabels) as FeedbackKey[]).some(
                    (k) => feedback[k].trim().length < 5,
                  ) ||
                  criteriaKeys.some(
                    (k) => (feedback.criteria?.[k] ?? "").trim().length < 5,
                  ) ||
                  (skill === "speaking" && !feedback.audio_checked)
                }
                onClick={async () => {
                  setWorking(true);
                  try {
                    const d = await shareLearningReview(
                      detail.id,
                      feedback,
                      reviewRequest.current,
                      aiDraft,
                    );
                    setDetail(d);
                    setMessage("Teacher feedback shared.");
                    if (d.review) {
                      setReviewOpen(false);
                      window.requestAnimationFrame(() => reviewToggle.current?.focus());
                    }
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Feedback could not be shared.",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Confirm and share feedback
              </button>
              </div>
            </section>
          )}
          <Link to={detail.manager ? teacherRoute : "/ielts/practice/targeted"}>{detail.manager ? "Back to assigned work and reviews →" : "All targeted practice →"}</Link>
        </>
      )}
      {!workspace && !detail && <p role="status">{message}</p>}
    </main>
  );
}
