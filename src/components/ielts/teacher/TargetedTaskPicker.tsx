import React, { useMemo } from "react";
import { ieltsMaterialTitle } from "../../../../services/ieltsMaterialCode";
import { SKILLS, skillName, targetedCatalogue, type TargetedSkill, type TargetedTaskLike } from "../../../../services/ieltsTargetedCatalogue";

interface Usage { active_count?: number | null; assigned_count?: number | null }
type Task = TargetedTaskLike & { originality_label?: string | null };

/**
 * Teachers choose targeted practice by skill, then lesson, then step, in teaching order.
 * The full list stays available underneath for anyone who knows the task code.
 */
export default function TargetedTaskPicker<T extends Task>({ tasks, value, disabled, usageOf, onChange }: {
  tasks: T[];
  value: string;
  disabled?: boolean;
  usageOf: (code: string) => Usage | undefined;
  onChange: (code: string) => void;
}) {
  const catalogue = useMemo(() => targetedCatalogue(tasks), [tasks]);
  const selected = tasks.find((t) => t.code === value);
  const skill = ((selected?.skill ?? SKILLS.find((s) => catalogue[s].length)) ?? "listening") as TargetedSkill;
  const family = catalogue[skill].find((f) => f.tasks.some((x) => x.task.code === value)) ?? catalogue[skill][0];
  const usageText = (code: string) => {
    const u = usageOf(code);
    return !u ? "" : u.active_count ? "Already active" : u.assigned_count ? "Given before" : "Not given yet";
  };
  const chooseSkill = (s: TargetedSkill) => { const first = catalogue[s][0]?.tasks[0]?.task.code; if (first) onChange(first); };
  const chooseFamily = (key: string) => { const f = catalogue[skill].find((x) => x.family === key); if (f?.tasks[0]) onChange(f.tasks[0].task.code); };
  return (
    <div className="bh-ielts-field-task il-picker">
      <p className="il-picker-label">Choose the practice</p>
      <div className="il-picker-skills" role="group" aria-label="Skill">
        {SKILLS.map((s) => (
          <button key={s} type="button" aria-pressed={s === skill} disabled={disabled || !catalogue[s].length} onClick={() => chooseSkill(s)}>
            {skillName(s)} <span className="il-picker-count">{catalogue[s].reduce((n, f) => n + f.tasks.length, 0)}</span>
          </button>
        ))}
      </div>
      {catalogue[skill].length > 0 && (
        <label className="il-answer il-picker-lesson">
          Lesson or series
          <select value={family?.family ?? ""} disabled={disabled} onChange={(e) => chooseFamily(e.target.value)}>
            {catalogue[skill].map((f) => (
              <option key={f.family} value={f.family}>
                {f.familyName} · {f.tasks.length} {f.tasks.length === 1 ? "task" : f.tasks[0].place.step ? "steps" : "tasks"}
              </option>
            ))}
          </select>
        </label>
      )}
      {family && (
        <ol className="il-picker-steps" aria-label={`${family.familyName}: tasks in teaching order`}>
          {family.tasks.map(({ task: t, place }) => {
            const on = t.code === value;
            const used = usageText(t.code);
            return (
              <li key={t.code}>
                <button type="button" className={on ? "il-picker-step il-picker-step--on" : "il-picker-step"} aria-pressed={on} disabled={disabled} onClick={() => onChange(t.code)}>
                  <span className="il-picker-step-kicker">{[place.stepLabel, t.display_code].filter(Boolean).join(" · ")}</span>
                  <span className="il-picker-step-title">{place.shortTitle}</span>
                  <span className="il-picker-tags">
                    <span className={t.purpose === "independent_check" ? "il-tag il-tag--check" : "il-tag"}>{t.purpose === "independent_check" ? "Fresh check" : "Guided practice"}</span>
                    {t.originality_label?.startsWith("Variant of ") && <span className="il-tag il-tag--muted">Repeat practice</span>}
                    {used && <span className={used === "Already active" ? "il-tag il-tag--warn" : "il-tag il-tag--muted"}>{used}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <details className="il-picker-all">
        <summary>Find a task in the full list</summary>
        <label className="il-answer">
          Task
          <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {SKILLS.map((s) => catalogue[s].map((f) => (
              <optgroup key={f.family} label={`${skillName(s)} · ${f.familyName}`}>
                {f.tasks.map(({ task: t, place }) => (
                  <option key={t.code} value={t.code}>
                    {place.stepLabel ? `${place.stepLabel}: ` : ""}{ieltsMaterialTitle(t.display_code, place.shortTitle)} · {t.purpose === "independent_check" ? "Fresh check" : "Guided practice"}{usageText(t.code) ? ` · ${usageText(t.code)}` : ""}
                  </option>
                ))}
              </optgroup>
            )))}
          </select>
        </label>
      </details>
    </div>
  );
}
