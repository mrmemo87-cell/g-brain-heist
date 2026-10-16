import React from "react";
import {
  learningSkills,
  evidenceSummary,
  pathwayLabels,
  type IeltsMonthlyReport,
} from "../../../../services/ieltsLearningReportService";
import {
  reportProse,
  skillEvidence,
  planEvidenceIssues,
} from "../../../../services/ieltsReportPresentation";

export default function IeltsReportOverview({
  report,
}: {
  report: IeltsMonthlyReport;
}) {
  const p = report.payload;
  const recorded = learningSkills.filter(
    (sk) => skillEvidence(p.evidence, sk).starting,
  ).length;
  const reviewed = ["writing", "speaking"].filter((sk) =>
    p.evidence.some(
      (e) => e.skill === sk && e.review_id && e.kind !== "guided_practice",
    ),
  );
  const review = new Date(
    p.plan.fields.review_on + "T12:00:00+06:00",
  ).toLocaleDateString("en-GB", {
    timeZone: "Asia/Bishkek",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="ilr-summary">
      <section className="ilr-summary-intro">
        <span className="ilr-kicker">Current picture</span>
        <h2>
          {recorded === 4
            ? "A starting point in all four skills"
            : "Building a complete starting picture"}
        </h2>
        <p>
          {recorded === 4
            ? "Starting checks are recorded in all four skills."
            : `${recorded} of four skills have a captured starting check.`}{" "}
          {reviewed.length === 2
            ? "Writing and Speaking samples have teacher feedback."
            : reviewed.length === 1
              ? `${reviewed[0][0].toUpperCase() + reviewed[0].slice(1)} has teacher-reviewed evidence.`
              : "Writing and Speaking need teacher-reviewed evidence before interpretation."}{" "}
          Progress will be reviewed through fresh, suitable checks.
        </p>
      </section>
      <section
        className="ilr-summary-skills"
        aria-labelledby="ilr-skills-heading"
      >
        <h2 id="ilr-skills-heading">Four-skill overview</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col">Starting evidence</th>
              <th scope="col">Preparation focus</th>
            </tr>
          </thead>
          <tbody>
            {learningSkills.map((sk) => {
              const e = skillEvidence(p.evidence, sk);
              return (
                <tr key={sk}>
                  <th scope="row">{sk[0].toUpperCase() + sk.slice(1)}</th>
                  <td>
                    {e.starting
                      ? evidenceSummary(e.starting)
                      : "Starting check not yet captured"}
                  </td>
                  <td>{pathwayLabels[p.plan.fields.skills[sk].pathway]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="ilr-summary-caption">
          Short checks · Low confidence · Preparation choices reflect teacher
          judgment.
        </p>
      </section>
      <section className="ilr-summary-priorities">
        <h2>Next priorities</h2>
        <ol>
          {p.plan.fields.goals.map((g, i) => (
            <li key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{g.skill[0].toUpperCase() + g.skill.slice(1)}</strong>
                <p>
                  {planEvidenceIssues({ goals: [g] }, p.evidence).length
                    ? "Teacher review is needed before setting this action."
                    : reportProse(g.action)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="ilr-summary-review">
        <div>
          <span className="ilr-kicker">Progress</span>
          <strong>
            Starting evidence only; improvement not yet confirmed.
          </strong>
        </div>
        <div>
          <span className="ilr-kicker">Next review</span>
          <strong>{review}</strong>
        </div>
      </section>

      <p className="ilr-summary-caption">
        This overview summarises the captured evidence and agreed priorities.
        Detailed work and feedback are available in the learning record. It is
        not a full IELTS band assessment.
      </p>
    </div>
  );
}
