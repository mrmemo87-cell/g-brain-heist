import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  confirmPaper,
  fetchPaperWorkspace,
  paperOptions,
  savePaperDraft,
  supportsPaperEntry,
  type PaperAnswers,
  type PaperStudent,
  type PaperWorkspace,
} from "../../services/assignmentPaperService";
import { openPrintableTeacherAssignment } from "../../services/teacherAssignmentPrintService";
import "./PaperAssignmentWorkspace.css";

const PaperScanWorkspace = lazy(() => import("./PaperScanWorkspace"));

type Props = {
  assignmentId: string;
  userId: string;
  schoolName: string;
  schoolLogoUrl?: string | null;
  teacherName: string;
  onClose: () => void;
  onRecorded: () => void;
};
const localTime = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Could not save. Try again.";

export default function PaperAssignmentWorkspace(props: Props) {
  const [packet, setPacket] = useState<PaperWorkspace | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [mode, setMode] = useState<"manual" | "scan">("manual");
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [closeFailed, setCloseFailed] = useState(false);
  const canLeave = useRef<() => boolean>(() => false);
  const flush = useRef<() => Promise<void>>(async () => {});
  const dialog = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPaperWorkspace(props.assignmentId);
      setPacket(data);
      setSelected(
        (id) =>
          id ||
          data.students.find((s) => s.status !== "completed")?.id ||
          data.students[0]?.id ||
          "",
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [props.assignmentId]);
  useEffect(() => {
    void load();
  }, [load]);
  const close = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await flush.current();
      props.onClose();
    } catch (cause) {
      setError(errorText(cause));
      setCloseFailed(true);
    } finally {
      setClosing(false);
    }
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
          ) || []),
        ].filter((node) => node.getClientRects().length);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last?.focus();
        }
        if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const student = packet?.students.find((s) => s.id === selected);
  const switchStudent = async (id: string) => {
    try {
      await flush.current();
      setError("");
      setSelected(id);
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  const completed =
    packet?.students.filter((s) => s.status === "completed").length || 0;
  return createPortal(
    <div className="paw-overlay">
      <div
        ref={dialog}
        className="paw"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paper-title"
        tabIndex={-1}
      >
        <header className="paw-header">
          <div>
            <span className="paw-eyebrow">
              Paper workspace {packet ? `· ${packet.code}` : ""}
            </span>
            <h2 id="paper-title">
              {packet?.assignment.title || "Record paper answers"}
            </h2>
          </div>
          <button
            className="paw-icon"
            aria-label="Close paper workspace"
            onClick={() => void close()}
            disabled={closing}
          >
            ×
          </button>
        </header>
        {loading ? (
          <div className="paw-empty" role="status">
            <span className="paw-loader" />
            Opening your class…
          </div>
        ) : packet ? (
          <>
            <div className="paw-mode" role="group" aria-label="Paper workflow">
              <button
                aria-pressed={mode === "manual"}
                className="paw-button"
                onClick={async () => {
                  try {
                    await flush.current();
                    setMode("manual");
                    setError("");
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Enter answers
              </button>
              <button
                aria-pressed={mode === "scan"}
                className="paw-button"
                onClick={async () => {
                  try {
                    await flush.current();
                    setMode("scan");
                    setError("");
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                ▣ Print & Scan
              </button>
            </div>
            {mode === "scan" && scanConfirmed ? <div className="paw-scan-confirmed" role="status">✓ Student result confirmed.</div> : null}
            {mode === "scan" && error ? (
              <div className="paw-error" role="alert">
                {error}
              </div>
            ) : null}
            {mode === "scan" ? (
              <Suspense
                fallback={
                  <div className="paw-empty" role="status">
                    Opening scanner…
                  </div>
                }
              >
                <PaperScanWorkspace
                  packet={packet}
                  userId={props.userId}
                  schoolName={props.schoolName}
                  schoolLogoUrl={props.schoolLogoUrl}
                  flush={flush}
                  canLeave={canLeave}
                  onConfirmed={async () => {
                    setScanConfirmed(true);
                    props.onRecorded();
                    await load();
                  }}
                />
              </Suspense>
            ) : (
              <>
                <div className="paw-toolbar">
                  <span className="paw-progress">
                    <strong>
                      {completed}/{packet.students.length}
                    </strong>{" "}
                    completed
                  </span>
                  <button
                    className="paw-button"
                    onClick={() =>
                      openPrintableTeacherAssignment({
                        packet,
                        schoolName: props.schoolName,
                        schoolLogoUrl: props.schoolLogoUrl,
                        teacherName: props.teacherName,
                      })
                    }
                  >
                    ▤ Print pack
                  </button>
                  <button
                    className="paw-button"
                    onClick={() =>
                      openPrintableTeacherAssignment({
                        packet,
                        schoolName: props.schoolName,
                        schoolLogoUrl: props.schoolLogoUrl,
                        teacherName: props.teacherName,
                        markingKey: true,
                      })
                    }
                  >
                    Teacher key
                  </button>
                </div>
                {error ? (
                  <div className="paw-error" role="alert">
                    {error}
                    {closeFailed && canLeave.current() && (
                      <button className="paw-button" onClick={props.onClose}>
                        Close · draft on this device
                      </button>
                    )}
                  </div>
                ) : null}
                <div className="paw-layout">
                  <aside className="paw-roster">
                    <label className="paw-search">
                      <span className="sr-only">Find student</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find student"
                      />
                    </label>
                    <nav aria-label="Class students">
                      {packet.students
                        .filter((s) =>
                          s.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((s) => (
                          <button
                            key={s.id}
                            aria-current={
                              selected === s.id ? "true" : undefined
                            }
                            className={`paw-student ${selected === s.id ? "is-active" : ""}`}
                            onClick={() => void switchStudent(s.id)}
                          >
                            <span className="paw-avatar" aria-hidden="true">
                              {s.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{s.name}</strong>
                              <small>
                                {s.status === "completed"
                                  ? `${s.source === "paper" ? "Paper" : "Online"} · Completed`
                                  : s.draft
                                    ? "Draft saved"
                                    : s.existingAnswerCount
                                      ? `${s.existingAnswerCount} online answers`
                                      : "Not started"}
                              </small>
                            </span>
                            <span aria-hidden="true">
                              {s.status === "completed" ? "✓" : "›"}
                            </span>
                          </button>
                        ))}
                    </nav>
                    {!packet.students.length && (
                      <p className="paw-empty">No students assigned.</p>
                    )}
                  </aside>
                  <main className="paw-main">
                    {student ? (
                      <PaperStudentEditor
                        key={student.id}
                        packet={packet}
                        student={student}
                        userId={props.userId}
                        flush={flush}
                        canLeave={canLeave}
                        onDraft={(draft) =>
                          setPacket((p) =>
                            p
                              ? {
                                  ...p,
                                  students: p.students.map((s) =>
                                    s.id === student.id ? { ...s, draft } : s,
                                  ),
                                }
                              : p,
                          )
                        }
                        onConfirmed={async () => {
                          props.onRecorded();
                          await load();
                        }}
                      />
                    ) : (
                      <div className="paw-empty">
                        Choose a student to begin.
                      </div>
                    )}
                  </main>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="paw-empty">
            <p role="alert">{error}</p>
            <button className="paw-button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PaperStudentEditor({
  packet,
  student,
  userId,
  flush,
  canLeave,
  onDraft,
  onConfirmed,
}: {
  packet: PaperWorkspace;
  student: PaperStudent;
  userId: string;
  flush: React.MutableRefObject<() => Promise<void>>;
  canLeave: React.MutableRefObject<() => boolean>;
  onDraft: (draft: NonNullable<PaperStudent["draft"]>) => void;
  onConfirmed: () => Promise<void>;
}) {
  const storageKey = `bh:paper-draft:v1:${userId}:${packet.assignment.id}:${student.id}`;
  const initial = useRef<{
    answers: PaperAnswers;
    assessedAt: string;
    revision: number;
    conflict: boolean;
  } | null>(null);
  if (!initial.current) {
    const draft = student.draft;
    let local: {
      answers: PaperAnswers;
      assessedAt: string;
      revision: number;
      formHash: string;
    } | null = null;
    try {
      local = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      /* server draft remains usable */
    }
    const compatible =
      local &&
      local.formHash === packet.formHash &&
      local.revision === (draft?.revision || 0) &&
      typeof local.answers === "object" &&
      local.answers !== null &&
      Number.isFinite(Date.parse(local.assessedAt));
    initial.current = {
      answers: compatible
        ? local!.answers
        : draft?.formHash === packet.formHash
          ? draft.answers
          : {},
      assessedAt: compatible
        ? local!.assessedAt
        : draft?.assessedAt || new Date().toISOString(),
      revision: draft?.revision || 0,
      conflict: !!local && !compatible,
    };
  }
  const [answers, setAnswers] = useState(initial.current.answers);
  const [assessedAt, setAssessedAt] = useState(initial.current.assessedAt);
  const [state, setState] = useState<"saved" | "saving" | "local" | "failed">(
    JSON.stringify(initial.current.answers) ===
      JSON.stringify(student.draft?.answers || {})
      ? "saved"
      : "local",
  );
  const [error, setError] = useState(
    initial.current.conflict
      ? "An older device draft was found. The latest school draft is shown."
      : "",
  );
  const [review, setReview] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const [activeQuestion, setActiveQuestion] = useState(0);
  const revision = useRef(initial.current.revision);
  const latest = useRef({ answers, assessedAt });
  latest.current = { answers, assessedAt };
  const saved = useRef(
    student.draft
      ? JSON.stringify({
          answers: student.draft.answers,
          assessedAt: student.draft.assessedAt,
        })
      : "",
  );
  const chain = useRef<Promise<void>>(Promise.resolve());
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const locked = student.status === "completed";
  const supported = supportsPaperEntry(packet.questions);
  const answered = packet.questions.filter((q) =>
    Object.hasOwn(answers, q.questionId),
  ).length;
  const storeLocal = (value: typeof latest.current) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...value,
          revision: revision.current,
          formHash: packet.formHash,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };
  const persist = useCallback(() => {
    const operation = async () => {
      if (locked) return;
      const value = { ...latest.current };
      const fingerprint = JSON.stringify(value);
      if (fingerprint === saved.current || !Object.keys(value.answers).length)
        return;
      setState("saving");
      try {
        const next = await savePaperDraft({
          assignmentId: packet.assignment.id,
          studentId: student.id,
          formHash: packet.formHash,
          ...value,
          revision: revision.current,
        });
        revision.current = next;
        saved.current = fingerprint;
        onDraftRef.current({
          ...value,
          revision: next,
          formHash: packet.formHash,
        });
        if (JSON.stringify(latest.current) === fingerprint) {
          try {
            localStorage.removeItem(storageKey);
          } catch {}
          setState("saved");
        } else {
          storeLocal(latest.current);
          setState("local");
        }
        setError("");
      } catch (cause) {
        setState("failed");
        setError(errorText(cause));
        throw cause;
      }
    };
    const next = chain.current.catch(() => {}).then(operation);
    chain.current = next;
    return next;
  }, [locked, packet.assignment.id, packet.formHash, storageKey, student.id]);
  useEffect(() => {
    flush.current = () =>
      busyRef.current
        ? Promise.reject(new Error("Confirmation is in progress. Please wait."))
        : persist();
    canLeave.current = () => {
      if (busyRef.current) return false;
      if (locked || JSON.stringify(latest.current) === saved.current)
        return true;
      try {
        const value = JSON.parse(localStorage.getItem(storageKey) || "null");
        return (
          value?.formHash === packet.formHash &&
          value?.revision === revision.current &&
          value?.assessedAt === latest.current.assessedAt &&
          JSON.stringify(value?.answers) ===
            JSON.stringify(latest.current.answers)
        );
      } catch {
        return false;
      }
    };
    return () => {
      flush.current = async () => {};
      canLeave.current = () => false;
    };
  }, [flush, canLeave, persist, locked]);
  useEffect(() => {
    if (locked || !Object.keys(answers).length) return;
    const timer = setTimeout(() => {
      void persist().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [answers, assessedAt, locked, persist]);
  useEffect(() => {
    const recover = () => {
      void persist().catch(() => {});
    };
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [persist]);
  const change = (id: string, answer: string | null) => {
    const value = {
      answers: { ...latest.current.answers, [id]: answer },
      assessedAt: latest.current.assessedAt,
    };
    latest.current = value;
    setAnswers(value.answers);
    setReview(false);
    setState("local");
    if (!storeLocal(value))
      setError(
        "Device storage is unavailable. Keep this screen open until Saved appears.",
      );
  };
  const dateChange = (value: string) => {
    if (!value || !Number.isFinite(Date.parse(value))) return;
    const next = {
      ...latest.current,
      assessedAt: new Date(value).toISOString(),
    };
    latest.current = next;
    setAssessedAt(next.assessedAt);
    setState("local");
    storeLocal(next);
  };
  useEffect(() => {
    if (locked || review || busy || !supported) return;
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const current = packet.questions[activeQuestion];
      const index = event.key.toUpperCase().charCodeAt(0) - 65;
      if (
        event.key.length === 1 &&
        index >= 0 &&
        index < paperOptions(current).length
      ) {
        event.preventDefault();
        change(current.questionId, paperOptions(current)[index].text);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [activeQuestion, locked, review, busy, supported, packet.questions]);
  const question = packet.questions[activeQuestion];
  const finalize = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await persist();
      await confirmPaper({
        assignmentId: packet.assignment.id,
        studentId: student.id,
        formHash: packet.formHash,
        ...latest.current,
        replacePartial: replace,
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      saved.current = JSON.stringify(latest.current);
      await onConfirmed();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="paw-editor-title">
        <div>
          <span className="paw-eyebrow">Student</span>
          <h3>{student.name}</h3>
        </div>
        <span role="status" aria-live="polite" className={`paw-save ${state}`}>
          {locked
            ? "✓ Completed"
            : answered === 0
              ? "Ready"
              : state === "saving"
                ? "Saving…"
                : state === "saved"
                  ? "✓ Saved"
                  : state === "local"
                    ? "On this device"
                    : "Needs attention"}
        </span>
      </div>
      {locked ? (
        <div className="paw-complete">
          <span aria-hidden="true">✓</span>
          <h4>
            {student.source === "paper"
              ? "Paper · Teacher confirmed"
              : "Completed online"}
          </h4>
          <strong>{student.accuracy ?? "—"}%</strong>
          <p>
            {student.completedAt
              ? new Date(student.completedAt).toLocaleDateString()
              : ""}
          </p>
          <small>This result is protected.</small>
        </div>
      ) : !supported ? (
        <div className="paw-empty">
          Paper entry supports multiple choice and true/false with text answer
          choices. You can still print this assignment.
        </div>
      ) : (
        <>
          <label className="paw-date">
            Assessment time
            <input
              type="datetime-local"
              value={localTime(assessedAt)}
              min={localTime(packet.assignment.assignedAt)}
              max={localTime(new Date().toISOString())}
              onChange={(e) => dateChange(e.target.value)}
              disabled={busy}
            />
          </label>
          {error ? (
            <div className="paw-error" role="alert">
              {error}
              {state === "failed" && (
                <button
                  className="paw-button"
                  onClick={() => void persist().catch(() => {})}
                >
                  Retry save
                </button>
              )}
            </div>
          ) : null}
          {review ? (
            <section className="paw-review">
              <span className="paw-eyebrow">Ready to confirm</span>
              <h4>{answered} answers checked</h4>
              <div className="paw-answer-summary">
                {packet.questions.map((q) => (
                  <span key={q.questionId}>
                    <small>{q.orderIndex}</small>
                    <strong>
                      {answers[q.questionId] === null
                        ? "—"
                        : String.fromCharCode(
                            65 +
                              paperOptions(q).findIndex(
                                (o) => o.text === answers[q.questionId],
                              ),
                          )}
                    </strong>
                  </span>
                ))}
              </div>
              {student.existingAnswerCount > 0 && (
                <label className="paw-replace">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Replace {student.existingAnswerCount} unfinished online
                  answers with this paper. The previous answers are kept in the
                  audit.
                </label>
              )}
              <div className="paw-actions">
                <button
                  className="paw-button"
                  onClick={() => setReview(false)}
                  disabled={busy}
                >
                  Back to answers
                </button>
                <button
                  className="paw-button primary"
                  disabled={
                    busy || (student.existingAnswerCount > 0 && !replace)
                  }
                  onClick={() => void finalize()}
                >
                  {busy ? "Confirming…" : "Confirm paper result"}
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="paw-question-nav" aria-label="Questions">
                {packet.questions.map((q, i) => (
                  <button
                    key={q.questionId}
                    className={`${i === activeQuestion ? "active" : ""} ${Object.hasOwn(answers, q.questionId) ? "answered" : ""}`}
                    aria-label={`Question ${q.orderIndex}${Object.hasOwn(answers, q.questionId) ? ", recorded" : ""}`}
                    aria-current={i === activeQuestion ? "step" : undefined}
                    onClick={() => setActiveQuestion(i)}
                  >
                    {q.orderIndex}
                  </button>
                ))}
              </div>
              {question && (
                <section className="paw-question">
                  <span className="paw-eyebrow">
                    Question {question.orderIndex} of {packet.questions.length}
                  </span>
                  <h4>{question.questionText}</h4>
                  {question.imageUrl && (
                    <img
                      className="paw-question-image"
                      src={question.imageUrl}
                      alt={question.imageAltText || "Question visual"}
                    />
                  )}
                  <div
                    className="paw-options"
                    role="radiogroup"
                    aria-label={`Answer for question ${question.orderIndex}`}
                    onKeyDown={(event) => {
                      if (
                        ![
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      const choices = [
                        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "button",
                        ),
                      ];
                      const index = choices.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      const next =
                        choices[
                          (index +
                            (["ArrowLeft", "ArrowUp"].includes(event.key)
                              ? -1
                              : 1) +
                            choices.length) %
                            choices.length
                        ];
                      next?.focus();
                      next?.click();
                    }}
                  >
                    {paperOptions(question).map((option, i) => (
                      <button
                        key={i}
                        role="radio"
                        aria-checked={
                          answers[question.questionId] === option.text
                        }
                        className={
                          answers[question.questionId] === option.text
                            ? "selected"
                            : ""
                        }
                        onClick={() => change(question.questionId, option.text)}
                      >
                        <span>{String.fromCharCode(65 + i)}</span>
                        <span>
                          {option.text}
                          {option.imageUrl && (
                            <img
                              src={option.imageUrl}
                              alt="Answer choice visual"
                            />
                          )}
                        </span>
                        {answers[question.questionId] === option.text && (
                          <span aria-hidden="true">✓</span>
                        )}
                      </button>
                    ))}
                    <button
                      role="radio"
                      aria-checked={
                        Object.hasOwn(answers, question.questionId) &&
                        answers[question.questionId] === null
                      }
                      className={`paw-blank ${Object.hasOwn(answers, question.questionId) && answers[question.questionId] === null ? "selected" : ""}`}
                      onClick={() => change(question.questionId, null)}
                    >
                      <span>—</span>
                      <span>Blank on paper</span>
                    </button>
                  </div>
                </section>
              )}
              <footer className="paw-editor-footer">
                <span>
                  {answered}/{packet.questions.length} recorded
                </span>
                <div className="paw-actions">
                  <button
                    className="paw-button"
                    onClick={() => setActiveQuestion((i) => Math.max(0, i - 1))}
                    disabled={activeQuestion === 0}
                  >
                    Previous
                  </button>
                  {activeQuestion < packet.questions.length - 1 &&
                  answered !== packet.questions.length ? (
                    <button
                      className="paw-button primary"
                      onClick={() => setActiveQuestion((i) => i + 1)}
                    >
                      Next question
                    </button>
                  ) : (
                    <button
                      className="paw-button primary"
                      disabled={answered !== packet.questions.length}
                      onClick={() => setReview(true)}
                    >
                      Review answers
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </>
      )}
    </>
  );
}
