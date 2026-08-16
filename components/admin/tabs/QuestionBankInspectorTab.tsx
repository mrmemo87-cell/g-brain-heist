import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadSuperadminQuestionBank,
  type AdminQuestionBankCatalog,
  type AdminQuestionBankQuestion,
  type AdminQuestionPool,
  type AdminQuestionStatusFilter,
} from '../../../services/adminQuestionBankService';
import { useAdmin } from '../AdminContext';
import './QuestionBankInspectorTab.css';

const PAGE_SIZE = 24;

const POOL_DETAILS: Record<AdminQuestionPool, { code: string; title: string; description: string }> = {
  verified: {
    code: 'BH',
    title: 'Brains Heist Verified Pool',
    description: 'Official, protected academic evidence accepted by the learning system.',
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

const STATUS_OPTIONS: Array<{ value: AdminQuestionStatusFilter; label: string }> = [
  { value: 'all', label: 'All records' },
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

const optionText = (option: string | { text?: string }) => typeof option === 'string' ? option : option.text || 'Image option';

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const QuestionBankInspectorTab: React.FC = () => {
  const { addToast } = useAdmin();
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
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSuperadminQuestionBank({
        pool,
        search,
        subject,
        schoolId: pool === 'teacher' ? schoolId : undefined,
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

  const summary = catalog?.summary;
  const poolCounts = useMemo(() => ({
    verified: summary?.verifiedQuestions || 0,
    teacher: summary?.teacherQuestions || 0,
    archive: summary?.archivedQuestions || 0,
  }), [summary]);
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
      question.needsAttention ? 'Needs attention' : question.integrityState,
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

  return (
    <div className="qb-inspector">
      <header className="qb-inspector__hero">
        <div>
          <span className="qb-inspector__eyebrow">Platform content governance</span>
          <h2>Question Bank Content Vault</h2>
          <p>Inspect every governed question, trace who created it, and verify exactly which school owns the classroom provenance.</p>
        </div>
        <div className="qb-inspector__hero-seal" aria-label="Read-only superadmin workspace">
          <span>SUPERADMIN</span>
          <strong>Read-only vault</strong>
          <small>Answers visible · edits blocked</small>
        </div>
      </header>

      <section className="qb-inspector__metrics" aria-label="Question bank summary">
        <article><span>All records</span><strong>{summary?.totalQuestions ?? '—'}</strong><small>Governed inventory</small></article>
        <article className="is-verified"><span>Verified</span><strong>{summary?.verifiedQuestions ?? '—'}</strong><small>Protected evidence</small></article>
        <article className="is-teacher"><span>Teacher-made</span><strong>{summary?.teacherQuestions ?? '—'}</strong><small>{summary ? `${summary.teacherAuthors} author${summary.teacherAuthors === 1 ? '' : 's'} · ${summary.teacherSchools} school${summary.teacherSchools === 1 ? '' : 's'}` : 'Loading provenance'}</small></article>
        <article className="is-visual"><span>Visual questions</span><strong>{summary?.visualQuestions ?? '—'}</strong><small>Accessible diagrams</small></article>
        <article className="is-alert"><span>Governance queue</span><strong>{summary?.needsAttention ?? '—'}</strong><small>Review signals</small></article>
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
          {pool === 'teacher' ? <label><span>School</span><select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setOffset(0); }}><option value="">All schools</option>{catalog?.filters.schools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.count}</option>)}</select></label> : null}
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
                <tr key={question.id} className={question.needsAttention ? 'needs-attention' : ''}>
                  <td><div className="qb-inspector__question-cell"><span className={`qb-inspector__mini-code is-${question.pool}`}>{POOL_DETAILS[question.pool].code}</span><div><strong>{question.questionText}</strong><small>{question.subject} · {question.topic} · {formatQuestionType(question.questionType)}</small>{question.externalId ? <code>{question.externalId}</code> : null}</div></div></td>
                  <td>{question.teacher ? <div className="qb-inspector__provenance"><span className="qb-inspector__avatar">{question.teacher.name.slice(0, 1).toUpperCase()}</span><div><strong>{question.teacher.name}</strong><small>{question.teacher.schoolName}</small>{!question.teacher.profileLinked ? <em>Identity link missing</em> : null}</div></div> : <div className="qb-inspector__official"><strong>Brains Heist</strong><small>{question.contentVersion || 'Verified content'}</small></div>}</td>
                  <td><div className="qb-inspector__curriculum"><strong>{question.gradeLevel || (question.eligibleGradeLevels?.length ? `Grades ${question.eligibleGradeLevels.join(', ')}` : 'Grade not tagged')}</strong><small>{question.curriculum?.skill || question.curriculum?.strand || 'General curriculum'}</small></div></td>
                  <td><div className={`qb-inspector__integrity is-${question.integrityState}`}><strong>{question.needsAttention ? 'Needs attention' : question.integrityState}</strong><small>{question.isActive ? 'Active' : 'Inactive'} · {question.isPublic ? 'Public' : 'Private'}</small></div></td>
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
              </main>
              <aside>
                <section><span>Provenance</span>{selectedQuestion.teacher ? <><h4>{selectedQuestion.teacher.name}</h4><p>{selectedQuestion.teacher.schoolName}</p><small>{selectedQuestion.teacher.profileLinked ? 'Linked teacher profile' : 'Identity link requires review'} · {selectedQuestion.teacher.verified ? 'Verified teacher' : 'Teacher verification pending'}</small></> : <><h4>Brains Heist Verified</h4><p>{selectedQuestion.verifiedByAuthority || 'Brains Heist Content Quality'}</p><small>{selectedQuestion.contentVersion || 'Version unavailable'} · revision {selectedQuestion.contentRevision || 1}</small></>}</section>
                <section><span>Curriculum evidence</span><h4>{selectedQuestion.gradeLevel || 'Grade not tagged'}</h4><p>{selectedQuestion.curriculum?.skill || selectedQuestion.curriculum?.strand || 'General curriculum'}</p><small>{selectedQuestion.curriculum?.objective || 'No objective text recorded.'}</small></section>
                <section><span>Quality &amp; usage</span><h4 className={selectedQuestion.needsAttention ? 'is-warning' : ''}>{selectedQuestion.needsAttention ? 'Review signal open' : 'No blocking signal'}</h4><p>{selectedQuestion.timesAnswered.toLocaleString()} answers · {selectedQuestion.accuracyPercent == null ? 'no accuracy yet' : `${selectedQuestion.accuracyPercent}% correct`}</p><small>{selectedQuestion.integrityState} · {selectedQuestion.isActive ? 'active' : 'inactive'} · {selectedQuestion.isPublic ? 'public' : 'private'}</small></section>
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
