import React from 'react';
import { groupNumbers, optionLetter, optionText, type MockAnswers, type MockGroup } from '../../../../services/ieltsMockCbtService';

interface Props {
  group: MockGroup;
  answers: MockAnswers;
  onAnswer: (n: number, value: string) => void;
  onMulti: (numbers: number[], letters: string[]) => void;
  flagged: Set<number>;
  onFocusQuestion: (n: number) => void;
  disabled?: boolean;
}

const BLANK = /_{3,}/;

const rangeLabel = (g: MockGroup) => (g.range[0] === g.range[1] ? `Question ${g.range[0]}` : `Questions ${g.range[0]}–${g.range[1]}`);

/** A gap inside a sentence: the box shows its question number until the learner types. */
function Gap({ n, value, onChange, onFocus, disabled }: { n: number; value: string; onChange: (v: string) => void; onFocus: () => void; disabled?: boolean }) {
  return (
    <input
      id={`mk-q${n}`}
      className="mk-gap"
      type="text"
      value={value}
      placeholder={String(n)}
      aria-label={`Question ${n}`}
      maxLength={60}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      disabled={disabled}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PromptWithGap({ prompt, n, value, onChange, onFocus, disabled }: { prompt: string; n: number; value: string; onChange: (v: string) => void; onFocus: () => void; disabled?: boolean }) {
  const parts = prompt.split(BLANK);
  if (parts.length < 2) {
    return (
      <span className="mk-gap-line">
        <span>{prompt}</span> <Gap n={n} value={value} onChange={onChange} onFocus={onFocus} disabled={disabled} />
      </span>
    );
  }
  return (
    <span className="mk-gap-line">
      {parts[0]}
      <Gap n={n} value={value} onChange={onChange} onFocus={onFocus} disabled={disabled} />
      {parts.slice(1).join('______')}
    </span>
  );
}

function Flag({ n, flagged }: { n: number; flagged: Set<number> }) {
  return flagged.has(n) ? <span className="mk-flag-mark" title="Marked for review">Review</span> : null;
}

export default function MockQuestionGroup({ group: g, answers, onAnswer, onMulti, flagged, onFocusQuestion, disabled }: Props) {
  const value = (n: number) => answers[String(n)] ?? '';
  const isTable = g.type === 'completion' && /table/i.test(g.instructions);

  return (
    <section className="mk-group" aria-labelledby={`mk-g${g.range[0]}`}>
      <h3 id={`mk-g${g.range[0]}`} className="mk-group-range">{rangeLabel(g)}</h3>
      <p className="mk-group-instr">{g.instructions}</p>

      {g.figure && (
        <figure className="mk-figure">
          <img src={g.figure.src} alt={g.figure.alt || g.figure.title} loading="eager" />
        </figure>
      )}

      {g.type === 'completion' && isTable && (
        <div className="mk-box">
          {g.form_title && <h4 className="mk-box-title">{g.form_title}</h4>}
          <table className="mk-table">
            <tbody>
              {(g.items ?? []).map((it) => {
                const idx = it.prompt.indexOf(':');
                const head = idx > 0 ? it.prompt.slice(0, idx) : '';
                const body = idx > 0 ? it.prompt.slice(idx + 1).trim() : it.prompt;
                return (
                  <tr key={it.n}>
                    {head && <th scope="row">{head}</th>}
                    <td><PromptWithGap prompt={body} n={it.n} value={value(it.n)} onChange={(v) => onAnswer(it.n, v)} onFocus={() => onFocusQuestion(it.n)} disabled={disabled} /> <Flag n={it.n} flagged={flagged} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {g.type === 'completion' && !isTable && (
        <div className="mk-box">
          {g.form_title && <h4 className="mk-box-title">{g.form_title}</h4>}
          <ul className="mk-notes">
            {(g.items ?? []).map((it) => (
              <li key={it.n}>
                <PromptWithGap prompt={it.prompt} n={it.n} value={value(it.n)} onChange={(v) => onAnswer(it.n, v)} onFocus={() => onFocusQuestion(it.n)} disabled={disabled} /> <Flag n={it.n} flagged={flagged} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.type === 'short' && (
        <ol className="mk-list">
          {(g.items ?? []).map((it) => (
            <li key={it.n} className="mk-q">
              <span className="mk-q-num">{it.n}</span>
              <div className="mk-q-body">
                <p>{it.prompt} <Flag n={it.n} flagged={flagged} /></p>
                <Gap n={it.n} value={value(it.n)} onChange={(v) => onAnswer(it.n, v)} onFocus={() => onFocusQuestion(it.n)} disabled={disabled} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {(g.type === 'tfng' || g.type === 'ynng') && (
        <ol className="mk-list">
          {(g.items ?? []).map((it) => {
            const choices = g.type === 'tfng' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN'];
            return (
              <li key={it.n} className="mk-q" id={`mk-q${it.n}`}>
                <span className="mk-q-num">{it.n}</span>
                <fieldset className="mk-q-body">
                  <legend>{it.prompt} <Flag n={it.n} flagged={flagged} /></legend>
                  <div className="mk-choices mk-choices--row">
                    {choices.map((c) => (
                      <label key={c} className={`mk-choice${value(it.n) === c ? ' is-on' : ''}`}>
                        <input type="radio" name={`q${it.n}`} value={c} checked={value(it.n) === c} disabled={disabled}
                          onFocus={() => onFocusQuestion(it.n)} onChange={() => onAnswer(it.n, c)} />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      {g.type === 'mcq' && (
        <ol className="mk-list">
          {(g.items ?? []).map((it) => (
            <li key={it.n} className="mk-q" id={`mk-q${it.n}`}>
              <span className="mk-q-num">{it.n}</span>
              <fieldset className="mk-q-body">
                <legend>{it.prompt} <Flag n={it.n} flagged={flagged} /></legend>
                <div className="mk-choices">
                  {(it.options ?? []).map((o) => {
                    const l = optionLetter(o);
                    return (
                      <label key={o} className={`mk-choice${value(it.n) === l ? ' is-on' : ''}`}>
                        <input type="radio" name={`q${it.n}`} value={l} checked={value(it.n) === l} disabled={disabled}
                          onFocus={() => onFocusQuestion(it.n)} onChange={() => onAnswer(it.n, l)} />
                        <b className="mk-choice-letter">{l}</b><span>{optionText(o)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
      )}

      {g.type === 'multi' && (() => {
        const nums = groupNumbers(g);
        const picked = nums.map((n) => value(n)).filter(Boolean);
        const toggle = (l: string) => {
          const next = picked.includes(l) ? picked.filter((x) => x !== l) : picked.length < nums.length ? [...picked, l] : picked;
          onMulti(nums, [...next].sort());
        };
        return (
          <div className="mk-q mk-q--multi" id={`mk-q${nums[0]}`} role="group" aria-labelledby={`mk-stem${nums[0]}`}>
            <span className="mk-q-num">{nums[0]}–{nums[nums.length - 1]}</span>
            <div className="mk-q-body">
              <p className="mk-stem" id={`mk-stem${nums[0]}`}>{g.stem}</p>
              <p className="mk-hint">{picked.length} of {nums.length} chosen</p>
              <div className="mk-choices">
                {(g.options ?? []).map((o) => {
                  const l = optionLetter(o);
                  const on = picked.includes(l);
                  return (
                    <label key={o} className={`mk-choice${on ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={on} disabled={disabled || (!on && picked.length >= nums.length)}
                        onFocus={() => onFocusQuestion(nums[0])} onChange={() => toggle(l)} />
                      <b className="mk-choice-letter">{l}</b><span>{optionText(o)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {g.type === 'matching' && (() => {
        const letters = (g.options ?? []).map(optionLetter);
        const describedOptions = (g.options ?? []).some((o) => optionText(o) !== o.trim() && optionText(o).length > 0);
        return (
          <>
            {describedOptions && (
              <div className="mk-box mk-box--options">
                <h4 className="mk-box-title">{g.options_title ?? 'Options'}</h4>
                <ul className="mk-option-list">
                  {(g.options ?? []).map((o) => <li key={o}><b>{optionLetter(o)}</b> {optionText(o)}</li>)}
                </ul>
              </div>
            )}
            <div className="mk-grid-wrap">
              <table className="mk-grid">
                <thead>
                  <tr><th scope="col"><span className="mk-sr">Question</span></th>{letters.map((l) => <th key={l} scope="col">{l}</th>)}</tr>
                </thead>
                <tbody>
                  {(g.items ?? []).map((it) => (
                    <tr key={it.n} id={`mk-q${it.n}`}>
                      <th scope="row"><span className="mk-q-num">{it.n}</span> {it.prompt} <Flag n={it.n} flagged={flagged} /></th>
                      {letters.map((l) => (
                        <td key={l}>
                          <label className="mk-cell">
                            <input type="radio" name={`q${it.n}`} value={l} checked={value(it.n) === l} disabled={disabled}
                              aria-label={`Question ${it.n}: ${l}`} onFocus={() => onFocusQuestion(it.n)} onChange={() => onAnswer(it.n, l)} />
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </section>
  );
}
