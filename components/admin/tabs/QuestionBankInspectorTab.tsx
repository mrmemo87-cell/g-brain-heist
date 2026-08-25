import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSuperadminQuestionSourceReviewLink,
  governSuperadminSchoolQuestion,
  loadSuperadminQuestionBank,
  loadSuperadminSchoolCurriculumOptions,
  type AdminAssessmentProcessCode,
  type AdminQuestionBankCatalog,
  type AdminQuestionBankQuestion,
  type AdminQuestionPool,
  type AdminQuestionStatusFilter,
  type AdminSchoolCurriculumOption,
} from '../../../services/adminQuestionBankService';
import { useAdmin } from '../AdminContext';
import QuestionTaxonomyReviewQueue from './QuestionTaxonomyReviewQueue';
import './QuestionBankInspectorTab.css';

const PAGE_SIZE = 24;

const POOL_DETAILS: Record<AdminQuestionPool, { code: string; title: string; description: string }> = {
  verified: {
    code: 'BH',
    title: 'Brains Heist Verified Pool',
    description: 'Official, protected academic evidence accepted by the learning system.',
  },
  school: {
    code: 'SC',
    title: 'School Verified Pools',
    description: 'Human-approved evidence restricted to the owning school and its named curriculum.',
  },
  teacher: {
    code: 'TR',
    title: 'Teacher Submissions',
    description: 'Classroom-authored questions with accountable teacher and school provenance.',
  },
  archive: {
    code: 'AR',
    title: 'Retired Archive',
    description: 'Excluded or retired records retained for governance history and audit.',
  },
};

const COGNITION_BY_AO: Record<AdminAssessmentProcessCode, Array<'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate'>> = {
  AO1: ['remember', 'understand'],
  AO2: ['apply'],
  AO3: ['analyze'],
  AO4: ['evaluate'],
};

const STATUS_OPTIONS: Array<{ value: AdminQuestionStatusFilter; label: string }> = [
  { value: 'all', label: 'All records' },
  { value: 'in_review', label: 'In review' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'visual', label: 'With visuals' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'high_usage', label: 'High usage' },
];

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  : 'Not recorded';

const formatQuestionType = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatAuditLabel = (value?: string | null) => value
  ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  : 'Not recorded';

const optionText = (option: string | { text?: string }) => typeof option === 'string' ? option : option.text || 'Image option';

const questionStatusLabel = (question: AdminQuestionBankQuestion) => {
  if (question.verificationStatus === 'in_review') return 'In review';
  if (question.needsAttention) return 'Needs attention';
  return question.integrityState;
};

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const QuestionBankInspectorTab: React.FC = () => {
  const { addToast } = useAdmin();
  const [workspace, setWorkspace] = useState<'vault' | 'taxonomy'>('vault');
  const [pool, setPool] = useState<AdminQuestionPool>('verified');
  const [catalog, setCatalog] = useState<AdminQuestionBankCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [status, setStatus] = useState<AdminQuestionStatusFilter>('all');
  const [offset, setOffset] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState<AdminQuestionBankQuestion | null>(null);
  const [openingSourceItemId, setOpeningSourceItemId] = useState<string | null>(null);
  const [schoolOptions, setSchoolOptions] = useState<AdminSchoolCurriculumOption[]>([]);
  const [schoolOptionsBlockedReason, setSchoolOptionsBlockedReason] = useState<string | null>(null);
  const [loadingSchoolOptions, setLoadingSchoolOptions] = useState(false);
  const [savingGovernance, setSavingGovernance] = useState(false);
  const [selectedSchoolOptionId, setSelectedSchoolOptionId] = useState('');
  const [governanceRationale, setGovernanceRationale] = useState('');
  const [primarySkillName, setPrimarySkillName] = useState('');
  const [atomicSubskillName, setAtomicSubskillName] = useState('');
  const [assessmentProcessCode, setAssessmentProcessCode] = useState<AdminAssessmentProcessCode>('AO1');
  const [cognitiveProcess, setCognitiveProcess] = useState<'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate'>('understand');
  const [evidenceStatement, setEvidenceStatement] = useState('');
  const [taxonomyConfidence, setTaxonomyConfidence] = useState(0.9);
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSuperadminQuestionBank({
        pool,
        search,
        subject,
        schoolId: pool === 'teacher' || pool === 'school' ? schoolId : undefined,
        status,
        limit: PAGE_SIZE,
        offset,
      });
      setCatalog(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The question bank could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [offset, pool, schoolId, search, status, subject]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedQuestion) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedQuestion(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    modalCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [selectedQuestion]);

  useEffect(() => {
    let cancelled = false;
    setSchoolOptions([]);
    setSchoolOptionsBlockedReason(null);
    setSelectedSchoolOptionId('');
    setGovernanceRationale('');
    const proposal = selectedQuestion?.submission?.taxonomyProposal;
    setPrimarySkillName(proposal?.primary_skill_name || '');
    setAtomicSubskillName(proposal?.atomic_subskill_name || '');
    setAssessmentProcessCode(proposal?.assessment_process_code || 'AO1');
    setCognitiveProcess(proposal?.cognitive_process || 'understand');
    setEvidenceStatement(proposal?.evidence_statement || '');
    setTaxonomyConfidence(Math.max(0.9, Number(proposal?.confidence_score || 0.9)));

    if (!selectedQuestion
        || selectedQuestion.pool !== 'teacher'
        || selectedQuestion.verificationStatus !== 'in_review') {
      setLoadingSchoolOptions(false);
      return () => { cancelled = true; };
    }

    setLoadingSchoolOptions(true);
    void loadSuperadminSchoolCurriculumOptions(selectedQuestion.id)
      .then((result) => {
        if (cancelled) return;
        setSchoolOptions(result.options);
        setSchoolOptionsBlockedReason(result.blockedReason || null);
        setSelectedSchoolOptionId(result.options[0]?.schoolCurriculumMappingId
          ? `${result.options[0].schoolCurriculumMappingId}:${result.options[0].objectiveId}`
          : '');
      })
      .catch((optionsError) => {
        if (!cancelled) {
          setSchoolOptionsBlockedReason(optionsError instanceof Error
            ? optionsError.message
            : 'School curriculum authority could not be loaded.');
        }
      })
      .finally(() => { if (!cancelled) setLoadingSchoolOptions(false); });

    return () => { cancelled = true; };
  }, [selectedQuestion]);

  const summary = catalog?.summary;
  const poolCounts = useMemo(() => ({
    verified: summary?.verifiedQuestions || 0,
    school: summary?.schoolQuestions || 0,
    teacher: summary?.teacherQuestions || 0,
    archive: summary?.archivedQuestions || 0,
  }), [summary]);
  const selectedSchoolOption = useMemo(() => schoolOptions.find((option) =>
    `${option.schoolCurriculumMappingId}:${option.objectiveId}` === selectedSchoolOptionId
  ) || null, [schoolOptions, selectedSchoolOptionId]);
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil((catalog?.total || 0) / PAGE_SIZE));

  const choosePool = (nextPool: AdminQuestionPool) => {
    setPool(nextPool);
    setSubject('');
    setSchoolId('');
    setStatus('all');
    setOffset(0);
    setSelectedQuestion(null);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setOffset(0);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSubject('');
    setSchoolId('');
    setStatus('all');
    setOffset(0);
  };

  const copyQuestionId = async (questionId: string) => {
    try {
      await navigator.clipboard.writeText(questionId);
      addToast('Question ID copied.', 'success');
    } catch {
      addToast('Question ID could not be copied.', 'error');
    }
  };

  const openPrivateSource = async (itemId: string) => {
    const reviewWindow = window.open('about:blank', '_blank');
    if (!reviewWindow) {
      addToast('Allow pop-ups to open the private source PDF.', 'error');
      return;
    }
    reviewWindow.opener = null;
    reviewWindow.document.title = 'Preparing private source…';
    reviewWindow.document.body.textContent = 'Preparing a secure five-minute source review…';
    setOpeningSourceItemId(itemId);
    try {
      const source = await createSuperadminQuestionSourceReviewLink(itemId);
      reviewWindow.location.replace(`${source.signedUrl}${source.sourcePage ? `#page=${source.sourcePage}` : ''}`);
      addToast(`Opened ${source.fileName}${source.sourcePage ? ` at source page ${source.sourcePage}` : ''}.`, 'success');
    } catch (sourceError) {
      reviewWindow.close();
      addToast(sourceError instanceof Error ? sourceError.message : 'The private source PDF could not be opened.', 'error');
    } finally {
      setOpeningSourceItemId(null);
    }
  };

  const changeAssessmentProcess = (next: AdminAssessmentProcessCode) => {
    setAssessmentProcessCode(next);
    setCognitiveProcess(COGNITION_BY_AO[next][0]);
  };

  const recordSchoolGovernance = async (
    action: 'approve_school' | 'return_teacher' | 'retire_school',
  ) => {
    if (!selectedQuestion || savingGovernance) return;
    if (governanceRationale.trim().length < 20) {
      addToast('Record a clear rationale of at least 20 characters.', 'error');
      return;
    }
    if (action === 'approve_school') {
      if (!selectedSchoolOption) {
        addToast('Select the exact school curriculum objective first.', 'error');
        return;
      }
      if (primarySkillName.trim().length < 3 || atomicSubskillName.trim().length < 3) {
        addToast('Confirm both the primary skill and one precise atomic subskill.', 'error');
        return;
      }
      if (evidenceStatement.trim().length < 30 || taxonomyConfidence < 0.9) {
        addToast('Evidence must be specific and confidence must be at least 90%.', 'error');
        return;
      }
    }

    setSavingGovernance(true);
    try {
      const result = await governSuperadminSchoolQuestion({
        questionId: selectedQuestion.id,
        action,
        rationale: governanceRationale,
        curriculum: action === 'approve_school' ? selectedSchoolOption : null,
        taxonomy: action === 'approve_school' ? {
          primarySkillName: primarySkillName.trim(),
          atomicSubskillName: atomicSubskillName.trim(),
          assessmentProcessCode,
          cognitiveProcess,
          evidenceStatement: evidenceStatement.trim(),
          confidenceScore: taxonomyConfidence,
        } : null,
      });
      addToast(action === 'approve_school'
        ? `${result.ownerSchoolName || 'School'} Verified approval recorded. This question can now feed the Academic Profile only for that school.`
        : action === 'return_teacher'
          ? 'Returned to the teacher’s private pool with the decision recorded.'
          : 'School question retired and removed from future Academic Profile evidence.', 'success');
      setSelectedQuestion(null);
      await load();
    } catch (governanceError) {
      addToast(governanceError instanceof Error
        ? governanceError.message
        : 'The governance decision could not be recorded.', 'error');
    } finally {
      setSavingGovernance(false);
    }
  };

  const exportPage = () => {
    if (!catalog?.questions.length) return;
    const header = ['Pool', 'Question ID', 'Subject', 'Topic', 'Question', 'Teacher', 'School', 'Status', 'Answered', 'Accuracy'];
    const rows = catalog.questions.map((question) => [
      POOL_DETAILS[question.pool].title,
      question.id,
      question.subject,
      question.topic,
      question.questionText,
      question.teacher?.name || 'Brains Heist',
      question.teacher?.schoolName || 'Platform content',
      questionStatusLabel(question),
      question.timesAnswered,
      question.accuracyPercent ?? '',
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `brains-heist-question-bank-${pool}-page-${pageNumber}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (workspace === 'taxonomy') {
    return <QuestionTaxonomyReviewQueue onOpenVault={() => setWorkspace('vault')} />;
  }

  return (
    <div className="qb-inspector">
      <header className="qb-inspector__hero">
        <div>
          <span className="qb-inspector__eyebrow">Platform content governance</span>
          <h2>Question Bank Content Vault</h2>
          <p>Manage the global verified bank, every school&apos;s verified curriculum pool, private teacher submissions, and the complete audit archive.</p>
        </div>
        <div className="qb-inspector__hero-seal" aria-label="Locked source-question content vault">
          <span>SUPERADMIN</span>
          <strong>Source content locked</strong>
          <small>Questions stay read-only · taxonomy decisions are append-only</small>
          <button type="button" onClick={() => setWorkspace('taxonomy')}>Open taxonomy review →</button>
        </div>
      </header>

      <section className="qb-inspector__metrics" aria-label="Question bank summary">
        <article><span>All records</span><strong>{summary?.totalQuestions ?? '—'}</strong><small>Governed inventory</small></article>
        <article className="is-verified"><span>Global verified</span><strong>{summary?.verifiedQuestions ?? '—'}</strong><small>Brains Heist evidence</small></article>
        <article className="is-school"><span>School verified</span><strong>{summary?.schoolQuestions ?? '—'}</strong><small>{summary ? `${summary.schoolPoolSchools} school pool${summary.schoolPoolSchools === 1 ? '' : 's'}` : 'Named curriculum evidence'}</small></article>
        <article className="is-teacher"><span>Teacher-made</span><strong>{summary?.teacherQuestions ?? '—'}</strong><small>{summary ? `${summary.teacherAuthors} author${summary.teacherAuthors === 1 ? '' : 's'} · ${summary.teacherSchools} school${summary.teacherSchools === 1 ? '' : 's'}` : 'Loading provenance'}</small></article>
        <article className="is-visual"><span>Visual questions</span><strong>{summary?.visualQuestions ?? '—'}</strong><small>Accessible diagrams</small></article>
        <article className="is-alert"><span>Teacher review queue</span><strong>{summary?.inReviewQuestions ?? '—'}</strong><small>Submitted question evidence</small></article>
      </section>

      <section className="qb-inspector__pool-grid" aria-label="Question collections">
        {(Object.keys(POOL_DETAILS) as AdminQuestionPool[]).map((key) => {
          const detail = POOL_DETAILS[key];
          return (
            <button key={key} type="button" className={pool === key ? `qb-inspector__pool is-${key} is-active` : `qb-inspector__pool is-${key}`} onClick={() => choosePool(key)} aria-pressed={pool === key}>
              <span className="qb-inspector__pool-code">{detail.code}</span>
              <span><strong>{detail.title}</strong><small>{detail.description}</small></span>
              <b>{poolCounts[key]}</b>
            </button>
          );
        })}
      </section>

      <section className="qb-inspector__workspace">
        <div className="qb-inspector__workspace-head">
          <div><span>{POOL_DETAILS[pool].code} collection</span><h3>{POOL_DETAILS[pool].title}</h3><p>{catalog?.total ?? 0} matching question{catalog?.total === 1 ? '' : 's'}</p></div>
          <div className="qb-inspector__head-actions"><button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Refresh evidence'}</button><button type="button" onClick={exportPage} disabled={!catalog?.questions.length}>Export this page</button></div>
        </div>

        <form className="qb-inspector__filters" onSubmit={submitSearch}>
          <label className="qb-inspector__search"><span>Search content or provenance</span><div><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Question, topic, teacher, school or external ID" /><button type="submit">Search</button></div></label>
          <label><span>Subject</span><select value={subject} onChange={(event) => { setSubject(event.target.value); setOffset(0); }}><option value="">All subjects</option>{catalog?.filters.subjects.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.count}</option>)}</select></label>
          {pool === 'teacher' || pool === 'school' ? <label><span>School</span><select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setOffset(0); }}><option value="">All schools</option>{catalog?.filters.schools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.count}</option>)}</select></label> : null}
          <label><span>Signal</span><select value={status} onChange={(event) => { setStatus(event.target.value as AdminQuestionStatusFilter); setOffset(0); }}>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <button type="button" className="qb-inspector__clear" onClick={clearFilters}>Clear filters</button>
        </form>

        {error ? <div className="qb-inspector__error" role="alert"><strong>Vault access interrupted</strong><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : null}

        {!error && loading && !catalog ? <div className="qb-inspector__loading"><span /><span /><span /><p>Reading protected question evidence…</p></div> : null}

        {!error && catalog && !catalog.questions.length ? <div className="qb-inspector__empty"><span>0</span><h4>No records match this lens</h4><p>Broaden the search or clear a provenance filter.</p><button type="button" onClick={clearFilters}>Reset inspector</button></div> : null}

        {!error && catalog?.questions.length ? (
          <div className={loading ? 'qb-inspector__table-wrap is-refreshing' : 'qb-inspector__table-wrap'}>
            <table>
              <thead><tr><th>Question evidence</th><th>Provenance</th><th>Curriculum</th><th>Integrity</th><th>Usage</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{catalog.questions.map((question) => (
                <tr key={question.id} className={[question.needsAttention ? 'needs-attention' : '', question.verificationStatus === 'in_review' ? 'in-review' : ''].filter(Boolean).join(' ')}>
                  <td><div className="qb-inspector__question-cell"><span className={`qb-inspector__mini-code is-${question.pool}`}>{POOL_DETAILS[question.pool].code}</span><div>{question.verificationStatus === 'in_review' ? <span className="qb-inspector__review-badge">In review</span> : null}{question.submission?.candidateOrigin === 'ai_generated_from_source' ? <span className="qb-inspector__review-badge is-generated">AI-created from PDF</span> : null}<strong>{question.questionText}</strong><small>{question.subject} · {question.topic} · {formatQuestionType(question.questionType)}</small>{question.externalId ? <code>{question.externalId}</code> : null}</div></div></td>
                  <td>{question.teacher ? <div className="qb-inspector__provenance"><span className="qb-inspector__avatar">{question.teacher.name.slice(0, 1).toUpperCase()}</span><div><strong>{question.teacher.name}</strong><small>{question.teacher.schoolName}</small>{!question.teacher.profileLinked ? <em>Identity link missing</em> : null}</div></div> : <div className="qb-inspector__official"><strong>Brains Heist</strong><small>{question.contentVersion || 'Verified content'}</small></div>}</td>
                  <td><div className="qb-inspector__curriculum"><strong>{question.curriculumAuthority ? `${question.curriculumAuthority.frameworkName} · ${question.curriculumAuthority.frameworkVersionName}` : question.gradeLevel || (question.eligibleGradeLevels?.length ? `Grades ${question.eligibleGradeLevels.join(', ')}` : 'Grade not tagged')}</strong><small>{question.curriculumAuthority ? `${question.curriculumAuthority.academicYearName ? `${question.curriculumAuthority.academicYearName} · ` : ''}Grade ${question.curriculumAuthority.gradeLevel || question.gradeLevel || '—'} · ${question.curriculumAuthority.scopeName} · ${question.curriculumAuthority.objectiveCode}` : question.curriculum?.skill || question.curriculum?.strand || 'Awaiting exact curriculum authority'}</small></div></td>
                  <td><div className={`qb-inspector__integrity is-${question.integrityState}`}><strong>{questionStatusLabel(question)}</strong><small>{question.isActive ? 'Active' : 'Inactive'} · {question.isPublic ? 'Public' : 'Private'}</small></div></td>
                  <td><div className="qb-inspector__usage"><strong>{question.timesAnswered.toLocaleString()}</strong><small>{question.accuracyPercent == null ? 'No accuracy yet' : `${question.accuracyPercent}% correct`}</small></div></td>
                  <td><button type="button" className="qb-inspector__inspect" onClick={() => setSelectedQuestion(question)}>Inspect</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}

        {catalog && catalog.total > 0 ? <footer className="qb-inspector__pagination"><span>Page {pageNumber} of {pageCount} · {catalog.total} records</span><div><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>← Previous</button><button type="button" disabled={offset + PAGE_SIZE >= catalog.total || loading} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next →</button></div></footer> : null}
      </section>

      {selectedQuestion ? (
        <div className="qb-inspector__modal" role="dialog" aria-modal="true" aria-labelledby="question-inspector-title" onMouseDown={(event) => event.target === event.currentTarget && setSelectedQuestion(null)}>
          <article>
            <header><div><span>{POOL_DETAILS[selectedQuestion.pool].title}</span><h3 id="question-inspector-title">Question evidence</h3><p>{selectedQuestion.subject} · {selectedQuestion.topic}</p></div><button ref={modalCloseRef} type="button" onClick={() => setSelectedQuestion(null)} aria-label="Close question inspector">×</button></header>
            <div className="qb-inspector__modal-grid">
              <main>
                {selectedQuestion.imageUrl ? <figure><img src={selectedQuestion.imageUrl} alt={selectedQuestion.imageAltText || 'Question visual'} /><figcaption>{selectedQuestion.imageAltText || 'No professional alt text recorded.'}</figcaption></figure> : null}
                <section><span>Prompt</span><h4>{selectedQuestion.questionText}</h4></section>
                {selectedQuestion.options?.length ? <section><span>Options</span><ol type="A">{selectedQuestion.options.map((option, index) => <li key={`${selectedQuestion.id}-option-${index}`}>{optionText(option)}</li>)}</ol></section> : null}
                <section className="qb-inspector__answer"><span>Protected answer</span><h4>{selectedQuestion.correctAnswer}</h4>{selectedQuestion.explanation ? <p>{selectedQuestion.explanation}</p> : <em>No explanation recorded.</em>}</section>
                {selectedQuestion.submission ? (
                  <section className="qb-inspector__submission">
                    <span>{selectedQuestion.submission.candidateOrigin === 'ai_generated_from_source' ? 'AI-created from source · human review required' : 'Extracted source question · human review required'}</span>
                    <div className="qb-inspector__source-audit">
                      <div><small>Processing mode</small><strong>{formatAuditLabel(selectedQuestion.submission.processingMode)}</strong></div>
                      <div><small>Document type</small><strong>{formatAuditLabel(selectedQuestion.submission.detectedDocumentType)}</strong></div>
                      <div><small>Origin</small><strong>{selectedQuestion.submission.candidateOrigin === 'ai_generated_from_source' ? 'Created from source' : 'Present in source'}</strong></div>
                      {selectedQuestion.submission.candidateOrigin === 'ai_generated_from_source' ? <div className={selectedQuestion.submission.sourceRightsAttested ? 'is-confirmed' : 'is-warning'}><small>Source use</small><strong>{selectedQuestion.submission.sourceRightsAttested ? 'Rights confirmed' : 'Confirmation missing'}</strong></div> : null}
                    </div>
                    {selectedQuestion.submission.candidateOrigin === 'ai_generated_from_source' ? (
                      <div className="qb-inspector__grounding">
                        <div><strong>Grounding evidence</strong><span>{selectedQuestion.submission.sourcePage ? `Page ${selectedQuestion.submission.sourcePage}` : 'Page not recorded'} · {formatAuditLabel(selectedQuestion.submission.sourceEvidenceKind)} · {Math.round((selectedQuestion.submission.groundingConfidence || 0) * 100)}% confidence</span></div>
                        <p><strong>Learning objective:</strong> {selectedQuestion.submission.learningObjective || 'Not recorded'}</p>
                        <p><strong>Source support:</strong> {selectedQuestion.submission.sourceGroundingNote || 'Not recorded'}</p>
                        {selectedQuestion.submission.sourceVisualDescription ? <p><strong>Visual evidence:</strong> {selectedQuestion.submission.sourceVisualDescription}</p> : null}
                        {selectedQuestion.submission.processingRequest?.learning_priorities ? <p><strong>Teacher priority:</strong> {selectedQuestion.submission.processingRequest.learning_priorities}</p> : null}
                      </div>
                    ) : null}
                    <div className="qb-inspector__submission-head">
                      <div><small>Primary skill</small><h4>{selectedQuestion.submission.taxonomyProposal.primary_skill_name}</h4></div>
                      <strong>{Math.round(selectedQuestion.submission.taxonomyProposal.confidence_score * 100)}% confidence</strong>
                    </div>
                    <dl>
                      <div><dt>Atomic subskill</dt><dd>{selectedQuestion.submission.taxonomyProposal.atomic_subskill_name}</dd></div>
                      <div><dt>Assessment objective</dt><dd>{selectedQuestion.submission.taxonomyProposal.assessment_process_code} · {selectedQuestion.submission.taxonomyProposal.assessment_process_name}</dd></div>
                      <div><dt>Cognitive process</dt><dd>{selectedQuestion.submission.taxonomyProposal.cognitive_process}</dd></div>
                    </dl>
                    <p><strong>Evidence:</strong> {selectedQuestion.submission.taxonomyProposal.evidence_statement}</p>
                    <p><strong>Review note:</strong> {selectedQuestion.submission.taxonomyProposal.review_reason}</p>
                    <small>Private source: {selectedQuestion.submission.sourceFileName}{selectedQuestion.submission.sourcePage ? ` · page ${selectedQuestion.submission.sourcePage}` : ''} · processed with {selectedQuestion.submission.extractionModel}{selectedQuestion.submission.sourceDrift ? ' · source snapshot drift detected' : ''}</small>
                    <button type="button" className="qb-inspector__open-source" onClick={() => void openPrivateSource(selectedQuestion.submission!.itemId)} disabled={openingSourceItemId === selectedQuestion.submission.itemId}>{openingSourceItemId === selectedQuestion.submission.itemId ? 'Preparing secure source…' : 'Open private source PDF ↗'}</button>
                  </section>
                ) : null}
                {selectedQuestion.pool === 'teacher' && selectedQuestion.verificationStatus === 'in_review' ? (
                  <section className="qb-inspector__school-gate">
                    <div className="qb-inspector__school-gate-head">
                      <div><span>School Verification Gate</span><h4>Approve only after curriculum and diagnostic evidence agree</h4><p>Approval makes this read-only and Academic Profile eligible for the named school only.</p></div>
                      <strong>Human decision</strong>
                    </div>
                    {loadingSchoolOptions ? <div className="qb-inspector__gate-loading">Loading confirmed school curriculum objectives…</div> : null}
                    {schoolOptionsBlockedReason ? <div className="qb-inspector__gate-blocked" role="alert"><strong>Approval blocked</strong><p>{schoolOptionsBlockedReason}</p></div> : null}
                    {!loadingSchoolOptions && schoolOptions.length ? (
                      <form onSubmit={(event) => { event.preventDefault(); void recordSchoolGovernance('approve_school'); }}>
                        <fieldset>
                          <legend><b>1</b> Exact school curriculum authority</legend>
                          <label><span>Curriculum · version · year · grade · scope · objective</span><select value={selectedSchoolOptionId} onChange={(event) => setSelectedSchoolOptionId(event.target.value)}>{schoolOptions.map((option) => <option key={`${option.schoolCurriculumMappingId}:${option.objectiveId}`} value={`${option.schoolCurriculumMappingId}:${option.objectiveId}`}>{option.label}</option>)}</select></label>
                          {selectedSchoolOption ? <div className="qb-inspector__authority-preview"><strong>{selectedSchoolOption.frameworkName} · {selectedSchoolOption.frameworkVersionName}</strong><span>{selectedSchoolOption.schoolName} · {selectedSchoolOption.academicYearName} · Grade {selectedSchoolOption.gradeLevel} · {selectedSchoolOption.academicSubjectName}</span><p><b>{selectedSchoolOption.objectiveCode}</b> {selectedSchoolOption.objectiveStatement}</p></div> : null}
                        </fieldset>
                        <fieldset>
                          <legend><b>2</b> What this question actually measures</legend>
                          <div className="qb-inspector__gate-grid">
                            <label><span>Primary skill</span><input value={primarySkillName} onChange={(event) => setPrimarySkillName(event.target.value)} maxLength={160} /></label>
                            <label><span>Atomic subskill</span><input value={atomicSubskillName} onChange={(event) => setAtomicSubskillName(event.target.value)} maxLength={200} /></label>
                            <label><span>Assessment objective</span><select value={assessmentProcessCode} onChange={(event) => changeAssessmentProcess(event.target.value as AdminAssessmentProcessCode)}><option value="AO1">AO1 · knowledge &amp; understanding</option><option value="AO2">AO2 · application</option><option value="AO3">AO3 · analysis</option><option value="AO4">AO4 · evaluation</option></select></label>
                            <label><span>Cognitive process</span><select value={cognitiveProcess} onChange={(event) => setCognitiveProcess(event.target.value as typeof cognitiveProcess)}>{COGNITION_BY_AO[assessmentProcessCode].map((value) => <option key={value} value={value}>{formatAuditLabel(value)}</option>)}</select></label>
                            <label className="is-wide"><span>Observable evidence statement</span><textarea value={evidenceStatement} onChange={(event) => setEvidenceStatement(event.target.value)} minLength={30} maxLength={500} rows={3} /></label>
                            <label><span>Human-approved confidence</span><div className="qb-inspector__confidence"><input type="range" min="0.9" max="1" step="0.01" value={taxonomyConfidence} onChange={(event) => setTaxonomyConfidence(Number(event.target.value))} /><strong>{Math.round(taxonomyConfidence * 100)}%</strong></div></label>
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend><b>3</b> Decision record</legend>
                          <label><span>Professional rationale · stored permanently</span><textarea value={governanceRationale} onChange={(event) => setGovernanceRationale(event.target.value)} minLength={20} maxLength={2000} rows={3} placeholder="Explain why the content, exact curriculum objective, skill, subskill and assessment objective are accurate." /></label>
                        </fieldset>
                        <div className="qb-inspector__gate-actions"><button type="button" className="is-return" onClick={() => void recordSchoolGovernance('return_teacher')} disabled={savingGovernance}>Return to teacher</button><button type="submit" className="is-approve" disabled={savingGovernance || !selectedSchoolOption}>{savingGovernance ? 'Recording decision…' : `Approve for ${selectedSchoolOption?.schoolName || 'school'} →`}</button></div>
                      </form>
                    ) : null}
                    {!loadingSchoolOptions && !schoolOptions.length ? <div className="qb-inspector__gate-actions"><label className="qb-inspector__return-reason"><span>Return rationale</span><textarea value={governanceRationale} onChange={(event) => setGovernanceRationale(event.target.value)} minLength={20} maxLength={2000} rows={3} placeholder="Tell the teacher or curriculum team exactly what must be corrected." /></label><button type="button" className="is-return" onClick={() => void recordSchoolGovernance('return_teacher')} disabled={savingGovernance}>{savingGovernance ? 'Recording…' : 'Return to teacher'}</button></div> : null}
                  </section>
                ) : null}
                {selectedQuestion.pool === 'school' && selectedQuestion.verificationStatus === 'verified' ? (
                  <section className="qb-inspector__school-gate is-retirement">
                    <div className="qb-inspector__school-gate-head"><div><span>School Verified Governance</span><h4>Retire from future use</h4><p>Historical decisions remain auditable; future assignments and Academic Profile evidence will stop using this item.</p></div><strong>Protected</strong></div>
                    <label><span>Retirement rationale · stored permanently</span><textarea value={governanceRationale} onChange={(event) => setGovernanceRationale(event.target.value)} minLength={20} maxLength={2000} rows={3} /></label>
                    <div className="qb-inspector__gate-actions"><button type="button" className="is-retire" onClick={() => void recordSchoolGovernance('retire_school')} disabled={savingGovernance}>{savingGovernance ? 'Recording…' : 'Retire school question'}</button></div>
                  </section>
                ) : null}
              </main>
              <aside>
                <section><span>Provenance</span>{selectedQuestion.teacher ? <><h4>{selectedQuestion.teacher.name}</h4><p>{selectedQuestion.teacher.schoolName}</p><small>{selectedQuestion.teacher.profileLinked ? 'Linked teacher profile' : 'Identity link requires review'} · {selectedQuestion.teacher.verified ? 'Verified teacher' : 'Teacher verification pending'}</small></> : <><h4>Brains Heist Verified</h4><p>{selectedQuestion.verifiedByAuthority || 'Brains Heist Content Quality'}</p><small>{selectedQuestion.contentVersion || 'Version unavailable'} · revision {selectedQuestion.contentRevision || 1}</small></>}</section>
                <section><span>Curriculum evidence</span>{selectedQuestion.curriculumAuthority ? <><h4>{selectedQuestion.curriculumAuthority.frameworkName}</h4><p>{selectedQuestion.curriculumAuthority.frameworkVersionName}{selectedQuestion.curriculumAuthority.academicYearName ? ` · ${selectedQuestion.curriculumAuthority.academicYearName}` : ''} · Grade {selectedQuestion.curriculumAuthority.gradeLevel || selectedQuestion.gradeLevel || '—'}</p><small>{selectedQuestion.curriculumAuthority.scopeName} · {selectedQuestion.curriculumAuthority.objectiveCode}<br />{selectedQuestion.curriculumAuthority.objectiveStatement}</small></> : <><h4>{selectedQuestion.gradeLevel || 'Grade not tagged'}</h4><p>{selectedQuestion.curriculum?.skill || selectedQuestion.curriculum?.strand || 'Not yet governed'}</p><small>{selectedQuestion.curriculum?.objective || 'No approved curriculum objective.'}</small></>}</section>
                {selectedQuestion.governance ? <section><span>Latest governance decision</span><h4>{formatAuditLabel(selectedQuestion.governance.action)}</h4><p>{selectedQuestion.governance.rationale}</p><small>{selectedQuestion.governance.authority} · {formatDate(selectedQuestion.governance.decidedAt)}</small></section> : null}
                <section><span>Quality &amp; usage</span><h4 className={selectedQuestion.needsAttention ? 'is-warning' : ''}>{selectedQuestion.verificationStatus === 'in_review' ? 'Awaiting governance review' : selectedQuestion.needsAttention ? 'Review signal open' : 'No blocking signal'}</h4><p>{selectedQuestion.timesAnswered.toLocaleString()} answers · {selectedQuestion.accuracyPercent == null ? 'no accuracy yet' : `${selectedQuestion.accuracyPercent}% correct`}</p><small>{selectedQuestion.integrityState} · {selectedQuestion.isActive ? 'active' : 'inactive'} · {selectedQuestion.isPublic ? 'public' : 'private'}</small></section>
                <section><span>Record identity</span><code>{selectedQuestion.id}</code>{selectedQuestion.externalId ? <code>{selectedQuestion.externalId}</code> : null}<p>Created {formatDate(selectedQuestion.createdAt)}</p><button type="button" onClick={() => void copyQuestionId(selectedQuestion.id)}>Copy question ID</button></section>
              </aside>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
};

export default QuestionBankInspectorTab;
