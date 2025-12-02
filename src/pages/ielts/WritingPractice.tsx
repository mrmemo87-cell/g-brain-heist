import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';

interface WritingTask {
  id: number;
  slug: string;
  task_type: string;
  title: string;
  prompt: string;
  bands_target: string;
  sample_answer: string | null;
}

const WritingPractice: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  
  const [answer, setAnswer] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showSample, setShowSample] = useState(false);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  // Word count
  useEffect(() => {
    const words = answer.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
  }, [answer]);

  // Fetch writing task
  const { data: task, isLoading } = useQuery({
    queryKey: ['writing-task', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ielts_writing_tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      return data as WritingTask;
    },
    enabled: !!taskId,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { taskId: number; answer: string; wordCount: number; timeSpent: number }) => {
      // Ensure user exists in ielts_users
      await ensureIeltsProfile();

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const { data: result, error } = await supabase
        .from('ielts_writing_attempts')
        .insert({
          user_id: session.session.user.id,
          task_id: data.taskId,
          answer_text: data.answer,
          word_count: data.wordCount,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      setHasSubmitted(true);
    },
  });

  const handleSubmit = () => {
    if (!taskId || !answer.trim()) return;
    
    submitMutation.mutate({
      taskId: Number(taskId),
      answer: answer.trim(),
      wordCount,
      timeSpent: timeElapsed,
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getWordCountColor = () => {
    if (task?.task_type === 'task1') {
      if (wordCount >= 150) return 'text-green-400';
      if (wordCount >= 120) return 'text-yellow-400';
      return 'text-red-400';
    } else {
      if (wordCount >= 250) return 'text-green-400';
      if (wordCount >= 200) return 'text-yellow-400';
      return 'text-red-400';
    }
  };

  const getMinWords = () => task?.task_type === 'task1' ? 150 : 250;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Task not found</h2>
          <button
            onClick={() => navigate('/ielts')}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-emerald-500/30 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">Essay Submitted!</h1>
            <p className="text-xl text-gray-300 mb-6">
              Your writing has been submitted for expert review.
            </p>
          </div>

          {/* Summary */}
          <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Submission Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="bg-slate-600/50 rounded-lg p-4">
                <div className="text-sm text-gray-400">Word Count</div>
                <div className={`text-2xl font-bold ${getWordCountColor()}`}>{wordCount}</div>
                <div className="text-xs text-gray-500">Minimum: {getMinWords()}</div>
              </div>
              <div className="bg-slate-600/50 rounded-lg p-4">
                <div className="text-sm text-gray-400">Time Spent</div>
                <div className="text-2xl font-bold text-emerald-400">{formatTime(timeElapsed)}</div>
                <div className="text-xs text-gray-500">Recommended: 20-40 min</div>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div className="bg-slate-700/50 rounded-xl p-6 mb-6 text-left">
            <h3 className="text-lg font-semibold text-white mb-3">What happens next?</h3>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>An IELTS expert will review your essay</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>You'll receive detailed feedback on Task Achievement, Coherence, Vocabulary, and Grammar</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>An estimated band score will be provided</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Reviews typically complete within 24-48 hours</span>
              </li>
            </ul>
          </div>

          {/* Sample Answer */}
          {task.sample_answer && (
            <div className="mb-6">
              <button
                onClick={() => setShowSample(!showSample)}
                className="w-full px-6 py-3 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-lg transition hover:bg-amber-600/30"
              >
                {showSample ? '🙈 Hide Sample Answer' : '📝 View Sample Answer'}
              </button>
              
              {showSample && (
                <div className="mt-4 bg-amber-600/10 border border-amber-500/30 rounded-xl p-6 text-left">
                  <h4 className="text-lg font-semibold text-amber-400 mb-3">Sample Band 8+ Answer</h4>
                  <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {task.sample_answer}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => navigate('/ielts')}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-emerald-500/30">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-emerald-400 mb-2">
                IELTS Writing - {task.task_type === 'task1' ? 'Task 1' : 'Task 2'}
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">{task.title || 'Writing Practice'}</h1>
              <div className="flex gap-4 text-sm text-gray-400">
                <span>Target: {task.bands_target}</span>
                <span>•</span>
                <span>Min words: {getMinWords()}</span>
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
          {/* Task Prompt - Left Side */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/30 sticky top-6">
              <h2 className="text-xl font-bold text-white mb-4">📋 Task</h2>
              
              <div className="bg-slate-700/50 rounded-xl p-5 mb-6">
                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
              </div>

              {/* Timer & Stats */}
              <div className="space-y-4">
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">Time Elapsed</div>
                  <div className="text-3xl font-bold text-emerald-400">{formatTime(timeElapsed)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Recommended: {task.task_type === 'task1' ? '20 minutes' : '40 minutes'}
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">Word Count</div>
                  <div className={`text-3xl font-bold ${getWordCountColor()}`}>{wordCount}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Minimum required: {getMinWords()} words
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 w-full bg-slate-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        wordCount >= getMinWords() ? 'bg-green-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (wordCount / getMinWords()) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="mt-6 bg-blue-600/10 border border-blue-500/30 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">💡 Writing Tips</h3>
                <ul className="text-xs text-gray-300 space-y-1">
                  {task.task_type === 'task1' ? (
                    <>
                      <li>• Summarize the main trends/features</li>
                      <li>• Make comparisons where relevant</li>
                      <li>• Include specific data/figures</li>
                      <li>• Don't give your opinion</li>
                    </>
                  ) : (
                    <>
                      <li>• Plan your essay structure first</li>
                      <li>• Include an introduction and conclusion</li>
                      <li>• Support your points with examples</li>
                      <li>• Use a range of vocabulary</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Writing Area - Right Side */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">✍️ Your Essay</h2>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  wordCount >= getMinWords() 
                    ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                    : 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                }`}>
                  {wordCount} / {getMinWords()} words
                </div>
              </div>

              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={`Start writing your ${task.task_type === 'task1' ? 'report' : 'essay'} here...

Remember to:
- Address all parts of the task
- Organize your ideas clearly
- Use a range of vocabulary and grammar
- Check your spelling and punctuation`}
                className="w-full h-[500px] p-6 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none leading-relaxed"
                style={{ fontSize: '16px' }}
              />

              {/* Action Buttons */}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setAnswer('')}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  Clear
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending || wordCount < 50}
                  className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition font-bold"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>

              {wordCount < 50 && (
                <p className="mt-3 text-sm text-amber-400">
                  ⚠️ Please write at least 50 words before submitting.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WritingPractice;
