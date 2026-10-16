import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  programmeAccess,
  programmeWorkspace,
  setProgrammeLead,
  programmeEvidenceLabel,
  programmeEvidenceRoute,
  type ProgrammeSchool,
  type ProgrammeWorkspace,
} from "../../../services/ieltsProgrammeService";
import SchoolAdminContext from "../../../components/school-admin/SchoolAdminContext";
import IeltsStudentProgress from "./IeltsStudentProgress";
import "../../styles/ielts-speaking-pilot.css";
import "../../styles/ielts-programme.css";
const Practice = React.lazy(() => import("./IeltsLearningTeacher"));
const LearningPlanDesk = React.lazy(() => import("./IeltsLearningPlanDesk"));
const PracticeDesk = React.lazy(() => import("./IeltsTeacherPracticeDesk"));
const Lessons = React.lazy(() => import("./IeltsLessonLibrary"));
const Batches = React.lazy(() => import("./IeltsCourseBatches"));
const Exams = React.lazy(() => import("./IeltsExamManager"));
type Section =
  | "overview"
  | "students"
  | "reviews"
  | "team"
  | "practice"
  | "exams"
  | "lessons";
const sections = [
  "overview",
  "students",
  "reviews",
  "team",
  "practice",
  "exams",
  "lessons",
];
function Mark({ kind = "school" }: { kind?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={
          kind === "voice"
            ? "M12 3v10m-4-6v6a4 4 0 008 0V7M5 12a7 7 0 0014 0M12 19v3m-4 0h8"
            : kind === "review"
              ? "M5 3h14v18H5zM8 8h8M8 12h5M8 16h3"
              : "M3 10l9-7 9 7M5 9v12h14V9M9 21v-7h6v7"
        }
      />
    </svg>
  );
}
export default function IeltsProgrammeWorkspace({
  embedded = false,
  schoolId,
}: {
  embedded?: boolean;
  schoolId?: string;
}) {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<ProgrammeSchool[]>([]),
    [selected, setSelected] = useState(
      schoolId ??
        new URLSearchParams(window.location.search).get("school") ??
        "",
    ),
    [data, setData] = useState<ProgrammeWorkspace | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [section, setSection] = useState<Section>(() => {
    const s =
      new URLSearchParams(window.location.search).get("programmeSection") ??
      "overview";
    return sections.includes(s) ? (s as Section) : "overview";
  });
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [teacher, setTeacher] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const [planStudent, setPlanStudent] = useState<string | null>(null);
  const [planFocus, setPlanFocus] = useState<"plan" | "reports">("plan");
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setPlanStudent(null);
  }, [data?.school_id]);
  const lock = useRef(false),
    changeId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Keep the current student matrix mounted during search and pagination.
    // School changes explicitly clear it before fetching a new scope.
    setError("");
    void (async () => {
      try {
        const access = await programmeAccess();
        if (!alive) return;
        setSchools(access.schools);
        const id = schoolId ?? selected ?? "";
        const chosen = id || access.schools[0]?.id;
        if (!chosen) {
          setLoading(false);
          return;
        }
        const workspace = await programmeWorkspace(chosen, applied, offset);
        if (!alive) return;
        setData(workspace);
        setTeacher(workspace.lead?.teacher_id ?? "");
        setConfirmed(false);
      } catch {
        if (alive)
          setError(
            "Your programme workspace could not open. Check your access and connection, then try again.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [schoolId, selected, retry, applied, offset]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("programmeSection") ?? "overview";
      setSection(sections.includes(s) ? (s as Section) : "overview");
      if (!schoolId) setSelected(params.get("school") ?? "");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [schoolId]);
  const open = (s: Section) => {
    setNavOpen(false);
    if (s === "practice") {
      setApplied("");
      setSearch("");
      setOffset(0);
    }
    setSection(s);
    const u = new URL(window.location.href);
    u.searchParams.set("programmeSection", s);
    if (data && !embedded) u.searchParams.set("school", data.school_id);
    window.history.pushState({}, "", u.pathname + u.search + u.hash);
  };
  // Deep-link into the existing Practice Desk; do not create a second assignment flow.
  const openPractice = (mode: "history" | "targeted" | "school") => {
    const url = new URL(window.location.href);
    if (mode === "history") url.searchParams.delete("practice");
    else url.searchParams.set("practice", mode);
    url.searchParams.delete("assignment");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    open("practice");
  };
  useEffect(() => {
    if (section !== "students") return;
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (next !== applied) { setApplied(next); setOffset(0); }
    }, 380);
    return () => window.clearTimeout(timer);
  }, [search, applied, section]);
  useEffect(() => {
    if (!navOpen) return;
    const closeMenu = (event: KeyboardEvent) => { if (event.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, [navOpen]);
  const save = async () => {
    if (!data || lock.current || !confirmed) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      changeId.current ??= crypto.randomUUID();
      await setProgrammeLead(
        data.school_id,
        teacher || null,
        data.lead?.id ?? null,
        changeId.current,
      );
      changeId.current = null;
      setMessage(
        teacher
          ? "Programme lead updated. Their IELTS workspace is ready."
          : "Programme lead removed. Saved assessments and reviews are retained.",
      );
      setRetry((n) => n + 1);
    } catch {
      setError(
        "The allocation could not be confirmed. Refresh to check whether another administrator changed it, then try again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const school = data?.schools.find((s) => s.id === data.school_id);
  const reviewRoute = (skill: string, id: string) =>
    skill === "writing"
      ? `/ielts/writing-screener/reviews/${encodeURIComponent(id)}`
      : `/ielts/speaking-pilot/${encodeURIComponent(id)}`;
  const queue = (
    <section className="sp-card">
      <div className="ip-heading">
        <div>
          <p className="sp-eyebrow">Your review desk</p>
          <h2>Feedback that moves learning forward</h2>
        </div>
        <span className="sp-pill">
          {data?.pending_count ?? 0} awaiting review
        </span>
      </div>
      <p>
        Open the original work, draft with AI if useful, check the evidence and
        share your feedback.
      </p>
      {data?.queue.length ? (
        data.queue.map((q) => (
          <article
            className="sp-session-row"
            key={`${q.skill}-${q.attempt_id}`}
          >
            <div>
              <strong>{q.name}</strong>
              <p>
                {q.skill === "writing" ? "Writing essay" : "Speaking interview"}{" "}
                · {new Date(q.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              className="sp-primary"
              onClick={() => navigate(reviewRoute(q.skill, q.attempt_id))}
            >
              Review →
            </button>
          </article>
        ))
      ) : (
        <div className="ip-empty">
          <Mark kind="review" />
          <strong>Your review desk is clear.</strong>
          <p>New submitted essays and interviews will appear here.</p>
        </div>
      )}
      {(data?.pending_count ?? 0) > 30 && (
        <p>
          The 30 oldest submissions are shown first. Shared reviews leave this
          queue.
        </p>
      )}
      {data?.can_manage && (
        <React.Suspense fallback={<p>Loading practice reviews…</p>}>
          <Practice schoolId={data.school_id} reviewOnly />
        </React.Suspense>
      )}
      {data?.can_manage && (
        <details>
          <summary>Other practice submissions</summary>
          <p>Previously assigned practice uses its existing review workflow.</p>
          <button
            className="sp-secondary"
            onClick={() => navigate(`/ielts/reviews?school=${data?.school_id}`)}
          >
            Open practice reviews
          </button>
        </details>
      )}
    </section>
  );
  return (
    <main className={`sp-page ip-page ${embedded ? "ip-embedded" : ""}`}>
      <header className="sp-hero">
        <div>
          {!embedded && (
            <a className="sp-back" href="/">
              ← Brains Heist
            </a>
          )}
          <span className="sp-eyebrow">Brains Heist · IELTS Programme</span>
          <h1>Your IELTS teaching workspace</h1>
          <p>
            {school?.name ?? "Your school workspace"} · Lessons, assignments, reviews and learner progress in one place.
          </p>
        </div>
        <div className="ip-brand">
          <Mark />
        </div>
      </header>
      {error && (
        <div className="sp-alert" role="alert">
          {error}
          <button
            className="sp-secondary"
            disabled={saving}
            onClick={() => {
              changeId.current = null;
              setRetry((n) => n + 1);
            }}
          >
            Refresh workspace
          </button>
        </div>
      )}
      {message && (
        <p className="ip-message" role="status">
          {message}
        </p>
      )}
      {loading && !data ? (
        <section className="sp-card" role="status">
          Opening your programme workspace…
        </section>
      ) : !data ? (
        <section className="sp-card">
          <h2>No school IELTS workspace is available.</h2>
          <p>
            An active IELTS agreement and an authorized staff allocation are
            required. Your school administrator can assign a programme lead in
            School Administration → IELTS Programme.
          </p>
        </section>
      ) : (
        <>
          {!schoolId && schools.length > 1 && (
            <label className="ip-school">
              School
              <select
                value={data.school_id}
                disabled={saving}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setData(null);
                  setPlanStudent(null);
                  setOffset(0);
                  setApplied("");
                  setSearch("");
                  setMessage("");
                  changeId.current = null;
                  const u = new URL(window.location.href);
                  u.searchParams.set("school", e.target.value);
                  window.history.replaceState({}, "", u.pathname + u.search);
                }}
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="ip-mobile-nav-toggle" aria-controls="ielts-programme-nav" aria-expanded={navOpen} onClick={() => setNavOpen((value) => !value)}>☰ Programme navigation <span aria-hidden="true">{navOpen ? "⌃" : "⌄"}</span></button>
          <nav id="ielts-programme-nav" className={"ip-nav" + (navOpen ? " ip-nav-open" : "")} aria-label="Programme workspace">
            {(["overview", "students", "reviews", "team"] as Section[]).map(
              (s) => (
                <button
                  key={s}
                  aria-current={section === s ? "page" : undefined}
                  onClick={() => open(s)}
                  disabled={saving}
                >
                  <span aria-hidden="true" className="ip-nav-icon">{s === "overview" ? "◷" : s === "students" ? "▤" : s === "reviews" ? "▣" : "♧"}</span>
                  {s === "overview"
                    ? "Today"
                    : s === "students"
                      ? "Student progress"
                      : s === "reviews"
                        ? "Review desk"
                        : "Programme team"}
                </button>
              ),
            )}
          </nav>
          {section === "overview" && (
            <div className="ip-today">
              <section className="sp-card ip-today-priority" aria-labelledby="ip-today-priority-title">
                <div className="ip-today-priority-copy">
                  <p className="sp-eyebrow">Your next step</p>
                  <h2 id="ip-today-priority-title">
                    {data.pending_count > 0
                      ? "Student work is waiting for your review"
                      : data.can_manage
                        ? "Get your next IELTS lesson ready"
                        : "See how your students are doing"}
                  </h2>
                  <p>
                    {data.pending_count > 0
                      ? `${data.pending_count} submitted ${data.pending_count === 1 ? "essay or interview needs" : "essays or interviews need"} a teacher's attention. Open the evidence, review it and decide the next step.`
                      : data.can_manage
                        ? "Open the lesson pack, prepare your resources and plan the practice students will do next."
                        : "Open student progress to see available evidence across Listening, Reading, Writing and Speaking."}
                  </p>
                  <div className="ip-today-priority-actions">
                    <button
                      type="button"
                      className="sp-primary"
                      onClick={() => open(data.pending_count > 0 ? "reviews" : data.can_manage ? "lessons" : "students")}
                    >
                      {data.pending_count > 0
                        ? "Open review desk"
                        : data.can_manage
                          ? "Open lesson library"
                          : "View student progress"} →
                    </button>
                    {data.can_manage && data.pending_count > 0 && (
                      <button type="button" className="sp-secondary" onClick={() => open("lessons")}>
                        Prepare a lesson
                      </button>
                    )}
                  </div>
                </div>
                {data.pending_count > 0 && (
                  <div className="ip-today-priority-count" aria-label={`${data.pending_count} submissions waiting for review`}>
                    <strong>{data.pending_count}</strong>
                    <span>Awaiting review</span>
                  </div>
                )}
              </section>

              <section className="ip-today-teaching" aria-labelledby="ip-today-teaching-title">
                <div className="ip-today-heading">
                  <p className="sp-eyebrow">Everyday teaching</p>
                  <h2 id="ip-today-teaching-title">What would you like to do?</h2>
                  <p>Choose the job you're here for. Each option opens the existing tools, with your school access preserved.</p>
                </div>
                <div className="ip-today-actions">
                  {data.can_manage && (
                    <button type="button" className="ip-today-action" onClick={() => open("lessons")}>
                      <span className="ip-today-action-mark" aria-hidden="true"><Mark kind="review" /></span>
                      <span className="ip-today-action-copy">
                        <span className="ip-today-action-category">Prepare</span>
                        <strong>Lessons & teaching packs</strong>
                        <span>Lesson plans, presentations, workbooks, approved audio and downloads.</span>
                      </span>
                      <span className="ip-today-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  {data.can_manage && (
                    <button type="button" className="ip-today-action" onClick={() => openPractice("school")}>
                      <span className="ip-today-action-mark" aria-hidden="true"><Mark /></span>
                      <span className="ip-today-action-copy">
                        <span className="ip-today-action-category">Assign</span>
                        <strong>School assignments</strong>
                        <span>Choose approved materials for a class or IELTS course batch and track progress.</span>
                      </span>
                      <span className="ip-today-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  <button type="button" className="ip-today-action" onClick={() => open("reviews")}>
                    <span className="ip-today-action-mark" aria-hidden="true"><Mark kind="review" /></span>
                    <span className="ip-today-action-copy">
                      <span className="ip-today-action-category">Review</span>
                      <strong>Writing & Speaking reviews</strong>
                      <span>Open saved work and provide feedback under your existing review permissions.</span>
                    </span>
                    <span className="ip-today-arrow" aria-hidden="true">→</span>
                  </button>
                  <button type="button" className="ip-today-action" onClick={() => open("students")}>
                    <span className="ip-today-action-mark" aria-hidden="true"><Mark /></span>
                    <span className="ip-today-action-copy">
                      <span className="ip-today-action-category">Follow up</span>
                      <strong>Student progress & plans</strong>
                      <span>Find a learner, inspect four-skill evidence and open learning plans or reports.</span>
                    </span>
                    <span className="ip-today-arrow" aria-hidden="true">→</span>
                  </button>
                </div>
              </section>

              {data.can_manage && (
                <section className="sp-card ip-today-more" aria-labelledby="ip-today-more-title">
                  <div className="ip-today-heading">
                    <p className="sp-eyebrow">More teaching tools</p>
                    <h2 id="ip-today-more-title">Everything else is here when you need it</h2>
                    <p>Specialist workflows stay one click away, without crowding your everyday teaching.</p>
                  </div>
                  <div className="ip-today-links">
                    <button type="button" onClick={() => openPractice("targeted")}>
                      <strong>Targeted practice</strong>
                      <span>Assign evidence-led work to a student</span>
                    </button>
                    <button type="button" onClick={() => openPractice("history")}>
                      <strong>Practice history</strong>
                      <span>Find current and previous student work</span>
                    </button>
                    <button type="button" onClick={() => open("team")}>
                      <strong>Course batches</strong>
                      <span>Rosters, cross-class groups and late joiners</span>
                    </button>
                    <button type="button" onClick={() => navigate("/ielts/speaking-interviews")}>
                      <strong>Speaking interviews</strong>
                      <span>Conduct interviews and save recordings</span>
                    </button>
                    <button type="button" onClick={() => open("exams")}>
                      <strong>Exam sessions</strong>
                      <span>Schedule, launch and monitor exams</span>
                    </button>
                  </div>
                </section>
              )}
              <section className="ip-note" aria-label="IELTS evidence guidance">
                <strong>Evidence before estimates.</strong>
                <p>Screeners show a starting point, not an official IELTS band. Missing evidence is not a weakness; use reviewed work and appropriate follow-up before drawing conclusions.</p>
              </section>
              {data.platform_owner && (
                <details className="ip-today-admin">
                  <summary>Platform content & analytics</summary>
                  <p>Content administration and marketing analytics are separate from school assessment evidence.</p>
                  <button className="sp-secondary" onClick={() => navigate("/ielts/admin")}>Content administration</button>
                  <button className="sp-secondary" onClick={() => navigate("/ielts/funnel")}>Launch analytics</button>
                </details>
              )}
            </div>
          )}
          {section === "lessons" && (data.can_manage ? <React.Suspense fallback={<p role="status">Opening lessons…</p>}><Lessons key={data.school_id} schoolId={data.school_id} onClose={() => open("overview")} onAssign={() => open("practice")} onProgress={() => open("students")} /></React.Suspense> : <section className="sp-card"><p>Your programme lead prepares school lessons.</p></section>)}
          {section === "reviews" && queue}
          {section === "students" && planStudent && (
            <React.Suspense
              fallback={<p role="status">Opening learning plan…</p>}
            >
              <LearningPlanDesk
                key={data.school_id + planStudent}
                schoolId={data.school_id}
                studentId={planStudent}
                initialFocus={planFocus}
                onClose={() => setPlanStudent(null)}
              />
            </React.Suspense>
          )}
          {section === "students" && !planStudent && (
            <IeltsStudentProgress
              data={data}
              search={search}
              applied={applied}
              offset={offset}
              loading={loading}
              onSearchChange={setSearch}
              onSearch={(value) => { setApplied(value); setOffset(0); }}
              onPage={setOffset}
              onOpenPlan={(studentId, focus) => {
                setPlanFocus(focus);
                setPlanStudent(studentId);
              }}
            />
          )}
          {section === "team" && data.can_manage && <React.Suspense fallback={<p role="status">Opening course batches…</p>}><Batches key={data.school_id} schoolId={data.school_id} onAssign={() => { const u=new URL(window.location.href);u.searchParams.set("practice","school");window.history.replaceState({},"",u.pathname+u.search);open("practice"); }} /></React.Suspense>}
          {section === "team" && (
            <section className="sp-card">
              <p className="sp-eyebrow">A clear owner for your programme</p>
              <h2>
                {data.lead
                  ? `${data.lead.name} · Programme lead`
                  : "Allocate an IELTS programme lead"}
              </h2>
              <p>
                The lead can manage school IELTS practice and exam sessions,
                conduct Speaking interviews, and review school Writing and
                Speaking. School administration, billing and content publication
                permissions stay with their existing owners.
              </p>
              {data.can_allocate ? (
                <fieldset disabled={saving}>
                  <legend>School administrator allocation</legend>
                  <label>
                    Teacher
                    <select
                      value={teacher}
                      onChange={(e) => {
                        setTeacher(e.target.value);
                        setConfirmed(false);
                        changeId.current = null;
                        setMessage("");
                      }}
                    >
                      <option value="">No programme lead</option>
                      {data.lead &&
                        !data.teachers.some(
                          (t) => t.id === data.lead?.teacher_id,
                        ) && (
                          <option value={data.lead.teacher_id} disabled>
                            {data.lead.name} · Inactive
                          </option>
                        )}
                      {data.teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sp-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm this teacher should manage the school IELTS
                    programme. Replacing or removing the lead revokes that
                    programme access.
                  </label>
                  <button
                    className="sp-primary"
                    disabled={
                      !confirmed || teacher === (data.lead?.teacher_id ?? "")
                    }
                    onClick={() => void save()}
                  >
                    {saving ? "Saving allocation…" : "Save allocation"}
                  </button>
                  <p>
                    Only active teachers in this school can be selected. No
                    teacher has been selected on your behalf.
                  </p>
                </fieldset>
              ) : (
                <p>
                  Your school administrator manages this allocation. Teachers
                  retain access to their normally allocated students.
                </p>
              )}
              <a className="ip-link" href="/ielts/programme">
                Teacher workspace: brainsheist.com/ielts/programme →
              </a>
            </section>
          )}
          {(section === "practice" || section === "exams") && (
            <section className="sp-card">
              <button className="sp-secondary" onClick={() => open("overview")}>
                ← Today
              </button>
              {data.can_manage ? (
                <React.Suspense
                  fallback={<p role="status">Opening teaching tools…</p>}
                >
                  {section === "practice" ? (
                    <SchoolAdminContext.Provider
                      value={{
                        school: { id: data.school_id, name: school?.name },
                        classes: data.classes,
                        students: data.students,
                        studentCount: data.total_students,
                        studentAssignments: {},
                        addToast: (msg: string) => setMessage(msg),
                      }}
                    >
                      <PracticeDesk
                        key={data.school_id}
                        schoolId={data.school_id}
                        onOpenReviews={() => open("reviews")}
                      />
                    </SchoolAdminContext.Provider>
                  ) : (
                    <Exams
                      key={data.school_id}
                      embedded
                      schoolIdOverride={data.school_id}
                    />
                  )}
                </React.Suspense>
              ) : (
                <p>Your programme lead manages these school tools.</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
