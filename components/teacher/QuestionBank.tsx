import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TeacherQuestion, Subject, QuestionDifficulty, Teacher } from '../../types';
import './QuestionBank.css';

// ============================================================================
// TYPES
// ============================================================================

export interface QuestionSet {
  id: string;
  title: string;
  subject: Subject;
  topic: string;
  difficulty: QuestionDifficulty;
  questionCount: number;
  questions: TeacherQuestion[];
  source: 'system' | 'community' | 'mine';
  avgSuccessRate: number;
  totalPlays: number;
  authorName: string;
  isVerified: boolean;
  coverGradient: string;
  coverEmoji: string;
}

type TabFilter = 'discover' | 'my-sets' | 'favorites';

interface QuestionBankProps {
  questions: TeacherQuestion[];
  teacher: Teacher | null;
  onUseSet: (questionIds: string[], subject: Subject, topic: string) => void;
  onEditQuestion?: (question: TeacherQuestion) => void;
  onDeleteQuestion?: (questionId: string) => void;
  onCreateQuestion?: () => void;
  useActionLabel?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const normalizeSubject = (subject: Subject | string): Subject => {
  const normalized = subject.trim().toLowerCase();
  const subjectMap: Record<string, Subject> = {
    math: 'Maths',
    mathematics: 'Maths',
    maths: 'Maths',
    science: 'Science',
    english: 'English',
    'russian language': 'Russian Language',
    'russian literature': 'Russian Literature',
    'kyrgyz language': 'Kyrgyz Language',
    'kyrgyz history': 'Kyrgyz History',
    'german language': 'German Language',
    geography: 'Geography',
    'global perspective': 'Global Perspective',
    ict: 'ICT',
  };

  return subjectMap[normalized] || (subject as Subject);
};

const getSubjectLabel = (subject: Subject): string => {
  if (subject === 'Maths') return 'Math';
  return subject;
};

const getSubjectEmoji = (subject: Subject | string): string => {
  const normalizedSubject = normalizeSubject(subject);
  const emojis: Record<string, string> = {
    'Maths': '🔢',
    'Science': '🔬',
    'English': '📚',
    'Russian Language': '🇷🇺',
    'Russian Literature': '📖',
    'Kyrgyz Language': '🏔️',
    'Kyrgyz History': '🏛️',
    'German Language': '🇩🇪',
    'Geography': '🌍',
    'Global Perspective': '🌐',
    'ICT': '💻',
  };
  return emojis[normalizedSubject] || '📝';
};

const getSubjectGradient = (subject: Subject | string): string => {
  const normalizedSubject = normalizeSubject(subject);
  const gradients: Record<string, string> = {
    'Maths': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    'Science': 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
    'English': 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
    'Russian Language': 'linear-gradient(135deg, #1d4ed8 0%, #38bdf8 60%, #22d3ee 100%)',
    'Russian Literature': 'linear-gradient(135deg, #6d28d9 0%, #c084fc 100%)',
    'Kyrgyz Language': 'linear-gradient(135deg, #f43f5e 0%, #f97316 100%)',
    'Kyrgyz History': 'linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)',
    'German Language': 'linear-gradient(135deg, #0f172a 0%, #f97316 60%, #ef4444 100%)',
    'Geography': 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)',
    'Global Perspective': 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    'ICT': 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #22d3ee 100%)',
  };
  return gradients[normalizedSubject] || 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';
};

const getTopicDecoEmoji = (topic: string, subject: Subject): string => {
  const topicEmojis: Record<string, string> = {
    'Algebra': '📐',
    'Geometry': '📏',
    'Fractions': '🍕',
    'Decimals': '🔢',
    'Percentages': '%',
    'Statistics': '📊',
    'Probability': '🎲',
    'Trigonometry': '📐',
    'Calculus': '∫',
    'Animals': '🦊',
    'Plants': '🌱',
    'Human Body': '🫀',
    'Chemistry': '⚗️',
    'Physics': '⚡',
    'Space': '🚀',
    'Weather': '🌦️',
    'Grammar': '✍️',
    'Vocabulary': '📖',
    'Reading': '📚',
    'Writing': '✏️',
    'Speaking': '🎤',
    'Listening': '👂',
    'History': '🏛️',
    'Culture': '🎭',
    'Maps': '🗺️',
    'Countries': '🌍',
    'Programming': '💻',
    'Internet': '🌐',
    'General': '📋',
  };
  
  for (const [key, emoji] of Object.entries(topicEmojis)) {
    if (topic.toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }
  
  return getSubjectEmoji(subject);
};

const formatPlayCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

const getMostCommonDifficulty = (questions: TeacherQuestion[]): QuestionDifficulty => {
  const counts = { easy: 0, medium: 0, hard: 0 };
  questions.forEach(q => counts[q.difficulty]++);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as QuestionDifficulty;
};

// ============================================================================
// QUESTION SET CARD COMPONENT (Blooket Style)
// ============================================================================

interface QuestionSetCardProps {
  set: QuestionSet;
  onPreview: () => void;
  onUseSet: () => void;
  useActionLabel: string;
}

const QuestionSetCard: React.FC<QuestionSetCardProps> = ({ set, onPreview, onUseSet, useActionLabel }) => {
  return (
    <div className="blooket-card" onClick={onPreview}>
      {/* Cover Image Area */}
      <div 
        className="blooket-card-cover"
        style={{ background: set.coverGradient }}
      >
        {/* Verified Badge */}
        {set.isVerified && (
          <div className="blooket-verified-badge">
            <span className="verified-check">✓</span>
            <span>Teacher Verified</span>
          </div>
        )}
        
        {/* Decorative Elements */}
        <div className="blooket-cover-deco">
          <span className="deco-emoji main">{set.coverEmoji}</span>
          <span className="deco-emoji secondary">{getSubjectEmoji(set.subject)}</span>
        </div>
        
        {/* Question Count Badge */}
        <div className="blooket-question-count">
          {set.questionCount} Question{set.questionCount !== 1 ? 's' : ''}
        </div>
      </div>
      
      {/* Card Info */}
      <div className="blooket-card-info">
        <h3 className="blooket-card-title">{set.title}</h3>
        <div className="blooket-card-meta">
          <span className="blooket-plays">
            <span className="play-icon">▶</span>
            {formatPlayCount(set.totalPlays)}
          </span>
          <span className="blooket-author">
            <span className="author-icon">👤</span>
            {set.authorName}
          </span>
        </div>
      </div>
      
      {/* Hover Actions */}
      <div className="blooket-card-actions">
        <button 
          className="blooket-action-btn preview"
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
        >
          👁️ Preview
        </button>
        <button 
          className="blooket-action-btn use"
          onClick={(e) => { e.stopPropagation(); onUseSet(); }}
        >
          ▶ {useActionLabel}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// SET PREVIEW MODAL COMPONENT
// ============================================================================

interface SetPreviewModalProps {
  set: QuestionSet;
  selectedQuestionIds: Set<string>;
  onToggleQuestion: (questionId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onClose: () => void;
  useActionLabel: string;
}

const SetPreviewModal: React.FC<SetPreviewModalProps> = ({
  set,
  selectedQuestionIds,
  onToggleQuestion,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onClose,
  useActionLabel,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const selectedCount = set.questions.filter(q => selectedQuestionIds.has(q.id)).length;

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="qb-modal blooket-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header with Cover */}
        <div 
          className="qb-modal-header blooket-modal-header"
          style={{ background: set.coverGradient }}
        >
          <div className="qb-modal-title-row">
            <span className="qb-modal-icon">{set.coverEmoji}</span>
            <div>
              <h2 className="qb-modal-title">{set.title}</h2>
              <p className="qb-modal-subtitle">{getSubjectLabel(set.subject)} • {set.questionCount} questions</p>
            </div>
          </div>
          <button className="qb-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="qb-modal-toolbar">
          <span className="qb-selected-count">{selectedCount} of {set.questionCount} selected</span>
          <div className="qb-toolbar-actions">
            <button className="qb-toolbar-btn" onClick={onSelectAll}>Select All</button>
            <button className="qb-toolbar-btn" onClick={onDeselectAll}>Deselect All</button>
          </div>
        </div>

        <div className="qb-modal-questions">
          {set.questions.map((question, index) => {
            const isExpanded = expandedId === question.id;
            const isSelected = selectedQuestionIds.has(question.id);

            return (
              <div 
                key={question.id} 
                className={`qb-question-item ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
              >
                <div 
                  className="qb-question-header"
                  onClick={() => handleToggleExpand(question.id)}
                >
                  <div className="qb-question-number">{index + 1}</div>
                  <div className="qb-question-preview">
                    {question.question_text.substring(0, 80)}
                    {question.question_text.length > 80 ? '...' : ''}
                  </div>
                  <div className="qb-question-controls">
                    <label 
                      className="qb-toggle"
                      onClick={e => e.stopPropagation()}
                    >
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => onToggleQuestion(question.id)}
                      />
                      <span className="qb-toggle-slider"></span>
                    </label>
                    <span className={`qb-expand-icon ${isExpanded ? 'rotated' : ''}`}>▼</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="qb-question-body">
                    <p className="qb-question-text">{question.question_text}</p>
                    
                    {question.image_url && (
                      <img 
                        src={question.image_url} 
                        alt="Question" 
                        className="qb-question-image"
                      />
                    )}

                    {question.question_type === 'multiple_choice' && question.options && (
                      <div className="qb-options">
                        {(question.options as (string | { text: string })[]).map((opt, i) => {
                          const optText = typeof opt === 'string' ? opt : opt.text;
                          const isCorrect = question.correct_answer === String.fromCharCode(65 + i) || 
                                          question.correct_answer === optText ||
                                          question.correct_answer === String(i);
                          return (
                            <div 
                              key={i} 
                              className={`qb-option ${isCorrect ? 'correct' : ''}`}
                            >
                              <span className="qb-option-letter">{String.fromCharCode(65 + i)}</span>
                              <span className="qb-option-text">{optText}</span>
                              {isCorrect && <span className="qb-correct-badge">✓ Correct</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {question.question_type === 'true_false' && (
                      <div className="qb-options">
                        <div className={`qb-option ${question.correct_answer.toLowerCase() === 'true' ? 'correct' : ''}`}>
                          <span className="qb-option-text">True</span>
                          {question.correct_answer.toLowerCase() === 'true' && <span className="qb-correct-badge">✓ Correct</span>}
                        </div>
                        <div className={`qb-option ${question.correct_answer.toLowerCase() === 'false' ? 'correct' : ''}`}>
                          <span className="qb-option-text">False</span>
                          {question.correct_answer.toLowerCase() === 'false' && <span className="qb-correct-badge">✓ Correct</span>}
                        </div>
                      </div>
                    )}

                    {question.explanation && (
                      <div className="qb-explanation">
                        <strong>💡 Explanation:</strong> {question.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="qb-modal-footer">
          <button className="qb-btn-cancel" onClick={onClose}>Cancel</button>
          <button 
            className="qb-btn-confirm" 
            onClick={onConfirm}
            disabled={selectedCount === 0}
          >
            ▶ {useActionLabel} with {selectedCount} Question{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN QUESTION BANK COMPONENT (Blooket Layout)
// ============================================================================

const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  teacher,
  onUseSet,
  onEditQuestion,
  onDeleteQuestion,
  onCreateQuestion,
  useActionLabel = 'Host',
}) => {
  // State
  const [activeTab, setActiveTab] = useState<TabFilter>('discover');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');
  const [previewSet, setPreviewSet] = useState<QuestionSet | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Get unique subjects for filter
  const subjects = useMemo(() => {
    const subjectSet = new Set<Subject>();
    questions.forEach(q => subjectSet.add(normalizeSubject(q.subject)));
    return Array.from(subjectSet).sort();
  }, [questions]);

  // Group questions into virtual sets
  const questionSets = useMemo(() => {
    const setMap = new Map<string, QuestionSet>();

    questions.forEach(question => {
      const topic = question.topic_name || question.topic || 'General';
      const normalizedSubject = normalizeSubject(question.subject);
      const setId = `${normalizedSubject}_${topic}`;

      if (!setMap.has(setId)) {
        setMap.set(setId, {
          id: setId,
          title: topic,
          subject: normalizedSubject,
          topic: topic,
          difficulty: 'easy',
          questionCount: 0,
          questions: [],
          source: 'community',
          avgSuccessRate: 0,
          totalPlays: 0,
          authorName: 'Community',
          isVerified: false,
          coverGradient: getSubjectGradient(normalizedSubject),
          coverEmoji: getTopicDecoEmoji(topic, normalizedSubject),
        });
      }

      const set = setMap.get(setId)!;
      set.questions.push(question);
      set.questionCount = set.questions.length;
    });

    // Calculate metadata for each set
    setMap.forEach(set => {
      set.difficulty = getMostCommonDifficulty(set.questions);
      
      const totalAnswered = set.questions.reduce((sum, q) => sum + (q.times_answered || 0), 0);
      const totalCorrect = set.questions.reduce((sum, q) => sum + (q.times_correct || 0), 0);
      set.avgSuccessRate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
      set.totalPlays = totalAnswered;

      const myQuestions = set.questions.filter(q => teacher && q.teacher_id === teacher.id);
      if (myQuestions.length === set.questions.length && teacher) {
        set.source = 'mine';
        set.authorName = 'Me';
        set.isVerified = true;
      } else if (myQuestions.length > 0 && teacher) {
        set.source = 'community';
        set.authorName = `${myQuestions.length}/${set.questionCount} by you`;
        set.isVerified = true;
      } else {
        set.source = 'community';
        set.authorName = 'Community';
        set.isVerified = set.questionCount >= 5;
      }
    });

    return Array.from(setMap.values());
  }, [questions, teacher]);

  // Filter sets based on active filters
  const filteredSets = useMemo(() => {
    return questionSets.filter(set => {
      if (activeTab === 'my-sets' && set.source !== 'mine') return false;
      if (activeTab === 'favorites' && !favorites.has(set.id)) return false;

      if (subjectFilter !== 'all' && set.subject !== subjectFilter) return false;

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          set.title.toLowerCase().includes(search) ||
          getSubjectLabel(set.subject).toLowerCase().includes(search) ||
          set.topic.toLowerCase().includes(search)
        );
      }

      return true;
    });
  }, [questionSets, activeTab, subjectFilter, searchTerm, favorites]);

  // Handlers
  const handlePreview = useCallback((set: QuestionSet) => {
    setPreviewSet(set);
    setSelectedQuestionIds(new Set(set.questions.map(q => q.id)));
  }, []);

  const handleUseSet = useCallback((set: QuestionSet) => {
    const allIds = set.questions.map(q => q.id);
    onUseSet(allIds, set.subject, set.topic);
  }, [onUseSet]);

  const handleToggleQuestion = useCallback((questionId: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (previewSet) {
      setSelectedQuestionIds(new Set(previewSet.questions.map(q => q.id)));
    }
  }, [previewSet]);

  const handleDeselectAll = useCallback(() => {
    setSelectedQuestionIds(new Set());
  }, []);

  const handleConfirmSelection = useCallback(() => {
    if (previewSet) {
      onUseSet(Array.from(selectedQuestionIds), previewSet.subject, previewSet.topic);
    }
    setPreviewSet(null);
  }, [selectedQuestionIds, onUseSet, previewSet]);

  const handleClosePreview = useCallback(() => {
    setPreviewSet(null);
    setSelectedQuestionIds(new Set());
  }, []);

  const handleToggleFavorite = useCallback((setId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  }, []);

  // Stats
  const totalSets = questionSets.length;
  const mySetsCount = questionSets.filter(s => s.source === 'mine').length;

  return (
    <div className="blooket-container">
      {/* Sidebar */}
      <aside className="blooket-sidebar">
        <div className="blooket-logo">
          <img className="logo-image" src="/BRAINS.svg" alt="Brains Heist logo" />
          <span className="logo-text">Brains Heist</span>
        </div>

        {onCreateQuestion && (
          <button className="blooket-create-btn" onClick={onCreateQuestion}>
            <span className="create-icon">✏️</span>
            <span>Create</span>
          </button>
        )}

        <nav className="blooket-nav">
          <button 
            className={`blooket-nav-item ${activeTab === 'discover' ? 'active' : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            <span className="nav-icon">🔍</span>
            <span>Discover</span>
          </button>
          <button 
            className={`blooket-nav-item ${activeTab === 'my-sets' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-sets')}
          >
            <span className="nav-icon">📋</span>
            <span>My Sets</span>
            {mySetsCount > 0 && <span className="nav-badge">{mySetsCount}</span>}
          </button>
          <button 
            className={`blooket-nav-item ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            <span className="nav-icon">⭐</span>
            <span>Favorites</span>
            {favorites.size > 0 && <span className="nav-badge">{favorites.size}</span>}
          </button>
        </nav>

        <div className="blooket-sidebar-footer">
          <div className="sidebar-stats">
            <span>{totalSets} Sets</span>
            <span>{questions.length} Questions</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="blooket-main">
        {/* Header */}
        <header className="blooket-header">
          <h1 className="blooket-page-title">
            {activeTab === 'discover' && 'Discover'}
            {activeTab === 'my-sets' && 'My Sets'}
            {activeTab === 'favorites' && 'Favorites'}
          </h1>
        </header>

        {/* Search Bar */}
        <div className="blooket-search-container">
          <div className="blooket-search-wrapper">
            <input
              type="text"
              className="blooket-search"
              placeholder="Search for a set..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="blooket-search-btn">
              <span>🔍</span>
            </button>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="blooket-filter-pills">
          <button 
            className={`filter-pill ${subjectFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSubjectFilter('all')}
          >
            All Subjects
          </button>
          {subjects.map(subject => (
            <button
              key={subject}
              className={`filter-pill ${subjectFilter === subject ? 'active' : ''}`}
              onClick={() => setSubjectFilter(subject)}
            >
              {getSubjectEmoji(subject)} {getSubjectLabel(subject)}
            </button>
          ))}
        </div>

        {/* Cards Grid */}
        <div className="blooket-cards-grid">
          {filteredSets.length === 0 ? (
            <div className="blooket-empty">
              <div className="empty-icon">📭</div>
              <h3>No sets found</h3>
              <p>
                {activeTab === 'my-sets' 
                  ? "You haven't created any question sets yet. Create your first question!"
                  : activeTab === 'favorites'
                  ? "You haven't favorited any sets yet. Click the star on a set to add it here."
                  : "No sets match your search. Try different keywords or clear filters."}
              </p>
              {activeTab === 'my-sets' && onCreateQuestion && (
                <button className="blooket-empty-btn" onClick={onCreateQuestion}>
                  ✏️ Create Question
                </button>
              )}
            </div>
          ) : (
            filteredSets.map(set => (
              <QuestionSetCard
                key={set.id}
                set={set}
                onPreview={() => handlePreview(set)}
                onUseSet={() => handleUseSet(set)}
                useActionLabel={useActionLabel}
              />
            ))
          )}
        </div>
      </main>

      {/* Preview Modal */}
      {previewSet && typeof document !== 'undefined'
        ? createPortal(
            <SetPreviewModal
              set={previewSet}
              selectedQuestionIds={selectedQuestionIds}
              onToggleQuestion={handleToggleQuestion}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onConfirm={handleConfirmSelection}
              onClose={handleClosePreview}
              useActionLabel={useActionLabel}
            />,
            document.body
          )
        : null}
    </div>
  );
};

export default QuestionBank;
