import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchWritingScreenerReviewQueue, fetchWritingScreenerResult, submitWritingScreenerReview, type WritingScreenerQueueEntry } from '../../../services/ieltsWritingScreenerService';
import { IELTS_WRITING_CRITERIA, type WritingScreenerResult, type WritingEvidenceSpan, type WritingObservations, type WritingCriterion } from '../../../services/ieltsWritingScreener';
import { IeltsWritingResult } from '../../components/ielts/IeltsWritingResult';
import { IeltsWritingReviewWorkspace } from '../../components/ielts/IeltsWritingReviewWorkspace';
import { getWritingReviewReadiness } from '../../../services/ieltsWritingReviewUx';
import { generateWritingAiReview, mergeWritingAiDraft, type WritingAiDraft } from '../../../services/ieltsWritingAiReview';
import '../../styles/ielts-writing-review.css';
const emptyObservations = (): WritingObservations => Object.fromEntries(IELTS_WRITING_CRITERIA.map(({ key }) => [key, { status: 'insufficient_evidence', comment: '', evidence: [] }])) as WritingObservations;
const IeltsWritingScreenerReview: React.FC = () => {
  const { attemptId } = useParams<{ attemptId?: string }>();
  const navigate = useNavigate();
  const [activeCriterion, setActiveCriterion] = useState<WritingCriterion>('task_response');
  const [queueFilter, setQueueFilter] = useState<'pending' | 'all'>('pending');
  const [queue, setQueue] = useState<WritingScreenerQueueEntry[]>([]);
  const [result, setResult] = useState<WritingScreenerResult | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [observations, setObservations] = useState<WritingObservations>(emptyObservations);
  const [nextStep, setNextStep] = useState(''); const [delivery, setDelivery] = useState('');
  const [selected, setSelected] = useState<WritingEvidenceSpan | null>(null);
  const [saving, setSaving] = useState(false); const reviewId = useRef<string | null>(null);
  const saveLock = useRef(false); const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aiBusy, setAiBusy] = useState(false); const [aiDraftId, setAiDraftId] = useState<string | undefined>();
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [completeAiDraft, setCompleteAiDraft] = useState<WritingAiDraft | null>(null);
  const aiRequest = useRef<AbortController | null>(null);
  const beforeAi = useRef<{ observations: WritingObservations; nextStep: string; delivery: string; dirty: boolean } | null>(null);
  useEffect(() => () => { aiRequest.current?.abort(); aiRequest.current = null; }, []);
  useEffect(() => {
    if (!dirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [dirty]);
  useEffect(() => {
    aiRequest.current?.abort(); aiRequest.current = null; setAiBusy(false); setAiDraftId(undefined); setAiConfirmed(false); setCompleteAiDraft(null); beforeAi.current = null;
    let active = true; setLoading(true); setResult(null); setError(''); setSaved(false); setDirty(false); setSelected(null); setActiveCriterion('task_response');
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
    reviewId.current = null; setSaved(false); setDirty(true); setAiConfirmed(false);
  };
  const draftWithAi = async () => {
    if (!result?.can_review || aiRequest.current || saving || aiDraftId) return;
    const controller = new AbortController(); aiRequest.current = controller; setAiBusy(true); setError('');
    const timeout = window.setTimeout(() => controller.abort(), 70000);
    try {
      const draft = await generateWritingAiReview(result, controller.signal);
      if (aiRequest.current !== controller || controller.signal.aborted) return;
      beforeAi.current = { observations, nextStep, delivery, dirty };
      const merged = mergeWritingAiDraft(observations, nextStep, delivery, draft);
      setObservations(merged.observations); setNextStep(merged.nextStep); setDelivery(merged.delivery);
      setAiDraftId(draft.draft_id); setAiConfirmed(false); setDirty(true); setSaved(false); reviewId.current = null; setSelected(null); setActiveCriterion('task_response');
      setCompleteAiDraft(IELTS_WRITING_CRITERIA.some(({ key }) => observations[key].comment.trim() || observations[key].evidence.length) || nextStep.trim() || delivery.trim() ? draft : null);
    } catch (reason) {
      if (aiRequest.current === controller) setError(reason instanceof Error && !controller.signal.aborted ? reason.message : 'AI help took too long. Your notes are unchanged. Try again, or continue your review.');
    } finally { window.clearTimeout(timeout); if (aiRequest.current === controller) { aiRequest.current = null; setAiBusy(false); } }
  };
  const removeAiDraft = () => {
    if (!beforeAi.current || saving) return;
    const previous = beforeAi.current;
    setObservations(previous.observations); setNextStep(previous.nextStep); setDelivery(previous.delivery); setDirty(previous.dirty);
    setAiDraftId(undefined); setAiConfirmed(false); setCompleteAiDraft(null); setSaved(false); reviewId.current = null; beforeAi.current = null;
  };
  const useCompleteAiDraft = () => {
    if (!completeAiDraft || saving) return;
    setObservations(completeAiDraft.fields.observations); setNextStep(completeAiDraft.fields.next_step); setDelivery(completeAiDraft.fields.delivery_comment);
    setCompleteAiDraft(null); setAiConfirmed(false); setDirty(true); setSaved(false); reviewId.current = null;
  };
  const save = async () => {
    if (!result?.can_review || saveLock.current || aiBusy) return;
    saveLock.current = true; setSaving(true); setError('');
    try {
      if (aiDraftId && !aiConfirmed) { setError('Check the AI draft and confirm it below before sharing.'); return; }
      const readiness = getWritingReviewReadiness(observations, nextStep, delivery, result.incident_count);
      if (readiness.message) {
        if (readiness.incompleteCriterion) setActiveCriterion(readiness.incompleteCriterion);
        setError(readiness.message); return;
      }
      reviewId.current ??= crypto.randomUUID();
      const value = await submitWritingScreenerReview({ attemptId: result.attempt_id, reviewId: reviewId.current,
        expectedReviewId: result.review_id, responseHash: result.response_sha256, observations, nextStep, deliveryComment: delivery, aiDraftId, teacherConfirmed: aiConfirmed });
      setResult(value); setSaved(true); setDirty(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not save. Please try again.'); }
    finally { setSaving(false); saveLock.current = false; }
  };
  const pendingCount = queue.filter(row => row.review_status === 'pending').length;
  const visibleQueue = queueFilter === 'pending' ? queue.filter(row => row.review_status === 'pending') : queue;
  return <main className="writing-review"><div className="wr-shell">
    <header className="wr-header">
      <a href={attemptId ? '/ielts/writing-screener/reviews' : '/ielts'} className="wr-back">← {attemptId ? 'All essays' : 'Back to IELTS'}</a>
      <div className="wr-header-content"><div><p className="wr-eyebrow">Brains Heist · Writing review</p><h1>{attemptId ? 'Turn an essay into a next step.' : 'A clearer next step for every writer.'}</h1><p className="wr-intro">{attemptId ? 'Read the original. Notice what matters. Share feedback the student can use.' : 'Review an essay, support your observations and give one focused practice step.'}</p></div><div className="wr-header-icon"><svg aria-hidden="true" viewBox="0 0 48 48" fill="none"><path d="M12 10h17l7 7v23H12zM29 10v8h7M18 25h12M18 31h9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="m30 29 8-8 4 4-8 8-6 2z" fill="#dbeafe" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/></svg></div></div>
      {attemptId && result && <div className="wr-header-footer"><span className="wr-pill">{dirty ? 'Changes not shared' : result.review_status === 'pending' ? 'Awaiting your feedback' : 'Feedback shared'}</span><span>Submitted {new Date(result.submitted_at).toLocaleDateString()}</span><span>One Task 2 essay · Confidence: low</span></div>}
    </header>
    {error && <div role="alert" className="wr-alert"><strong>{error}</strong>{!result && <button type="button" onClick={() => setRetry(n => n + 1)} className="wr-secondary">Try again</button>}</div>}
    {loading ? <div className="wr-card wr-empty" role="status"><p>Opening your Writing workspace…</p></div> : !attemptId ? <section aria-labelledby="queue-heading">
      <div className="wr-queue-toolbar"><h2 id="queue-heading">Your review desk</h2><div className="wr-filters"><button type="button" aria-pressed={queueFilter === 'pending'} onClick={() => setQueueFilter('pending')}>Awaiting review · {pendingCount}</button><button type="button" aria-pressed={queueFilter === 'all'} onClick={() => setQueueFilter('all')}>All essays</button></div></div>
      {!visibleQueue.length && <div className="wr-card wr-empty"><h3>{queueFilter === 'pending' && queue.length ? 'You’re up to date.' : 'No essays here yet.'}</h3><p>{queueFilter === 'pending' && queue.length ? 'Open All essays to revisit feedback you have shared.' : 'Submitted Writing essays will appear here when they are available for you to review.'}</p></div>}
      <div className="wr-queue-list">{visibleQueue.map(row => <article key={row.attempt_id} className="wr-card wr-queue-row"><div className="wr-avatar" aria-hidden="true">{(row.student_name ?? 'Student').slice(0, 1).toUpperCase()}</div><div className="wr-queue-copy"><h3>{row.student_name ?? 'Student essay'}</h3><p>{row.word_count} words · {new Date(row.submitted_at).toLocaleDateString()}</p><span className="wr-pill">{row.review_status === 'pending' ? 'Awaiting review' : 'Feedback shared'}</span>{row.evidence_kind === 'same_prompt_practice' && <span className="wr-practice">Same-prompt practice</span>}</div><button type="button" onClick={() => navigate(`/ielts/writing-screener/reviews/${row.attempt_id}`)} className="wr-primary">{row.review_status === 'pending' ? 'Review essay →' : 'Open feedback →'}</button></article>)}</div>
    </section> : !result ? <div className="wr-card wr-empty"><h2>No essay available</h2><p>This submission could not be opened. Return to the review desk to choose an available essay.</p></div> : !result.can_review ? <IeltsWritingResult result={result} /> : <IeltsWritingReviewWorkspace
      result={result} observations={observations} activeCriterion={activeCriterion} onCriterion={setActiveCriterion}
      selected={selected} onSelect={setSelected} onEdit={edit} nextStep={nextStep}
      onNextStep={(value: string) => { setNextStep(value); reviewId.current = null; setSaved(false); setDirty(true); setAiConfirmed(false); }}
      delivery={delivery} onDelivery={(value: string) => { setDelivery(value); reviewId.current = null; setSaved(false); setDirty(true); setAiConfirmed(false); }}
      saving={saving} saved={saved} onSave={() => void save()}
      aiBusy={aiBusy} aiApplied={!!aiDraftId} aiConfirmed={aiConfirmed} onAi={() => void draftWithAi()} onAiConfirm={setAiConfirmed} onAiRemove={removeAiDraft}
      onAiReplace={completeAiDraft ? useCompleteAiDraft : undefined}
    />}
  </div></main>;
};
export default IeltsWritingScreenerReview;
