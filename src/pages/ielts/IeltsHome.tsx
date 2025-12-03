import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveListeningSets,
  fetchActiveReadingSets,
  fetchActiveSpeakingTasks,
  fetchActiveWritingTasks,
} from '../../../services/ieltsService';
import type { IELTSListeningSet, IELTSReadingSet, IELTSSpeakingTask, IELTSWritingTask } from '../../../types';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [readingSets, setReadingSets] = useState<IELTSReadingSet[]>([]);
  const [listeningSets, setListeningSets] = useState<IELTSListeningSet[]>([]);
  const [writingTasks, setWritingTasks] = useState<IELTSWritingTask[]>([]);
  const [speakingTasks, setSpeakingTasks] = useState<IELTSSpeakingTask[]>([]);
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

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [reading, listening, writing, speaking] = await Promise.all([
          fetchActiveReadingSets(),
          fetchActiveListeningSets(),
          fetchActiveWritingTasks(),
          fetchActiveSpeakingTasks(),
        ]);

        setReadingSets(reading);
        setListeningSets(listening);
        setWritingTasks(writing);
        setSpeakingTasks(speaking);
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
              readingSets.map((set) => (
                <button
                  key={set.id}
                  onClick={() => navigate(`/ielts/reading/${set.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>{set.title}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.125rem 0 0' }}>{set.level}</p>
                    </div>
                    <span style={{ backgroundColor: '#0369a1', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>
                      Band {set.est_band_min}-{set.est_band_max}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Listening */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎧</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Listening</h2>
            </div>
            {isLoading && listeningSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>Loading listening sets…</p>
            ) : listeningSets.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>No listening sets are published yet.</p>
            ) : (
              listeningSets.map((set) => (
                <button
                  key={set.id}
                  onClick={() => navigate(`/ielts/listening/${set.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>{set.title}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.125rem 0 0' }}>{set.level}</p>
                    </div>
                    <span style={{ backgroundColor: '#7c3aed', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>
                      Band {set.est_band_min}-{set.est_band_max}
                    </span>
                  </div>
                </button>
              ))
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
              writingTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => navigate(`/ielts/writing/${task.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>{task.title}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.125rem 0 0' }}>{task.task_type === 'task1' ? 'Task 1' : 'Task 2'}</p>
                    </div>
                    <span style={{ backgroundColor: '#059669', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>
                      {task.bands_target}
                    </span>
                  </div>
                </button>
              ))
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
              speakingTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => navigate(`/ielts/speaking/${task.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>Part {task.part}: {task.prompt}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.125rem 0 0' }}>Record & get feedback</p>
                    </div>
                    <span style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '0.625rem', padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>
                      Part {task.part}
                    </span>
                  </div>
                </button>
              ))
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
