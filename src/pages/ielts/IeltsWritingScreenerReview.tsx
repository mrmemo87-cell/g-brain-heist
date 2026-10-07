import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchWritingScreenerReviewQueue, fetchWritingScreenerResult, submitWritingScreenerReview, type WritingScreenerQueueEntry } from '../../../services/ieltsWritingScreenerService';
import { IELTS_WRITING_CRITERIA, type WritingScreenerResult, type WritingEvidenceSpan, type WritingObservations, type WritingCriterion, type WritingObservationStatus } from '../../../services/ieltsWritingScreener';
import { IeltsWritingResult } from '../../components/ielts/IeltsWritingResult';
const emptyObservations = (): WritingObservations => Object.fromEntries(IELTS_WRITING_CRITERIA.map(({ key }) => [key, { status: 'insufficient_evidence', comment: '', evidence: [] }])) as WritingObservations;
const IeltsWritingScreenerReview: React.FC = () => {
  const { attemptId } = useParams<{ attemptId?: string }>();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<WritingScreenerQueueEntry[]>([]);
  const [result, setResult] = useState<WritingScreenerResult | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [observations, setObservations] = useState<WritingObservations>(emptyObservations);
  const [nextStep, setNextStep] = useState(''); const [delivery, setDelivery] = useState('');
  const [selected, setSelected] = useState<WritingEvidenceSpan | null>(null);
  const [saving, setSaving] = useState(false); const reviewId = useRef<string | null>(null);
  const saveLock = useRef(false); const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setSaved(false); setSelected(null);
    const load = async () => {
      try {
        if (attemptId) {
          const value = await fetchWritingScreenerResult(attemptId);
          if (!active) return;
          setResult(value); setObservations(value?.review_status === 'teacher_reviewed' ? value.criterion_observations as WritingObservations : emptyObservations());
          setNextStep(value?.next_step ?? ''); setDelivery(value?.delivery_comment ?? ''); reviewId.current = null;
        } else { const value = await fetchWritingScreenerReviewQueue(); if (active) setQueue(value); }
      } catch { if (active) setError('We could not open these essays. Check your access and connection, then try again.'); }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [attemptId, retry]);
  const edit = (key: WritingCriterion, patch: Partial<WritingObservations[WritingCriterion]>) => {
    setObservations(previous => ({ ...previous, [key]: { ...previous[key], ...patch } }));
    reviewId.current = null; setSaved(false);
  };
  const save = async () => {
    if (!result?.can_review || saveLock.current) return;
    saveLock.current = true; setSaving(true); setError('');
    try {
      if (nextStep.trim().length < 10 || IELTS_WRITING_CRITERIA.some(({ key }) => observations[key].comment.trim().length < 20 || (observations[key].status !== 'insufficient_evidence' && !observations[key].evidence.length))) {
        setError('Add a clear observation for each criterion, an exact excerpt for each demonstrated or development observation, and a next practice step.'); return;
      }
      reviewId.current ??= crypto.randomUUID();
      const value = await submitWritingScreenerReview({ attemptId: result.attempt_id, reviewId: reviewId.current,
        expectedReviewId: result.review_id, responseHash: result.response_sha256, observations, nextStep, deliveryComment: delivery });
      setResult(value); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not save. Please try again.'); }
    finally { setSaving(false); saveLock.current = false; }
  };
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-widest text-blue-800">Brains Heist · Teacher review</p><h1 className="mt-3 text-2xl font-bold">Writing screener essays</h1><p className="mt-3 leading-7 text-slate-700">Review one Task 2 essay using four criteria. Give evidence and a practical next step. Confidence remains low; no full Writing band is produced.</p><a href="/ielts" className="mt-3 inline-block min-h-11 font-semibold text-blue-800 underline">Back to IELTS</a></header>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="mt-3 min-h-11 font-semibold underline">Reload</button></div>}
    {loading ? <p role="status">Loading essays…</p> : !attemptId ? <section className="space-y-3">
      {!queue.length && <p className="rounded-xl border border-slate-200 bg-white p-5">No submitted Writing screener essays are available to you yet.</p>}
      {queue.map(row => <article key={row.attempt_id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5"><div><h2 className="font-bold">{row.student_name ?? 'Student essay'}</h2><p className="mt-2 text-sm text-slate-600">{row.word_count} words · {row.review_status === 'pending' ? 'Awaiting review' : 'Teacher reviewed'} · {new Date(row.submitted_at).toLocaleDateString()}</p>{row.evidence_kind === 'same_prompt_practice' && <p className="mt-2 text-sm">Same-prompt practice</p>}</div><button type="button" onClick={() => navigate(`/ielts/writing-screener/reviews/${row.attempt_id}`)} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Open essay</button></article>)}
    </section> : !result ? <p>No submitted essay is available.</p> : !result.can_review ? <IeltsWritingResult result={result} /> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Original submission</h2><p className="mt-4 whitespace-pre-line leading-8">{result.prompt}</p><label htmlFor="review-original" className="mt-5 block font-semibold">Select an excerpt to use as evidence</label><textarea id="review-original" readOnly value={result.response_text} className="mt-3 min-h-80 w-full rounded-xl border border-slate-300 p-4 text-base leading-8" onSelect={(event: { currentTarget: HTMLTextAreaElement }) => {
        const field = event.currentTarget; const start = field.selectionStart; const end = field.selectionEnd;
        setSelected(end > start ? { quote: field.value.slice(start, end), start_char: Array.from(field.value.slice(0, start)).length, end_char: Array.from(field.value.slice(0, end)).length } : null);
      }} /><p className="mt-3 text-sm text-slate-600">{result.word_count} words · {result.evidence_kind === 'same_prompt_practice' ? 'Same-prompt practice' : 'First sitting'} · {result.incident_count} recorded interruptions</p></section>
      <fieldset disabled={saving} className="space-y-5"><legend className="sr-only">Teacher observations</legend>{IELTS_WRITING_CRITERIA.map(({ key, label, focus }) => <article key={key} className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">{label}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{focus}</p><label className="mt-4 block text-sm font-semibold">Observation<select value={observations[key].status} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => edit(key, { status: event.target.value as WritingObservationStatus })} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3"><option value="insufficient_evidence">More evidence needed</option><option value="observed">Demonstrated in this essay</option><option value="developing">Develop in practice</option></select></label><label className="mt-4 block text-sm font-semibold">Explain your observation<textarea value={observations[key].comment} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => edit(key, { comment: event.target.value })} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 p-3 text-base leading-7" /></label><button type="button" disabled={!selected} onClick={() => selected && edit(key, { evidence: [selected] })} className="mt-3 min-h-11 font-semibold text-blue-800 underline disabled:text-slate-500">Use selected excerpt</button>{observations[key].evidence.map(span => <blockquote key={span.start_char} className="mt-3 whitespace-pre-wrap border-l-2 border-blue-300 pl-3 text-sm leading-7">“{span.quote}”</blockquote>)}</article>)}
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><label className="block font-semibold">Next practice step<textarea value={nextStep} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => { setNextStep(event.target.value); reviewId.current = null; setSaved(false); }} className="mt-3 min-h-28 w-full rounded-xl border border-slate-300 p-3 text-base leading-7" /></label><label className="mt-5 block font-semibold">Assessment conditions{result.incident_count > 0 ? ' (required: consider the recorded interruptions)' : ' (optional)'}<textarea value={delivery} onChange={(event: { target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }) => { setDelivery(event.target.value); reviewId.current = null; setSaved(false); }} className="mt-3 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-base leading-7" /></label><p className="mt-4 text-sm leading-7 text-slate-600">Saving makes this feedback visible to the student. Later corrections preserve this review in history.</p><button type="button" disabled={saving || saved} onClick={() => void save()} className="mt-4 min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:bg-slate-400">{saving ? 'Saving…' : saved ? 'Feedback saved' : 'Save teacher feedback'}</button>{saved && <p role="status" className="mt-3 text-sm text-teal-800">Feedback saved. The original essay remains unchanged.</p>}</section></fieldset>
    </>}
  </div></main>;
};
export default IeltsWritingScreenerReview;
