import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

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
  
  // Success screen state
  const [alternateEmail, setAlternateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);

  // Stop background music when entering IELTS Writing practice
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
    };
  }, []);

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
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#1e293b', fontSize: '1.25rem' }}>Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Task not found</h2>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '2rem'
      }}>
        <div style={{
          maxWidth: '56rem',
          margin: '0 auto',
          background: 'white',
          borderRadius: '1rem',
          padding: '2.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {/* Success Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '5rem',
              height: '5rem',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <svg style={{ width: '2.5rem', height: '2.5rem', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
              Essay Submitted Successfully!
            </h1>
            <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
              Your writing has been received and is queued for expert review.
            </p>
          </div>

          {/* Submission Summary */}
          <div style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #6ee7b7',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#065f46', marginBottom: '1rem' }}>📊 Submission Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'white', borderRadius: '0.5rem', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Word Count</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: wordCount >= getMinWords() ? '#16a34a' : '#f59e0b' }}>
                  {wordCount}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Minimum: {getMinWords()}</div>
              </div>
              <div style={{ background: 'white', borderRadius: '0.5rem', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Time Spent</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{formatTime(timeElapsed)}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Recommended: 20-40 min</div>
              </div>
            </div>
          </div>

          {/* Expert Review Notice */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1e40af', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎯</span> What Happens Next
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#1e3a5f' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>1.</span>
                <span>Your essay will be reviewed by a <strong>certified IELTS examiner</strong></span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>2.</span>
                <span>You'll receive detailed feedback on Task Achievement, Coherence, Vocabulary & Grammar</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>3.</span>
                <span>Your estimated band score will be sent to your email within <strong>24 hours</strong></span>
              </li>
            </ul>
          </div>

          {/* Notification Preferences */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#334155', marginBottom: '1rem' }}>
              📬 Notification Preferences
            </h3>
            
            {/* Alternate Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Alternate email (optional)
              </label>
              <input
                type="email"
                value={alternateEmail}
                onChange={(e) => setAlternateEmail(e.target.value)}
                placeholder="Enter alternate email for results"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Phone Number */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Phone number for SMS updates (optional)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 234 567 8900"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyByEmail}
                  onChange={(e) => setNotifyByEmail(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#10b981' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Notify me by email when feedback is ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyBySms}
                  onChange={(e) => setNotifyBySms(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#10b981' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Send SMS notification when feedback is ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyInApp}
                  onChange={(e) => setNotifyInApp(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#10b981' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Show in-app notification</span>
              </label>
            </div>
          </div>

          {/* Sample Answer */}
          {task.sample_answer && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => setShowSample(!showSample)}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.5rem',
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  color: '#92400e',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {showSample ? '🙈 Hide Sample Answer' : '📝 View Sample Answer'}
              </button>
              
              {showSample && (
                <div style={{
                  marginTop: '1rem',
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  borderRadius: '0.75rem',
                  padding: '1.5rem'
                }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#92400e', marginBottom: '0.75rem' }}>
                    Sample Band 8+ Answer
                  </h4>
                  <div style={{ color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                    {task.sample_answer}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => navigate('/ielts')}
            style={{
              width: '100%',
              padding: '0.875rem 2rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '1rem'
    }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#10b981', marginBottom: '0.25rem' }}>
              IELTS Writing - {task.task_type === 'task1' ? 'Task 1' : 'Task 2'}
            </div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>
              {task.title || 'Writing Practice'}
            </h1>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
              <span>Target: {task.bands_target}</span>
              <span>•</span>
              <span>Min words: {getMinWords()}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1rem',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              cursor: 'pointer'
            }}
          >
            Exit
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          {/* Task Prompt - Left Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              position: 'sticky',
              top: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>📋 Task</h2>
              
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                overflowX: 'auto'
              }}>
                <pre style={{ 
                  color: '#334155', 
                  lineHeight: 1.75, 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', 
                  fontSize: '0.875rem',
                  margin: 0
                }}>{task.prompt}</pre>
              </div>

              {/* Timer & Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1px solid #6ee7b7',
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#065f46', marginBottom: '0.25rem' }}>Time Elapsed</div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669' }}>{formatTime(timeElapsed)}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Recommended: {task.task_type === 'task1' ? '20 minutes' : '40 minutes'}
                  </div>
                </div>

                <div style={{
                  background: wordCount >= getMinWords() ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: `1px solid ${wordCount >= getMinWords() ? '#6ee7b7' : '#f59e0b'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: wordCount >= getMinWords() ? '#065f46' : '#92400e', marginBottom: '0.25rem' }}>
                    Word Count
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: wordCount >= getMinWords() ? '#059669' : '#b45309' }}>
                    {wordCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Minimum required: {getMinWords()} words
                  </div>
                  {/* Progress bar */}
                  <div style={{ 
                    marginTop: '0.5rem', 
                    width: '100%', 
                    background: '#e2e8f0', 
                    borderRadius: '9999px', 
                    height: '0.5rem' 
                  }}>
                    <div
                      style={{
                        height: '0.5rem',
                        borderRadius: '9999px',
                        transition: 'width 0.3s',
                        background: wordCount >= getMinWords() ? '#22c55e' : '#10b981',
                        width: `${Math.min(100, (wordCount / getMinWords()) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div style={{
                marginTop: '1.5rem',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #93c5fd',
                borderRadius: '0.75rem',
                padding: '1rem'
              }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.5rem' }}>💡 Writing Tips</h3>
                <ul style={{ fontSize: '0.75rem', color: '#1e3a5f', listStyle: 'none', padding: 0, margin: 0 }}>
                  {task.task_type === 'task1' ? (
                    <>
                      <li style={{ marginBottom: '0.25rem' }}>• Summarize the main trends/features</li>
                      <li style={{ marginBottom: '0.25rem' }}>• Make comparisons where relevant</li>
                      <li style={{ marginBottom: '0.25rem' }}>• Include specific data/figures</li>
                      <li>• Don't give your opinion</li>
                    </>
                  ) : (
                    <>
                      <li style={{ marginBottom: '0.25rem' }}>• Plan your essay structure first</li>
                      <li style={{ marginBottom: '0.25rem' }}>• Include an introduction and conclusion</li>
                      <li style={{ marginBottom: '0.25rem' }}>• Support your points with examples</li>
                      <li>• Use a range of vocabulary</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Writing Area - Right Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>✍️ Your Essay</h2>
                <div style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: wordCount >= getMinWords() ? '#dcfce7' : '#fef3c7',
                  color: wordCount >= getMinWords() ? '#166534' : '#92400e',
                  border: `1px solid ${wordCount >= getMinWords() ? '#86efac' : '#fcd34d'}`
                }}>
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
                style={{
                  width: '100%',
                  height: '500px',
                  padding: '1.5rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  color: '#1e293b',
                  fontSize: '1rem',
                  lineHeight: 1.75,
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  onClick={() => setAnswer('')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending || wordCount < 50}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: submitMutation.isPending || wordCount < 50 ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: submitMutation.isPending || wordCount < 50 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>

              {wordCount < 50 && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#f59e0b' }}>
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
