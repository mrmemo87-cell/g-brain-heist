import React, { useState, useMemo, useCallback } from 'react';
import { TeacherQuestion, Subject, QuestionDifficulty, Teacher } from '../../types';
import './QuestionBank.css';

// ============================================================================
// TYPES
// ============================================================================

export interface QuestionSet {
  id: string; // Generated: subject_topic
  title: string;
  subject: Subject;
  topic: string;
  difficulty: QuestionDifficulty; // Most common difficulty in set
  questionCount: number;
  questions: TeacherQuestion[];
  source: 'system' | 'community' | 'mine';
  avgSuccessRate: number;
}

type TabFilter = 'all' | 'mine' | 'community';

interface QuestionBankProps {
  questions: TeacherQuestion[];
  teacher: Teacher | null;
  onUseSet: (questionIds: string[]) => void;
  onEditQuestion?: (question: TeacherQuestion) => void;
  onDeleteQuestion?: (questionId: string) => void;
  onCreateQuestion?: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getDifficultyColor = (difficulty: QuestionDifficulty): string => {
  switch (difficulty) {
    case 'easy': return '#22c55e';
    case 'medium': return '#f59e0b';
    case 'hard': return '#ef4444';
    default: return '#6b7280';
  }
};

const getDifficultyIcon = (difficulty: QuestionDifficulty): string => {
  switch (difficulty) {
    case 'easy': return '🟢';
    case 'medium': return '🟡';
    case 'hard': return '🔴';
    default: return '⚪';
  }
};

const getSubjectIcon = (subject: Subject): string => {
  const icons: Record<string, string> = {
    'Maths': '🔢',
    'Mathematics': '🔢',
    'Science': '🔬',
    'English': '📚',
    'Russian Language': '🇷🇺',
    'Russian Literature': '📖',
    'Kyrgyz Language': '🇰🇬',
    'Kyrgyz History': '🏛️',
    'German Language': '🇩🇪',
    'Geography': '🌍',
    'Global Perspective': '🌐',
    'ICT': '💻',
  };
  return icons[subject] || '📝';
};

const getMostCommonDifficulty = (questions: TeacherQuestion[]): QuestionDifficulty => {
  const counts = { easy: 0, medium: 0, hard: 0 };
  questions.forEach(q => counts[q.difficulty]++);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as QuestionDifficulty;
};

// ============================================================================
// QUESTION SET CARD COMPONENT
// ============================================================================

interface QuestionSetCardProps {
  set: QuestionSet;
  onPreview: () => void;
  onUseSet: () => void;
}

const QuestionSetCard: React.FC<QuestionSetCardProps> = ({ set, onPreview, onUseSet }) => {
  return (
    <div className="qb-set-card">
      <div className="qb-set-card-header">
        <span className="qb-set-icon">{getSubjectIcon(set.subject)}</span>
        <div className="qb-set-meta">
          <span className="qb-set-subject">{set.subject}</span>
          <span 
            className="qb-set-difficulty"
            style={{ backgroundColor: getDifficultyColor(set.difficulty) + '20', color: getDifficultyColor(set.difficulty) }}
          >
            {getDifficultyIcon(set.difficulty)} {set.difficulty.charAt(0).toUpperCase() + set.difficulty.slice(1)}
          </span>
        </div>
      </div>
      
      <h3 className="qb-set-title">{set.title}</h3>
      
      <div className="qb-set-stats">
        <span className="qb-set-count">
          <span className="qb-stat-icon">📋</span>
          {set.questionCount} question{set.questionCount !== 1 ? 's' : ''}
        </span>
        {set.avgSuccessRate > 0 && (
          <span className="qb-set-rate">
            <span className="qb-stat-icon">✅</span>
            {set.avgSuccessRate}% avg
          </span>
        )}
      </div>
      
      <div className="qb-set-source">
        {set.source === 'mine' && <span className="qb-source-badge mine">✨ My Set</span>}
        {set.source === 'community' && <span className="qb-source-badge community">👥 Community</span>}
        {set.source === 'system' && <span className="qb-source-badge system">📚 System</span>}
      </div>
      
      <div className="qb-set-actions">
        <button className="qb-btn-preview" onClick={onPreview}>
          👁️ Preview
        </button>
        <button className="qb-btn-use" onClick={onUseSet}>
          ✅ Use Set
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
}

const SetPreviewModal: React.FC<SetPreviewModalProps> = ({
  set,
  selectedQuestionIds,
  onToggleQuestion,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onClose,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const selectedCount = set.questions.filter(q => selectedQuestionIds.has(q.id)).length;

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="qb-modal" onClick={e => e.stopPropagation()}>
        <div className="qb-modal-header">
          <div className="qb-modal-title-row">
            <span className="qb-modal-icon">{getSubjectIcon(set.subject)}</span>
            <div>
              <h2 className="qb-modal-title">{set.title}</h2>
              <p className="qb-modal-subtitle">{set.subject} • {set.questionCount} questions</p>
            </div>
          </div>
          <button className="qb-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="qb-modal-toolbar">
          <span className="qb-selected-count">{selectedCount} selected</span>
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
                  <div className="qb-question-left">
                    <span className="qb-question-number">Q{index + 1}</span>
                    <span 
                      className="qb-question-diff"
                      style={{ color: getDifficultyColor(question.difficulty) }}
                    >
                      {getDifficultyIcon(question.difficulty)}
                    </span>
                    <span className="qb-question-preview">
                      {question.question_text.slice(0, 60)}{question.question_text.length > 60 ? '...' : ''}
                    </span>
                  </div>
                  <div className="qb-question-right">
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

                    <div className="qb-question-meta">
                      <span>⏱️ {question.time_limit}s</span>
                      <span>⭐ {question.points} XP</span>
                      {question.times_answered > 0 && (
                        <span>📊 {Math.round((question.times_correct / question.times_answered) * 100)}% success</span>
                      )}
                    </div>
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
            ✅ Use {selectedCount} Question{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN QUESTION BANK COMPONENT
// ============================================================================

const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  teacher,
  onUseSet,
  onEditQuestion,
  onDeleteQuestion,
  onCreateQuestion,
}) => {
  // State
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [previewSet, setPreviewSet] = useState<QuestionSet | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  // Get unique subjects for filter
  const subjects = useMemo(() => {
    const subjectSet = new Set<Subject>();
    questions.forEach(q => subjectSet.add(q.subject));
    return Array.from(subjectSet).sort();
  }, [questions]);

  // Get unique grades for filter
  const grades = useMemo(() => {
    const gradeSet = new Set<string>();
    questions.forEach(q => {
      if (q.grade_level) gradeSet.add(q.grade_level);
    });
    return Array.from(gradeSet).sort();
  }, [questions]);

  // Group questions into virtual sets
  const questionSets = useMemo(() => {
    const setMap = new Map<string, QuestionSet>();

    questions.forEach(question => {
      const topic = question.topic_name || question.topic || 'General';
      const setId = `${question.subject}_${topic}`;

      if (!setMap.has(setId)) {
        setMap.set(setId, {
          id: setId,
          title: topic,
          subject: question.subject,
          topic: topic,
          difficulty: 'easy',
          questionCount: 0,
          questions: [],
          source: 'community',
          avgSuccessRate: 0,
        });
      }

      const set = setMap.get(setId)!;
      set.questions.push(question);
      set.questionCount = set.questions.length;
    });

    // Calculate metadata for each set
    setMap.forEach(set => {
      set.difficulty = getMostCommonDifficulty(set.questions);
      
      // Calculate average success rate
      const totalAnswered = set.questions.reduce((sum, q) => sum + (q.times_answered || 0), 0);
      const totalCorrect = set.questions.reduce((sum, q) => sum + (q.times_correct || 0), 0);
      set.avgSuccessRate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

      // Determine source
      const myQuestions = set.questions.filter(q => teacher && q.teacher_id === teacher.id);
      if (myQuestions.length === set.questions.length) {
        set.source = 'mine';
      } else if (myQuestions.length > 0) {
        set.source = 'community'; // Mixed
      } else {
        set.source = 'community';
      }
    });

    return Array.from(setMap.values());
  }, [questions, teacher]);

  // Filter sets based on active filters
  const filteredSets = useMemo(() => {
    return questionSets.filter(set => {
      // Tab filter
      if (activeTab === 'mine' && set.source !== 'mine') return false;
      if (activeTab === 'community' && set.source === 'mine') return false;

      // Subject filter
      if (subjectFilter !== 'all' && set.subject !== subjectFilter) return false;

      // Difficulty filter
      if (difficultyFilter !== 'all' && set.difficulty !== difficultyFilter) return false;

      // Grade filter
      if (gradeFilter !== 'all') {
        const hasMatchingGrade = set.questions.some(q => q.grade_level === gradeFilter);
        if (!hasMatchingGrade) return false;
      }

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = set.title.toLowerCase().includes(term);
        const matchesSubject = set.subject.toLowerCase().includes(term);
        const matchesQuestion = set.questions.some(q => 
          q.question_text.toLowerCase().includes(term)
        );
        if (!matchesTitle && !matchesSubject && !matchesQuestion) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort: mine first, then by question count
      if (a.source === 'mine' && b.source !== 'mine') return -1;
      if (a.source !== 'mine' && b.source === 'mine') return 1;
      return b.questionCount - a.questionCount;
    });
  }, [questionSets, activeTab, subjectFilter, difficultyFilter, gradeFilter, searchTerm]);

  // Handlers
  const handlePreview = useCallback((set: QuestionSet) => {
    setPreviewSet(set);
    setSelectedQuestionIds(new Set(set.questions.map(q => q.id)));
  }, []);

  const handleUseSet = useCallback((set: QuestionSet) => {
    const allIds = set.questions.map(q => q.id);
    onUseSet(allIds);
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
    onUseSet(Array.from(selectedQuestionIds));
    setPreviewSet(null);
  }, [selectedQuestionIds, onUseSet]);

  const handleClosePreview = useCallback(() => {
    setPreviewSet(null);
    setSelectedQuestionIds(new Set());
  }, []);

  // Stats
  const totalQuestions = questions.length;
  const myQuestionsCount = questions.filter(q => teacher && q.teacher_id === teacher.id).length;

  return (
    <div className="qb-container">
      {/* Header */}
      <div className="qb-header">
        <div className="qb-header-content">
          <h1 className="qb-title">📚 Question Bank</h1>
          <p className="qb-subtitle">
            {totalQuestions} questions available • {myQuestionsCount} created by you
          </p>
        </div>
        {onCreateQuestion && (
          <button className="qb-create-btn" onClick={onCreateQuestion}>
            ➕ New Question
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="qb-tabs">
        <button 
          className={`qb-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          📋 All Sets
        </button>
        <button 
          className={`qb-tab ${activeTab === 'mine' ? 'active' : ''}`}
          onClick={() => setActiveTab('mine')}
        >
          ✨ My Questions
        </button>
        <button 
          className={`qb-tab ${activeTab === 'community' ? 'active' : ''}`}
          onClick={() => setActiveTab('community')}
        >
          👥 Community
        </button>
      </div>

      {/* Filters */}
      <div className="qb-filters">
        <div className="qb-search-wrapper">
          <span className="qb-search-icon">🔍</span>
          <input
            type="text"
            className="qb-search"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="qb-search-clear" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>

        <select 
          className="qb-filter-select"
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value as 'all' | Subject)}
        >
          <option value="all">All Subjects</option>
          {subjects.map(s => (
            <option key={s} value={s}>{getSubjectIcon(s)} {s}</option>
          ))}
        </select>

        <select 
          className="qb-filter-select"
          value={difficultyFilter}
          onChange={e => setDifficultyFilter(e.target.value as 'all' | QuestionDifficulty)}
        >
          <option value="all">All Difficulties</option>
          <option value="easy">🟢 Easy</option>
          <option value="medium">🟡 Medium</option>
          <option value="hard">🔴 Hard</option>
        </select>

        {grades.length > 0 && (
          <select 
            className="qb-filter-select"
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
          >
            <option value="all">All Grades</option>
            {grades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
      </div>

      {/* Results Count */}
      <div className="qb-results-info">
        <span>{filteredSets.length} set{filteredSets.length !== 1 ? 's' : ''} found</span>
      </div>

      {/* Question Sets Grid */}
      {filteredSets.length === 0 ? (
        <div className="qb-empty">
          <span className="qb-empty-icon">📭</span>
          <h3>No question sets found</h3>
          <p>Try adjusting your filters or search term</p>
        </div>
      ) : (
        <div className="qb-sets-grid">
          {filteredSets.map(set => (
            <QuestionSetCard
              key={set.id}
              set={set}
              onPreview={() => handlePreview(set)}
              onUseSet={() => handleUseSet(set)}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewSet && (
        <SetPreviewModal
          set={previewSet}
          selectedQuestionIds={selectedQuestionIds}
          onToggleQuestion={handleToggleQuestion}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onConfirm={handleConfirmSelection}
          onClose={handleClosePreview}
        />
      )}
    </div>
  );
};

export default QuestionBank;
