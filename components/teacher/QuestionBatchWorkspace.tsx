import React, { useMemo, useRef, useState } from 'react';
import type { QuestionDifficulty, QuestionType, Subject } from '../../types';
import {
  getQuestionCandidateIssues,
  MAX_TEACHER_QUESTION_PDF_BYTES,
  questionCandidateFingerprint,
  setCandidateAssessmentProcess,
  submitTeacherQuestionBatch,
  uploadAndExtractTeacherQuestionPdf,
  type AssessmentProcessCode,
  type TeacherQuestionBatchCandidate,
  type TeacherQuestionBatchSubmitResult,
  type TeacherQuestionPdfExtraction,
  type TeacherQuestionUploadStage,
} from '../../services/teacherQuestionBatchService';
import './QuestionBatchWorkspace.css';

const SUBJECTS: Subject[] = [
  'Maths', 'Science', 'Biology', 'Chemistry', 'Physics', 'English',
  'Russian Language', 'Kyrgyz Language', 'German Language', 'Geography',
  'Global Perspective', 'Travel & Tourism', 'ICT',
];
const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const STAGE_COPY: Record<TeacherQuestionUploadStage, { title: string; detail: string }> = {
  checking: { title: 'Checking the PDF', detail: 'Confirming the file is safe and readable.' },
  uploading: { title: 'Uploading privately', detail: 'The source paper is kept in protected teacher storage.' },
  extracting: { title: 'Finding questions and answers', detail: 'Reading text, layouts and answer keys. This can take a minute.' },
  securing: { title: 'Preparing your review', detail: 'Checking the extraction and securing its audit record.' },
};

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

const QuestionBatchWorkspace: React.FC<QuestionBatchWorkspaceProps> = ({
  defaultSubject,
  defaultTopic,
  restrictedSubjects,
  onBack,
  onSubmitted,
  onOpenMyPool,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploadStage, setUploadStage] = useState<TeacherQuestionUploadStage>('checking');
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

  const availableSubjects = useMemo(() => {
    if (!restrictedSubjects?.length) return SUBJECTS;
    const allowed = new Set(restrictedSubjects.map(subjectKey));
    const filtered = SUBJECTS.filter((subject) => allowed.has(subjectKey(subject)));
    return filtered.length ? filtered : SUBJECTS;
  }, [restrictedSubjects]);

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
    question.extraction_confidence < 0.7 || question.taxonomy_proposal.confidence_score < 0.7
  )).length, [questions]);
  const visibleQuestions = showOnlyIssues
    ? questions.filter((question) => (issueMap.get(question.client_id)?.length || 0) > 0
      || (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1)
    : questions;
  const blockingCount = useMemo(() => questions.filter((question) => (
    (issueMap.get(question.client_id)?.length || 0) > 0
      || (fingerprints.get(questionCandidateFingerprint(question)) || 0) > 1
  )).length, [fingerprints, issueMap, questions]);

  const chooseFile = (nextFile: File | null) => {
    setError(null);
    setExtraction(null);
    setQuestions([]);
    setResult(null);
    setTeacherConfirmed(false);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLocaleLowerCase().endsWith('.pdf')) {
      setFile(null);
      setError('Choose a PDF question paper.');
      return;
    }
    if (nextFile.size > MAX_TEACHER_QUESTION_PDF_BYTES) {
      setFile(null);
      setError('Use a PDF no larger than 6 MB. Splitting a large paper usually gives a cleaner review.');
      return;
    }
    setFile(nextFile);
  };

  const analysePdf = async () => {
    if (!file || working) return;
    setWorking(true);
    setError(null);
    try {
      const nextExtraction = await uploadAndExtractTeacherQuestionPdf(file, {
        preferredSubject: defaultSubject,
        preferredTopic: defaultTopic,
        onStageChange: setUploadStage,
      });
      const allowedSubjectKeys = new Set(availableSubjects.map(subjectKey));
      const fallbackSubject = availableSubjects.find((subject) => subjectKey(subject) === subjectKey(defaultSubject || ''))
        || availableSubjects[0];
      const reviewQuestions = nextExtraction.questions.map((question) => allowedSubjectKeys.has(subjectKey(question.subject))
        ? question
        : {
          ...question,
          subject: fallbackSubject,
          needs_human_attention: true,
          attention_reason: `The PDF suggested ${question.subject}. Confirm the closest subject you are assigned to teach.`,
        });
      setExtraction(nextExtraction);
      setQuestions(reviewQuestions);
      const firstAttention = reviewQuestions.find((question) => getQuestionCandidateIssues(question).length > 0)
        || reviewQuestions[0];
      setExpandedIds(firstAttention ? new Set([firstAttention.client_id]) : new Set());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The PDF could not be analysed.');
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
        return {
          ...question,
          question_type: questionType,
          options: ['True', 'False'],
          correct_answer: ['true', 'false'].includes(question.correct_answer.toLocaleLowerCase())
            ? question.correct_answer
            : 'True',
        };
      }
      if (questionType === 'short_answer') return { ...question, question_type: questionType, options: [] };
      const options = question.options.length >= 2 ? question.options : ['', '', '', ''];
      return { ...question, question_type: questionType, options };
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
      setResult(submission);
      await onSubmitted?.(submission);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The batch could not be submitted.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const resetWorkspace = () => {
    setFile(null);
    setExtraction(null);
    setQuestions([]);
    setExpandedIds(new Set());
    setTeacherConfirmed(false);
    setResult(null);
    setError(null);
    setLastRemoved(null);
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
            <div><strong>Academic Profile stays protected</strong><small>These questions can support your classroom, but they are not official learning evidence unless a later governed promotion is completed.</small></div>
          </div>
          <dl>
            <div><dt>Status</dt><dd>In review</dd></div>
            <div><dt>New questions</dt><dd>{result.created}</dd></div>
            <div><dt>Batch reference</dt><dd><code>{result.batchId.slice(0, 8)}</code></dd></div>
          </dl>
          <div className="question-batch__complete-actions">
            <button type="button" className="question-batch__primary" onClick={onOpenMyPool}>View in My Pool</button>
            <button type="button" className="question-batch__secondary" onClick={resetWorkspace}>Upload another PDF</button>
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
          <p>Upload one PDF. We will find the questions, answers and likely academic skills—then you stay in control of the final check.</p>
        </div>
        <span className="question-batch__private-badge">Private source · human reviewed</span>
      </header>

      <ol className="question-batch__steps" aria-label="Question batch progress">
        <li className={!extraction ? 'is-active' : 'is-complete'}><span>{extraction ? '✓' : '1'}</span><div><strong>Upload PDF</strong><small>Question paper + answer key</small></div></li>
        <li className={extraction ? 'is-active' : ''}><span>2</span><div><strong>Check questions</strong><small>Fix only what needs attention</small></div></li>
        <li><span>3</span><div><strong>Submit for review</strong><small>Superadmin governance queue</small></div></li>
      </ol>

      {error ? <div className="question-batch__error" role="alert"><span>!</span><div><strong>We could not finish that step</strong><p>{error}</p></div><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}

      {!extraction ? (
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
                chooseFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <input ref={fileInputRef} id="teacher-question-pdf" type="file" accept=".pdf,application/pdf" onChange={(event) => chooseFile(event.target.files?.[0] || null)} disabled={working} />
              {!file ? (
                <label htmlFor="teacher-question-pdf">
                  <span className="question-batch__upload-icon" aria-hidden="true">PDF</span>
                  <strong>Drop your question paper here</strong>
                  <small>or choose a PDF from your device</small>
                  <b>Choose PDF</b>
                </label>
              ) : (
                <div className="question-batch__file">
                  <span aria-hidden="true">PDF</span>
                  <div><strong>{file.name}</strong><small>{formatBytes(file.size)} · Ready to analyse</small></div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={working}>Replace</button>
                </div>
              )}
            </div>
            <div className="question-batch__upload-actions">
              <p><span>✓</span> Nothing is added until you review and submit.</p>
              <button type="button" className="question-batch__primary" onClick={() => void analysePdf()} disabled={!file || working}>{working ? STAGE_COPY[uploadStage].title : 'Find questions'}</button>
            </div>
            {working ? (
              <div className="question-batch__progress" role="status" aria-live="polite">
                <div className="question-batch__progress-orbit" aria-hidden="true"><span /><span /><span /></div>
                <div><strong>{STAGE_COPY[uploadStage].title}</strong><p>{STAGE_COPY[uploadStage].detail}</p></div>
              </div>
            ) : null}
          </main>

          <aside className="question-batch__upload-aside">
            <span className="question-batch__aside-number">01</span>
            <h2>What works best</h2>
            <ul>
              <li><span>✓</span><div><strong>One paper at a time</strong><small>Up to 50 questions, 60 pages or 6 MB.</small></div></li>
              <li><span>✓</span><div><strong>Include the answer key</strong><small>It makes the first draft much more accurate.</small></div></li>
              <li><span>✓</span><div><strong>Scans are welcome</strong><small>Clear, upright pages give the strongest result.</small></div></li>
            </ul>
            <div className="question-batch__safety-note"><span aria-hidden="true">◆</span><p><strong>Your PDF is private.</strong> It is stored in a teacher-only source vault and is never exposed as a public file.</p></div>
          </aside>
        </div>
      ) : (
        <div className="question-batch__review">
          <section className="question-batch__review-summary">
            <div><span className="question-batch__eyebrow">Extraction ready</span><h2>{extraction.document_title}</h2><p>{extraction.document_summary}</p><small>{extraction.sourceFileName} · {formatBytes(extraction.sourceFileSize)}{extraction.detectedPageCount ? ` · about ${extraction.detectedPageCount} pages` : ''}</small></div>
            <div className="question-batch__summary-metrics">
              <article><strong>{questions.length}</strong><span>Questions found</span></article>
              <article className={issueCount ? 'is-warning' : 'is-ready'}><strong>{issueCount}</strong><span>Need a fix</span></article>
              <article className={lowConfidenceCount ? 'is-check' : 'is-ready'}><strong>{lowConfidenceCount}</strong><span>Low-confidence tags</span></article>
            </div>
          </section>

          <section className="question-batch__bulk" aria-labelledby="batch-context-title">
            <div><span>Apply once</span><h3 id="batch-context-title">Set shared class context</h3><p>Use this only when the whole paper belongs to the same subject, topic or grade.</p></div>
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
                      <span className="question-batch__question-title"><strong>{question.question_text || 'Question wording needed'}</strong><small>{question.subject} · {question.topic} · {question.source_page ? `Page ${question.source_page}` : 'Page not detected'}</small></span>
                      <span className={`question-batch__question-status ${issues.length || isDuplicate ? 'is-warning' : ''}`}>{isDuplicate ? 'Duplicate' : issues.length ? `${issues.length} check${issues.length === 1 ? '' : 's'}` : 'Ready'}</span>
                      <span className="question-batch__chevron" aria-hidden="true">⌄</span>
                    </button>
                    <button type="button" className="question-batch__remove" onClick={() => removeQuestion(question.client_id)} aria-label={`Remove question ${question.source_index}`}>Remove</button>
                  </header>

                  {expanded ? (
                    <div className="question-batch__question-body">
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
            <label className="question-batch__confirmation"><input type="checkbox" checked={teacherConfirmed} onChange={(event) => setTeacherConfirmed(event.target.checked)} disabled={blockingCount > 0} /><span><strong>I checked the questions and answer key</strong><small>I understand the skill tags are proposals for human governance.</small></span></label>
            <button type="button" className="question-batch__primary" onClick={() => void submitBatch()} disabled={blockingCount > 0 || !teacherConfirmed || !questions.length || submitting}>{submitting ? 'Submitting safely…' : `Submit ${questions.length} for review`}</button>
          </section>
        </div>
      )}
    </section>
  );
};

export default QuestionBatchWorkspace;
