import React, { useEffect, useRef, useState } from "react";
import {
  learningReportContext,
  saveLearningPlan,
  saveLearningPlanWithAi,
  draftLearningPlan,
  generateMonthlyReport,
  monthlyReport,
  emptyLearningPlan,
  learningSkills,
  pathwayLabels,
  evidenceSummary,
  type LearningReportContext,
  type LearningPlanFields,
  type IeltsMonthlyReport,
} from "../../../services/ieltsLearningReportService";
import IeltsMonthlyReportView from "./components/IeltsMonthlyReportView";
import { reportDate } from "./components/IeltsMonthlyReportView";
import "../../styles/ielts-learning-report.css";
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
export default function IeltsLearningPlanDesk({
  schoolId,
  studentId,
  onClose,
}: {
  schoolId: string;
  studentId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<LearningReportContext | null>(null),
    [fields, setFields] = useState<LearningPlanFields>(emptyLearningPlan),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [confirmed, setConfirmed] = useState(false),
    [dirty, setDirty] = useState(false),
    [aiDraft, setAiDraft] = useState<string | null>(null),
    [aiWorking, setAiWorking] = useState(false);
  const [year, setYear] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [report, setReport] = useState<IeltsMonthlyReport | null>(null);
  const reportRequest = useRef<{ key: string; cutoff: string } | null>(null);
  const request = useRef<string | null>(null),
    lock = useRef(false),
    epoch = useRef(0);
  useEffect(() => {
    let active = true;
    epoch.current++;
    setData(null);
    setLoading(true);
    setError("");
    setConfirmed(false);
    setDirty(false);
    setAiDraft(null);
    request.current = null;
    void learningReportContext(schoolId, studentId)
      .then((d) => {
        if (!active) return;
        setData(d);
        setFields(d.plan?.fields ?? emptyLearningPlan());
        setYear(d.years[0]?.id ?? "");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [schoolId, studentId, revision]);
  const change = (f: LearningPlanFields) => {
    setFields(f);
    setConfirmed(false);
    setDirty(true);
    request.current = null;
    setMessage("");
  };
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      await fn();
    } catch (e) {
      if (epoch.current === generation) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (epoch.current === generation) setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!data || !confirmed) return;
      request.current ??= crypto.randomUUID();
      await (aiDraft
        ? saveLearningPlanWithAi(
            schoolId,
            studentId,
            fields,
            data.plan?.id ?? null,
            request.current,
            aiDraft,
          )
        : saveLearningPlan(
            schoolId,
            studentId,
            fields,
            data.plan?.id ?? null,
            request.current,
          ));
      setMessage(
        "Learning plan shared. The student can now see their goals and next step.",
      );
      setRevision((n) => n + 1);
    });
  const generate = () =>
    run(async () => {
      if (!data?.plan || dirty) return;
      const key = [year, start, end, data.plan.id].join(":");
      if (reportRequest.current?.key !== key)
        reportRequest.current = { key, cutoff: new Date().toISOString() };
      const cutoff = reportRequest.current.cutoff;
      const d = await generateMonthlyReport(
        schoolId,
        studentId,
        year,
        start,
        end,
        cutoff,
        data.plan.id,
      );
      setReport(await monthlyReport(d.id));
      reportRequest.current = null;
    });
  if (loading)
    return (
      <section className="sp-card" role="status">
        Opening the student’s learning record…
      </section>
    );
  return (
    <section className="sp-card ilr-panel">
      <button className="sp-back" onClick={onClose} disabled={busy}>
        ← Student progress
      </button>
      <p className="sp-eyebrow">Individual learning plan · Monthly report</p>
      <h2>{data?.student_name ?? "Student learning record"}</h2>
      {error && (
        <div className="sp-alert" role="alert">
          {error}
          <button
            className="sp-secondary"
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            Reload saved record
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {data?.can_manage && (
        <>
          <p>
            Start with the evidence. Choose the right support for each skill,
            then agree a few clear goals.
          </p>
          <details>
            <summary>
              Review saved evidence · {data.evidence.length} records
            </summary>
            {data.evidence.length ? (
              data.evidence.map((e) => (
                <article
                  className="ilr-shared"
                  key={e.source_type + e.source_id}
                >
                  <strong>
                    {title(e.skill)} · {e.title ?? evidenceSummary(e)}
                  </strong>
                  <p>
                    {reportDate(e.occurred_at)} · {evidenceSummary(e)} ·{" "}
                    {e.exposure?.replaceAll("_", " ")}
                  </p>
                  {e.next_step && (
                    <p>
                      ★ {e.reviewer}: {e.next_step}
                    </p>
                  )}
                  <a href={e.staff_route ?? e.route}>Open original work →</a>
                </article>
              ))
            ) : (
              <p>
                No saved evidence yet. Plan the missing checks; do not infer a
                weakness.
              </p>
            )}
          </details>
          <div className="ilr-actions">
            <button
              className="sp-primary"
              disabled={busy || !data.evidence.length}
              onClick={() =>
                void run(async () => {
                  setAiWorking(true);
                  try {
                    const draft = await draftLearningPlan(schoolId, studentId);
                    change(draft.fields);
                    setAiDraft(draft.id);
                    setMessage(
                      "AI draft applied. Check each pathway, goal and evidence reference before sharing.",
                    );
                  } finally {
                    setAiWorking(false);
                  }
                })
              }
            >
              {aiWorking
                ? "Applying AI help…"
                : "✦ AI help · draft the whole plan"}
            </button>
          </div>
          <p className="ilr-hint">
            AI uses the saved evidence. It fills the plan for you to check and
            edit; sharing stays your decision. Unsaved edits will be replaced
            when you apply a draft.
          </p>
          <fieldset disabled={busy}>
            <legend>
              {data.plan
                ? `Plan version ${data.plan.version} · ${data.plan.author}`
                : "Build the first learning plan"}
            </legend>
            <label>
              Student’s study goal
              <input
                maxLength={500}
                value={fields.study_goal}
                onChange={(e) =>
                  change({ ...fields, study_goal: e.target.value })
                }
                placeholder="What does the student want to achieve?"
              />
            </label>
            <div className="ilr-form-grid">
              {learningSkills.map((sk) => (
                <article className="ilr-skill" key={sk}>
                  <h3>{title(sk)}</h3>
                  <label>
                    Recommended pathway
                    <select
                      value={fields.skills[sk].pathway}
                      onChange={(e) =>
                        change({
                          ...fields,
                          skills: {
                            ...fields.skills,
                            [sk]: {
                              ...fields.skills[sk],
                              pathway: e.target
                                .value as keyof typeof pathwayLabels,
                            },
                          },
                        })
                      }
                    >
                      {Object.entries(pathwayLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Why this pathway? What needs checking?
                    <textarea
                      maxLength={800}
                      value={fields.skills[sk].rationale}
                      onChange={(e) =>
                        change({
                          ...fields,
                          skills: {
                            ...fields.skills,
                            [sk]: {
                              ...fields.skills[sk],
                              rationale: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                  <details>
                    <summary>Choose the supporting evidence</summary>
                    {data.evidence
                      .filter((e) => e.skill === sk)
                      .map((e) => (
                        <label key={e.source_id}>
                          <input
                            type="checkbox"
                            checked={fields.skills[sk].sources.includes(
                              e.source_id,
                            )}
                            onChange={(event) =>
                              change({
                                ...fields,
                                skills: {
                                  ...fields.skills,
                                  [sk]: {
                                    ...fields.skills[sk],
                                    sources: event.target.checked
                                      ? [
                                          ...fields.skills[sk].sources,
                                          e.source_id,
                                        ]
                                      : fields.skills[sk].sources.filter(
                                          (id) => id !== e.source_id,
                                        ),
                                  },
                                },
                              })
                            }
                          />
                          {reportDate(e.occurred_at)} · {evidenceSummary(e)}
                        </label>
                      ))}
                  </details>
                  <p className="ilr-hint">
                    A preparation decision for this skill. It is not an IELTS
                    band.
                  </p>
                </article>
              ))}
            </div>
            <h3>Focused goals</h3>
            <p>
              Choose up to three practical goals. Describe the action, success
              and next check in simple language.
            </p>
            {fields.goals.map((g, i) => (
              <article className="ilr-skill" key={i}>
                <label>
                  Skill
                  <select
                    value={g.skill}
                    onChange={(e) =>
                      change({
                        ...fields,
                        goals: fields.goals.map((x, j) =>
                          j === i
                            ? { ...x, skill: e.target.value as typeof g.skill }
                            : x,
                        ),
                      })
                    }
                  >
                    {learningSkills.map((s) => (
                      <option key={s} value={s}>
                        {title(s)}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["action", "What will the student practise?"],
                    ["success", "What will success look like?"],
                    ["check", "How will we check again?"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <textarea
                      maxLength={500}
                      value={g[k]}
                      onChange={(e) =>
                        change({
                          ...fields,
                          goals: fields.goals.map((x, j) =>
                            j === i ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {fields.goals.length > 1 && (
                  <button
                    className="sp-secondary"
                    onClick={() =>
                      change({
                        ...fields,
                        goals: fields.goals.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove goal
                  </button>
                )}
              </article>
            ))}
            {fields.goals.length < 3 && (
              <button
                className="sp-secondary"
                onClick={() =>
                  change({
                    ...fields,
                    goals: [
                      ...fields.goals,
                      { skill: "writing", action: "", success: "", check: "" },
                    ],
                  })
                }
              >
                Add another goal
              </button>
            )}
            <label>
              One next action
              <textarea
                maxLength={800}
                value={fields.next_action}
                onChange={(e) =>
                  change({ ...fields, next_action: e.target.value })
                }
              />
            </label>
            <label>
              Review date
              <input
                type="date"
                value={fields.review_on}
                onChange={(e) =>
                  change({ ...fields, review_on: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I have checked this plan and its supporting evidence. Share it
              with this student.
            </label>
            <button
              className="sp-primary"
              disabled={!confirmed}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Confirm and share learning plan"}
            </button>
          </fieldset>
          <section className="ilr-shared">
            <p className="sp-eyebrow">Brains Heist smart reporting</p>
            <h3>Your monthly learning report</h3>
            <p>
              Capture the evidence and confirmed plan in an exact report
              version. Review the draft before sharing.
            </p>
            <fieldset disabled={busy}>
              <div className="ilr-form-grid">
                <label>
                  Academic year
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    {data.years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Period starts
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Period ends
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <p className="ilr-hint">
                Dates use Bishkek time. Up to 35 days. A period still in
                progress is clearly labelled interim.
              </p>
              <button
                className="sp-primary"
                disabled={!data.plan || dirty || !year || !start || !end}
                onClick={() => void generate()}
              >
                Generate report draft
              </button>
              {dirty && (
                <p>Save the updated plan before generating a report.</p>
              )}
              {!data.plan && <p>Share a learning plan first.</p>}
            </fieldset>
          </section>
          <h3>Saved report versions</h3>
          {data.reports.length ? (
            data.reports.map((r) => (
              <article className="sp-session-row" key={r.id}>
                <div>
                  <strong>
                    {reportDate(r.period_start)}–{reportDate(r.period_end)}
                  </strong>
                  <p>
                    Version {r.version} ·{" "}
                    {r.status === "final" ? "Shared" : "Draft"}
                  </p>
                </div>
                <button
                  className="sp-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => setReport(await monthlyReport(r.id)))
                  }
                >
                  Open report →
                </button>
              </article>
            ))
          ) : (
            <p>No monthly reports yet.</p>
          )}
        </>
      )}
      {report && (
        <IeltsMonthlyReportView
          report={report}
          canManage={data?.can_manage ?? false}
          onClose={() => {
            setReport(null);
            setRevision((n) => n + 1);
          }}
          onShared={() =>
            setMessage(
              "Report shared. The student can open the approved version in My IELTS Journey.",
            )
          }
        />
      )}
    </section>
  );
}
