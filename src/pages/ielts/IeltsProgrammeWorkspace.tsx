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
import { rpcIeltsReviewQueue, type IeltsReviewQueueItem } from "../../../services/ieltsTeacherReviewService";
import IeltsTeacherNavigation, { type IeltsTeacherNavKey } from "./IeltsTeacherNavigation";
import IeltsAssignmentEntry from "./IeltsAssignmentEntry";
import "../../styles/ielts-teacher-navigation.css";
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
  | "lessons"
  | "assign"
  | "batches";
const sections = [
  "overview",
  "students",
  "reviews",
  "team",
  "practice",
  "exams",
  "lessons",
  "assign",
  "batches",
];
type WaitingItem = { key: string; name: string; at: string; kind: string; route: string; started: boolean };
const formatDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
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
  const [practiceQueue, setPracticeQueue] = useState<IeltsReviewQueueItem[] | null>(null);
  const [practiceError, setPracticeError] = useState(false);
  const [planStudent, setPlanStudent] = useState<string | null>(null);
  const [planFocus, setPlanFocus] = useState<"plan" | "reports">("plan");
  useEffect(() => {
    setPlanStudent(null);
  }, [data?.school_id]);
  // Assigned practice waiting for a teacher; refreshed when the teacher returns to Today or the Review desk.
  useEffect(() => {
    if (!data?.can_manage || (section !== "overview" && section !== "reviews")) return;
    let alive = true;
    rpcIeltsReviewQueue({ schoolId: data.school_id, limit: 100 })
      .then((rows) => { if (alive) { setPracticeQueue(rows.filter((r) => r.review_status !== "finalized")); setPracticeError(false); } })
      .catch(() => { if (alive) { setPracticeQueue(null); setPracticeError(true); } });
    return () => { alive = false; };
  }, [data?.school_id, data?.can_manage, section, retry]);
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
          setData(null);
          setLoading(false);
          return;
        }
        const workspace = await programmeWorkspace(chosen, applied, offset);
        if (!alive) return;
        setData(workspace);
        setTeacher(workspace.lead?.teacher_id ?? "");
        setConfirmed(false);
      } catch {
        if (alive) {
          // Never keep previously visible learner data after a failed access refresh.
          setData(null);
          setError(
            "Your programme workspace could not open. Check your access and connection, then try again.",
          );
        }
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
  const teacherNavActive: IeltsTeacherNavKey =
    section === "overview" ? "today" : section === "assign" ? "practice" : section;
  const navigateTeacher = (key: IeltsTeacherNavKey) => {
    if (key === "today") open("overview");
    else if (key === "practice") openPractice("history");
    else open(key);
  };
  useEffect(() => {
    if (section !== "students") return;
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (next !== applied) { setApplied(next); setOffset(0); }
    }, 380);
    return () => window.clearTimeout(timer);
  }, [search, applied, section]);
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
  const screenerRoute = (skill: string, id: string) =>
    skill === "writing"
      ? `/ielts/writing-screener/reviews/${encodeURIComponent(id)}`
      : `/ielts/speaking-pilot/${encodeURIComponent(id)}`;
  // One queue for everything that needs a teacher: screener essays/interviews (programme workspace)
  // and assigned practice writing/speaking (rpc_ielts_review_queue). Read-only listing; review rules unchanged.
  const waiting: WaitingItem[] = [
    ...(data?.queue ?? []).map((q) => ({
      key: `s-${q.skill}-${q.attempt_id}`, name: q.name, at: q.created_at,
      kind: q.skill === "writing" ? "Writing screener essay" : "Speaking screener interview",
      route: screenerRoute(q.skill, q.attempt_id), started: false,
    })),
    ...(practiceQueue ?? []).map((q) => ({
      key: `p-${q.skill}-${q.attempt_id}`, name: q.student_name ?? "Student", at: q.submitted_at ?? "",
      kind: `${q.skill === "writing" ? "Writing" : "Speaking"} practice${q.task_title ? ` · ${q.task_title}` : ""}`,
      route: `/ielts/reviews/${q.skill}/${encodeURIComponent(q.attempt_id)}`, started: q.review_status === "in_review",
    })),
  ].sort((x, y) => (x.at || "").localeCompare(y.at || ""));
  const waitingCount = (data?.pending_count ?? 0) + (practiceQueue?.length ?? 0);
  const waitingList = (limit?: number) => (
    <ul className="ip-waiting" aria-label="Work waiting for review">
      {waiting.slice(0, limit).map((w, i) => (
        <li key={w.key}>
          <div>
            <strong>{w.name}</strong>
            <span>{w.kind}{w.at ? ` · submitted ${formatDay(w.at)}` : ""}{w.started ? " · draft saved" : ""}</span>
          </div>
          <button type="button" className={i === 0 ? "sp-primary" : "sp-secondary"} onClick={() => navigate(w.route)}>
            {w.started ? "Continue review" : "Review"}
          </button>
        </li>
      ))}
    </ul>
  );
  const sectionHead = (title: string, purpose: string, extra?: React.ReactNode) => (
    <header className="ip-section-head">
      <div><h2>{title}</h2><p>{purpose}</p></div>
      {extra}
    </header>
  );
  const queue = (
    <div className="ip-workspace-flow">
      {sectionHead("Review desk", "Everything your students submitted that needs a teacher. Oldest first.",
        <span className="ip-count-pill">{waitingCount} waiting</span>)}
      <section className="sp-card ip-panel">
        {waiting.length ? waitingList() : (
          <div className="ip-empty">
            <strong>Nothing is waiting for review.</strong>
            <p>Submitted essays and interviews appear here as soon as students send them.</p>
          </div>
        )}
        {practiceError && <p className="ip-note-line" role="status">Assigned practice could not be checked just now. <button type="button" className="ip-link-button" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>}
        {(data?.pending_count ?? 0) > 30 && <p className="ip-note-line">The 30 oldest screener submissions are shown.</p>}
        {data?.can_manage && (
          <p className="ip-note-line">
            <button type="button" className="ip-link-button" onClick={() => navigate(`/ielts/reviews?school=${data?.school_id}`)}>See reviewed and earlier work →</button>
          </p>
        )}
      </section>
      {data?.can_manage && (
        <section className="sp-card ip-panel" aria-label="Targeted practice feedback">
          <React.Suspense fallback={<p role="status">Loading targeted practice…</p>}>
            <Practice schoolId={data.school_id} reviewOnly />
          </React.Suspense>
        </section>
      )}
    </div>
  );
  return (
    <main className={`sp-page ip-page ${embedded ? "ip-embedded" : ""}`}>
      <header className="ip-top">
        {!embedded && <a className="ip-back" href="/">← Brains Heist</a>}
        <p className="ip-eyebrow">IELTS Programme{school?.name ? ` · ${school.name}` : ""}</p>
        <h1>Teaching workspace</h1>
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
          <IeltsTeacherNavigation active={teacherNavActive} onNavigate={navigateTeacher} canManage={data.can_manage} disabled={saving} reviewCount={waitingCount} />
          {section === "overview" && (
            <div className="ip-today">
              <section className="sp-card ip-panel ip-today-priority" aria-labelledby="ip-today-priority-title">
                <div className="ip-today-priority-copy">
                  <p className="ip-eyebrow">Needs you now</p>
                  <h2 id="ip-today-priority-title">
                    {waitingCount > 0
                      ? `${waitingCount} ${waitingCount === 1 ? "piece of work is" : "pieces of work are"} waiting for your review`
                      : data.can_manage
                        ? "Nothing to review. Get your next lesson ready"
                        : "Nothing to review. See how your students are doing"}
                  </h2>
                  {waitingCount > 0 ? waitingList(3) : (
                    <p>{data.can_manage
                      ? "Open the lesson pack, prepare your resources and plan the practice students will do next."
                      : "Open student progress to see available evidence across Listening, Reading, Writing and Speaking."}</p>
                  )}
                  <div className="ip-today-priority-actions">
                    <button
                      type="button"
                      className={waiting.length > 0 ? "sp-secondary" : "sp-primary"}
                      onClick={() => open(waitingCount > 0 ? "reviews" : data.can_manage ? "lessons" : "students")}
                    >
                      {waitingCount > 0
                        ? "Open review desk"
                        : data.can_manage
                          ? "Open lesson library"
                          : "View student progress"} →
                    </button>
                  </div>
                </div>
              </section>

              <section className="ip-today-teaching" aria-labelledby="ip-today-teaching-title">
                <h2 id="ip-today-teaching-title" className="ip-subhead">Everyday teaching</h2>
                <div className="ip-today-actions">
                  {data.can_manage && (
                    <button type="button" className="ip-today-action" onClick={() => open("lessons")}>
                      <span className="ip-today-action-copy">
                        <span className="ip-today-action-category">Prepare</span>
                        <strong>Lessons & teaching packs</strong>
                        <span>Lesson plans, slides, workbooks and approved audio.</span>
                      </span>
                      <span className="ip-today-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  {data.can_manage && (
                    <button type="button" className="ip-today-action" onClick={() => open("assign")}>
                      <span className="ip-today-action-copy">
                        <span className="ip-today-action-category">Assign</span>
                        <strong>Create assignment</strong>
                        <span>Give practice to a class, a course batch or one student.</span>
                      </span>
                      <span className="ip-today-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  <button type="button" className="ip-today-action" onClick={() => open("reviews")}>
                    <span className="ip-today-action-copy">
                      <span className="ip-today-action-category">Review</span>
                      <strong>Writing & Speaking reviews</strong>
                      <span>Read submitted work and share your feedback.</span>
                    </span>
                    <span className="ip-today-arrow" aria-hidden="true">→</span>
                  </button>
                  <button type="button" className="ip-today-action" onClick={() => open("students")}>
                    <span className="ip-today-action-copy">
                      <span className="ip-today-action-category">Follow up</span>
                      <strong>Student progress & plans</strong>
                      <span>Find a learner, see their four-skill evidence and open plans or reports.</span>
                    </span>
                    <span className="ip-today-arrow" aria-hidden="true">→</span>
                  </button>
                </div>
              </section>

              {data.can_manage && (
                <section className="ip-today-more" aria-labelledby="ip-today-more-title">
                  <h2 id="ip-today-more-title" className="ip-subhead">More tools</h2>
                  <div className="ip-today-links">
                    <button type="button" onClick={() => openPractice("targeted")}>
                      <strong>Targeted practice</strong>
                      <span>Evidence-led work for one student</span>
                    </button>
                    <button type="button" onClick={() => openPractice("history")}>
                      <strong>Practice history</strong>
                      <span>Current and previous student work</span>
                    </button>
                    <button type="button" onClick={() => open("batches")}>
                      <strong>Course batches</strong>
                      <span>Rosters and this week's practice</span>
                    </button>
                    <button type="button" onClick={() => navigate("/ielts/speaking-interviews")}>
                      <strong>Speaking interviews</strong>
                      <span>Conduct and record interviews</span>
                    </button>
                    <button type="button" onClick={() => open("exams")}>
                      <strong>Exam sessions</strong>
                      <span>Schedule, launch and monitor exams</span>
                    </button>
                  </div>
                </section>
              )}
              <p className="ip-note-line ip-evidence-note">
                <strong>Evidence before estimates.</strong> Screeners show a starting point, not an official IELTS band. Missing evidence is not a weakness.
              </p>
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
          {section === "lessons" && (data.can_manage ? <React.Suspense fallback={<p role="status">Opening lessons…</p>}><Lessons key={data.school_id} schoolId={data.school_id} onClose={() => open("overview")} onAssign={() => open("assign")} onProgress={() => open("students")} /></React.Suspense> : <section className="sp-card"><p>Your programme lead prepares school lessons.</p></section>)}
          {section === "assign" && (data.can_manage ? (
            <IeltsAssignmentEntry onBack={() => open("overview")} onContinue={(scope) => openPractice(scope === "student" ? "targeted" : "school")} />
          ) : <section className="sp-card"><p>Your programme lead manages IELTS assignments.</p></section>)}
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
          {section === "batches" && data.can_manage && <div className="ip-workspace-flow">{sectionHead("Course batches", "Group IELTS students across classes, see this week's practice and follow each student.")}<React.Suspense fallback={<p role="status">Opening course batches…</p>}><Batches key={data.school_id} schoolId={data.school_id} onAssign={() => { const u=new URL(window.location.href);u.searchParams.set("practice","school");window.history.replaceState({},"",u.pathname+u.search);open("practice"); }} /></React.Suspense></div>}
          {section === "team" && (
            <div className="ip-workspace-flow">{sectionHead("Programme team", "Who leads IELTS at your school and who can manage it.")}
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
            </div>
          )}
          {(section === "practice" || section === "exams") && (
            <div className="ip-workspace-flow">
              {section === "exams" && sectionHead("Exams", "Schedule, launch and monitor controlled IELTS exam sessions.")}
              {data.can_manage ? (
                <React.Suspense fallback={<p role="status">Opening teaching tools…</p>}>
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
                <section className="sp-card"><p>Your programme lead manages these school tools.</p></section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
