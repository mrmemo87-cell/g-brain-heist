import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
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
];
const shortOf = Object.fromEntries(WRITING_CRITERIA_LEGEND.map(c => [c.key, c.short]));
const labelOf = Object.fromEntries(WRITING_CRITERIA_LEGEND.map(c => [c.key, c.label]));
/** Splits the essay into plain and highlighted runs. Overlapping or out-of-range highlights are skipped. */
export function segmentEssay(essay, highlights) {
    const chars = Array.from(essay);
    const owner = new Array(chars.length).fill(-1);
    const placed = [];
    highlights.forEach((hl, i) => {
        const { start_char: s, end_char: e } = hl;
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s || e > chars.length)
            return;
        if (chars.slice(s, e).join('') !== hl.quote)
            return;
        if (owner.slice(s, e).some(v => v !== -1))
            return;
        for (let k = s; k < e; k++)
            owner[k] = i;
        placed.push(i);
    });
    const segments = [];
    chars.forEach((ch, k) => {
        const last = segments[segments.length - 1];
        if (last && last.h === owner[k])
            last.text += ch;
        else
            segments.push({ text: ch, h: owner[k] });
    });
    return { segments, placed };
}
export default function WritingEssayHighlights({ essay, highlights: raw, taskNumber = 2, audience = 'student', title }) {
    const [active, setActive] = useState(null);
    const [filter, setFilter] = useState('all');
    const annotated = raw !== undefined;
    const highlights = useMemo(() => raw ?? [], [raw]);
    const { segments, placed } = useMemo(() => segmentEssay(essay, highlights), [essay, highlights]);
    const order = useMemo(() => placed.slice().sort((a, b) => highlights[a].start_char - highlights[b].start_char), [placed, highlights]);
    const number = useMemo(() => new Map(order.map((i, n) => [i, n + 1])), [order]);
    const legend = WRITING_CRITERIA_LEGEND.filter(c => c.key !== (taskNumber === 1 ? 'task_response' : 'task_achievement'));
    const counts = legend.map(c => ({ ...c, n: placed.filter(i => highlights[i].criterion === c.key).length }));
    const fixes = placed.filter(i => highlights[i].kind === 'fix').length;
    const shown = (i) => filter === 'all' || highlights[i].kind === filter;
    const activeNote = active !== null ? highlights[active] : null;
    return (_jsxs("section", { className: "st-panel we-panel", "aria-label": title ?? 'Essay with feedback highlights', children: [title ? _jsx("h3", { className: "st-title", children: title }) : null, annotated ? (_jsxs(_Fragment, { children: [_jsx("ul", { className: "st-legend", "aria-label": "Colour key", children: counts.map(c => (_jsxs("li", { className: `st-key st-c-${c.key}`, children: [_jsx("span", { className: "st-swatch", "aria-hidden": "true", children: c.short }), c.label, _jsx("span", { className: "st-count", children: c.n })] }, c.key))) }), placed.length ? (_jsx("div", { className: "we-filter", role: "group", "aria-label": "Show highlights", children: [['all', `All (${placed.length})`], ['fix', `To improve (${fixes})`], ['strength', `Done well (${placed.length - fixes})`]].map(([key, text]) => (_jsx("button", { type: "button", "aria-pressed": filter === key, onClick: () => { setFilter(key); setActive(null); }, children: text }, key))) })) : null] })) : (_jsx("p", { className: "st-legacy", children: "This feedback was made before colour highlights were added, so the essay is shown without them." })), _jsx("p", { className: "st-text we-text", children: essay.trim() ? segments.map((seg, k) => seg.h >= 0 && shown(seg.h) ? (_jsxs("mark", { className: `st-hl st-c-${highlights[seg.h].criterion} st-${highlights[seg.h].kind}${active === seg.h ? ' is-active' : ''}`, tabIndex: 0, role: "button", "aria-pressed": active === seg.h, "aria-label": `${labelOf[highlights[seg.h].criterion]}, ${highlights[seg.h].kind === 'fix' ? 'to improve' : 'done well'}: ${seg.text}`, onClick: () => setActive(active === seg.h ? null : seg.h), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActive(active === seg.h ? null : seg.h);
                    } }, children: [seg.text, _jsxs("sup", { className: "st-tag", "aria-hidden": "true", children: [shortOf[highlights[seg.h].criterion], number.get(seg.h)] })] }, k)) : _jsx("span", { children: seg.text }, k)) : _jsx("span", { className: "st-empty", children: "No writing was received." }) }), activeNote ? (_jsxs("div", { className: `st-callout st-c-${activeNote.criterion}`, role: "status", children: [_jsxs("strong", { children: [activeNote.kind === 'fix' ? 'To improve' : 'Done well', " \u00B7 ", labelOf[activeNote.criterion]] }), activeNote.correction ? (_jsxs("span", { className: "we-fix", children: [_jsx("s", { children: activeNote.quote }), " ", _jsx("span", { "aria-hidden": "true", children: "\u2192" }), _jsx("span", { className: "st-sr", children: " write instead " }), " ", _jsx("b", { children: activeNote.correction })] })) : null, _jsx("span", { children: activeNote.note })] })) : placed.length ? _jsxs("p", { className: "st-hint", children: ["Tap a highlighted phrase to see the note", fixes ? ' and the correction' : '', "."] }) : null, placed.length ? (_jsx("ol", { className: "st-notes", "aria-label": "Highlight notes", children: order.filter(shown).map(i => {
                    const hl = highlights[i];
                    return (_jsxs("li", { className: `st-note st-c-${hl.criterion}`, children: [_jsxs("span", { className: "st-note-tag", children: [shortOf[hl.criterion], number.get(i)] }), _jsx("span", { className: `st-kind st-kind--${hl.kind}`, children: hl.kind === 'fix' ? '✎ To improve' : '✓ Done well' }), audience === 'teacher' ? _jsx("span", { className: "st-note-crit", children: labelOf[hl.criterion] }) : null, hl.correction ? (_jsxs("span", { className: "we-fix", children: [_jsx("s", { children: hl.quote }), " ", _jsx("span", { "aria-hidden": "true", children: "\u2192" }), _jsx("span", { className: "st-sr", children: " write instead " }), " ", _jsx("b", { children: hl.correction })] })) : _jsx("q", { children: hl.quote }), _jsx("span", { className: "st-note-text", children: hl.note })] }, i));
                }) })) : annotated ? _jsx("p", { className: "st-muted", children: "No highlights were found for this essay." }) : null, annotated && placed.length ? _jsxs("p", { className: "st-fine", children: ["Highlights and corrections are AI practice feedback", audience === 'teacher' ? '. Check them before you confirm.' : '.'] }) : null] }));
}
