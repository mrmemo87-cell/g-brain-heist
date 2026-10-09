import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  monthlyReport,
  requestIeltsReportCorrection,
  learningSkills,
  pathwayLabels,
  evidenceSummary,
  evidenceInPeriod,
  type IeltsMonthlyReport,
  type ReportEvidence,
} from "../../../../services/ieltsLearningReportService";
import {
  reportProse,
  skillEvidence,
  evidenceRole,
  responseCoverage,
} from "../../../../services/ieltsReportPresentation";
import {
  createSchoolBrand,
  PRODUCT_LOGO_URL,
} from "../../../lib/schoolBranding";
import "../../../../components/student-progress/AcademicReportBuilder.css";
import "../../../styles/ielts-learning-report.css";
export const reportDate = (v: string) =>
  new Date(v.length === 10 ? v + "T12:00:00+06:00" : v).toLocaleDateString(
    undefined,
    { timeZone: "Asia/Bishkek", dateStyle: "medium" },
  );
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
export default function IeltsMonthlyReportView({
  report: initial,
  canManage,
  onClose,
  onShared,
  onCorrect,
}: {
  report: IeltsMonthlyReport;
  canManage: boolean;
  onClose: () => void;
  onShared?: () => void;
  onCorrect?: () => void;
}) {
  const [report, setReport] = useState(initial),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [correction, setCorrection] = useState(""),
    [correctionSent, setCorrectionSent] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const print = () => {
    const closed = [
      ...dialog.current!.querySelectorAll<HTMLDetailsElement>("details"),
    ].filter((d) => !d.open);
    closed.forEach((d) => (d.open = true));
    const restore = () => {
      closed.forEach((d) => (d.open = false));
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };
  const navigate = useNavigate(),
    p = report.payload;
  const brand = createSchoolBrand({
    schoolId: p.school.id,
    schoolName: p.school.name,
  });
  const inPeriod = p.evidence.filter((e) =>
    evidenceInPeriod(e, p.period.start, p.period.end),
  );
  const earlier = p.evidence.filter(
    (e) => !evidenceInPeriod(e, p.period.start, p.period.end),
  );
  const share = async () => {
    if (busy || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      setReport(await monthlyReport(report.id, true));
      onShared?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const source = (e: ReportEvidence) => {
    onClose();
    navigate(canManage ? (e.staff_route ?? e.route) : e.route);
  };
  const detail = (e: ReportEvidence) => (
    <div className="ilr-source-detail" key={e.source_type + e.source_id}>
      <p className="ilr-evidence-meta">
        {reportDate(e.occurred_at)} · {evidenceRole(e)} · {evidenceSummary(e)}
      </p>
      {e.submission_status === "auto_submitted" && (
        <p>Saved automatically when the check ended.</p>
      )}
      {responseCoverage(e) && (
        <p>
          {responseCoverage(e)}. Unanswered items do not establish a difficulty.
        </p>
      )}
      {e.observations && (
        <div>
          {Object.entries(e.observations).map(([key, o]) => (
            <p key={key}>
              <strong>
                {title(key.replaceAll("_", " "))} ·{" "}
                {o.status === "observed"
                  ? "Shown in this task"
                  : o.status === "developing"
                    ? "Practise next"
                    : "More evidence needed"}
                :
              </strong>{" "}
              {reportProse(o.comment)}
            </p>
          ))}
        </div>
      )}
      {e.next_step && (
        <p>
          <strong>Teacher’s next step:</strong> {reportProse(e.next_step)}
        </p>
      )}
      {e.feedback && (
        <div>
          {Object.entries(e.feedback).map(([key, value]) => (
            <p key={key}>
              <strong>{title(key.replaceAll("_", " "))}:</strong>{" "}
              {reportProse(value)}
            </p>
          ))}
        </div>
      )}
      {e.item_observations?.length ? (
        <details>
          <summary>Item responses</summary>
          {e.item_observations.map((o, i) => (
            <p key={i}>
              Item {o.item} · {o.construct ?? "Skill mapping awaiting review"} ·{" "}
              {o.response_state === "answered"
                ? `${o.marks_awarded} / ${o.marks_possible}`
                : "No usable response"}
            </p>
          ))}
          <p>
            These observations describe this task, not lasting strengths or
            difficulties.
          </p>
        </details>
      ) : null}
      {e.conditions === "review_required" && (
        <p>Assessment conditions need teacher consideration.</p>
      )}
      <button className="ilr-source arb-no-print" onClick={() => source(e)}>
        Open original work →
      </button>
    </div>
  );
  return createPortal(
    <div className="arb-overlay ilr-overlay">
      <section
        ref={dialog}
        className="arb-shell"
        role="dialog"
        aria-modal="true"
        aria-label="IELTS monthly learning report"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = [
              ...dialog.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]",
              ),
            ].filter(
              (el) =>
                !el.closest("details:not([open])") ||
                (el.tagName === "SUMMARY" &&
                  el.parentElement?.closest("details:not([open])") ===
                    el.parentElement &&
                  !el.parentElement?.parentElement?.closest("details:not([open])")),
            );
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="arb-toolbar arb-no-print">
          <div>
            <strong>IELTS learning report</strong>
            <span>
              {report.status === "final"
                ? "Shared · approved version"
                : "Draft · teacher review required"}
            </span>
          </div>
          <div>
            <button onClick={onClose} disabled={busy}>
              Close
            </button>
            <button
              className="primary"
              disabled={report.status !== "final"}
              onClick={print}
            >
              Print / Save PDF
            </button>
          </div>
        </header>
        {error && (
          <p className="arb-error arb-no-print" role="alert">
            {error}
          </p>
        )}
        <article className="arb-report ilr-document">
          <header className="arb-report-header">
            <div className="arb-brand">
              <img
                src={brand.logoUrl ?? PRODUCT_LOGO_URL}
                alt={brand.logoUrl ? "School logo" : "Brains Heist logo"}
              />
              <span>
                <strong>{p.school.name}</strong>
                <small>Individual IELTS learning report</small>
              </span>
            </div>
            <div>
              <span className={"arb-status is-" + report.status}>
                {report.status === "final" ? "Shared" : "Draft"}
              </span>
              <small>Version {report.version}</small>
            </div>
          </header>
          <section className="arb-title ilr-report-title">
            <span>
              {p.period.interim ? "Interim monthly review" : "Monthly review"} ·{" "}
              {reportDate(p.period.start)}–{reportDate(p.period.end)}
            </span>
            <h1>{p.student.name}</h1>
            <p>A clear starting point and a purposeful next step.</p>
          </section>
          <section
            className="ilr-overview"
            aria-label="Teacher learning summary"
          >
            <div>
              <span className="ilr-kicker">
                Teacher-confirmed learning plan
              </span>
              <h2>Your focus for this period</h2>
              <p>{reportProse(p.plan.fields.study_goal)}</p>
            </div>
            <div className="ilr-next">
              <span className="ilr-kicker">Your next step</span>
              <p>{reportProse(p.plan.fields.next_action)}</p>
              <small>Review by {reportDate(p.plan.fields.review_on)}</small>
            </div>
          </section>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>01 · Your priorities</span>
                <h2>What to work on next</h2>
              </div>
              <p>Agreed actions and how your teacher will check them.</p>
            </div>
            <div className="ilr-goals">
              {p.plan.fields.goals.map((g, i) => (
                <article key={i}>
                  <span>
                    {String(i + 1).padStart(2, "0")} · {title(g.skill)}
                  </span>
                  <h3>{reportProse(g.action)}</h3>
                  <dl>
                    <div>
                      <dt>Success looks like</dt>
                      <dd>{reportProse(g.success)}</dd>
                    </div>
                    <div>
                      <dt>Next check</dt>
                      <dd>{reportProse(g.check)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>02 · Four skills</span>
                <h2>Your starting point and preparation plan</h2>
              </div>
              <p>
                Confidence: low · Short checks give a starting point, not a full
                IELTS band. Pathways are teacher planning decisions.
              </p>
            </div>
            <div className="arb-subjects ilr-profile">
              {learningSkills.map((sk) => {
                const evidence = skillEvidence(p.evidence, sk),
                  first = evidence.starting,
                  plan = p.plan.fields.skills[sk];
                const reviewed = evidence.entries.find(
                  (e) => e.review_id && e.kind !== "guided_practice",
                );
                return (
                  <article key={sk}>
                    <header>
                      <h3>{title(sk)}</h3>
                      <span className="arb-evidence">
                        {first
                          ? "Starting check"
                          : evidence.practice.length
                            ? "Practice recorded"
                            : "Evidence needed"}
                      </span>
                    </header>
                    <p className="ilr-score">
                      {first
                        ? evidenceSummary(first)
                        : evidence.practice.length
                          ? "Starting check not captured in this report"
                          : "No starting check recorded"}
                    </p>
                    {first && (
                      <small>
                        {reportDate(first.occurred_at)}
                        {first.submission_status === "auto_submitted"
                          ? " · Saved automatically"
                          : ""}
                      </small>
                    )}
                    <p className="ilr-pathway">
                      <strong>{pathwayLabels[plan.pathway]}</strong>
                      <small>Teacher-selected pathway</small>
                    </p>
                    {reviewed?.next_step && (
                      <p className="ilr-observation">
                        <strong>Teacher’s current focus</strong>
                        {reportProse(reviewed.next_step)}
                      </p>
                    )}
                    {!reviewed && (sk === "writing" || sk === "speaking") && (
                      <p>
                        Teacher-reviewed evidence is needed before interpreting
                        this skill.
                      </p>
                    )}
                    {evidence.practice.length > 0 && (
                      <p className="ilr-evidence-meta">
                        {evidence.practice.length} practice{" "}
                        {evidence.practice.length === 1 ? "record" : "records"}{" "}
                        kept separate from the starting check.
                      </p>
                    )}
                    <details>
                      <summary>Teacher rationale and supporting work</summary>
                      <p>{reportProse(plan.rationale)}</p>
                      {plan.sources.map((id) => {
                        const e = p.evidence.find((x) => x.source_id === id);
                        return e ? (
                          <p key={id}>
                            {reportDate(e.occurred_at)} · {evidenceRole(e)} ·{" "}
                            {evidenceSummary(e)}
                            <button
                              className="ilr-source arb-no-print"
                              onClick={() => source(e)}
                            >
                              Open supporting work →
                            </button>
                          </p>
                        ) : (
                          <p key={id}>
                            An earlier reference is held with the plan. Ask your
                            teacher to review it.
                          </p>
                        );
                      })}
                    </details>
                    {evidence.entries.length > 0 && (
                      <details>
                        <summary>View saved checks and feedback</summary>
                        {evidence.entries.map(detail)}
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          <section className="ilr-progress-note">
            <div>
              <span className="ilr-kicker">Progress review</span>
              <h2>Improvement is not yet established</h2>
            </div>
            <p>
              We have a starting point and a plan. Fresh, suitable checks are
              needed to show what has changed. Completing practice records
              participation; it does not yet confirm improvement.
            </p>
          </section>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>03 · Your learning record</span>
                <h2>Work recorded during this period</h2>
              </div>
            </div>
            {inPeriod.length ? (
              <details className="ilr-evidence-ledger">
                <summary>
                  View dated work and feedback · {inPeriod.length} records
                </summary>
                <ol className="ilr-trail">
                  {inPeriod.map((e) => (
                    <li key={e.source_type + e.source_id}>
                      <strong>
                        {title(e.skill)} · {e.title ?? evidenceRole(e)}
                      </strong>
                      {detail(e)}
                    </li>
                  ))}
                </ol>
              </details>
            ) : (
              <p className="arb-not-assessed">
                No work was recorded in this period by the report cutoff.
              </p>
            )}
            {earlier.length > 0 && (
              <details>
                <summary>
                  Earlier starting references · {earlier.length}
                </summary>
                {earlier.map(detail)}
              </details>
            )}
          </section>
          <details className="arb-disclosures">
            <summary>Evidence notes and report details</summary>
            <p>
              Evidence available by{" "}
              {new Date(p.period.cutoff).toLocaleString(undefined, {
                timeZone: p.period.timezone,
              })}{" "}
              · {p.period.timezone}
              {p.period.interim ? " · Partial reporting period" : ""}
            </p>
            <p>
              Teacher account: {p.plan.author} · Plan version {p.plan.version}
            </p>
            <ul>
              {p.limitations.map((l) => (
                <li key={l}>
                  {l.startsWith("Legacy school practice")
                    ? "For older school practice, the exact task version and feedback may be unavailable. Completion records participation."
                    : reportProse(l)}
                </li>
              ))}
            </ul>
          </details>
          <footer className="arb-footer">
            {report.status === "final" ? (
              <div className="arb-final">
                <div>
                  <strong>Teacher confirmed · {report.finalized_by}</strong>
                  <span>
                    Shared {reportDate(report.finalized_at!)} · Version{" "}
                    {report.version} is preserved.
                  </span>
                </div>
              </div>
            ) : canManage ? (
              <div className="arb-approval arb-no-print">
                <div>
                  <strong>Review before sharing</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    I have checked the evidence, pathway, goals and limitations.
                  </label>
                </div>
                <button
                  disabled={!confirmed || busy}
                  onClick={() => void share()}
                >
                  {busy ? "Sharing…" : "Confirm and share with student"}
                </button>
              </div>
            ) : null}
            {report.status === "final" && (
              <details className="arb-correction arb-no-print">
                <summary>Something needs correcting?</summary>
                <p>
                  A correction creates a linked replacement. This approved
                  version stays in the learning record.
                </p>
                {canManage && onCorrect && (
                  <button onClick={onCorrect} disabled={busy}>
                    Prepare a corrected version →
                  </button>
                )}
                <label>
                  Explain what needs checking
                  <textarea
                    maxLength={2000}
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                  />
                </label>
                <button
                  disabled={
                    busy || correction.trim().length < 20 || correctionSent
                  }
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void requestIeltsReportCorrection(report.id, correction)
                      .then(() => setCorrectionSent(true))
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Request a correction
                </button>
                {correctionSent && (
                  <p role="status">
                    Correction requested. The original report is preserved.
                  </p>
                )}
              </details>
            )}
            <small>Brains Heist LLC · Not an official IELTS result</small>
          </footer>
        </article>
      </section>
    </div>,
    document.body,
  );
}
