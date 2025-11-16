import React, { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchSessionById,
  finaliseSession,
  IeltsAnalytics,
  IeltsListeningBlock,
  IeltsQuestion,
  IeltsReadingBlock,
  IeltsSessionRecord,
  IeltsWritingTask,
} from '@/services/ieltsService';

const stepLabels = ['Reading', 'Listening', 'Writing', 'Review & Submit'];

const getModuleLabel = (session?: IeltsSessionRecord) => {
  const value = session?.module ?? session?.module_type ?? 'general';
  return value === 'academic' ? 'Academic' : 'General Training';
};

const useWordCount = (value: string) => {
  if (!value.trim()) return 0;
  return value.trim().split(/\s+/).length;
};

const IeltsSession: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
  const [readingAnswers, setReadingAnswers] = useState<Record<string, string>>({});
  const [listeningAnswers, setListeningAnswers] = useState<Record<string, string>>({});
  const [writingAnswer, setWritingAnswer] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['ielts-session', sessionId],
    queryFn: () => fetchSessionById(sessionId),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (!session) {
      return;
    }
    if (session.reading_answers) {
      setReadingAnswers(session.reading_answers ?? {});
    }
    if (session.listening_answers) {
      setListeningAnswers(session.listening_answers ?? {});
    }
    if (session.writing_answer) {
      setWritingAnswer(session.writing_answer ?? '');
    }
  }, [session]);

  const isCompleted = session?.status === 'completed' || Boolean(session?.completed_at);
  const readingQuestions = session?.reading_block?.questions ?? [];
  const listeningQuestions = session?.listening_block?.questions ?? [];
  const wordsWritten = useWordCount(writingAnswer);

  const finaliseMutation = useMutation({
    mutationFn: () => finaliseSession(sessionId, readingAnswers, listeningAnswers, writingAnswer),
    onSuccess: (updated) => {
      queryClient.setQueryData(['ielts-session', sessionId], updated);
    },
  });

  const ensureStepValid = () => {
    setValidationMessage(null);
    if (activeStep === 0) {
      const answered = readingQuestions.every((question) => Boolean(readingAnswers[question.id]?.trim()));
      if (!answered) {
        setValidationMessage('Answer every reading question before continuing.');
        return false;
      }
    }
    if (activeStep === 1) {
      const answered = listeningQuestions.every((question) => Boolean(listeningAnswers[question.id]?.trim()));
      if (!answered) {
        setValidationMessage('Answer every listening question before continuing.');
        return false;
      }
    }
    if (activeStep === 2 && !writingAnswer.trim()) {
      setValidationMessage('Provide a response for the writing task.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!ensureStepValid()) {
      return;
    }
    setActiveStep((prev) => Math.min(prev + 1, stepLabels.length - 1));
  };

  const handleBack = () => {
    setValidationMessage(null);
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = () => {
    if (!ensureStepValid()) {
      return;
    }
    finaliseMutation.mutate();
  };

  const renderChoice = (
    block: 'reading' | 'listening',
    question: IeltsQuestion,
    answerMap: Record<string, string>,
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) => {
    const value = answerMap[question.id] ?? '';
    if (question.type === 'mcq') {
      const options = question.options ?? [];
      return (
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`${block}-${question.id}`}
                value={option}
                checked={value === option}
                onChange={() => setter((prev) => ({ ...prev, [question.id]: option }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    if (question.type === 'tfng') {
      const options = ['True', 'False', 'Not Given'];
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => setter((prev) => ({ ...prev, [question.id]: option }))}
              className={`rounded-full border px-3 py-1 text-sm ${
                value === option ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => setter((prev) => ({ ...prev, [question.id]: event.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
        placeholder="Type your answer"
      />
    );
  };

  const renderQuestionBlock = (title: string, block?: IeltsReadingBlock | IeltsListeningBlock | null) => {
    if (!block) {
      return <p className="text-sm text-slate-500">This section is not available for the session.</p>;
    }

    const answerState = title === 'Reading' ? readingAnswers : listeningAnswers;
    const setter = title === 'Reading' ? setReadingAnswers : setListeningAnswers;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{block.title}</h3>
          {'passage' in block && (
            <p className="mt-3 whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-700">
              {block.passage}
            </p>
          )}
          {'audioScript' in block && (
            <p className="mt-3 whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-700">
              {block.audioScript}
            </p>
          )}
        </div>
        <div className="space-y-5">
          {block.questions.map((question) => (
            <div key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-900">{question.prompt}</p>
              <div className="mt-3">{renderChoice(title === 'Reading' ? 'reading' : 'listening', question, answerState, setter)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStepper = () => (
    <div className="flex flex-wrap gap-4">
      {stepLabels.map((label, index) => {
        const isActive = index === activeStep;
        const isCompletedStep = index < activeStep;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full border text-center text-sm font-semibold leading-8 ${
                isActive
                  ? 'border-sky-600 bg-sky-50 text-sky-700'
                  : isCompletedStep
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-slate-300 text-slate-500'
              }`}
            >
              {index + 1}
            </div>
            <span className={`text-sm ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );

  const renderReportCard = () => {
    if (!session) return null;
    const analytics = session.analytics ?? ({} as IeltsAnalytics);
    const readingAnalytics = analytics.readingAnalytics;
    const listeningAnalytics = analytics.listeningAnalytics;
    const writingFeedback = analytics.writingFeedback;
    const summaryText = analytics.summaryText;

    return (
      <div className="space-y-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">IELTS Session Report</p>
          <h1 className="text-3xl font-semibold text-slate-900">Reference: {session.reference_code}</h1>
          <div className="mt-2 text-sm text-slate-500">
            <span>{getModuleLabel(session)}</span> ·{' '}
            <span>{new Date(session.created_at).toLocaleString()}</span>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Reading', value: session.band_reading },
            { label: 'Listening', value: session.band_listening },
            { label: 'Writing', value: session.band_writing },
            { label: 'Overall', value: session.band_overall },
          ].map((band) => (
            <div key={band.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-sm text-slate-500">{band.label}</p>
              <p className="text-3xl font-semibold text-slate-900">{band.value ?? '—'}</p>
            </div>
          ))}
        </div>

        {readingAnalytics && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Reading analytics</h2>
              <p className="text-sm text-slate-500">
                {readingAnalytics.correct}/{readingAnalytics.total} correct
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-2 font-medium">Q</th>
                    <th className="py-2 font-medium">Answer</th>
                    <th className="py-2 font-medium">Result</th>
                    <th className="py-2 font-medium">Correct answer</th>
                    <th className="py-2 font-medium">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {readingAnalytics.breakdown.map((row) => (
                    <tr key={row.questionId} className="border-t border-slate-100">
                      <td className="py-2">{row.questionId}</td>
                      <td className="py-2">{row.studentAnswer ?? '—'}</td>
                      <td className={`py-2 ${row.isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                        {row.isCorrect ? 'Correct' : 'Incorrect'}
                      </td>
                      <td className="py-2">{row.correctAnswer ?? '—'}</td>
                      <td className="py-2 text-slate-500">{row.explanation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {listeningAnalytics && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Listening analytics</h2>
              <p className="text-sm text-slate-500">
                {listeningAnalytics.correct}/{listeningAnalytics.total} correct
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-2 font-medium">Q</th>
                    <th className="py-2 font-medium">Answer</th>
                    <th className="py-2 font-medium">Result</th>
                    <th className="py-2 font-medium">Correct answer</th>
                    <th className="py-2 font-medium">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {listeningAnalytics.breakdown.map((row) => (
                    <tr key={row.questionId} className="border-t border-slate-100">
                      <td className="py-2">{row.questionId}</td>
                      <td className="py-2">{row.studentAnswer ?? '—'}</td>
                      <td className={`py-2 ${row.isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                        {row.isCorrect ? 'Correct' : 'Incorrect'}
                      </td>
                      <td className="py-2">{row.correctAnswer ?? '—'}</td>
                      <td className="py-2 text-slate-500">{row.explanation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {writingFeedback && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-slate-900">Writing feedback</h2>
              <p className="text-sm text-slate-500">Word count: {writingFeedback.wordCount ?? '—'}</p>
            </div>
            {writingFeedback.strengths && writingFeedback.strengths.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900">Strengths</h3>
                <ul className="ml-4 list-disc text-sm text-slate-600">
                  {writingFeedback.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {writingFeedback.weaknesses && writingFeedback.weaknesses.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900">Weaknesses</h3>
                <ul className="ml-4 list-disc text-sm text-slate-600">
                  {writingFeedback.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {writingFeedback.suggestions && writingFeedback.suggestions.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900">Suggestions</h3>
                <ul className="ml-4 list-disc text-sm text-slate-600">
                  {writingFeedback.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {writingFeedback.originalAnswer && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">Original submission</summary>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{writingFeedback.originalAnswer}</p>
              </details>
            )}
            {writingFeedback.improvedAnswer && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="font-semibold text-emerald-900">Improved version</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-emerald-900">{writingFeedback.improvedAnswer}</p>
              </div>
            )}
          </section>
        )}

        {summaryText && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">Summary</h2>
            <p className="mt-2 text-slate-700">{summaryText}</p>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Print report
          </button>
          <button
            type="button"
            onClick={() => navigate('/ielts')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Back to IELTS home
          </button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-slate-500">Loading session…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-red-600">Unable to load this session.</p>
        <button type="button" className="mt-4 text-sky-700" onClick={() => navigate('/ielts')}>
          Return to IELTS home
        </button>
      </div>
    );
  }

  if (isCompleted) {
    return <div className="bg-slate-50 min-h-screen px-4 py-8">{renderReportCard()}</div>;
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <p className="text-sm text-slate-500">Reference: {session.reference_code}</p>
          <h1 className="text-3xl font-semibold text-slate-900">Guided practice pack</h1>
          <p className="text-slate-600">{getModuleLabel(session)} · Follow the steps to submit your answers.</p>
        </header>

        {renderStepper()}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
          {activeStep === 0 && (
            <Fragment>
              <h2 className="text-2xl font-semibold text-slate-900">Reading</h2>
              {renderQuestionBlock('Reading', session.reading_block)}
            </Fragment>
          )}
          {activeStep === 1 && (
            <Fragment>
              <h2 className="text-2xl font-semibold text-slate-900">Listening</h2>
              {renderQuestionBlock('Listening', session.listening_block)}
            </Fragment>
          )}
          {activeStep === 2 && (
            <Fragment>
              <h2 className="text-2xl font-semibold text-slate-900">Writing</h2>
              <WritingTask task={session.writing_task} value={writingAnswer} onChange={setWritingAnswer} wordsWritten={wordsWritten} />
            </Fragment>
          )}
          {activeStep === 3 && (
            <ReviewStep
              readingCount={readingQuestions.length}
              listeningCount={listeningQuestions.length}
              readingAnswered={Object.keys(readingAnswers).filter((key) => readingAnswers[key]?.trim()).length}
              listeningAnswered={Object.keys(listeningAnswers).filter((key) => listeningAnswers[key]?.trim()).length}
              wordsWritten={wordsWritten}
              referenceCode={session.reference_code}
            />
          )}
          {validationMessage && <p className="text-sm text-red-600">{validationMessage}</p>}
          <div className="flex flex-wrap gap-3">
            {activeStep > 0 && (
              <button type="button" onClick={handleBack} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                Back
              </button>
            )}
            {activeStep < stepLabels.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Next
              </button>
            )}
            {activeStep === stepLabels.length - 1 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={finaliseMutation.isPending}
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
              >
                {finaliseMutation.isPending ? 'Generating report…' : 'Generate report'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface WritingTaskProps {
  task?: IeltsWritingTask | null;
  value: string;
  onChange: (value: string) => void;
  wordsWritten: number;
}

const WritingTask: React.FC<WritingTaskProps> = ({ task, value, onChange, wordsWritten }) => {
  if (!task) {
    return <p className="text-sm text-slate-500">No writing task has been assigned for this session.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{task.title ?? 'Writing task'}</h3>
        <p className="mt-2 whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-700">{task.prompt}</p>
        {task.wordGoal && <p className="mt-1 text-sm text-slate-500">Suggested word count: {task.wordGoal}</p>}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-64 w-full rounded-2xl border border-slate-200 p-4 text-sm"
        placeholder="Write your response here"
      />
      <div className="text-sm text-slate-500">Current word count: {wordsWritten}</div>
    </div>
  );
};

interface ReviewStepProps {
  readingCount: number;
  listeningCount: number;
  readingAnswered: number;
  listeningAnswered: number;
  wordsWritten: number;
  referenceCode: string;
}

const ReviewStep: React.FC<ReviewStepProps> = ({
  readingCount,
  listeningCount,
  readingAnswered,
  listeningAnswered,
  wordsWritten,
  referenceCode,
}) => (
  <div className="space-y-4">
    <h2 className="text-2xl font-semibold text-slate-900">Review & Submit</h2>
    <ul className="space-y-2 text-sm text-slate-700">
      <li>Reading answers: {readingAnswered}/{readingCount}</li>
      <li>Listening answers: {listeningAnswered}/{listeningCount}</li>
      <li>Writing word count: {wordsWritten}</li>
      <li>Reference code: {referenceCode}</li>
    </ul>
    <p className="text-sm text-slate-500">Submit when you are satisfied with your responses.</p>
  </div>
);

/*
Manual checks:
1. Start a new General session, complete every step, and confirm the generated report loads immediately.
2. Copy the reference code, open /ielts, use the lookup form, and ensure it opens the same report.
3. Refresh a completed session URL to confirm the report renders from persisted data.
*/

export default IeltsSession;
