import React, { useState } from 'react';
import { IeltsWritingEditor } from '../../components/ielts/IeltsWritingEditor';
import { IELTS_WRITING_CRITERIA } from '../../../services/ieltsWritingScreener';
import { WRITING_SCREENER_A_DRAFT as draft } from '../../../services/ieltsWritingScreenerDraft';
const IeltsWritingDraftPreview: React.FC = () => {
  const [text, setText] = useState('');
  return <main className="bh-ielts-page min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-2xl border border-blue-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-widest text-blue-800">Brains Heist · Content review</p><h1 className="mt-3 text-3xl font-bold">{draft.title}</h1><p className="mt-3 leading-7 text-slate-700">Draft {draft.contentVersion} / {draft.packageId} · 40 minutes · Minimum 250 words</p><p className="mt-4 rounded-xl bg-amber-50 p-4 leading-6 text-amber-900">Awaiting human content review. This preview does not start an assessment or save an essay. Student access remains closed.</p></header>
    <IeltsWritingEditor prompt={draft.prompt} value={text} onChange={setText} id="writing-preview" />
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Review the task and feedback criteria</h2><p className="mt-3 leading-7 text-slate-700">Check clarity, fairness, originality, task demand, timing and the proposed skill mappings. There is no single correct opinion or required essay structure.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{IELTS_WRITING_CRITERIA.map(criterion => <article key={criterion.key} className="rounded-xl border border-slate-200 p-5"><h3 className="font-bold">{criterion.label}</h3><p className="mt-3 text-sm leading-7">{criterion.focus}</p></article>)}</div><p className="mt-5 text-sm leading-7 text-slate-600">The teacher reviews the original essay and anchors observations to its exact words. Missing evidence stays separate from a development observation. Results remain task-specific with low confidence and no IELTS band. Device acceptance is recorded separately after the controlled pilot.</p><a href="/ielts" className="mt-5 inline-flex min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Back to IELTS</a></section>
  </div></main>;
};
export default IeltsWritingDraftPreview;
