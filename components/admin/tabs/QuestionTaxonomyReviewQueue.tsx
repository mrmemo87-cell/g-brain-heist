import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  decideSuperadminQuestionTaxonomyReview,
  loadSuperadminQuestionTaxonomyReviewQueue,
  type AdminAssessmentProcessCode,
  type AdminTaxonomyDecision,
  type AdminTaxonomyReplacement,
  type AdminTaxonomyReviewCatalog,
  type AdminTaxonomyReviewCursor,
  type AdminTaxonomyReviewItem,
  type AdminTaxonomyReviewStatus,
} from '../../../services/adminQuestionBankService';
import { useAdmin } from '../AdminContext';
import './QuestionTaxonomyReviewQueue.css';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: AdminTaxonomyReviewStatus; label: string }> = [
  { value: 'in_review', label: 'Awaiting decision' },
  { value: 'returned', label: 'Returned for correction' },
  { value: 'approved', label: 'Approved' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All review records' },
];

const ACTION_DETAILS: Record<AdminTaxonomyDecision, { label: string; description: string; tone: string }> = {
  approve: {
    label: 'Approve exact taxonomy',
    description: 'Accept the proposed objective, skill, subskill and assessment process as trusted evidence.',
    tone: 'approve',
  },
  return: {
    label: 'Return for correction',
    description: 'Keep the item outside academic evidence and record what must be corrected before a final decision.',
    tone: 'return',
  },
  retire: {
    label: 'Retire classification',
    description: 'Close this proposal without allowing it to contribute to student learning intelligence.',
    tone: 'retire',
  },
  supersede: {
    label: 'Supersede with corrections',
    description: 'Create a corrected, immutable approved revision while preserving the original proposal for audit.',
    tone: 'supersede',
  },
};

const COGNITION_BY_AO: Record<AdminAssessmentProcessCode, AdminTaxonomyReplacement['cognitiveProcess'][]> = {
  AO1: ['remember', 'understand'],
  AO2: ['apply'],
  AO3: ['analyze'],
  AO4: ['evaluate'],
};

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : 'Not recorded';

const formatLabel = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const optionText = (option: string | { text?: string }) => typeof option === 'string'
  ? option
  : option.text || 'Image option';

const makeReplacement = (item: AdminTaxonomyReviewItem): AdminTaxonomyReplacement => ({
  curriculumMappingId: item.objectiveOptions.some(
    (option) => option.curriculumMappingId === item.proposal.curriculumMappingId,
  )
    ? item.proposal.curriculumMappingId
    : item.objectiveOptions[0]?.curriculumMappingId || '',
  primarySkillCode: item.proposal.primarySkillCode,
  primarySkillName: item.proposal.primarySkillName,
  atomicSubskillCode: item.proposal.atomicSubskillCode,
  atomicSubskillName: item.proposal.atomicSubskillName,
  assessmentProcessCode: item.proposal.assessmentProcessCode,
  cognitiveProcess: item.proposal.cognitiveProcess,
  evidenceStatement: item.proposal.evidenceStatement,
  secondarySkillCodes: item.proposal.secondarySkillCodes,
  confidenceScore: Math.max(0.9, Number(item.proposal.confidenceScore || 0)),
});

interface DecisionDraft {
  item: AdminTaxonomyReviewItem;
  decision: AdminTaxonomyDecision;
  rationale: string;
  replacement: AdminTaxonomyReplacement;
}

interface QuestionTaxonomyReviewQueueProps {
  onOpenVault: () => void;
}

const QuestionTaxonomyReviewQueue: React.FC<QuestionTaxonomyReviewQueueProps> = ({ onOpenVault }) => {
  const { addToast } = useAdmin();
  const [catalog, setCatalog] = useState<AdminTaxonomyReviewCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminTaxonomyReviewStatus>('in_review');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [assessmentProcess, setAssessmentProcess] = useState<AdminAssessmentProcessCode | ''>('');
  const [confidenceBand, setConfidenceBand] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [cursor, setCursor] = useState<AdminTaxonomyReviewCursor | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<AdminTaxonomyReviewCursor | null>>([]);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const loadRequestRef = useRef(0);
  const savingDecisionRef = useRef(false);
  const decisionOpen = decisionDraft !== null;
  savingDecisionRef.current = savingDecision;

  const resetPagination = useCallback(() => {
    setCursor(null);
    setCursorHistory([]);
  }, []);

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await loadSuperadminQuestionTaxonomyReviewQueue({
        status,
        search,
        subject,
        assessmentProcessCode: assessmentProcess,
        confidenceBand,
        limit: PAGE_SIZE,
        cursor,
      });
      if (loadRequestRef.current === requestId) setCatalog(result);
    } catch (loadError) {
      if (loadRequestRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : 'The taxonomy review queue could not be loaded.');
      }
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [assessmentProcess, confidenceBand, cursor, search, status, subject]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!decisionOpen) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingDecisionRef.current) setDecisionDraft(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    modalCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [decisionOpen]);

  const pageNumber = cursorHistory.length + 1;
  const summary = catalog?.summary;
  const metricCards = [
    { label: 'Awaiting review', value: summary?.inReview, tone: 'pending' },
    { label: 'Approved', value: summary?.approved, tone: 'approved' },
    { label: 'Returned', value: summary?.returned, tone: 'returned' },
    { label: 'Mapping drift', value: summary?.mappingDrift, tone: 'drift' },
    { label: 'Source blocked', value: summary?.sourceBlocked, tone: 'blocked' },
  ];

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    resetPagination();
  };

  const clearFilters = () => {
    setStatus('in_review');
    setSearchInput('');
    setSearch('');
    setSubject('');
    setAssessmentProcess('');
    setConfidenceBand('all');
    resetPagination();
  };

  const openDecision = (item: AdminTaxonomyReviewItem, decision: AdminTaxonomyDecision) => {
    setDecisionDraft({ item, decision, rationale: '', replacement: makeReplacement(item) });
  };

  const updateReplacement = <K extends keyof AdminTaxonomyReplacement>(
    key: K,
    value: AdminTaxonomyReplacement[K],
  ) => {
    setDecisionDraft((current) => current ? {
      ...current,
      replacement: { ...current.replacement, [key]: value },
    } : current);
  };

  const updateAssessmentProcess = (value: AdminAssessmentProcessCode) => {
    const cognitions = COGNITION_BY_AO[value];
    setDecisionDraft((current) => current ? {
      ...current,
      replacement: {
        ...current.replacement,
        assessmentProcessCode: value,
        cognitiveProcess: cognitions.includes(current.replacement.cognitiveProcess)
          ? current.replacement.cognitiveProcess
          : cognitions[0],
      },
    } : current);
  };

  const submitDecision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!decisionDraft || savingDecision) return;
    if (decisionDraft.rationale.trim().length < 20) {
      addToast('Add a clear rationale of at least 20 characters.', 'error');
      return;
    }
    setSavingDecision(true);
    try {
      await decideSuperadminQuestionTaxonomyReview({
        reviewItemId: decisionDraft.item.id,
        decision: decisionDraft.decision,
        rationale: decisionDraft.rationale,
        replacement: decisionDraft.decision === 'supersede' ? decisionDraft.replacement : null,
      });
      addToast(`${ACTION_DETAILS[decisionDraft.decision].label} recorded in the immutable audit trail.`, 'success');
      setDecisionDraft(null);
      await load();
    } catch (decisionError) {
      addToast(decisionError instanceof Error ? decisionError.message : 'The decision could not be saved.', 'error');
    } finally {
      setSavingDecision(false);
    }
  };

  const goNext = () => {
    if (!catalog?.nextCursor) return;
    setCursorHistory((history) => [...history, cursor]);
    setCursor(catalog.nextCursor || null);
  };

  const goPrevious = () => {
    setCursorHistory((history) => {
      if (!history.length) return history;
      const previous = history[history.length - 1] || null;
      setCursor(previous);
      return history.slice(0, -1);
    });
  };

  return (
    <div className="taxonomy-review">
      <header className="taxonomy-review__hero">
        <div>
          <span>Human academic governance</span>
          <h2>Taxonomy Review Queue</h2>
          <p>Validate what each question truly measures before its results can shape a student&apos;s Academic Profile.</p>
        </div>
        <div className="taxonomy-review__hero-actions">
          <div><strong>Append-only authority</strong><small>Every proposal and decision remains auditable</small></div>
          <button type="button" onClick={onOpenVault}>← Content vault</button>
        </div>
      </header>

      <section className="taxonomy-review__metrics" aria-label="Taxonomy review summary">
        {metricCards.map((metric) => (
          <article key={metric.label} className={`is-${metric.tone}`}>
            <span>{metric.label}</span>
            <strong>{metric.value ?? '—'}</strong>
          </article>
        ))}
      </section>

      <section className="taxonomy-review__workspace">
        <div className="taxonomy-review__workspace-head">
          <div>
            <span>Decision workspace</span>
            <h3>{STATUS_OPTIONS.find((option) => option.value === status)?.label}</h3>
            <p>{catalog?.total ?? 0} matching proposal{catalog?.total === 1 ? '' : 's'} · original AI confidence is always preserved</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh queue'}</button>
        </div>

        <form className="taxonomy-review__filters" onSubmit={submitSearch}>
          <label className="taxonomy-review__search">
            <span>Search question or taxonomy</span>
            <div><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Prompt, answer, objective, skill or question ID" /><button type="submit">Search</button></div>
          </label>
          <label><span>Review state</span><select value={status} onChange={(event) => { setStatus(event.target.value as AdminTaxonomyReviewStatus); resetPagination(); }}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Subject</span><select value={subject} onChange={(event) => { setSubject(event.target.value); resetPagination(); }}><option value="">All subjects</option>{catalog?.filters.subjects.map((option) => <option key={option.name} value={option.name}>{option.name} · {option.count}</option>)}</select></label>
          <label><span>Assessment objective</span><select value={assessmentProcess} onChange={(event) => { setAssessmentProcess(event.target.value as AdminAssessmentProcessCode | ''); resetPagination(); }}><option value="">AO1–AO4</option>{catalog?.filters.assessmentProcesses.map((option) => <option key={option.code} value={option.code}>{option.code} · {option.count}</option>)}</select></label>
          <label><span>Proposal confidence</span><select value={confidenceBand} onChange={(event) => { setConfidenceBand(event.target.value as typeof confidenceBand); resetPagination(); }}><option value="all">All confidence</option><option value="low">Below 90%</option><option value="medium">90–94.9%</option><option value="high">95%+</option></select></label>
          <button type="button" className="taxonomy-review__clear" onClick={clearFilters}>Clear filters</button>
        </form>

        {error ? <div className="taxonomy-review__error" role="alert"><strong>Review queue unavailable</strong><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : null}
        {!error && loading && !catalog ? <div className="taxonomy-review__loading"><span /><span /><span /><p>Loading question evidence and proposed taxonomy…</p></div> : null}
        {!error && catalog && !catalog.items.length ? <div className="taxonomy-review__empty"><span>✓</span><h4>No proposals match this review lens</h4><p>Choose another state or clear the filters.</p><button type="button" onClick={clearFilters}>Reset queue</button></div> : null}

        {!error && catalog?.items.length ? (
          <div className={loading ? 'taxonomy-review__cards is-refreshing' : 'taxonomy-review__cards'}>
            {catalog.items.map((item) => {
              const actionable = item.status === 'in_review' || item.status === 'returned';
              const exactApprovalBlocked = !item.exactApprovalEligible;
              return (
                <article key={item.id} className={`taxonomy-review__card is-${item.status}`}>
                  <header>
                    <div className="taxonomy-review__identity">
                      <span className={`taxonomy-review__status is-${item.status}`}>{formatLabel(item.status)}</span>
                      <strong>{item.question.subject} · {item.question.gradeLevel || item.proposal.scopeCode}</strong>
                      <code>{item.question.externalId || item.question.id}</code>
                    </div>
                    <div className="taxonomy-review__signals">
                      <span className={item.proposal.confidenceScore < 0.9 ? 'is-low' : 'is-high'}>{Math.round(item.proposal.confidenceScore * 100)}% proposal confidence</span>
                      {!item.sourceEligible ? <span className="is-blocked">Source blocked</span> : null}
                      {item.mappingDrift ? <span className="is-drift">Mapping drift</span> : null}
                      {item.hasActiveTaxonomy ? <span className="is-active">Active taxonomy exists</span> : null}
                    </div>
                  </header>

                  <div className="taxonomy-review__comparison">
                    <section className="taxonomy-review__source">
                      <div className="taxonomy-review__section-title"><span>01</span><div><strong>Source question</strong><small>Read the evidence before judging its diagnostic meaning</small></div></div>
                      {item.question.imageUrl ? <figure><img src={item.question.imageUrl} alt={item.question.imageAltText || 'Question visual'} /><figcaption>{item.question.imageAltText || 'No alt text recorded.'}</figcaption></figure> : null}
                      <h4>{item.question.questionText}</h4>
                      {item.question.options?.length ? <ol type="A">{item.question.options.map((option, index) => <li key={`${item.id}-option-${index}`}>{optionText(option)}</li>)}</ol> : null}
                      <div className="taxonomy-review__answer"><span>Correct answer</span><strong>{item.question.correctAnswer}</strong>{item.question.explanation ? <p>{item.question.explanation}</p> : <em>No explanation recorded.</em>}</div>
                    </section>

                    <section className="taxonomy-review__proposal">
                      <div className="taxonomy-review__section-title"><span>02</span><div><strong>Proposed diagnostic taxonomy</strong><small>Human approval is required before this becomes trusted evidence</small></div></div>
                      {item.mappingDrift ? <div className="taxonomy-review__drift-note"><strong>Objective history changed</strong><p>At least one imported governed mapping is no longer current. Compare the approved objective options before deciding.</p></div> : null}
                      <dl>
                        <div className="is-wide"><dt>Curriculum objective</dt><dd><strong>{item.proposal.objectiveCode}</strong><span>{item.proposal.objectiveStatement}</span><code>{item.proposal.frameworkVersionCode} · {item.proposal.scopeCode}</code></dd></div>
                        <div><dt>Primary skill</dt><dd><strong>{item.proposal.primarySkillName}</strong><code>{item.proposal.primarySkillCode}</code></dd></div>
                        <div><dt>Atomic subskill</dt><dd><strong>{item.proposal.atomicSubskillName}</strong><code>{item.proposal.atomicSubskillCode}</code></dd></div>
                        <div><dt>Assessment objective</dt><dd><strong>{item.proposal.assessmentProcessCode} · {item.proposal.assessmentProcessName}</strong><span>{item.proposal.assessmentProcessDefinition}</span></dd></div>
                        <div><dt>Cognitive process</dt><dd><strong>{formatLabel(item.proposal.cognitiveProcess)}</strong></dd></div>
                        <div className="is-wide"><dt>Evidence statement</dt><dd><span>{item.proposal.evidenceStatement}</span></dd></div>
                        <div className="is-wide is-reason"><dt>Why human review was requested</dt><dd><span>{item.proposal.reviewReason}</span></dd></div>
                      </dl>
                    </section>
                  </div>

                  {item.decisionHistory.length ? <details className="taxonomy-review__history"><summary>Decision history · {item.decisionHistory.length}</summary>{item.decisionHistory.map((decision) => <div key={decision.id}><strong>{formatLabel(decision.decision)}</strong><p>{decision.rationale}</p><small>{formatDateTime(decision.decidedAt)} · {decision.decidedByAuthority}</small></div>)}</details> : null}

                  {actionable ? (
                    <footer className="taxonomy-review__actions">
                      <button type="button" className="is-approve" disabled={exactApprovalBlocked} title={exactApprovalBlocked ? 'Exact approval requires an eligible source, the exact current framework mapping, and no existing active taxonomy.' : undefined} onClick={() => openDecision(item, 'approve')}>Approve exact</button>
                      <button type="button" className="is-supersede" disabled={!item.sourceEligible || !item.objectiveOptions.length} onClick={() => openDecision(item, 'supersede')}>Supersede with corrections</button>
                      <button type="button" className="is-return" disabled={item.status === 'returned'} onClick={() => openDecision(item, 'return')}>Return</button>
                      <button type="button" className="is-retire" onClick={() => openDecision(item, 'retire')}>Retire</button>
                    </footer>
                  ) : <footer className="taxonomy-review__final"><span>Final decision recorded</span><strong>{item.decision ? formatLabel(item.decision.decision) : formatLabel(item.status)}</strong><small>{item.decision?.rationale}</small></footer>}
                </article>
              );
            })}
          </div>
        ) : null}

        {catalog && catalog.total > 0 ? <footer className="taxonomy-review__pagination"><span>Page {pageNumber} · {catalog.total} matching records</span><div><button type="button" disabled={!cursorHistory.length || loading} onClick={goPrevious}>← Previous</button><button type="button" disabled={!catalog.hasMore || !catalog.nextCursor || loading} onClick={goNext}>Next →</button></div></footer> : null}
      </section>

      {decisionDraft ? (
        <div className="taxonomy-review__modal" role="dialog" aria-modal="true" aria-labelledby="taxonomy-decision-title" onMouseDown={(event) => event.target === event.currentTarget && !savingDecision && setDecisionDraft(null)}>
          <form onSubmit={submitDecision}>
            <header>
              <div><span>Immutable human decision</span><h3 id="taxonomy-decision-title">{ACTION_DETAILS[decisionDraft.decision].label}</h3><p>{ACTION_DETAILS[decisionDraft.decision].description}</p></div>
              <button ref={modalCloseRef} type="button" disabled={savingDecision} onClick={() => setDecisionDraft(null)} aria-label="Close taxonomy decision">×</button>
            </header>

            <div className="taxonomy-review__modal-body">
              <div className="taxonomy-review__decision-context"><span>{decisionDraft.item.question.subject}</span><strong>{decisionDraft.item.question.questionText}</strong><small>{decisionDraft.item.proposal.primarySkillName} → {decisionDraft.item.proposal.atomicSubskillName}</small></div>

              {decisionDraft.decision === 'approve' ? <div className="taxonomy-review__approval-note"><strong>Exact approval</strong><p>The original {Math.round(decisionDraft.item.proposal.confidenceScore * 100)}% proposal confidence remains visible. The human-approved taxonomy revision is recorded at the governed minimum of 90%.</p></div> : null}

              {decisionDraft.decision === 'supersede' ? (
                <fieldset className="taxonomy-review__replacement">
                  <legend>Corrected approved taxonomy</legend>
                  <label className="is-wide"><span>Current approved curriculum objective</span><select required value={decisionDraft.replacement.curriculumMappingId} onChange={(event) => updateReplacement('curriculumMappingId', event.target.value)}>{decisionDraft.item.objectiveOptions.map((option) => <option key={option.curriculumMappingId} value={option.curriculumMappingId}>{option.frameworkVersionCode} · {option.scopeName} · {option.objectiveCode} — {option.objectiveStatement}</option>)}</select><small>Only current approved primary mappings are available; the framework version is shown to prevent cross-version substitution.</small></label>
                  <label><span>Primary skill name</span><input required minLength={3} maxLength={160} value={decisionDraft.replacement.primarySkillName} onChange={(event) => updateReplacement('primarySkillName', event.target.value)} /></label>
                  <label><span>Primary skill code</span><input required value={decisionDraft.replacement.primarySkillCode} onChange={(event) => updateReplacement('primarySkillCode', event.target.value)} /></label>
                  <label><span>Atomic subskill name</span><input required minLength={3} maxLength={200} value={decisionDraft.replacement.atomicSubskillName} onChange={(event) => updateReplacement('atomicSubskillName', event.target.value)} /></label>
                  <label><span>Atomic subskill code</span><input required value={decisionDraft.replacement.atomicSubskillCode} onChange={(event) => updateReplacement('atomicSubskillCode', event.target.value)} /></label>
                  <label><span>Assessment objective</span><select value={decisionDraft.replacement.assessmentProcessCode} onChange={(event) => updateAssessmentProcess(event.target.value as AdminAssessmentProcessCode)}><option value="AO1">AO1 · Knowledge &amp; comprehension</option><option value="AO2">AO2 · Application &amp; procedure</option><option value="AO3">AO3 · Analysis &amp; interpretation</option><option value="AO4">AO4 · Evaluation &amp; judgment</option></select></label>
                  <label><span>Cognitive process</span><select value={decisionDraft.replacement.cognitiveProcess} onChange={(event) => updateReplacement('cognitiveProcess', event.target.value as AdminTaxonomyReplacement['cognitiveProcess'])}>{COGNITION_BY_AO[decisionDraft.replacement.assessmentProcessCode].map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select></label>
                  <label><span>Human-approved confidence</span><input type="number" min="0.9" max="1" step="0.01" required value={decisionDraft.replacement.confidenceScore} onChange={(event) => updateReplacement('confidenceScore', Number(event.target.value))} /></label>
                  <label className="is-wide"><span>Secondary skill codes</span><input value={decisionDraft.replacement.secondarySkillCodes.join(', ')} onChange={(event) => updateReplacement('secondarySkillCodes', event.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))} placeholder="Optional, comma separated" /></label>
                  <label className="is-wide"><span>Evidence statement</span><textarea required minLength={30} maxLength={500} value={decisionDraft.replacement.evidenceStatement} onChange={(event) => updateReplacement('evidenceStatement', event.target.value)} /></label>
                </fieldset>
              ) : null}

              <label className="taxonomy-review__rationale"><span>Decision rationale</span><textarea autoFocus required minLength={20} maxLength={2000} value={decisionDraft.rationale} onChange={(event) => setDecisionDraft((current) => current ? { ...current, rationale: event.target.value } : current)} placeholder="Explain the evidence behind this decision. This note becomes permanent." /><small>{decisionDraft.rationale.trim().length}/2000 · minimum 20 characters</small></label>
            </div>

            <footer><button type="button" disabled={savingDecision} onClick={() => setDecisionDraft(null)}>Cancel</button><button type="submit" className={`is-${ACTION_DETAILS[decisionDraft.decision].tone}`} disabled={savingDecision}>{savingDecision ? 'Recording decision…' : ACTION_DETAILS[decisionDraft.decision].label}</button></footer>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default QuestionTaxonomyReviewQueue;
