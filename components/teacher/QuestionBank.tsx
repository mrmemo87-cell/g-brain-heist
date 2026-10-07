import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Subject, Teacher, TeacherQuestion } from '../../types';
import QuestionPreviewModal from './QuestionPreviewModal';
import { questionAssessmentSearchText } from './questionAssessment';
import { questionPurposeLabel } from '../../services/economicsQuestionPurpose';
import { isBrainsHeistPoolQuestion, isMyPoolQuestion, isSchoolPoolQuestion } from './questionPool.js';
import './QuestionBank.css';
import { brainsAlert } from '../../src/utils/brainsAlert';
import { fetchQuestionFacets, fetchQuestionSet, type QuestionFacet } from '../../services/questionBrowserService';
import { useQuestionBrowser } from '../../src/hooks/useQuestionBrowser';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../../src/lib/schoolDocument';

interface QuestionBankProps {
  remote?: boolean;
  revision?: number;
  onQuestionsLoaded?: (questions: TeacherQuestion[]) => void;
  audience?: 'teacher' | 'student';
  questions: TeacherQuestion[];
  teacher: Teacher | null;
  onUseSet: (questionIds: string[], subject: Subject, topic: string, loadedQuestions?: TeacherQuestion[]) => void;
  onEditQuestion?: (question: TeacherQuestion) => void;
  onDeleteQuestion?: (questionId: string) => void;
  onCreateQuestion?: (subject?: Subject, topic?: string) => void;
  onCreateQuestionBatch?: (subject?: Subject, topic?: string) => void;
  onRenameTopic?: (questions: TeacherQuestion[], nextTopic: string) => void;
  onDeleteTopic?: (questions: TeacherQuestion[]) => void;
  useActionLabel?: string;
  restrictedSubjects?: string[];
  schoolName?: string;
  schoolLogoUrl?: string | null;
  teacherName?: string;
  schoolId?: string | null;
}

type PoolKey = 'brains-heist' | 'school' | 'mine';
interface TopicGroup { key: string; subject: Subject; topic: string; questions: TeacherQuestion[]; count?: number; reviewCount?: number }
const getTopic = (question: TeacherQuestion) => question.topic_name || question.topic || 'General';
const formatQuestionType = (value: TeacherQuestion['question_type']) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalizeSubject = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (['math', 'maths', 'mathematics'].includes(normalized)) return 'maths';
  if (normalized === 'english language') return 'english';
  return normalized;
};
const makeTopicGroups = (questions: TeacherQuestion[]) => {
  const groups = new Map<string, TopicGroup>();
  questions.forEach((question) => {
    const topic = getTopic(question);
    const key = `${question.subject}::${topic}`;
    const existing = groups.get(key);
    if (existing) existing.questions.push(question);
    else groups.set(key, { key, subject: question.subject, topic, questions: [question] });
  });
  return [...groups.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
};

export default function QuestionBank({
  questions, teacher, onUseSet, onEditQuestion, onDeleteQuestion, onCreateQuestion, onCreateQuestionBatch,
  onRenameTopic, onDeleteTopic, useActionLabel = 'Add to a new assignment', restrictedSubjects,
  schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher',
  schoolId,
  remote = false, revision = 0, onQuestionsLoaded, audience = 'teacher',
}: QuestionBankProps) {
  const [activePool, setActivePool] = useState<PoolKey>('brains-heist');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicGroup | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<TeacherQuestion | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [topicName, setTopicName] = useState('');
  const initialPoolResolvedRef = useRef(false);
  const [facets, setFacets] = useState<QuestionFacet[]>([]);
  const [searchFacets, setSearchFacets] = useState<QuestionFacet[]>([]);
  const [facetsLoading, setFacetsLoading] = useState(remote);
  const [facetsError, setFacetsError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const topicRequest = useRef(0);
  const browser = useQuestionBrowser({ subject: selectedTopic?.subject, topic: selectedTopic?.topic,
    pool: activePool, search: searchTerm || undefined, audience }, remote && !!selectedTopic, revision);
  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    setFacetsLoading(true); setFacetsError('');
    void fetchQuestionFacets('', audience).then((rows) => { if (!cancelled) setFacets(rows); })
      .catch(() => { if (!cancelled) setFacetsError('The question bank could not be loaded. Reopen the bank to retry.'); })
      .finally(() => { if (!cancelled) setFacetsLoading(false); });
    return () => { cancelled = true; };
  }, [remote, revision, audience]);
  useEffect(() => {
    if (!remote || !searchTerm.trim()) { setSearchFacets(facets); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setFacetsLoading(true); setFacetsError('');
      void fetchQuestionFacets(searchTerm, audience).then((rows) => { if (!cancelled) setSearchFacets(rows); })
        .catch(() => { if (!cancelled) setFacetsError('Search could not be loaded. Please try again.'); })
        .finally(() => { if (!cancelled) setFacetsLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [remote, searchTerm, facets, audience]);
  useEffect(() => {
    if (remote && browser.questions.length) onQuestionsLoaded?.(browser.questions);
  }, [remote, browser.questions, onQuestionsLoaded]);
  useEffect(() => {
    if (remote && !initialPoolResolvedRef.current && facets.length) {
      initialPoolResolvedRef.current = true;
      if (!facets.some((item) => item.pool === 'brains-heist')) setActivePool(facets[0].pool as PoolKey);
    }
  }, [remote, facets]);
  const permittedFacets = facets.filter((item) => !restrictedSubjects || item.pool === 'mine'
    || restrictedSubjects.some((subject) => normalizeSubject(subject) === normalizeSubject(item.subject)));
  const poolCount = (pool: PoolKey) => remote
    ? permittedFacets.filter((item) => item.pool === pool).reduce((sum, item) => sum + item.count, 0)
    : pools[pool].length;

  const permittedQuestions = useMemo(() => {
    if (restrictedSubjects === undefined) return questions;
    const permitted = new Set(restrictedSubjects.map(normalizeSubject));
    return questions.filter((question) => (
      isMyPoolQuestion(question, teacher?.id)
      || permitted.has(normalizeSubject(question.subject))
    ));
  }, [questions, restrictedSubjects, teacher?.id]);

  const pools = useMemo(() => ({
    'brains-heist': permittedQuestions.filter((question) => isBrainsHeistPoolQuestion(question, teacher?.id)),
    school: permittedQuestions.filter((question) => isSchoolPoolQuestion(question, teacher?.id)),
    mine: permittedQuestions.filter((question) => isMyPoolQuestion(question, teacher?.id)),
  }), [permittedQuestions, teacher]);

  useEffect(() => {
    if (initialPoolResolvedRef.current || questions.length === 0) return;
    if (pools['brains-heist'].length > 0) {
      initialPoolResolvedRef.current = true;
      return;
    }

    const firstAvailablePool: PoolKey | undefined = pools.school.length > 0
      ? 'school'
      : pools.mine.length > 0
        ? 'mine'
        : undefined;
    if (!firstAvailablePool) return;

    initialPoolResolvedRef.current = true;
    setActivePool(firstAvailablePool);
    setSubjectFilter('');
    setSelectedTopic(null);
  }, [pools, questions.length]);

  const poolQuestions = pools[activePool];
  const subjects = useMemo(
    () => [...new Set(remote ? permittedFacets.filter((item) => item.pool === activePool).map((item) => item.subject as Subject) : poolQuestions.map((question) => question.subject))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),
    [poolQuestions, remote, facets, activePool, restrictedSubjects],
  );
  const effectiveSubject = subjects.includes(subjectFilter as Subject) ? subjectFilter : subjects[0] || '';
  const visibleQuestions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return poolQuestions.filter((question) => {
      if (!effectiveSubject || question.subject !== effectiveSubject) return false;
      return !search || [question.question_text, question.correct_answer, question.subject, getTopic(question), questionAssessmentSearchText(question), ...(question.tags || [])].join(' ').toLowerCase().includes(search);
    });
  }, [effectiveSubject, poolQuestions, searchTerm]);
  const topicGroups = useMemo(() => remote
    ? searchFacets.filter((item) => item.pool === activePool && item.subject === effectiveSubject)
      .map((item) => ({ key: `${item.subject}::${item.topic}`, subject: item.subject as Subject, topic: item.topic,
        count: item.count, reviewCount: item.review_count, questions: [] as TeacherQuestion[] }))
    : makeTopicGroups(visibleQuestions), [remote, searchFacets, activePool, effectiveSubject, visibleQuestions]);
  const shownTopic = selectedTopic && remote ? { ...selectedTopic, questions: browser.questions } : selectedTopic;
  const selectedPoolTitle = activePool === 'brains-heist'
    ? 'Brains Heist Verified'
    : activePool === 'school'
      ? `${schoolName} Verified`
      : 'My Pool';
  const isOfficialPool = activePool !== 'mine';

  const choosePool = (pool: PoolKey) => {
    ++topicRequest.current;
    setActivePool(pool);
    setSubjectFilter('');
    setSelectedTopic(null);
  };

  const completeTopic = async (group: TopicGroup, action: (complete: TopicGroup) => void) => {
    const request = ++topicRequest.current;
    setActionLoading(true);
    try {
      const loaded = remote ? await fetchQuestionSet({ subject: group.subject, topic: group.topic, pool: activePool,
        search: searchTerm || undefined, audience }) : group.questions;
      if (topicRequest.current !== request) return;
      onQuestionsLoaded?.(loaded);
      action({ ...group, questions: loaded });
    } catch (error) { brainsAlert(error instanceof Error ? error.message : 'This topic could not be loaded.', 'error'); }
    finally { if (topicRequest.current === request) setActionLoading(false); }
  };

  const printTopic = (group: TopicGroup, includeAnswers: boolean, reservedWindow?: Window | null) => {
    const questionRows = group.questions.map((question, index) => {
      const options = (question.options || []).map((option) => typeof option === 'string' ? option : option.text).filter(Boolean);
      return `<section class="document-card">
        <strong>${index + 1}. ${escapeSchoolDocumentHtml(question.question_text)}</strong>
        ${options.length ? `<ol type="A">${options.map((option) => `<li>${escapeSchoolDocumentHtml(option)}</li>`).join('')}</ol>` : '<div style="height:18mm;border-bottom:1px solid #cbd5e1"></div>'}
        ${question.image_url ? `<img src="${escapeSchoolDocumentHtml(question.image_url)}" alt="${escapeSchoolDocumentHtml(question.image_alt_text || `Question ${index + 1} diagram`)}" style="display:block;max-width:100%;max-height:70mm;margin:3mm auto;object-fit:contain">` : ''}
        ${includeAnswers ? `<div class="document-callout"><strong>Answer</strong><p>${escapeSchoolDocumentHtml(question.correct_answer)}</p>${question.explanation ? `<p>${escapeSchoolDocumentHtml(question.explanation)}</p>` : ''}</div>` : ''}
      </section>`;
    }).join('');
    try {
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId(includeAnswers ? 'answer' : 'question'),
          templateVersion: includeAnswers ? 'teacher-answer-key-v1' : 'student-question-paper-v1',
          title: includeAnswers ? `${group.topic} — Answer Key` : `${group.topic} — Question Paper`,
          subtitle: `${group.count ?? group.questions.length} question${group.questions.length === 1 ? '' : 's'} · ${group.subject}`,
          schoolName,
          schoolLogoUrl,
          audience: includeAnswers ? 'teacher' : 'student',
          status: 'final',
          confidentiality: includeAnswers ? 'confidential' : 'school-use',
          generatedAt: new Date().toISOString(),
          generatedBy: teacherName,
          subject: group.subject,
          schoolId,
          sourceType: 'question_topic',
          sourceId: group.key,
        },
        bodyHtml: `${includeAnswers ? '<div class="document-callout document-callout--private"><strong>Teacher-only answer key</strong><p>Do not distribute this copy to students before the assessment.</p></div>' : '<div class="document-grid"><div class="document-card"><strong>Student name</strong><p>________________________________</p></div><div class="document-card"><strong>Class / date</strong><p>________________________________</p></div></div>'}${questionRows}`,
        orientation: 'portrait',
        inkSaver: true,
        fileName: schoolDocumentFileName(schoolName, group.subject, group.topic, includeAnswers ? 'Answer_Key' : 'Question_Paper'),
      }, reservedWindow);
    } catch (error) {
      brainsAlert(error instanceof Error ? error.message : 'Unable to open the printable question set.', 'info');
    }
  };

  const printCompleteTopic = (group: TopicGroup, includeAnswers: boolean) => {
    // Reserve the tab during the click, before any asynchronous question loading.
    const reserved = window.open('', '_blank');
    if (reserved) {
      reserved.opener = null;
      reserved.document.body.innerHTML = '<p id="question-set-loading">Preparing your complete question paper…</p>';
    }
    void completeTopic(group, (complete) => printTopic(complete, includeAnswers, reserved)).finally(() => {
      if (reserved && !reserved.closed && reserved.document.getElementById('question-set-loading')) reserved.close();
    });
  };

  const reviewCountForGroup = (group: TopicGroup) => group.questions.filter((question) => question.verification_status === 'in_review').length;
  const selectedTopicHasSubmittedQuestions = (selectedTopic?.reviewCount || 0) > 0 || selectedTopic?.questions.some((question) => question.verification_status === 'in_review') || false;

  return (
    <section className="qb-shell" aria-labelledby="question-bank-title">
      <header className="qb-header">
        <div><span className="qb-eyebrow">Question workspace</span><h1 id="question-bank-title">Question Bank</h1><p>Use Brains Heist evidence, your school&apos;s verified curriculum pool, or your private teacher workspace.</p></div>
        <div className="flex flex-wrap gap-2">
          {onCreateQuestion ? <button type="button" className="qb-primary-action" onClick={() => { choosePool('mine'); onCreateQuestion(); }}>Add Question</button> : null}
          {onCreateQuestionBatch ? <button type="button" onClick={() => { choosePool('mine'); onCreateQuestionBatch(); }}>Add Question Batch</button> : null}
        </div>
      </header>

      <div className="qb-pool-switcher" aria-label="Question pools">
        <button type="button" className={activePool === 'brains-heist' ? 'qb-pool-card is-active' : 'qb-pool-card'} onClick={() => choosePool('brains-heist')} aria-pressed={activePool === 'brains-heist'}>
          <span className="qb-pool-icon">BH</span><span><strong>Brains Heist Verified</strong><small>Global · official Academic Profile evidence</small></span><b>{poolCount('brains-heist')}</b>
        </button>
        <button type="button" className={activePool === 'school' ? 'qb-pool-card is-active is-school' : 'qb-pool-card is-school'} onClick={() => choosePool('school')} aria-pressed={activePool === 'school'}>
          <span className="qb-pool-icon qb-pool-icon--school">SC</span><span><strong>{schoolName} Verified</strong><small>This school only · official Academic Profile evidence</small></span><b>{poolCount('school')}</b>
        </button>
        <button type="button" className={activePool === 'mine' ? 'qb-pool-card is-active' : 'qb-pool-card'} onClick={() => choosePool('mine')} aria-pressed={activePool === 'mine'}>
          <span className="qb-pool-icon qb-pool-icon--mine">MY</span><span><strong>My Pool</strong><small>Private classroom questions · governed</small></span><b>{poolCount('mine')}</b>
        </button>
      </div>

      <div className="qb-access-note" data-pool={activePool}>
        <strong>{activePool === 'brains-heist' ? 'Global verified evidence' : activePool === 'school' ? `${schoolName} verified evidence` : 'Teacher-owned classroom workspace'}</strong>
        <span>{activePool === 'brains-heist' ? 'Available only where the question exactly matches your school curriculum.' : activePool === 'school' ? 'Human-approved for this school, read-only, and accepted in the official Academic Profile.' : 'Private to you. These questions never affect official Academic Profile analytics unless governance approves them for your school.'}</span>
      </div>

      <div className="qb-toolbar">
        <label><span className="sr-only">Search questions</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={`Search ${selectedPoolTitle.toLowerCase()}…`} /></label>
        <label><span>Subject</span><select value={effectiveSubject} onChange={(event) => setSubjectFilter(event.target.value)} disabled={!subjects.length}>{subjects.length ? subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>) : <option value="">No subjects available</option>}</select></label>
      </div>

      <div className="qb-results-heading">
        <div><h2>{selectedPoolTitle}</h2><p>{topicGroups.length} topic{topicGroups.length === 1 ? '' : 's'} · {remote ? topicGroups.reduce((sum, group) => sum + (group.count || 0), 0) : visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'}</p></div>
        {activePool === 'mine' ? <div className="flex flex-wrap gap-2">{onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion()}>Add Question</button> : null}{onCreateQuestionBatch ? <button type="button" onClick={() => onCreateQuestionBatch()}>Upload question PDF</button> : null}</div> : null}
      </div>

      {facetsError ? <div className="qb-empty" role="alert">{facetsError}</div> : facetsLoading ? <div className="qb-empty" role="status">Loading your question topics…</div> : topicGroups.length ? (
        <div className="qb-topic-grid">
          {topicGroups.map((group) => (
            <button type="button" key={group.key} className="qb-topic-card" onClick={() => { ++topicRequest.current; setActionLoading(false); setSelectedTopic(group); setTopicName(group.topic); }}>
              <span className="qb-topic-card__subject">{group.subject}</span>
              <span className="qb-topic-card__icon">{isOfficialPool ? '▣' : '□'}</span>
              <strong>{group.topic}</strong>
              <small>{group.count ?? group.questions.length} question{group.questions.length === 1 ? '' : 's'}</small>
              <span className="qb-topic-card__status">{isOfficialPool ? activePool === 'school' ? 'School verified · read-only' : 'Global verified · read-only' : reviewCountForGroup(group) ? `${reviewCountForGroup(group)} in review` : 'Managed by you'}</span>
              <span className="qb-topic-card__open">Open topic →</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="qb-empty"><h3>{activePool === 'mine' ? 'Create your first question' : 'No questions match these filters'}</h3><p>{activePool === 'mine' ? 'Add one question manually or upload a PDF to build a reviewed batch.' : 'Try another subject or a broader search.'}</p>{activePool === 'mine' ? <div className="flex flex-wrap justify-center gap-2">{onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion()}>Add Question</button> : null}{onCreateQuestionBatch ? <button type="button" onClick={() => onCreateQuestionBatch()}>Add Question Batch</button> : null}</div> : null}</div>
      )}

      {selectedTopic ? (
        <div className="qb-modal" role="dialog" aria-modal="true" aria-labelledby="qb-topic-title" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTopic(null)}>
          <article className="qb-modal__card">
            <header>
              <div><span>{selectedTopic.subject} · {selectedPoolTitle}</span><h2 id="qb-topic-title">{selectedTopic.topic}</h2><p>{selectedTopic.count ?? selectedTopic.questions.length} question{selectedTopic.questions.length === 1 ? '' : 's'}</p></div>
              <div className="qb-modal__header-actions">
                <button type="button" disabled={actionLoading} onClick={() => { printCompleteTopic(selectedTopic, false); }}>Print paper</button>
                <button type="button" disabled={actionLoading} onClick={() => { printCompleteTopic(selectedTopic, true); }}>Answer key</button>
                <button type="button" className="qb-modal__assign" disabled={actionLoading} onClick={() => { void completeTopic(selectedTopic, (group) => onUseSet(group.questions.map((question) => question.id), group.subject, group.topic, group.questions)); }}>{useActionLabel === 'Host' ? 'Use questions' : useActionLabel}</button>
                <button type="button" className="qb-modal__close" onClick={() => { ++topicRequest.current; setActionLoading(false); setSelectedTopic(null); }} aria-label="Close topic">×</button>
              </div>
            </header>
            {activePool === 'mine' && renaming ? (
              <div className="qb-topic-editor"><label>Topic name<input value={topicName} onChange={(event) => setTopicName(event.target.value)} /></label><button type="button" onClick={() => { if (topicName.trim()) void completeTopic(selectedTopic, (group) => onRenameTopic?.(group.questions, topicName.trim())); setRenaming(false); setSelectedTopic(null); }}>Save name</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button></div>
            ) : null}
            <div className="qb-modal__questions">
              {browser.error ? <div role="alert">{browser.error}<button type="button" onClick={browser.retry}>Retry</button></div> : null}
              {browser.loading || actionLoading ? <p role="status">Loading questions…</p> : null}
              {shownTopic!.questions.map((question, index) => (
                <article key={question.id}>
                  <span>{index + 1}</span>
                  <div>{questionPurposeLabel(question) ? <small>{questionPurposeLabel(question)}</small> : null}<h3>{question.question_text}</h3><p>{formatQuestionType(question.question_type)} · {question.difficulty} · {question.points || 0} points</p>{isOfficialPool ? <>{question.registry_mappings?.length ? <><p><strong>{activePool === 'school' ? 'School Verified' : 'Verified'}: {question.registry_mappings[0].skill}</strong>{` · ${question.registry_mappings[0].subskill}`}{question.eligible_grade_levels?.length ? ` · Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p><small>Evidence focus: {question.registry_mappings[0].evidenceFocus}</small></> : <p><strong>Canonical mapping unavailable</strong>{question.eligible_grade_levels?.length ? ` · Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p>}{question.curriculum_objective ? <small>Curriculum objective: {question.curriculum_objective}</small> : null}</> : <><p><strong>{question.verification_status === 'in_review' ? 'Awaiting platform review' : 'Classroom only'}</strong>{question.eligible_grade_levels?.length ? ` · Suggested Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p><small>{question.verification_status === 'in_review' ? 'The submitted snapshot is locked while governance checks the content and proposed mapping.' : 'Excluded from official Academic Profile analytics'}</small></>}</div>
                  <div><button type="button" onClick={() => setPreviewQuestion(question)}>Preview</button>{activePool === 'mine' && question.verification_status !== 'in_review' && onEditQuestion ? <button type="button" onClick={() => onEditQuestion(question)}>Edit</button> : null}{activePool === 'mine' && question.verification_status !== 'in_review' && onDeleteQuestion ? <button type="button" className="is-danger" onClick={() => onDeleteQuestion(question.id)}>Delete</button> : null}</div>
                </article>
              ))}
            </div>
            <footer>
              {remote && browser.hasMore ? <button type="button" disabled={browser.loading} onClick={() => { void browser.loadMore(); }}>Load more questions</button> : null}
              {activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion(selectedTopic.subject, selectedTopic.topic)}>Add question to this topic</button> : null}
              {activePool === 'mine' && onCreateQuestionBatch ? <button type="button" onClick={() => onCreateQuestionBatch(selectedTopic.subject, selectedTopic.topic)}>Upload PDF to this topic</button> : null}
              {activePool === 'mine' && !selectedTopicHasSubmittedQuestions && onRenameTopic ? <button type="button" className="is-secondary" onClick={() => setRenaming(true)}>Rename topic</button> : null}
              {activePool === 'mine' && !selectedTopicHasSubmittedQuestions && onDeleteTopic ? <button type="button" className="is-danger" onClick={() => void completeTopic(selectedTopic, (group) => onDeleteTopic(group.questions))}>Delete topic</button> : null}
            </footer>
          </article>
        </div>
      ) : null}
      {previewQuestion ? <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} onEdit={activePool === 'mine' && previewQuestion.verification_status !== 'in_review' && onEditQuestion ? () => onEditQuestion(previewQuestion) : undefined} /> : null}
    </section>
  );
}
