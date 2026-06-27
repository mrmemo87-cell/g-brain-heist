import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { getUserTier, isIeltsPrime } from '../../../services/ieltsService';
import { supabase } from '../../../services/supabaseClient';
import { trackIeltsFunnelEvent } from '../../../services/ieltsFunnelAnalytics';

// Audio URLs for each section
const SECTION_AUDIO = {
  1: 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/ielts-listening-sample-task-2-form-completion.mp3',
};

// Task 2 - Form Completion
const TRIAL_TEST_DATA = {
  title: "IELTS Listening Task 2",
  description: "Complete the form to receive your score and feedback",
  totalQuestions: 10,
  sections: [
    {
      id: 1,
      title: "Section 1",
      subtitle: "NOTES: travelling to France",
      instructions: "Questions 1-10: Complete the form below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
      context: {
        type: 'form',
        formTitle: 'NOTES: travelling to France',
        example: { label: 'Time of travel', value: 'September' }
      },
      questions: [
        { id: 1, type: 'fill-blank', label: 'Advantage of travelling by train', prefix: '', suffix: '', answer: 'faster', acceptableAnswers: ['faster', 'Faster'] },
        { id: 2, type: 'fill-blank', label: 'Advantage of travelling by train', prefix: '', suffix: '', answer: 'more affordable', acceptableAnswers: ['more affordable', 'More affordable'] },
        { id: 3, type: 'fill-blank', label: 'Advantage of travelling by train', prefix: 'take as much', suffix: 'as you need', answer: 'luggage', acceptableAnswers: ['luggage', 'Luggage'] },
        { id: 4, type: 'fill-blank', label: 'The Eurostar', prefix: 'runs on schedule', suffix: 'of the time', answer: '92.4 percent', acceptableAnswers: ['92.4 percent', '92.4%', '92.4'] },
        { id: 5, type: 'fill-blank', label: 'The Eurostar', prefix: 'can reach speeds of', suffix: 'miles per hour', answer: '186', acceptableAnswers: ['186', '186 miles per hour'] },
        { id: 6, type: 'fill-blank', label: 'Two options from Paris to Nice (1)', prefix: 'Catch the TGV train at', suffix: '', answer: '11:46', acceptableAnswers: ['11:46', '11.46', '1146'] },
        { id: 7, type: 'fill-blank', label: 'Two options from Paris to Nice (2)', prefix: 'Catch the TGV train at', suffix: '', answer: '22:25', acceptableAnswers: ['22:25', '22.25', '2225'] },
        { id: 8, type: 'fill-blank', label: 'Two options from Paris to Nice (2)', prefix: 'and travel', suffix: '', answer: 'overnight', acceptableAnswers: ['overnight', 'Overnight'] },
        { id: 9, type: 'fill-blank', label: 'Single tickets cost approximately', prefix: '', suffix: 'the return fare', answer: 'half', acceptableAnswers: ['half', 'half of', 'Half', 'half (of)'] },
        { id: 10, type: 'fill-blank', label: 'Flying from London to Nice takes', prefix: '', suffix: 'hours', answer: '2', acceptableAnswers: ['2', '2 hours', 'two hours'] },
      ]
    }
  ]
};

const TrialListeningTask2: React.FC = () => {
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const resultViewedTrackedRef = useRef(false);
  const retakeBlockedTrackedRef = useRef(false);
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioLocked, setAudioLocked] = useState(false);
  const audioLockRef = useRef(false);
  const allowAutoResumeRef = useRef(true);
  const preloadRefs = useRef<HTMLAudioElement[]>([]);
  const [userTier, setUserTier] = useState('free');
  const [retakeBlocked, setRetakeBlocked] = useState(false);
  const [retakeCheckLoading, setRetakeCheckLoading] = useState(true);
  const [submittedResult, setSubmittedResult] = useState<{ percentage: number; bandScore: number } | null>(null);
  const isPrimeUser = isIeltsPrime({ tier: userTier });
  const userType = 'independent' as const;


  useEffect(() => {
    let active = true;
    const checkCompletedDiagnostic = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) setRetakeCheckLoading(false);
        return;
      }
      const { data } = await supabase
        .from('ielts_funnel_events')
        .select('id')
        .eq('user_id', auth.user.id)
        .eq('event_name', 'diagnostic_completed')
        .contains('metadata', { task_id: 'trial-test-2' })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setRetakeBlocked(true);
        if (!retakeBlockedTrackedRef.current) {
          retakeBlockedTrackedRef.current = true;
          trackIeltsFunnelEvent('diagnostic_retake_blocked', { skill: 'listening', task_id: 'trial-test-2', user_type: userType });
        }
      }
      setRetakeCheckLoading(false);
    };
    void checkCompletedDiagnostic();
    return () => { active = false; };
  }, []);

  // Stop background music
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
      if (timerRef.current) clearInterval(timerRef.current);
      // Cleanup audio
      if (audioRef.current) {
        allowAutoResumeRef.current = false;
        audioRef.current.pause();
        audioRef.current = null;
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
        audioLockRef.current = false;
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

  useEffect(() => {
    preloadRefs.current = Object.values(SECTION_AUDIO).map((url) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio.load();
      return audio;
    });

    return () => {
      preloadRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
    };
  }, []);

  // Initialize audio for current section
  useEffect(() => {
    if (hasStarted && !showResults) {
      const sectionId = currentSection + 1;
      const audioUrl = SECTION_AUDIO[sectionId as keyof typeof SECTION_AUDIO];
      
      // Cleanup previous audio
      if (audioRef.current) {
        audioLockRef.current = false;
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      setAudioLoading(true);
      setAudioError(null);
      setAudioProgress(0);
      setIsPlaying(false);
      setAudioLocked(false);
      audioLockRef.current = false;
      
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audioRef.current = audio;
      
      audio.addEventListener('loadedmetadata', () => {
        setAudioDuration(audio.duration);
        setAudioLoading(false);
      });
      
      audio.addEventListener('timeupdate', () => {
        setAudioProgress(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setAudioLocked(false);
        audioLockRef.current = false;
      });

      audio.addEventListener('pause', () => {
        if (audioLockRef.current && !audio.ended && allowAutoResumeRef.current) {
          audio.play().catch(() => {
            setAudioError('Could not resume audio. Please refresh the page.');
          });
        }
      });
      
      audio.addEventListener('error', () => {
        setAudioError('Failed to load audio. Please check your connection.');
        setAudioLoading(false);
      });
      
      audio.load();
    }
    
    return () => {
      if (audioRef.current) {
        audioLockRef.current = false;
        audioRef.current.pause();
      }
    };
  }, [currentSection, hasStarted, showResults]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (audioLockRef.current) return;

    audioRef.current.play().then(() => {
      setIsPlaying(true);
      setAudioLocked(true);
      audioLockRef.current = true;
    }).catch(() => {
      setAudioError('Could not play audio. Please try again.');
      setIsPlaying(false);
      setAudioLocked(false);
      audioLockRef.current = false;
    });
  };

  const seekAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setAudioProgress(time);
  };

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer
  useEffect(() => {
    if (hasStarted && !showResults) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasStarted, showResults]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const calculateScore = () => {
    let correct = 0;
    let results: { id: number; userAnswer: string; correctAnswer: string; isCorrect: boolean }[] = [];
    let totalQuestions = 0;

    TRIAL_TEST_DATA.sections.forEach(section => {
      section.questions.forEach(q => {
        totalQuestions++;
        const userAnswer = (answers[q.id] || '').trim();
        const isCorrect = q.acceptableAnswers.some(
          acceptable => acceptable.toLowerCase() === userAnswer.toLowerCase()
        );
        if (isCorrect) correct++;
        results.push({
          id: q.id,
          userAnswer: userAnswer || '(no answer)',
          correctAnswer: q.answer,
          isCorrect
        });
      });
    });

    return { correct, total: totalQuestions, percentage: Math.round((correct / totalQuestions) * 100), results };
  };

  const getBandScore = (percentage: number) => {
    if (percentage >= 90) return 9;
    if (percentage >= 80) return 8;
    if (percentage >= 70) return 7;
    if (percentage >= 60) return 6;
    if (percentage >= 50) return 5;
    if (percentage >= 40) return 4;
    if (percentage >= 30) return 3;
    return 2;
  };

  const getFeedback = (bandScore: number) => {
    if (bandScore >= 8) return { level: 'Excellent', message: 'Outstanding performance! You demonstrate near-native listening comprehension.' };
    if (bandScore >= 7) return { level: 'Very Good', message: 'Strong listening skills. You can understand complex ideas with good accuracy.' };
    if (bandScore >= 6) return { level: 'Good', message: 'Competent listener. You handle most situations well but may miss some details.' };
    if (bandScore >= 5) return { level: 'Moderate', message: 'Adequate skills for basic communication. Focus on improving vocabulary and speed.' };
    return { level: 'Developing', message: 'Keep practicing! Work on basic listening skills and common vocabulary.' };
  };


  const getListeningInsights = (correct: number, total: number, incorrectCount: number, bandScore: number) => {
    const missedNumbersAndTimes = [4, 5, 6, 7, 10].filter((id) => {
      const q = TRIAL_TEST_DATA.sections.flatMap(section => section.questions).find(item => item.id === id);
      if (!q) return false;
      const userAnswer = (answers[q.id] || '').trim();
      return !q.acceptableAnswers.some(acceptable => acceptable.toLowerCase() === userAnswer.toLowerCase());
    }).length;
    const accuracy = total > 0 ? correct / total : 0;

    return {
      strength: accuracy >= 0.7
        ? 'You captured most form-completion details under one-play audio conditions — a strong base for higher-band Listening practice.'
        : accuracy >= 0.4
          ? 'You are picking up direct travel details, which gives you a practical baseline to build from.'
          : 'You completed the diagnostic and now have a clear baseline instead of guessing what to practise.',
      weakness: incorrectCount === 0
        ? 'No missed items here. The next challenge is maintaining accuracy across longer sections with faster speakers and more distractors.'
        : missedNumbersAndTimes >= 2
          ? `You missed ${missedNumbersAndTimes} number/time detail${missedNumbersAndTimes === 1 ? '' : 's'}, so precision with times, prices, percentages, and dates is the highest-value focus.`
          : `You missed ${incorrectCount} item${incorrectCount === 1 ? '' : 's'} overall, likely from distractor wording, spelling, or losing the exact form-completion phrase.`,
      fastestGains: bandScore >= 7
        ? 'Move into full-section listening practice with transcripts: mark every distractor phrase and check spelling after each replay.'
        : 'Prioritise short form-completion drills: numbers/dates, distractor phrases, spelling, and exact word-limit answers.',
      nextPractice: bandScore >= 7
        ? 'Next recommended practice: a timed 40-question Listening test, then transcript review for every missed or guessed answer.'
        : 'Next recommended practice: 10-minute targeted Listening sets before full tests, starting with form completion and number-heavy audio.'
    };
  };

  const handleSubmit = () => {
    if (retakeBlocked) {
      navigate('/ielts');
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    const { percentage } = calculateScore();
    const bandScore = getBandScore(percentage);
    setSubmittedResult({ percentage, bandScore });
    if (Object.keys(answers).length > 0) {
      trackIeltsFunnelEvent('diagnostic_completed', {
        skill: 'listening',
        task_id: 'trial-test-2',
        estimated_band: bandScore,
        user_type: userType,
      });
    }
    setShowResults(true);
  };


  useEffect(() => {
    if (!showResults || resultViewedTrackedRef.current) return;
    const bandScore = submittedResult?.bandScore;
    if (bandScore === undefined) return;
    resultViewedTrackedRef.current = true;
    trackIeltsFunnelEvent('result_viewed', {
      skill: 'listening',
      task_id: 'trial-test-2',
      estimated_band: bandScore,
      user_type: userType,
    });
  }, [showResults, submittedResult]);

  const section = TRIAL_TEST_DATA.sections[currentSection];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = TRIAL_TEST_DATA.sections.reduce((sum, s) => sum + s.questions.length, 0);
  const fillBlankQuestions = section.questions.filter(q => q.type === 'fill-blank');
  const firstFillBlankId = fillBlankQuestions[0]?.id;
  const lastFillBlankId = fillBlankQuestions[fillBlankQuestions.length - 1]?.id;


  if (retakeCheckLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e0f2fe' }}>Checking your diagnostic status…</div>;
  }

  if (retakeBlocked) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e1b4b)', color: '#fff', padding: '2rem', display: 'grid', placeItems: 'center' }}>
        <div style={{ maxWidth: 620, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(148,163,184,.25)', borderRadius: '1.25rem', padding: 'clamp(1.25rem,4vw,2rem)', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>✅</div>
          <h1 style={{ margin: '.5rem 0', fontSize: 'clamp(1.6rem,5vw,2.6rem)' }}>Diagnostic already completed</h1>
          <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>To protect your baseline, this exact free diagnostic can only be submitted once. Your result and recommended next step are waiting on your IELTS dashboard.</p>
          <button type="button" onClick={() => navigate('/ielts')} style={{ background: 'linear-gradient(135deg,#22d3ee,#2563eb,#7c3aed)', color: '#fff', border: 0, borderRadius: 999, padding: '.9rem 1.2rem', fontWeight: 950, cursor: 'pointer' }}>Back to IELTS dashboard →</button>
        </div>
      </div>
    );
  }

  // Start Screen
  if (!hasStarted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)',
        color: 'white'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎧</div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              IELTS Listening Task 2
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
              Complete this form-completion task to sharpen your listening accuracy
            </p>
          </div>

          {/* Test Info Card */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            padding: 'clamp(1.5rem, 4vw, 2rem)',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(10px)'
          }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: '#60a5fa' }}>Test Overview</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>1</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Section</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>10</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Questions</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>FREE</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Task 2</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ec4899' }}>~8</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Minutes</div>
            </div>
          </div>

          <div style={{ textAlign: 'left', fontSize: '0.875rem', color: '#cbd5e1' }}>
              <p style={{ marginBottom: '0.5rem' }}>📝 <strong>Section 1:</strong> Form completion (travelling to France)</p>
              <p>📝 <strong>Focus:</strong> Listen for numbers, times, and key travel details</p>
          </div>
        </div>

          {/* Audio Tip */}
          <div style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            borderRadius: '1rem',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '2rem' }}>🎧</span>
            <div style={{ textAlign: 'left', fontSize: '0.8rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Audio Included!</p>
              <p style={{ color: '#bae6fd' }}>This task uses real IELTS-style audio. Use headphones for best experience.</p>
            </div>
          </div>

          {/* What You'll Get */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            borderRadius: '1rem',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>✨ What You'll Receive</h3>
            <div style={{ fontSize: '0.875rem', textAlign: 'left' }}>
              <p style={{ marginBottom: '0.5rem' }}>✓ Your estimated band score</p>
              <p style={{ marginBottom: '0.5rem' }}>✓ Correct answers revealed</p>
              <p>✓ Brief performance feedback</p>
            </div>
          </div>

          {!isPrimeUser && (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
              borderRadius: '1rem',
              padding: '1rem',
              marginBottom: '2rem',
              fontSize: '0.8rem'
            }}>
              <p style={{ marginBottom: '0.5rem' }}>⭐ <strong>PRIME members</strong> get:</p>
              <p style={{ color: '#c4b5fd' }}>Detailed feedback, tips & tricks, audio transcripts, and personalized study plans</p>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={() => { trackIeltsFunnelEvent('diagnostic_started', { skill: 'listening', task_id: 'trial-test-2', user_type: userType }); setHasStarted(true); }}
            style={{
              width: '100%',
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '1rem'
            }}
          >
            Start Listening Task 2 🚀
          </button>

          <button
            onClick={() => navigate('/ielts')}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            ← Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults) {
    const { correct, total, percentage, results } = calculateScore();
    const bandScore = getBandScore(percentage);
    const incorrectCount = total - correct;
    const targetBand = Math.min(9, Math.max(7, bandScore + 1));
    const bandGap = Math.max(0, targetBand - bandScore);

    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Score Header */}
          <div style={{
            background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 52%, #312e81 100%)',
            border: '1px solid rgba(125, 211, 252, 0.22)',
            borderRadius: '1.25rem',
            padding: 'clamp(1.35rem, 4vw, 2rem)',
            marginBottom: '1rem',
            textAlign: 'center',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)',
            color: 'white',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(34, 211, 238, 0.22), transparent 35%), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.22), transparent 38%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.7rem', borderRadius: '999px', background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(148, 163, 184, 0.28)', color: '#bae6fd', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.85rem' }}>
                IELTS Listening free diagnostic complete
              </div>
              <h1 style={{ fontSize: 'clamp(1.65rem, 8vw, 2.75rem)', lineHeight: 1.05, margin: '0 0 0.65rem', letterSpacing: '-0.04em' }}>
                Band {bandScore}.0 Today → Target Band {targetBand}.0
              </h1>
              <p style={{ color: '#cbd5e1', fontSize: '0.92rem', margin: 0 }}>
                {bandGap > 0 ? `You’re ${bandGap.toFixed(1).replace('.0', '')} band away from IELTS ${targetBand}.` : `You’re already in the Band ${targetBand}.0 target range for this short practice task.`} This is an estimated band from a practice diagnostic, not official IELTS scoring.
              </p>

              <div style={{
                background: 'rgba(15, 23, 42, 0.72)',
                border: '1px solid rgba(148, 163, 184, 0.24)',
                borderRadius: '1rem',
                padding: '1rem',
                margin: '1.25rem 0',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Current estimated band</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#67e8f9' }}>{bandScore}.0</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Next target</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#c4b5fd' }}>Band {targetBand}.0</div>
                  </div>
                </div>
                <div style={{ height: '0.7rem', borderRadius: '999px', background: 'rgba(51, 65, 85, 0.95)', overflow: 'hidden', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.35)' }}>
                  <div style={{ width: `${Math.min(100, Math.max(8, (bandScore / targetBand) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, #22d3ee 0%, #818cf8 55%, #c084fc 100%)', borderRadius: '999px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700 }}>
                  <span>Band 4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(74, 222, 128, 0.24)', borderRadius: '0.75rem', padding: '0.75rem' }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#86efac' }}>{correct}</div><div style={{ fontSize: '0.7rem', color: '#bbf7d0' }}>Correct</div></div>
                <div style={{ background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.24)', borderRadius: '0.75rem', padding: '0.75rem' }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fca5a5' }}>{total - correct}</div><div style={{ fontSize: '0.7rem', color: '#fecaca' }}>Missed</div></div>
                <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(96, 165, 250, 0.24)', borderRadius: '0.75rem', padding: '0.75rem' }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#93c5fd' }}>{percentage}%</div><div style={{ fontSize: '0.7rem', color: '#bfdbfe' }}>Practice score</div></div>
              </div>
            </div>
          </div>

          {/* Diagnostic Summary */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1rem',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
            border: '1px solid #e2e8f0'
          }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.85rem' }}>🎯 Your fastest path from Band {bandScore}.0</h2>
            {(() => {
              const insights = getListeningInsights(correct, total, incorrectCount, bandScore);
              return <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.86rem', color: '#334155', lineHeight: 1.55 }}>
                <div><strong style={{ color: '#15803d' }}>Strengths:</strong> {insights.strength}</div>
                <div><strong style={{ color: '#b91c1c' }}>Weaknesses:</strong> {insights.weakness}</div>
                <div><strong style={{ color: '#7c3aed' }}>Fastest score gains:</strong> {insights.fastestGains}</div>
                <div><strong style={{ color: '#1d4ed8' }}>Next recommended practice:</strong> {insights.nextPractice}</div>
              </div>;
            })()}
          </div>

          {/* Answers Review */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem' }}>
              📋 Answer Review
            </h2>
            
            {TRIAL_TEST_DATA.sections.map((section, sIdx) => (
              <div key={section.id} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '0.875rem', 
                  color: '#3b82f6', 
                  marginBottom: '0.75rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  {section.title}: {section.subtitle}
                </h3>
                
                {section.questions.map(q => {
                  const result = results.find(r => r.id === q.id);
                  return (
                    <div 
                      key={q.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: result?.isCorrect ? '#f0fdf4' : '#fef2f2',
                        borderRadius: '0.5rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem'
                      }}
                    >
                      <span style={{ 
                        fontSize: '1rem',
                        flexShrink: 0
                      }}>
                        {result?.isCorrect ? '✅' : '❌'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', marginBottom: '0.25rem' }}>
                          <strong>Q{q.id}:</strong> {q.type === 'mcq' ? (q as any).question : (q as any).label || 'Fill in the blank'}
                        </div>
                        <div style={{ color: result?.isCorrect ? '#15803d' : '#dc2626' }}>
                          Your answer: <strong>{result?.userAnswer}</strong>
                        </div>
                        {!result?.isCorrect && (
                          <div style={{ color: '#16a34a' }}>
                            Correct: <strong>{result?.correctAnswer}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {!isPrimeUser && (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
              borderRadius: '1rem',
              padding: 'clamp(1.25rem, 3vw, 1.5rem)',
              marginBottom: '1rem',
              color: 'white',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⭐</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Unlock Your Band 7 Plan</h3>
              <p style={{ fontSize: '0.85rem', color: '#ddd6fe', marginBottom: '1rem', lineHeight: 1.55 }}>
                Based on your result, your fastest gains are targeted listening drills, transcripts, full practice tests, and progress tracking. IELTS Prime can help turn this estimated band into a focused practice path.
              </p>
              <div style={{ display: 'grid', gap: '0.45rem', textAlign: 'left', fontSize: '0.82rem', color: '#ede9fe', marginBottom: '1rem' }}>
                <span>✓ Weakness-focused drills</span>
                <span>✓ Listening transcripts</span>
                <span>✓ Full IELTS practice tests</span>
                <span>✓ Progress tracking</span>
                <span>✓ Writing/Speaking feedback where available</span>
              </div>
              <button
                onClick={() => { trackIeltsFunnelEvent('prime_upsell_click', { skill: 'listening', task_id: 'trial-test-2', estimated_band: bandScore, plan: 'quarterly', user_type: userType }); navigate('/ielts/apply-prime?plan=quarterly&autostart=1'); }}
                style={{
                  padding: '0.75rem 2rem',
                  background: 'white',
                  color: '#7c3aed',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Unlock My Band 7 Plan
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                padding: '0.875rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              View IELTS Dashboard
            </button>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                padding: '0.875rem',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              ← Back to IELTS Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Test Screen
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      paddingBottom: '6rem' // Space for fixed bottom bar
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: 'clamp(0.75rem, 2vw, 1rem)',
        zIndex: 100
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#1e293b' }}>
              {section.title}: {section.subtitle}
            </div>
            <div style={{ 
              background: '#3b82f6', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              ⏱️ {formatTime(timeElapsed)}
            </div>
          </div>
          
          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {TRIAL_TEST_DATA.sections.map((s, idx) => {
              const sectionAnswered = s.questions.filter(q => answers[q.id]).length;
              const sectionTotal = s.questions.length;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSection(idx)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: currentSection === idx ? '#3b82f6' : '#f1f5f9',
                    color: currentSection === idx ? 'white' : '#475569'
                  }}
                >
                  S{idx + 1} ({sectionAnswered}/{sectionTotal})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        padding: '0.75rem 1rem',
        zIndex: 99,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {audioLoading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', padding: '0.5rem' }}>
              🔄 Loading audio...
            </div>
          ) : audioError ? (
            <div style={{ textAlign: 'center', color: '#fca5a5', fontSize: '0.875rem', padding: '0.5rem' }}>
              ⚠️ {audioError}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                disabled={audioLocked}
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '50%',
                  background: isPlaying ? '#ef4444' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  cursor: audioLocked ? 'not-allowed' : 'pointer',
                  fontSize: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'transform 0.1s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  opacity: audioLocked ? 0.8 : 1
                }}
              >
                {audioLocked ? '🔒' : '▶️'}
              </button>
              
              {/* Progress Bar */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <input
                  type="range"
                  min="0"
                  max={audioDuration || 100}
                  value={audioProgress}
                  onChange={seekAudio}
                  disabled={audioLocked}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: `linear-gradient(to right, #3b82f6 ${(audioProgress / (audioDuration || 1)) * 100}%, #475569 ${(audioProgress / (audioDuration || 1)) * 100}%)`,
                    cursor: audioLocked ? 'not-allowed' : 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>{formatAudioTime(audioProgress)}</span>
                  <span>{formatAudioTime(audioDuration)}</span>
                </div>
              </div>
              
              {/* Section Label */}
              <div style={{ 
                background: '#3b82f6', 
                color: 'white', 
                padding: '0.25rem 0.5rem', 
                borderRadius: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}>
                🎧 S{currentSection + 1}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Question Content */}
      <div style={{ padding: 'clamp(1rem, 3vw, 1.5rem)', maxWidth: '600px', margin: '0 auto' }}>
        {/* Instructions */}
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          border: '1px solid #93c5fd',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0 }}>
            📝 {section.instructions}
          </p>
        </div>

        {/* Form Context */}
        {section.context.type === 'form' && (
          <>
            {/* Questions: Fill-in-the-blank form */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1rem',
              border: '2px solid #e2e8f0'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                color: '#1e293b', 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #3b82f6'
              }}>
                📋 {section.context.formTitle}
              </h3>
              
              <div style={{ 
                background: '#dbeafe', 
                padding: '0.5rem 0.75rem', 
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#1e40af'
              }}>
                <strong>Questions {firstFillBlankId}–{lastFillBlankId}:</strong> Complete the form below
              </div>
              
              {section.context.example && (
                <div style={{ 
                  background: '#f0fdf4', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.85rem'
                }}>
                  <span style={{ color: '#6b7280' }}>Example - {section.context.example.label}: </span>
                  <strong style={{ color: '#16a34a' }}>{section.context.example.value}</strong>
                </div>
              )}

              {fillBlankQuestions.map(q => (
                <div key={q.id} style={{ marginBottom: '1rem' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8rem', 
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#3b82f6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      marginRight: '0.5rem',
                      fontSize: '0.75rem'
                    }}>
                      {q.id}
                    </span>
                    {(q as any).label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Type your answer"
                      style={{
                        flex: 1,
                        minWidth: '150px',
                        padding: '0.625rem 0.875rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9rem',
                        outline: 'none',
                        color: '#000',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                    {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Questions 7-10: Matching */}
            {section.matchingOptions && section.questions.some(q => q.type === 'matching') && (
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '2px solid #e2e8f0'
              }}>
                <div style={{ 
                  background: '#fef3c7', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#92400e'
                }}>
                  <strong>Questions 7–10:</strong> Where does the speaker decide to put items in?
                  <br />Write the correct letter, A, B, or C
                </div>
                
                {/* Options Legend */}
                <div style={{
                  display: 'grid',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  background: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '0.5rem'
                }}>
                  {section.matchingOptions.map((opt: any) => (
                    <div key={opt.letter} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{
                        background: '#f59e0b',
                        color: 'white',
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.75rem'
                      }}>
                        {opt.letter}
                      </span>
                      <span style={{ color: '#374151' }}>{opt.label}</span>
                    </div>
                  ))}
                </div>

                {/* Matching Items */}
                <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.75rem' }}>
                  Items:
                </div>
                
                {section.questions.filter(q => q.type === 'matching').map(q => (
                  <div key={q.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    padding: '0.75rem',
                    background: '#fefce8',
                    borderRadius: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#f59e0b', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {q.id}
                    </span>
                    <span style={{ flex: 1, color: '#374151', fontSize: '0.875rem' }}>{q.label}</span>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      {['A', 'B', 'C'].map(letter => (
                        <button
                          key={letter}
                          onClick={() => handleAnswerChange(q.id, letter)}
                          style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '50%',
                            border: `2px solid ${answers[q.id] === letter ? '#f59e0b' : '#d1d5db'}`,
                            background: answers[q.id] === letter ? '#fef3c7' : 'white',
                            color: answers[q.id] === letter ? '#92400e' : '#6b7280',
                            fontWeight: 'bold',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Notes style (Sections 2 & 4) */}
        {section.context.type === 'notes' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #f59e0b'
            }}>
              📝 {section.context.formTitle}
            </h3>

            {section.questions.map(q => (
              <div key={q.id} style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.8rem', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    background: '#f59e0b', 
                    color: 'white', 
                    padding: '0.125rem 0.5rem', 
                    borderRadius: '0.25rem',
                    marginRight: '0.5rem',
                    fontSize: '0.75rem'
                  }}>
                    {q.id}
                  </span>
                  {(q as any).label}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer"
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '0.625rem 0.875rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.9rem',
                      outline: 'none',
                      color: '#000'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                  {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table style (Section 2) */}
        {section.context.type === 'table' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #10b981'
            }}>
              📅 {section.context.formTitle}
            </h3>

            {/* Fill-blank questions */}
            {section.questions.filter(q => q.type === 'fill-blank').map(q => (
              <div key={q.id} style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.8rem', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    background: '#10b981', 
                    color: 'white', 
                    padding: '0.125rem 0.5rem', 
                    borderRadius: '0.25rem',
                    marginRight: '0.5rem',
                    fontSize: '0.75rem'
                  }}>
                    {q.id}
                  </span>
                  {(q as any).label}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer"
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '0.625rem 0.875rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.9rem',
                      outline: 'none',
                      color: '#000'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                  {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                </div>
              </div>
            ))}

            {/* MCQ questions in Section 2 */}
            {section.questions.filter(q => q.type === 'mcq').length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#ecfdf5', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#065f46'
                }}>
                  <strong>Questions {section.questions.filter(q => q.type === 'mcq')[0]?.id}–{section.questions.filter(q => q.type === 'mcq').slice(-1)[0]?.id}:</strong> Choose the correct letter, A, B, or C
                </div>
                
                {section.questions.filter(q => q.type === 'mcq').map(q => {
                  const mcqQ = q as typeof q & { question: string; options: string[] };
                  return (
                    <div key={q.id} style={{ marginBottom: '1.25rem' }}>
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{ 
                          background: '#10b981', 
                          color: 'white', 
                          padding: '0.125rem 0.5rem', 
                          borderRadius: '0.25rem',
                          marginRight: '0.5rem',
                          fontSize: '0.75rem'
                        }}>
                          {q.id}
                        </span>
                        {mcqQ.question}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {mcqQ.options.map((option, oIdx) => {
                          const optionLetter = option.charAt(0);
                          const isSelected = answers[q.id] === optionLetter;
                          return (
                            <button
                              key={oIdx}
                              onClick={() => handleAnswerChange(q.id, optionLetter)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.625rem 0.875rem',
                                border: `2px solid ${isSelected ? '#10b981' : '#e2e8f0'}`,
                                borderRadius: '0.5rem',
                                background: isSelected ? '#ecfdf5' : 'white',
                                color: isSelected ? '#065f46' : '#374151',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                transition: 'all 0.2s'
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MCQ style (Section 3) - handles MCQ, multi-select, and fill-blank */}
        {section.context.type === 'mcq' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #8b5cf6'
            }}>
              🎓 {section.context.formTitle}
            </h3>

            {/* Regular MCQ questions */}
            {section.questions.filter(q => q.type === 'mcq').map(q => {
              const mcqQ = q as typeof q & { question: string; options: string[] };
              return (
                <div key={q.id} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: '#1e293b',
                    marginBottom: '0.75rem'
                  }}>
                    <span style={{ 
                      background: '#8b5cf6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      marginRight: '0.5rem',
                      fontSize: '0.75rem'
                    }}>
                      {q.id}
                    </span>
                    {mcqQ.question}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mcqQ.options.map((option, oIdx) => {
                      const optionLetter = option.charAt(0);
                      const isSelected = answers[q.id] === optionLetter;
                      return (
                        <button
                          key={oIdx}
                          onClick={() => handleAnswerChange(q.id, optionLetter)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.75rem 1rem',
                            border: `2px solid ${isSelected ? '#8b5cf6' : '#e2e8f0'}`,
                            borderRadius: '0.5rem',
                            background: isSelected ? '#f5f3ff' : 'white',
                            color: isSelected ? '#5b21b6' : '#374151',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Multi-select questions (Q27-29) */}
            {section.questions.filter(q => q.type === 'multi-select').length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#faf5ff', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  color: '#6b21a8'
                }}>
                  <strong>Questions 27–29:</strong> Which THREE compulsory courses must be taken?
                  <br /><span style={{ fontSize: '0.75rem' }}>Choose THREE letters, A-G (one per question)</span>
                </div>
                
                {/* Options Legend */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  background: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem'
                }}>
                  {(section as any).multiSelectOptions?.map((opt: any) => (
                    <div key={opt.letter} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{
                        background: '#8b5cf6',
                        color: 'white',
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.65rem'
                      }}>
                        {opt.letter}
                      </span>
                      <span style={{ color: '#374151' }}>{opt.label}</span>
                    </div>
                  ))}
                </div>

                {section.questions.filter(q => q.type === 'multi-select').map(q => (
                  <div key={q.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    padding: '0.75rem',
                    background: '#faf5ff',
                    borderRadius: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#8b5cf6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {q.id}
                    </span>
                    <span style={{ flex: 1, color: '#374151', fontSize: '0.85rem' }}>{(q as any).label}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(letter => (
                        <button
                          key={letter}
                          onClick={() => handleAnswerChange(q.id, letter)}
                          style={{
                            width: '2rem',
                            height: '2rem',
                            borderRadius: '50%',
                            border: `2px solid ${answers[q.id] === letter ? '#8b5cf6' : '#d1d5db'}`,
                            background: answers[q.id] === letter ? '#f5f3ff' : 'white',
                            color: answers[q.id] === letter ? '#5b21b6' : '#6b7280',
                            fontWeight: 'bold',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fill-blank question (Q30) */}
            {section.questions.filter(q => q.type === 'fill-blank').length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#faf5ff', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#6b21a8'
                }}>
                  <strong>Question 30:</strong> Complete the sentence. Write NO MORE THAN TWO WORDS.
                </div>
                
                {section.questions.filter(q => q.type === 'fill-blank').map(q => (
                  <div key={q.id} style={{ marginBottom: '1rem' }}>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.85rem', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ 
                        background: '#8b5cf6', 
                        color: 'white', 
                        padding: '0.125rem 0.5rem', 
                        borderRadius: '0.25rem',
                        marginRight: '0.5rem',
                        fontSize: '0.75rem'
                      }}>
                        {q.id}
                      </span>
                      {(q as any).label}
                    </label>
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Type your answer"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                      onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid #e2e8f0',
        padding: '1rem',
        zIndex: 100
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setCurrentSection(prev => Math.max(0, prev - 1))}
              disabled={currentSection === 0}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: currentSection === 0 ? '#f1f5f9' : '#e2e8f0',
                color: currentSection === 0 ? '#9ca3af' : '#475569',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: currentSection === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.9rem'
              }}
            >
              ← Previous
            </button>

            {currentSection < TRIAL_TEST_DATA.sections.length - 1 ? (
              <button
                onClick={() => setCurrentSection(prev => prev + 1)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9rem'
                }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
              >
                Submit Test ✓
              </button>
            )}
          </div>
          
          <div style={{ 
            textAlign: 'center', 
            marginTop: '0.5rem', 
            fontSize: '0.75rem', 
            color: '#64748b' 
          }}>
            Answered: {answeredCount}/{totalQuestions} questions
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialListeningTask2;
