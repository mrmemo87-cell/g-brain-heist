import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  programmeEvidenceLabel,
  programmeEvidenceRoute,
  type ProgrammeEvidence,
  type ProgrammeStudent,
  type ProgrammeWorkspace,
} from "../../../services/ieltsProgrammeService";
import { responseCoverage } from "../../../services/ieltsResponseCoverage";
import {
  learningReportContext,
  type LearningReportContext,
  type ReportEvidence,
} from "../../../services/ieltsLearningReportService";
import "../../styles/ielts-student-progress.css";

const skills = ["listening", "reading", "writing", "speaking"] as const;
type Skill = (typeof skills)[number];

const names: Record<Skill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};
const icons: Record<Skill, string> = {
  listening: "◉",
  reading: "▤",
  writing: "✎",
  speaking: "♫",
};
const pageSize = 50;

function status(skill: Skill, evidence: ProgrammeEvidence | null) {
  if (!evidence) return "none";
  if (skill === "writing" || skill === "speaking")
    return evidence.reviewed ? "reviewed" : "pending";
  const coverage = responseCoverage(evidence.items_answered, evidence.total);
  return coverage === "complete" ? "complete" : coverage === "partial" ? "partial" : coverage === "empty" ? "empty" : "unknown";
}

function Accordion({
  title,
  icon,
  children,
  initialOpen = true,
  trailing,
  className = "",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  initialOpen?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(initialOpen);
  return (
    <details className={"isi-accordion " + className} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>
        <span className="isi-section-title"><span aria-hidden="true" className="isi-section-icon">{icon}</span>{title}</span>
        <span className="isi-section-right">{trailing}<span className="isi-chevron" aria-hidden="true">⌄</span></span>
      </summary>
      <div className="isi-section-content">{children}</div>
    </details>
  );
}

function SkillStatus({ skill, evidence, onOpen }: {
  skill: Skill;
  evidence: ProgrammeEvidence | null;
  onOpen: (route: string) => void;
}) {
  const route = programmeEvidenceRoute(skill, evidence);
  return (
    <div className={"isi-cell isi-status-" + status(skill, evidence)}>
      <span className="isi-status-dot" aria-hidden="true" />
      <span className="isi-cell-body">
        <span className="isi-cell-description">{programmeEvidenceLabel(skill, evidence)}</span>
        {route && <button type="button" className="isi-text-link" onClick={(event) => { event.stopPropagation(); onOpen(route); }}>Open evidence →</button>}
      </span>
    </div>
  );
}

function EvidenceCard({ skill, evidence, onOpen }: {
  skill: Skill;
  evidence: ProgrammeEvidence | null;
  onOpen: (route: string) => void;
}) {
  const route = programmeEvidenceRoute(skill, evidence);
  const state = status(skill, evidence);
  const coverage = evidence && (skill === "reading" || skill === "listening")
    ? responseCoverage(evidence.items_answered, evidence.total)
    : null;
  const hasScore = evidence && (skill === "reading" || skill === "listening")
    && Number.isInteger(evidence.raw_score) && Number.isInteger(evidence.total);
  const label = state === "reviewed" ? "Feedback ready"
    : state === "complete" ? "Complete evidence"
    : state === "partial" ? "Incomplete"
    : state === "empty" ? "No answers"
    : state === "pending" ? "Review pending"
    : state === "unknown" ? "Coverage unknown" : "No evidence";
  return (
    <article className={"isi-evidence-card isi-status-" + state}>
      <div className="isi-card-heading">
        <span className="isi-skill-name"><span className="isi-skill-icon" aria-hidden="true">{icons[skill]}</span>{names[skill]}</span>
        <span className="isi-chip">{label}</span>
      </div>
      {hasScore && evidence ? <strong className="isi-card-score">{evidence.raw_score} / {evidence.total}</strong>
        : evidence?.reviewed ? <strong className="isi-card-state">Teacher feedback ready</strong>
        : <strong className="isi-card-state">{evidence ? "Evidence submitted" : "No submitted evidence"}</strong>}
      <p className="isi-card-meta">
        {coverage === "complete" ? "Screener · " + evidence?.items_answered + "/" + evidence?.total + " answered"
          : (skill === "reading" || skill === "listening") && evidence ? "Screener · " + (coverage === "partial" ? "Incomplete evidence" : coverage === "empty" ? "No assessment evidence" : "Response coverage unavailable")
          : evidence?.reviewed ? "Finalized teacher feedback"
          : evidence ? programmeEvidenceLabel(skill, evidence) : "No submitted work yet"}
      </p>
      {route && <button type="button" className="isi-text-link" onClick={() => onOpen(route)}>Open evidence →</button>}
    </article>
  );
}

type NextStep = { title: string; description: string };
function nextSteps(student: ProgrammeStudent): NextStep[] {
  const steps: NextStep[] = [];
  for (const skill of ["reading", "listening"] as const) {
    const evidence = student[skill];
    const coverage = responseCoverage(evidence?.items_answered, evidence?.total);
    if (!evidence || coverage === "empty" || coverage === "partial" || coverage === "unknown") {
      steps.push({
        title: !evidence ? "Arrange " + names[skill].toLowerCase() + " evidence" : "Review " + names[skill].toLowerCase() + " evidence",
        description: !evidence
          ? "No submitted " + names[skill].toLowerCase() + " screener is available yet."
          : coverage === "partial" ? "The latest screener is not fully answered. Check the missing evidence and decide whether a fresh assessment is appropriate."
          : coverage === "empty" ? "No answers were recorded in the latest screener. Arrange an appropriate new check."
          : "Response coverage could not be confirmed. Inspect the saved screener before interpreting its score.",
      });
    }
  }
  for (const skill of ["writing", "speaking"] as const) {
    const evidence = student[skill];
    if (evidence?.reviewed) {
      steps.push({
        title: "Discuss " + names[skill].toLowerCase() + " feedback",
        description: "Open the finalized teacher review and agree on a focused follow-up using the documented feedback.",
      });
    } else if (!evidence) {
      steps.push({
        title: "Gather " + names[skill].toLowerCase() + " evidence",
        description: "No submitted " + names[skill].toLowerCase() + " evidence is available to inform a specific next step.",
      });
    } else {
      steps.push({
        title: "Check " + names[skill].toLowerCase() + " review status",
        description: "The submission does not yet have finalized teacher feedback.",
      });
    }
  }
  return steps.slice(0, 3);
}

function readableDate(raw: string | null | undefined) {
  if (!raw) return "Date unavailable";
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? "Date unavailable" : value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function activityTitle(e: ReportEvidence) {
  if (e.reviewed_at || e.review_id) return names[e.skill] + " feedback recorded";
  if (e.kind === "guided_practice") return names[e.skill] + " practice " + (e.status === "completed" ? "completed" : "recorded");
  return names[e.skill] + " evidence submitted";
}

function IntelligenceDrawer({
  student,
  workspace,
  onClose,
  onOpenPlan,
}: {
  student: ProgrammeStudent;
  workspace: ProgrammeWorkspace;
  onClose: () => void;
  onOpenPlan: (studentId: string, section: "plan" | "reports") => void;
}) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<LearningReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const [modal, setModal] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 1199px)").matches : false);

  useEffect(() => {
    let active = true;
    setRecord(null);
    setLoading(true);
    setError("");
    void learningReportContext(workspace.school_id, student.id)
      .then((context) => { if (active) setRecord(context); })
      .catch(() => { if (active) setError("The learner history could not be loaded. You can still open the existing learning plan."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.school_id, student.id, retry]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setModal(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [modal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (!modal || event.key !== "Tab" || !drawerRef.current) return;
      const items = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),summary,[tabindex="0"]'))
        .filter((item) => item.getClientRects().length > 0 || !window.matchMedia);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal, onClose]);

  const recommendations = useMemo(() => nextSteps(student), [student]);
  const timeline = useMemo(() => (record?.evidence ?? [])
    .filter((e) => !!e.occurred_at && skills.includes(e.skill))
    .slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 8), [record]);
  const evidenceCount = skills.filter((skill) => !!student[skill]).length;
  return (
    <>
      {modal && <button type="button" aria-label="Close learner details" className="isi-backdrop" onClick={onClose} />}
      <aside className="isi-drawer" ref={drawerRef} tabIndex={-1} aria-label={student.name + " student intelligence"} role={modal ? "dialog" : "complementary"} aria-modal={modal ? true : undefined}>
        <header className="isi-drawer-header">
          <span className="isi-avatar isi-avatar-large" aria-hidden="true">{student.name.charAt(0).toUpperCase()}</span>
          <span className="isi-identity"><strong title={student.name}>{student.name}</strong><small>Student intelligence</small></span>
          <button type="button" className="isi-icon-button isi-close" onClick={onClose} aria-label="Close student intelligence">×</button>
        </header>
        <div className="isi-drawer-scroll">
          <Accordion title="Evidence quality & limitations" icon="ⓘ">
            <div className="isi-confidence">
              <strong>Evidence is limited</strong>
              <p>Screeners are starting-point evidence, not official IELTS bands. Teacher feedback applies only to the reviewed essay or interview. Do not infer long-term attainment from a single submission.</p>
            </div>
          </Accordion>
          <Accordion title="Latest evidence" icon="▤" trailing={<span className="isi-section-count">{evidenceCount}/4 skills</span>}>
            <div className="isi-evidence-grid">
              {skills.map((skill) => <EvidenceCard key={skill} skill={skill} evidence={student[skill]} onOpen={navigate} />)}
            </div>
          </Accordion>
          <Accordion title="Learning plan & monthly reports" icon="▣">
            <p className="isi-muted">Open this learner's existing personalized plan, evidence history and saved reports.</p>
            {loading ? <p className="isi-muted" role="status">Checking saved learning record…</p>
              : error ? <p className="isi-muted">{error}</p>
              : <p className="isi-muted">{record?.plan ? "Learning plan available" : "No shared plan yet"} · {record?.reports.length ?? 0} saved reports</p>}
            <div className="isi-actions">
              <button type="button" className="isi-primary" onClick={() => onOpenPlan(student.id, "plan")}>Open learning plan →</button>
              <button type="button" className="isi-secondary" onClick={() => onOpenPlan(student.id, "reports")}>View monthly reports</button>
            </div>
          </Accordion>
          <Accordion title="Recommended next steps" icon="◎">
            <p className="isi-muted">Suggested follow-up from the available submission and review statuses — not an automated proficiency judgment.</p>
            <ol className="isi-next-steps">
              {recommendations.map((step, index) => <li key={index}>
                <span className="isi-number" aria-hidden="true">{index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.description}</p></div>
              </li>)}
            </ol>
          </Accordion>
          <Accordion title="Recent activity" icon="◷" initialOpen={false} trailing={timeline.length > 0 ? <span className="isi-section-count">{timeline.length} recent</span> : undefined}>
            {loading ? <p className="isi-muted" role="status">Loading learner activity…</p>
              : error ? <div role="alert"><p className="isi-muted">{error}</p><button type="button" className="isi-secondary" onClick={() => setRetry((n) => n + 1)}>Retry activity</button></div>
              : timeline.length ? <ol className="isi-timeline">{timeline.map((event) => <li key={event.instance_id + ":" + event.source_id + ":" + event.occurred_at}>
                  <span className="isi-timeline-dot" aria-hidden="true" />
                  <div><strong>{activityTitle(event)}</strong><small>{event.kind === "guided_practice" ? "Guided practice" : "Saved assessment evidence"}</small></div>
                  <time dateTime={event.occurred_at}>{readableDate(event.occurred_at)}</time>
                </li>)}</ol>
                : <p className="isi-muted">No recent activity to display.</p>}
          </Accordion>
        </div>
      </aside>
    </>
  );
}

export default function IeltsStudentProgress({
  data,
  search,
  applied,
  offset,
  loading,
  onSearchChange,
  onSearch,
  onPage,
  onOpenPlan,
}: {
  data: ProgrammeWorkspace;
  search: string;
  applied: string;
  offset: number;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onPage: (offset: number) => void;
  onOpenPlan: (studentId: string, section: "plan" | "reports") => void;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const selected = data.students.find((s) => s.id === selectedId) ?? null;
  const close = () => {
    const id = selectedId;
    setSelectedId(null);
    if (id) window.requestAnimationFrame?.(() => buttonRefs.current[id]?.focus());
  };
  useEffect(() => {
    if (selectedId && !data.students.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [data.students, selectedId]);
  const totalPages = Math.max(1, Math.ceil(data.total_students / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  return (
    <div className={"isi-layout" + (selected ? " isi-with-drawer" : "")}>
      <div className="isi-main">
        <Accordion title="Student progress & evidence" icon="▤" className="isi-intro">
          <p className="sp-eyebrow">Four skills · Latest submitted evidence</p>
          <h2>See who needs their next step.</h2>
          <p className="isi-muted">Scores refer to the submitted screener. Teacher feedback applies to the submitted essay or interview only. Screeners do not provide an official IELTS band.</p>
        </Accordion>
        <Accordion title="Find a student" icon="⌕" className="isi-search-section">
          <form className="isi-search-form" onSubmit={(event) => { event.preventDefault(); onSearch(search.trim()); }}>
            <label className="isi-search-input">
              <span className="isi-visually-hidden">Search by name or username</span>
              <span aria-hidden="true">⌕</span>
              <input autoComplete="off" placeholder="Search students by name or username…" value={search} onChange={(event) => onSearchChange(event.target.value)} />
              {search && <button type="button" aria-label="Clear student search" onClick={() => { onSearchChange(""); onSearch(""); }}>×</button>}
            </label>
            <button className="isi-search-submit" type="submit">Search</button>
          </form>
          {applied && <p className="isi-muted isi-search-note">Showing results for “{applied}”</p>}
        </Accordion>
        <Accordion title="Student evidence matrix" icon="▦" className="isi-matrix-accordion">
        <section aria-label="Student evidence matrix" className="isi-matrix" aria-busy={loading}>
          <div className="isi-table-scroll">
            <table>
              <thead><tr><th scope="col">Student</th>{skills.map((skill) => <th key={skill} scope="col">{names[skill]}</th>)}</tr></thead>
              <tbody>
                {data.students.map((student) => (
                  <tr key={student.id} className={selectedId === student.id ? "isi-selected" : ""} onClick={() => setSelectedId(student.id)}>
                    <th scope="row">
                      <div className="isi-student-identity">
                        <span className="isi-avatar" aria-hidden="true">{student.name.charAt(0).toUpperCase()}</span>
                        <div className="isi-student-names">
                          <button type="button" className="isi-student-button" ref={(node) => { buttonRefs.current[student.id] = node; }} title={student.name} aria-label={"Open intelligence for " + student.name} onClick={() => setSelectedId(student.id)}>{student.name}</button>
                          <button type="button" className="isi-text-link isi-plan-link" onClick={(event) => { event.stopPropagation(); onOpenPlan(student.id, "plan"); }}>Learning plan & monthly reports →</button>
                        </div>
                      </div>
                    </th>
                    {skills.map((skill) => <td key={skill}><SkillStatus skill={skill} evidence={student[skill]} onOpen={navigate} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.students.length && <div className="isi-no-results">
            <strong>{applied ? "No matching students found" : "No eligible students yet"}</strong>
            <p>Only learners in your authorized IELTS programme scope appear here.</p>
            {applied && <button className="isi-secondary" type="button" onClick={() => { onSearchChange(""); onSearch(""); }}>Clear search</button>}
          </div>}
          <div className="isi-pagination">
            <span>{data.total_students} matching students · {data.students.length ? "Showing " + (offset + 1) + "–" + (offset + data.students.length) : "No results"}</span>
            <div className="isi-pagination-actions">
              <button type="button" disabled={offset === 0 || loading} onClick={() => onPage(Math.max(0, offset - pageSize))}>Previous</button>
              <span aria-label={"Page " + currentPage + " of " + totalPages} className="isi-page-number">{currentPage}</span>
              <button type="button" disabled={offset + pageSize >= data.total_students || loading} onClick={() => onPage(offset + pageSize)}>Next</button>
            </div>
          </div>
        </section>
        </Accordion>
      </div>
      {selected && <IntelligenceDrawer key={data.school_id + ":" + selected.id} student={selected} workspace={data} onClose={close} onOpenPlan={onOpenPlan} />}
    </div>
  );
}
