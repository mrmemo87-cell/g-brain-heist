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
import "../../styles/ielts-speaking-pilot.css";
import "../../styles/ielts-programme.css";
const Practice = React.lazy(() => import("./IeltsLearningTeacher"));
const LearningPlanDesk = React.lazy(() => import("./IeltsLearningPlanDesk"));
const PracticeDesk = React.lazy(() => import("./IeltsTeacherPracticeDesk"));
const Exams = React.lazy(() => import("./IeltsExamManager"));
type Section =
  | "overview"
  | "students"
  | "reviews"
  | "team"
  | "practice"
  | "exams";
const sections = [
  "overview",
  "students",
  "reviews",
  "team",
  "practice",
  "exams",
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
  useEffect(() => {
    setPlanStudent(null);
  }, [data?.school_id]);
  const lock = useRef(false),
    changeId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
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
          <h1>One programme. A clear next step.</h1>
          <p>
            {school?.name ?? "Your school workspace"} · Plan, review and guide
            learning across all four skills.
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
      {loading ? (
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
          <nav className="ip-nav" aria-label="Programme workspace">
            {(["overview", "students", "reviews", "team"] as Section[]).map(
              (s) => (
                <button
                  key={s}
                  aria-current={section === s ? "page" : undefined}
                  onClick={() => open(s)}
                  disabled={saving}
                >
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
            <>
              <section className="ip-grid">
                <article className="sp-card">
                  <p className="sp-eyebrow">Programme lead</p>
                  <h2>{data.lead?.name ?? "Choose your programme lead"}</h2>
                  <p>
                    {data.lead
                      ? data.lead.active
                        ? "Responsible for school IELTS planning and reviews."
                        : "This allocation is inactive. Choose an active teacher."
                      : "Give one teacher a clear home for coordinating IELTS."}
                  </p>
                  <button className="sp-secondary" onClick={() => open("team")}>
                    {data.can_allocate
                      ? "Manage allocation"
                      : "View programme team"}{" "}
                    →
                  </button>
                </article>
                <article className="sp-card">
                  <p className="sp-eyebrow">Next action</p>
                  <h2>
                    {data.pending_count
                      ? "Students are waiting for feedback."
                      : "Build a starting point."}
                  </h2>
                  <p>
                    {data.pending_count
                      ? `${data.pending_count} submitted essays or interviews are ready for a teacher.`
                      : "Check the four skills, then choose the next evidence or practice step."}
                  </p>
                  <button
                    className="sp-primary"
                    onClick={() =>
                      open(data.pending_count ? "reviews" : "students")
                    }
                  >
                    {data.pending_count
                      ? "Open review desk"
                      : "View student progress"}{" "}
                    →
                  </button>
                </article>
              </section>
              <section className="sp-card">
                <p className="sp-eyebrow">Your teaching toolkit</p>
                <h2>Start with the work that matters today.</h2>
                <div className="ip-tools">
                  <button
                    onClick={() => navigate("/ielts/speaking-interviews")}
                  >
                    <Mark kind="voice" />
                    <strong>Conduct Speaking</strong>
                    <span>
                      Three parts, saved audio and teacher-confirmed feedback.
                    </span>
                  </button>
                  <button onClick={() => open("reviews")}>
                    <Mark kind="review" />
                    <strong>Review Writing & Speaking</strong>
                    <span>
                      Original evidence, AI assistance and clear next steps.
                    </span>
                  </button>
                  {data.can_manage && (
                    <>
                      <button onClick={() => open("practice")}>
                        <Mark />
                        <strong>Assign practice</strong>
                        <span>
                          Choose tasks, assign a class and track completion.
                        </span>
                      </button>
                      <button onClick={() => open("exams")}>
                        <Mark />
                        <strong>Manage exams</strong>
                        <span>
                          Schedule, launch and monitor secure sessions.
                        </span>
                      </button>
                    </>
                  )}
                </div>
                {data.platform_owner && (
                  <details>
                    <summary>Platform content & analytics</summary>
                    <p>
                      Content administration and marketing analytics are
                      separate from school assessment evidence.
                    </p>
                    <button
                      className="sp-secondary"
                      onClick={() => navigate("/ielts/admin")}
                    >
                      Content administration
                    </button>
                    <button
                      className="sp-secondary"
                      onClick={() => navigate("/ielts/funnel")}
                    >
                      Launch analytics
                    </button>
                  </details>
                )}
              </section>
              <section className="ip-note">
                <strong>Evidence before estimates.</strong>
                <p>
                  Screeners show a starting point. Confidence is low. Missing
                  evidence is not a weakness, and these snapshots do not give an
                  overall IELTS band.
                </p>
              </section>
            </>
          )}
          {section === "reviews" && queue}
          {section === "students" && planStudent && (
            <React.Suspense
              fallback={<p role="status">Opening learning plan…</p>}
            >
              <LearningPlanDesk
                key={data.school_id + planStudent}
                schoolId={data.school_id}
                studentId={planStudent}
                onClose={() => setPlanStudent(null)}
              />
            </React.Suspense>
          )}
          {section === "students" && !planStudent && (
            <section className="sp-card">
              <p className="sp-eyebrow">
                Four skills · Latest submitted evidence
              </p>
              <h2>See who needs their next step.</h2>
              <p>
                Scores refer to the submitted screener. Teacher feedback refers
                to that essay or interview only. Confidence: low.
              </p>
              <form
                className="ip-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied(search.trim());
                  setOffset(0);
                }}
              >
                <label>
                  Find a student
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button className="sp-secondary">Search</button>
              </form>
              <div className="ip-students">
                {data.students.map((s) => (
                  <article className="ip-student" key={s.id}>
                    <h3>{s.name}</h3>
                    <button
                      className="sp-primary"
                      onClick={() => setPlanStudent(s.id)}
                    >
                      Learning plan & monthly reports →
                    </button>
                    <div className="ip-skills">
                      {(
                        ["listening", "reading", "writing", "speaking"] as const
                      ).map((k) => {
                        const route = programmeEvidenceRoute(k, s[k]);
                        return (
                          <div key={k}>
                            <strong>{k[0].toUpperCase() + k.slice(1)}</strong>
                            <span>{programmeEvidenceLabel(k, s[k])}</span>
                            {route && (
                              <button
                                className="ip-link"
                                onClick={() => navigate(route)}
                              >
                                Open evidence →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
              {!data.students.length && (
                <p>No matching eligible students in your authorized scope.</p>
              )}
              <div className="ip-heading">
                <p>
                  {data.total_students} matching students ·{" "}
                  {data.students.length
                    ? "Showing " +
                      (offset + 1) +
                      "–" +
                      (offset + data.students.length)
                    : "No results"}
                </p>
                <div>
                  <button
                    className="sp-secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset((n) => Math.max(0, n - 50))}
                  >
                    Previous
                  </button>
                  <button
                    className="sp-secondary"
                    disabled={offset + 50 >= data.total_students}
                    onClick={() => setOffset((n) => n + 50)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
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
