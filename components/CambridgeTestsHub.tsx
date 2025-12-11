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
  category: 'Reading' | 'Listening' | 'Grammar' | 'Vocabulary' | 'Writing';
  url: string;
  isCompleted?: boolean;
  score?: number;
  completedAt?: string;
  requiresMarking?: boolean;
  isAwaitingMarking?: boolean; // True if submitted but not yet marked
  feedbackReleased?: boolean; // True if teacher has released feedback
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
  {
    id: 'cambridge-writing-1',
    name: 'Cambridge Writing Test 1',
    description: 'E2L Stage 9 Paper 3 writing test with 2 parts: a short message (45-55 words) and an opinion essay (110-130 words). Teacher-marked.',
    duration: '45 min',
    totalQuestions: 2,
    difficulty: 'Intermediate',
    category: 'Writing',
    url: '/cambridge_writing_test_1.html',
    requiresMarking: true,
  },
  // Add more tests here as they become available
];

interface WritingFeedbackView {
  testName: string;
  score: number;
  percentage: number;
  part1: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    organisation: number;
    language: number;
  };
  part2: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    communicativeAchievement: number;
    organisation: number;
    language: number;
  };
  markedBy?: string | null;
  markedAt?: string | null;
  overallComments?: string;
}

const CambridgeTestsHub: React.FC<CambridgeTestsHubProps> = ({ profile, onExit }) => {
  const [tests, setTests] = useState<CambridgeTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<CambridgeTest | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState<WritingFeedbackView | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [activeFeedbackPart, setActiveFeedbackPart] = useState<'part1' | 'part2'>('part1');

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
      // Fetch completed tests from quiz_scores table (include answers for marking status)
      const { data: completedTests, error } = await supabase
        .from('quiz_scores')
        .select('quiz_name, score, total_questions, percentage, submitted_at, answers')
        .eq('student_name', profile.username)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Map test completion status
      const testsWithProgress = AVAILABLE_TESTS.map(test => {
        const completion = completedTests?.find(c => 
          c.quiz_name.toLowerCase().includes(test.id.replace(/-/g, ' ').replace('cambridge ', ''))
          || test.name.toLowerCase().includes(c.quiz_name.toLowerCase().replace('cambridge ', ''))
        );
        
        // Check if this is a writing test awaiting marking
        const answers = completion?.answers as { requires_marking?: boolean; feedback?: { releasedToStudent?: boolean } } | undefined;
        const isAwaitingMarking = test.requiresMarking && answers?.requires_marking === true;
        const feedbackReleased = answers?.feedback?.releasedToStudent === true;
        
        return {
          ...test,
          isCompleted: !!completion,
          score: completion?.percentage,
          completedAt: completion?.submitted_at,
          isAwaitingMarking,
          feedbackReleased,
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

  // Function to view writing test feedback
  const viewWritingFeedback = async (test: CambridgeTest) => {
    setFeedbackLoading(true);
    setShowFeedbackModal(true);
    
    try {
      // Fetch the submission with feedback
      const { data, error } = await supabase
        .from('quiz_scores')
        .select('*')
        .eq('student_name', profile.username)
        .ilike('quiz_name', '%writing%')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (data && data.answers) {
        const answers = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers;
        
        // Marks and feedback are stored INSIDE the answers JSONB column
        const marks = answers.marks || null;
        const feedback = answers.feedback || null;

        // Check if feedback has been released
        if (!feedback?.releasedToStudent) {
          setFeedbackData(null);
          return;
        }

        setFeedbackData({
          testName: data.quiz_name,
          score: data.score,
          percentage: data.percentage,
          part1: {
            original: answers.part1 || '',
            feedback: feedback?.part1?.feedback || '',
            corrected: feedback?.part1?.correctedVersion || '',
            content: marks?.part1?.content || 0,
            organisation: marks?.part1?.organisation || 0,
            language: marks?.part1?.language || 0,
          },
          part2: {
            original: answers.part2 || '',
            feedback: feedback?.part2?.feedback || '',
            corrected: feedback?.part2?.correctedVersion || '',
            content: marks?.part2?.content || 0,
            communicativeAchievement: marks?.part2?.communicativeAchievement || 0,
            organisation: marks?.part2?.organisation || 0,
            language: marks?.part2?.language || 0,
          },
          markedBy: answers.marked_by || null,
          markedAt: answers.marked_at || null,
          overallComments: feedback?.overallComments || '',
        });
        setActiveFeedbackPart('part1');
      }
    } catch (err) {
      console.error('Error fetching writing feedback:', err);
      setFeedbackData(null);
    } finally {
      setFeedbackLoading(false);
    }
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
      case 'Writing': return '✏️';
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
        width: '100vw',
        height: '100vh',
        backgroundColor: '#fff',
        zIndex: 9999,
      }}>
        {/* Minimal Test Header Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 15px',
          background: 'linear-gradient(135deg, #302b63 0%, #24243e 100%)',
          borderBottom: '2px solid #00f5ff',
          zIndex: 10,
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
        
        {/* Test iframe - absolute positioning for reliable sizing */}
        <iframe
          src={activeTest.url}
          style={{
            position: 'absolute',
            top: '52px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 52px)',
            border: 'none',
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
                    <span>📝 {test.category === 'Writing' ? '2 parts' : `${test.totalQuestions} questions`}</span>
                  </div>

                  {test.isCompleted && test.score !== undefined && (
                    <div style={{
                      background: test.isAwaitingMarking 
                        ? 'rgba(245,158,11,0.1)' 
                        : 'rgba(34,197,94,0.1)',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '15px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          {test.isAwaitingMarking ? 'Status:' : 'Your Score:'}
                        </span>
                        <span style={{
                          fontSize: test.isAwaitingMarking ? '14px' : '20px',
                          fontWeight: 'bold',
                          color: test.isAwaitingMarking 
                            ? '#f59e0b' 
                            : (test.score >= 70 ? '#22c55e' : test.score >= 50 ? '#f59e0b' : '#ef4444'),
                        }}>
                          {test.isAwaitingMarking ? '⏳ Awaiting Marking' : `${test.score}%`}
                        </span>
                      </div>
                      {test.completedAt && (
                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                          {test.isAwaitingMarking ? 'Submitted:' : 'Completed:'} {new Date(test.completedAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                      
                      {/* View Feedback button for marked writing tests */}
                      {test.requiresMarking && !test.isAwaitingMarking && test.feedbackReleased && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            viewWritingFeedback(test);
                          }}
                          style={{
                            marginTop: '10px',
                            width: '100%',
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid #00f5ff',
                            background: 'transparent',
                            color: '#00f5ff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          📝 View Teacher Feedback
                        </button>
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

      {/* Writing Feedback Modal */}
      {showFeedbackModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '1px solid rgba(0,245,255,0.3)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
                📝 Writing Test Feedback
              </h3>
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackData(null);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px' }}>
              {feedbackLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '15px' }}>⏳</div>
                  <p style={{ color: 'rgba(255,255,255,0.7)' }}>Loading feedback...</p>
                </div>
              ) : !feedbackData ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
                  <h4 style={{ color: '#fff', marginBottom: '10px' }}>Feedback Not Yet Available</h4>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                    Your teacher has marked your work but hasn't released the detailed feedback yet.
                    Check back later!
                  </p>
                </div>
              ) : (
                <>
                  {/* Score Summary */}
                  <div style={{
                    background: 'rgba(0,245,255,0.1)',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#00f5ff' }}>
                      {feedbackData.score}/35
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                      Total Score ({feedbackData.percentage}%)
                    </div>
                  </div>

                  {/* Part Selector Tabs */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px',
                  }}>
                    <button
                      onClick={() => setActiveFeedbackPart('part1')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part1' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part1' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 1: Message
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part1.content + feedbackData.part1.organisation + feedbackData.part1.language}/15
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveFeedbackPart('part2')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part2' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part2' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 2: Essay
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part2.content + feedbackData.part2.communicativeAchievement + feedbackData.part2.organisation + feedbackData.part2.language}/20
                      </div>
                    </button>
                  </div>

                  {/* Scores Breakdown */}
                  <div style={{
                    background: '#f5f5f5',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 12px', color: '#000', fontSize: '14px' }}>📊 Score Breakdown</h5>
                    {activeFeedbackPart === 'part1' ? (
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.content}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.organisation}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.language}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.content}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.communicativeAchievement}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Comm. Ach.</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.organisation}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.language}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Your Original Writing */}
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '15px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>✏️ Your Original Writing</h5>
                    <div style={{
                      background: '#fff',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#000',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {activeFeedbackPart === 'part1' ? feedbackData.part1.original : feedbackData.part2.original}
                    </div>
                  </div>

                  {/* Teacher Feedback */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback) && (
                    <div style={{
                      background: '#fff7ed',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fed7aa',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>💬 Teacher's Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback}
                      </div>
                    </div>
                  )}

                  {/* Corrected Version */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected) && (
                    <div style={{
                      background: '#ecfdf3',
                      borderRadius: '12px',
                      padding: '15px',
                      border: '1px solid #bbf7d0',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>✨ Improved Version</h5>
                      <div style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected}
                      </div>
                      <p style={{
                        margin: '10px 0 0',
                        fontSize: '11px',
                        color: '#000',
                        fontStyle: 'italic',
                      }}>
                        💡 Compare this with your original to see how you can improve your writing!
                      </p>
                    </div>
                  )}

                  {/* Overall Comments */}
                  {feedbackData.overallComments && (
                    <div style={{
                      background: '#f0f9ff',
                      borderRadius: '12px',
                      padding: '15px',
                      marginTop: '15px',
                      border: '1px solid #bae6fd',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>📝 Overall Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {feedbackData.overallComments}
                      </div>
                    </div>
                  )}

                  {/* Marked By Info */}
                  {feedbackData.markedBy && (
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      background: '#f3f4f6',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#6b7280',
                      textAlign: 'center',
                    }}>
                      Marked by <strong style={{ color: '#374151' }}>{feedbackData.markedBy}</strong>
                      {feedbackData.markedAt && (
                        <span> on {new Date(feedbackData.markedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CambridgeTestsHub;
