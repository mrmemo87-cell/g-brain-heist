import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  assignMockMix,
  deskState,
  mockOverview,
  type MockDeskOverview,
  type MockDeskState,
  type MockDeskStudent,
} from "../../../../services/ieltsSpeakingMockService";
import IeltsShellIcon from "../IeltsShellIcon";
import { displayDateLocale } from "../../../utils/displayDate";

/**
 * Teacher Speaking desk (Visual & UX Bible 13.12, Diagnostic Bible 10.12). One place for Speaking:
 * practice mocks students take alone (whole-class state, give mocks, open reviews) and the separate
 * face-to-face interviews. Read-only except "give a mock", which goes through the server's mix rule.
 */
const STATES: { id: MockDeskState | "all"; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "to_review", label: "To review" },
  { id: "in_progress", label: "Doing it now" },
  { id: "ready", label: "Not started" },
  { id: "none", label: "No mock" },
  { id: "reviewed", label: "Reviewed" },
];
const ORDER: Record<MockDeskState, number> = { to_review: 0, in_progress: 1, ready: 2, none: 3, reviewed: 4 };
const STATUS: Record<MockDeskState, string> = {
  to_review: "Finished · waiting for you",
  in_progress: "Doing it now",
  ready: "Given · not started",
  none: "No mock open",
  reviewed: "Reviewed",
};
const CHUNK = 60;
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(displayDateLocale(), { day: "numeric", month: "short" }) : "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function IeltsTeacherSpeaking({ schoolId, platformOwner = false }: { schoolId: string; platformOwner?: boolean }) {
  const navigate = useNavigate();
  const [data, setData] = useState<MockDeskOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<MockDeskState | "all">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await mockOverview(schoolId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [schoolId]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const students = data?.students ?? [];
  const published = data?.published_mocks ?? 0;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: students.length };
    for (const s of students) c[deskState(s)] = (c[deskState(s)] ?? 0) + 1;
    return c;
  }, [students]);
  // Who can get a new mock now: nothing open, and at least one published mock they have not had.
  const canGive = (s: MockDeskStudent) => ["none", "to_review", "reviewed"].includes(deskState(s)) && s.mocks_had < published;
  const giveable = students.filter(canGive);
  const shown = students
    .filter((s) => filter === "all" || deskState(s) === filter)
    .filter((s) => !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => ORDER[deskState(a)] - ORDER[deskState(b)] || a.name.localeCompare(b.name));

  const give = async (ids: string[], key: string) => {
    if (!ids.length) return;
    setBusy(key);
    setMessage(null);
    let assigned = 0, open = 0, done = 0;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const r = await assignMockMix(ids.slice(i, i + CHUNK));
        assigned += r.assigned;
        open += r.skipped.filter((x) => x.reason === "open_mock").length;
        done += r.skipped.filter((x) => x.reason === "no_new_mock").length;
      }
      const parts = [assigned ? `${plural(assigned, "student has", "students have")} a new mock. Classmates get different questions.` : "No new mocks were given."];
      if (open) parts.push(`${plural(open, "student already has", "students already have")} one open.`);
      if (done) parts.push(`${plural(done, "student has", "students have")} done every mock.`);
      setMessage({ text: parts.join(" ") });
    } catch {
      setMessage({ text: `The mocks could not be given${assigned ? ` to everyone (${assigned} done)` : ""}. Check your connection and try again.`, error: true });
    } finally {
      setBusy(null);
      await load();
    }
  };

  const action = (s: MockDeskStudent) => {
    const st = deskState(s);
    const session = s.current?.session_id;
    if (st === "to_review" && session) return <button type="button" className="itn-sd-btn is-go" onClick={() => navigate(`/ielts/speaking-pilot/${session}`)}>Review →</button>;
    if (st === "reviewed" && session) return <button type="button" className="itn-sd-btn" onClick={() => navigate(`/ielts/speaking-pilot/${session}`)}>Open →</button>;
    if (canGive(s)) return <button type="button" className="itn-sd-btn" disabled={!!busy} onClick={() => void give([s.id], s.id)}>{busy === s.id ? "Giving…" : "Give a mock"}</button>;
    if (st === "none") return <span className="itn-sd-quiet">Has done every mock</span>;
    return null;
  };

  return (
    <div className="itn-sd">
      <section className="itn-sd-card itn-sd-mocks" aria-labelledby="itn-sd-mocks">
        <div className="itn-sd-card-head">
          <span className="itn-tile-icon" aria-hidden="true"><IeltsShellIcon name="mic" size={22} /></span>
          <div>
            <h2 id="itn-sd-mocks">Practice mocks</h2>
            <p>Students take these alone, in a quiet place, with a recorded examiner. You review the answers. Practice only, never a band for reports.</p>
          </div>
        </div>
        {failed ? (
          <div className="isn-alert" role="alert"><p>The class list could not open just now.</p><button type="button" className="itn-see-all" onClick={() => void load()}>Try again</button></div>
        ) : !data ? (
          <div className="isn-skeletons" role="status" aria-label="Opening your class"><span /><span /></div>
        ) : !students.length ? (
          <p className="isn-waiting">No students to show yet. Students appear here once they have an IELTS place at your school.</p>
        ) : (
          <>
            <div className="itn-sd-give">
              <button type="button" className="itn-sd-btn is-main" disabled={!!busy || !giveable.length} onClick={() => void give(giveable.map((s) => s.id), "all")}>
                {busy === "all" ? "Giving mocks…" : giveable.length ? `Give a new mock to ${plural(giveable.length, "student", "students")}` : "Everyone has a mock"}
              </button>
              <small>Each student gets one they have not had. Classmates get different questions. Students with a mock open keep it.</small>
            </div>
            {message && <p className={"itn-message" + (message.error ? " is-error" : "")} role={message.error ? "alert" : "status"}>{message.text}</p>}
            <div className="itn-sd-filters" role="group" aria-label="Show students">
              {STATES.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} className={"itn-sd-chip" + (filter === f.id ? " is-on" : "") + (f.id === "to_review" && counts.to_review ? " is-hot" : "")}
                  onClick={() => setFilter(f.id)}>
                  {f.label} <b>{counts[f.id] ?? 0}</b>
                </button>
              ))}
            </div>
            {students.length > 12 && (
              <label className="itn-sd-search"><span className="isn-sr-only">Find a student</span>
                <input type="search" placeholder="Find a student" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            )}
            <ul className="itn-sd-list">
              {shown.map((s) => {
                const st = deskState(s);
                return (
                  <li key={s.id} className={"itn-sd-row is-" + st}>
                    <div className="itn-sd-who">
                      <strong>{s.name}</strong>
                      <span>{s.current ? `${s.current.title.replace("Speaking practice ", "")} · ${st === "to_review" || st === "reviewed" ? `finished ${day(s.current.finished_at)}` : `given ${day(s.current.assigned_at)}`}` : s.mocks_had ? `${plural(s.mocks_had, "mock", "mocks")} done` : "No mocks yet"}</span>
                    </div>
                    <span className={"itn-sd-status is-" + st}>{STATUS[st]}</span>
                    <div className="itn-sd-act">{action(s)}</div>
                  </li>
                );
              })}
              {!shown.length && <li className="isn-waiting">No students here.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="itn-sd-card" aria-labelledby="itn-sd-int">
        <div className="itn-sd-card-head">
          <span className="itn-tile-icon" aria-hidden="true"><IeltsShellIcon name="students" size={22} /></span>
          <div>
            <h2 id="itn-sd-int">Speaking interviews</h2>
            <p>You and the student, face to face, at a set time. Your device records both of you, then you review it.</p>
          </div>
        </div>
        <button type="button" className="itn-see-all" onClick={() => navigate("/ielts/speaking-interviews")}>Start or continue an interview →</button>
      </section>

      {platformOwner && (
        <button type="button" className="itn-see-all" onClick={() => navigate("/ielts/speaking-mock-studio")}>Owner · examiner voice studio →</button>
      )}
    </div>
  );
}
