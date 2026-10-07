import { IeltsWritingRevision } from './IeltsWritingRevision';
import React from 'react';
import { IELTS_WRITING_CRITERIA, type WritingScreenerResult } from '../../../services/ieltsWritingScreener';
const labels = { observed: 'Demonstrated in this essay', developing: 'Develop in practice', insufficient_evidence: 'More evidence needed' };
export const IeltsWritingResult: React.FC<{ result: WritingScreenerResult; onRefresh?: () => void }> = ({ result, onRefresh }) => <section aria-labelledby="writing-result-heading" className="mx-auto my-8 max-w-4xl space-y-5 p-4 text-slate-900 sm:p-6">
  <div className="rounded-2xl border border-blue-200 bg-white p-6 sm:p-8">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5zM8 9l2 2 5-5M8 15h8" /></svg></div>
    <p className="text-xs font-bold uppercase tracking-widest text-blue-800">Writing starting point</p>
    <h2 id="writing-result-heading" className="mt-3 text-2xl font-bold text-slate-950">{result.review_status === 'pending' ? 'Your essay is saved.' : 'Your teacher’s feedback is ready.'}</h2>
    <p className="mt-3 leading-7 text-slate-700">{result.review_status === 'pending' ? 'Awaiting teacher review. Your original essay is locked and available below. Check back here for feedback.' : 'Use these observations to choose your next practice step. They refer to this essay only.'}</p>
    <p className="mt-4 text-sm text-slate-600">{result.word_count} words · One Task 2 essay · Confidence: low</p>
    <p className="mt-2 text-sm leading-6 text-slate-600">This is a Writing development snapshot. It does not give a full Writing or overall IELTS band.</p>
    {result.response_state !== 'answered' && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No usable essay was received. Missing evidence is not a judgement of your ability. Ask your teacher about a fresh assessment.</p>}
    {result.evidence_kind === 'same_prompt_practice' && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">Same-prompt practice. This repeat does not measure improvement.</p>}
    {result.incident_count > 0 && <p className="mt-4 text-sm text-amber-900">An interruption was recorded. Your teacher should consider the assessment conditions when reviewing your essay.</p>}
    {result.delivery_comment && <p className="mt-3 text-sm text-slate-700">Teacher’s note on assessment conditions: {result.delivery_comment}</p>}
    <div className="mt-5 flex flex-wrap gap-4"><a href="/ielts" className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Back to IELTS</a>{onRefresh && <button type="button" onClick={onRefresh} className="min-h-11 font-semibold text-blue-800 underline">Check for feedback</button>}</div>
  </div>
  <div className="grid gap-4 sm:grid-cols-2">{IELTS_WRITING_CRITERIA.map(({ key, label, focus }) => {
    const observation = result.criterion_observations[key];
    return <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-bold">{label}</h3>
      <p className="mt-2 text-sm font-semibold text-blue-800">{observation ? labels[observation.status] : 'Awaiting review'}</p>
      <p className="mt-3 text-sm leading-7 text-slate-700">{observation?.comment ?? focus}</p>
      {observation?.evidence.map((span, index) => <blockquote key={`${span.start_char}-${index}`} className="mt-4 whitespace-pre-wrap border-l-2 border-blue-300 pl-3 text-sm leading-6 text-slate-700">“{span.quote}”</blockquote>)}
    </article>;
  })}</div>
  {result.next_step && <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><h3 className="text-lg font-bold">Your next practice step</h3><p className="mt-3 whitespace-pre-line leading-7">{result.next_step}</p></div>}
  {result.review_status === 'teacher_reviewed' && !result.can_review && <IeltsWritingRevision key={result.attempt_id} result={result} />}
  <details className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="min-h-11 cursor-pointer font-semibold">View your original task and submitted essay</summary><p className="mt-4 whitespace-pre-line leading-7 text-slate-700">{result.prompt}</p><div className="mt-5 whitespace-pre-wrap border-t border-slate-200 pt-5 text-base leading-8">{result.response_text || 'No essay text was received.'}</div></details>
</section>;
