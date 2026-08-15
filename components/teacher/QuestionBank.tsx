import React, { useMemo, useState } from 'react';
import type { Subject, Teacher, TeacherQuestion } from '../../types';
import QuestionPreviewModal from './QuestionPreviewModal';
import { isBrainsHeistPoolQuestion, isMyPoolQuestion } from './questionPool.js';
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
  onBulkImport?: () => void;
  onRenameTopic?: (questions: TeacherQuestion[], nextTopic: string) => void;
  onDeleteTopic?: (questions: TeacherQuestion[]) => void;
  useActionLabel?: string;
  restrictedSubjects?: string[];
  schoolName?: string;
  schoolLogoUrl?: string | null;
  teacherName?: string;
  schoolId?: string | null;
}

type PoolKey = 'brains-heist' | 'mine';
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
  questions, teacher, onUseSet, onEditQuestion, onDeleteQuestion, onCreateQuestion, onBulkImport,
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

  const permittedQuestions = useMemo(() => {
    if (!restrictedSubjects?.length) return questions;
    const permitted = new Set(restrictedSubjects.map(normalizeSubject));
    return questions.filter((question) => permitted.has(normalizeSubject(question.subject)));
  }, [questions, restrictedSubjects]);

  const pools = useMemo(() => ({
    'brains-heist': permittedQuestions.filter((question) => isBrainsHeistPoolQuestion(question, teacher?.id)),
    mine: permittedQuestions.filter((question) => isMyPoolQuestion(question, teacher?.id)),
  }), [permittedQuestions, teacher]);

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
  const selectedPoolTitle = activePool === 'brains-heist' ? 'Brains Heist Verified' : 'My Pool';

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

  return (
    <section className="qb-shell" aria-labelledby="question-bank-title">
      <header className="qb-header">
        <div><span className="qb-eyebrow">Question workspace</span><h1 id="question-bank-title">Question Bank</h1><p>Use verified academic evidence or build private classroom material in My Pool.</p></div>
        <div className="flex flex-wrap gap-2">{onBulkImport ? <button type="button" onClick={() => { choosePool('mine'); onBulkImport(); }}>Bulk import</button> : null}{onCreateQuestion ? <button type="button" className="qb-primary-action" onClick={() => { choosePool('mine'); onCreateQuestion(); }}>Add to My Pool</button> : null}</div>
      </header>

      <div className="qb-pool-switcher" aria-label="Question pools">
        <button type="button" className={activePool === 'brains-heist' ? 'qb-pool-card is-active' : 'qb-pool-card'} onClick={() => choosePool('brains-heist')} aria-pressed={activePool === 'brains-heist'}>
          <span className="qb-pool-icon">BH</span><span><strong>Brains Heist Verified</strong><small>Official Academic Profile evidence · read-only</small></span><b>{pools['brains-heist'].length}</b>
        </button>
        <button type="button" className={activePool === 'mine' ? 'qb-pool-card is-active' : 'qb-pool-card'} onClick={() => choosePool('mine')} aria-pressed={activePool === 'mine'}>
          <span className="qb-pool-icon qb-pool-icon--mine">MY</span><span><strong>My Pool</strong><small>Private classroom questions · editable</small></span><b>{pools.mine.length}</b>
        </button>
      </div>

      <div className="qb-access-note" data-pool={activePool}>
        <strong>{activePool === 'brains-heist' ? 'Brains Heist Verified evidence' : 'Teacher-owned classroom workspace'}</strong>
        <span>{activePool === 'brains-heist' ? 'These questions are professionally mapped, protected, and accepted in the official Academic Profile.' : 'Use these in assignments and classroom reports. They never affect official Academic Profile analytics.'}</span>
      </div>

      <div className="qb-toolbar">
        <label><span className="sr-only">Search questions</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={`Search ${selectedPoolTitle.toLowerCase()}…`} /></label>
        <label><span>Subject</span><select value={effectiveSubject} onChange={(event) => setSubjectFilter(event.target.value)} disabled={!subjects.length}>{subjects.length ? subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>) : <option value="">No subjects available</option>}</select></label>
      </div>

      <div className="qb-results-heading">
        <div><h2>{selectedPoolTitle}</h2><p>{topicGroups.length} topic{topicGroups.length === 1 ? '' : 's'} · {visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'}</p></div>
        {activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion()}>Create topic or question</button> : null}
      </div>

      {topicGroups.length ? (
        <div className="qb-topic-grid">
          {topicGroups.map((group) => (
            <button type="button" key={group.key} className="qb-topic-card" onClick={() => { setSelectedTopic(group); setTopicName(group.topic); }}>
              <span className="qb-topic-card__subject">{group.subject}</span>
              <span className="qb-topic-card__icon">{activePool === 'brains-heist' ? '▣' : '□'}</span>
              <strong>{group.topic}</strong>
              <small>{group.questions.length} question{group.questions.length === 1 ? '' : 's'}</small>
              <span className="qb-topic-card__status">{activePool === 'brains-heist' ? 'Read-only' : 'Managed by you'}</span>
              <span className="qb-topic-card__open">Open topic →</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="qb-empty"><h3>{activePool === 'mine' ? 'Create your first topic' : 'No questions match these filters'}</h3><p>{activePool === 'mine' ? 'A topic is created automatically when you save its first question.' : 'Try another subject or a broader search.'}</p>{activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion()}>Add first question</button> : null}</div>
      )}

      {selectedTopic ? (
        <div className="qb-modal" role="dialog" aria-modal="true" aria-labelledby="qb-topic-title" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTopic(null)}>
          <article className="qb-modal__card">
            <header>
              <div><span>{selectedTopic.subject} · {activePool === 'brains-heist' ? 'Brains Heist Verified' : 'My Pool'}</span><h2 id="qb-topic-title">{selectedTopic.topic}</h2><p>{selectedTopic.questions.length} question{selectedTopic.questions.length === 1 ? '' : 's'}</p></div>
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
                  <div><h3>{question.question_text}</h3><p>{formatQuestionType(question.question_type)} · {question.difficulty} · {question.points || 0} points</p>{activePool === 'brains-heist' ? <>{question.curriculum_skill ? <p><strong>Verified: {question.curriculum_skill}</strong>{question.curriculum_subskill ? ` · ${question.curriculum_subskill}` : ''}{question.eligible_grade_levels?.length ? ` · Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p> : null}{question.curriculum_objective ? <small>Official objective: {question.curriculum_objective}</small> : null}</> : <><p><strong>Classroom only</strong>{question.eligible_grade_levels?.length ? ` · Suggested Grades ${question.eligible_grade_levels.join(', ')}` : ''}</p><small>Excluded from official Academic Profile analytics</small></>}</div>
                  <div><button type="button" onClick={() => setPreviewQuestion(question)}>Preview</button>{activePool === 'mine' && onEditQuestion ? <button type="button" onClick={() => onEditQuestion(question)}>Edit</button> : null}{activePool === 'mine' && onDeleteQuestion ? <button type="button" className="is-danger" onClick={() => onDeleteQuestion(question.id)}>Delete</button> : null}</div>
                </article>
              ))}
            </div>
            <footer>
              {activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={() => onCreateQuestion(selectedTopic.subject, selectedTopic.topic)}>Add question to topic</button> : null}
              {activePool === 'mine' && onRenameTopic ? <button type="button" className="is-secondary" onClick={() => setRenaming(true)}>Rename topic</button> : null}
              {activePool === 'mine' && onDeleteTopic ? <button type="button" className="is-danger" onClick={() => onDeleteTopic(selectedTopic.questions)}>Delete topic</button> : null}
            </footer>
          </article>
        </div>
      ) : null}
      {previewQuestion ? <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} onEdit={activePool === 'mine' && onEditQuestion ? () => onEditQuestion(previewQuestion) : undefined} /> : null}
    </section>
  );
}
