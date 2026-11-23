import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  classReport, cellState, kindLabel, latestFor, reportColumns, reportCsv, resultText, stateLabel, studentSummary,
  type ClassReport, type ReportItem, type ReportScope, type ReportStudent,
} from "../../../../services/ieltsClassReportService";

/**
 * The teacher's class report (Visual & UX Bible 13.13): every piece of IELTS work each student was given, with its
 * state and result, for the whole class and for each student. Print or save as PDF, or download for Excel.
 * Read-only; Listening and Reading show marks (never bands) and Speaking shows only the teacher's confirmed band.
 */
const SKILL: Record<string, string> = { listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking" };
const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function Cell({ item, now }: { item?: ReportItem; now: number }) {
  if (!item) return <span className="itn-cr-cell is-none" title="Not given">·</span>;
  const st = cellState(item, now);
  const result = resultText(item);
  const label = stateLabel[st];
  return (
    <span className={"itn-cr-cell is-" + st} title={`${item.title} · ${label}${result ? " · " + result : ""}`}>
      {result || (st === "waiting" ? "To review" : label)}
    </span>
  );
}

export default function IeltsClassReport({ schoolId, schoolName, onClose }: { schoolId: string; schoolName?: string; onClose: () => void }) {
  const [scope, setScope] = useState<ReportScope>("all");
  const [value, setValue] = useState<string>("");
  const [report, setReport] = useState<ClassReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"class" | "students">("class");
  const [who, setWho] = useState<string>("");
  const now = useMemo(() => Date.now(), [report]);

  const load = useCallback(async (s: ReportScope, v: string) => {
    setLoading(true); setError("");
    try { setReport(await classReport(schoolId, s, s === "all" ? null : v)); }
    catch (e) { setError(e instanceof Error ? e.message : "The class report could not be opened just now."); }
    finally { setLoading(false); }
  }, [schoolId]);
  useEffect(() => { void load("all", ""); }, [load]);

  const choose = (s: ReportScope, v: string) => {
    setScope(s); setValue(v); setWho("");
    if (s === "all" || v) void load(s, v);
  };

  const students = report?.students ?? [];
  const columns = useMemo(() => reportColumns(students), [students]);
  const totals = useMemo(() => {
    let given = 0, done = 0, overdue = 0, waiting = 0;
    for (const s of students) { const x = studentSummary(s, now); given += x.given; done += x.done; overdue += x.overdue; waiting += x.waiting; }
    return { given, done, overdue, waiting };
  }, [students, now]);
  const scopeName = report?.scope.kind === "all" ? "All students" : report?.scope.kind === "batch" ? `Course batch · ${report?.scope.name}` : `Class ${report?.scope.name ?? ""}`;
  const shownStudents = who ? students.filter((s) => s.id === who) : students;

  const download = () => {
    if (!report) return;
    const blob = new Blob([reportCsv(report, now)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IELTS class report - ${scopeName.replace(/[\\/:*?"<>|·]/g, "").trim()} - ${new Date(report.generated_at).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="itn-cr" aria-labelledby="itn-cr-title">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>
      <div className="itn-cr-top itn-cr-noprint">
        <button type="button" className="itn-see-all" onClick={onClose}>← Back to students</button>
      </div>
      <header className="itn-cr-head">
        <div>
          <p className="isn-eyebrow">Class report{schoolName ? " · " + schoolName : ""}</p>
          <h2 id="itn-cr-title">{report ? scopeName : "Class report"}</h2>
          {report && <p className="itn-cr-sub">Made {fmt(report.generated_at)} · {students.length} student{students.length === 1 ? "" : "s"}</p>}
        </div>
        <div className="itn-cr-actions itn-cr-noprint">
          <button type="button" className="itn-sd-btn" disabled={!report || loading} onClick={() => window.print()}>
            Print or save as PDF
          </button>
          <button type="button" className="itn-sd-btn is-main" disabled={!report || loading} onClick={download}>Download for Excel</button>
        </div>
      </header>

      <div className="itn-cr-controls itn-cr-noprint">
        <label>Students
          <select value={scope === "all" ? "all" : `${scope}:${value}`} onChange={(e) => {
            const v = e.target.value;
            if (v === "all") choose("all", "");
            else { const [s, ...rest] = v.split(":"); choose(s as ReportScope, rest.join(":")); }
          }}>
            <option value="all">All students</option>
            {!!report?.classes.length && <optgroup label="Class">{report.classes.map((c) => <option key={c} value={`class:${c}`}>Class {c}</option>)}</optgroup>}
            {!!report?.batches.length && <optgroup label="Course batch">{report.batches.map((b) => <option key={b.id} value={`batch:${b.id}`}>{b.name}</option>)}</optgroup>}
          </select>
        </label>
        <div className="itn-segmented" role="group" aria-label="Report view">
          <button type="button" aria-pressed={view === "class"} onClick={() => setView("class")}>Whole class</button>
          <button type="button" aria-pressed={view === "students"} onClick={() => setView("students")}>Each student</button>
        </div>
        {view === "students" && (
          <label>Student
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Everyone</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error ? (
        <div className="isn-alert" role="alert"><p>{error}</p><button type="button" className="itn-see-all" onClick={() => void load(scope, value)}>Try again</button></div>
      ) : loading && !report ? (
        <div className="isn-skeletons" role="status" aria-label="Making the class report"><span /><span /><span /></div>
      ) : report && (
        <>
          <dl className="itn-cr-stats" aria-busy={loading}>
            <div><dt>Pieces of work given</dt><dd>{totals.given}</dd></div>
            <div><dt>Done</dt><dd>{totals.given ? Math.round((totals.done / totals.given) * 100) : 0}%<small> · {totals.done}</small></dd></div>
            <div className={totals.overdue ? "is-warn" : ""}><dt>Overdue</dt><dd>{totals.overdue}</dd></div>
            <div className={totals.waiting ? "is-hot" : ""}><dt>Waiting for your review</dt><dd>{totals.waiting}</dd></div>
          </dl>

          {!students.length ? (
            <p className="isn-waiting">No students here yet.</p>
          ) : view === "class" ? (
            <div className="itn-cr-scroll" role="region" aria-label="Whole-class results" tabIndex={0}>
              <table className="itn-cr-grid">
                <thead>
                  <tr>
                    <th scope="col" className="is-sticky">Student</th>
                    <th scope="col">Done</th>
                    {columns.map((c) => (
                      <th key={c.key} scope="col" title={`${c.title} · ${kindLabel[c.kind]} · given to ${c.given}`}>
                        <span className="itn-cr-colskill">{c.skill ? SKILL[c.skill] ?? c.skill : kindLabel[c.kind]}{c.code ? " · " + c.code : ""}</span>
                        <span className="itn-cr-coltitle">{c.title}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const x = studentSummary(s, now);
                    return (
                      <tr key={s.id}>
                        <th scope="row" className="is-sticky">
                          <button type="button" className="itn-cr-name" onClick={() => { setView("students"); setWho(s.id); }}>{s.name}</button>
                          {s.class_name && <span className="itn-cr-class">{s.class_name}</span>}
                        </th>
                        <td className="itn-cr-done">{x.done} / {x.given}{x.overdue ? <span className="itn-cr-late"> · {x.overdue} late</span> : null}</td>
                        {columns.map((c) => <td key={c.key}><Cell item={latestFor(s, c.key)} now={now} /></td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="itn-cr-people">
              {shownStudents.map((s) => <StudentCard key={s.id} student={s} now={now} />)}
            </div>
          )}

          <p className="itn-cr-note">
            Reading and Listening show correct answers out of the total, not IELTS bands. A Speaking band is the teacher's
            band, shown only after the teacher confirms the review; practice mock bands are practice. None of these is an
            official IELTS result. Writing shows whether it has been reviewed.
          </p>
        </>
      )}
    </section>
  );
}

function StudentCard({ student, now }: { student: ReportStudent; now: number }) {
  const x = studentSummary(student, now);
  return (
    <article className="itn-cr-person">
      <header>
        <h3>{student.name}</h3>
        <p>{student.class_name ? `Class ${student.class_name} · ` : ""}{x.done} of {x.given} done{x.overdue ? ` · ${x.overdue} overdue` : ""}{x.waiting ? ` · ${x.waiting} waiting for review` : ""}</p>
      </header>
      {!student.items.length ? <p className="isn-waiting">No IELTS work given yet.</p> : (
        <table className="itn-cr-list">
          <thead><tr><th scope="col">Work</th><th scope="col">Skill</th><th scope="col">Given</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {student.items.map((i, n) => {
              const st = cellState(i, now);
              return (
                <tr key={i.key + n}>
                  <td><span className="itn-cr-work">{i.title}</span><span className="itn-cr-kind">{kindLabel[i.kind]}{i.code ? " · " + i.code : ""}</span></td>
                  <td data-label="Skill">{i.skill ? SKILL[i.skill] ?? i.skill : "—"}</td>
                  <td data-label="Given">{fmt(i.assigned_at)}</td>
                  <td data-label="Due">{fmt(i.due_at)}</td>
                  <td data-label="Status"><span className={"itn-cr-cell is-" + st}>{stateLabel[st]}</span>{i.done_at ? <span className="itn-cr-kind">{fmt(i.done_at)}</span> : null}</td>
                  <td data-label="Result">{resultText(i) || "—"}{i.band ? <span className="itn-cr-kind">{i.band.label}</span> : i.score ? <span className="itn-cr-kind">correct answers</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}
