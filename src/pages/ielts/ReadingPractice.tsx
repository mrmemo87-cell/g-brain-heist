import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchActiveReadingSets, fetchReadingQuestions, submitReadingAttempt } from '../../../services/ieltsService';
import type { IELTSReadingQuestion } from '../../../types';

interface Answer {
  questionId: number;
  answer: string;
}

const ReadingPractice: React.FC = () => {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [startTime] = useState(Date.now());
  const [showResults, setShowResults] = useState(false);

  const { data: readingSets, isLoading: loadingSets } = useQuery({
    queryKey: ['reading-sets'],
    queryFn: fetchActiveReadingSets,
  });

  const { data: questions, isLoading: loadingQuestions } = useQuery({
    queryKey: ['reading-questions', setId],
    queryFn: () => fetchReadingQuestions(Number(setId)),
    enabled: !!setId,
  });

  const submitMutation = useMutation({
    mutationFn: (data: { setId: number; answers: Record<number, string>; timeSpent: number }) =>
      submitReadingAttempt(data.setId, data.answers, data.timeSpent),
    onSuccess: () => {
      setShowResults(true);
    },
  });

  const currentSet = readingSets?.find(set => set.id === Number(setId));
  const currentQuestion = questions?.[currentQuestionIndex];

  const handleAnswer = (answer: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < (questions?.length || 0) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    if (!setId) return;
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    submitMutation.mutate({
      setId: Number(setId),
      answers,
      timeSpent,
    });
  };

  const calculateResults = () => {
    if (!questions) return { correct: 0, total: 0, percentage: 0 };
    
    let correct = 0;
    questions.forEach((q: IELTSReadingQuestion) => {
      const userAnswer = answers[q.id];
      const correctAnswer = typeof q.correct_answer === 'string' 
        ? JSON.parse(q.correct_answer) 
        : q.correct_answer;
      
      if (userAnswer === correctAnswer) {
        correct++;
      }
    });

    return {
      correct,
      total: questions.length,
      percentage: Math.round((correct / questions.length) * 100),
    };
  };

  const estimateBandScore = (percentage: number): number => {
    if (percentage >= 90) return 8.5;
    if (percentage >= 80) return 7.5;
    if (percentage >= 70) return 6.5;
    if (percentage >= 60) return 5.5;
    if (percentage >= 50) return 5.0;
    return 4.5;
  };

  if (loadingSets || loadingQuestions) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!currentSet || !questions || questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">No questions available</h2>
          <button
            onClick={() => navigate('/ielts')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (showResults) {
    const results = calculateResults();
    const bandScore = estimateBandScore(results.percentage);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30">
          <h1 className="text-4xl font-bold text-white mb-6 text-center">Results</h1>
          
          <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
            <div className="text-center mb-4">
              <div className="text-6xl font-bold text-blue-400 mb-2">{results.correct}/{results.total}</div>
              <div className="text-2xl text-gray-300">{results.percentage}% Correct</div>
            </div>
            
            <div className="text-center py-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
              <div className="text-sm text-gray-400 mb-1">Estimated Band Score</div>
              <div className="text-5xl font-bold text-yellow-400">{bandScore}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-4">Answer Review</h2>
            {questions.map((q: IELTSReadingQuestion, idx: number) => {
              const userAnswer = answers[q.id];
              const correctAnswer = typeof q.correct_answer === 'string' 
                ? JSON.parse(q.correct_answer) 
                : q.correct_answer;
              const isCorrect = userAnswer === correctAnswer;

              return (
                <div key={q.id} className={`p-4 rounded-lg border ${
                  isCorrect 
                    ? 'bg-green-900/20 border-green-500/30' 
                    : 'bg-red-900/20 border-red-500/30'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      isCorrect ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {isCorrect ? '✓' : '✗'}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium mb-2">Q{idx + 1}: {q.body}</div>
                      <div className="space-y-1 text-sm">
                        <div className="text-gray-300">
                          Your answer: <span className={isCorrect ? 'text-green-400' : 'text-red-400'}>
                            {userAnswer || 'Not answered'}
                          </span>
                        </div>
                        {!isCorrect && (
                          <div className="text-gray-300">
                            Correct answer: <span className="text-green-400">{correctAnswer}</span>
                          </div>
                        )}
                        {q.explanation && (
                          <div className="mt-2 text-gray-400 italic">{q.explanation}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={() => navigate('/ielts')}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              Back to Home
            </button>
            <button
              onClick={() => {
                setAnswers({});
                setCurrentQuestionIndex(0);
                setShowResults(false);
              }}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const parsedOptions = currentQuestion?.options 
    ? (typeof currentQuestion.options === 'string' 
        ? JSON.parse(currentQuestion.options) 
        : currentQuestion.options)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-blue-500/30">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{currentSet.title}</h1>
              <div className="flex gap-4 text-sm text-gray-400">
                <span>Level: {currentSet.level}</span>
                <span>•</span>
                <span>Duration: {currentSet.duration_minutes} min</span>
                <span>•</span>
                <span>Band: {currentSet.est_band_min} - {currentSet.est_band_max}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Progress</div>
              <div className="text-2xl font-bold text-blue-400">
                {currentQuestionIndex + 1} / {questions.length}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Passage */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/30 max-h-[70vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">Passage</h2>
            <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {currentSet.passage_text}
            </div>
          </div>

          {/* Question */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/30">
            <div className="mb-6">
              <div className="text-sm text-gray-400 mb-2">Question {currentQuestionIndex + 1}</div>
              <h3 className="text-xl font-medium text-white mb-6">{currentQuestion.body}</h3>

              <div className="space-y-3">
                {parsedOptions.map((option: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      answers[currentQuestion.id] === option
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700/50 border-slate-600 text-gray-300 hover:border-blue-500/50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition"
              >
                Previous
              </button>
              
              {currentQuestionIndex < questions.length - 1 ? (
                <button
                  onClick={handleNext}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition font-medium"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingPractice;
