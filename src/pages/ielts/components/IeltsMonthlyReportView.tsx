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
} from "../../../../services/ieltsLearningReportService";
import { createSchoolBrand } from "../../../lib/schoolBranding";
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
}: {
  report: IeltsMonthlyReport;
  canManage: boolean;
  onClose: () => void;
  onShared?: () => void;
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
  const navigate = useNavigate();
  const p = report.payload;
  const brand = createSchoolBrand({
    schoolId: p.school.id,
    schoolName: p.school.name,
  });
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
  const source = (route: string) => {
    onClose();
    navigate(route);
  };
  return createPortal(
    <div className="arb-overlay ilr-overlay">
      <section
        ref={dialog}
        className="arb-shell"
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
            ];
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
        role="dialog"
        aria-modal="true"
        aria-label="IELTS monthly learning report"
      >
        <header className="arb-toolbar arb-no-print">
          <div>
            <strong>IELTS learning report</strong>
            <span>
              {report.status === "final"
                ? "Shared · exact approved version"
                : "Draft · check before sharing"}
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
        <article className="arb-report">
          <header className="arb-report-header">
            <div className="arb-brand">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="School logo" />
              ) : (
                <b>BH</b>
              )}
              <span>
                <strong>{p.school.name}</strong>
                <small>Brains Heist · Individual IELTS learning report</small>
              </span>
            </div>
            <div>
              <span className={"arb-status is-" + report.status}>
                {report.status === "final" ? "Shared" : "Draft"}
              </span>
              <small>Version {report.version}</small>
            </div>
          </header>
          <section className="arb-title">
            <span>
              {p.period.interim ? "Interim monthly review" : "Monthly review"} ·{" "}
              {reportDate(p.period.start)}–{reportDate(p.period.end)}
            </span>
            <h1>{p.student.name}</h1>
            <p>Your starting point. Your next focus. Your way forward.</p>
          </section>
          <div className="ilr-teacher">
            <strong>★ Your teacher’s learning plan · {p.plan.author}</strong>
            <p>{p.plan.fields.study_goal}</p>
            <p>
              <b>Your next action:</b> {p.plan.fields.next_action}
            </p>
            <small>
              Plan version {p.plan.version} · Review by{" "}
              {reportDate(p.plan.fields.review_on)}
            </small>
          </div>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>01 · Four skills</span>
                <h2>Your learning profile</h2>
              </div>
              <p>
                Confidence: low. These checks sample your learning; they do not
                give a full IELTS band.
              </p>
            </div>
            <div className="arb-subjects">
              {learningSkills.map((sk) => {
                const entries = p.evidence.filter(
                  (e) => e.skill === sk && e.kind !== "guided_practice",
                );
                const latest = entries.at(-1);
                const plan = p.plan.fields.skills[sk];
                return (
                  <article key={sk}>
                    <h3>{title(sk)}</h3>
                    <span className="arb-evidence">
                      {latest ? evidenceSummary(latest) : "Not assessed"}
                    </span>
                    <p className="ilr-pathway">
                      <strong>{pathwayLabels[plan.pathway]}</strong>
                    </p>
                    <p>{plan.rationale}</p>
                    {latest && (
                      <small>
                        {reportDate(latest.occurred_at)} ·{" "}
                        {latest.exposure?.replaceAll("_", " ")}
                      </small>
                    )}
                    {latest?.item_observations?.length ? (
                      <details>
                        <summary>What happened in this check?</summary>
                        {latest.item_observations.map((o, i) => (
                          <p key={i}>
                            Item {o.item} ·{" "}
                            {o.construct ?? "Mapping needs review"} ·{" "}
                            {o.response_state === "answered"
                              ? `${o.marks_awarded} / ${o.marks_possible}`
                              : "No usable response"}
                          </p>
                        ))}
                        <p>
                          These are observations from one check, not lasting
                          strengths or difficulties.
                        </p>
                      </details>
                    ) : null}
                    {entries.some((e) => e.observations) && (
                      <details>
                        <summary>What was observed in your work?</summary>
                        {entries
                          .filter((e) => e.observations)
                          .map((e) => (
                            <div key={e.source_id}>
                              <p>
                                <strong>Teacher: {e.reviewer}</strong> ·{" "}
                                {reportDate(e.reviewed_at!)}
                              </p>
                              {Object.entries(e.observations!).map(([k, o]) => (
                                <p key={k}>
                                  <strong>
                                    {o.status === "observed"
                                      ? "Shown in this task"
                                      : o.status === "developing"
                                        ? "Practise next"
                                        : "More evidence needed"}
                                  </strong>
                                  : {o.comment}
                                </p>
                              ))}
                            </div>
                          ))}
                      </details>
                    )}
                    {plan.sources.length > 0 && (
                      <details>
                        <summary>Why this pathway?</summary>
                        {plan.sources.map((id) => {
                          const e = p.evidence.find((x) => x.source_id === id);
                          return e ? (
                            <p key={id}>
                              {reportDate(e.occurred_at)} · {evidenceSummary(e)}
                              <button
                                className="ilr-source arb-no-print"
                                onClick={() =>
                                  source(
                                    canManage
                                      ? (e.staff_route ?? e.route)
                                      : e.route,
                                  )
                                }
                              >
                                Open supporting work →
                              </button>
                            </p>
                          ) : (
                            <p key={id}>
                              Earlier evidence is held with this plan. Ask your
                              teacher to review the reference.
                            </p>
                          );
                        })}
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>02 · Your priorities</span>
                <h2>Small goals. Clear actions.</h2>
              </div>
            </div>
            <div className="ilr-goals">
              {p.plan.fields.goals.map((g, i) => (
                <article key={i}>
                  <span>
                    {String(i + 1).padStart(2, "0")} · {title(g.skill)}
                  </span>
                  <h3>{g.action}</h3>
                  <p>
                    <strong>What success looks like:</strong> {g.success}
                  </p>
                  <p>
                    <strong>How we will check:</strong> {g.check}
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section className="arb-section">
            <div className="arb-section-heading">
              <div>
                <span>03 · Your learning trail</span>
                <h2>Work and feedback during this period</h2>
              </div>
              <p>
                Earlier starting references are shown separately. Completion
                records participation.
              </p>
            </div>
            {p.evidence.filter((e) =>
              evidenceInPeriod(e, p.period.start, p.period.end),
            ).length === 0 ? (
              <p className="arb-not-assessed">
                No work recorded in this period by the evidence cutoff.
              </p>
            ) : (
              <ol className="ilr-trail">
                {p.evidence
                  .filter((e) =>
                    evidenceInPeriod(e, p.period.start, p.period.end),
                  )
                  .map((e) => (
                    <li key={e.source_type + e.source_id}>
                      <strong>
                        {title(e.skill)} · {e.title ?? evidenceSummary(e)}
                      </strong>
                      <span>
                        {reportDate(e.occurred_at)} · {evidenceSummary(e)}
                      </span>
                      {e.next_step && (
                        <p>★ Teacher’s next step: {e.next_step}</p>
                      )}
                      {e.conditions === "review_required" && (
                        <p>Assessment conditions need teacher consideration.</p>
                      )}
                      <button
                        className="ilr-source arb-no-print"
                        onClick={() =>
                          source(
                            canManage ? (e.staff_route ?? e.route) : e.route,
                          )
                        }
                      >
                        Open saved evidence →
                      </button>
                    </li>
                  ))}
              </ol>
            )}
            <details>
              <summary>Earlier starting references</summary>
              {p.evidence
                .filter(
                  (e) => !evidenceInPeriod(e, p.period.start, p.period.end),
                )
                .map((e) => (
                  <p key={e.source_type + e.source_id}>
                    {title(e.skill)} · {reportDate(e.occurred_at)} ·{" "}
                    {evidenceSummary(e)}
                  </p>
                ))}
            </details>
          </section>
          <section className="arb-disclosures">
            <strong>What we can say about progress</strong>
            <p>
              Improvement is not yet established. We need fresh, suitable checks
              before making that conclusion.
            </p>
            <ul>
              {p.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <footer className="arb-footer">
            <p>
              Evidence available by{" "}
              {new Date(p.period.cutoff).toLocaleString(undefined, {
                timeZone: p.period.timezone,
              })}{" "}
              · {p.period.timezone}
              {p.period.interim ? " · Partial reporting period" : ""}
            </p>
            {report.status === "final" ? (
              <div className="arb-final">
                <div>
                  <strong>Teacher confirmed · {report.finalized_by}</strong>
                  <span>
                    Shared {reportDate(report.finalized_at!)}. This approved
                    version is preserved.
                  </span>
                </div>
              </div>
            ) : canManage ? (
              <div className="arb-approval arb-no-print">
                <div>
                  <strong>Check the exact report before sharing</strong>
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
