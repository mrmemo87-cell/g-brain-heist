import React, { useEffect, useRef, useState } from 'react';
import type { MockPassage as MockPassageData } from '../../../../services/ieltsMockCbtService';

type Range = [number, number];
type Highlights = Record<number, Range[]>;

const storeKey = (attemptId: string, n: number) => `bh_ielts_mock_hl_${attemptId}_${n}`;

const merge = (ranges: Range[]): Range[] => {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
};

/** Character offset of a point inside a paragraph element. */
const offsetIn = (el: HTMLElement, node: Node, offset: number): number => {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setEnd(node, offset);
  return range.toString().length;
};

/**
 * A Reading passage with learner highlighting, as in computer-delivered IELTS: select text and press Highlight;
 * tap a highlight to remove it. Highlights stay on this device only and are not part of the answers.
 */
export default function MockPassage({ passage, attemptId }: { passage: MockPassageData; attemptId: string }) {
  const [hl, setHl] = useState<Highlights>(() => {
    try { return JSON.parse(window.sessionStorage.getItem(storeKey(attemptId, passage.n)) ?? '{}') as Highlights; } catch { return {}; }
  });
  const [pending, setPending] = useState<{ p: number; range: Range; top: number; left: number } | null>(null);
  const boxRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { window.sessionStorage.setItem(storeKey(attemptId, passage.n), JSON.stringify(hl)); } catch { /* ignore */ }
  }, [hl, attemptId, passage.n]);

  const onSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPending(null); return; }
    const r = sel.getRangeAt(0);
    const startEl = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement) as HTMLElement | null;
    const para = startEl?.closest<HTMLElement>('[data-para]');
    if (!para || !para.contains(r.endContainer)) { setPending(null); return; }
    const a = offsetIn(para, r.startContainer, r.startOffset);
    const b = offsetIn(para, r.endContainer, r.endOffset);
    if (b - a < 1) { setPending(null); return; }
    const rect = r.getBoundingClientRect();
    const box = boxRef.current?.getBoundingClientRect();
    setPending({ p: Number(para.dataset['para']), range: [a, b], top: rect.top - (box?.top ?? 0) + (boxRef.current?.scrollTop ?? 0) - 44, left: Math.max(8, rect.left - (box?.left ?? 0)) });
  };

  const apply = () => {
    if (!pending) return;
    setHl((prev) => ({ ...prev, [pending.p]: merge([...(prev[pending.p] ?? []), pending.range]) }));
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  const remove = (p: number, i: number) => setHl((prev) => ({ ...prev, [p]: (prev[p] ?? []).filter((_, j) => j !== i) }));

  const render = (text: string, p: number) => {
    const ranges = hl[p] ?? [];
    if (!ranges.length) return text;
    const out: React.ReactNode[] = [];
    let at = 0;
    ranges.forEach(([a, b], i) => {
      if (a > at) out.push(text.slice(at, a));
      out.push(<mark key={i} className="mk-hl" title="Tap to remove the highlight" onClick={() => remove(p, i)}>{text.slice(a, b)}</mark>);
      at = b;
    });
    if (at < text.length) out.push(text.slice(at));
    return out;
  };

  return (
    <section className="mk-passage" ref={boxRef} aria-label={`Reading Passage ${passage.n}`} onMouseUp={onSelect} onTouchEnd={() => window.setTimeout(onSelect, 30)}>
      <h2 className="mk-passage-title">{passage.title}</h2>
      {passage.paragraphs.map((text, p) => (
        <p key={p} className="mk-para">
          {passage.labelled && <b className="mk-para-letter">{String.fromCharCode(65 + p)}</b>}
          <span data-para={p}>{render(text, p)}</span>
        </p>
      ))}
      {pending && (
        <button type="button" className="mk-hl-btn" style={{ top: pending.top, left: pending.left }}
          onMouseDown={(e) => e.preventDefault()} onClick={apply}>Highlight</button>
      )}
    </section>
  );
}
