import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionDifficulty, QuestionType, StudentForAssignment, Subject, TeacherQuestion } from '../../types';
import type { TeacherAssignedClass } from '../../services/schoolAdminService';
import { brainsAlert, brainsConfirm } from '../../src/utils/brainsAlert';
import QuestionPreviewModal from './QuestionPreviewModal';
import './AssignmentWizard.css';

type AssignmentMode = 'batch' | 'custom';
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type XpFilter = 'all' | 'low' | 'medium' | 'high';
type QuestionSort = 'recommended' | 'xp-high' | 'xp-low' | 'time-short' | 'difficulty';
type QuestionPool = 'all' | 'brains-heist' | 'mine';

interface AssignmentWizardProps {
  assignmentMode: AssignmentMode;
  setAssignmentMode: (mode: AssignmentMode) => void;
  assignmentBatches: string[];
  setAssignmentBatches: React.Dispatch<React.SetStateAction<string[]>>;
  assignmentSubject: Subject;
  setAssignmentSubject: (subject: Subject) => void;
  assignmentTitle: string;
  setAssignmentTitle: (value: string) => void;
  assignmentDescription: string;
  setAssignmentDescription: (value: string) => void;
  assignmentInstructions: string;
  setAssignmentInstructions: (value: string) => void;
  assignmentQuestionIds: string[];
  setAssignmentQuestionIds: React.Dispatch<React.SetStateAction<string[]>>;
  assignmentDueAt: string;
  setAssignmentDueAt: (value: string) => void;
  assignmentDifficulty: QuestionDifficulty;
  setAssignmentDifficulty: (value: QuestionDifficulty) => void;
  assignmentTopicMode: 'general' | 'custom';
  setAssignmentTopicMode: (value: 'general' | 'custom') => void;
  assignmentTopicName: string;
  setAssignmentTopicName: (value: string) => void;
  assignmentSubmitting: boolean;
  availableStudents: StudentForAssignment[];
  selectedStudentIds: string[];
  setSelectedStudentIds: React.Dispatch<React.SetStateAction<string[]>>;
  assignedClasses: TeacherAssignedClass[];
  teacherAssignedSubjects: string[];
  teacherId?: string;
  questions: TeacherQuestion[];
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onCancel: () => void;
}

const STEPS = [
  { id: 1, short: 'Subject', question: 'What subject?', helper: 'Choose the curriculum subject this assignment belongs to.' },
  { id: 2, short: 'Audience', question: 'Who is this for?', helper: 'Select the classes or individual students who should receive it.' },
  { id: 3, short: 'Questions', question: 'Which questions?', helper: 'Filter the question bank, then move the questions you want into the assignment.' },
  { id: 4, short: 'Details', question: 'Add Title and Description', helper: 'Give students a clear title, learning goal, and instructions.' },
  { id: 5, short: 'Due date', question: 'When is it due?', helper: 'Choose when the assignment closes for students.' },
  { id: 6, short: 'Review', question: 'Is everything correct?', helper: 'Check the audience, questions, timing, and details before publishing.' },
] as const;

const normalizeQuestionText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[⁄∕／]/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

const normalizeSubject = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (['math', 'maths', 'mathematics'].includes(normalized)) return 'maths';
  if (normalized === 'english language') return 'english';
  return normalized;
};

const difficultyScore: Record<QuestionDifficulty, number> = { easy: 1, medium: 2, hard: 3 };
const difficultyFromScore = (score: number): QuestionDifficulty =>
  score < 1.67 ? 'easy' : score < 2.34 ? 'medium' : 'hard';

const formatQuestionType = (value: QuestionType) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDueDate = (value: string) =>
  value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date';

const dueDateValue = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export default function AssignmentWizard({
  assignmentMode,
  setAssignmentMode,
  assignmentBatches,
  setAssignmentBatches,
  assignmentSubject,
  setAssignmentSubject,
  assignmentTitle,
  setAssignmentTitle,
  assignmentDescription,
  setAssignmentDescription,
  assignmentInstructions,
  setAssignmentInstructions,
  assignmentQuestionIds,
  setAssignmentQuestionIds,
  assignmentDueAt,
  setAssignmentDueAt,
  assignmentDifficulty,
  setAssignmentDifficulty,
  assignmentTopicMode,
  setAssignmentTopicMode,
  assignmentTopicName,
  setAssignmentTopicName,
  assignmentSubmitting,
  availableStudents,
  selectedStudentIds,
  setSelectedStudentIds,
  assignedClasses,
  teacherAssignedSubjects,
  teacherId,
  questions,
  onSubmit,
  onCancel,
}: AssignmentWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [debouncedQuestionSearch, setDebouncedQuestionSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | QuestionType>('all');
  const [xpFilter, setXpFilter] = useState<XpFilter>('all');
  const [sort, setSort] = useState<QuestionSort>('recommended');
  const [questionPool, setQuestionPool] = useState<QuestionPool>('all');
  const [previewQuestion, setPreviewQuestion] = useState<TeacherQuestion | null>(null);
  const [customDueDate, setCustomDueDate] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const wizardTopRef = useRef<HTMLDivElement>(null);

  const uniqueClasses = useMemo(() => {
    const classes = new Map<string, TeacherAssignedClass>();
    assignedClasses.forEach((item) => {
      if (item.is_active && !classes.has(item.class_code)) classes.set(item.class_code, item);
    });
    return [...classes.values()];
  }, [assignedClasses]);

  const uniqueQuestions = useMemo(() => {
    const ids = new Set<string>();
    const content = new Set<string>();
    return questions.filter((question) => {
      if (ids.has(question.id)) return false;
      ids.add(question.id);
      const key = [
        question.subject,
        normalizeQuestionText(question.question_text),
        normalizeQuestionText(question.correct_answer || ''),
      ].join('|');
      if (content.has(key)) return false;
      content.add(key);
      return true;
    });
  }, [assignmentSubject, questions]);

  const subjectQuestions = useMemo(
    () => uniqueQuestions.filter((question) => normalizeSubject(question.subject) === normalizeSubject(assignmentSubject)),
    [assignmentSubject, uniqueQuestions],
  );

  const topics = useMemo(
    () => [...new Set(subjectQuestions.map((question) => question.topic_name || question.topic || 'General'))].sort(),
    [subjectQuestions],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuestionSearch(questionSearch.trim().toLocaleLowerCase()), 180);
    return () => window.clearTimeout(timer);
  }, [questionSearch]);

  const filteredQuestions = useMemo(() => {
    const matches = subjectQuestions.filter((question) => {
      const topic = question.topic_name || question.topic || 'General';
      const haystack = [
        question.question_text,
        question.correct_answer,
        topic,
        ...(question.tags || []),
        question.difficulty,
      ].join(' ').toLocaleLowerCase();
      const xp = question.points || 0;
      return (
        (!debouncedQuestionSearch || haystack.includes(debouncedQuestionSearch)) &&
        (questionPool === 'all' ||
          (questionPool === 'mine' && Boolean(teacherId) && question.teacher_id === teacherId) ||
          (questionPool === 'brains-heist' && !question.teacher_id)) &&
        (topicFilter === 'all' || topic === topicFilter) &&
        (difficultyFilter === 'all' || question.difficulty === difficultyFilter) &&
        (typeFilter === 'all' || question.question_type === typeFilter) &&
        (xpFilter === 'all' ||
          (xpFilter === 'low' && xp <= 10) ||
          (xpFilter === 'medium' && xp > 10 && xp <= 20) ||
          (xpFilter === 'high' && xp > 20))
      );
    });

    return [...matches].sort((a, b) => {
      if (sort === 'xp-high') return (b.points || 0) - (a.points || 0);
      if (sort === 'xp-low') return (a.points || 0) - (b.points || 0);
      if (sort === 'time-short') return (a.time_limit || 60) - (b.time_limit || 60);
      if (sort === 'difficulty') return difficultyScore[a.difficulty] - difficultyScore[b.difficulty];
      return Number(assignmentQuestionIds.includes(b.id)) - Number(assignmentQuestionIds.includes(a.id));
    });
  }, [assignmentQuestionIds, debouncedQuestionSearch, difficultyFilter, questionPool, sort, subjectQuestions, teacherId, topicFilter, typeFilter, xpFilter]);

  const selectedQuestions = useMemo(
    () => subjectQuestions.filter((question) => assignmentQuestionIds.includes(question.id)),
    [assignmentQuestionIds, subjectQuestions],
  );

  const selectedClasses = useMemo(
    () => uniqueClasses.filter((item) => assignmentBatches.includes('All') || assignmentBatches.includes(item.class_code)),
    [assignmentBatches, uniqueClasses],
  );

  const audienceStudents = useMemo(() => {
    if (assignmentMode === 'custom') return availableStudents.filter((student) => selectedStudentIds.includes(student.id));
    const batches = new Set(selectedClasses.map((item) => item.class_code));
    return availableStudents.filter((student) => student.batch && batches.has(student.batch));
  }, [assignmentMode, availableStudents, selectedClasses, selectedStudentIds]);

  const totalXp = selectedQuestions.reduce((total, question) => total + (question.points || 0), 0);
  const totalSeconds = selectedQuestions.reduce((total, question) => total + (question.time_limit || 60), 0);
  const averageScore = selectedQuestions.length
    ? selectedQuestions.reduce((total, question) => total + difficultyScore[question.difficulty], 0) / selectedQuestions.length
    : difficultyScore[assignmentDifficulty];
  const averageDifficulty = difficultyFromScore(averageScore);
  const estimatedMinutes = selectedQuestions.length ? Math.max(1, Math.ceil(totalSeconds / 60)) : 0;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        !assignmentQuestionIds.length &&
        !assignmentTitle &&
        !assignmentDescription &&
        !assignmentInstructions &&
        !assignmentDueAt &&
        !assignmentBatches.length &&
        !selectedStudentIds.length
      ) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [assignmentBatches.length, assignmentDescription, assignmentDueAt, assignmentInstructions, assignmentQuestionIds.length, assignmentTitle, selectedStudentIds.length]);

  const toggleBatch = (batch: string) => {
    setAssignmentBatches((current) => current.includes(batch) ? current.filter((item) => item !== batch && item !== 'All') : [...current.filter((item) => item !== 'All'), batch]);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleQuestion = (id: string) => {
    setAssignmentQuestionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const goToStep = (targetStep: WizardStep) => {
    setStep(targetStep);
    window.requestAnimationFrame(() => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const continueFrom = (currentStep: WizardStep) => {
    if (currentStep === 1 && !assignmentSubject) return brainsAlert('Please choose a subject.', 'info');
    if (currentStep === 2) {
      if (assignmentMode === 'batch' && !assignmentBatches.length) return brainsAlert('Please select at least one class/batch for this assignment.', 'info');
      if (assignmentMode === 'custom' && !selectedStudentIds.length) return brainsAlert('Please select at least one student for this assignment.', 'info');
    }
    if (currentStep === 3) {
      if (!assignmentQuestionIds.length) return brainsAlert('Select at least one question to assign.', 'info');
      setAssignmentDifficulty(averageDifficulty);
    }
    if (currentStep === 4 && !assignmentTitle.trim()) {
      return brainsAlert('Add an assignment title before continuing.', 'info');
    }
    if (currentStep < 6) setReviewConfirmed(false);
    goToStep(Math.min(6, currentStep + 1) as WizardStep);
  };

  const leaveWizard = async () => {
    const hasDraft = assignmentQuestionIds.length ||
      assignmentTitle ||
      assignmentDescription ||
      assignmentInstructions ||
      assignmentDueAt ||
      assignmentBatches.length ||
      selectedStudentIds.length;
    if (!hasDraft) {
      onCancel();
      return;
    }
    const confirmed = await brainsConfirm({
      title: 'Leave assignment setup?',
      message: 'This assignment has not been published. Your selected audience, questions, title, and due date will be lost.',
      confirmLabel: 'Leave and discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    });
    if (confirmed) onCancel();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignmentTitle.trim()) {
      brainsAlert('Assignment title is required.', 'info');
      goToStep(4);
      return;
    }
    if (step !== 6 || !reviewConfirmed) {
      brainsAlert('Review the complete assignment and confirm it is ready before publishing.', 'info');
      goToStep(6);
      return;
    }
    await onSubmit(event);
  };

  return (
    <div className="aw-shell">
      <header className="aw-header">
        <button type="button" className="aw-back" onClick={leaveWizard} aria-label="Back to assignments">← Assignments</button>
        <div>
          <p>Assignment wizard</p>
          <h1>Create an assignment</h1>
        </div>
        <span className="aw-progress-note">Changes are not saved until you publish.</span>
      </header>

      <div ref={wizardTopRef} className="aw-wizard-anchor">
        <nav className="aw-progress" aria-label="Assignment creation progress">
          {STEPS.map((item) => {
            const complete = item.id < step;
            const current = item.id === step;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.id > step}
                onClick={() => item.id <= step && goToStep(item.id as WizardStep)}
                className={current ? 'is-current' : complete ? 'is-complete' : ''}
                aria-current={current ? 'step' : undefined}
              >
                <span>{complete ? '✓' : item.id}</span>
                <small>{item.short}</small>
              </button>
            );
          })}
        </nav>
        <section className="aw-step-question" aria-live="polite">
          <span>Step {step} of {STEPS.length}</span>
          <h2>{STEPS[step - 1].question}</h2>
          <p>{STEPS[step - 1].helper}</p>
        </section>
      </div>

      <form onSubmit={handleSubmit} className="aw-layout">
        <section className="aw-card" aria-labelledby={`wizard-step-${step}`}>
          <div className="aw-card__heading">
            <span>Step {step} of 6</span>
            <h2 id={`wizard-step-${step}`}>{STEPS[step - 1].short}</h2>
          </div>

          {step === 2 && (
            <div className="aw-step">
              <div className="aw-choice-grid aw-choice-grid--two" role="radiogroup" aria-label="Assignment audience">
                <button type="button" role="radio" aria-checked={assignmentMode === 'batch'} className={assignmentMode === 'batch' ? 'aw-choice is-selected' : 'aw-choice'} onClick={() => setAssignmentMode('batch')}>
                  <span>🏫</span><strong>Entire class</strong><small>Choose one or more assigned classes</small>
                </button>
                <button type="button" role="radio" aria-checked={assignmentMode === 'custom'} className={assignmentMode === 'custom' ? 'aw-choice is-selected' : 'aw-choice'} onClick={() => setAssignmentMode('custom')}>
                  <span>👤</span><strong>Individual students</strong><small>Build a custom student group</small>
                </button>
              </div>

              {assignmentMode === 'batch' ? (
                <div className="aw-class-grid">
                  {uniqueClasses.map((item) => {
                    const count = availableStudents.filter((student) => student.batch === item.class_code).length;
                    const selected = assignmentBatches.includes('All') || assignmentBatches.includes(item.class_code);
                    return (
                      <button key={item.class_code} type="button" aria-pressed={selected} onClick={() => toggleBatch(item.class_code)} className={selected ? 'aw-class-card is-selected' : 'aw-class-card'}>
                        <span className="aw-check">{selected ? '✓' : ''}</span>
                        <strong>{item.class_code}</strong>
                        <small>{item.subject}</small>
                        <span>{count} student{count === 1 ? '' : 's'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="aw-students">
                  <div className="aw-toolbar aw-toolbar--simple">
                    <label className="aw-search"><span>⌕</span><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students…" aria-label="Search students" /></label>
                    <button type="button" onClick={() => setSelectedStudentIds(availableStudents.map((student) => student.id))}>Select all</button>
                    <button type="button" onClick={() => setSelectedStudentIds([])}>Clear</button>
                  </div>
                  <div className="aw-student-grid">
                    {availableStudents.filter((student) => [student.display_name, student.username, student.batch].join(' ').toLocaleLowerCase().includes(studentSearch.toLocaleLowerCase())).map((student) => {
                      const selected = selectedStudentIds.includes(student.id);
                      return (
                        <button key={student.id} type="button" aria-pressed={selected} onClick={() => toggleStudent(student.id)} className={selected ? 'aw-student-card is-selected' : 'aw-student-card'}>
                          <img src={student.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.display_name)}`} alt="" />
                          <span><strong>{student.display_name}</strong><small>{student.batch || 'No class'} · Grade {student.grade}</small></span>
                          <span className="aw-check">{selected ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="aw-step">
              <p className="aw-intro">Only subjects assigned to your classes are available.</p>
              <div className="aw-subject-grid" role="radiogroup" aria-label="Choose subject">
                {teacherAssignedSubjects.map((subject) => (
                  <button key={subject} type="button" role="radio" aria-checked={assignmentSubject === subject} className={assignmentSubject === subject ? 'aw-subject is-selected' : 'aw-subject'} onClick={() => setAssignmentSubject(subject as Subject)}>
                    <span aria-hidden="true">{subject === 'Maths' ? '∑' : subject === 'Science' ? '⚗' : subject === 'English' ? 'Aa' : '◆'}</span>
                    <strong>{subject}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="aw-step aw-questions">
              <div className="aw-toolbar">
                <label className="aw-search aw-search--wide"><span>⌕</span><input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search question, answer, topic, tags…" aria-label="Search question bank" /></label>
                <select value={questionPool} onChange={(event) => setQuestionPool(event.target.value as QuestionPool)} aria-label="Choose question pool">
                  <option value="all">All pools</option>
                  <option value="brains-heist">Brains Heist Pool</option>
                  <option value="mine">My Pool</option>
                </select>
                <select value={topicFilter} onChange={(event) => { setTopicFilter(event.target.value); setAssignmentTopicMode(event.target.value === 'all' ? 'general' : 'custom'); setAssignmentTopicName(event.target.value === 'all' ? '' : event.target.value); }} aria-label="Filter by topic">
                  <option value="all">All topics</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                </select>
                <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as 'all' | QuestionDifficulty)} aria-label="Filter by difficulty">
                  <option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | QuestionType)} aria-label="Filter by question type">
                  <option value="all">All types</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True / false</option><option value="short_answer">Short answer</option>
                </select>
                <select value={xpFilter} onChange={(event) => setXpFilter(event.target.value as XpFilter)} aria-label="Filter by XP">
                  <option value="all">All XP</option><option value="low">Up to 10 XP</option><option value="medium">11–20 XP</option><option value="high">21+ XP</option>
                </select>
                <select value={sort} onChange={(event) => setSort(event.target.value as QuestionSort)} aria-label="Sort questions">
                  <option value="recommended">Recommended</option><option value="xp-high">XP: high first</option><option value="xp-low">XP: low first</option><option value="time-short">Shortest first</option><option value="difficulty">Difficulty</option>
                </select>
              </div>
              <div className="aw-question-actions">
                <span>{filteredQuestions.length} unique question{filteredQuestions.length === 1 ? '' : 's'}</span>
                <button type="button" onClick={() => setAssignmentQuestionIds((current) => [...new Set([...current, ...filteredQuestions.map((question) => question.id)])])}>Select all</button>
                <button type="button" onClick={() => setAssignmentQuestionIds([])}>Clear</button>
              </div>
              <div className="aw-question-transfer">
                <section className="aw-question-pane" aria-labelledby="available-question-heading">
                  <header>
                    <div><span>Question bank</span><h3 id="available-question-heading">Available questions</h3></div>
                    <b>{filteredQuestions.filter((question) => !assignmentQuestionIds.includes(question.id)).length}</b>
                  </header>
                  <div className="aw-question-grid">
                    {filteredQuestions.filter((question) => !assignmentQuestionIds.includes(question.id)).map((question) => {
                      const topic = question.topic_name || question.topic || 'General';
                      return (
                        <article key={question.id} className="aw-question-card">
                          <button type="button" className="aw-question-card__select" aria-pressed="false" onClick={() => toggleQuestion(question.id)} aria-label="Add question">
                            <span className="aw-check">+</span>
                            <p>{question.question_text}</p>
                          </button>
                          <div className="aw-badges">
                            <span data-tone={question.difficulty}>{question.difficulty}</span>
                            <span>{topic}</span>
                            <span>{formatQuestionType(question.question_type)}</span>
                          </div>
                          <footer><span>{question.points} points</span><button type="button" onClick={() => setPreviewQuestion(question)}>Preview</button></footer>
                        </article>
                      );
                    })}
                    {!filteredQuestions.some((question) => !assignmentQuestionIds.includes(question.id)) && <div className="aw-empty">No available questions match these filters.</div>}
                  </div>
                </section>
                <section className="aw-question-pane aw-question-pane--selected" aria-labelledby="selected-question-heading">
                  <header>
                    <div><span>Assignment</span><h3 id="selected-question-heading">Selected questions</h3></div>
                    <b>{selectedQuestions.length}</b>
                  </header>
                  <div className="aw-question-grid">
                    {selectedQuestions.map((question, index) => (
                      <article key={question.id} className="aw-question-card is-selected">
                        <button type="button" className="aw-question-card__select" aria-pressed="true" onClick={() => toggleQuestion(question.id)} aria-label="Remove question">
                          <span className="aw-order">{index + 1}</span>
                          <p>{question.question_text}</p>
                        </button>
                        <div className="aw-badges">
                          <span>{question.topic_name || question.topic || 'General'}</span>
                          <span>{formatQuestionType(question.question_type)}</span>
                        </div>
                        <footer><span>{question.points} points</span><button type="button" onClick={() => setPreviewQuestion(question)}>Preview</button></footer>
                      </article>
                    ))}
                    {!selectedQuestions.length && <div className="aw-empty">Selected questions will appear here.</div>}
                  </div>
                </section>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="aw-step aw-details">
              <label><span>Assignment title <strong aria-hidden="true">*</strong></span><input required aria-required="true" value={assignmentTitle} onChange={(event) => { setAssignmentTitle(event.target.value); setReviewConfirmed(false); }} placeholder="e.g. Fractions confidence check" /><small>Required. This is the name students and reports will show.</small></label>
              <label><span>Description</span><textarea rows={3} value={assignmentDescription} onChange={(event) => setAssignmentDescription(event.target.value)} placeholder="Explain the learning goal and why this work matters…" /></label>
              <label><span>Instructions</span><textarea rows={3} value={assignmentInstructions} onChange={(event) => setAssignmentInstructions(event.target.value)} placeholder="Tell students what to prepare, show, or submit…" /></label>
            </div>
          )}

          {step === 5 && (
            <div className="aw-step">
              <div className="aw-due-grid">
                {[['Today', 0], ['Tomorrow', 1], ['3 days', 3], ['1 week', 7]].map(([label, days]) => {
                  const value = dueDateValue(Number(days));
                  return <button key={label} type="button" className={assignmentDueAt === value ? 'aw-due-card is-selected' : 'aw-due-card'} onClick={() => { setCustomDueDate(false); setAssignmentDueAt(value); }}><span>◷</span><strong>{label}</strong><small>{new Date(value).toLocaleDateString()}</small></button>;
                })}
                <button type="button" className={customDueDate ? 'aw-due-card is-selected' : 'aw-due-card'} onClick={() => setCustomDueDate(true)}><span>▦</span><strong>Custom date</strong><small>Choose date and time</small></button>
              </div>
              {customDueDate && <label className="aw-custom-date"><span>Custom due date</span><input type="datetime-local" value={assignmentDueAt} onChange={(event) => setAssignmentDueAt(event.target.value)} /></label>}
            </div>
          )}

          {step === 6 && (
            <div className="aw-step aw-review">
              <div className="aw-review__hero"><span>Ready to publish</span><h2>{assignmentTitle || `${assignmentSubject} assignment`}</h2><p>{selectedQuestions.length} questions · {estimatedMinutes} minutes · {totalXp} XP</p></div>
              {[
                ['Subject', assignmentSubject, 1],
                ['Audience', assignmentMode === 'batch' ? selectedClasses.map((item) => item.class_code).join(', ') : `${audienceStudents.length} individual students`, 2],
                ['Questions', `${selectedQuestions.length} across ${new Set(selectedQuestions.map((q) => q.topic_name || q.topic || 'General')).size} topics · ${averageDifficulty}`, 3],
                ['Details', [assignmentDescription, assignmentInstructions].filter(Boolean).join(' · ') || 'No additional details', 4],
                ['Due date', formatDueDate(assignmentDueAt), 5],
              ].map(([label, value, target]) => (
                <div className="aw-review__row" key={String(label)}><span><small>{label}</small><strong>{value}</strong></span><button type="button" onClick={() => goToStep(target as WizardStep)}>Edit</button></div>
              ))}
              <label className="aw-review-confirm">
                <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
                <span><strong>I have reviewed this assignment</strong><small>The audience, questions, title, and timing are correct. Publishing sends it to students.</small></span>
              </label>
            </div>
          )}

        </section>
        <footer className="aw-step-footer" aria-label="Wizard navigation">
          <p>
            <strong>Step {step} of {STEPS.length}</strong>
            <span>{step < 6 ? 'Your choices stay in this wizard until you publish or leave.' : 'Publishing sends this assignment to the selected students.'}</span>
          </p>
          <div className="aw-step-nav">
            <button
              type="button"
              className="aw-button aw-button--ghost"
              onClick={() => goToStep(Math.max(1, step - 1) as WizardStep)}
              disabled={step === 1}
            >
              <span aria-hidden="true">←</span> Back
            </button>
            {step < 6 ? (
              <button type="button" className="aw-button aw-button--primary" onClick={() => continueFrom(step)}>
                Next <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button type="submit" className="aw-button aw-button--primary" disabled={assignmentSubmitting || !reviewConfirmed}>
                {assignmentSubmitting ? 'Publishing…' : 'Publish assignment'}
              </button>
            )}
          </div>
        </footer>
      </form>

      {previewQuestion ? <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} /> : null}
    </div>
  );
}
