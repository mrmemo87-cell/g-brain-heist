import React, { useMemo, useState } from 'react';
import type { Subject, Teacher, TeacherQuestion } from '../../types';
import './QuestionBank.css';

interface QuestionBankProps {
  questions: TeacherQuestion[];
  teacher: Teacher | null;
  onUseSet: (questionIds: string[], subject: Subject, topic: string) => void;
  onEditQuestion?: (question: TeacherQuestion) => void;
  onDeleteQuestion?: (questionId: string) => void;
  onCreateQuestion?: () => void;
  useActionLabel?: string;
  restrictedSubjects?: string[];
}

type PoolKey = 'brains-heist' | 'mine';

interface TopicGroup {
  key: string;
  subject: Subject;
  topic: string;
  questions: TeacherQuestion[];
}

const getTopic = (question: TeacherQuestion) => question.topic_name || question.topic || 'General';

const formatQuestionType = (value: TeacherQuestion['question_type']) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const makeTopicGroups = (questions: TeacherQuestion[]): TopicGroup[] => {
  const groups = new Map<string, TopicGroup>();
  questions.forEach((question) => {
    const topic = getTopic(question);
    const key = `${question.subject}::${topic}`;
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
      return;
    }
    groups.set(key, { key, subject: question.subject, topic, questions: [question] });
  });
  return [...groups.values()].sort((a, b) =>
    a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic),
  );
};

const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  teacher,
  onUseSet,
  onEditQuestion,
  onDeleteQuestion,
  onCreateQuestion,
  useActionLabel = 'Use questions',
  restrictedSubjects,
}) => {
  const [activePool, setActivePool] = useState<PoolKey>('brains-heist');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  const permittedQuestions = useMemo(() => {
    if (restrictedSubjects === undefined) return questions;
    if (restrictedSubjects.length === 0) return [];
    return questions.filter((question) => restrictedSubjects.includes(question.subject));
  }, [questions, restrictedSubjects]);

  const pools = useMemo(() => {
    const mine = permittedQuestions.filter((question) => teacher && question.teacher_id === teacher.id);
    const myIds = new Set(mine.map((question) => question.id));
    const official = permittedQuestions.filter((question) => !myIds.has(question.id));
    return {
      'brains-heist': official,
      mine,
    };
  }, [permittedQuestions, teacher]);

  const subjects = useMemo(
    () => [...new Set(permittedQuestions.map((question) => question.subject))].sort(),
    [permittedQuestions],
  );

  const visibleQuestions = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase();
    return pools[activePool].filter((question) => {
      if (subjectFilter !== 'all' && question.subject !== subjectFilter) return false;
      if (!search) return true;
      return [
        question.question_text,
        question.correct_answer,
        question.subject,
        getTopic(question),
        ...(question.tags || []),
      ].join(' ').toLocaleLowerCase().includes(search);
    });
  }, [activePool, pools, searchTerm, subjectFilter]);

  const topicGroups = useMemo(() => makeTopicGroups(visibleQuestions), [visibleQuestions]);
  const selectedPoolTitle = activePool === 'brains-heist' ? 'Brains Heist Pool' : 'My Pool';

  return (
    <section className="qb-shell" aria-labelledby="question-bank-title">
      <header className="qb-header">
        <div>
          <span className="qb-eyebrow">Curriculum workspace</span>
          <h1 id="question-bank-title">Question Bank</h1>
          <p>Find approved questions or organise your own questions by subject and topic.</p>
        </div>
        {onCreateQuestion ? (
          <button type="button" className="qb-primary-action" onClick={onCreateQuestion}>
            Add question
          </button>
        ) : null}
      </header>

      <div className="qb-pool-switcher" aria-label="Question pools">
        <button
          type="button"
          className={activePool === 'brains-heist' ? 'qb-pool-card is-active' : 'qb-pool-card'}
          onClick={() => setActivePool('brains-heist')}
          aria-pressed={activePool === 'brains-heist'}
        >
          <span className="qb-pool-icon" aria-hidden="true">BH</span>
          <span>
            <strong>Brains Heist Pool</strong>
            <small>School-ready questions available to your subjects</small>
          </span>
          <b>{pools['brains-heist'].length}</b>
        </button>
        <button
          type="button"
          className={activePool === 'mine' ? 'qb-pool-card is-active' : 'qb-pool-card'}
          onClick={() => setActivePool('mine')}
          aria-pressed={activePool === 'mine'}
        >
          <span className="qb-pool-icon qb-pool-icon--mine" aria-hidden="true">MY</span>
          <span>
            <strong>My Pool</strong>
            <small>Questions created and managed by you</small>
          </span>
          <b>{pools.mine.length}</b>
        </button>
      </div>

      <div className="qb-toolbar">
        <label>
          <span className="sr-only">Search questions</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={`Search ${selectedPoolTitle.toLowerCase()}…`}
          />
        </label>
        <label>
          <span>Subject</span>
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="all">All assigned subjects</option>
            {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
        </label>
      </div>

      <div className="qb-results-heading">
        <div>
          <h2>{selectedPoolTitle}</h2>
          <p>{topicGroups.length} topic{topicGroups.length === 1 ? '' : 's'} · {visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'}</p>
        </div>
        {activePool === 'mine' && onCreateQuestion ? (
          <button type="button" onClick={onCreateQuestion}>Create a question</button>
        ) : null}
      </div>

      {topicGroups.length ? (
        <div className="qb-topic-grid">
          {topicGroups.map((group) => (
            <article key={group.key} className="qb-topic-card">
              <header>
                <div>
                  <span>{group.subject}</span>
                  <h3>{group.topic}</h3>
                </div>
                <b>{group.questions.length}</b>
              </header>
              <div className="qb-question-list">
                {group.questions.map((question, index) => (
                  <div className="qb-question-row" key={question.id}>
                    <span className="qb-question-number">{index + 1}</span>
                    <div>
                      <p>{question.question_text}</p>
                      <div className="qb-question-meta">
                        <span>{formatQuestionType(question.question_type)}</span>
                        <span>{question.difficulty}</span>
                        <span>{question.points || 0} points</span>
                      </div>
                    </div>
                    {activePool === 'mine' && (onEditQuestion || onDeleteQuestion) ? (
                      <div className="qb-row-actions">
                        {onEditQuestion ? <button type="button" onClick={() => onEditQuestion(question)}>Edit</button> : null}
                        {onDeleteQuestion ? <button type="button" className="is-danger" onClick={() => onDeleteQuestion(question.id)}>Delete</button> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <footer>
                <span>{group.questions.length} question{group.questions.length === 1 ? '' : 's'} in this topic</span>
                <button
                  type="button"
                  onClick={() => onUseSet(group.questions.map((question) => question.id), group.subject, group.topic)}
                >
                  {useActionLabel === 'Host' ? 'Use questions' : useActionLabel}
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="qb-empty">
          <h3>{activePool === 'mine' ? 'Your pool is ready for its first question' : 'No questions match these filters'}</h3>
          <p>{activePool === 'mine' ? 'Create a question and it will be organised here by subject and topic.' : 'Try another subject or a broader search.'}</p>
          {activePool === 'mine' && onCreateQuestion ? <button type="button" onClick={onCreateQuestion}>Add question</button> : null}
        </div>
      )}
    </section>
  );
};

export default QuestionBank;
