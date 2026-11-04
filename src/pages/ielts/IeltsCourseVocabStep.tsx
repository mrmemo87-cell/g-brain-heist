import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/ielts-course.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import { IeltsHabitCelebration, useIeltsCourseHabit } from '../../components/ielts/IeltsCourseHabit';
import {
  IELTS_COURSE_VOCAB_ROUTE,
  fetchIeltsVocabStep,
  ieltsCourseUnitRoute,
  ieltsVocabStepRoute,
  submitIeltsVocabStep,
  type IeltsVocabQuestion,
  type IeltsVocabResult,
  type IeltsVocabStep,
} from '../../../services/ieltsCourseService';

const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN'];

/** Split the step text into the LEARN FIRST box, its worked example and the reading passage. */
export function splitVocabPassage(raw: string | null | undefined) {
  const text = (raw ?? '').replace(/\r\n/g, '\n');
  const [learnPart, ...rest] = text.split(/\n\s*(?:- ){5,}-?\s*\n/);
  const passagePart = rest.join('\n').trim();
  const learnLines = (learnPart ?? '').trim();
  const head = /^LEARN FIRST:\s*(.+)$/m.exec(learnLines);
  const withoutHead = head ? learnLines.replace(head[0], '').trim() : learnLines;
  const [body, example] = withoutHead.split(/\n\s*WORKED EXAMPLE\s*\n/);
  const passageHead = /^THE PASSAGE:\s*(.+)$/m.exec(passagePart);
  const passageBody = passageHead ? passagePart.replace(passageHead[0], '').trim() : passagePart;
  return {
    learnTitle: head?.[1]?.trim() ?? null,
    learnBody: (body ?? '').trim(),
    example: example?.trim() ?? null,
    passageTitle: passageHead?.[1]?.trim() ?? null,
    passage: passageBody ? passageBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [],
  };
}

/** Self-paced learners have no teacher: drop instructions that address one. */
export const learnerInstructions = (text: string | null | undefined) =>
  (text ?? '').split(/(?<=\.)\s+/).filter((sentence) => !/\bteacher\b/i.test(sentence)).join(' ').trim();

const optionLabel = (q: IeltsVocabQuestion, value: string) =>
  q.options?.find((o) => o.value === value)?.label ?? value;

/**
 * One step of a vocabulary lesson in the course's vocabulary path: LEARN FIRST, the passage, six questions,
 * then instant marking with an explanation for every answer. Practice only, never a band.
 */
const IeltsCourseVocabStep: React.FC = () => {
  const navigate = useNavigate();
  const { code = '' } = useParams();
  const [step, setStep] = useState<IeltsVocabStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IeltsVocabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { habit, refresh: refreshHabit } = useIeltsCourseHabit();
  const [xpGained, setXpGained] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchIeltsVocabStep(code);
      setStep(next);
      setResult(next.result);
      setAnswers(next.result?.answers ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This step could not load.');
    }
  }, [code]);

  useEffect(() => { setStep(null); setResult(null); setAnswers({}); setXpGained(null); void load(); }, [load]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [code]);

  const parts = useMemo(() => splitVocabPassage(step?.passage), [step?.passage]);
  const answered = step ? step.questions.filter((q) => (answers[q.id] ?? '').trim()).length : 0;
  const outcome = (id: string) => result?.outcomes.find((o) => o.id === id);

  const submit = async () => {
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      const before = habit?.today_xp ?? null;
      const marked = await submitIeltsVocabStep(step.code, answers);
      setResult(marked);
      void refreshHabit().then((after) => {
        if (after && before !== null) setXpGained(Math.max(after.today_xp - before, 0));
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your answers could not be marked.');
    } finally {
      setBusy(false);
    }
  };

  const tryAgain = () => { setResult(null); setAnswers({}); setXpGained(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const unitRoute = step ? ieltsCourseUnitRoute(step.unit_id) : IELTS_COURSE_VOCAB_ROUTE;
  const isCheck = step?.purpose === 'independent_check';

  return (
    <IeltsStudentShell focus={{ label: step ? `Back to ${step.unit_title}` : 'Vocabulary path', to: unitRoute }}>
      <div className="ic-page ic-page--embedded" style={{ ['--tone' as string]: '#047857', ['--soft' as string]: '#ECFDF5' } as React.CSSProperties}>
        <main className="ic-main">
          <IeltsHabitCelebration habit={result ? habit : null} />
          {error && (
            <div className="ic-notice ic-notice--error" role="alert">
              <b>{error}</b>
              <button type="button" className="ic-btn ic-btn--ghost" onClick={() => void load()}>Retry</button>
            </div>
          )}

          {!step && !error && <div className="ic-skeleton" style={{ height: 260 }} aria-busy="true" />}

          {step && (
            <>
              <header className="iv-head">
                <p className="ic-eyebrow">{step.unit_title} · step {step.step} of {step.steps}{isCheck ? ' · mixed check' : ''}</p>
                <h1>{step.title}</h1>
                <div className="iv-dots" aria-hidden="true">
                  {Array.from({ length: step.steps }).map((_, i) => (
                    <span key={i} className={i + 1 < step.step ? 'is-done' : i + 1 === step.step ? 'is-now' : ''} />
                  ))}
                </div>
                <div className="iv-meta">
                  {step.minutes ? <span>⏱ about {step.minutes} min</span> : null}
                  <span>{step.questions.length} questions</span>
                  {step.display_code ? <span>{step.display_code}</span> : null}
                </div>
              </header>

              {result && (
                <section className="iv-score" role="status" aria-live="polite">
                  <p className="ic-eyebrow ic-eyebrow--light">Your practice score</p>
                  <span className="iv-score-num">{result.score}/{result.total}</span>
                  {xpGained !== null && (
                    <span className="iv-xp" aria-label={xpGained > 0 ? `${xpGained} XP earned` : 'XP already earned for this step today'}>
                      {xpGained > 0 ? `+${xpGained} XP` : 'XP already earned today'}{habit ? ` · 🔥 ${habit.streak}` : ''}
                    </span>
                  )}
                  <h2>{result.score === result.total ? 'Perfect. Every answer right.' : result.score >= Math.ceil(result.total * 0.66) ? 'Strong work.' : 'Good effort. Read the explanations below.'}</h2>
                  <p>Each answer is explained below. This is a practice score, not an IELTS band.</p>
                </section>
              )}

              {!result && (
                <p className="ic-muted">{learnerInstructions(step.instructions)}</p>
              )}

              {(parts.learnTitle || parts.learnBody) && (
                <section className="iv-learn" aria-labelledby="iv-learn-title">
                  <p className="ic-eyebrow" style={{ color: '#b45309' }}>Learn first</p>
                  <h2 id="iv-learn-title">{parts.learnTitle ?? 'Before you start'}</h2>
                  {parts.learnBody && <p>{parts.learnBody}</p>}
                  {parts.example && (
                    <div className="iv-example">
                      <p className="ic-eyebrow" style={{ color: '#b45309' }}>Worked example</p>
                      <p>{parts.example}</p>
                    </div>
                  )}
                </section>
              )}

              {parts.passage.length > 0 && (
                <section className="iv-passage" aria-labelledby="iv-passage-title">
                  <details open={!result}>
                    <summary id="iv-passage-title">{parts.passageTitle ? `The passage: ${parts.passageTitle}` : 'The passage'}</summary>
                    <div style={{ display: 'grid', gap: '.7rem', marginTop: '.7rem' }}>
                      {parts.passage.map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                  </details>
                </section>
              )}

              <section className="iv-questions" aria-label="Questions">
                {step.questions.map((q, i) => {
                  const out = outcome(q.id);
                  const picked = answers[q.id] ?? '';
                  const options = q.options && q.options.length ? q.options : q.answer_format === 'text' ? null : TFNG.map((v) => ({ value: v, label: v }));
                  const key = out?.accepted_answers ?? [];
                  return (
                    <article key={q.id} className={`iv-q${out ? (out.correct ? ' iv-q--right' : ' iv-q--wrong') : ''}`}>
                      <div className="iv-q-prompt"><span className="iv-q-num" aria-hidden="true">{i + 1}</span><span>{q.prompt}</span></div>
                      {options ? (
                        <div className="iv-options" role="radiogroup" aria-label={`Question ${i + 1}`}>
                          {options.map((o) => {
                            const isPicked = picked === o.value;
                            const isKey = Boolean(out) && key.some((k) => k.toLowerCase() === o.value.toLowerCase());
                            const cls = out ? (isKey ? ' is-key' : isPicked ? ' is-miss' : '') : isPicked ? ' is-picked' : '';
                            return (
                              <button key={o.value} type="button" role="radio" aria-checked={isPicked} disabled={Boolean(result)}
                                className={`iv-option${cls}`} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))}>
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input className="iv-input" type="text" inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                          aria-label={`Answer to question ${i + 1}`} value={picked} disabled={Boolean(result)} maxLength={120}
                          onChange={(e) => { const value = e.target.value; setAnswers((a) => ({ ...a, [q.id]: value })); }} />
                      )}
                      {out && (
                        <div className="iv-feedback">
                          {out.correct
                            ? <b className="iv-ok">✓ Correct</b>
                            : <b className="iv-no">{out.response_state === 'unanswered' ? '— Not answered.' : '✗ Not quite.'} Answer: {key.map((k) => optionLabel(q, k)).join(' / ')}</b>}
                          {result?.explanations[q.id] && <span>{result.explanations[q.id]}</span>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              {!result ? (
                <div className="iv-actions">
                  <button type="button" className="ic-btn ic-btn--primary ic-btn--block" disabled={busy || answered === 0} onClick={() => void submit()}>
                    {busy ? 'Marking…' : `Check my answers (${answered}/${step.questions.length})`}
                  </button>
                  {answered < step.questions.length && answered > 0 && <p className="iv-note">You can check with gaps; unanswered questions count as wrong.</p>}
                </div>
              ) : (
                <div className="iv-actions">
                  {result.unit_completed ? (
                    <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" onClick={() => navigate(unitRoute)}>Lesson complete: see your medal <span aria-hidden="true">→</span></button>
                  ) : step.next_code ? (
                    <button type="button" className="ic-btn ic-btn--primary ic-btn--block" onClick={() => navigate(ieltsVocabStepRoute(step.next_code as string))}>Next step <span aria-hidden="true">→</span></button>
                  ) : (
                    <button type="button" className="ic-btn ic-btn--primary ic-btn--block" onClick={() => navigate(unitRoute)}>Back to the lesson <span aria-hidden="true">→</span></button>
                  )}
                  <button type="button" className="ic-btn ic-btn--ghost ic-btn--block" onClick={tryAgain}>Try this step again</button>
                  <p className="iv-note">Practice only. Brains Heist does not turn these scores into an IELTS band.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsCourseVocabStep;
