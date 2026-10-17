import React, { useEffect, useRef, useState } from "react";
import { IeltsButton, IeltsNotice } from "../../components/ielts/IeltsUi";
import {
  courseBoard,
  courseRecordDetail,
  recordCourse,
  courseToday,
  coverageLabels,
  type CoverageStatus,
  type CourseBoard,
} from "../../../services/ieltsCourseService";
import {
  learningWorkspace,
  type LearningWorkspace,
} from "../../../services/ieltsLearningService";
import "../../styles/ielts-course.css";
export default function IeltsBatchCourseBoard({
  batchId,
  schoolId,
  onClose,
}: {
  batchId: string;
  schoolId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CourseBoard | null>(null),
    [practice, setPractice] = useState<LearningWorkspace | null>(null);
  const [lesson, setLesson] = useState("IELTS-01"),
    [student, setStudent] = useState(""),
    [mode, setMode] = useState<"coverage" | "paper">("coverage");
  const [status, setStatus] = useState<CoverageStatus>("covered"),
    [on, setOn] = useState(courseToday),
    [note, setNote] = useState(""),
    [allocation, setAllocation] = useState(""),
    [support, setSupport] = useState("unknown"),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    epoch = useRef(0),
    request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    epoch.current++;
    setData(null);
    setError("");
    courseBoard(batchId, lesson)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [batchId, schoolId, lesson, revision]);
  useEffect(() => {
    if (mode !== "paper") return;
    let active = true;
    setPractice(null);
    learningWorkspace(schoolId)
      .then((d) => {
        if (active) setPractice(d);
      })
      .catch(() => {
        if (active)
          setError("Allocated paper tasks could not load. Refresh to retry.");
      });
    return () => {
      active = false;
    };
  }, [mode, schoolId, revision]);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperLoadError, setPaperLoadError] = useState(false);
  const current = data?.records.find(
    (r) =>
      r.student_id === student &&
      r.lesson_code === lesson &&
      r.kind === mode &&
      (mode !== "paper" || r.allocation_id === allocation),
  );
  useEffect(() => {
    let active = true;
    if (mode !== "paper" || !current?.id) {
      setPaperLoading(false);
      setPaperLoadError(false);
      return;
    }
    setPaperLoading(true);
    setPaperLoadError(false);
    courseRecordDetail(current.id)
      .then((r) => {
        if (!active) return;
        setAnswers(
          Object.fromEntries(
            (r.payload.outcomes ?? []).map((q) => [q.id, q.response ?? ""]),
          ),
        );
        setSupport(r.payload.support ?? "unknown");
        setNote(r.payload.note);
      })
      .catch(() => {
        if (active) {
          setPaperLoadError(true);
          setError(
            "The earlier paper answers could not load. Refresh before correcting this record.",
          );
        }
      })
      .finally(() => {
        if (active) setPaperLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, current?.id]);
  const selected = practice?.allocations.find(
      (a) => a.id === allocation && a.student_id === student,
    ),
    task = practice?.tasks.find((t) => t.code === selected?.task_code);
  const options =
    practice?.allocations.filter(
      (a) =>
        a.student_id === student && ["reading", "listening"].includes(a.skill),
    ) ?? [];
  const clear = () => {
    setNote("");
    setMessage("");
    setAnswers({});
    setAllocation("");
    request.current = null;
  };
  async function save() {
    if (
      lock.current ||
      !data ||
      !student ||
      (mode === "paper" && (!task || note.trim().length < 5))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    const fields =
      mode === "coverage" ? { status, note } : { answers, support, note };
    const key = JSON.stringify([
      batchId,
      student,
      lesson,
      mode,
      fields,
      on,
      current?.id,
      allocation,
    ]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      await recordCourse(
        batchId,
        student,
        lesson,
        mode,
        fields,
        on,
        request.current.id,
        current?.id ?? null,
        mode === "paper" ? allocation : null,
      );
      if (generation !== epoch.current) return;
      setMessage(
        mode === "coverage"
          ? "Coverage recorded in My IELTS Journey."
          : "Paper responses recorded. Online work stays intact; independent progress needs a qualified check.",
      );
      setRevision((n) => n + 1);
    } catch (e) {
      if (generation === epoch.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="ix-workspace ic-course" aria-label="Batch course board">
      <header className="ix-header">
        <div>
          <p className="ix-eyebrow">Academic IELTS · B1 entry · 24 lessons</p>
          <h2>{data?.batch.name ?? "Course board"}</h2>
          <p>Individual coverage, catch-up and paper evidence.</p>
        </div>
        <IeltsButton disabled={busy} onClick={onClose}>
          Back to batches
        </IeltsButton>
      </header>
      {error && (
        <IeltsNotice error>
          {error}
          <IeltsButton
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            Refresh course
          </IeltsButton>
        </IeltsNotice>
      )}
      {message && <IeltsNotice>{message}</IeltsNotice>}
      {!data && !error && <p role="status">Opening course records…</p>}
      {data && (
        <>
          <details className="ix-panel">
            <summary>Course sequence · 12 teaching weeks</summary>
            <ol className="ic-sequence">
              {data.lessons.map((l) => (
                <li key={l.code}>
                  <strong>
                    {l.code} · {l.title}
                  </strong>
                  <span>
                    Week {l.week} · {l.minutes} min ·{" "}
                    {Number(l.code.slice(-2)) <= 2
                      ? "Check lesson-library availability"
                      : "Materials planned"}
                  </span>
                  <IeltsButton
                    disabled={busy}
                    onClick={() => {
                      setLesson(l.code);
                      clear();
                    }}
                  >
                    Select lesson
                  </IeltsButton>
                </li>
              ))}
            </ol>
          </details>
          <section className="ix-panel">
            <h3>Record teaching or paper work</h3>
            <fieldset
              disabled={
                busy || paperLoading || paperLoadError || data.batch.archived
              }
              className="ic-form"
            >
              <label className="ix-field">
                Lesson
                <select
                  value={lesson}
                  onChange={(e) => {
                    setLesson(e.target.value);
                    clear();
                  }}
                >
                  {data.lessons.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code} · {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ix-field">
                Student
                <select
                  value={student}
                  onChange={(e) => {
                    setStudent(e.target.value);
                    clear();
                  }}
                >
                  <option value="">Choose a student</option>
                  {data.members.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ix-field">
                Record type
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    clear();
                  }}
                >
                  <option value="coverage">Lesson coverage / catch-up</option>
                  <option value="paper">Record paper answers</option>
                </select>
              </label>
              <label className="ix-field">
                Teaching / work date
                <input
                  type="date"
                  value={on}
                  max={courseToday()}
                  onChange={(e) => setOn(e.target.value)}
                />
              </label>
              {mode === "coverage" ? (
                <label className="ix-field">
                  Coverage
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as CoverageStatus)
                    }
                  >
                    {Object.entries(coverageLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="ix-field">
                    Allocated Reading or Listening task
                    <select
                      value={allocation}
                      onChange={(e) => {
                        setAllocation(e.target.value);
                        setAnswers({});
                      }}
                    >
                      <option value="">Choose allocated task</option>
                      {options.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.display_code} · {a.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!options.length && (
                    <p>
                      Assign a reviewed task to this student first. Writing and
                      Speaking use the existing teacher review workflow.
                    </p>
                  )}
                  <label className="ix-field">
                    Support during this work
                    <select
                      value={support}
                      onChange={(e) => setSupport(e.target.value)}
                    >
                      <option value="unknown">Not confirmed</option>
                      <option value="independent">
                        Independent work reported
                      </option>
                      <option value="teacher_supported">
                        Teacher support provided
                      </option>
                      <option value="replayed">Audio replayed</option>
                    </select>
                  </label>
                  {task && (
                    <details open>
                      <summary>
                        {task.display_code} · {task.title}
                      </summary>
                      <p>{task.instructions}</p>
                      {task.content.passage && <p>{task.content.passage}</p>}
                      <div className="ic-answers">
                        {task.questions.map((q, i) => (
                          <label className="ix-field" key={q.id}>
                            {i + 1}. {q.prompt}
                            <input
                              maxLength={500}
                              value={answers[q.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((a) => ({
                                  ...a,
                                  [q.id]: e.target.value,
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <p>
                        Leave unanswered items blank. This does not submit or
                        overwrite online work.
                      </p>
                    </details>
                  )}
                </>
              )}
              <label className="ix-field">
                {mode === "paper"
                  ? "Teacher note and delivery conditions (required)"
                  : "Student-visible note (optional)"}
                <textarea
                  maxLength={800}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {current && (
                <IeltsNotice>
                  Existing record:{" "}
                  {current.payload.status
                    ? coverageLabels[current.payload.status]
                    : `${current.payload.marks}/${current.payload.total}`}{" "}
                  · {current.occurred_on}. A correction preserves the original.
                </IeltsNotice>
              )}
              <IeltsButton
                variant="primary"
                disabled={
                  !student ||
                  !on ||
                  (mode === "paper" && (!task || note.trim().length < 5))
                }
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : current
                    ? "Save corrected record"
                    : "Save course record"}
              </IeltsButton>
            </fieldset>
            {data.batch.archived && (
              <IeltsNotice>
                Archived batch. Restore it before adding records.
              </IeltsNotice>
            )}
          </section>
          <details className="ix-panel" open>
            <summary>Current lesson · learner coverage</summary>
            {data.records.length > 1000 && (
              <IeltsNotice>
                The latest 1,000 records are loaded. Earlier records are
                retained. Historical review needs a narrower scope.
              </IeltsNotice>
            )}
            <div className="ic-learners">
              {data.members.map((s) => {
                const r = data.records.find(
                  (r) => r.student_id === s.id && r.kind === "coverage",
                );
                return (
                  <article key={s.id}>
                    <strong>{s.name}</strong>
                    <span>
                      {r?.payload.status
                        ? coverageLabels[r.payload.status]
                        : data.records.length > 1000
                          ? "Record not loaded"
                          : "Not recorded"}
                    </span>
                    <IeltsButton
                      disabled={busy}
                      onClick={() => {
                        setStudent(s.id);
                        setMode("coverage");
                        clear();
                      }}
                    >
                      Record / update
                    </IeltsButton>
                  </article>
                );
              })}
            </div>
          </details>
          <p>
            Coverage records teaching exposure. Paper scores describe that task;
            neither establishes a band or improvement on its own.
          </p>
        </>
      )}
    </section>
  );
}
