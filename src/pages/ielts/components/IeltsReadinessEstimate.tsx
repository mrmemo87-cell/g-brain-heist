import React, { useEffect, useRef, useState } from "react";
import {
  readinessWorkspace,
  publishReadiness,
  draftReadiness,
  emptyReadiness,
  readinessSkills,
  readinessRangeLabel,
  readinessLimit,
  type ReadinessWorkspace,
  type ReadinessFields,
  type ReadinessRange,
} from "../../../../services/ieltsReadinessService";
import { IeltsButton, IeltsNotice } from "../../../components/ielts/IeltsUi";
const label = (s: string) => s[0].toUpperCase() + s.slice(1);
export default function IeltsReadinessEstimate({
  schoolId,
  studentId,
  teacher = false,
}: {
  schoolId?: string;
  studentId?: string;
  teacher?: boolean;
}) {
  const [data, setData] = useState<ReadinessWorkspace | null>(null),
    [fields, setFields] = useState<ReadinessFields>(emptyReadiness),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const lock = useRef(false),
    epoch = useRef(0),
    request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    epoch.current++;
    setData(null);
    setError("");
    setDraft(null);
    request.current = null;
    readinessWorkspace(schoolId ?? null, studentId ?? null)
      .then((d) => {
        if (active) {
          setData(d);
          setFields(
            d.estimate
              ? { ...d.estimate.fields, teacher_checked: false }
              : emptyReadiness(),
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [schoolId, studentId, revision]);
  const edit = (scope: string, patch: Partial<ReadinessRange>) =>
    setFields((f) => ({
      ...f,
      teacher_checked: false,
      ...(scope === "overall"
        ? { overall: { ...f.overall, ...patch } }
        : {
            skills: {
              ...f.skills,
              [scope]: {
                ...f.skills[scope as keyof typeof f.skills],
                ...patch,
              },
            },
          }),
    }));
  async function save() {
    if (lock.current || !schoolId || !studentId || !data?.can_manage) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    const key = JSON.stringify([
      schoolId,
      studentId,
      fields,
      data.source_hash,
      data.latest_id,
      draft,
    ]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      await publishReadiness(
        schoolId,
        studentId,
        fields,
        data.source_hash!,
        data.latest_id,
        request.current.id,
        draft,
      );
      if (generation === epoch.current) {
        setMessage("Teacher estimate shared in My IELTS Journey.");
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (generation === epoch.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (generation === epoch.current) setBusy(false);
    }
  }
  async function suggest() {
    if (lock.current || !schoolId || !studentId || !data) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      const d = await draftReadiness(schoolId, studentId);
      if (generation !== epoch.current) return;
      if (d.source_hash !== data.source_hash)
        throw Error(
          "Evidence changed. Refresh before requesting a discussion draft.",
        );
      setFields({ ...d.fields, teacher_checked: false });
      setDraft(d.id);
      setMessage(
        "Private AI discussion draft. Inspect the evidence and select your own ranges. Unsupported ranges stay blank.",
      );
    } catch (e) {
      if (generation === epoch.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (generation === epoch.current) setBusy(false);
    }
  }
  return (
    <section
      className="ij-panel ix-panel"
      aria-label="Provisional teacher readiness estimate"
    >
      <h3>Provisional teacher readiness estimate</h3>
      <p>Confidence: low · Not an official IELTS result</p>
      <p>{readinessLimit}</p>
      {error && (
        <IeltsNotice error>
          {error}
          <IeltsButton
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            Refresh evidence
          </IeltsButton>
        </IeltsNotice>
      )}
      {!data && !error && <p role="status">Checking readiness evidence…</p>}
      {message && <p role="status">{message}</p>}
      {data?.needs_review && (
        <IeltsNotice>
          Evidence changed. The previous estimate is retained in history and
          needs teacher review before it can be shown as current.
        </IeltsNotice>
      )}
      {data?.estimate && (
        <>
          <p>
            Shared by {data.estimate.author} ·{" "}
            {new Date(data.estimate.created_at).toLocaleDateString()}
          </p>
          <dl>
            {[...readinessSkills, "overall"].map((s) => {
              const r =
                s === "overall"
                  ? data.estimate!.fields.overall
                  : data.estimate!.fields.skills[
                      s as keyof ReadinessFields["skills"]
                    ];
              return (
                <React.Fragment key={s}>
                  <dt>{label(s)}</dt>
                  <dd>
                    <strong>{readinessRangeLabel(r)}</strong>
                    <details>
                      <summary>Evidence and next step</summary>
                      <p>{r.rationale}</p>
                      <p>{r.limitations}</p>
                      <p>{r.next_action}</p>
                    </details>
                  </dd>
                </React.Fragment>
              );
            })}
          </dl>
        </>
      )}
      {data && !data.estimate && (
        <p>
          No current teacher estimate is shared. Practice results and lesson
          coverage remain available separately.
        </p>
      )}
      {teacher && data?.can_manage && (
        <details>
          <summary>Review evidence and select ranges</summary>
          {!data.eligible && (
            <IeltsNotice>
              Complete all four valid screeners and finalize Writing and
              Speaking reviews first. Missing or compromised evidence needs
              another check; it is not a low score.
            </IeltsNotice>
          )}
          <details>
            <summary>
              Original evidence and finalized reviews · {data.evidence.length}{" "}
              records
            </summary>
            <ul>
              {data.evidence.map((e) => (
                <li key={`${e.source_type}:${e.source_id}`}>
                  <a href={e.route}>
                    {label(e.skill)} · {e.title ?? e.kind} ·{" "}
                    {new Date(e.occurred_at).toLocaleDateString()}
                  </a>
                  {e.raw_score != null && ` · ${e.raw_score}/${e.total}`}
                  <p>{e.next_step}</p>
                </li>
              ))}
            </ul>
          </details>
          <p>
            Inspect original answers, essay, Speaking audio or documented live
            observation, criteria, task coverage, recency, support and
            conflicting evidence. Keep unsupported ranges blank. Overall
            requires a separate teacher judgment.
          </p>
          <IeltsButton
            disabled={busy || !data.eligible}
            onClick={() => void suggest()}
          >
            AI help · evidence discussion
          </IeltsButton>
          <p>
            AI can suggest a sampled Writing range from the essay and reviewed
            criteria. Short Reading/Listening totals and text-only Speaking
            cannot supply automatic skill bands.
          </p>
          <fieldset
            disabled={busy || !data.eligible}
            className="ic-form"
            style={{ border: 0, padding: 0 }}
          >
            {[...readinessSkills, "overall"].map((s) => {
              const r =
                s === "overall"
                  ? fields.overall
                  : fields.skills[s as keyof ReadinessFields["skills"]];
              return (
                <details key={s}>
                  <summary>
                    {label(s)} · {readinessRangeLabel(r)}
                  </summary>
                  <div className="ix-fields">
                    {(["lower", "upper"] as const).map((k) => (
                      <label className="ix-field" key={k}>
                        {label(k)} bound
                        <input
                          type="number"
                          min="0"
                          max="9"
                          step="0.5"
                          value={r[k] ?? ""}
                          onChange={(e) =>
                            edit(s, {
                              [k]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {(["rationale", "limitations", "next_action"] as const).map(
                    (k) => (
                      <label className="ix-field" key={k}>
                        {k === "rationale"
                          ? "Evidence-linked rationale / reason for withholding"
                          : k === "limitations"
                            ? "Coverage and limitations"
                            : "Next check or action"}
                        <textarea
                          maxLength={k === "next_action" ? 800 : 1000}
                          value={r[k]}
                          onChange={(e) => edit(s, { [k]: e.target.value })}
                        />
                      </label>
                    ),
                  )}
                  <fieldset>
                    <legend>Supporting and conflicting sources</legend>
                    {data.evidence
                      .filter((e) => s === "overall" || e.skill === s)
                      .map((e) => (
                        <label className="ix-check" key={e.source_id}>
                          <input
                            type="checkbox"
                            checked={r.sources.includes(e.source_id)}
                            onChange={(event) =>
                              edit(s, {
                                sources: event.target.checked
                                  ? [...r.sources, e.source_id]
                                  : r.sources.filter(
                                      (id) => id !== e.source_id,
                                    ),
                              })
                            }
                          />
                          {e.title ?? `${label(e.skill)} ${e.kind}`} ·{" "}
                          {new Date(e.occurred_at).toLocaleDateString()}
                        </label>
                      ))}
                  </fieldset>
                </details>
              );
            })}
            <label className="ix-check">
              <input
                type="checkbox"
                checked={fields.teacher_checked}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    teacher_checked: e.target.checked,
                  }))
                }
              />
              I reviewed the original four-skill evidence, audio/live
              observations, coverage, recency, integrity and contradictory
              evidence. These are my provisional judgments; unsupported ranges
              are withheld.
            </label>
            <IeltsButton
              variant="primary"
              disabled={!fields.teacher_checked}
              onClick={() => void save()}
            >
              {busy ? "Sharing…" : "Confirm and share teacher estimate"}
            </IeltsButton>
          </fieldset>
        </details>
      )}
    </section>
  );
}
