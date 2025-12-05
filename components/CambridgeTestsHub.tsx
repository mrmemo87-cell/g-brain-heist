import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Profile } from '../types';

interface CambridgeTest {
  id: string;
  name: string;
  description: string;
  duration: string;
  totalQuestions: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: 'Reading' | 'Listening' | 'Grammar' | 'Vocabulary';
  url: string;
  isCompleted?: boolean;
  score?: number;
  completedAt?: string;
}

interface CambridgeTestsHubProps {
  profile: Profile;
  onExit: () => void;
}

// Available Cambridge tests - add new tests here
const AVAILABLE_TESTS: CambridgeTest[] = [
  {
    id: 'cambridge-reading-25',
    name: 'Cambridge Reading Test 25',
    description: 'Comprehensive reading comprehension test covering vocabulary, matching, and detailed analysis.',
    duration: '45 min',
    totalQuestions: 42,
    difficulty: 'Intermediate',
    category: 'Reading',
    url: '/cambridge_reading_25_answer_form.html',
  },
  {
    id: 'cambridge-listening-1',
    name: 'Cambridge Listening Test 1',
    description: 'Complete listening test with 5 parts: picture selection, multiple choice, fill-in-the-blanks, interview, and matching exercises.',
    duration: '30 min',
    totalQuestions: 25,
    difficulty: 'Intermediate',
    category: 'Listening',
    url: '/cambridge_listening_test_1.html',
  },
  // Add more tests here as they become available
  // {
  //   id: 'cambridge-reading-26',
  //   name: 'Cambridge Reading Test 26',
  //   ...
  // },
];

const CambridgeTestsHub: React.FC<CambridgeTestsHubProps> = ({ profile, onExit }) => {
  const [tests, setTests] = useState<CambridgeTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<CambridgeTest | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');

  useEffect(() => {
    loadTestProgress();
  }, [profile.username]);

  // Listen for test completion messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CAMBRIDGE_TEST_COMPLETE') {
        console.log('Test completed:', event.data);
        // Refresh the test list to show updated completion status
        setTimeout(() => {
          loadTestProgress();
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadTestProgress = async () => {
    setLoading(true);
    try {
      // Fetch completed tests from quiz_scores table
      const { data: completedTests, error } = await supabase
        .from('quiz_scores')
        .select('quiz_name, score, total_questions, percentage, submitted_at')
        .eq('student_name', profile.username)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Map test completion status
      const testsWithProgress = AVAILABLE_TESTS.map(test => {
        const completion = completedTests?.find(c => 
          c.quiz_name.toLowerCase().includes(test.id.replace(/-/g, ' ').replace('cambridge ', ''))
          || test.name.toLowerCase().includes(c.quiz_name.toLowerCase().replace('cambridge ', ''))
        );
        
        return {
          ...test,
          isCompleted: !!completion,
          score: completion?.percentage,
          completedAt: completion?.submitted_at,
        };
      });

      setTests(testsWithProgress);
    } catch (err) {
      console.error('Error loading test progress:', err);
      setTests(AVAILABLE_TESTS);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTest = (test: CambridgeTest) => {
    // Store user info for the test form to use
    localStorage.setItem('cambridge_test_user', JSON.stringify({
      name: profile.username,
      class: profile.batch || 'N/A',
      grade: profile.grade,
    }));
    
    setActiveTest(test);
  };

  const handleTestComplete = () => {
    setActiveTest(null);
    loadTestProgress(); // Refresh completion status
  };

  const filteredTests = tests.filter(test => {
    if (filter === 'completed') return test.isCompleted;
    if (filter === 'pending') return !test.isCompleted;
    return true;
  });

  const completedCount = tests.filter(t => t.isCompleted).length;
  const totalCount = tests.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return '#22c55e';
      case 'Intermediate': return '#f59e0b';
      case 'Advanced': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Reading': return '📖';
      case 'Listening': return '🎧';
      case 'Grammar': return '✍️';
      case 'Vocabulary': return '📚';
      default: return '📝';
    }
  };

  // If a test is active, show it in an iframe
  if (activeTest) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        zIndex: 9999, // Higher z-index to cover everything
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // iOS specific - ensure full height
        height: '100%',
        width: '100%',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Minimal Test Header Bar - non-sticky, part of layout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 15px',
          background: 'linear-gradient(135deg, #302b63 0%, #24243e 100%)',
          borderBottom: '2px solid #00f5ff',
          flexShrink: 0,
          minHeight: '50px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🎧</span>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                {activeTest.name}
              </h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                {activeTest.totalQuestions} questions
              </p>
            </div>
          </div>
          <button
            onClick={handleTestComplete}
            style={{
              padding: '6px 16px',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            ✕ Exit
          </button>
        </div>
        
        {/* Test iframe - simplified for better compatibility */}
        <iframe
          src={activeTest.url}
          style={{
            flex: 1,
            width: '100%',
            height: 'calc(100% - 50px)', // Full height minus header
            border: 'none',
            display: 'block',
            backgroundColor: '#fff',
          }}
          title={activeTest.name}
          allow="autoplay"
        />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      padding: '20px',
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '30px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img 
              src="/logo.png" 
              alt="Brains Heist" 
              style={{ width: '50px', height: '50px' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <h1 style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 'bold',
                background: 'linear-gradient(90deg, #00f5ff, #00d4aa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Cambridge Tests
              </h1>
              <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
                Complete tests to boost your English skills
              </p>
            </div>
          </div>
          <button
            onClick={onExit}
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            ← Back to Game
          </button>
        </div>

        {/* Progress Overview */}
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          padding: '20px 25px',
          marginBottom: '25px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'rgba(255,255,255,0.9)' }}>
                Your Progress
              </h3>
              <p style={{ margin: '5px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#00f5ff' }}>
                {completedCount} / {totalCount} Tests Completed
              </p>
            </div>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `conic-gradient(#00f5ff ${progressPercent}%, rgba(255,255,255,0.1) 0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                width: '65px',
                height: '65px',
                borderRadius: '50%',
                backgroundColor: '#24243e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold',
              }}>
                {progressPercent}%
              </div>
            </div>
          </div>
          
          {/* Welcome message */}
          <div style={{
            background: 'rgba(0,245,255,0.1)',
            borderRadius: '10px',
            padding: '12px 15px',
            borderLeft: '3px solid #00f5ff',
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
              👋 Welcome, <strong>{profile.username}</strong>! Take your time with each test. 
              Your progress is automatically saved.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
        }}>
          {(['all', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: filter === f 
                  ? 'linear-gradient(135deg, #00f5ff, #00d4aa)' 
                  : 'rgba(255,255,255,0.1)',
                color: filter === f ? '#0f0c29' : '#fff',
              }}
            >
              {f === 'all' && `📋 All (${totalCount})`}
              {f === 'pending' && `⏳ Pending (${totalCount - completedCount})`}
              {f === 'completed' && `✅ Completed (${completedCount})`}
            </button>
          ))}
        </div>

        {/* Tests Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⏳</div>
            Loading tests...
          </div>
        ) : filteredTests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>
              {filter === 'completed' ? '📭' : '🎉'}
            </div>
            {filter === 'completed' 
              ? "You haven't completed any tests yet. Start one below!"
              : filter === 'pending'
              ? "Great job! You've completed all available tests!"
              : "No tests available at the moment."}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}>
            {filteredTests.map(test => (
              <div
                key={test.id}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: test.isCompleted 
                    ? '2px solid #22c55e' 
                    : '1px solid rgba(255,255,255,0.1)',
                  transition: 'all 0.3s',
                }}
              >
                {/* Test Header */}
                <div style={{
                  background: test.isCompleted 
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'linear-gradient(135deg, #667eea, #764ba2)',
                  padding: '20px',
                  position: 'relative',
                }}>
                  {test.isCompleted && (
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      background: '#fff',
                      color: '#22c55e',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}>
                      ✓ COMPLETED
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '32px' }}>{getCategoryIcon(test.category)}</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                        {test.name}
                      </h3>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: 'rgba(255,255,255,0.2)',
                        }}>
                          {test.category}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: getDifficultyColor(test.difficulty),
                          color: '#fff',
                        }}>
                          {test.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Body */}
                <div style={{ padding: '20px' }}>
                  <p style={{
                    margin: '0 0 15px',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.7)',
                    lineHeight: 1.5,
                  }}>
                    {test.description}
                  </p>

                  <div style={{
                    display: 'flex',
                    gap: '15px',
                    marginBottom: '15px',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.6)',
                  }}>
                    <span>⏱️ {test.duration}</span>
                    <span>📝 {test.totalQuestions} questions</span>
                  </div>

                  {test.isCompleted && test.score !== undefined && (
                    <div style={{
                      background: 'rgba(34,197,94,0.1)',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '15px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Your Score:</span>
                        <span style={{
                          fontSize: '20px',
                          fontWeight: 'bold',
                          color: test.score >= 70 ? '#22c55e' : test.score >= 50 ? '#f59e0b' : '#ef4444',
                        }}>
                          {test.score}%
                        </span>
                      </div>
                      {test.completedAt && (
                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                          Completed: {new Date(test.completedAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleStartTest(test)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      background: test.isCompleted
                        ? 'rgba(255,255,255,0.1)'
                        : 'linear-gradient(135deg, #00f5ff, #00d4aa)',
                      color: test.isCompleted ? '#fff' : '#0f0c29',
                    }}
                  >
                    {test.isCompleted ? '🔄 Retake Test' : '▶️ Start Test'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coming Soon Notice */}
        <div style={{
          marginTop: '40px',
          textAlign: 'center',
          padding: '30px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          border: '1px dashed rgba(255,255,255,0.2)',
        }}>
          <span style={{ fontSize: '32px' }}>🚀</span>
          <h4 style={{ margin: '10px 0 5px', color: '#fff', fontSize: '16px' }}>More Tests Coming Soon!</h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            We're adding new Cambridge tests regularly. Check back for more practice opportunities!
          </p>
        </div>
      </div>
    </div>
  );
};

export default CambridgeTestsHub;
