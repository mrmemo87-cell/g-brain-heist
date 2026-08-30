import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Subject, Teacher, TeacherQuestion } from '../../types';
import QuestionPreviewModal from './QuestionPreviewModal';
import { isBrainsHeistPoolQuestion, isMyPoolQuestion, isSchoolPoolQuestion } from './questionPool.js';
import './QuestionBank.css';
import { brainsAlert } from '../../src/utils/brainsAlert';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../../src/lib/schoolDocument';

interface QuestionBankProps {
  questions: TeacherQuestion[];
  teacher: Teacher | null;
  onUseSet: (questionIds: string[], subject: Subject, topic: string) => void;
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
interface TopicGroup { key: string; subject: Subject; topic: string; questions: TeacherQuestion[] }
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
}: QuestionBankProps) {
  const [activePool, setActivePool] = useState<PoolKey>('brains-heist');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicGroup | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<TeacherQuestion | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [topicName, setTopicName] = useState('');
  const initialPoolResolvedRef = useRef(false);

  const permittedQuestions = useMemo(() => {
    if (!restrictedSubjects?.length) return questions;
    const permitted = new Set(restrictedSubjects.map(normalizeSubject));
    return questions.filter((question) => permitted.has(normalizeSubject(question.subject)));
  }, [questions, restrictedSubjects]);

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
    () => [...new Set(poolQuestions.map((question) => question.subject))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),
    [poolQuestions],
  );
  const effectiveSubject = subjects.includes(subjectFilter as Subject) ? subjectFilter : subjects[0] || '';
  const visibleQuestions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return poolQuestions.filter((question) => {
      if (!effectiveSubject || question.subject !== effectiveSubject) return false;
      return !search || [question.question_text, question.correct_answer, question.subject, getTopic(question), ...(question.tags || [])].join(' ').toLowerCase().includes(search);
    });
  }, [effectiveSubject, poolQuestions, searchTerm]);
  const topicGroups = useMemo(() => makeTopicGroups(visibleQuestions), [visibleQuestions]);
  const selectedPoolTitle = activePool === 'brains-heist'
    ? 'Brains Heist Verified'
    : activePool === 'school'
      ? `${schoolName} Verified`
      : 'My Pool';
  const isOfficialPool = activePool !== 'mine';

  const choosePool = (pool: PoolKey) => {
    setActivePool(pool);
    setSubjectFilter('');
    setSelectedTopic(null);
  };

  const printTopic = (group: TopicGroup, includeAnswers: boolean) => {
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
          subtitle: `${group.questions.length} question${group.questions.length === 1 ? '' : 's'} · ${group.subject}`,
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
      });
    } catch (error) {
      brainsAlert(error instanceof Error ? error.message : 'Unable to open the printable question set.', 'info');
    }
  };

  const reviewCountForGroup = (group: TopicGroup) => group.questions.filter((question) => question.verification_status === 'in_review').length;
  const selectedTopicHasSubmittedQuestions = selectedTopic?.questions.some((question) => question.verification_status === 'in_review') || false;

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
          <span className="qb-pool-icon">BH</span><span><strong>Brains Heist Verified</strong><small>Global · official Academic Profile evidence</small></span><b>{pools['brains-heist'].length}</b>
        </button>
        <button type="button" className={activePool === 'school' ? 'qb-pool-card is-active is-school' : 'qb-pool-card is-school'} onClick={() => choosePool('school')} aria-pressed={activePool === 'school'}>
          <span className="qb-pool-icon qb-pool-icon--school">SC</span><span><strong>{schoolName} Verified</strong><small>This school only · official Academic Profile evidence</small></span><b>{pools.school.length}</b>
        </button>
        <button type="button" className={activePool === 'mine' ? 'qb-pool-card is-active' : 'qb-pool-card'} onClick={() => choosePool('mine')} aria-pressed={activePool === 'mine'}>
          <span className="qb-pool-icon qb-pool-icon--mine">MY</span><span><strong>My Pool</strong><small>Private classroom questions · governed</small></span><b>{pools.mine.length}</b>
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
        <div><h2>{selectedPoolTitle}</h2><p>{topicGroups.length} topic{topicGroups.length === 1 ? '' : 's'} · {visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'}</p></div>
        {activePool === 'mine' ? <div className="flex flex-wrap gap-2">{onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion()}>Add Question</button> : null}{onCreateQuestionBatch ? <button type="button" onClick={() => onCreateQuestionBatch()}>Upload question PDF</button> : null}</div> : null}
      </div>

      {topicGroups.length ? (
        <div className="qb-topic-grid">
          {topicGroups.map((group) => (
            <button type="button" key={group.key} className="qb-topic-card" onClick={() => { setSelectedTopic(group); setTopicName(group.topic); }}>
              <span className="qb-topic-card__subject">{group.subject}</span>
              <span className="qb-topic-card__icon">{isOfficialPool ? '▣' : '□'}</span>
              <strong>{group.topic}</strong>
              <small>{group.questions.length} question{group.questions.length === 1 ? '' : 's'}</small>
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
              <div><span>{selectedTopic.subject} · {selectedPoolTitle}</span><h2 id="qb-topic-title">{selectedTopic.topic}</h2><p>{selectedTopic.questions.length} question{selectedTopic.questions.length === 1 ? '' : 's'}</p></div>
              <div className="qb-modal__header-actions">
                <button type="button" onClick={() => printTopic(selectedTopic, false)}>Print paper</button>
                <button type="button" onClick={() => printTopic(selectedTopic, true)}>Answer key</button>
                <button type="button" className="qb-modal__assign" onClick={() => onUseSet(selectedTopic.questions.map((question) => question.id), selectedTopic.subject, selectedTopic.topic)}>{useActionLabel === 'Host' ? 'Use questions' : useActionLabel}</button>
                <button type="button" className="qb-modal__close" onClick={() => setSelectedTopic(null)} aria-label="Close topic">×</button>
              </div>
            </header>
            {activePool === 'mine' && renaming ? (
              <div className="qb-topic-editor"><label>Topic name<input value={topicName} onChange={(event) => setTopicName(event.target.value)} /></label><button type="button" onClick={() => { if (topicName.trim()) onRenameTopic?.(selectedTopic.questions, topicName.trim()); setRenaming(false); setSelectedTopic(null); }}>Save name</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button></div>
            ) : null}
            <div className="qb-modal__questions">
              {selectedTopic.questions.map((question, index) => (
                <article key={question.id}>
                  <span>{index + 1}</span>
                  <div><h3>{question.question_text}</h3><p>{formatQuestionType(question.question_type)} · {question.difficulty} · {question.points || 0} points</p>{isOfficialPool ? <>{question.curriculum_skill ? <p><strong>{activePool === 'school' ? 'School Verified' : 'Verified'}: {question.curriculum_skill}</strong>{question.curriculum_subskill ? ` · ${question.curriculum_subskill}` : ''}{question.eligible_grade_levels?.length ? ` · Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p> : null}{question.curriculum_objective ? <small>Official objective: {question.curriculum_objective}</small> : null}</> : <><p><strong>{question.verification_status === 'in_review' ? 'Awaiting platform review' : 'Classroom only'}</strong>{question.eligible_grade_levels?.length ? ` · Suggested Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p><small>{question.verification_status === 'in_review' ? 'The submitted snapshot is locked while governance checks the content and proposed mapping.' : 'Excluded from official Academic Profile analytics'}</small></>}</div>
                  <div><button type="button" onClick={() => setPreviewQuestion(question)}>Preview</button>{activePool === 'mine' && question.verification_status !== 'in_review' && onEditQuestion ? <button type="button" onClick={() => onEditQuestion(question)}>Edit</button> : null}{activePool === 'mine' && question.verification_status !== 'in_review' && onDeleteQuestion ? <button type="button" className="is-danger" onClick={() => onDeleteQuestion(question.id)}>Delete</button> : null}</div>
                </article>
              ))}
            </div>
            <footer>
              {activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion(selectedTopic.subject, selectedTopic.topic)}>Add question to this topic</button> : null}
              {activePool === 'mine' && onCreateQuestionBatch ? <button type="button" onClick={() => onCreateQuestionBatch(selectedTopic.subject, selectedTopic.topic)}>Upload PDF to this topic</button> : null}
              {activePool === 'mine' && !selectedTopicHasSubmittedQuestions && onRenameTopic ? <button type="button" className="is-secondary" onClick={() => setRenaming(true)}>Rename topic</button> : null}
              {activePool === 'mine' && !selectedTopicHasSubmittedQuestions && onDeleteTopic ? <button type="button" className="is-danger" onClick={() => onDeleteTopic(selectedTopic.questions)}>Delete topic</button> : null}
            </footer>
          </article>
        </div>
      ) : null}
      {previewQuestion ? <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} onEdit={activePool === 'mine' && previewQuestion.verification_status !== 'in_review' && onEditQuestion ? () => onEditQuestion(previewQuestion) : undefined} /> : null}
    </section>
  );
}
