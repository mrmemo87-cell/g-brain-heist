from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def insert_before(path: str, marker: str, addition: str) -> None:
    replace_once(path, marker, addition + marker)


def append_once(path: str, marker: str, addition: str) -> None:
    text = read(path)
    if marker in text:
        return
    write(path, text.rstrip() + '\n\n' + addition.strip() + '\n')


# ---------------------------------------------------------------------------
# types.ts
# ---------------------------------------------------------------------------
replace_once(
    'types.ts',
    """  options?: (string | QuestionOption)[]; // For multiple choice - can be strings or objects with images\n  correct_answer: string;\n""",
    """  options?: (string | QuestionOption)[]; // For multiple choice - can be strings or objects with images\n  correct_answer: string;\n  accepted_answers?: string[];\n  grading_mode?: 'exact' | 'accepted_answers' | 'semantic_review';\n""",
)
replace_once(
    'types.ts',
    """  resume_correct_count?: number;\n  resume_score?: number;\n""",
    """  resume_correct_count?: number;\n  resume_pending_review_count?: number;\n  resume_score?: number;\n""",
)
replace_once('types.ts', '  is_correct: boolean;\n  time_taken_ms: number;\n  answered_at: string;\n  explanation: string | null;\n}\n\nexport interface AssignmentQuestionAnalysis', '  is_correct: boolean | null;\n  time_taken_ms: number;\n  answered_at: string;\n  explanation: string | null;\n}\n\nexport interface AssignmentQuestionAnalysis')
replace_once(
    'types.ts',
    """  incorrect: number;\n  total_questions: number; // Computed: correct + incorrect\n  completed_at: string;\n""",
    """  incorrect: number;\n  pending_review_count?: number;\n  grading_status?: 'final' | 'pending_review';\n  total_questions: number; // Computed: correct + incorrect + pending review\n  completed_at: string;\n""",
)
replace_once(
    'types.ts',
    """  student_answer: string;\n  is_correct: boolean;\n  time_taken_ms: number;\n""",
    """  student_answer: string;\n  is_correct: boolean | null;\n  grading_status?: 'graded' | 'under_review' | 'reviewing';\n  grading_source?: 'deterministic' | 'ai' | 'teacher';\n  grading_confidence?: number | null;\n  time_taken_ms: number;\n""",
)

# ---------------------------------------------------------------------------
# services/rpcGateway.ts
# ---------------------------------------------------------------------------
replace_once(
    'services/rpcGateway.ts',
    "return execute('rpc_get_student_active_assignment', {}, client);",
    "return execute('rpc_get_student_active_assignment_v2', {}, client);",
)
replace_once(
    'services/rpcGateway.ts',
    "return execute('rpc_get_student_pending_assignments', {}, client);",
    "return execute('rpc_get_student_pending_assignments_v2', {}, client);",
)
replace_once(
    'services/rpcGateway.ts',
    """  pending_review?: boolean;\n};\n""",
    """  pending_review?: boolean;\n  points_earned?: number;\n};\n""",
)

# ---------------------------------------------------------------------------
# services/gameService.ts
# ---------------------------------------------------------------------------
replace_once(
    'services/gameService.ts',
    """export type AssignmentSubmissionResult = {\n    status: 'submitted' | 'already_submitted';\n};\n\nexport const submit_assignment_result = async (payload: AssignmentResultInput): Promise<AssignmentSubmissionResult> => {\n    const { error } = await rpcSubmitAssignmentResult({\n""",
    """export type AssignmentSubmissionResult = {\n    status: 'submitted' | 'already_submitted';\n    correct?: number;\n    incorrect?: number;\n    pendingReviewCount?: number;\n    confirmedQuestionCount?: number;\n    accuracy?: number;\n    score?: number;\n    gradingStatus?: 'final' | 'pending_review';\n};\n\nexport type AssignmentAnswerSubmissionResult = {\n    isCorrect: boolean | null;\n    gradingStatus: 'graded' | 'under_review' | 'reviewing';\n    pendingReview: boolean;\n    pointsEarned: number;\n};\n\nexport const submit_assignment_result = async (payload: AssignmentResultInput): Promise<AssignmentSubmissionResult> => {\n    const { data, error } = await rpcSubmitAssignmentResult({\n""",
)
replace_once(
    'services/gameService.ts',
    """    return { status: 'submitted' };\n};\n\nexport const get_teacher_assignment_report = async (\n""",
    """    const result = (data || {}) as Record<string, unknown>;\n    return {\n        status: 'submitted',\n        correct: Number.isFinite(Number(result.correct)) ? Number(result.correct) : undefined,\n        incorrect: Number.isFinite(Number(result.incorrect)) ? Number(result.incorrect) : undefined,\n        pendingReviewCount: Number.isFinite(Number(result.pending_review_count)) ? Number(result.pending_review_count) : undefined,\n        confirmedQuestionCount: Number.isFinite(Number(result.confirmed_question_count)) ? Number(result.confirmed_question_count) : undefined,\n        accuracy: Number.isFinite(Number(result.accuracy)) ? Number(result.accuracy) : undefined,\n        score: Number.isFinite(Number(result.score)) ? Number(result.score) : undefined,\n        gradingStatus: result.grading_status === 'pending_review' ? 'pending_review' : 'final',\n    };\n};\n\nexport const get_teacher_assignment_report = async (\n""",
)
replace_once(
    'services/gameService.ts',
    """export const submit_assignment_answer = async (payload: StudentAnswerInput): Promise<void> => {\n    const { error } = await rpcSubmitAssignmentAnswer({\n        p_assignment_id: payload.assignmentId,\n        p_question_id: payload.questionId,\n        p_question_text: payload.questionText,\n        p_correct_answer: payload.correctAnswer,\n        p_student_answer: payload.studentAnswer,\n        p_is_correct: payload.isCorrect,\n        p_time_taken_ms: payload.timeTakenMs || 0,\n    });\n\n    if (error) {\n        console.error('Failed to submit assignment answer:', error);\n        // Don't throw - this is a non-critical tracking feature\n    }\n};\n""",
    """export const submit_assignment_answer = async (payload: StudentAnswerInput): Promise<AssignmentAnswerSubmissionResult> => {\n    const { data, error } = await rpcSubmitAssignmentAnswer({\n        p_assignment_id: payload.assignmentId,\n        p_question_id: payload.questionId,\n        p_question_text: payload.questionText,\n        p_correct_answer: payload.correctAnswer,\n        p_student_answer: payload.studentAnswer,\n        p_is_correct: payload.isCorrect,\n        p_time_taken_ms: payload.timeTakenMs || 0,\n    });\n\n    if (error) {\n        console.error('Failed to submit assignment answer:', error);\n        throw new Error(error.message || 'Failed to save assignment answer');\n    }\n\n    const result = (data || {}) as Record<string, unknown>;\n    const isCorrect = typeof result.is_correct === 'boolean' ? result.is_correct : null;\n    const gradingStatus = result.grading_status === 'under_review'\n        ? 'under_review'\n        : result.grading_status === 'reviewing'\n            ? 'reviewing'\n            : 'graded';\n    return {\n        isCorrect,\n        gradingStatus,\n        pendingReview: result.pending_review === true || gradingStatus !== 'graded',\n        pointsEarned: Math.max(0, Number(result.points_earned) || 0),\n    };\n};\n""",
)
replace_once(
    'services/gameService.ts',
    """        total_questions: (a.correct || 0) + (a.incorrect || 0)\n""",
    """        total_questions: (a.correct || 0) + (a.incorrect || 0) + (a.pending_review_count || 0)\n""",
)

# ---------------------------------------------------------------------------
# services/teacherQuestionBatchService.ts
# ---------------------------------------------------------------------------
replace_once(
    'services/teacherQuestionBatchService.ts',
    """  options: string[];\n  correct_answer: string;\n  explanation: string;\n""",
    """  options: string[];\n  correct_answer: string;\n  accepted_answers: string[];\n  explanation: string;\n""",
)
replace_once(
    'services/teacherQuestionBatchService.ts',
    """    learning_objective: candidate.learning_objective || '',\n    options: Array.isArray(candidate.options) ? candidate.options : [],\n""",
    """    learning_objective: candidate.learning_objective || '',\n    options: Array.isArray(candidate.options) ? candidate.options : [],\n    accepted_answers: Array.isArray(candidate.accepted_answers)\n      ? candidate.accepted_answers.map((answer) => String(answer).trim()).filter(Boolean).slice(0, 12)\n      : candidate.correct_answer?.trim() ? [candidate.correct_answer.trim()] : [],\n""",
)
replace_once(
    'services/teacherQuestionBatchService.ts',
    """  candidate.question_text,\n  candidate.correct_answer,\n  ...candidate.options,\n""",
    """  candidate.question_text,\n  candidate.correct_answer,\n  ...candidate.accepted_answers,\n  ...candidate.options,\n""",
)
insert_before(
    'services/teacherQuestionBatchService.ts',
    """  if (candidate.question_type === 'multiple_choice') {\n""",
    """  if (candidate.question_type === 'short_answer') {\n    const acceptedAnswers = candidate.accepted_answers.map((answer) => answer.trim()).filter(Boolean);\n    if (!acceptedAnswers.length) issues.push('Add at least one accepted answer.');\n    if (acceptedAnswers.length > 12) issues.push('Use no more than 12 accepted answers.');\n    if (new Set(acceptedAnswers.map(normalize)).size !== acceptedAnswers.length) issues.push('Remove duplicate accepted answers.');\n    if (candidate.correct_answer.trim() && !acceptedAnswers.some((answer) => normalize(answer) === normalize(candidate.correct_answer))) {\n      issues.push('Include the canonical correct answer in the accepted-answer list.');\n    }\n  }\n""",
)
replace_once(
    'services/teacherQuestionBatchService.ts',
    """    correct_answer: question.correct_answer.trim(),\n    explanation: question.explanation.trim(),\n""",
    """    correct_answer: question.correct_answer.trim(),\n    accepted_answers: question.question_type === 'short_answer'\n      ? [...new Map([question.correct_answer, ...question.accepted_answers]\n          .map((answer) => answer.trim())\n          .filter(Boolean)\n          .map((answer) => [normalize(answer), answer])).values()].slice(0, 12)\n      : [question.correct_answer.trim()],\n    grading_mode: question.question_type === 'short_answer' ? 'accepted_answers' : 'exact',\n    grading_config: question.question_type === 'short_answer' ? { semantic_fallback: true } : {},\n    explanation: question.explanation.trim(),\n""",
)
replace_once(
    'services/teacherQuestionBatchService.ts',
    """  const { data, error } = await supabase.rpc('rpc_teacher_submit_question_batch_v2', {\n""",
    """  const { data, error } = await supabase.rpc('rpc_teacher_submit_question_batch_v3', {\n""",
)

# ---------------------------------------------------------------------------
# components/teacher/QuestionBatchWorkspace.tsx
# ---------------------------------------------------------------------------
replace_once(
    'components/teacher/QuestionBatchWorkspace.tsx',
    """      if (questionType === 'true_false') {\n        return {\n          ...question,\n          question_type: questionType,\n          options: ['True', 'False'],\n          correct_answer: ['true', 'false'].includes(question.correct_answer.toLocaleLowerCase())\n            ? question.correct_answer\n            : 'True',\n        };\n      }\n      if (questionType === 'short_answer') return { ...question, question_type: questionType, options: [] };\n      const options = question.options.length >= 2 ? question.options : ['', '', '', ''];\n      return { ...question, question_type: questionType, options };\n""",
    """      if (questionType === 'true_false') {\n        const correctAnswer = ['true', 'false'].includes(question.correct_answer.toLocaleLowerCase())\n          ? question.correct_answer\n          : 'True';\n        return {\n          ...question,\n          question_type: questionType,\n          options: ['True', 'False'],\n          correct_answer: correctAnswer,\n          accepted_answers: [correctAnswer],\n        };\n      }\n      if (questionType === 'short_answer') {\n        const canonical = question.correct_answer.trim();\n        return {\n          ...question,\n          question_type: questionType,\n          options: [],\n          accepted_answers: question.accepted_answers.length\n            ? question.accepted_answers\n            : canonical ? [canonical] : [],\n        };\n      }\n      const options = question.options.length >= 2 ? question.options : ['', '', '', ''];\n      return { ...question, question_type: questionType, options, accepted_answers: question.correct_answer ? [question.correct_answer] : [] };\n""",
)
insert_before(
    'components/teacher/QuestionBatchWorkspace.tsx',
    """                            <label><span>Teacher explanation <em>optional</em></span><textarea rows={3} value={question.explanation} maxLength={5000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, explanation: event.target.value }))} /></label>\n""",
    """                            {question.question_type === 'short_answer' ? (\n                              <label><span>Accepted answers <em>one per line</em></span><textarea rows={4} value={question.accepted_answers.join('\\n')} maxLength={4000} onChange={(event) => updateQuestion(question.client_id, (current) => ({ ...current, accepted_answers: event.target.value.split('\\n').map((answer) => answer.trim()).filter(Boolean).slice(0, 12) }))} /><small>Include the canonical answer plus only genuinely equivalent wording or notation. Anything else is reviewed in the background instead of being marked wrong automatically.</small></label>\n                            ) : null}\n""",
)

# ---------------------------------------------------------------------------
# supabase/functions/teacher_question_pdf_extract/index.ts
# ---------------------------------------------------------------------------
replace_once(
    'supabase/functions/teacher_question_pdf_extract/index.ts',
    '          "difficulty", "question_type", "question_text", "options", "correct_answer",\n',
    '          "difficulty", "question_type", "question_text", "options", "correct_answer", "accepted_answers",\n',
)
replace_once(
    'supabase/functions/teacher_question_pdf_extract/index.ts',
    '          correct_answer: { type: "string" },\n          explanation: { type: "string" },\n',
    '          correct_answer: { type: "string" },\n          accepted_answers: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },\n          explanation: { type: "string" },\n',
)
replace_once(
    'supabase/functions/teacher_question_pdf_extract/index.ts',
    '    const correctAnswer = String(raw.correct_answer || "").trim();\n    const questionText = String(raw.question_text || "").trim();\n',
    '    const correctAnswer = String(raw.correct_answer || "").trim();\n    const acceptedAnswers = [...new Map([correctAnswer, ...(Array.isArray(raw.accepted_answers) ? raw.accepted_answers : [])]\n      .map((answer) => String(answer).trim())\n      .filter(Boolean)\n      .map((answer) => [answer.toLocaleLowerCase(), answer])).values()].slice(0, 12);\n    const questionText = String(raw.question_text || "").trim();\n',
)
replace_once(
    'supabase/functions/teacher_question_pdf_extract/index.ts',
    '      correct_answer: correctAnswer.slice(0, 2000),\n      explanation,\n',
    '      correct_answer: correctAnswer.slice(0, 2000),\n      accepted_answers: questionType === "short_answer" ? acceptedAnswers : correctAnswer ? [correctAnswer] : [],\n      explanation,\n',
)
insert_before(
    'supabase/functions/teacher_question_pdf_extract/index.ts',
    '      "For multiple-choice questions, use 2-6 unique options and make correct_answer exactly equal to one option. True/false options must be True and False.",\n',
    '      "For every question return accepted_answers. For multiple-choice and true/false use only [correct_answer]. For short answers put the canonical answer first, followed by at most 11 genuinely equivalent wording, abbreviation, symbol, or notation variants supported by the source. Never include partial, broader, or merely related answers.",\n',
)

# ---------------------------------------------------------------------------
# supabase/migrations/20260920170100_short_answer_grading_compatibility.sql
# ---------------------------------------------------------------------------
insert_before(
    'supabase/migrations/20260920170100_short_answer_grading_compatibility.sql',
    """          'resume_score', (\n""",
    """          'resume_pending_review_count', (\n            select count(*) filter (where saa.grading_status in ('under_review', 'reviewing'))::integer\n            from public.student_assignment_answers saa\n            where saa.assignment_id = a.id\n              and saa.student_id = v_student_id\n          ),\n""",
)
insert_before(
    'supabase/migrations/20260920170100_short_answer_grading_compatibility.sql',
    """-- Legacy completed-answer readers are also prevented from revealing a pending\n""",
    """create or replace function public.rpc_get_student_active_assignment_v2()\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''\nas $function$\ndeclare\n  v_pending jsonb;\nbegin\n  v_pending := public.rpc_get_student_pending_assignments_v2();\n  if jsonb_typeof(v_pending) <> 'array' or jsonb_array_length(v_pending) = 0 then\n    return null;\n  end if;\n  return v_pending -> 0;\nend;\n$function$;\n\nrevoke all on function public.rpc_get_student_active_assignment_v2()\n  from public, anon;\ngrant execute on function public.rpc_get_student_active_assignment_v2()\n  to authenticated, service_role;\n\n""",
)

# ---------------------------------------------------------------------------
# components/QuestView.tsx
# ---------------------------------------------------------------------------
replace_once(
    'components/QuestView.tsx',
    "type QuestMode = 'practice' | 'teacher' | 'assignment' | 'ftue_training';\n",
    "type QuestMode = 'practice' | 'teacher' | 'assignment' | 'ftue_training';\ntype AssignmentAnswerReviewStatus = 'correct' | 'incorrect' | 'under_review' | null;\n",
)
replace_once(
    'components/QuestView.tsx',
    """  const [freeformAnswer, setFreeformAnswer] = useState('');\n  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);\n""",
    """  const [freeformAnswer, setFreeformAnswer] = useState('');\n  const [assignmentAnswerReviewStatus, setAssignmentAnswerReviewStatus] = useState<AssignmentAnswerReviewStatus>(null);\n  const [assignmentPendingReviews, setAssignmentPendingReviews] = useState(0);\n  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    setAssignmentSubmissionState('idle');\n    setAssignmentSubmissionError(null);\n    setAssignmentStartTime(null);\n""",
    """    setAssignmentSubmissionState('idle');\n    setAssignmentSubmissionError(null);\n    setAssignmentAnswerReviewStatus(null);\n    setAssignmentPendingReviews(Math.max(0, Number(assignment.resume_pending_review_count) || 0));\n    setFreeformAnswer('');\n    setAssignmentStartTime(null);\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    setNextActionLabel('');\n    setFreeformAnswer('');\n    await loadSubjects();\n""",
    """    setNextActionLabel('');\n    setFreeformAnswer('');\n    setAssignmentAnswerReviewStatus(null);\n    setAssignmentPendingReviews(0);\n    await loadSubjects();\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    const resumedCorrect = Math.max(0, Number(activeAssignment.resume_correct_count) || 0);\n    const resumedScore = Math.max(0, Number(activeAssignment.resume_score) || 0);\n""",
    """    const resumedCorrect = Math.max(0, Number(activeAssignment.resume_correct_count) || 0);\n    const resumedPendingReviews = Math.max(0, Number(activeAssignment.resume_pending_review_count) || 0);\n    const resumedScore = Math.max(0, Number(activeAssignment.resume_score) || 0);\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    setSelectedOption(null);\n    setAnswerResponse(null);\n    setScore({\n""",
    """    setSelectedOption(null);\n    setAnswerResponse(null);\n    setFreeformAnswer('');\n    setAssignmentAnswerReviewStatus(null);\n    setAssignmentPendingReviews(resumedPendingReviews);\n    setScore({\n""",
)
replace_once(
    'components/QuestView.tsx',
    """      if (submissionResult.status === 'already_submitted') {\n        console.info('[QuestView] Assignment was already submitted on retry. Treating as success.');\n      }\n\n      setAssignmentSubmissionState('submitted');\n""",
    """      if (submissionResult.status === 'already_submitted') {\n        console.info('[QuestView] Assignment was already submitted on retry. Treating as success.');\n      } else {\n        setAssignmentPendingReviews(submissionResult.pendingReviewCount ?? assignmentPendingReviews);\n        setScore((current) => ({\n          ...current,\n          correct: submissionResult.correct ?? current.correct,\n          xp: submissionResult.score ?? current.xp,\n        }));\n      }\n\n      setAssignmentSubmissionState('submitted');\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    assignmentStartTime,\n  ]);\n""",
    """    assignmentStartTime,\n    assignmentPendingReviews,\n  ]);\n""",
)
insert_before(
    'components/QuestView.tsx',
    """        const result = await GameService.submit_question_answer(\n""",
    """        if (mode === 'assignment' && activeAssignment?.assignment_id && currentQuestion.question_type === 'short_answer') {\n          const grading = await GameService.submit_assignment_answer({\n            assignmentId: activeAssignment.assignment_id,\n            questionId: currentQuestion.id,\n            questionText: currentQuestion.question_text,\n            correctAnswer: currentQuestion.correct_answer || '',\n            studentAnswer: option,\n            isCorrect: false,\n            timeTakenMs: questionStartTime ? Date.now() - questionStartTime : 0,\n          });\n          const pendingReview = grading.pendingReview || grading.isCorrect === null;\n          const confirmedCorrect = grading.isCorrect === true;\n          setAssignmentAnswerReviewStatus(pendingReview ? 'under_review' : confirmedCorrect ? 'correct' : 'incorrect');\n          if (pendingReview) setAssignmentPendingReviews((current) => current + 1);\n          if (confirmedCorrect) {\n            setScore((current) => ({ ...current, correct: current.correct + 1, xp: current.xp + grading.pointsEarned }));\n            audioService.play('correct');\n          } else if (!pendingReview) {\n            audioService.play('wrong');\n          }\n          setQuestionStartTime(null);\n          const isLastQuestion = currentQuestionIndex >= teacherQuestions.length - 1;\n          const proceed = () => {\n            setNextAction(null);\n            setNextActionLabel('');\n            setAssignmentAnswerReviewStatus(null);\n            setFreeformAnswer('');\n            setSelectedOption(null);\n            if (isLastQuestion) {\n              audioService.play('tada');\n              setStage('completed');\n            } else {\n              setCurrentQuestionIndex((previous) => previous + 1);\n              setQuestionStartTime(Date.now());\n            }\n          };\n          setNextAction(() => proceed);\n          setNextActionLabel(isLastQuestion ? 'View results' : 'Next question');\n          return;\n        }\n\n""",
)
replace_once(
    'components/QuestView.tsx',
    """        <div className=\"grid grid-cols-1 md:grid-cols-2 gap-4\">\n          {rawOptions.map((option, index) => {\n            const optionText = getOptionText(option);\n            const optionImageUrl = getOptionImageUrl(option);\n            return (\n              <button\n                key={index}\n                disabled={!!answerResponse || isSubmitting}\n                onClick={() => handleAnswerSubmit(optionText)}\n                className={getOptionClasses(optionText, correctAnswer)}\n              >\n                <div className=\"flex flex-col items-start w-full\">\n                  <div className=\"flex items-start\">\n                    <span className=\"font-bold mr-2\">{String.fromCharCode(65 + index)}.</span>\n                    <span>{optionText}</span>\n                  </div>\n                  {optionImageUrl && (\n                    <img\n                      src={optionImageUrl}\n                      alt={`Option ${String.fromCharCode(65 + index)}`}\n                      className=\"mt-2 max-h-24 rounded border border-gray-600 object-contain\"\n                    />\n                  )}\n                </div>\n              </button>\n            );\n          })}\n        </div>\n""",
    """        {mode === 'assignment' && activeTeacherQuestion?.question_type === 'short_answer' ? (\n          <div className=\"card-glass p-5 border border-cyan-500/30\">\n            <label className=\"block text-left\">\n              <span className=\"text-xs font-bold uppercase tracking-[0.18em] text-cyan-200\">Your answer</span>\n              <textarea\n                value={freeformAnswer}\n                onChange={(event) => setFreeformAnswer(event.target.value)}\n                disabled={isSubmitting || assignmentAnswerReviewStatus !== null}\n                rows={4}\n                maxLength={2000}\n                className=\"mt-3 w-full rounded-xl border border-cyan-500/30 bg-slate-950/70 p-4 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60\"\n                placeholder=\"Type your answer here…\"\n              />\n            </label>\n            <div className=\"mt-3 flex items-center justify-between gap-3\">\n              <p className=\"text-xs text-slate-400\">Equivalent wording or notation may be accepted automatically.</p>\n              <button\n                type=\"button\"\n                disabled={!freeformAnswer.trim() || isSubmitting || assignmentAnswerReviewStatus !== null}\n                onClick={() => { void handleAnswerSubmit(freeformAnswer.trim()); }}\n                className=\"rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50\"\n              >\n                {isSubmitting ? 'Saving…' : 'Submit answer'}\n              </button>\n            </div>\n          </div>\n        ) : (\n          <div className=\"grid grid-cols-1 md:grid-cols-2 gap-4\">\n            {rawOptions.map((option, index) => {\n              const optionText = getOptionText(option);\n              const optionImageUrl = getOptionImageUrl(option);\n              return (\n                <button\n                  key={index}\n                  disabled={!!answerResponse || isSubmitting}\n                  onClick={() => handleAnswerSubmit(optionText)}\n                  className={getOptionClasses(optionText, correctAnswer)}\n                >\n                  <div className=\"flex flex-col items-start w-full\">\n                    <div className=\"flex items-start\">\n                      <span className=\"font-bold mr-2\">{String.fromCharCode(65 + index)}.</span>\n                      <span>{optionText}</span>\n                    </div>\n                    {optionImageUrl && (\n                      <img\n                        src={optionImageUrl}\n                        alt={`Option ${String.fromCharCode(65 + index)}`}\n                        className=\"mt-2 max-h-24 rounded border border-gray-600 object-contain\"\n                      />\n                    )}\n                  </div>\n                </button>\n              );\n            })}\n          </div>\n        )}\n""",
)
insert_before(
    'components/QuestView.tsx',
    """        {answerResponse && (\n""",
    """        {assignmentAnswerReviewStatus && (\n          <div ref={answerFeedbackRef} className={`mt-6 rounded-2xl border-2 p-6 text-center ${\n            assignmentAnswerReviewStatus === 'correct'\n              ? 'border-green-400/60 bg-green-500/10'\n              : assignmentAnswerReviewStatus === 'incorrect'\n                ? 'border-red-400/60 bg-red-500/10'\n                : 'border-amber-400/60 bg-amber-500/10'\n          }`}>\n            <div className=\"text-5xl mb-3\">{assignmentAnswerReviewStatus === 'correct' ? '✓' : assignmentAnswerReviewStatus === 'incorrect' ? '✗' : '⏳'}</div>\n            <h3 className={`text-2xl font-bold ${assignmentAnswerReviewStatus === 'correct' ? 'text-green-300' : assignmentAnswerReviewStatus === 'incorrect' ? 'text-red-300' : 'text-amber-300'}`}>\n              {assignmentAnswerReviewStatus === 'correct' ? 'Correct' : assignmentAnswerReviewStatus === 'incorrect' ? 'Incorrect' : 'Under review'}\n            </h3>\n            <p className=\"mt-2 text-sm text-slate-200\">\n              {assignmentAnswerReviewStatus === 'under_review'\n                ? 'Your answer has been saved. You can continue now; your confirmed score will update automatically after review.'\n                : assignmentAnswerReviewStatus === 'correct'\n                  ? 'Your answer matched the accepted marking scheme.'\n                  : 'This answer was marked incorrect by the confirmed marking rules.'}\n            </p>\n            {nextAction && (\n              <button onClick={nextAction} className=\"mt-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-3 text-lg font-bold text-white transition hover:scale-105\">\n                {nextActionLabel || 'Continue'} →\n              </button>\n            )}\n          </div>\n        )}\n""",
)
replace_once(
    'components/QuestView.tsx',
    """              {mode === 'assignment'\n                ? (() => {\n                    const attempted = (\n                      (Number(activeAssignment?.resume_answered_count) || 0)\n                      + questionPerformances.length\n                    );\n                    return attempted > 0 ? `${Math.round((score.correct / attempted) * 100)}%` : '—';\n                  })()\n""",
    """              {mode === 'assignment'\n                ? assignmentPendingReviews > 0\n                  ? 'Pending review'\n                  : (() => {\n                      const attempted = (\n                        (Number(activeAssignment?.resume_answered_count) || 0)\n                        + questionPerformances.length\n                      );\n                      return attempted > 0 ? `${Math.round((score.correct / attempted) * 100)}%` : '—';\n                    })()\n""",
)
replace_once(
    'components/QuestView.tsx',
    """            <p className=\"font-heading text-2xl text-white mt-1\">\n              {mode === 'assignment' ? Math.round(score.xp) : Math.round(calculateMissionScore(questionScores))}\n            </p>\n""",
    """            <p className=\"font-heading text-2xl text-white mt-1\">\n              {mode === 'assignment' ? Math.round(score.xp) : Math.round(calculateMissionScore(questionScores))}\n            </p>\n            {mode === 'assignment' && (\n              <p className=\"mt-1 text-xs text-slate-400\">{score.correct} confirmed correct{assignmentPendingReviews ? ` · ${assignmentPendingReviews} under review` : ''}</p>\n            )}\n""",
)
replace_once(
    'components/QuestView.tsx',
    """    const accuracyPercent = mode === 'assignment'\n      ? Math.round((score.correct / Math.max(1, totalQuestions)) * 100)\n""",
    """    const accuracyPercent = mode === 'assignment'\n      ? assignmentPendingReviews > 0 ? null : Math.round((score.correct / Math.max(1, totalQuestions)) * 100)\n""",
)
replace_once(
    'components/QuestView.tsx',
    """          <p className=\"text-lg mb-6\">\n            You answered <span className=\"font-bold text-white\">{displayedCorrectAnswers}</span>\n            {typeof displayedTotalQuestions === 'number' ? (\n              <>\n                {' '}out of <span className=\"font-bold text-white\">{displayedTotalQuestions}</span> questions\n              </>\n            ) : (\n              ' questions'\n            )} correctly.\n          </p>\n""",
    """          <p className=\"text-lg mb-3\">\n            You answered <span className=\"font-bold text-white\">{displayedCorrectAnswers}</span>\n            {typeof displayedTotalQuestions === 'number' ? (\n              <>\n                {' '}out of <span className=\"font-bold text-white\">{displayedTotalQuestions}</span> questions\n              </>\n            ) : (\n              ' questions'\n            )} correctly.\n          </p>\n          {isAssignmentRun && assignmentPendingReviews > 0 && (\n            <div className=\"mb-6 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-left text-sm text-amber-100\">\n              <p className=\"font-bold\">{assignmentPendingReviews} answer{assignmentPendingReviews === 1 ? '' : 's'} under review</p>\n              <p className=\"mt-1 text-amber-100/80\">This is your confirmed result for now. Your stored score will update automatically when review finishes.</p>\n            </div>\n          )}\n""",
)
replace_once(
    'components/QuestView.tsx',
    """                  setAssignmentSubmissionState('idle');\n                  setAssignmentSubmissionError(null);\n                  hydrateAssignment({ showLoading: true });\n""",
    """                  setAssignmentSubmissionState('idle');\n                  setAssignmentSubmissionError(null);\n                  setAssignmentAnswerReviewStatus(null);\n                  setAssignmentPendingReviews(0);\n                  setFreeformAnswer('');\n                  hydrateAssignment({ showLoading: true });\n""",
)

# ---------------------------------------------------------------------------
# Regression coverage
# ---------------------------------------------------------------------------
Path('tests/shortAnswerAssignmentGrading.test.ts').write_text("""import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport test from 'node:test';\n\nconst quest = fs.readFileSync('components/QuestView.tsx', 'utf8');\nconst gateway = fs.readFileSync('services/rpcGateway.ts', 'utf8');\nconst gameService = fs.readFileSync('services/gameService.ts', 'utf8');\nconst teacherService = fs.readFileSync('services/teacherQuestionBatchService.ts', 'utf8');\nconst workspace = fs.readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');\nconst pdfEdge = fs.readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');\nconst reviewEdge = fs.readFileSync('supabase/functions/assignment_short_answer_review/index.ts', 'utf8');\nconst migration = fs.readFileSync('supabase/migrations/20260920170000_short_answer_background_grading.sql', 'utf8');\nconst compatibility = fs.readFileSync('supabase/migrations/20260920170100_short_answer_grading_compatibility.sql', 'utf8');\n\ntest('student assignment readers use protected v2 payloads', () => {\n  assert.match(gateway, /rpc_get_student_pending_assignments_v2/);\n  assert.match(gateway, /rpc_get_student_active_assignment_v2/);\n  assert.match(compatibility, /- 'accepted_answers'/);\n  assert.match(compatibility, /- 'correct_answer'/);\n  assert.match(compatibility, /resume_pending_review_count/);\n});\n\ntest('short answers bypass legacy exact-answer feedback in assignments', () => {\n  assert.match(quest, /currentQuestion\.question_type === 'short_answer'/);\n  assert.match(quest, /GameService\.submit_assignment_answer/);\n  assert.match(quest, /Under review/);\n  assert.match(quest, /Your answer has been saved\. You can continue now/);\n  assert.match(quest, /placeholder=\"Type your answer here…\"/);\n  assert.match(gameService, /AssignmentAnswerSubmissionResult/);\n});\n\ntest('teacher PDF workflow carries reviewed accepted-answer variants', () => {\n  assert.match(pdfEdge, /accepted_answers/);\n  assert.match(pdfEdge, /genuinely equivalent wording, abbreviation, symbol, or notation variants/);\n  assert.match(teacherService, /rpc_teacher_submit_question_batch_v3/);\n  assert.match(teacherService, /semantic_fallback: true/);\n  assert.match(workspace, /Accepted answers/);\n  assert.match(workspace, /one per line/);\n});\n\ntest('background grading is durable and non-blocking', () => {\n  assert.match(migration, /grading_status = 'under_review'/);\n  assert.match(migration, /pending_review_count/);\n  assert.match(reviewEdge, /EdgeRuntime\.waitUntil/);\n  assert.match(reviewEdge, /for \(let attempt = 1; attempt <= 2/);\n  assert.match(reviewEdge, /rpc_release_short_answer_review/);\n});\n""", encoding='utf-8')

print('Short-answer assignment flow patched.')
