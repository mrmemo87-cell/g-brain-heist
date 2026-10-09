import React, { useState } from "react";
import {
  learningReportContext,
  monthlyReport,
  pathwayLabels,
  learningSkills,
  type LearningReportContext,
  type IeltsMonthlyReport,
} from "../../../../services/ieltsLearningReportService";
import IeltsMonthlyReportView, { reportDate } from "./IeltsMonthlyReportView";
import "../../../styles/ielts-learning-report.css";
export default function IeltsStudentLearningPlan() {
  const [data, setData] = useState<LearningReportContext | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState<IeltsMonthlyReport | null>(null);
  const load = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setData(await learningReportContext());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ij-panel ilr-panel">
      <p className="ij-eyebrow">Your teacher’s plan · Your monthly reports</p>
      <h2>Your way forward</h2>
      {error && <p role="alert">{error}</p>}
      <button
        className="ij-primary"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy
          ? "Opening your plan…"
          : data
            ? "Refresh your plan"
            : "Open learning plan and reports"}
      </button>
      {data && (
        <>
          {data.plan ? (
            <div className="ilr-shared">
              <strong>★ Teacher: {data.plan.author}</strong>
              <h3>{data.plan.fields.study_goal}</h3>
              <p>
                <strong>Your next action:</strong>{" "}
                {data.plan.fields.next_action}
              </p>
              <div className="ilr-form-grid">
                {learningSkills.map((sk) => (
                  <div key={sk}>
                    <strong>{sk[0].toUpperCase() + sk.slice(1)}</strong>
                    <p>{pathwayLabels[data.plan!.fields.skills[sk].pathway]}</p>
                    <p>{data.plan!.fields.skills[sk].rationale}</p>
                  </div>
                ))}
              </div>
              {data.plan.fields.goals.map((g, i) => (
                <article key={i}>
                  <h4>{g.action}</h4>
                  <p>
                    <strong>Success:</strong> {g.success}
                  </p>
                  <p>
                    <strong>Next check:</strong> {g.check}
                  </p>
                </article>
              ))}
              <small>Review by {reportDate(data.plan.fields.review_on)}</small>
            </div>
          ) : (
            <p>
              Your teacher has not shared a learning plan yet. Use your saved
              feedback to agree your next focus.
            </p>
          )}
          <h3>Your shared reports</h3>
          {data.reports.length ? (
            data.reports.map((r) => (
              <div className="ilr-shared" key={r.id}>
                <strong>
                  {reportDate(r.period_start)}–{reportDate(r.period_end)} ·
                  Version {r.version}
                </strong>
                <button
                  className="ij-secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void monthlyReport(r.id)
                      .then(setReport)
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  View report →
                </button>
              </div>
            ))
          ) : (
            <p>
              Your reports will appear here after your teacher checks and shares
              them.
            </p>
          )}
        </>
      )}
      {report && (
        <IeltsMonthlyReportView
          report={report}
          canManage={false}
          onClose={() => setReport(null)}
        />
      )}
    </section>
  );
}
