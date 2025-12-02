import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';

interface ListeningSet {
  id: number;
  slug: string;
  title: string;
  description: string;
  level: string;
  est_band_min: number;
  est_band_max: number;
  duration_minutes: number;
  audio_url: string;
}

interface ListeningQuestion {
  id: number;
  set_id: number;
  question_order: number;
  question_type: string;
  body: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}

const ListeningPractice: React.FC = () => {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [startTime] = useState(Date.now());
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch listening set
  const { data: listeningSet, isLoading: loadingSet } = useQuery({
    queryKey: ['listening-set', setId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ielts_listening_sets')
        .select('*')
        .eq('id', setId)
        .single();
      
      if (error) throw error;
      return data as ListeningSet;
    },
    enabled: !!setId,
  });

  // Fetch questions
  const { data: questions, isLoading: loadingQuestions } = useQuery({
    queryKey: ['listening-questions', setId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ielts_listening_questions')
        .select('*')
        .eq('set_id', setId)
        .order('question_order', { ascending: true });
      
      if (error) throw error;
      return data as ListeningQuestion[];
    },
    enabled: !!setId,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { setId: number; answers: Record<number, string>; timeSpent: number }) => {
      // Ensure user exists in ielts_users
      await ensureIeltsProfile();

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const { data: result, error } = await supabase
        .from('ielts_listening_attempts')
        .insert({
          user_id: session.session.user.id,
          set_id: data.setId,
          answers: data.answers,
          time_spent_seconds: data.timeSpent,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      setShowResults(true);
    },
  });

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
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
    questions.forEach((q: ListeningQuestion) => {
      const userAnswer = answers[q.id]?.toLowerCase().trim();
      const correctAnswer = String(q.correct_answer).toLowerCase().trim();
      
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Group questions by sections (10 questions per section, IELTS-style)
  const groupedQuestions: ListeningQuestion[][] = questions ? 
    questions.reduce((acc: ListeningQuestion[][], q: ListeningQuestion, idx: number) => {
      const sectionIndex = Math.floor(idx / 10);
      if (!acc[sectionIndex]) acc[sectionIndex] = [];
      acc[sectionIndex].push(q);
      return acc;
    }, [] as ListeningQuestion[][]) : [];

  if (loadingSet || loadingQuestions) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!listeningSet || !questions || questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">No listening content available</h2>
          <button
            onClick={() => navigate('/ielts')}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-indigo-500/30">
          <h1 className="text-4xl font-bold text-white mb-6 text-center">Listening Results</h1>
          
          <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
            <div className="text-center mb-4">
              <div className="text-6xl font-bold text-indigo-400 mb-2">{results.correct}/{results.total}</div>
              <div className="text-2xl text-gray-300">{results.percentage}% Correct</div>
            </div>
            
            <div className="text-center py-4 bg-indigo-600/20 rounded-lg border border-indigo-500/30">
              <div className="text-sm text-gray-400 mb-1">Estimated Band Score</div>
              <div className="text-5xl font-bold text-yellow-400">{bandScore}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-4">Answer Review</h2>
            {questions.map((q: ListeningQuestion, idx: number) => {
              const userAnswer = answers[q.id];
              const correctAnswer = q.correct_answer;
              const isCorrect = userAnswer?.toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();

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
              className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium"
            >
              Back to Home
            </button>
            <button
              onClick={() => {
                setAnswers({});
                setShowResults(false);
                setAudioPlayed(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-indigo-500/30">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{listeningSet.title}</h1>
              <div className="flex gap-4 text-sm text-gray-400">
                <span>Level: {listeningSet.level}</span>
                <span>•</span>
                <span>Duration: {listeningSet.duration_minutes} min</span>
                <span>•</span>
                <span>Band: {listeningSet.est_band_min} - {listeningSet.est_band_max}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/ielts')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              Exit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audio Player - Left Side */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-indigo-500/30 sticky top-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                🎧 Audio Player
              </h2>
              
              <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
                <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  onPlay={() => setAudioPlayed(true)}
                >
                  <source src={listeningSet.audio_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>

              <div className="bg-amber-600/20 border border-amber-500/30 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-amber-400 mb-2">⚠️ IELTS Listening Rules</h3>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• You will hear the audio ONCE only</li>
                  <li>• Answer as you listen</li>
                  <li>• Check your answers at the end</li>
                  <li>• Pay attention to spelling</li>
                </ul>
              </div>

              {/* Section Navigation */}
              {groupedQuestions.length > 1 && (
                <div className="mb-4">
                  <h3 className="text-sm text-gray-400 mb-2">Sections</h3>
                  <div className="flex flex-wrap gap-2">
                    {groupedQuestions.map((_: ListeningQuestion[], idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSection(idx)}
                        className={`px-3 py-1 rounded-lg text-sm transition ${
                          currentSection === idx
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                        }`}
                      >
                        Section {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Questions Answered</div>
                <div className="text-2xl font-bold text-indigo-400">
                  {Object.keys(answers).length} / {questions.length}
                </div>
              </div>
            </div>
          </div>

          {/* Questions - Right Side */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-indigo-500/30">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Section {currentSection + 1} Questions
                </h2>
                <span className="text-sm text-gray-400">
                  Questions {currentSection * 10 + 1} - {Math.min((currentSection + 1) * 10, questions.length)}
                </span>
              </div>

              <div className="space-y-6">
                {groupedQuestions[currentSection]?.map((q: ListeningQuestion, idx: number) => {
                  const questionNumber = currentSection * 10 + idx + 1;
                  const options: string[] = q.options ? (Array.isArray(q.options) ? q.options : []) : [];

                  return (
                    <div key={q.id} className="bg-slate-700/30 rounded-xl p-5 border border-slate-600/50">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                          {questionNumber}
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium mb-4">{q.body}</p>
                          
                          {/* Multiple Choice */}
                          {options.length > 0 ? (
                            <div className="space-y-2">
                              {options.map((option: string, optIdx: number) => (
                                <button
                                  key={optIdx}
                                  onClick={() => handleAnswer(q.id, option)}
                                  className={`w-full text-left p-3 rounded-lg border transition ${
                                    answers[q.id] === option
                                      ? 'bg-indigo-600 border-indigo-500 text-white'
                                      : 'bg-slate-700/50 border-slate-600 text-gray-300 hover:border-indigo-500/50'
                                  }`}
                                >
                                  <span className="font-medium mr-2">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  {option}
                                </button>
                              ))}
                            </div>
                          ) : (
                            /* Fill in the blank */
                            <input
                              type="text"
                              value={answers[q.id] || ''}
                              onChange={(e) => handleAnswer(q.id, e.target.value)}
                              placeholder="Type your answer..."
                              className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex gap-4 mt-8">
                {currentSection > 0 && (
                  <button
                    onClick={() => setCurrentSection(prev => prev - 1)}
                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  >
                    ← Previous Section
                  </button>
                )}
                
                {currentSection < groupedQuestions.length - 1 ? (
                  <button
                    onClick={() => setCurrentSection(prev => prev + 1)}
                    className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                  >
                    Next Section →
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition font-bold"
                  >
                    {submitMutation.isPending ? 'Submitting...' : 'Submit Answers'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListeningPractice;
