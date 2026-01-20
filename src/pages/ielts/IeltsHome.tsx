import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveListeningSets,
  fetchActiveReadingSets,
  fetchActiveSpeakingTasks,
  fetchActiveWritingTasks,
  fetchUserCompletedTasks,
  UserCompletedTasks,
} from '../../../services/ieltsService';
import type { IELTSListeningSet, IELTSReadingSet, IELTSSpeakingTask, IELTSWritingTask } from '../../../types';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
  const primeRedirectUrl = 'https://www.brainsheist.com/ielts/apply-prime';
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [readingSets, setReadingSets] = useState<IELTSReadingSet[]>([]);
  const [listeningSets, setListeningSets] = useState<IELTSListeningSet[]>([]);
  const [writingTasks, setWritingTasks] = useState<IELTSWritingTask[]>([]);
  const [speakingTasks, setSpeakingTasks] = useState<IELTSSpeakingTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserCompletedTasks>({ reading: [], listening: [], writing: [], speaking: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stop background music when entering IELTS section
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      if (musicEnabled) {
        resumeBackgroundMusic();
      }
    };
  }, []);

  const toggleMusic = () => {
    if (musicEnabled) {
      stopBackgroundMusic();
      setMusicEnabled(false);
    } else {
      resumeBackgroundMusic();
      setMusicEnabled(true);
    }
  };

  const redirectToPrime = () => {
    window.location.href = primeRedirectUrl;
  };

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [reading, listening, writing, speaking, completed] = await Promise.all([
          fetchActiveReadingSets(),
          fetchActiveListeningSets(),
          fetchActiveWritingTasks(),
          fetchActiveSpeakingTasks(),
          fetchUserCompletedTasks(),
        ]);

        setReadingSets(reading);
        const excludedListeningTitles = new Set([
          'IELTS Listening Sample Task 1 (Form Completion)',
          'IELTS Listening Sample Task 2 (Form Completion)',
        ]);
        const filteredListening = listening.filter((set) => !excludedListeningTitles.has(set.title));
        setListeningSets(filteredListening);
        setWritingTasks(writing);
        setSpeakingTasks(speaking);
        setCompletedTasks(completed);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load IELTS tasks.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#ffffff',
      color: '#1f2937',
      position: 'relative',
    }}>
      {/* Music Toggle - Fixed position */}
      <button
        onClick={toggleMusic}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          width: '3.5rem',
          height: '3.5rem',
          borderRadius: '50%',
          backgroundColor: musicEnabled ? '#3b82f6' : '#6b7280',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          zIndex: 1000,
          transition: 'all 0.2s',
        }}
        title={musicEnabled ? 'Turn off music' : 'Turn on music'}
      >
        {musicEnabled ? '🔊' : '🔇'}
      </button>
      {/* Header */}
      <div style={{ 
        backgroundColor: '#ffffff', 
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.5rem',
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}>
              📚
            </div>
            <div>
              <p style={{ fontSize: '0.625rem', fontWeight: 'bold', color: '#6b7280', letterSpacing: '0.05em', margin: 0 }}>
                IELTS EXAM PREPARATION
              </p>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                IELTS Prep Center
              </h1>
            </div>
          </div>
          <p style={{ color: '#4b5563', fontSize: '0.8125rem', lineHeight: 1.5, margin: 0 }}>
            Master all four skills with structured practice and expert feedback.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ backgroundColor: '#f9fafb', padding: '1rem', minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          {/* Quick Stats */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}>
            <span style={{ backgroundColor: '#dbeafe', padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.6875rem', color: '#1e40af', fontWeight: '600' }}>✓ Free to Start</span>
            <span style={{ backgroundColor: '#d1fae5', padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.6875rem', color: '#065f46', fontWeight: '600' }}>✓ Expert Content</span>
            <span style={{ backgroundColor: '#fef3c7', padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.6875rem', color: '#92400e', fontWeight: '600' }}>✓ Proven Results</span>
          </div>

          {/* Free Trial Test Banner */}
          <div 
            onClick={redirectToPrime}
            style={{ 
              background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
              borderRadius: '1rem',
              padding: 'clamp(1rem, 3vw, 1.5rem)',
              marginBottom: '1rem',
              cursor: 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>🎧</div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                display: 'inline-block',
                background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
                color: '#111827',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontSize: '0.625rem',
                fontWeight: '700',
                marginBottom: '0.375rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
              }}>
                Only Prime Users
              </div>
              <h3 style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 'bold', margin: '0 0 0.25rem 0' }}>
                IELTS Listening Test 1
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                40 questions • 4 sections • Get your band score instantly
              </p>
            </div>
              <div style={{ 
                background: '#f59e0b',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap',
            }}>
              Start →
            </div>
          </div>

          {/* Loading/Error States */}
          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecdd3',
              color: '#b91c1c',
              borderRadius: '0.75rem',
              padding: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          {/* Reading */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📖</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Reading</h2>
            </div>
            {isLoading && readingSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>Loading reading sets…</p>
            ) : readingSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>No reading sets are published yet.</p>
            ) : (
              readingSets.map((set, index) => {
                const isCompleted = completedTasks.reading.includes(set.id);
                const isLocked = index > 0;
                return (
                <button
                  key={set.id}
                  onClick={() => (isLocked ? redirectToPrime() : navigate(`/ielts/reading/${set.id}`))}
                  style={{
                    width: '100%',
                    backgroundColor: isLocked ? '#f8fafc' : isCompleted ? '#f0fdf4' : '#ffffff',
                    border: isLocked ? '1px dashed #cbd5f5' : isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderLeft: isLocked ? '4px solid #f59e0b' : isCompleted ? '4px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem', flex: 1, minWidth: '150px' }}>{set.title}</p>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {isLocked && (
                          <span style={{
                            background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
                            color: '#111827',
                            fontSize: '0.625rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 700,
                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.35)',
                          }}>
                            Only Prime Users
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ backgroundColor: '#22c55e', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                            ✓ DONE
                          </span>
                        )}
                        <span style={{ backgroundColor: '#0369a1', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                          Band {set.est_band_min}-{set.est_band_max}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Level: {set.level} • {set.duration_minutes || 20} min</p>
                  </div>
                </button>
              );})
            )}
          </div>

          {/* Listening */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎧</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Listening</h2>
            </div>
            <button
              onClick={() => navigate('/ielts/trial-test-2')}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
                border: '1px solid #0f766e',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                marginBottom: '0.75rem',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ fontSize: '1.75rem' }}>📝</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'inline-block',
                  background: '#22c55e',
                  color: 'white',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.625rem',
                  fontWeight: 'bold',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Free Task
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  IELTS Listening Task 2
                </div>
                <div style={{ fontSize: '0.75rem', color: '#99f6e4' }}>
                  Form completion • 10 questions • Instant score
                </div>
              </div>
              <div style={{
                background: '#14b8a6',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
              }}>
                Start →
              </div>
            </button>
            {isLoading && listeningSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>Loading listening sets…</p>
            ) : listeningSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>No listening sets are published yet.</p>
            ) : (
              listeningSets.map((set) => {
                const isCompleted = completedTasks.listening.includes(set.id);
                const isLocked = true;
                return (
                <button
                  key={set.id}
                  onClick={() => (isLocked ? redirectToPrime() : navigate(`/ielts/listening/${set.id}`))}
                  style={{
                    width: '100%',
                    backgroundColor: isLocked ? '#f8fafc' : isCompleted ? '#f0fdf4' : '#ffffff',
                    border: isLocked ? '1px dashed #cbd5f5' : isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderLeft: isLocked ? '4px solid #f59e0b' : isCompleted ? '4px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem', flex: 1, minWidth: '150px' }}>{set.title}</p>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {isLocked && (
                          <span style={{
                            background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
                            color: '#111827',
                            fontSize: '0.625rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 700,
                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.35)',
                          }}>
                            Only Prime Users
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ backgroundColor: '#22c55e', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                            ✓ DONE
                          </span>
                        )}
                        <span style={{ backgroundColor: '#7c3aed', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                          Band {set.est_band_min}-{set.est_band_max}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Level: {set.level} • {set.duration_minutes} min</p>
                  </div>
                </button>
              );})
            )}
          </div>

          {/* Writing */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>✍️</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Writing</h2>
            </div>
            {isLoading && writingTasks.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>Loading writing tasks…</p>
            ) : writingTasks.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>No writing tasks are published yet.</p>
            ) : (
              writingTasks.map((task, index) => {
                const isCompleted = completedTasks.writing.includes(task.id);
                const isLocked = index > 0;
                return (
                <button
                  key={task.id}
                  onClick={() => (isLocked ? redirectToPrime() : navigate(`/ielts/writing/${task.id}`))}
                  style={{
                    width: '100%',
                    backgroundColor: isLocked ? '#f8fafc' : isCompleted ? '#f0fdf4' : '#ffffff',
                    border: isLocked ? '1px dashed #cbd5f5' : isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderLeft: isLocked ? '4px solid #f59e0b' : isCompleted ? '4px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem', flex: 1, minWidth: '150px' }}>{task.title}</p>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {isLocked && (
                          <span style={{
                            background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
                            color: '#111827',
                            fontSize: '0.625rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 700,
                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.35)',
                          }}>
                            Only Prime Users
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ backgroundColor: '#22c55e', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                            ✓ DONE
                          </span>
                        )}
                        <span style={{ backgroundColor: '#059669', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                          Band {task.bands_target}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>{task.task_type === 'task1' ? 'Task 1 - 20 min' : 'Task 2 - 40 min'}</p>
                  </div>
                </button>
              );})
            )}
          </div>

          {/* Speaking */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎤</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Speaking</h2>
            </div>
            {isLoading && speakingTasks.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>Loading speaking tasks…</p>
            ) : speakingTasks.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>No speaking tasks are published yet.</p>
            ) : (
              speakingTasks.map((task, index) => {
                const isCompleted = completedTasks.speaking.includes(task.id);
                const isLocked = index > 0;
                return (
                <button
                  key={task.id}
                  onClick={() => (isLocked ? redirectToPrime() : navigate(`/ielts/speaking/${task.id}`))}
                  style={{
                    width: '100%',
                    backgroundColor: isLocked ? '#f8fafc' : isCompleted ? '#f0fdf4' : '#ffffff',
                    border: isLocked ? '1px dashed #cbd5f5' : isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderLeft: isLocked ? '4px solid #f59e0b' : isCompleted ? '4px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {isLocked && (
                          <span style={{
                            background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
                            color: '#111827',
                            fontSize: '0.625rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 700,
                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.35)',
                          }}>
                            Only Prime Users
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ backgroundColor: '#22c55e', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                            ✓ DONE
                          </span>
                        )}
                        <span style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                          Part {task.part}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem', lineHeight: 1.4 }}>{task.prompt}</p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Record & get expert feedback</p>
                  </div>
                </button>
              );})
            )}
          </div>

          {/* Premium CTA */}
          <div style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}>
            <h3 style={{ color: '#ffffff', fontSize: '1.125rem', fontWeight: 'bold', margin: '0 0 0.5rem' }}>⭐ Upgrade to Prime</h3>
            <p style={{ color: '#bfdbfe', fontSize: '0.8125rem', margin: '0 0 0.75rem' }}>Unlimited tests, expert feedback & certificates</p>
            <button
              onClick={() => navigate('/ielts/apply-prime')}
              style={{
                backgroundColor: '#22c55e',
                color: '#ffffff',
                fontWeight: 'bold',
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Explore Prime
            </button>
          </div>

          {/* Back to Game */}
          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.875rem',
              marginBottom: '4rem',
            }}
          >
            ← Back to Brain Heist Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default IeltsHome;
