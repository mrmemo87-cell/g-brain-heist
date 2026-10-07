import React from 'react';
import { countWritingWords } from '../../../services/ieltsWritingScreener';
export const IeltsWritingEditor: React.FC<{
  prompt: string; value: string; onChange: (value: string) => void; disabled?: boolean; id?: string;
}> = ({ prompt, value, onChange, disabled = false, id = 'writing-essay' }) => {
  const words = countWritingWords(value);
  return <div className="grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
    <article aria-labelledby={`${id}-task`} className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 sm:p-7 lg:sticky lg:top-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-800">Academic Writing · Task 2</p>
      <h3 id={`${id}-task`} className="text-xl font-bold text-slate-950">Your task</h3>
      <p className="mt-4 whitespace-pre-line text-base leading-8 text-slate-900">{prompt}</p>
      <p className="mt-5 border-t border-blue-200 pt-4 text-sm leading-6 text-slate-700">Write at least 250 words in connected paragraphs. Support your ideas with relevant reasons and examples. No specialist knowledge is needed.</p>
    </article>
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-lg font-semibold text-slate-950">Your essay</label>
        <p id={`${id}-count`} className="text-sm text-slate-600">{words} {words === 1 ? 'word' : 'words'} <span className="text-slate-500">· Minimum 250</span></p>
      </div>
      <textarea id={id} value={value} disabled={disabled} spellCheck={false} autoCorrect="off" autoCapitalize="off"
        aria-describedby={`${id}-count ${id}-help`} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => onChange(event.target.value)}
        className="min-h-[26rem] w-full resize-y rounded-xl border border-slate-300 bg-white p-4 text-base leading-8 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        placeholder="Begin your essay here…" />
      <p id={`${id}-help`} className="mt-3 text-sm leading-6 text-slate-600">Write independently. Allow time to read through your essay before submitting.</p>
    </div>
  </div>;
};
