import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

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
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  
  // Success screen state
  const [alternateEmail, setAlternateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stop background music when entering IELTS Listening practice
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Audio time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setAudioCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handlePlay = () => {
      setIsAudioPlaying(true);
      setAudioPlayed(true);
    };

    const handlePause = () => {
      setIsAudioPlaying(false);
    };

    const handleEnded = () => {
      setIsAudioPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>No listening content available</h2>
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

  if (showResults) {
    const results = calculateResults();
    const bandScore = estimateBandScore(results.percentage);

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
              Listening Test Complete!
            </h1>
          </div>
          
          {/* Score Display */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: '#1e40af', marginBottom: '0.5rem' }}>
              {results.correct}/{results.total}
            </div>
            <div style={{ fontSize: '1.25rem', color: '#3b82f6' }}>{results.percentage}% Correct</div>
            
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '0.5rem',
              display: 'inline-block'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.25rem' }}>Estimated Band Score</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#b45309' }}>{bandScore}</div>
            </div>
          </div>

          {/* Expert Review Notice */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎯</span> Your Results Have Been Recorded
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Your answers have been automatically graded</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>A detailed performance report will be sent to your email within <strong>24 hours</strong></span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                <span>Review your answers below to see explanations</span>
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
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Notify me by email when detailed report is ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyBySms}
                  onChange={(e) => setNotifyBySms(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Send SMS notification when report is ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyInApp}
                  onChange={(e) => setNotifyInApp(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Show in-app notification</span>
              </label>
            </div>
          </div>

          {/* Answer Review */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>Answer Review</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {questions.map((q: ListeningQuestion, idx: number) => {
                const userAnswer = answers[q.id];
                const correctAnswer = q.correct_answer;
                const isCorrect = userAnswer?.toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();

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
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Back to IELTS Home
            </button>
            <button
              onClick={() => {
                setAnswers({});
                setShowResults(false);
                setAudioPlayed(false);
              }}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Try Again
            </button>
          </div>
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
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>
              {listeningSet.title}
            </h1>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
              <span>Level: {listeningSet.level}</span>
              <span>•</span>
              <span>Duration: {listeningSet.duration_minutes} min</span>
              <span>•</span>
              <span>Band: {listeningSet.est_band_min} - {listeningSet.est_band_max}</span>
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
          {/* Audio Player - Left Side */}
          <div>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              position: 'sticky',
              top: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎧 Audio Player
              </h2>
              
              {/* Enhanced Timer Display */}
              <div style={{
                background: isAudioPlaying ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' : '#f8fafc',
                border: `1px solid ${isAudioPlaying ? '#f59e0b' : '#e2e8f0'}`,
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: isAudioPlaying ? '#92400e' : '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isAudioPlaying ? '🔴 Recording Time' : 'Audio Time'}
                </div>
                <div style={{ 
                  fontSize: '2.5rem', 
                  fontWeight: 'bold', 
                  color: isAudioPlaying ? '#b45309' : '#1e293b',
                  fontFamily: 'monospace'
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
                    background: isAudioPlaying ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' : '#6366f1',
                    borderRadius: '9999px',
                    transition: 'width 0.1s linear'
                  }} />
                </div>
              </div>

              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <audio
                  ref={audioRef}
                  controls
                  style={{ width: '100%' }}
                >
                  <source src={listeningSet.audio_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>⚠️ IELTS Listening Rules</h3>
                <ul style={{ fontSize: '0.75rem', color: '#78350f', listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: '0.25rem' }}>• You will hear the audio ONCE only</li>
                  <li style={{ marginBottom: '0.25rem' }}>• Answer as you listen</li>
                  <li style={{ marginBottom: '0.25rem' }}>• Check your answers at the end</li>
                  <li>• Pay attention to spelling</li>
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
                          background: currentSection === idx ? '#6366f1' : '#f1f5f9',
                          color: currentSection === idx ? 'white' : '#475569'
                        }}
                      >
                        Section {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Questions Answered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>
                  Section {currentSection + 1} Questions
                </h2>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Questions {currentSection * 10 + 1} - {Math.min((currentSection + 1) * 10, questions.length)}
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
                          background: '#6366f1',
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
                                    color: answers[q.id] === option ? '#4f46e5' : '#475569',
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
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
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
                      background: submitMutation.isPending ? '#9ca3af' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: submitMutation.isPending ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
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
