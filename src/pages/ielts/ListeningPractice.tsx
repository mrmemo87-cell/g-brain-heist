import IeltsMaterialProvenance from "../../components/ielts/IeltsMaterialProvenance";
import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import '../../styles/ielts-design-system.css';
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import IeltsPracticeSkillResults, { skillBreakdown } from '../../components/ielts/IeltsPracticeSkillResults';
import { fetchPracticeAttemptReview, PRACTICE_QUESTION_COLUMNS, type PracticeAttemptReview } from '../../../services/ieltsPracticeReview';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile, getUserTier, isIeltsPrime, saveNotificationPreferences } from '../../../services/ieltsService';
import { rpcIeltsPracticeMarkItemCompleted, rpcIeltsPracticeMarkItemSubmitted, type IeltsPracticeAssignmentProgress } from '../../../services/ieltsPracticeAssignmentService';
import { AssignmentCompletionStatus, readIeltsPracticeAssignmentContext } from './assignmentPracticeUi';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { buildListeningAttemptPayload, toRawScoreResult } from '../../lib/ieltsPracticeScoring';

interface ListeningSet {
  originality_label?: string | null;
  display_code?: string | null;
  id: number;
  slug: string;
  title: string;
  description: string;
  instructions: string | null;
  example_prompt: string | null;
  example_answer: string | null;
  section_label: string | null;
  question_range_label: string | null;
  level: string;
  est_band_min: number;
  est_band_max: number;
  duration_minutes: number;
  audio_url: string;
  required_tier?: string | null;
}

interface ListeningQuestion {
  id: number;
  set_id: number;
  question_order: number;
  question_type: string;
  body: string;
  options: string[] | null;
  correct_answer?: unknown;
  explanation?: string | null;
}

const ListeningPractice: React.FC = () => {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const assignmentContext = readIeltsPracticeAssignmentContext();
  const { assignmentId, assignmentItemId } = assignmentContext;
  
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [startTime] = useState(Date.now());
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioEnded, setAudioEnded] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [userTier, setUserTier] = useState('free');
  const isPrimeUser = isIeltsPrime({ tier: userTier });
  
  // Success screen state
  const [alternateEmail, setAlternateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAudioTimeRef = useRef(0);
  const allowAutoResumeRef = useRef(true);

  // Stop background music when entering IELTS Listening practice
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      allowAutoResumeRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
      }
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

  useEffect(() => {
    const stopAudio = () => {
      allowAutoResumeRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAudio();
      }
    };

    window.addEventListener('pagehide', stopAudio);
    window.addEventListener('beforeunload', stopAudio);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', stopAudio);
      window.removeEventListener('beforeunload', stopAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Audio time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setAudioCurrentTime(audio.currentTime);
      lastAudioTimeRef.current = audio.currentTime;
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handlePlay = () => {
      setIsAudioPlaying(true);
      setAudioPlayed(true);
      setAudioStarted(true);
    };

    const handlePause = () => {
      setIsAudioPlaying(false);
      if (audioStarted && !audioEnded && allowAutoResumeRef.current) {
        void audio.play();
      }
    };

    const handleEnded = () => {
      setIsAudioPlaying(false);
      setAudioEnded(true);
    };

    const handleSeeking = () => {
      if (audioStarted && !audioEnded) {
        audio.currentTime = lastAudioTimeRef.current;
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('seeking', handleSeeking);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('seeking', handleSeeking);
    };
  }, [audioStarted, audioEnded]);

  const startAudio = async () => {
    if (audioStarted || audioEnded) return;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.play();
    } catch (error) {
      console.error('Audio play failed:', error);
    }
  };

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
        .select(PRACTICE_QUESTION_COLUMNS)
        .eq('set_id', setId)
        .order('question_order', { ascending: true });
      
      if (error) throw error;
      return data as ListeningQuestion[];
    },
    enabled: !!setId,
  });

  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [review, setReview] = useState<PracticeAttemptReview | null>(null);
  const keyFor = (questionId: number) => review?.items.find((item) => item.question_id === questionId) ?? null;
  const [assignmentProgress, setAssignmentProgress] = useState<IeltsPracticeAssignmentProgress | null>(null);
  const [assignmentCompletionError, setAssignmentCompletionError] = useState<string | null>(null);
  const [isMeaningfulSubmission, setIsMeaningfulSubmission] = useState(true);
  const [answeredCountAtSubmit, setAnsweredCountAtSubmit] = useState(0);
  const [showSubmitWithBlanksPrompt, setShowSubmitWithBlanksPrompt] = useState(false);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { setId: number; answers: Record<number, string>; timeSpent: number }) => {
      // Ensure user exists in ielts_users
      await ensureIeltsProfile();

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const attemptScore = calculateResults();
      const attemptPayload = buildListeningAttemptPayload(
        {
          user_id: session.session.user.id,
          set_id: data.setId,
          answers: data.answers,
          time_spent_seconds: data.timeSpent,
          completed_at: new Date().toISOString(),
        },
        {
          rawScore: attemptScore.correct,
          totalQuestions: attemptScore.total,
          percent: attemptScore.percentage,
        },
      );

      const { data: result, error } = await supabase
        .from('ielts_listening_attempts')
        .insert(attemptPayload)
        .select()
        .single();

      if (error) throw error;

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
            practiceAttemptType: 'listening',
            practiceAttemptId: result?.id ?? null,
          });
          if (canComplete) {
            progress = await rpcIeltsPracticeMarkItemCompleted({
              assignmentId,
              assignmentItemId,
              practiceAttemptType: 'listening',
              practiceAttemptId: result?.id ?? null,
            });
          }
        } catch (completionError) {
          itemCompletionError = completionError instanceof Error ? completionError.message : 'Unable to mark assignment item completed.';
        }
      }

      const review = result?.id ? await fetchPracticeAttemptReview('listening', result.id) : null;
      return { attempt: result, review, progress, itemCompletionError, answeredCount, canComplete, totalQuestions };
    },
    onSuccess: (data) => {
      setReview(data.review);
      setLastAttemptId(data.attempt?.id);
      setAssignmentProgress(data.progress);
      setAssignmentCompletionError(data.itemCompletionError);
      setIsMeaningfulSubmission(data.answeredCount > 0);
      setAnsweredCountAtSubmit(data.answeredCount);
      setShowResults(true);
    },
  });

  // Save notification preferences when user updates them
  const savePreferencesMutation = useMutation({
    mutationFn: () => {
      if (!lastAttemptId) throw new Error('No attempt ID');
      return saveNotificationPreferences({
        attemptType: 'listening',
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

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const submitNow = () => {
    if (!setId) return;
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    submitMutation.mutate({
      setId: Number(setId),
      answers,
      timeSpent,
    });
  };

  const handleSubmit = () => {
    if (assignmentContext.isAssignedPractice) {
      const totalQuestions = questions?.length ?? 0;
      const answeredCount = Object.values(answers).filter((answer) => String(answer ?? '').trim().length > 0).length;
      const unansweredCount = Math.max(totalQuestions - answeredCount, 0);
      if (unansweredCount > 0) {
        setShowSubmitWithBlanksPrompt(true);
        return;
      }
    }
    submitNow();
  };

  // Scored by the database from the real keys; the browser never has them before submitting.
  const calculateResults = () => {
    if (!review) return { correct: 0, total: questions?.length ?? 0, percentage: 0 };
    return toRawScoreResult(review.raw_score, review.total);
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
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #15243A 0%, #193E65 55%, #15243A 100%)',
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

  if (!listeningSet || !questions || questions.length === 0) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>No listening content available for this task</h2>
          <p style={{ marginBottom: '1rem', color: '#475569' }}>
            This assignment item may be misconfigured or the content is unavailable. Please return to My IELTS Journey and open another assigned task.
          </p>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#6366f1',
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

  if ((listeningSet?.required_tier ?? 'prime_prep_user') !== 'free' && !isPrimeUser) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #15243A 0%, #234566 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0', maxWidth: '500px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Prime access required</h2>
          <p style={{ fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            Listening practice sets are available to IELTS Prime members. Upgrade to continue.
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
    const totalQuestions = questions?.length ?? 0;
    const isPartialAssignedSubmission = assignmentContext.isAssignedPractice && answeredCountAtSubmit > 0 && answeredCountAtSubmit < totalQuestions;
    const assignmentSubmissionNotice = assignmentContext.isAssignedPractice
      ? (answeredCountAtSubmit === 0
        ? 'Submitted with no answers recorded.'
        : (answeredCountAtSubmit < totalQuestions
          ? `Answered ${answeredCountAtSubmit}/${totalQuestions}. Complete all questions to finish this assignment item.`
          : null))
      : null;

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
            <p>{ieltsMaterialTitle(listeningSet.display_code, listeningSet.title)}<IeltsMaterialProvenance label={listeningSet.originality_label}/></p>
          </div>
          
          <AssignmentCompletionStatus
            context={assignmentContext}
            progress={assignmentProgress}
            completionError={assignmentCompletionError}
            submissionNotice={assignmentSubmissionNotice}
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
            
            {isMeaningfulSubmission && !isPartialAssignedSubmission ? <div style={{
              marginTop: '1.25rem',
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '0.65rem',
              color: '#475569',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              display: 'inline-block'
            }}>
              Practice result only — this score is not a verified IELTS readiness band.
            </div> : <div style={{ marginTop: '1rem', color: '#92400e', fontWeight: 700 }}>
              {answeredCountAtSubmit === 0
                ? 'Submitted with no answers recorded.'
                : `Answered ${answeredCountAtSubmit} of ${totalQuestions} questions. Complete all questions to finish this assignment item.`}
            </div>}
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
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: 'clamp(0.8rem, 2vw, 1rem)' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Your answers have been recorded and graded.</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>This page shows practice performance only. Verified IELTS readiness is calculated separately when sufficient evidence exists.</span>
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
              {questions.map((q: ListeningQuestion, idx: number) => {
                const userAnswer = answers[q.id];
                const reviewed = keyFor(q.id);
                const correctAnswer = reviewed?.correct_answer ?? null;
                const isCorrect = reviewed?.is_correct ?? false;

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
                          {keyFor(q.id)?.explanation && (
                            <div style={{ marginTop: '0.5rem', color: '#64748b', fontStyle: 'italic' }}>
                              {keyFor(q.id)?.explanation}
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

          <IeltsPracticeSkillResults review={review} />
          {skillBreakdown(review).length === 0 && <>
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
                  <span style={{ fontWeight: 600, color: '#166534' }}>Excellent Listening Skills!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>✓ You have strong listening comprehension abilities</li>
                  <li style={{ marginBottom: '0.5rem' }}>✓ Practice with faster audio speeds for extra challenge</li>
                  <li>✓ Try listening to different accents (British, Australian, American)</li>
                </ul>
              </div>
            ) : results.percentage >= 60 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>📈</span>
                  <span style={{ fontWeight: 600, color: '#ca8a04' }}>Good Progress - Keep Improving!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>🎧 <strong>Active Listening:</strong> Listen to English podcasts daily</li>
                  <li style={{ marginBottom: '0.5rem' }}>📝 <strong>Note-Taking:</strong> Practice writing while listening</li>
                  <li style={{ marginBottom: '0.5rem' }}>🔤 <strong>Spelling:</strong> Pay attention to exact spelling of words</li>
                  <li>⏱️ <strong>Prediction:</strong> Read questions first and predict answers</li>
                </ul>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>💪</span>
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>Focus on These Areas!</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                  <li style={{ marginBottom: '0.5rem' }}>🎬 <strong>Immersion:</strong> Watch English movies with subtitles</li>
                  <li style={{ marginBottom: '0.5rem' }}>🔄 <strong>Repetition:</strong> Listen to the same audio multiple times</li>
                  <li style={{ marginBottom: '0.5rem' }}>📖 <strong>Transcripts:</strong> Read along while listening</li>
                  <li style={{ marginBottom: '0.5rem' }}>🎯 <strong>Focus:</strong> Identify keywords and signal words</li>
                  <li>🗣️ <strong>Accents:</strong> Familiarize yourself with different English accents</li>
                </ul>
              </div>
            )}
          </div>
          </>}

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
                Get unlimited practice tests, AI-powered feedback, and personalized study plans
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
                background: 'linear-gradient(135deg, #1746B0 0%, #103B9A 100%)',
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

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bh-ielts-background)', fontFamily: 'var(--bh-ielts-font-body)', color: 'var(--bh-ielts-foreground)',
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
                {ieltsMaterialTitle(listeningSet.display_code, listeningSet.title)}<IeltsMaterialProvenance label={listeningSet.originality_label}/>
              </h1>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: 'clamp(0.7rem, 2vw, 0.875rem)', color: '#64748b', flexWrap: 'wrap' }}>
                <span>Level: {listeningSet.level}</span>
                <span>•</span>
                <span>{listeningSet.duration_minutes} min</span>
                {listeningSet.est_band_min != null && listeningSet.est_band_max != null && <><span>•</span><span>Suggested level: band {listeningSet.est_band_min}–{listeningSet.est_band_max}</span></>}
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
          {/* Audio Player - Left Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: 'clamp(1rem, 3vw, 1.5rem)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}>
              <h2 style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Recording
              </h2>
              
              {/* Enhanced Timer Display */}
              <div style={{
                background: isAudioPlaying ? 'var(--bh-ielts-secondary)' : 'var(--bh-ielts-surface-muted)',
                border: `1px solid ${isAudioPlaying ? 'var(--bh-ielts-primary)' : 'var(--bh-ielts-border)'}`,
                borderRadius: '0.75rem',
                padding: 'clamp(0.75rem, 2vw, 1rem)',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.75rem)', color: isAudioPlaying ? 'var(--bh-ielts-primary)' : 'var(--bh-ielts-foreground-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  {isAudioPlaying ? 'Now playing' : 'Recording time'}
                </div>
                <div style={{ 
                  fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
                  fontWeight: 'bold', 
                  color: 'var(--bh-ielts-foreground)',
                  fontFamily: 'var(--bh-ielts-font-mono)', fontVariantNumeric: 'tabular-nums'
                }}>
                  {formatTime(Math.floor(audioCurrentTime))} / {formatTime(Math.floor(audioDuration))}
                </div>
                {/* Progress Bar */}
                <div style={{ 
                  width: '100%', 
                  height: '0.5rem', 
                  background: '#e2e8f0', 
                  borderRadius: '9999px', 
                  marginTop: '0.75rem',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%',
                    background: 'var(--bh-ielts-primary)',
                    borderRadius: '9999px',
                    transition: 'width 0.1s linear'
                  }} />
                </div>
              </div>

              {/* Audio Player or Missing Audio Notice */}
              {listeningSet.audio_url && !listeningSet.audio_url.startsWith('/audio/') ? (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <button
                    onClick={startAudio}
                    disabled={audioStarted || audioEnded}
                    style={{
                      width: '4.5rem',
                      height: '4.5rem',
                      borderRadius: '9999px',
                      border: 'none',
                      background: audioEnded
                        ? 'var(--bh-ielts-foreground-muted)'
                        : audioStarted
                          ? 'var(--bh-ielts-primary-hover)'
                          : 'var(--bh-ielts-primary)',
                      color: 'white',
                      fontSize: '1.75rem',
                      cursor: audioStarted || audioEnded ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(23, 70, 176, 0.25)',
                      transition: 'transform 0.2s'
                    }}
                    aria-label="Play listening audio"
                  >
                    {audioEnded ? '✓' : audioStarted ? '♪' : '▶'}
                  </button>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                    {audioEnded ? 'Recording finished. Check your answers, then submit.' : audioStarted ? 'Playing. Answer as you listen.' : 'Press play when you are ready. You hear it once.'}
                  </div>
                  <audio ref={audioRef} preload="metadata">
                    <source src={listeningSet.audio_url} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              ) : (
                <div style={{
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                  border: '1px solid #fca5a5',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#b91c1c', marginBottom: '0.5rem' }}>
                    Audio Not Available
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: 0 }}>
                    The audio file for this listening test has not been uploaded yet. 
                    Please contact the administrator or try another test.
                  </p>
                </div>
              )}

              <div style={{
                background: 'var(--bh-ielts-surface-muted)',
                border: '1px solid var(--bh-ielts-border)',
                borderLeft: '3px solid var(--bh-ielts-accent)',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--bh-ielts-foreground)', marginBottom: '0.5rem' }}>As in the IELTS test</h3>
                <ul style={{ fontSize: '0.875rem', color: 'var(--bh-ielts-foreground-muted)', paddingLeft: '1.1rem', margin: 0, lineHeight: 1.6 }}>
                  <li>You hear the recording once.</li>
                  <li>Answer as you listen.</li>
                  <li>Check your answers and spelling at the end.</li>
                </ul>
              </div>

              {/* Section Navigation */}
              {groupedQuestions.length > 1 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>Sections</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {groupedQuestions.map((_: ListeningQuestion[], idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSection(idx)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          border: 'none',
                          cursor: 'pointer',
                          background: currentSection === idx ? 'var(--bh-ielts-primary)' : 'var(--bh-ielts-secondary)',
                          color: currentSection === idx ? 'white' : '#475569'
                        }}
                      >
                        {listeningSet.section_label?.trim() || `Section ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--bh-ielts-foreground-muted)', marginBottom: '0.25rem' }}>Answered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--bh-ielts-foreground)' }}>
                  {Object.keys(answers).length} / {questions.length}
                </div>
              </div>
            </div>
          </div>

          {/* Questions - Right Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>

              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <p style={{ fontSize: '0.875rem', color: '#334155', margin: 0, fontWeight: 500 }}>
                  {listeningSet.instructions?.trim() || 'Answer the questions as you listen to the recording.'}
                </p>
                {listeningSet.example_prompt?.trim() && listeningSet.example_answer?.trim() && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: 'var(--bh-ielts-secondary)',
                    border: '1px solid #c7d2fe'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--bh-ielts-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                      Example
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                      <strong>{listeningSet.example_prompt}</strong>: {listeningSet.example_answer}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>
                  {(listeningSet.section_label?.trim() || `Section ${currentSection + 1}`)} Questions
                </h2>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  {listeningSet.question_range_label?.trim() || `Questions ${currentSection * 10 + 1} - ${Math.min((currentSection + 1) * 10, questions.length)}`}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {groupedQuestions[currentSection]?.map((q: ListeningQuestion, idx: number) => {
                  const questionNumber = currentSection * 10 + idx + 1;
                  const options: string[] = q.options ? (Array.isArray(q.options) ? q.options : []) : [];

                  return (
                    <div key={q.id} style={{
                      background: '#f8fafc',
                      borderRadius: '0.75rem',
                      padding: '1.25rem',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{
                          flexShrink: 0,
                          width: '2rem',
                          height: '2rem',
                          background: 'var(--bh-ielts-primary)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '0.875rem'
                        }}>
                          {questionNumber}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#1e293b', fontWeight: 500, marginBottom: '1rem' }}>{q.body}</p>
                          
                          {/* Multiple Choice */}
                          {options.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {options.map((option: string, optIdx: number) => (
                                <button
                                  key={optIdx}
                                  onClick={() => handleAnswer(q.id, option)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    border: `1px solid ${answers[q.id] === option ? '#6366f1' : '#d1d5db'}`,
                                    background: answers[q.id] === option ? '#eff6ff' : 'white',
                                    color: answers[q.id] === option ? 'var(--bh-ielts-primary)' : 'var(--bh-ielts-foreground)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ fontWeight: 500, marginRight: '0.5rem' }}>
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
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.5rem',
                                color: '#1e293b',
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                {currentSection > 0 && (
                  <button
                    onClick={() => setCurrentSection(prev => prev - 1)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      cursor: 'pointer'
                    }}
                  >
                    ← Previous Section
                  </button>
                )}
                
                {currentSection < groupedQuestions.length - 1 ? (
                  <button
                    onClick={() => setCurrentSection(prev => prev + 1)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #1746B0 0%, #103B9A 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    Next Section →
                  </button>
                ) : (
                <button
                  onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      background: submitMutation.isPending ? 'var(--bh-ielts-foreground-muted)' : 'var(--bh-ielts-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: submitMutation.isPending ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {submitMutation.isPending ? 'Submitting…' : 'Submit answers'}
                  </button>
                )}
              </div>
              {showSubmitWithBlanksPrompt && assignmentContext.isAssignedPractice && (
                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.75rem', color: '#92400e', fontWeight: 700 }}>
                    You have {(questions?.length ?? 0) - Object.values(answers).filter((answer) => String(answer ?? '').trim().length > 0).length} unanswered question(s). You can submit now, but this assignment item will not be completed until all questions are answered.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setShowSubmitWithBlanksPrompt(false)} style={{ padding: '0.6rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #f59e0b', background: '#ffffff', color: '#92400e', fontWeight: 700, cursor: 'pointer' }}>
                      Go back and answer
                    </button>
                    <button type="button" onClick={() => { setShowSubmitWithBlanksPrompt(false); submitNow(); }} style={{ padding: '0.6rem 0.9rem', borderRadius: '0.5rem', border: 'none', background: '#d97706', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                      Submit anyway
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListeningPractice;
