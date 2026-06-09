import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile, getUserTier, isIeltsPrime } from '../../../services/ieltsService';
import { rpcIeltsPracticeMarkItemCompleted, rpcIeltsPracticeMarkItemSubmitted, type IeltsPracticeAssignmentProgress } from '../../../services/ieltsPracticeAssignmentService';
import { AssignmentCompletionStatus, readIeltsPracticeAssignmentContext } from './assignmentPracticeUi';
import { notifyTeachersOfExamGuard } from '../../../services/notificationService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { ExamGuard } from '../../utils/examGuard';
import { logIeltsViolation } from '../../../services/ieltsViolationService';
import { buildWritingAttemptPayload } from '../../lib/ieltsPracticeScoring';

interface WritingTask {
  id: number;
  slug: string;
  task_type: string;
  title: string;
  prompt: string;
  bands_target: string;
  sample_answer: string | null;
  required_tier?: string | null;
}

const MAX_EXAM_GUARD_VIOLATIONS = 3;
const MIN_MEANINGFUL_WORDS = 50;

const WritingPractice: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const assignmentContext = readIeltsPracticeAssignmentContext();
  const { assignmentId, assignmentItemId } = assignmentContext;
  
  const [answer, setAnswer] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [userTier, setUserTier] = useState('free');
  const isPrimeUser = isIeltsPrime({ tier: userTier });
  
  // Success screen state
  const [isAssignmentCompletedBySubmission, setIsAssignmentCompletedBySubmission] = useState(false);
  const [hasFinalizedReview, setHasFinalizedReview] = useState(false);
  const promptContainerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSubmitTriggeredRef = useRef(false);
  const studentInfoRef = useRef<{
    id: string;
    name: string;
    className: string | null;
    schoolId: string | null;
  } | null>(null);

  const loadStudentInfo = async () => {
    if (studentInfoRef.current) {
      return studentInfoRef.current;
    }
    const { data: authData } = await supabase.auth.getSession();
    const user = authData.session?.user;
    if (!user) {
      return null;
    }
    const { data: profile } = await supabase
      .from('users')
      .select('id, username, batch, school_id')
      .eq('id', user.id)
      .single();
    if (!profile) {
      return null;
    }
    const info = {
      id: profile.id,
      name: profile.username ?? 'Student',
      className: profile.batch ?? null,
      schoolId: profile.school_id ?? null,
    };
    studentInfoRef.current = info;
    return info;
  };

  // Stop background music when entering IELTS Writing practice
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    getUserTier()
      .then((tier) => {
        if (isMounted) {
          setUserTier(tier);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUserTier('free');
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Timer - stop when submitted
  useEffect(() => {
    if (hasSubmitted) return; // Don't run timer after submission
    
    const timer = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, hasSubmitted]);

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

  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [assignmentProgress, setAssignmentProgress] = useState<IeltsPracticeAssignmentProgress | null>(null);
  const [assignmentCompletionError, setAssignmentCompletionError] = useState<string | null>(null);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { taskId: number; answer: string; wordCount: number; timeSpent: number }) => {
      // Ensure user exists in ielts_users
      await ensureIeltsProfile();

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const attemptPayload = buildWritingAttemptPayload({
        user_id: session.session.user.id,
        task_id: data.taskId,
        answer_text: data.answer,
        word_count: data.wordCount,
        submitted_at: new Date().toISOString(),
      });

      const { data: result, error } = await supabase
        .from('ielts_writing_attempts')
        .insert(attemptPayload)
        .select()
        .single();

      if (error) throw error;

      let progress: IeltsPracticeAssignmentProgress | null = null;
      let itemCompletionError: string | null = null;

      const canComplete = data.wordCount >= MIN_MEANINGFUL_WORDS;
      if (assignmentId && assignmentItemId) {
        try {
          progress = await rpcIeltsPracticeMarkItemSubmitted({
            assignmentId,
            assignmentItemId,
            practiceAttemptType: 'writing',
            practiceAttemptId: result?.id ?? null,
          });
          if (canComplete) {
            progress = await rpcIeltsPracticeMarkItemCompleted({
              assignmentId,
              assignmentItemId,
              practiceAttemptType: 'writing',
              practiceAttemptId: result?.id ?? null,
            });
          }
        } catch (completionError) {
          itemCompletionError = completionError instanceof Error ? completionError.message : 'Unable to mark assignment item completed.';
        }
      }

      return { attempt: result, progress, itemCompletionError, canComplete };
    },
    onSuccess: (data) => {
      setLastAttemptId(data.attempt?.id);
      setAssignmentProgress(data.progress);
      setAssignmentCompletionError(data.itemCompletionError);
      setIsAssignmentCompletedBySubmission(Boolean(data.canComplete));
      setHasFinalizedReview(data.attempt?.review_status === 'finalized');
      if (!data.canComplete && !data.itemCompletionError) {
        setAssignmentCompletionError(`Submitted, but not enough writing to complete assignment (minimum ${MIN_MEANINGFUL_WORDS} words).`);
      }
      setHasSubmitted(true);
    },
  });

  const handleSubmit = (forceSubmit = false) => {
    if (!taskId || (!answer.trim() && !forceSubmit)) return;

    ExamGuard.stop();
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

  useEffect(() => {
    if (!task || !promptContainerRef.current || !editorRef.current) {
      return undefined;
    }

    autoSubmitTriggeredRef.current = false;
    ExamGuard.stop();
    const handleAutoSubmit = async () => {
      if (autoSubmitTriggeredRef.current) {
        return;
      }
      autoSubmitTriggeredRef.current = true;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId) {
        await logIeltsViolation({
          userId,
          module: 'writing',
          moduleType: 'practice',
          attemptId: lastAttemptId ?? null,
          reason: 'auto_submit',
          code: 'examguard_auto_submit',
          metadata: { taskId: task?.id ?? null },
        });
      }
      handleSubmit(true);
    };
    ExamGuard.start({
      promptContainer: promptContainerRef.current,
      editor: editorRef.current,
      onSubmit: handleAutoSubmit,
      onViolation: (event) => {
        console.warn('ExamGuard violation (WritingPractice):', event);
        void (async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user?.id;
          if (!userId) return;
          await logIeltsViolation({
            userId,
            module: 'writing',
            moduleType: 'practice',
            attemptId: lastAttemptId ?? null,
            reason: 'rule_violation',
            code: event.type,
            metadata: {
              violationsCount: event.violationsCount,
              wordCount: event.wordCount,
              charCount: event.charCount,
              metadata: event.metadata ?? null,
              taskId: task?.id ?? null,
            },
          });
        })();
        if (event.violationsCount >= MAX_EXAM_GUARD_VIOLATIONS) {
          void (async () => {
            try {
              const info = await loadStudentInfo();
              if (!info) {
                return;
              }
              await notifyTeachersOfExamGuard({
                studentId: info.id,
                studentName: info.name,
                studentClass: info.className,
                schoolId: info.schoolId,
                testName: `IELTS Writing Practice ${task?.title ?? ''}`.trim(),
                violationCount: event.violationsCount,
                type: 'new_submission',
                extraData: {
                  taskId: task?.id,
                },
              });
            } catch (error) {
              console.warn('ExamGuard: unable to notify teachers (IELTS writing practice).', error);
            }
          })();
          handleAutoSubmit();
        }
      },
      testId: `ielts-writing-${task.id}`,
      maxViolations: MAX_EXAM_GUARD_VIOLATIONS,
      blurGraceMs: 300,
      suspiciousJump: {
        minDeltaChars: 80,
        maxDeltaMs: 1200,
      },
      actions: {
        warn: true,
        showBanner: true,
        disableEditor: true,
        autosubmit: true,
        blockSelectAll: true,
      },
    });

    return () => {
      ExamGuard.stop();
    };
  }, [task?.id]);

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <img 
          src="/BRAINS.svg" 
          alt="Loading..." 
          style={{ width: '200px', height: '200px', filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }}
        />
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

  if ((task?.required_tier ?? 'prime_prep_user') !== 'free' && !isPrimeUser) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0', maxWidth: '500px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Prime access required</h2>
          <p style={{ fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            Writing feedback and scoring are available to IELTS Prime members. Upgrade to unlock this task.
          </p>
          <button
            onClick={() => navigate('/ielts/apply-prime')}
            style={{
              padding: '0.75rem 1.75rem',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Upgrade to Prime
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
        padding: 'clamp(1rem, 3vw, 2rem)'
      }}>
        <div style={{
          maxWidth: '56rem',
          margin: '0 auto',
          background: 'white',
          borderRadius: '1rem',
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {/* Submission Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 'clamp(3.5rem, 10vw, 5rem)',
              height: 'clamp(3.5rem, 10vw, 5rem)',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <svg style={{ width: 'clamp(1.75rem, 5vw, 2.5rem)', height: 'clamp(1.75rem, 5vw, 2.5rem)', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {isAssignmentCompletedBySubmission ? (
              <>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
                  Writing practice submitted
                </h1>
                <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)', color: '#64748b' }}>
                  Your response was saved and this assignment item is complete.
                </p>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
                  Writing submitted
                </h1>
                <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)', color: '#64748b' }}>
                  Your response was saved, but it is too short to complete this assignment.
                </p>
                <p style={{ fontSize: 'clamp(0.85rem, 2vw, 1rem)', color: '#475569', marginTop: '0.5rem' }}>
                  Minimum for assignment completion: {MIN_MEANINGFUL_WORDS} words.
                </p>
              </>
            )}
          </div>

          <AssignmentCompletionStatus
            context={assignmentContext}
            progress={assignmentProgress}
            completionError={assignmentCompletionError}
            onNavigate={navigate}
          />

          {lastAttemptId && hasFinalizedReview ? (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#1e3a8a', fontWeight: 600 }}>Finalized teacher feedback is ready.</span>
              <button
                type="button"
                onClick={() => navigate(`/ielts/review-result/writing/${encodeURIComponent(lastAttemptId)}`)}
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem', cursor: 'pointer', fontWeight: 700 }}
              >
                View teacher review result
              </button>
            </div>
          ) : lastAttemptId ? (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
              <span style={{ color: '#1e3a8a', fontWeight: 600 }}>Teacher feedback will appear here after finalization.</span>
            </div>
          ) : null}

          {/* Submission Summary */}
          <div style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #6ee7b7',
            borderRadius: '0.75rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#065f46', marginBottom: '1rem' }}>📊 Submission Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'white', borderRadius: '0.5rem', padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
                <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b' }}>Word Count</div>
                <div style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', fontWeight: 'bold', color: wordCount >= getMinWords() ? '#16a34a' : '#f59e0b' }}>
                  {wordCount}
                </div>
                <div style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)', color: '#94a3b8' }}>Assignment completion minimum: {MIN_MEANINGFUL_WORDS}</div>
              </div>
              <div style={{ background: 'white', borderRadius: '0.5rem', padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
                <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b' }}>Time Spent</div>
                <div style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', fontWeight: 'bold', color: '#10b981' }}>{formatTime(timeElapsed)}</div>
                <div style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)', color: '#94a3b8' }}>Recommended: 20-40 min</div>
              </div>
              <div style={{ background: 'white', borderRadius: '0.5rem', padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
                <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b' }}>IELTS Task 2 target</div>
                <div style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', fontWeight: 'bold', color: '#0f766e' }}>250</div>
                <div style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)', color: '#94a3b8' }}>Recommended target words</div>
              </div>
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

          {/* Personalized Writing Tips */}
          <div style={{
            background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
            border: '1px solid #e879f9',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#86198f', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Personalized Writing Tips
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>✍️</span>
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>How to Improve Your Writing</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                <li style={{ marginBottom: '0.5rem' }}>📖 <strong>Task Response:</strong> Always address all parts of the question</li>
                <li style={{ marginBottom: '0.5rem' }}>🔗 <strong>Coherence:</strong> Use linking words (However, Furthermore, Moreover)</li>
                <li style={{ marginBottom: '0.5rem' }}>📝 <strong>Vocabulary:</strong> Use topic-specific vocabulary and synonyms</li>
                <li style={{ marginBottom: '0.5rem' }}>✅ <strong>Grammar:</strong> Use a variety of complex sentence structures</li>
                <li>⏱️ <strong>Time Management:</strong> Spend 5 mins planning, 30 mins writing, 5 mins reviewing</li>
              </ul>
            </div>
          </div>

          {!isPrimeUser && (
            <div style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              textAlign: 'center',
              color: 'white'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Upgrade to Prime
              </h3>
              <p style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '1rem' }}>
                Get AI-powered essay scoring, detailed band breakdown, and expert feedback on your writing
              </p>
              <button
                onClick={() => navigate('/ielts/apply-prime')}
                style={{
                  padding: '0.75rem 2rem',
                  background: 'white',
                  color: '#1e40af',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.875rem'
                }}
              >
                🚀 Get Expert Feedback
              </button>
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
            ← Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: 'clamp(0.75rem, 2vw, 1rem)'
    }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: 'clamp(1rem, 3vw, 1.5rem)',
          marginBottom: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#10b981', marginBottom: '0.25rem' }}>
                IELTS Writing - {task.task_type === 'task1' ? 'Task 1' : 'Task 2'}
              </div>
              <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.875rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>
                {task.title || 'Writing Practice'}
              </h1>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: 'clamp(0.7rem, 2vw, 0.875rem)', color: '#64748b', flexWrap: 'wrap' }}>
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
                cursor: 'pointer',
                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)'
              }}
            >
              Exit
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'clamp(1rem, 2vw, 1.5rem)' }}>
          {/* Task Prompt - Left Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: 'clamp(1rem, 3vw, 1.5rem)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}>
              <h2 style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>📋 Task</h2>
              
              <div
                ref={promptContainerRef}
                style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: 'clamp(0.75rem, 2vw, 1.25rem)',
                marginBottom: '1.5rem',
                overflowX: 'auto'
              }}>
                <pre style={{ 
                  color: '#334155', 
                  lineHeight: 1.75, 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', 
                  fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                  margin: 0
                }}>{task.prompt}</pre>
              </div>

              {/* Timer & Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1px solid #6ee7b7',
                  borderRadius: '0.5rem',
                  padding: 'clamp(0.75rem, 2vw, 1rem)'
                }}>
                  <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#065f46', marginBottom: '0.25rem' }}>Time Elapsed</div>
                  <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', color: '#059669' }}>{formatTime(timeElapsed)}</div>
                  <div style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)', color: '#6b7280', marginTop: '0.25rem' }}>
                    Recommended: {task.task_type === 'task1' ? '20 minutes' : '40 minutes'}
                  </div>
                </div>

                <div style={{
                  background: wordCount >= getMinWords() ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: `1px solid ${wordCount >= getMinWords() ? '#6ee7b7' : '#f59e0b'}`,
                  borderRadius: '0.5rem',
                  padding: 'clamp(0.75rem, 2vw, 1rem)'
                }}>
                  <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: wordCount >= getMinWords() ? '#065f46' : '#92400e', marginBottom: '0.25rem' }}>
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
                ref={editorRef}
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
                  onClick={() => handleSubmit()}
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
