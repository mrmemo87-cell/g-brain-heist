import React, { useMemo, useState } from 'react';
import type { WritingHighlight } from '../../../services/ieltsPracticeFeedback';
// Styles: ielts-speaking-transcript.css, imported by each host page (keeps this component importable in node tests).

/**
 * Colour-coded Writing essay (Diagnostic Bible 2.4.0 section 10.9; Visual & UX Bible 13.10).
 * Each criterion has its own colour AND a text tag (TR/TA, CC, LR, GR), so meaning never depends on colour alone.
 * Every "to improve" language highlight shows the corrected wording. Highlights point into the exact essay by
 * Unicode code-point offsets that the server checked.
 */
export const WRITING_CRITERIA_LEGEND = [
  { key: 'task_response', short: 'TR', label: 'Task Response' },
  { key: 'task_achievement', short: 'TA', label: 'Task Achievement' },
  { key: 'coherence_cohesion', short: 'CC', label: 'Coherence & Cohesion' },
  { key: 'lexical_resource', short: 'LR', label: 'Vocabulary (Lexical Resource)' },
  { key: 'grammar_range_accuracy', short: 'GR', label: 'Grammar (Range & Accuracy)' },
] as const;
const shortOf = Object.fromEntries(WRITING_CRITERIA_LEGEND.map(c => [c.key, c.short])) as Record<string, string>;
const labelOf = Object.fromEntries(WRITING_CRITERIA_LEGEND.map(c => [c.key, c.label])) as Record<string, string>;

type Segment = { text: string; h: number };
/** Splits the essay into plain and highlighted runs. Overlapping or out-of-range highlights are skipped. */
export function segmentEssay(essay: string, highlights: WritingHighlight[]): { segments: Segment[]; placed: number[] } {
  const chars = Array.from(essay);
  const owner = new Array<number>(chars.length).fill(-1);
  const placed: number[] = [];
  highlights.forEach((hl, i) => {
    const { start_char: s, end_char: e } = hl;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s || e > chars.length) return;
    if (chars.slice(s, e).join('') !== hl.quote) return;
    if (owner.slice(s, e).some(v => v !== -1)) return;
    for (let k = s; k < e; k++) owner[k] = i;
    placed.push(i);
  });
  const segments: Segment[] = [];
  chars.forEach((ch, k) => {
    const last = segments[segments.length - 1];
    if (last && last.h === owner[k]) last.text += ch; else segments.push({ text: ch, h: owner[k] });
  });
  return { segments, placed };
}

type Props = {
  essay: string;
  /** Undefined when the feedback was made before highlights existed. */
  highlights?: WritingHighlight[];
  /** 1 or 2: decides whether the task criterion is Task Achievement or Task Response. */
  taskNumber?: 1 | 2;
  audience?: 'teacher' | 'student';
  title?: string;
};

export default function WritingEssayHighlights({ essay, highlights: raw, taskNumber = 2, audience = 'student', title }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'fix' | 'strength'>('all');
  const annotated = raw !== undefined;
  const highlights = useMemo(() => raw ?? [], [raw]);
  const { segments, placed } = useMemo(() => segmentEssay(essay, highlights), [essay, highlights]);
  const order = useMemo(() => placed.slice().sort((a, b) => highlights[a].start_char - highlights[b].start_char), [placed, highlights]);
  const number = useMemo(() => new Map(order.map((i, n) => [i, n + 1])), [order]);
  const legend = WRITING_CRITERIA_LEGEND.filter(c => c.key !== (taskNumber === 1 ? 'task_response' : 'task_achievement'));
  const counts = legend.map(c => ({ ...c, n: placed.filter(i => highlights[i].criterion === c.key).length }));
  const fixes = placed.filter(i => highlights[i].kind === 'fix').length;
  const shown = (i: number) => filter === 'all' || highlights[i].kind === filter;
  const activeNote = active !== null ? highlights[active] : null;

  return (
    <section className="st-panel we-panel" aria-label={title ?? 'Essay with feedback highlights'}>
      {title ? <h3 className="st-title">{title}</h3> : null}
      {annotated ? (
        <>
          <ul className="st-legend" aria-label="Colour key">
            {counts.map(c => (
              <li key={c.key} className={`st-key st-c-${c.key}`}>
                <span className="st-swatch" aria-hidden="true">{c.short}</span>{c.label}
                <span className="st-count">{c.n}</span>
              </li>
            ))}
          </ul>
          {placed.length ? (
            <div className="we-filter" role="group" aria-label="Show highlights">
              {([['all', `All (${placed.length})`], ['fix', `To improve (${fixes})`], ['strength', `Done well (${placed.length - fixes})`]] as const).map(([key, text]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setActive(null); }}>{text}</button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="st-legacy">This feedback was made before colour highlights were added, so the essay is shown without them.</p>
      )}

      <p className="st-text we-text">
        {essay.trim() ? segments.map((seg, k) => seg.h >= 0 && shown(seg.h) ? (
          <mark
            key={k}
            className={`st-hl st-c-${highlights[seg.h].criterion} st-${highlights[seg.h].kind}${active === seg.h ? ' is-active' : ''}`}
            tabIndex={0}
            role="button"
            aria-pressed={active === seg.h}
            aria-label={`${labelOf[highlights[seg.h].criterion]}, ${highlights[seg.h].kind === 'fix' ? 'to improve' : 'done well'}: ${seg.text}`}
            onClick={() => setActive(active === seg.h ? null : seg.h)}
            onKeyDown={(e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(active === seg.h ? null : seg.h); } }}
          >
            {seg.text}
            <sup className="st-tag" aria-hidden="true">{shortOf[highlights[seg.h].criterion]}{number.get(seg.h)}</sup>
          </mark>
        ) : <span key={k}>{seg.text}</span>) : <span className="st-empty">No writing was received.</span>}
      </p>

      {activeNote ? (
        <div className={`st-callout st-c-${activeNote.criterion}`} role="status">
          <strong>{activeNote.kind === 'fix' ? 'To improve' : 'Done well'} · {labelOf[activeNote.criterion]}</strong>
          {activeNote.correction ? (
            <span className="we-fix"><s>{activeNote.quote}</s> <span aria-hidden="true">→</span><span className="st-sr"> write instead </span> <b>{activeNote.correction}</b></span>
          ) : null}
          <span>{activeNote.note}</span>
        </div>
      ) : placed.length ? <p className="st-hint">Tap a highlighted phrase to see the note{fixes ? ' and the correction' : ''}.</p> : null}

      {placed.length ? (
        <ol className="st-notes" aria-label="Highlight notes">
          {order.filter(shown).map(i => {
            const hl = highlights[i];
            return (
              <li key={i} className={`st-note st-c-${hl.criterion}`}>
                <span className="st-note-tag">{shortOf[hl.criterion]}{number.get(i)}</span>
                <span className={`st-kind st-kind--${hl.kind}`}>{hl.kind === 'fix' ? '✎ To improve' : '✓ Done well'}</span>
                {audience === 'teacher' ? <span className="st-note-crit">{labelOf[hl.criterion]}</span> : null}
                {hl.correction ? (
                  <span className="we-fix"><s>{hl.quote}</s> <span aria-hidden="true">→</span><span className="st-sr"> write instead </span> <b>{hl.correction}</b></span>
                ) : <q>{hl.quote}</q>}
                <span className="st-note-text">{hl.note}</span>
              </li>
            );
          })}
        </ol>
      ) : annotated ? <p className="st-muted">No highlights were found for this essay.</p> : null}
      {annotated && placed.length ? <p className="st-fine">Highlights and corrections are AI practice feedback{audience === 'teacher' ? '. Check them before you confirm.' : '.'}</p> : null}
    </section>
  );
}
