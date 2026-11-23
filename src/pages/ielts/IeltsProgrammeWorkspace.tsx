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
import IeltsTeacherNav, { type IeltsTeacherTab } from "../../components/ielts/teacher/IeltsTeacherNav";
import { rememberIeltsTeacherBar } from "../../components/ielts/teacher/IeltsTeacherPageBar";
import IeltsTeacherToday, { TeacherFeedbackCard, TeacherWaitingCard, type TeacherWaitingItem } from "../../components/ielts/teacher/IeltsTeacherToday";
import { IeltsCardGroup } from "../../components/ielts/student/IeltsStudentShell";
import { learningWorkspace, type LearningAllocation } from "../../../services/ieltsLearningService";
import { mockOverview, deskState, type MockDeskStudent } from "../../../services/ieltsSpeakingMockService";
import IeltsShellIcon from "../../components/ielts/IeltsShellIcon";
import "../../styles/ielts-teacher-navigation.css";
import "../../styles/ielts-speaking-pilot.css";
import "../../styles/ielts-programme.css";
import "../../styles/ielts-student-shell.css";
import "../../styles/ielts-teacher-shell.css";
const Practice = React.lazy(() => import("./IeltsLearningTeacher"));
const LearningPlanDesk = React.lazy(() => import("./IeltsLearningPlanDesk"));
const PracticeDesk = React.lazy(() => import("./IeltsTeacherPracticeDesk"));
const Lessons = React.lazy(() => import("./IeltsLessonLibrary"));
const Batches = React.lazy(() => import("./IeltsCourseBatches"));
const Exams = React.lazy(() => import("./IeltsExamManager"));
const Speaking = React.lazy(() => import("../../components/ielts/teacher/IeltsTeacherSpeaking"));
const ClassReport = React.lazy(() => import("../../components/ielts/teacher/IeltsClassReport"));
type Section =
  | "overview"
  | "students"
  | "reviews"
  | "team"
  | "practice"
  | "exams"
  | "lessons"
  | "assign"
  | "batches"
  | "speaking"
  | "school";
export type IeltsProgrammeSection = Section;
export type IeltsSchoolTool = "results" | "journeys" | "settings";
const schoolTools: { id: IeltsSchoolTool; label: string; hint: string }[] = [
  { id: "results", label: "Results", hint: "Scores from screeners and exams" },
  { id: "journeys", label: "Student journeys", hint: "Each learner's path through the programme" },
  { id: "settings", label: "IELTS settings", hint: "School configuration and features" },
];
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
  "speaking",
  "school",
];
export default function IeltsProgrammeWorkspace({
  embedded = false,
  schoolId,
  adminTools,
  adminView = null,
  adminExams,
  initialSection,
  initialSchoolTool,
  onSectionChange,
  onOpenAllReviews,
  onOpenExamMonitor,
}: {
  embedded?: boolean;
  schoolId?: string;
  /** School administration only: the "School" tab's tools, rendered inside the same tab bar. */
  adminTools?: Record<IeltsSchoolTool, React.ReactNode>;
  /** School administration only: a page the portal opened (a review, the full review list, an exam monitor). */
  adminView?: { tab: IeltsTeacherTab; node: React.ReactNode } | null;
  /** School administration only: its guarded exam workspace, shown under the Exams tab. */
  adminExams?: React.ReactNode;
  initialSection?: Section;
  initialSchoolTool?: IeltsSchoolTool;
  onSectionChange?: (section: Section) => void;
  onOpenAllReviews?: () => void;
  onOpenExamMonitor?: (examEventId: string) => void;
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
      initialSection ??
      "overview";
    return sections.includes(s) && (s !== "school" || adminTools) ? (s as Section) : "overview";
  });
  const [schoolTool, setSchoolTool] = useState<IeltsSchoolTool>(() => {
    const t = new URLSearchParams(window.location.search).get("schoolTool") ?? initialSchoolTool ?? "results";
    return schoolTools.some((x) => x.id === t) ? (t as IeltsSchoolTool) : "results";
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
  const [feedback, setFeedback] = useState<LearningAllocation[] | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const [planStudent, setPlanStudent] = useState<string | null>(null);
  // Class report (UX Bible 13.13): a view inside Students, kept in the address so Back and reload work.
  const [report, setReport] = useState(() => new URLSearchParams(window.location.search).get("report") === "1");
  useEffect(() => {
    const sync = () => setReport(new URLSearchParams(window.location.search).get("report") === "1");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
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
  // Targeted tasks students submitted that still need the teacher's feedback (Today and Reviews only).
  useEffect(() => {
    if (!data?.can_manage || (section !== "overview" && section !== "reviews")) return;
    let alive = true;
    learningWorkspace(data.school_id)
      .then((w) => { if (alive) { setFeedback(w.allocations.filter((a) => a.status === "submitted" && !a.reviewed)); setFeedbackError(false); } })
      .catch(() => { if (alive) { setFeedback(null); setFeedbackError(true); } });
    return () => { alive = false; };
  }, [data?.school_id, data?.can_manage, section, retry]);
  // Finished Speaking practice mocks waiting for a review (Diagnostic Bible 10.12; every reviewing teacher).
  const [mockQueue, setMockQueue] = useState<MockDeskStudent[] | null>(null);
  const [mockError, setMockError] = useState(false);
  useEffect(() => {
    if (!data?.school_id || (section !== "overview" && section !== "reviews")) return;
    let alive = true;
    mockOverview(data.school_id)
      .then((o) => { if (alive) { setMockQueue(o.students.filter((x) => deskState(x) === "to_review")); setMockError(false); } })
      .catch(() => { if (alive) { setMockQueue(null); setMockError(true); } });
    return () => { alive = false; };
  }, [data?.school_id, section, retry]);
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
      setSection(sections.includes(s) && (s !== "school" || adminTools) ? (s as Section) : "overview");
      const t = params.get("schoolTool");
      if (t && schoolTools.some((x) => x.id === t)) setSchoolTool(t as IeltsSchoolTool);
      if (!schoolId) setSelected(params.get("school") ?? "");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [schoolId, adminTools]);
  const openSchoolTool = (t: IeltsSchoolTool) => {
    setSchoolTool(t);
    const u = new URL(window.location.href);
    u.searchParams.set("schoolTool", t);
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  };
  const open = (s: Section) => {
    if (s === "practice") {
      setApplied("");
      setSearch("");
      setOffset(0);
    }
    setSection(s);
    setReport(false);
    const u = new URL(window.location.href);
    u.searchParams.set("programmeSection", s);
    u.searchParams.delete("report");
    if (data && !embedded) u.searchParams.set("school", data.school_id);
    window.history.pushState({}, "", u.pathname + u.search + u.hash);
    onSectionChange?.(s);
  };
  const openReport = (on: boolean) => {
    const u = new URL(window.location.href);
    u.searchParams.set("programmeSection", "students");
    if (on) u.searchParams.set("report", "1"); else u.searchParams.delete("report");
    window.history.pushState({}, "", u.pathname + u.search + u.hash);
    setPlanStudent(null);
    setReport(on);
    if (section !== "students") { setSection("students"); onSectionChange?.("students"); }
    window.scrollTo?.({ top: 0 });
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
  const teacherNavActive: IeltsTeacherTab = adminView?.tab ??
    (section === "overview" ? "today" : section === "assign" ? "practice" : section);
  const navigateTeacher = (key: IeltsTeacherTab) => {
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
  const waiting: TeacherWaitingItem[] = [
    ...(data?.queue ?? []).map((q) => ({
      key: `s-${q.skill}-${q.attempt_id}`, name: q.name, at: q.created_at, skill: q.skill,
      kind: q.skill === "writing" ? "Writing screener essay" : "Speaking screener interview",
      route: screenerRoute(q.skill, q.attempt_id), started: false,
    })),
    ...(practiceQueue ?? []).map((q) => ({
      key: `p-${q.skill}-${q.attempt_id}`, name: q.student_name ?? "Student", at: q.submitted_at ?? "",
      skill: (q.skill === "writing" ? "writing" : "speaking") as TeacherWaitingItem["skill"],
      kind: `${q.skill === "writing" ? "Writing" : "Speaking"} practice${q.task_title ? ` · ${q.task_title}` : ""}`,
      route: `/ielts/reviews/${q.skill}/${encodeURIComponent(q.attempt_id)}`, started: q.review_status === "in_review",
    })),
    ...(mockQueue ?? []).filter((m) => m.current?.session_id).map((m) => ({
      key: `m-${m.current!.session_id}`, name: m.name, at: m.current!.finished_at ?? "", skill: "speaking" as const,
      kind: `Speaking practice mock · ${m.current!.title.replace("Speaking practice mock ", "mock ")}`,
      route: `/ielts/speaking-pilot/${m.current!.session_id}`, started: false,
    })),
  ].sort((x, y) => (x.at || "").localeCompare(y.at || ""));
  const waitingCount = (data?.pending_count ?? 0) + (practiceQueue?.length ?? 0) + (mockQueue?.length ?? 0);
  const feedbackCount = feedback?.length ?? 0;
  // Teacher pages outside the workspace show the same bar straight away (IeltsTeacherPageBar).
  useEffect(() => {
    if (!data || embedded) return;
    rememberIeltsTeacherBar({ school_id: data.school_id, school_name: data.schools.find((s) => s.id === data.school_id)?.name, can_manage: data.can_manage, review_count: waitingCount });
  }, [data, embedded, waitingCount]);
  const heads: Partial<Record<Section, [string, string, string]>> = {
    reviews: ["Reviews", "Review desk", "Everything your students submitted that needs a teacher. Oldest first."],
    students: ["Students", "Student progress", "Find a learner, see their four-skill evidence and open plans or reports."],
    batches: ["Batches", "Course batches", "Group IELTS students across classes, assign practice to the whole batch and follow each student."],
    practice: ["Assign", "Assign work", "Give work to a class, a course batch, one student or a Speaking mock, and follow everything you have given."],
    assign: ["Assign", "Assign work", "Give work to a class, a course batch, one student or a Speaking mock, and follow everything you have given."],
    lessons: ["Lessons", "Lessons & teaching packs", "Lesson plans, slides, workbooks and approved audio."],
    exams: ["Exams", "Exams", "Schedule, launch and monitor controlled IELTS exam sessions."],
    team: ["Team", "Programme team", "Who leads IELTS at your school and who can manage it."],
    speaking: ["Speaking", "Speaking desk", "Practice mocks your students take alone, and the interviews you record with them."],
    school: ["School", "School IELTS administration", "Results, each student's journey and the school's IELTS settings."],
  };
  const head = heads[section];
  const openFromToday = (target: IeltsTeacherTab | "assign" | "targeted" | "history" | "interviews" | "report") => {
    if (target === "targeted" || target === "history") openPractice(target);
    else if (target === "report") openReport(true);
    else if (target === "interviews") navigate("/ielts/speaking-interviews");
    else if (target === "assign") openPractice("history");
    else navigateTeacher(target);
  };
  const reviews = (
    <div className="isn-groups">
      <IeltsCardGroup title="Writing & Speaking to review" count={waitingCount} tone="todo" id="itn-review-queue">
        {waiting.length ? waiting.map((w, i) => <TeacherWaitingCard key={w.key} item={w} index={i} />) : (
          <p className="isn-waiting"><span aria-hidden="true">✓</span> Nothing is waiting for review. Submitted essays and interviews appear here as soon as students send them.</p>
        )}
        {(practiceError || mockError) && <p className="isn-waiting" role="status">Some submitted work could not be checked just now. <button type="button" className="ij-link" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>}
        {(data?.pending_count ?? 0) > 30 && <p className="isn-waiting">The 30 oldest screener submissions are shown.</p>}
      </IeltsCardGroup>
      {data?.can_manage && (
        <IeltsCardGroup title="Targeted practice feedback" count={feedback === null ? "–" : feedbackCount} tone="feedback" defaultOpen={feedbackCount > 0}>
          {feedback?.map((t, i) => <TeacherFeedbackCard key={t.id} task={t} index={i} />)}
          {feedback !== null && feedbackCount === 0 && <p className="isn-waiting"><span aria-hidden="true">✓</span> No targeted work is waiting for feedback.</p>}
        </IeltsCardGroup>
      )}
      {data?.can_manage && (
        <IeltsCardGroup title="All targeted practice" count="Open" defaultOpen={false}>
          <div className="sp-page ip-page ip-embedded itn-legacy">
            <React.Suspense fallback={<p role="status">Loading targeted practice…</p>}>
              <Practice schoolId={data.school_id} reviewOnly />
            </React.Suspense>
          </div>
        </IeltsCardGroup>
      )}
      {data?.can_manage && (
        <button type="button" className="itn-see-all" onClick={() => (onOpenAllReviews ? onOpenAllReviews() : navigate(`/ielts/reviews?school=${data?.school_id}`))}>See reviewed and earlier work →</button>
      )}
    </div>
  );
  return (
    <div className={`isn-page itn-page ${data ? "has-nav" : ""} ${embedded ? "itn-embedded" : ""}`} data-ielts-teacher-shell="">
      <div className="isn-glow" aria-hidden="true" />
      <header className="isn-top">
        {!embedded ? <a className="isn-back" href="/"><span aria-hidden="true">←</span> Brains Heist</a> : <span />}
        <span className="isn-brand" aria-label="Brains Heist IELTS teaching"><span className="isn-mark" aria-hidden="true">IELTS</span><span className="isn-brand-text">Teaching{school?.name ? <span className="itn-brand-school"> · {school.name}</span> : null}</span></span>
      </header>
      {data && <IeltsTeacherNav active={teacherNavActive} onNavigate={navigateTeacher} canManage={data.can_manage} schoolAdmin={!!adminTools} disabled={saving} reviewCount={waitingCount} />}
      <main className="isn-main itn-main">
        {error && (
          <div className="isn-alert" role="alert">
            <p>{error}</p>
            <button className="itn-see-all" type="button" disabled={saving} onClick={() => { changeId.current = null; setRetry((n) => n + 1); }}>Refresh workspace</button>
          </div>
        )}
        {message && <p className="itn-message" role="status">{message}</p>}
        {loading && !data ? (
          <div className="isn-skeletons" role="status" aria-label="Opening your programme workspace"><span /><span /><span /></div>
        ) : !data ? (
          <section className="it-task isn-empty">
            <span aria-hidden="true"><IeltsShellIcon name="lock" size={26} /></span>
            <div>
              <h3>No school IELTS workspace is available.</h3>
              <p>An active IELTS agreement and an authorized staff allocation are required. Your school administrator can assign a programme lead in School Administration → IELTS Programme.</p>
            </div>
          </section>
        ) : adminView ? (
          <div className="itn-admin-view">{adminView.node}</div>
        ) : (
          <>
            {!schoolId && schools.length > 1 && (
              <label className="itn-school">
                <span>School</span>
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
                    setFeedback(null);
                    changeId.current = null;
                    const u = new URL(window.location.href);
                    u.searchParams.set("school", e.target.value);
                    window.history.replaceState({}, "", u.pathname + u.search);
                  }}
                >
                  {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {head && !(section === "students" && (planStudent || (report && data?.can_manage))) && (
              <div className="isn-head itn-head">
                <p className="isn-eyebrow">{head[0]}</p>
                <h1>{head[1]}</h1>
                <p className="isn-lead">{head[2]}</p>
              </div>
            )}
            {section === "overview" && (
              <IeltsTeacherToday
                schoolName={school?.name}
                canManage={data.can_manage}
                waiting={waiting}
                waitingCount={waitingCount}
                feedback={data.can_manage ? feedback : []}
                feedbackError={feedbackError}
                practiceError={practiceError || mockError}
                students={data.total_students}
                onOpen={openFromToday}
                onRetry={() => setRetry((n) => n + 1)}
                extraTools={data.platform_owner ? (
                  <IeltsCardGroup title="Platform content & analytics" count="2" defaultOpen={false}>
                    <p className="isn-waiting">Content administration and marketing analytics are separate from school assessment evidence.</p>
                    <div className="itn-links">
                      <button type="button" onClick={() => navigate("/ielts/admin")}><strong>Content administration</strong><span>Materials, releases and reviews</span></button>
                      <button type="button" onClick={() => navigate("/ielts/funnel")}><strong>Launch analytics</strong><span>Sign-ups and conversion</span></button>
                    </div>
                  </IeltsCardGroup>
                ) : undefined}
              />
            )}
            {section === "reviews" && reviews}
            {section === "school" && adminTools && (
              <section className="itn-school-tools" aria-label="School IELTS administration">
                <div className="itn-segmented" role="group" aria-label="School tools">
                  {schoolTools.map((t) => (
                    <button key={t.id} type="button" title={t.hint} aria-pressed={schoolTool === t.id} onClick={() => openSchoolTool(t.id)}>{t.label}</button>
                  ))}
                </div>
                <div className="itn-admin-view">{adminTools[schoolTool]}</div>
              </section>
            )}
            {section === "speaking" && (
              <React.Suspense fallback={<div className="isn-skeletons" role="status" aria-label="Opening Speaking"><span /><span /></div>}>
                <Speaking key={data.school_id} schoolId={data.school_id} platformOwner={!!data.platform_owner} />
              </React.Suspense>
            )}
            <div className="sp-page ip-page ip-embedded itn-legacy">
              {section === "lessons" && (data.can_manage ? <React.Suspense fallback={<p role="status">Opening lessons…</p>}><Lessons key={data.school_id} schoolId={data.school_id} onClose={() => open("overview")} onAssign={() => openPractice("history")} onProgress={() => open("students")} /></React.Suspense> : <section className="sp-card"><p>Your programme lead prepares school lessons.</p></section>)}
              {section === "students" && planStudent && (
                <React.Suspense fallback={<p role="status">Opening learning plan…</p>}>
                  <LearningPlanDesk key={data.school_id + planStudent} schoolId={data.school_id} studentId={planStudent} initialFocus={planFocus} onClose={() => setPlanStudent(null)} />
                </React.Suspense>
              )}
              {section === "students" && !planStudent && report && data.can_manage && (
                <React.Suspense fallback={<p role="status">Making the class report…</p>}>
                  <ClassReport key={data.school_id} schoolId={data.school_id} schoolName={data.schools.find((s) => s.id === data.school_id)?.name} onClose={() => openReport(false)} />
                </React.Suspense>
              )}
              {section === "students" && !planStudent && !(report && data.can_manage) && data.can_manage && (
                <div className="itn-cr-open">
                  <button type="button" className="itn-sd-btn is-main" onClick={() => openReport(true)}>Class report</button>
                  <span>Every piece of work each student was given, with results. Print it, save it as a PDF or download it for Excel.</span>
                </div>
              )}
              {section === "students" && !planStudent && !(report && data.can_manage) && (
                <IeltsStudentProgress
                  data={data}
                  search={search}
                  applied={applied}
                  offset={offset}
                  loading={loading}
                  onSearchChange={setSearch}
                  onSearch={(value) => { setApplied(value); setOffset(0); }}
                  onPage={setOffset}
                  onOpenPlan={(studentId, focus) => { setPlanFocus(focus); setPlanStudent(studentId); }}
                />
              )}
              {section === "batches" && data.can_manage && <React.Suspense fallback={<p role="status">Opening course batches…</p>}><Batches key={data.school_id} schoolId={data.school_id} onAssign={() => { const u=new URL(window.location.href);u.searchParams.set("practice","school");window.history.replaceState({},"",u.pathname+u.search);open("practice"); }} /></React.Suspense>}
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
              {(section === "practice" || section === "assign" || section === "exams") && (data.can_manage ? (
                <React.Suspense fallback={<p role="status">Opening teaching tools…</p>}>
                  {section !== "exams" ? (
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
                      <PracticeDesk key={data.school_id} schoolId={data.school_id} onOpenReviews={() => open("reviews")} onOpenBatches={() => open("batches")} onOpenSpeaking={() => open("speaking")} />
                    </SchoolAdminContext.Provider>
                  ) : (
                    adminExams ?? <Exams key={data.school_id} embedded schoolIdOverride={data.school_id} onOpenMonitor={onOpenExamMonitor} />
                  )}
                </React.Suspense>
              ) : (
                <section className="sp-card"><p>Your programme lead manages these school tools.</p></section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
