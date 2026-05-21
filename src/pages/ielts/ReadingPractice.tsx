import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchActiveReadingSets,
  fetchReadingQuestions,
  getUserTier,
  isIeltsPrime,
  saveNotificationPreferences,
  submitReadingAttempt,
} from '../../../services/ieltsService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { rpcIeltsPracticeMarkItemCompleted, rpcIeltsPracticeMarkItemSubmitted, type IeltsPracticeAssignmentProgress } from '../../../services/ieltsPracticeAssignmentService';
import { AssignmentCompletionStatus, readIeltsPracticeAssignmentContext } from './assignmentPracticeUi';
import type { IELTSReadingQuestion } from '../../../types';
import { estimateIeltsBandFromPercent, toRawScoreResult } from '../../lib/ieltsPracticeScoring';

interface Answer {
  questionId: number;
  answer: string;
}

const ReadingPractice: React.FC = () => {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const assignmentContext = readIeltsPracticeAssignmentContext();
  const { assignmentId, assignmentItemId } = assignmentContext;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [startTime] = useState(Date.now());
  const [showResults, setShowResults] = useState(false);
  const [userTier, setUserTier] = useState('free');
  const isPrimeUser = isIeltsPrime({ tier: userTier });

  // Success screen state
  const [alternateEmail, setAlternateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);

  // Stop background music when entering IELTS Reading practice
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

  const { data: readingSets, isLoading: loadingSets } = useQuery({
    queryKey: ['reading-sets'],
    queryFn: fetchActiveReadingSets,
  });

  const { data: questions, isLoading: loadingQuestions } = useQuery({
    queryKey: ['reading-questions', setId],
    queryFn: () => fetchReadingQuestions(Number(setId)),
    enabled: !!setId,
  });

  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [assignmentProgress, setAssignmentProgress] = useState<IeltsPracticeAssignmentProgress | null>(null);
  const [assignmentCompletionError, setAssignmentCompletionError] = useState<string | null>(null);
  const [isMeaningfulSubmission, setIsMeaningfulSubmission] = useState(true);

  const submitMutation = useMutation({
    mutationFn: async (data: { setId: number; answers: Record<number, string>; timeSpent: number }) => {
      const attemptScore = calculateResults();
      const attempt = await submitReadingAttempt(data.setId, data.answers, data.timeSpent, {
        rawScore: attemptScore.correct,
        totalQuestions: attemptScore.total,
        percent: attemptScore.percentage,
        estBand: estimateIeltsBandFromPercent(attemptScore.percentage),
      });
      let progress: IeltsPracticeAssignmentProgress | null = null;
      let itemCompletionError: string | null = null;
      const totalQuestions = questions?.length ?? 0;
      const answeredCount = Object.values(data.answers).filter((answer) => String(answer ?? '').trim().length > 0).length;
      const canComplete = totalQuestions > 0 && answeredCount >= totalQuestions;

      if (assignmentId && assignmentItemId) {
        try {
          progress = await rpcIeltsPracticeMarkItemSubmitted({
            assignmentId,
            assignmentItemId,
            practiceAttemptType: 'reading',
            practiceAttemptId: attempt?.id ?? null,
          });
          if (canComplete) {
            progress = await rpcIeltsPracticeMarkItemCompleted({
              assignmentId,
              assignmentItemId,
              practiceAttemptType: 'reading',
              practiceAttemptId: attempt?.id ?? null,
            });
          }
        } catch (error) {
          itemCompletionError = error instanceof Error ? error.message : 'Unable to mark assignment item completed.';
        }
      }

      return { attempt, progress, itemCompletionError, answeredCount };
    },
    onSuccess: (data) => {
      setLastAttemptId(data.attempt?.id);
      setAssignmentProgress(data.progress);
      setAssignmentCompletionError(data.itemCompletionError);
      setIsMeaningfulSubmission(data.answeredCount > 0);
      setShowResults(true);
    },
  });

  // Save notification preferences when user updates them
  const savePreferencesMutation = useMutation({
    mutationFn: () => {
      if (!lastAttemptId) throw new Error('No attempt ID');
      return saveNotificationPreferences({
        attemptType: 'reading',
        attemptId: lastAttemptId,
        alternateEmail,
        phoneNumber,
        notifyByEmail,
        notifyBySms,
        showInApp: notifyInApp,
      });
    },
  });

  // Auto-save preferences when they change (after submission)
  useEffect(() => {
    if (lastAttemptId && showResults) {
      const timer = setTimeout(() => {
        savePreferencesMutation.mutate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [alternateEmail, phoneNumber, notifyByEmail, notifyBySms, notifyInApp, lastAttemptId, showResults]);

  const currentSet = readingSets?.find((set: any) => set.id === Number(setId));
  const currentQuestion = questions?.[currentQuestionIndex];
  const canAccessRequiredTier = (requiredTier?: string | null) => !requiredTier || requiredTier === 'free' || isPrimeUser;

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
      // correct_answer is already parsed from JSONB, no need to JSON.parse
      const correctAnswer = q.correct_answer;
      
      if (userAnswer === correctAnswer) {
        correct++;
      }
    });

    return toRawScoreResult(correct, questions.length);
  };

  if (loadingSets || loadingQuestions) {
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

  if (!currentSet || !questions || questions.length === 0) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>No questions available</h2>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#3b82f6',
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

  if (!canAccessRequiredTier(currentSet.required_tier)) {
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
            This reading set is available to IELTS Prime members. Upgrade to unlock the full library.
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

  if (showResults) {
    const results = calculateResults();
    const bandScore = results.bandScore;

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
          {/* Success Header */}
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
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
              Practice Completed
            </h1>
          </div>

          <AssignmentCompletionStatus
            context={assignmentContext}
            progress={assignmentProgress}
            completionError={assignmentCompletionError}
            onNavigate={navigate}
          />
          
          {/* Score Display */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '0.75rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 'bold', color: '#1e40af', marginBottom: '0.5rem' }}>
              {results.correct}/{results.total}
            </div>
            <div style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', color: '#3b82f6' }}>{results.percentage}% Correct</div>
            
            {isMeaningfulSubmission ? <div style={{
              marginTop: '1.5rem',
              padding: 'clamp(0.75rem, 2vw, 1rem)',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '0.5rem',
              display: 'inline-block'
            }}>
              <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#92400e', marginBottom: '0.25rem' }}>Estimated Band Score</div>
              <div style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', fontWeight: 'bold', color: '#b45309' }}>{bandScore}</div>
            </div> : <div style={{ marginTop: '1rem', color: '#92400e', fontWeight: 700 }}>Submitted with no answers recorded. Not enough data yet for readiness/band estimate.</div>}
          </div>

          {/* Expert Review Notice */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)', fontWeight: '600', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎯</span> Your IELTS Practice Result
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Your answers have been recorded and graded.</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Estimated readiness is shown above when available.</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Feedback visibility depends on assignment and exam rules.</span>
              </li>
            </ul>
          </div>

          {/* Answer Review (Practice-only fallback; assigned/exam controlled by settings) */}
          {!assignmentContext.isAssignedPractice && <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>Answer Review</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {questions.map((q: IELTSReadingQuestion, idx: number) => {
                const userAnswer = answers[q.id];
                const correctAnswer = q.correct_answer;
                const isCorrect = userAnswer === correctAnswer;

                return (
                  <div key={q.id} style={{
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${isCorrect ? '#86efac' : '#fca5a5'}`,
                    background: isCorrect ? '#f0fdf4' : '#fef2f2'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{
                        flexShrink: 0,
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isCorrect ? '#22c55e' : '#ef4444',
                        color: 'white',
                        fontSize: '0.75rem'
                      }}>
                        {isCorrect ? '✓' : '✗'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#1e293b', fontWeight: 500, marginBottom: '0.5rem' }}>
                          Q{idx + 1}: {q.body}
                        </div>
                        <div style={{ fontSize: '0.875rem' }}>
                          <div style={{ color: '#475569' }}>
                            Your answer: <span style={{ color: isCorrect ? '#16a34a' : '#dc2626' }}>
                              {userAnswer || 'Not answered'}
                            </span>
                          </div>
                          {!isCorrect && (
                            <div style={{ color: '#475569' }}>
                              Correct answer: <span style={{ color: '#16a34a' }}>{correctAnswer}</span>
                            </div>
                          )}
                          {q.explanation && (
                            <div style={{ marginTop: '0.5rem', color: '#64748b', fontStyle: 'italic' }}>
                              {q.explanation}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}

          {/* Personalized Improvement Tips */}
          <div style={{
            background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
            border: '1px solid #e879f9',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#86198f', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Personalized Improvement Plan
            </h3>
            
            {results.percentage >= 80 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🏆</span>
                  <span style={{ fontWeight: 600, color: '#166534' }}>Excellent Performance!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>✓ You demonstrate strong reading comprehension skills</li>
                  <li style={{ marginBottom: '0.5rem' }}>✓ Continue challenging yourself with timed practice tests</li>
                  <li>✓ Focus on maintaining speed while keeping accuracy high</li>
                </ul>
              </div>
            ) : results.percentage >= 60 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>📈</span>
                  <span style={{ fontWeight: 600, color: '#ca8a04' }}>Good Progress - Room to Grow!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>📖 <strong>Vocabulary:</strong> Read more English articles daily to expand vocabulary</li>
                  <li style={{ marginBottom: '0.5rem' }}>⏱️ <strong>Time Management:</strong> Practice skimming and scanning techniques</li>
                  <li style={{ marginBottom: '0.5rem' }}>🔍 <strong>Detail Focus:</strong> Pay closer attention to keywords and synonyms</li>
                  <li>📝 <strong>Strategy:</strong> Read questions first, then find answers in the passage</li>
                </ul>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>💪</span>
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>Keep Practicing - You'll Get There!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>📚 <strong>Build Vocabulary:</strong> Learn 10 new words daily with context</li>
                  <li style={{ marginBottom: '0.5rem' }}>🎯 <strong>Question Types:</strong> Practice each question type separately</li>
                  <li style={{ marginBottom: '0.5rem' }}>📖 <strong>Reading Speed:</strong> Start with easier texts and gradually increase difficulty</li>
                  <li style={{ marginBottom: '0.5rem' }}>✍️ <strong>Active Reading:</strong> Underline key information as you read</li>
                  <li>🔄 <strong>Review Mistakes:</strong> Analyze why you got answers wrong</li>
                </ul>
              </div>
            )}
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
                Get unlimited practice tests, AI-powered essay feedback, speaking evaluations, and personalized study plans
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
                🚀 Unlock Full Access
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ← Back to IELTS Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // options is already parsed from JSONB, no need to JSON.parse
  const parsedOptions = currentQuestion?.options 
    ? (Array.isArray(currentQuestion.options) 
        ? currentQuestion.options 
        : [])
    : [];

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
              <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.875rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>
                {currentSet.title}
              </h1>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: 'clamp(0.7rem, 2vw, 0.875rem)', color: '#64748b', flexWrap: 'wrap' }}>
                <span>Level: {currentSet.level}</span>
                <span>•</span>
                <span>{currentSet.duration_minutes} min</span>
                <span>•</span>
                <span>Band: {currentSet.est_band_min}-{currentSet.est_band_max}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'clamp(0.7rem, 2vw, 0.875rem)', color: '#64748b' }}>Progress</div>
              <div style={{ fontSize: 'clamp(1.125rem, 3vw, 1.5rem)', fontWeight: 'bold', color: '#3b82f6' }}>
                {currentQuestionIndex + 1} / {questions.length}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(1rem, 2vw, 1.5rem)' }}>
          {/* Passage */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            maxHeight: '70vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>Passage</h2>
            <div style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
              {currentSet.passage_text}
            </div>
          </div>

          {/* Question */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b', marginBottom: '0.5rem' }}>
                Question {currentQuestionIndex + 1}
              </div>
              <h3 style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 500, color: '#1e293b', marginBottom: '1.5rem' }}>
                {currentQuestion.body}
              </h3>

              {/* Multiple Choice Questions */}
              {parsedOptions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {parsedOptions.map((option: string, idx: number) => (
                    <button
                      key={idx}
                      data-testid={`ielts-reading-option-${idx}`}
                      onClick={() => handleAnswer(option)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 'clamp(0.75rem, 2vw, 1rem)',
                        borderRadius: '0.5rem',
                        border: `1px solid ${answers[currentQuestion.id] === option ? '#3b82f6' : '#d1d5db'}`,
                        background: answers[currentQuestion.id] === option ? '#eff6ff' : 'white',
                        color: answers[currentQuestion.id] === option ? '#1e40af' : '#475569',
                        cursor: 'pointer',
                        fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                /* Fill-in-the-blank / Short Answer Questions */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input
                    data-testid="ielts-reading-answer-input"
                    type="text"
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    style={{
                      width: '100%',
                      padding: 'clamp(0.75rem, 2vw, 1rem)',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                      outline: 'none',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    💡 Type your answer in the box above
                  </p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', flexWrap: 'wrap' }}>
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: 'clamp(0.625rem, 2vw, 0.75rem) 1rem',
                  background: currentQuestionIndex === 0 ? '#e2e8f0' : '#f1f5f9',
                  color: currentQuestionIndex === 0 ? '#9ca3af' : '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                }}
              >
                Previous
              </button>
              
              {currentQuestionIndex < questions.length - 1 ? (
                <button
                  onClick={handleNext}
                  style={{
                    flex: 1,
                    minWidth: '120px',
                    padding: 'clamp(0.625rem, 2vw, 0.75rem) 1rem',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                  }}
                >
                  Next
                </button>
              ) : (
                <button
                  data-testid="ielts-reading-submit"
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  style={{
                    flex: 1,
                    minWidth: '120px',
                    padding: 'clamp(0.625rem, 2vw, 0.75rem) 1rem',
                    background: submitMutation.isPending ? '#9ca3af' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: submitMutation.isPending ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                  }}
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
