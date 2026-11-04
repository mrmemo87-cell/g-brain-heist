import React, { useState } from 'react';
import { saveIeltsExamPlan, type IeltsCourseHabit, type IeltsExamPlan } from '../../../services/ieltsCourseHabitService';
import { Blaze } from './IeltsGameArt';

const MODULES = [
  { id: 'academic', label: 'Academic', hint: 'For university' },
  { id: 'general', label: 'General Training', hint: 'For work or moving abroad' },
  { id: 'unsure', label: 'Not sure yet', hint: 'Both are covered' },
] as const;
const TARGETS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5];
const today = () => new Date().toISOString().slice(0, 10);
const maxDate = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); };

/**
 * First-visit welcome for the self-paced course: three quick questions (module, test date, target score). Every
 * answer is optional and can be changed later. The target is the learner's own goal, never a prediction.
 */
export function IeltsExamPlanSheet({ initial, onDone, onClose, firstVisit }: {
  initial?: IeltsExamPlan;
  onDone: (habit: IeltsCourseHabit) => void;
  onClose?: () => void;
  firstVisit?: boolean;
}) {
  const [step, setStep] = useState(firstVisit ? 0 : 1);
  const [module, setModule] = useState<string | null>(initial?.module ?? null);
  const [date, setDate] = useState<string>(initial?.date ?? '');
  const [noDate, setNoDate] = useState(Boolean(initial?.onboarded && !initial?.date));
  const [target, setTarget] = useState<number | null>(initial?.target ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onDone(await saveIeltsExamPlan({ module, date: noDate || !date ? null : date, target }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ic-sheet-backdrop" onClick={firstVisit ? undefined : onClose}>
      <div className="ic-sheet ep-sheet" role="dialog" aria-modal="true" aria-labelledby="ep-title" onClick={(e) => e.stopPropagation()}>
        <span className="ic-sheet-grip" aria-hidden="true" />
        {step === 0 ? (
          <div className="ep-welcome">
            <Blaze mood="cheer" size={120} />
            <h2 id="ep-title">Welcome! I'm Blaze.</h2>
            <p>I'll keep your IELTS prep on track: short lessons, real practice and a streak to protect. Three quick questions and we start.</p>
            <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" onClick={() => setStep(1)}>Let's go <span aria-hidden="true">→</span></button>
          </div>
        ) : (
          <>
            <h2 id="ep-title">Your IELTS plan</h2>
            <p className="ic-muted">Everything is optional and you can change it any time.</p>

            <fieldset className="ep-group">
              <legend>Which test are you taking?</legend>
              <div className="ep-options">
                {MODULES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={module === m.id} className={`ep-option${module === m.id ? ' is-on' : ''}`} onClick={() => setModule(m.id)}>
                    <b>{m.label}</b><small>{m.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="ep-group">
              <legend>When is your test?</legend>
              <input className="ep-date" type="date" min={today()} max={maxDate()} value={noDate ? '' : date} disabled={noDate}
                aria-label="Test date" onChange={(e) => setDate(e.target.value)} />
              <label className="ep-check"><input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Not booked yet</label>
            </fieldset>

            <fieldset className="ep-group">
              <legend>What score do you need?</legend>
              <div className="ep-targets">
                {TARGETS.map((t) => (
                  <button key={t} type="button" aria-pressed={target === t} className={`ep-target${target === t ? ' is-on' : ''}`} onClick={() => setTarget(target === t ? null : t)}>{t.toFixed(1)}</button>
                ))}
              </div>
              <small className="ic-muted">Your goal, set by you. Brains Heist never predicts your official score.</small>
            </fieldset>

            {error && <p className="ih-note" role="alert">{error}</p>}
            <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : firstVisit ? 'Start my course' : 'Save my plan'} <span aria-hidden="true">→</span>
            </button>
            {firstVisit
              ? <button type="button" className="ic-link" onClick={() => void save()} disabled={saving}>Skip for now</button>
              : <button type="button" className="ic-btn ic-btn--ghost ic-btn--block" onClick={onClose}>Close</button>}
          </>
        )}
      </div>
    </div>
  );
}

const moduleLabel = (m: IeltsExamPlan['module']) => (m === 'academic' ? 'Academic' : m === 'general' ? 'General Training' : 'IELTS');

/** Countdown card on the course map. Tap to edit the plan. */
export function IeltsExamCountdown({ exam, onEdit }: { exam: IeltsExamPlan; onEdit: () => void }) {
  const days = exam.days_left;
  const headline = days === null ? 'Add your test date'
    : days < 0 ? 'How did your test go?'
      : days === 0 ? "Test day. You've got this!"
        : days === 1 ? '1 day to your test'
          : `${days} days to your test`;
  return (
    <button type="button" className={`ep-countdown${days !== null && days >= 0 && days <= 14 ? ' is-soon' : ''}`} onClick={onEdit}>
      <span className="ep-cal" aria-hidden="true">
        <span className="ep-cal-top">{exam.module === 'academic' ? 'AC' : exam.module === 'general' ? 'GT' : 'IELTS'}</span>
        <b>{days !== null && days >= 0 ? days : '?'}</b>
      </span>
      <span className="ep-countdown-text">
        <b>{headline}</b>
        <small>{moduleLabel(exam.module)} · {exam.target ? `goal ${exam.target.toFixed(1)}` : 'set your goal'} · edit</small>
      </span>
    </button>
  );
}
