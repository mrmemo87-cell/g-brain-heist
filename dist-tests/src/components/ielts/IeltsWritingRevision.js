import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { countWritingWords } from '../../../services/ieltsWritingScreener.js';
import { saveWritingScreenerRevision } from '../../../services/ieltsWritingScreenerService.js';
export const IeltsWritingRevision = ({ result }) => {
    const [text, setText] = useState(result.practice_revision?.response_text ?? result.response_text);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const revisionId = useRef(null);
    const locked = useRef(false);
    const save = async () => {
        if (locked.current || !result.review_id || !text.trim())
            return;
        locked.current = true;
        setSaving(true);
        setMessage('');
        try {
            revisionId.current ??= crypto.randomUUID();
            await saveWritingScreenerRevision({ attemptId: result.attempt_id, revisionId: revisionId.current, sourceReviewId: result.review_id, text });
            setMessage('Practice revision saved separately. Your original essay is unchanged.');
        }
        catch (reason) {
            setMessage(reason instanceof Error ? reason.message : 'The revision could not save. Keep this page open and try again.');
        }
        finally {
            locked.current = false;
            setSaving(false);
        }
    };
    return _jsxs("details", { className: "rounded-2xl border border-teal-200 bg-white p-5", children: [_jsx("summary", { className: "min-h-11 cursor-pointer font-semibold", children: "Practise a revision" }), _jsx("p", { className: "mt-3 text-sm leading-7 text-slate-700", children: "Use your teacher\u2019s next step to revise this essay. This is coached practice with the same prompt; it does not measure improvement or replace your original submission." }), _jsxs("label", { htmlFor: "writing-practice-revision", className: "mt-4 block font-semibold", children: ["Your practice revision \u00B7 ", countWritingWords(text), " words"] }), _jsx("textarea", { id: "writing-practice-revision", value: text, disabled: saving, onChange: (event) => { setText(event.target.value); revisionId.current = null; setMessage(''); }, className: "mt-3 min-h-80 w-full rounded-xl border border-slate-300 p-4 text-base leading-8" }), _jsx("p", { className: "mt-3 text-sm text-slate-600", children: "Save your practice revision before leaving this page." }), _jsx("button", { type: "button", disabled: saving || !text.trim(), onClick: () => void save(), className: "mt-4 min-h-11 rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:bg-slate-400", children: saving ? 'Saving…' : 'Save practice revision' }), message && _jsx("p", { role: "status", className: "mt-3 text-sm leading-7", children: message })] });
};
