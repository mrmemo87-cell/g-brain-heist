import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionDifficulty, QuestionType, Subject } from '../../types';
import {
  findSavedTeacherQuestionPdfDrafts,
  getQuestionCandidateIssues,
  MAX_GENERATED_QUESTION_COUNT,
  MAX_TEACHER_QUESTION_PDF_BYTES,
  questionCandidateFingerprint,
  setCandidateAssessmentProcess,
  submitTeacherQuestionBatch,
  uploadAndExtractTeacherQuestionPdf,
  type AssessmentProcessCode,
  type TeacherQuestionBatchCandidate,
  type TeacherQuestionBatchSubmitResult,
  type TeacherPdfProcessingMode,
  type TeacherQuestionPdfExtraction,
  type TeacherQuestionPurpose,
  type TeacherQuestionChallenge,
  type TeacherQuestionSavedDraft,
  type TeacherQuestionVisualPolicy,
  type TeacherQuestionUploadStage,
} from '../../services/teacherQuestionBatchService';
import './QuestionBatchWorkspace.css';

const SUBJECTS: Subject[] = [
  'Maths', 'Science', 'Biology', 'Chemistry', 'Physics', 'English',
  'Russian Language', 'Kyrgyz Language', 'German Language', 'Geography',
  'Global Perspective', 'Travel & Tourism', 'ICT',
];
const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);
const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / False',
  short_answer: 'Short answer',
};
const REVIEW_STORAGE_PREFIX = 'brains-heist:teacher-question-review:';

const MODE_DETAILS: Record<TeacherPdfProcessingMode, { title: string; detail: string; icon: string }> = {
  extract: { title: 'Extract existing questions', detail: 'For question papers, worksheets and answer keys.', icon: 'EX' },
  generate: { title: 'Create from learning material', detail: 'For chapters, notes, diagrams and explanations.', icon: 'CR' },
  both: { title: 'Extract + create', detail: 'For mixed PDFs containing teaching and practice.', icon: 'MX' },
};

const stageCopy = (
  stage: TeacherQuestionUploadStage,
  mode: TeacherPdfProcessingMode,
): { title: string; detail: string } => ({
  checking: { title: 'Checking the PDF', detail: 'Confirming the file is safe and readable.' },
  uploading: { title: 'Uploading privately', detail: 'The source stays in protected teacher storage.' },
  extracting: mode === 'extract'
    ? { title: 'Finding questions and answers', detail: 'Reading the paper, layout and answer key.' }
    : { title: 'Creating your review draft', detail: 'Reading the source, grounding each question and preparing answers.' },
  securing: { title: 'Saving the draft', detail: 'Securing the source evidence so you can safely resume later.' },
}[stage]);

interface QuestionBatchWorkspaceProps {
  defaultSubject?: Subject;
  defaultTopic?: string;
  restrictedSubjects?: string[];
  onBack: () => void;
  onSubmitted?: (result: TeacherQuestionBatchSubmitResult) => void | Promise<void>;
  onOpenMyPool: () => void;
}

const formatBytes = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const confidenceLabel = (value: number) => value >= 0.85 ? 'High' : value >= 0.7 ? 'Check' : 'Low';

const optionLabel = (index: number) => String.fromCharCode(65 + index);

const subjectKey = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (['math', 'maths', 'mathematics'].includes(normalized)) return 'maths';
  if (normalized === 'english language') return 'english';
  return normalized;
};

const formatDraftTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved earlier';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const QuestionBatchWorkspace: React.FC<QuestionBatchWorkspaceProps> = ({
  defaultSubject,
  defaultTopic,
  restrictedSubjects,
  onBack,
  onSubmitted,
  onOpenMyPool,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftLookupRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploadStage, setUploadStage] = useState<TeacherQuestionUploadStage>('checking');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [savedDrafts, setSavedDrafts] = useState<TeacherQuestionSavedDraft[]>([]);
  const [checkingSavedDrafts, setCheckingSavedDrafts] = useState(false);
  const [extraction, setExtraction] = useState<TeacherQuestionPdfExtraction | null>(null);
  const [questions, setQuestions] = useState<TeacherQuestionBatchCandidate[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [teacherConfirmed, setTeacherConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TeacherQuestionBatchSubmitResult | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ candidate: TeacherQuestionBatchCandidate; index: number } | null>(null);
  const [bulkSubject, setBulkSubject] = useState<Subject | ''>(defaultSubject || '');
  const [bulkTopic, setBulkTopic] = useState(defaultTopic && defaultTopic !== 'General' ? defaultTopic : '');
  const [bulkGrades, setBulkGrades] = useState<number[]>([]);
  const [processingMode, setProcessingMode] = useState<TeacherPdfProcessingMode>('extract');
  const [generationSubject, setGenerationSubject] = useState<Subject | ''>(defaultSubject || '');
  const [targetGrade, setTargetGrade] = useState<number | ''>('');
  const [questionCount, setQuestionCount] = useState(12);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice', 'true_false']);
  const [purpose, setPurpose] = useState<TeacherQuestionPurpose>('retrieval_practice');
  const [challenge, setChallenge] = useState<TeacherQuestionChallenge>('balanced');
  const [pageFrom, setPageFrom] = useState<number | ''>('');
  const [pageTo, setPageTo] = useState<number | ''>('');
  const [learningPriorities, setLearningPriorities] = useState('');
  const [visualPolicy, setVisualPolicy] = useState<TeacherQuestionVisualPolicy>('self_contained');
  const [sourceRightsAttested, setSourceRightsAttested] = useState(false);

  const availableSubjects = useMemo(() => {
    if (!restrictedSubjects?.length) return SUBJECTS;
    const allowed = new Set(restrictedSubjects.map(subjectKey));
    const filtered = SUBJECTS.filter((subject) => allowed.has(subjectKey(subject)));
    return filtered.length ? filtered : SUBJECTS;
  }, [restrictedSubjects]);
  const createsQuestions = processingMode !== 'extract';
  const selectedGenerationSubject = generationSubject || availableSubjects[0] || '';
  const currentStageCopy = stageCopy(uploadStage, processingMode);
  const pageRangeValid = (!pageFrom || !pageTo || pageFrom <= pageTo);
  const blueprintReady = !createsQuestions || Boolean(
    selectedGenerationSubject
      && targetGrade
      && questionTypes.length
      && sourceRightsAttested
      && pageRangeValid,
  );
  const estimatedWait = processingMode === 'extract'
    ? 'Usually 20–60 seconds'
    : questionCount <= 12
      ? 'Usually 30–90 seconds'
      : 'Usually 45–120 seconds';
  const missingSetup = createsQuestions ? [
    !targetGrade ? 'target grade' : null,
    !questionTypes.length ? 'question type' : null,
    !sourceRightsAttested ? 'usage confirmation' : null,
    !pageRangeValid ? 'valid page range' : null,
  ].filter(Boolean) as string[] : [];

  const issueMap = useMemo(() => new Map(questions.map((question) => [
    question.client_id,
    getQuestionCandidateIssues(question),
  ])), [questions]);
  const issueCount = useMemo(() => [...issueMap.values()].filter((issues) => issues.length > 0).length, [issueMap]);
  const fingerprints = useMemo(() => questions.reduce((counts, question) => {
    const fingerprint = questionCandidateFingerprint(question);
    counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1);
    return counts;
  }, new Map<string, number>()), [questions]);
  const duplicateCount = useMemo(() => questions.filter((question) => (
    (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1
  )).length, [fingerprints, questions]);
  const lowConfidenceCount = useMemo(() => questions.filter((question) => (
    question.extraction_confidence < 0.7
      || question.taxonomy_proposal.confidence_score < 0.7
      || (question.candidate_origin === 'ai_generated_from_source' && question.grounding_confidence < 0.7)
  )).length, [questions]);
  const generatedCount = useMemo(() => questions.filter((question) => (
    question.candidate_origin === 'ai_generated_from_source'
  )).length, [questions]);
  const visibleQuestions = showOnlyIssues
    ? questions.filter((question) => (issueMap.get(question.client_id)?.length || 0) > 0
      || (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1)
    : questions;
  const blockingCount = useMemo(() => questions.filter((question) => (
    (issueMap.get(question.client_id)?.length || 0) > 0
      || (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1
  )).length, [fingerprints, issueMap, questions]);

  useEffect(() => {
    if (!working) {
      setElapsedSeconds(0);
      return undefined;
    }
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [working]);

  useEffect(() => {
    if (!extraction || !questions.length || result) return;
    try {
      window.localStorage.setItem(`${REVIEW_STORAGE_PREFIX}${extraction.extractionId}`, JSON.stringify(questions));
    } catch (storageError) {
      console.warn('[teacher-question-pdf] Could not autosave review edits:', storageError);
    }
  }, [extraction, questions, result]);

  const applyDraftBlueprint = (draft: TeacherQuestionSavedDraft) => {
    const request = draft.processingRequest;
    const suggestedSubject = draft.extraction.questions[0]?.subject;
    setProcessingMode(draft.extraction.processingMode);
    if (suggestedSubject && availableSubjects.some((subject) => subjectKey(subject) === subjectKey(suggestedSubject))) {
      setGenerationSubject(suggestedSubject);
      setBulkSubject(suggestedSubject);
    }
    if (request.target_grade && request.target_grade >= 1 && request.target_grade <= 12) {
      setTargetGrade(request.target_grade);
      setBulkGrades([request.target_grade]);
    }
    if (request.requested_generated_question_count) {
      setQuestionCount(Math.min(MAX_GENERATED_QUESTION_COUNT, Math.max(1, request.requested_generated_question_count)));
    }
    if (request.allowed_question_types?.length) setQuestionTypes(request.allowed_question_types);
    if (request.purpose) setPurpose(request.purpose);
    if (request.challenge) setChallenge(request.challenge);
    setPageFrom(request.page_range?.from && request.page_range.from > 1 ? request.page_range.from : '');
    setPageTo(request.page_range?.to && request.page_range.to < 60 ? request.page_range.to : '');
    setLearningPriorities(request.learning_priorities || '');
    if (request.visual_policy) setVisualPolicy(request.visual_policy);
    setSourceRightsAttested(draft.extraction.sourceRightsAttested);
  };

  const openExtraction = (nextExtraction: TeacherQuestionPdfExtraction) => {
    const allowedSubjectKeys = new Set(availableSubjects.map(subjectKey));
    const fallbackSubject = availableSubjects.find((subject) => subjectKey(subject) === subjectKey(defaultSubject || ''))
      || availableSubjects[0];
    let sourceQuestions = nextExtraction.questions;
    try {
      const savedReview = window.localStorage.getItem(`${REVIEW_STORAGE_PREFIX}${nextExtraction.extractionId}`);
      if (savedReview) {
        const parsed = JSON.parse(savedReview) as TeacherQuestionBatchCandidate[];
        if (Array.isArray(parsed) && parsed.length === nextExtraction.questions.length) sourceQuestions = parsed;
      }
    } catch (storageError) {
      console.warn('[teacher-question-pdf] Saved review could not be restored:', storageError);
    }
    const reviewQuestions = sourceQuestions.map((question) => allowedSubjectKeys.has(subjectKey(question.subject))
      ? { ...question, client_id: question.client_id || crypto.randomUUID() }
      : {
        ...question,
        client_id: question.client_id || crypto.randomUUID(),
        subject: fallbackSubject,
        needs_human_attention: true,
        attention_reason: `The PDF suggested ${question.subject}. Confirm the closest subject you are assigned to teach.`,
      });
    setExtraction(nextExtraction);
    setQuestions(reviewQuestions);
    const firstGrade = reviewQuestions[0]?.eligible_grade_levels?.[0];
    if (reviewQuestions[0]?.subject) setBulkSubject(reviewQuestions[0].subject);
    if (firstGrade) setBulkGrades([firstGrade]);
    const firstAttention = reviewQuestions.find((question) => getQuestionCandidateIssues(question).length > 0)
      || reviewQuestions[0];
    setExpandedIds(firstAttention ? new Set([firstAttention.client_id]) : new Set());
    setTeacherConfirmed(false);
    setError(null);
  };

  const chooseFile = async (nextFile: File | null) => {
    const lookupId = ++draftLookupRef.current;
    setError(null);
    setExtraction(null);
    setQuestions([]);
    setResult(null);
    setTeacherConfirmed(false);
    setSavedDrafts([]);
    setCheckingSavedDrafts(false);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (file && (file.name !== nextFile.name || file.size !== nextFile.size || file.lastModified !== nextFile.lastModified)) {
      setSourceRightsAttested(false);
    }
    if (!nextFile.name.toLocaleLowerCase().endsWith('.pdf')) {
      setFile(null);
      setError('Choose a PDF file.');
      return;
    }
    if (nextFile.size > MAX_TEACHER_QUESTION_PDF_BYTES) {
      setFile(null);
      setError('Use a PDF no larger than 20 MB. Compressing very large scans usually gives a cleaner review.');
      return;
    }
    setFile(nextFile);
    setCheckingSavedDrafts(true);
    try {
      const drafts = await findSavedTeacherQuestionPdfDrafts(nextFile);
      if (draftLookupRef.current !== lookupId) return;
      setSavedDrafts(drafts);
      if (drafts[0]) applyDraftBlueprint(drafts[0]);
    } catch (lookupError) {
      if (draftLookupRef.current === lookupId) {
        console.warn('[teacher-question-pdf] Draft recovery check failed:', lookupError);
      }
    } finally {
      if (draftLookupRef.current === lookupId) setCheckingSavedDrafts(false);
    }
  };

  const analysePdf = async () => {
    if (!file || working) return;
    setWorking(true);
    setElapsedSeconds(0);
    setError(null);
    try {
      const nextExtraction = await uploadAndExtractTeacherQuestionPdf(file, {
        processingMode,
        preferredSubject: createsQuestions ? selectedGenerationSubject as Subject : defaultSubject,
        preferredTopic: createsQuestions ? bulkTopic || defaultTopic : defaultTopic,
        targetGrade: createsQuestions ? Number(targetGrade) : undefined,
        questionCount: createsQuestions ? questionCount : undefined,
        allowedQuestionTypes: createsQuestions ? questionTypes : undefined,
        purpose: createsQuestions ? purpose : undefined,
        challenge: createsQuestions ? challenge : undefined,
        pageFrom: pageFrom || undefined,
        pageTo: pageTo || undefined,
        learningPriorities: createsQuestions ? learningPriorities : undefined,
        visualPolicy: createsQuestions ? visualPolicy : undefined,
        sourceRightsAttested: createsQuestions ? sourceRightsAttested : false,
        onStageChange: setUploadStage,
      });
      openExtraction(nextExtraction);
      if (createsQuestions) {
        setBulkSubject(selectedGenerationSubject as Subject);
        setBulkGrades([Number(targetGrade)]);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The PDF could not be analysed.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setWorking(false);
    }
  };

  const updateQuestion = (
    clientId: string,
    update: (question: TeacherQuestionBatchCandidate) => TeacherQuestionBatchCandidate,
  ) => {
    setQuestions((current) => current.map((question) => (
      question.client_id === clientId ? update(question) : question
    )));
    setTeacherConfirmed(false);
  };

  const updateQuestionType = (clientId: string, questionType: QuestionType) => {
    updateQuestion(clientId, (question) => {
      if (questionType === 'true_false') {
        const correctAnswer = ['true', 'false'].includes(question.correct_answer.toLocaleLowerCase())
          ? question.correct_answer
          : 'True';
        return {
          ...question,
          question_type: questionType,
          options: ['True', 'False'],
          correct_answer: correctAnswer,
          accepted_answers: [correctAnswer],
        };
      }
      if (questionType === 'short_answer') {
        const canonical = question.correct_answer.trim();
        return {
          ...question,
          question_type: questionType,
          options: [],
          accepted_answers: question.accepted_answers.length
            ? question.accepted_answers
            : canonical ? [canonical] : [],
        };
      }
      const options = question.options.length >= 2 ? question.options : ['', '', '', ''];
      return { ...question, question_type: questionType, options, accepted_answers: question.correct_answer ? [question.correct_answer] : [] };
    });
  };

  const removeQuestion = (clientId: string) => {
    setQuestions((current) => {
      const index = current.findIndex((question) => question.client_id === clientId);
      if (index < 0) return current;
      setLastRemoved({ candidate: current[index], index });
      return current.filter((question) => question.client_id !== clientId)
        .map((question, questionIndex) => ({ ...question, source_index: questionIndex + 1 }));
    });
    setTeacherConfirmed(false);
  };

  const undoRemove = () => {
    if (!lastRemoved) return;
    setQuestions((current) => {
      const next = [...current];
      next.splice(Math.min(lastRemoved.index, next.length), 0, lastRemoved.candidate);
      return next.map((question, index) => ({ ...question, source_index: index + 1 }));
    });
    setLastRemoved(null);
  };

  const applyBulkContext = () => {
    if (!bulkSubject && !bulkTopic.trim() && !bulkGrades.length) return;
    setQuestions((current) => current.map((question) => ({
      ...question,
      subject: bulkSubject || question.subject,
      topic: bulkTopic.trim() || question.topic,
      eligible_grade_levels: bulkGrades.length ? bulkGrades : question.eligible_grade_levels,
    })));
    setTeacherConfirmed(false);
  };

  const submitBatch = async () => {
    if (!extraction || !questions.length || blockingCount || !teacherConfirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const submission = await submitTeacherQuestionBatch(extraction.extractionId, questions);
      try {
        window.localStorage.removeItem(`${REVIEW_STORAGE_PREFIX}${extraction.extractionId}`);
      } catch (storageError) {
        console.warn('[teacher-question-pdf] Could not clear submitted local draft:', storageError);
      }
      setResult(submission);
      try {
        await onSubmitted?.(submission);
      } catch (refreshError) {
        console.warn('[teacher-question-pdf] Submission succeeded but question-bank refresh failed:', refreshError);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The batch could not be submitted.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const resetWorkspace = () => {
    ++draftLookupRef.current;
    setFile(null);
    setExtraction(null);
    setQuestions([]);
    setExpandedIds(new Set());
    setTeacherConfirmed(false);
    setResult(null);
    setError(null);
    setLastRemoved(null);
    setSavedDrafts([]);
    setCheckingSavedDrafts(false);
    setSourceRightsAttested(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (result) {
    return (
      <section className="question-batch question-batch--complete" aria-labelledby="question-batch-complete-title">
        <div className="question-batch__complete-card">
          <span className="question-batch__complete-icon" aria-hidden="true">✓</span>
          <span className="question-batch__eyebrow">Batch submitted</span>
          <h1 id="question-batch-complete-title">Your questions are in review</h1>
          <p>{result.submitted} question{result.submitted === 1 ? '' : 's'} reached the governed review queue. {result.duplicatesSkipped ? `${result.duplicatesSkipped} existing duplicate${result.duplicatesSkipped === 1 ? ' was' : 's were'} linked instead of copied.` : ''}</p>
          <div className="question-batch__protection">
            <span aria-hidden="true">◆</span>
            <div><strong>Submission confirmed</strong><small>Your batch is saved. A background refresh problem will never turn a successful submission into an error message.</small></div>
          </div>
          <dl>
            <div><dt>Status</dt><dd>In review</dd></div>
            <div><dt>New questions</dt><dd>{result.created}</dd></div>
            <div><dt>Batch reference</dt><dd><code>{result.batchId.slice(0, 8)}</code></dd></div>
          </dl>
          <div className="question-batch__complete-actions">
            <button type="button" className="question-batch__primary" onClick={onOpenMyPool}>View in My Pool</button>
            <button type="button" className="question-batch__secondary" onClick={resetWorkspace}>Start another PDF</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="question-batch" aria-labelledby="question-batch-title">
      <header className="question-batch__hero">
        <button type="button" className="question-batch__back" onClick={onBack} aria-label="Back to Question Bank">←</button>
        <div>
          <span className="question-batch__eyebrow">Teacher question workspace</span>
          <h1 id="question-batch-title">Add Question Batch</h1>
          <p>Create or extract questions from a PDF, review them, then submit. Saved drafts can be resumed after a refresh.</p>
        </div>
        <span className="question-batch__private-badge">Private · resumable · human reviewed</span>
      </header>

      <ol className="question-batch__steps" aria-label="Question batch progress">
        <li className={!extraction ? 'is-active' : 'is-complete'}><span>{extraction ? '✓' : '1'}</span><div><strong>Choose PDF</strong><small>Set the source and target</small></div></li>
        <li className={extraction ? 'is-active' : ''}><span>2</span><div><strong>Review</strong><small>Check questions and answers</small></div></li>
        <li><span>3</span><div><strong>Submit</strong><small>Send to governance review</small></div></li>
      </ol>

      {error ? <div className="question-batch__error" role="alert"><span>!</span><div><strong>We could not finish that step</strong><p>{error}</p></div><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}

      {!extraction ? (
        <>
          <fieldset className="question-batch__mode-picker" disabled={working}>
            <legend><span>Start here</span><strong>What should we do with this PDF?</strong></legend>
            <div>
              {(Object.keys(MODE_DETAILS) as TeacherPdfProcessingMode[]).map((mode) => (
                <label key={mode} className={processingMode === mode ? 'is-selected' : ''}>
                  <input type="radio" name="pdf-processing-mode" value={mode} checked={processingMode === mode} onChange={() => { setProcessingMode(mode); setSourceRightsAttested(false); setSavedDrafts([]); setError(null); }} />
                  <span aria-hidden="true">{MODE_DETAILS[mode].icon}</span>
                  <div><strong>{MODE_DETAILS[mode].title}</strong><small>{MODE_DETAILS[mode].detail}</small></div>
                  <b aria-hidden="true">{processingMode === mode ? '✓' : '○'}</b>
                </label>
              ))}
            </div>
          </fieldset>

          {createsQuestions ? (
            <section className="question-batch__blueprint" aria-labelledby="question-blueprint-title">
              <header><div><span>Question Blueprint</span><h2 id="question-blueprint-title">Set the learning target</h2><p>Choose the essentials. Everything else is optional.</p></div><b>{processingMode === 'both' ? 'Mixed source' : 'Learning material'}</b></header>
              <div className="question-batch__blueprint-quick">
                <label><span>Subject</span><select value={selectedGenerationSubject} onChange={(event) => setGenerationSubject(event.target.value as Subject)}>{availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                <label><span>Target grade</span><select value={targetGrade} onChange={(event) => setTargetGrade(event.target.value ? Number(event.target.value) : '')}><option value="">Choose grade</option>{GRADES.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
                <label><span>{processingMode === 'both' ? 'New questions' : 'Questions'}</span><input type="number" min="1" max={MAX_GENERATED_QUESTION_COUNT} value={questionCount} onChange={(event) => setQuestionCount(Math.min(MAX_GENERATED_QUESTION_COUNT, Math.max(1, Number(event.target.value) || 1)))} /></label>
                <label><span>Purpose</span><select value={purpose} onChange={(event) => setPurpose(event.target.value as TeacherQuestionPurpose)}><option value="retrieval_practice">Retrieval practice</option><option value="diagnostic">Diagnostic check</option><option value="homework">Homework</option><option value="exam_practice">Exam practice</option></select></label>
              </div>
              <details className="question-batch__blueprint-details">
                <summary><span>Fine-tune <small>optional</small></span><b>＋</b></summary>
                <div>
                  <label><span>Topic focus <em>optional</em></span><input value={bulkTopic} maxLength={160} onChange={(event) => setBulkTopic(event.target.value)} placeholder="e.g. Cell structure" /></label>
                  <label><span>Challenge</span><select value={challenge} onChange={(event) => setChallenge(event.target.value as TeacherQuestionChallenge)}><option value="accessible">Accessible</option><option value="balanced">Balanced</option><option value="challenging">Challenging</option></select></label>
                  <fieldset className="is-wide"><legend>Question types</legend><div className="question-batch__type-picker">{(['multiple_choice', 'short_answer', 'true_false'] as QuestionType[]).map((type) => <button key={type} type="button" aria-pressed={questionTypes.includes(type)} className={questionTypes.includes(type) ? 'is-selected' : ''} onClick={() => setQuestionTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])}>{QUESTION_TYPE_LABELS[type]}</button>)}</div></fieldset>
                  <label><span>From page <em>optional</em></span><input type="number" min="1" max="60" value={pageFrom} onChange={(event) => setPageFrom(event.target.value ? Number(event.target.value) : '')} placeholder="1" /></label>
                  <label><span>To page <em>optional</em></span><input type="number" min="1" max="60" value={pageTo} onChange={(event) => setPageTo(event.target.value ? Number(event.target.value) : '')} placeholder="60" /></label>
                  <label className="is-wide"><span>Learning priorities <em>optional</em></span><textarea rows={2} maxLength={500} value={learningPriorities} onChange={(event) => setLearningPriorities(event.target.value)} placeholder="What should students understand or practise most?" /></label>
                  <label className="is-wide"><span>Illustrations and diagrams</span><select value={visualPolicy} onChange={(event) => setVisualPolicy(event.target.value as TeacherQuestionVisualPolicy)}><option value="self_contained">Use as grounding, but keep questions self-contained</option><option value="text_only">Use text evidence only</option></select></label>
                </div>
              </details>
              {!pageRangeValid ? <p className="question-batch__blueprint-error" role="alert">The first page must come before the last page.</p> : null}
              <label className="question-batch__rights"><input type="checkbox" checked={sourceRightsAttested} onChange={(event) => setSourceRightsAttested(event.target.checked)} /><span><strong>I may use this material for classroom question creation</strong><small>The PDF stays private and page-level source evidence remains attached to the draft.</small></span></label>
            </section>
          ) : null}

          <div className="question-batch__upload-layout">
            <main className="question-batch__upload-card">
              <div
                className={`question-batch__dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void chooseFile(event.dataTransfer.files?.[0] || null);
                }}
              >
                <input ref={fileInputRef} id="teacher-question-pdf" type="file" accept=".pdf,application/pdf" onChange={(event) => void chooseFile(event.target.files?.[0] || null)} disabled={working} />
                {!file ? (
                  <label htmlFor="teacher-question-pdf">
                    <span className="question-batch__upload-icon" aria-hidden="true">PDF</span>
                    <strong>{processingMode === 'extract' ? 'Choose a question paper' : processingMode === 'generate' ? 'Choose a teaching PDF' : 'Choose a mixed PDF'}</strong>
                    <small>Drop it here or select it from your device</small>
                    <b>Choose PDF</b>
                  </label>
                ) : (
                  <div className="question-batch__file">
                    <span aria-hidden="true">PDF</span>
                    <div><strong>{file.name}</strong><small>{formatBytes(file.size)} · {checkingSavedDrafts ? 'Checking for saved work…' : 'Ready'}</small></div>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={working}>Replace</button>
                  </div>
                )}
              </div>

              {checkingSavedDrafts ? (
                <div className="question-batch__saved-drafts is-loading" role="status">
                  <span className="question-batch__saved-icon" aria-hidden="true">↻</span>
                  <div><strong>Checking for saved drafts</strong><p>If you worked on this PDF before, we’ll bring the draft back instead of making you start again.</p></div>
                </div>
              ) : savedDrafts.length ? (
                <section className="question-batch__saved-drafts" aria-label="Saved drafts for this PDF">
                  <div className="question-batch__saved-heading"><span className="question-batch__saved-icon" aria-hidden="true">✓</span><div><strong>Saved work found</strong><p>Resume instantly—no AI rerun and no extra wait.</p></div></div>
                  <div className="question-batch__saved-list">
                    {savedDrafts.map((draft) => {
                      const count = draft.extraction.questions.length;
                      const grade = draft.processingRequest.target_grade;
                      const types = draft.processingRequest.allowed_question_types?.map((type) => QUESTION_TYPE_LABELS[type]).join(' + ');
                      return <button key={draft.extraction.extractionId} type="button" onClick={() => { applyDraftBlueprint(draft); openExtraction(draft.extraction); }}><span><strong>{count} question{count === 1 ? '' : 's'}{grade ? ` · Grade ${grade}` : ''}</strong><small>{types || MODE_DETAILS[draft.extraction.processingMode].title} · {formatDraftTime(draft.completedAt)}</small></span><b>Resume</b></button>;
                    })}
                  </div>
                  <small className="question-batch__saved-footnote">Want a different version? Adjust the blueprint and create a fresh draft below.</small>
                </section>
              ) : null}

              <div className="question-batch__upload-actions">
                <div><p><span>✓</span> Nothing is added until you review and submit.</p>{file ? <small className="question-batch__eta">{estimatedWait} for a fresh AI draft.</small> : null}</div>
                <button type="button" className="question-batch__primary" onClick={() => void analysePdf()} disabled={!file || !blueprintReady || working || checkingSavedDrafts}>{working ? currentStageCopy.title : savedDrafts.length ? 'Create fresh draft' : processingMode === 'extract' ? 'Find questions' : processingMode === 'generate' ? 'Create review draft' : 'Prepare mixed draft'}</button>
              </div>
              {file && !blueprintReady && !working && !checkingSavedDrafts ? <p className="question-batch__disabled-help">To continue, complete: {missingSetup.join(', ')}.</p> : null}
              {working ? (
                <div className="question-batch__progress" role="status" aria-live="polite">
                  <div className="question-batch__progress-orbit" aria-hidden="true"><span /><span /><span /></div>
                  <div><strong>{currentStageCopy.title}</strong><p>{currentStageCopy.detail}</p><small>{estimatedWait} · {elapsedSeconds}s elapsed. You can stay on this page; the draft will appear automatically.</small></div>
                </div>
              ) : null}
            </main>

            <aside className="question-batch__upload-aside">
              <span className="question-batch__aside-number">01</span>
              <h2>Good to know</h2>
              <ul>{createsQuestions ? <>
                <li><span>✓</span><div><strong>Up to 60 pages or 20 MB</strong><small>Use a page range only when you want a narrower focus.</small></div></li>
                <li><span>✓</span><div><strong>Drafts are saved</strong><small>If you refresh, choose the same PDF and resume your saved draft.</small></div></li>
                <li><span>✓</span><div><strong>Source stays traceable</strong><small>Page evidence and learning objective remain attached for review.</small></div></li>
              </> : <>
                <li><span>✓</span><div><strong>Up to 50 questions</strong><small>Question papers, worksheets and answer keys work best.</small></div></li>
                <li><span>✓</span><div><strong>Include the answer key</strong><small>It improves the first draft and reduces manual fixes.</small></div></li>
                <li><span>✓</span><div><strong>Drafts are saved</strong><small>Refreshes no longer mean starting over.</small></div></li>
              </>}</ul>
              <div className="question-batch__safety-note"><span aria-hidden="true">◆</span><p><strong>Your PDF is private.</strong> It stays in the teacher-only source vault.</p></div>
            </aside>
          </div>
        </>
      ) : (
        <div className="question-batch__review">
          <section className="question-batch__review-summary">
            <div><span className="question-batch__eyebrow">{generatedCount ? 'Creation draft ready' : 'Extraction ready'}</span><div className="question-batch__review-badges"><b>{MODE_DETAILS[extraction.processingMode].title}</b><b>{extraction.detectedDocumentType.replace(/_/g, ' ')}</b></div><h2>{extraction.document_title}</h2><p>{extraction.document_summary}</p><small>{extraction.sourceFileName} · {formatBytes(extraction.sourceFileSize)}{extraction.detectedPageCount ? ` · about ${extraction.detectedPageCount} pages` : ''} · autosaved</small></div>
            <div className="question-batch__summary-metrics">
              <article><strong>{questions.length}</strong><span>{generatedCount ? `${generatedCount} created · ${questions.length - generatedCount} extracted` : 'Questions found'}</span></article>
              <article className={issueCount ? 'is-warning' : 'is-ready'}><strong>{issueCount}</strong><span>Need a fix</span></article>
              <article className={lowConfidenceCount ? 'is-check' : 'is-ready'}><strong>{lowConfidenceCount}</strong><span>Low-confidence tags</span></article>
            </div>
          </section>

          <section className="question-batch__bulk" aria-labelledby="batch-context-title">
            <div><span>Apply once</span><h3 id="batch-context-title">Set shared class context</h3><p>Use this when the whole batch belongs to the same subject, topic or grade.</p></div>
            <div className="question-batch__bulk-fields">
              <label><span>Subject</span><select value={bulkSubject} onChange={(event) => setBulkSubject(event.target.value as Subject | '')}><option value="">Keep suggestions</option>{availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
              <label><span>Topic</span><input value={bulkTopic} onChange={(event) => setBulkTopic(event.target.value)} placeholder="Keep suggested topics" /></label>
              <fieldset><legend>Grades</legend><div>{GRADES.map((grade) => <button key={grade} type="button" aria-pressed={bulkGrades.includes(grade)} className={bulkGrades.includes(grade) ? 'is-selected' : ''} onClick={() => setBulkGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade].sort((a, b) => a - b))}>{grade}</button>)}</div></fieldset>
              <button type="button" className="question-batch__apply" onClick={applyBulkContext} disabled={!bulkSubject && !bulkTopic.trim() && !bulkGrades.length}>Apply to all</button>
            </div>
          </section>

          <div className="question-batch__review-toolbar">
            <div><strong>Review questions</strong><span>{questions.length - blockingCount} ready · {blockingCount} need attention{duplicateCount ? ` · ${duplicateCount} duplicate signals` : ''}</span></div>
            <div><button type="button" className={showOnlyIssues ? 'is-active' : ''} onClick={() => setShowOnlyIssues((current) => !current)} aria-pressed={showOnlyIssues}>Show issues only{blockingCount ? ` (${blockingCount})` : ''}</button><button type="button" onClick={resetWorkspace}>Use another PDF</button></div>
          </div>

          {lastRemoved ? <div className="question-batch__undo" role="status"><span>Question removed from this batch.</span><button type="button" onClick={undoRemove}>Undo</button><button type="button" aria-label="Dismiss undo" onClick={() => setLastRemoved(null)}>×</button></div> : null}

          <div className="question-batch__question-list">
            {visibleQuestions.map((question) => {
              const issues = issueMap.get(question.client_id) || [];
              const isDuplicate = (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1;
              const expanded = expandedIds.has(question.client_id);
              const taxonomy = question.taxonomy_proposal;
              return (
                <article key={question.client_id} className={`question-batch__question ${issues.length || isDuplicate ? 'has-issues' : 'is-ready'} ${expanded ? 'is-expanded' : ''}`}>
                  <header>
                    <button type="button" className="question-batch__question-toggle" onClick={() => setExpandedIds((current) => {
                      const next = new Set(current);
                      if (next.has(question.client_id)) next.delete(question.client_id); else next.add(question.client_id);
                      return next;
                    })} aria-expanded={expanded}>
                      <span className="question-batch__question-number">{question.source_index}</span>
                      <span className="question-batch__question-title"><strong>{question.question_text || 'Question wording needed'}</strong><small>{question.candidate_origin === 'ai_generated_from_source' ? 'AI-created from source' : 'Extracted from PDF'} · {question.subject} · {question.topic} · {question.source_page ? `Page ${question.source_page}` : 'Page not detected'}</small></span>
                      <span className={`question-batch__question-status ${issues.length || isDuplicate ? 'is-warning' : ''}`}>{isDuplicate ? 'Duplicate' : issues.length ? `${issues.length} check${issues.length === 1 ? '' : 's'}` : 'Ready'}</span>
                      <span className="question-batch__chevron" aria-hidden="true">⌄</span>
                    </button>
                    <button type="button" className="question-batch__remove" onClick={() => removeQuestion(question.client_id)} aria-label={`Remove question ${question.source_index}`}>Remove</button>
                  </header>

                  {expanded ? (
                    <div className="question-batch__question-body">
                      {question.candidate_origin === 'ai_generated_from_source' ? (
                        <section className="question-batch__grounding" aria-label={`Source grounding for question ${question.source_index}`}>
                          <header><span>Source-grounded draft</span><strong>{Math.round(question.grounding_confidence * 100)}% grounding confidence</strong></header>
                          <h3>{question.learning_objective || 'Learning objective needs review'}</h3>
                          <p>{question.source_grounding_note || 'Source-grounding note needs review.'}</p>
                          <small>{question.source_page ? `Page ${question.source_page}` : 'Page not detected'} · {question.source_evidence_kind} evidence{question.source_visual_description ? ` · ${question.source_visual_description}` : ''}</small>
                        </section>
                      ) : null}
                      {question.attention_reason ? <div className="question-batch__attention"><span>Check against PDF</span><p>{question.attention_reason}</p>{!question.visual_required && question.needs_human_attention ? <button type="button" onClick={() => updateQuestion(question.client_id, (current) => ({ ...current, needs_human_attention: false, attention_reason: '' }))}>Mark checked</button> : null}</div> : null}
                      {isDuplicate ? <div className="question-batch__attention"><span>Duplicate in this batch</span><p>Remove one copy or change the duplicated content before submitting.</p></div> : null}
                      {issues.length ? <ul className="question-batch__issues" aria-label={`Checks for question ${question.source_index}`}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}

                      <div className="question-batch__editor-grid">
                        <section className="question-batch__editor-section">
                          <div className="question-batch__editor-heading"><span>01</span><div><h3>Academic context</h3><p>Confirm where this question belongs.</p></div></div>
                          <div className="question-batch__fields two-columns">
                            <label><span>Subject</span><select value={question.subject} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, subject: event.target.value as Subject }))}>{availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                            <label><span>Difficulty</span><select value={question.difficulty} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, difficulty: event.target.value as QuestionDifficulty }))}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
                            <label className="is-wide"><span>Topic</span><input value={question.topic} maxLength={160} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, topic: event.target.value }))} /></label>
                            <fieldset className="is-wide"><legend>Eligible grades</legend><div className="question-batch__grade-picker">{GRADES.map((grade) => <button key={grade} type="button" aria-pressed={question.eligible_grade_levels.includes(grade)} className={question.eligible_grade_levels.includes(grade) ? 'is-selected' : ''} onClick={() => updateQuestion(question.client_id, (current) => ({ ...current, eligible_grade_levels: current.eligible_grade_levels.includes(grade) ? current.eligible_grade_levels.filter((item) => item !== grade) : [...current.eligible_grade_levels, grade].sort((a, b) => a - b) }))}>{grade}</button>)}</div></fieldset>
                          </div>
                        </section>

                        <section className="question-batch__editor-section">
                          <div className="question-batch__editor-heading"><span>02</span><div><h3>Question and answer</h3><p>Check the wording exactly as students should see it.</p></div></div>
                          <div className="question-batch__fields">
                            <label><span>Question type</span><select value={question.question_type} onChange={(event) => updateQuestionType(question.client_id, event.target.value as QuestionType)}><option value="multiple_choice">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer</option></select></label>
                            <label><span>Question wording</span><textarea value={question.question_text} rows={4} maxLength={4000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, question_text: event.target.value }))} /></label>
                            {question.question_type === 'multiple_choice' ? (
                              <fieldset className="question-batch__options"><legend>Answer options</legend>{question.options.map((option, optionIndex) => <label key={`${question.client_id}-option-${optionIndex}`}><span>{optionLabel(optionIndex)}</span><input value={option} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, options: current.options.map((item, index) => index === optionIndex ? event.target.value : item) }))} /><button type="button" onClick={() => updateQuestion(question.client_id, (current) => ({ ...current, options: current.options.filter((_, index) => index !== optionIndex) }))} disabled={question.options.length <= 2} aria-label={`Remove option ${optionLabel(optionIndex)}`}>×</button></label>)}<button type="button" className="question-batch__add-option" onClick={() => updateQuestion(question.client_id, (current) => ({ ...current, options: [...current.options, ''] }))} disabled={question.options.length >= 6}>+ Add option</button></fieldset>
                            ) : null}
                            <label><span>Correct answer</span>{question.question_type === 'multiple_choice' ? <select value={question.correct_answer} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, correct_answer: event.target.value }))}><option value="">Choose the correct option</option>{question.options.filter(Boolean).map((option, optionIndex) => <option key={`${option}-${optionIndex}`} value={option}>{optionLabel(optionIndex)}. {option}</option>)}</select> : question.question_type === 'true_false' ? <select value={question.correct_answer} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, correct_answer: event.target.value }))}><option value="True">True</option><option value="False">False</option></select> : <textarea rows={2} value={question.correct_answer} maxLength={2000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, correct_answer: event.target.value }))} />}</label>
                            {question.question_type === 'short_answer' ? (
                              <label><span>Accepted answers <em>one per line</em></span><textarea rows={4} value={question.accepted_answers.join('\n')} maxLength={4000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, accepted_answers: event.target.value.split('\n').map((answer) => answer.trim()).filter(Boolean).slice(0, 12) }))} /><small>Include the canonical answer plus only genuinely equivalent wording or notation. Anything else is reviewed in the background instead of being marked wrong automatically.</small></label>
                            ) : null}
                            <label><span>Teacher explanation <em>optional</em></span><textarea rows={3} value={question.explanation} maxLength={5000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, explanation: event.target.value }))} /></label>
                          </div>
                        </section>

                        <section className="question-batch__editor-section question-batch__editor-section--taxonomy">
                          <div className="question-batch__editor-heading"><span>03</span><div><h3>Suggested academic mapping</h3><p>AI-assisted proposal. Superadmin review remains the authority.</p></div><span className={`question-batch__confidence is-${confidenceLabel(taxonomy.confidence_score).toLocaleLowerCase()}`}>{confidenceLabel(taxonomy.confidence_score)} confidence · {Math.round(taxonomy.confidence_score * 100)}%</span></div>
                          <div className="question-batch__fields two-columns">
                            <label><span>Primary skill</span><input value={taxonomy.primary_skill_name} maxLength={160} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, taxonomy_proposal: { ...current.taxonomy_proposal, primary_skill_name: event.target.value } }))} /></label>
                            <label><span>Atomic subskill</span><input value={taxonomy.atomic_subskill_name} maxLength={200} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, taxonomy_proposal: { ...current.taxonomy_proposal, atomic_subskill_name: event.target.value } }))} /></label>
                            <label><span>Assessment objective</span><select value={taxonomy.assessment_process_code} onChange={(event) => updateQuestion(question.client_id, (current) => setCandidateAssessmentProcess(current, event.target.value as AssessmentProcessCode))}><option value="AO1">AO1 · Knowledge &amp; comprehension</option><option value="AO2">AO2 · Application &amp; procedure</option><option value="AO3">AO3 · Analysis &amp; interpretation</option><option value="AO4">AO4 · Evaluation &amp; judgment</option></select><small>{taxonomy.assessment_process_definition}</small></label>
                            <label><span>Cognitive process</span><input value={taxonomy.cognitive_process} readOnly aria-readonly="true" /><small>Kept consistent with {taxonomy.assessment_process_code}.</small></label>
                            <label className="is-wide"><span>Secondary skills <em>optional</em></span><input value={taxonomy.secondary_skill_names.join(', ')} maxLength={500} placeholder="Separate up to four skills with commas" onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, taxonomy_proposal: { ...current.taxonomy_proposal, secondary_skill_names: event.target.value.split(',').map((skill) => skill.trim()).filter(Boolean).slice(0, 4) } }))} /></label>
                            <label className="is-wide"><span>Evidence statement</span><textarea rows={3} value={taxonomy.evidence_statement} maxLength={500} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, taxonomy_proposal: { ...current.taxonomy_proposal, evidence_statement: event.target.value } }))} /><small>What one correct response would genuinely show—not a wider claim about mastery.</small></label>
                          </div>
                          <div className="question-batch__governance-note"><span aria-hidden="true">◆</span><p><strong>Proposal, not official evidence.</strong> This mapping enters <code>in_review</code>. It cannot affect a student Academic Profile unless governed content, curriculum and taxonomy approval are completed later.</p></div>
                        </section>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!visibleQuestions.length ? <div className="question-batch__empty"><span>✓</span><h3>No questions need a fix</h3><p>Switch off “Show issues only” to review the full batch.</p><button type="button" onClick={() => setShowOnlyIssues(false)}>Show all questions</button></div> : null}
          </div>

          <section className={`question-batch__submit ${blockingCount ? 'is-blocked' : 'is-ready'}`}>
            <div className="question-batch__submit-copy"><span>{blockingCount ? '!' : '✓'}</span><div><strong>{blockingCount ? 'Finish the checks before submitting' : 'Ready for governed review'}</strong><p>{blockingCount ? `${issueCount} question${issueCount === 1 ? '' : 's'} need a fix${duplicateCount ? ` and ${duplicateCount} duplicate signal${duplicateCount === 1 ? '' : 's'} remain` : ''}.` : `${questions.length} question${questions.length === 1 ? '' : 's'} will be added to My Pool with an in-review badge.`}</p></div></div>
            <label className="question-batch__confirmation"><input type="checkbox" checked={teacherConfirmed} onChange={(event) => setTeacherConfirmed(event.target.checked)} disabled={blockingCount > 0} /><span><strong>{generatedCount ? 'I checked the questions, answers and source grounding' : 'I checked the questions and answer key'}</strong><small>I understand the skill tags are proposals for human governance.</small></span></label>
            <button type="button" className="question-batch__primary" onClick={() => void submitBatch()} disabled={blockingCount > 0 || !teacherConfirmed || !questions.length || submitting}>{submitting ? 'Submitting safely…' : `Submit ${questions.length} for review`}</button>
          </section>
        </div>
      )}
    </section>
  );
};

export default QuestionBatchWorkspace;
