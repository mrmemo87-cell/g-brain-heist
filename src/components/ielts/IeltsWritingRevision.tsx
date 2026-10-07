import React, { useRef, useState } from 'react';
import { countWritingWords, type WritingScreenerResult } from '../../../services/ieltsWritingScreener';
import { saveWritingScreenerRevision } from '../../../services/ieltsWritingScreenerService';
export const IeltsWritingRevision: React.FC<{ result: WritingScreenerResult }> = ({ result }) => {
  const [text, setText] = useState(result.practice_revision?.response_text ?? result.response_text);
  const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const revisionId = useRef<string | null>(null); const locked = useRef(false);
  const save = async () => {
    if (locked.current || !result.review_id || !text.trim()) return;
    locked.current = true; setSaving(true); setMessage('');
    try {
      revisionId.current ??= crypto.randomUUID();
      await saveWritingScreenerRevision({ attemptId: result.attempt_id, revisionId: revisionId.current, sourceReviewId: result.review_id, text });
      setMessage('Practice revision saved separately. Your original essay is unchanged.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The revision could not save. Keep this page open and try again.'); }
    finally { locked.current = false; setSaving(false); }
  };
  return <details className="rounded-2xl border border-teal-200 bg-white p-5"><summary className="min-h-11 cursor-pointer font-semibold">Practise a revision</summary>
    <p className="mt-3 text-sm leading-7 text-slate-700">Use your teacher’s next step to revise this essay. This is coached practice with the same prompt; it does not measure improvement or replace your original submission.</p>
    <label htmlFor="writing-practice-revision" className="mt-4 block font-semibold">Your practice revision · {countWritingWords(text)} words</label>
    <textarea id="writing-practice-revision" value={text} disabled={saving} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => { setText(event.target.value); revisionId.current = null; setMessage(''); }} className="mt-3 min-h-80 w-full rounded-xl border border-slate-300 p-4 text-base leading-8" />
    <p className="mt-3 text-sm text-slate-600">Save your practice revision before leaving this page.</p>
    <button type="button" disabled={saving || !text.trim()} onClick={() => void save()} className="mt-4 min-h-11 rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:bg-slate-400">{saving ? 'Saving…' : 'Save practice revision'}</button>
    {message && <p role="status" className="mt-3 text-sm leading-7">{message}</p>}
  </details>;
};
