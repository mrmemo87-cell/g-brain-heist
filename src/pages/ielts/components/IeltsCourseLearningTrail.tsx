import React, { useEffect, useRef, useState } from "react";
import {
  courseJourney,
  courseRecordDetail,
  coverageLabels,
  type CourseRecord,
} from "../../../../services/ieltsCourseService";
function PaperAnswers({ record }: { record: CourseRecord }) {
  const [open, setOpen] = useState(false),
    [detail, setDetail] = useState<CourseRecord["payload"] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || detail) return;
    let active = true;
    setError("");
    courseRecordDetail(record.id)
      .then((r) => {
        if (active) setDetail(r.payload);
      })
      .catch(() => {
        if (active)
          setError(
            "Answers could not load. Your saved record is safe. Try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [open, record.id, detail, retry]);
  const support = (
    {
      unknown: "Not confirmed",
      independent: "Independent work reported",
      teacher_supported: "Teacher support provided",
      replayed: "Audio replayed",
    } as Record<string, string>
  )[record.payload.support ?? "unknown"];
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>My recorded answers and conditions</summary>
      <p>
        Support: {support}. This classroom record does not establish improvement
        or a band.
      </p>
      {open && !detail && !error && (
        <p role="status">Loading recorded answers…</p>
      )}
      {error && (
        <p role="alert">
          {error}
          <button className="ij-link" onClick={() => setRetry((n) => n + 1)}>
            Retry answers
          </button>
        </p>
      )}
      <ol>
        {detail?.outcomes?.map((q) => (
          <li key={q.id}>
            {q.prompt}: {q.response || "Unanswered"} ·{" "}
            {q.state === "unanswered"
              ? "No response recorded"
              : q.correct
                ? "Correct"
                : "Incorrect"}
          </li>
        ))}
      </ol>
    </details>
  );
}
export default function IeltsCourseLearningTrail() {
  const [rows, setRows] = useState<CourseRecord[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    let active = true;
    alive.current = true;
    setLoading(true);
    setError("");
    courseJourney()
      .then((d) => {
        if (active) {
          setRows(d.records.slice(0, 50));
          setMore(d.has_more);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Your course record could not load. Your saved work is safe. Try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [revision]);
  async function earlier() {
    if (lock.current || !rows.length) return;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      const last = rows.at(-1)!;
      const d = await courseJourney(last.created_at, last.id);
      if (alive.current) {
        setRows((r) => [...r, ...d.records.slice(0, 50)]);
        setMore(d.has_more);
      }
    } catch {
      if (alive.current) setError("Earlier records could not load. Try again.");
    } finally {
      lock.current = false;
      if (alive.current) setLoading(false);
    }
  }
  return (
    <section className="ij-panel" aria-labelledby="course-coverage-heading">
      <p className="ij-eyebrow">Teaching and task performance</p>
      <h2 id="course-coverage-heading">What I have covered</h2>
      <p>
        Your teacher records lessons, catch-up and paper work here. Fresh checks
        help show what you can do independently.
      </p>
      {error && (
        <p role="alert">
          {error}
          <button
            className="ij-link"
            disabled={loading}
            onClick={() => setRevision((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {!rows.length && !loading && !error && (
        <p>Your lesson record will appear as your course progresses.</p>
      )}
      <div className="ij-two-columns">
        {rows.map((r) => (
          <article className="ij-observation" key={r.id}>
            <h3>
              {r.lesson_code} · {r.lesson_title}
            </h3>
            <p>
              {r.kind === "coverage" && r.payload.status
                ? coverageLabels[r.payload.status]
                : `${r.payload.title} · Paper task: ${r.payload.marks}/${r.payload.total}`}
            </p>
            <p className="ij-meta">
              {r.batch_name} · {r.occurred_on} · Recorded by {r.author}
            </p>
            <p>{r.payload.note}</p>
            {r.kind === "paper" && <PaperAnswers record={r} />}
          </article>
        ))}
      </div>
      {loading && <p role="status">Loading course record…</p>}
      {more && (
        <button
          className="ij-link"
          disabled={loading}
          onClick={() => void earlier()}
        >
          Earlier course records
        </button>
      )}
    </section>
  );
}
