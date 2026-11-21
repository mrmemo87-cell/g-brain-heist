// Diagnostic Bible 2.7.0 section 10.12; Visual & UX Bible 13.11. Teachers assign a Speaking practice
// mock to the selected student, see its true state and open the review. One open attempt per student.
// "Automatic" (the default) lets the server pick a mock the student has not had; "Give everyone listed
// a mock" spreads the mocks across the students the teacher found, so classmates get different questions.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  assignMock,
  assignMockMix,
  cancelMockAssignment,
  mockCatalog,
  mockTeacherList,
  requestJoin,
  type MockAssignmentRow,
  type MockCatalogItem,
  type MockMixResult,
} from "../../../services/ieltsSpeakingMockService";
import { displayDateLocale } from "../../utils/displayDate";
import "../../styles/ielts-speaking-mock.css";

const when = (d: string) => new Date(d).toLocaleDateString(displayDateLocale(), { day: "numeric", month: "short", year: "numeric" });

function stateOf(r: MockAssignmentRow) {
  if (r.cancelled_at) return "Cancelled";
  if (!r.session_id) return "Assigned · not started";
  if (r.reviewed) return "Feedback shared";
  if (r.status === "submitted") return "Ready for your review";
  if (r.finished_at) return "Finished · still saving";
  return "Started by the student";
}

const AUTO = "auto";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function mixMessage(r: MockMixResult) {
  const open = r.skipped.filter((x) => x.reason === "open_mock").length;
  const done = r.skipped.length - open;
  const parts = [r.assigned ? `Assigned ${plural(r.assigned, "student", "students")}, with the mocks mixed so classmates get different questions.` : "No new mocks were assigned."];
  if (open) parts.push(`${plural(open, "student already has", "students already have")} a mock open.`);
  if (done) parts.push(`${plural(done, "student has", "students have")} already done every mock.`);
  return parts.join(" ");
}

export default function SpeakingMockTeacherPanel({ studentId, studentName, students = [] }: { studentId: string; studentName?: string; students?: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<MockCatalogItem[] | null>(null);
  const [rows, setRows] = useState<MockAssignmentRow[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([mockCatalog(), mockTeacherList(studentId)]);
      setCatalog(c);
      setRows(r);
      setCode((old) => old || AUTO);
    } catch {
      setMessage({ text: "We could not load practice mocks. Try again.", error: true });
    }
  }, [studentId]);
  useEffect(() => {
    setMessage(null);
    void load();
  }, [load]);

  if (catalog === null) return null;
  const available = catalog.filter((c) => c.published || c.pilot_student === studentId);
  if (available.length === 0 && rows.length === 0) return null;
  const open = rows.find((r) => (code === AUTO || r.package_code === code) && !r.cancelled_at && !r.finished_at && r.status !== "submitted");
  const listed = students.filter((s) => s.id);

  async function assign() {
    setBusy(true);
    setMessage(null);
    try {
      if (code === AUTO) {
        const res = await assignMockMix([studentId]);
        setMessage(res.assigned ? { text: `Assigned. ${studentName ?? "The student"} will see it on their Journey.` }
          : res.skipped[0]?.reason === "no_new_mock" ? { text: `${studentName ?? "This student"} has already done every mock.`, error: true }
          : { text: `${studentName ?? "This student"} already has a mock open.` });
      } else {
        const res = await assignMock(code, [studentId]);
        setMessage({ text: res.assigned ? `Assigned. ${studentName ?? "The student"} will see it on their Journey.` : "This student already has this mock open." });
      }
      await load();
    } catch {
      setMessage({ text: "We could not assign the mock. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }
  async function assignAll() {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: mixMessage(await assignMockMix(listed.map((s) => s.id))) });
      await load();
    } catch {
      setMessage({ text: "We could not assign the mocks. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    setBusy(true);
    try {
      await cancelMockAssignment(id);
      await load();
    } catch {
      setMessage({ text: "This mock has already been started, so it cannot be cancelled.", error: true });
    } finally {
      setBusy(false);
    }
  }
  async function retry(sessionId: string) {
    setBusy(true);
    const r = await requestJoin(sessionId);
    setMessage(r?.blocked ? { text: "One part has no surviving audio, so it cannot be reviewed. Assign a new attempt.", error: true }
      : r?.submitted ? { text: "Saved. It is ready for your review." } : { text: "Still saving. Try again in a minute.", error: true });
    await load();
    setBusy(false);
  }

  return (
    <section className="sp-card sp-mock-panel" aria-labelledby="sp-mock-heading">
      <span className="sp-pill">Practice mock · Recorded examiner · Not an official IELTS test</span>
      <h2 id="sp-mock-heading">Speaking practice mock</h2>
      <p>The student takes it alone, in their own time. A recorded examiner asks the questions. You review it here like an interview. It never counts as a screener.</p>
      {available.length > 0 && (
        <div className="sp-mock-assign">
          <label>
            Mock
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              <option value={AUTO}>Automatic · one they have not had</option>
              {available.map((c) => <option key={c.code} value={c.code}>{c.title}</option>)}
            </select>
          </label>
          <button type="button" className="sp-primary" disabled={busy || !!open || !code} onClick={() => void assign()}>
            {busy ? "Working…" : `Assign to ${studentName ?? "this student"}`}
          </button>
          {open && <p className="sp-note">{studentName ?? "This student"} already has {code === AUTO ? "a" : "this"} mock open.</p>}
          {listed.length > 1 && (
            <button type="button" className="sp-secondary" disabled={busy} onClick={() => void assignAll()}>
              {`Give everyone listed a mock (${listed.length})`}
            </button>
          )}
        </div>
      )}
      {message && <p className={message.error ? "sp-alert" : "sp-note"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      {rows.length > 0 && (
        <ul className="sp-mock-rows">
          {rows.map((r) => (
            <li key={r.assignment_id} className="sp-session-row">
              <div>
                <strong>{stateOf(r)}</strong>
                <p>
                  {r.title} · assigned {when(r.assigned_at)}{r.assigned_by ? ` by ${r.assigned_by}` : ""}
                  {r.interrupted_answers > 0 ? ` · ${r.interrupted_answers} interrupted or lost ${r.interrupted_answers === 1 ? "answer" : "answers"}` : ""}
                </p>
              </div>
              {!r.session_id && !r.cancelled_at && <button type="button" className="sp-secondary" disabled={busy} onClick={() => void cancel(r.assignment_id)}>Cancel</button>}
              {r.session_id && r.finished_at && r.status !== "submitted" && <button type="button" className="sp-secondary" disabled={busy} onClick={() => void retry(r.session_id!)}>Retry saving</button>}
              {r.session_id && r.status === "submitted" && <button type="button" className="sp-secondary" onClick={() => navigate(`/ielts/speaking-pilot/${r.session_id}`)}>{r.reviewed ? "Open review →" : "Review →"}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
