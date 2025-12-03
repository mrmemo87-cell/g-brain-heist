import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
  const [musicEnabled, setMusicEnabled] = useState(false);

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

  // Sample data for display
  const readingSets = [
    { id: 1, title: 'Working from Home', description: 'General training passage on remote work', level: 'Beginner', est_band_min: 4.5, est_band_max: 6.0 },
    { id: 2, title: 'The History of Coffee', description: 'Academic passage on coffee origins', level: 'Intermediate', est_band_min: 5.5, est_band_max: 7.0 },
    { id: 3, title: 'Climate Change & Coral Reefs', description: 'Advanced passage on environmental impact', level: 'Advanced', est_band_min: 6.5, est_band_max: 8.0 },
  ];

  const listeningSets = [
    { id: 1, title: 'Travel Agency Conversation', description: 'Customer-agent booking discussion', level: 'Beginner', est_band_min: 4.5, est_band_max: 6.0 },
    { id: 2, title: 'University Orientation Talk', description: 'Campus orientation for new students', level: 'Intermediate', est_band_min: 5.5, est_band_max: 7.0 },
    { id: 3, title: 'Environmental Science Lecture', description: 'Renewable energy academic lecture', level: 'Advanced', est_band_min: 6.5, est_band_max: 8.0 },
  ];

  const writingTasks = [
    { id: 1, title: 'Population Changes Bar Chart', prompt: 'Describe population changes across three cities...', task_type: 'task1', bands_target: '5.0-7.0' },
    { id: 2, title: 'Technology in Education', prompt: 'Discuss technology impact on learning...', task_type: 'task2', bands_target: '5.5-7.5' },
    { id: 3, title: 'Environmental Responsibility', prompt: 'Discuss global vs individual environmental action...', task_type: 'task2', bands_target: '6.0-8.0' },
  ];

  const speakingTasks = [
    { id: 1, part: 1, prompt: 'Describe your hometown' },
    { id: 2, part: 2, prompt: 'Describe a memorable journey' },
    { id: 3, part: 3, prompt: 'Discuss travel and tourism' },
  ];

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

          {/* Reading */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📖</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Reading</h2>
            </div>
            {readingSets.map((set) => (
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
            ))}
          </div>

          {/* Listening */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎧</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Listening</h2>
            </div>
            {listeningSets.map((set) => (
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
            ))}
          </div>

          {/* Writing */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>✍️</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Writing</h2>
            </div>
            {writingTasks.map((task) => (
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
            ))}
          </div>

          {/* Speaking */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎤</span>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Speaking</h2>
            </div>
            {speakingTasks.map((task) => (
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
            ))}
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
