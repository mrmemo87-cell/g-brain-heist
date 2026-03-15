import React, { useState, useEffect, useRef } from 'react';
import {
  SubjectData,
  Question,
  AnswerResponse,
  TeacherQuestion,
  QuestionAttemptResult,
  SoloDifficulty,
  SoloMissionSummary,
  SoloQuestionPerformance,
  TopicSummary,
  StudentAssignmentTask,
  QuestionOption,
  SubjectProgress,
  DifficultyProgress,
  Subject,
  XpStatus,
} from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import { CoinIcon, GemIcon, XPIcon } from './icons';
import BackButton from './BackButton';
import { createPortal } from 'react-dom';
import { brainsAlert } from '../src/utils/brainsAlert';
import {
  calculateSoloQuestionScore,
  SoloQuestionScoreBreakdown,
  calculateMissionScore,
  buildMissionSummary,
  normalizeDifficulty,
} from '../src/lib/brains_heist/scoring';
import { getMilestoneReward } from '../src/lib/brains_heist/rewards';
import { recordSoloQuestion, recordMissionSummary } from '../services/adaptiveService';
import DifficultyPicker from './DifficultyPicker';
import UnifiedSubjectPlay from './UnifiedSubjectPlay';
import type { QuestProgress } from '../types';
import QuestionBank from './teacher/QuestionBank';

// Helper to get option text (handles both string and QuestionOption formats)
const getOptionText = (option: string | QuestionOption): string => {
  if (typeof option === 'string') return option;
  return option.text;
};

const normalizeQuestionBankSubject = (subject?: string): string => {
  if (!subject) return 'General';
  const normalized = subject.trim().toLowerCase();
  if (['math', 'mathematics', 'maths'].includes(normalized)) return 'Math';
  return subject.trim();
};

// Resolve Supabase storage-relative URLs to fully qualified public URLs
const resolveQuestionImageUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Already absolute
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return trimmed;
  }

  const normalizedPath = trimmed.replace(/^\/+/, '');
  const withBucket = normalizedPath.startsWith('question-images/') ? normalizedPath : `question-images/${normalizedPath}`;
  return `${supabaseUrl}/storage/v1/object/public/${withBucket}`;
};

// Helper to get option image URL (handles both string and QuestionOption formats)
const getOptionImageUrl = (option: string | QuestionOption): string | undefined => {
  if (typeof option === 'string') return undefined;
  return resolveQuestionImageUrl(option.image_url);
};

type QuestStage = 'loading' | 'subject_selection' | 'unified_subject_play' | 'in_progress' | 'completed' | 'assignment_blocked';
type QuestMode = 'practice' | 'teacher' | 'assignment';

interface RewardParticleProps {
    id: string;
    type: 'xp' | 'coin' | 'gem';
    startRect: DOMRect;
    onComplete: (id: string) => void;
}

const RewardParticle: React.FC<RewardParticleProps> = ({ id, type, startRect, onComplete }) => {
    const elRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = elRef.current;
        if (!el) return;

        const destinationId = type === 'xp' ? 'xp-hud' : type === 'coin' ? 'coin-hud' : 'gem-hud';
        const destination = document.getElementById(destinationId);
        if (!destination) {
            onComplete(id);
            return;
        }

        const destRect = destination.getBoundingClientRect();
        const endX = destRect.left + destRect.width / 2;
        const endY = destRect.top + destRect.height / 2;

        const animation = el.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${endX - startRect.left}px, ${endY - startRect.top}px) scale(0.2)`, opacity: 0 }
        ], {
            duration: 800 + Math.random() * 200,
            easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', // Ease-in curve for arc effect
            fill: 'forwards'
        });

        animation.onfinish = () => onComplete(id);

    }, [id, type, startRect, onComplete]);
    
    const style: React.CSSProperties = {
        position: 'fixed',
        left: startRect.left + (Math.random() - 0.5) * startRect.width,
        top: startRect.top + (Math.random() - 0.5) * startRect.height,
        pointerEvents: 'none',
        zIndex: 100,
    };
    
    const iconColor = type === 'xp'
        ? 'var(--ion-blue)'
        : type === 'coin'
            ? 'var(--amber-warn)'
            : 'var(--plasma-pink)';

    return (
        <div ref={elRef} style={style}>
            <div className="w-6 h-6" style={{ color: iconColor, filter: `drop-shadow(0 0 5px ${iconColor})` }}>
                {type === 'xp' ? <XPIcon /> : type === 'coin' ? <CoinIcon /> : <GemIcon />}
            </div>
        </div>
    );
};


interface QuestViewProps {
  onComplete: () => void;
  onGrantReward: (deltas: { xp: number; coins: number; gemstones?: number }, finalValues?: { xp: number; coins: number; level: number; gemstones: number; xp_status?: XpStatus }) => void;
  /**
   * Optional pre-fetched assignment supplied by the parent so we can avoid double loading.
   */
  initialAssignment?: StudentAssignmentTask | null;
  /**
   * Callback to refresh the global assignment state once the student completes it.
   */
  refreshAssignment?: () => Promise<void> | void;
}

const QuestView: React.FC<QuestViewProps> = ({ onComplete, onGrantReward, initialAssignment, refreshAssignment }) => {
  const [stage, setStage] = useState<QuestStage>('loading');
  const [mode, setMode] = useState<QuestMode>('practice');
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [subjectProgress, setSubjectProgress] = useState<SubjectProgress[]>([]);
  const [teacherQuests, setTeacherQuests] = useState<QuestProgress[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<SoloDifficulty | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teacherQuestions, setTeacherQuestions] = useState<TeacherQuestion[]>([]);
  const [publicQuestions, setPublicQuestions] = useState<TeacherQuestion[]>([]);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [questionBankError, setQuestionBankError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerResponse, setAnswerResponse] = useState<AnswerResponse | null>(null);
  const [score, setScore] = useState({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
  const [questionScores, setQuestionScores] = useState<SoloQuestionScoreBreakdown[]>([]);
  const [questionPerformances, setQuestionPerformances] = useState<SoloQuestionPerformance[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
  const [soloStreak, setSoloStreak] = useState(0);
  const [missionSummary, setMissionSummary] = useState<SoloMissionSummary | null>(null);
  const [topicSummary, setTopicSummary] = useState<TopicSummary | null>(null);
  const [particles, setParticles] = useState<Omit<RewardParticleProps, 'onComplete'>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignmentTask | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<StudentAssignmentTask[]>([]);
  const [preferredAssignmentId, setPreferredAssignmentId] = useState<string | null>(initialAssignment?.assignment_id ?? null);
  const [hasDeferredAssignments, setHasDeferredAssignments] = useState(false);
  const [isAssignmentLate, setIsAssignmentLate] = useState(false);
  const [lastCompletedAssignment, setLastCompletedAssignment] = useState<StudentAssignmentTask | null>(null);
  const [assignmentStartTime, setAssignmentStartTime] = useState<number | null>(null);
  const [assignmentSubmissionState, setAssignmentSubmissionState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [nextAction, setNextAction] = useState<(() => void) | null>(null);
  const [nextActionLabel, setNextActionLabel] = useState<string>('');
  const [freeformAnswer, setFreeformAnswer] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const answerFeedbackRef = useRef<HTMLDivElement>(null);

  const resolveDifficulty = (questionLike: Question | TeacherQuestion): SoloDifficulty => {
    const difficultyValue = (questionLike as TeacherQuestion).difficulty ?? (questionLike as Question).difficulty;
    if (typeof difficultyValue === 'number') {
      if (difficultyValue >= 3) return 'hard';
      if (difficultyValue >= 2) return 'medium';
      return 'easy';
    }
    return normalizeDifficulty(difficultyValue ?? null);
  };

  const resolveTimeLimit = (questionLike: Question | TeacherQuestion): number => {
    const raw =
      (questionLike as TeacherQuestion).time_limit ??
      (questionLike as any)?.time_limit_seconds ??
      (questionLike as any)?.time_limit ??
      0;
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 40;
  };

  const computeMissionDifficulty = (performances: SoloQuestionPerformance[]): SoloDifficulty => {
    const weights: Record<SoloDifficulty, number> = { easy: 1, medium: 2, hard: 3 };
    const maxWeight = performances.reduce((current, item) => {
      return Math.max(current, weights[item.difficulty]);
    }, 1);
    if (maxWeight >= 3) return 'hard';
    if (maxWeight === 2) return 'medium';
    return 'easy';
  };

  const computeAnswerTime = (timeLimitSeconds: number): number => {
    if (!questionStartTime) {
      return timeLimitSeconds;
    }
    const elapsed = (Date.now() - questionStartTime) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      return timeLimitSeconds;
    }
    return Math.max(0, elapsed);
  };

  const finalizeMission = (
    scores: SoloQuestionScoreBreakdown[],
    performances: SoloQuestionPerformance[],
    branchId: string,
    topicId: string
  ) => {
    if (!scores.length || !performances.length || missionSummary) {
      return;
    }

    const missionScore = calculateMissionScore(scores);
    const missionDifficulty = computeMissionDifficulty(performances);
    const summary = buildMissionSummary(topicId, branchId, missionDifficulty, performances, missionScore);

    setMissionSummary(summary);
    const updatedTopic = recordMissionSummary(summary);
    setTopicSummary(updatedTopic);

    const reward = getMilestoneReward('missionCompleted');
    if (reward.xp || reward.coins) {
      onGrantReward({ xp: reward.xp, coins: reward.coins });
    }
  };

  const applyQuestionTelemetry = (
    questionLike: Question | TeacherQuestion,
    wasCorrect: boolean,
    response: AnswerResponse
  ) => {
    const difficulty = resolveDifficulty(questionLike);
    const timeLimitSeconds = resolveTimeLimit(questionLike);
    const answerTimeSeconds = computeAnswerTime(timeLimitSeconds);
    const topicId = selectedSubject?.id || questionLike.subject || 'unknown_topic';
    const branchId = selectedSubject?.id || questionLike.subject || 'unknown_branch';
    const streakCount = wasCorrect ? soloStreak + 1 : 0;

    const scoreBreakdown = calculateSoloQuestionScore({
      difficulty,
      answerTimeSeconds,
      timeLimitSeconds,
      streakCount,
      wasCorrect,
    });

    response.score = scoreBreakdown.total;

    const performance: SoloQuestionPerformance = {
      topicId,
      branchId,
      difficulty,
      timeLimitSeconds,
      answerTimeSeconds,
      wasCorrect,
      timestamp: new Date().toISOString(),
    };

    const updatedScores = [...questionScores, scoreBreakdown];
    const updatedPerformances = [...questionPerformances, performance];

    setQuestionScores(updatedScores);
    setQuestionPerformances(updatedPerformances);
    setSoloStreak(streakCount);

    if (selectedSubject?.id) {
      recordSoloQuestion(performance);
    }

    return {
      updatedScores,
      updatedPerformances,
      branchId,
      topicId,
      scoreBreakdown,
    };
  };

  // Load subjects and go directly to selection (unified flow)
  const loadSubjects = async () => {
    if (activeAssignment && !hasDeferredAssignments) {
      setMode('assignment');
      setStage('assignment_blocked');
      return;
    }

    setStage('loading');
    setQuestionBankLoading(true);
    setQuestionBankError(null);
    
    try {
      const publicQuestionsPromise = GameService.get_public_questions().catch((error) => {
        console.warn('[QuestView] Failed to load public question bank:', error);
        setQuestionBankError('Unable to load the question bank right now.');
        return [] as TeacherQuestion[];
      });

      // Load regular practice subjects
      const data = await GameService.mcq_subjects_list();
      setSubjects(data);
      
      // Load REAL student progress WITH DIFFICULTY BREAKDOWN
      // Add timeout to prevent infinite loading if the query hangs
      let studentProgress: Awaited<ReturnType<typeof GameService.get_student_subject_progress_with_difficulty>> = [];
      try {
        const progressPromise = GameService.get_student_subject_progress_with_difficulty();
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Progress fetch timeout')), 10000)
        );
        studentProgress = await Promise.race([progressPromise, timeoutPromise]);
      } catch (progressError) {
        console.warn('[QuestView] Failed to load student progress, using defaults:', progressError);
        // Continue with empty progress - user can still practice
      }
      
      // Map to SubjectProgress format with REAL difficulty data
      const realProgress: SubjectProgress[] = data.map(subject => {
        const progress = studentProgress.find(p => p.id === subject.id);
        const difficulties = progress?.difficulties || {
          easy: { total: 0, completed: 0 },
          medium: { total: 0, completed: 0 },
          hard: { total: 0, completed: 0 }
        };
        
        // Use real difficulty breakdown from database
        return {
          id: subject.id,
          name: subject.name,
          easy: { 
            total: difficulties.easy.total, 
            completed: difficulties.easy.completed,
            answeredWithRewards: difficulties.easy.completed,
            newLeft: Math.max(0, difficulties.easy.total - difficulties.easy.completed)
          },
          medium: { 
            total: difficulties.medium.total, 
            completed: difficulties.medium.completed,
            answeredWithRewards: difficulties.medium.completed,
            newLeft: Math.max(0, difficulties.medium.total - difficulties.medium.completed)
          },
          hard: { 
            total: difficulties.hard.total, 
            completed: difficulties.hard.completed,
            answeredWithRewards: difficulties.hard.completed,
            newLeft: Math.max(0, difficulties.hard.total - difficulties.hard.completed)
          }
        };
      });
      
      setSubjectProgress(realProgress);

      // Load public questions so students can browse the bank like teachers
      const publicQuestionsResult = await publicQuestionsPromise;
      const normalizedPublicQuestions = (publicQuestionsResult || []).map(normalizeAssignmentQuestion);
      setPublicQuestions(normalizedPublicQuestions);
      setQuestionBankError(null);
      setStage('subject_selection');
    } catch (error) {
      console.error('Error loading subjects:', error);
      setPublicQuestions([]);
      setQuestionBankError('Unable to load subjects or question bank.');
      setStage('subject_selection');
    } finally {
      setQuestionBankLoading(false);
    }
  };
  
  const handleParticleComplete = (id: string) => {
      setParticles(current => current.filter(p => p.id !== id));
  };

  const normalizeAssignmentQuestion = (question: TeacherQuestion): TeacherQuestion => {
    const rawOptions = (question as any).options;
    const normalizeOptions = (): (string | QuestionOption)[] => {
      if (Array.isArray(rawOptions)) {
        return rawOptions.map((value) => {
          if (value == null) return '';
          // Preserve QuestionOption objects with image_url
          if (typeof value === 'object' && value !== null && 'text' in value) {
            return {
              text: String((value as any).text || ''),
              image_url: (value as any).image_url || undefined
            } as QuestionOption;
          }
          return String(value);
        });
      }

      if (typeof rawOptions === 'string') {
        try {
          const parsed = JSON.parse(rawOptions);
          if (Array.isArray(parsed)) {
            return parsed.map((value) => {
              if (value == null) return '';
              // Preserve QuestionOption objects with image_url
              if (typeof value === 'object' && value !== null && 'text' in value) {
                return {
                  text: String((value as any).text || ''),
                  image_url: (value as any).image_url || undefined
                } as QuestionOption;
              }
              return String(value);
            });
          }
        } catch (error) {
          // Ignore JSON parse failures and fall back to defaults
        }
      }

      if (rawOptions && typeof rawOptions === 'object') {
        const values = Object.values(rawOptions as Record<string, unknown>)
          .map((value) => {
            if (value == null) return '';
            // Preserve QuestionOption objects with image_url
            if (typeof value === 'object' && value !== null && 'text' in value) {
              return {
                text: String((value as any).text || ''),
                image_url: (value as any).image_url || undefined
              } as QuestionOption;
            }
            return String(value);
          });
        if (values.length) {
          return values;
        }
      }

      if (question.question_type === 'true_false') {
        return ['True', 'False'];
      }

      return [];
    };

    const resolvedTimeLimitRaw = (question as any).time_limit ?? (question as any).time_limit_seconds;
    const numericTimeLimit = typeof resolvedTimeLimitRaw === 'number' ? resolvedTimeLimitRaw : Number(resolvedTimeLimitRaw);
    const resolvedTimeLimit = Number.isFinite(numericTimeLimit) && numericTimeLimit > 0 ? numericTimeLimit : 30;

    const resolvedPointsRaw = (question as any).points;
    const numericPoints = typeof resolvedPointsRaw === 'number' ? resolvedPointsRaw : Number(resolvedPointsRaw);
    const resolvedPoints = Number.isFinite(numericPoints) && numericPoints >= 0 ? numericPoints : 10;

    return {
      ...question,
      topic_name: question.topic_name || question.topic || 'General',
      options: normalizeOptions(),
      time_limit: resolvedTimeLimit,
      points: resolvedPoints,
    };
  };

  const applyAssignmentState = (assignment: StudentAssignmentTask) => {
    // Check if assignment is past due (but still allow completion)
    const isExpired = (() => {
      if (!assignment.due_at) return false;
      const dueTimestamp = new Date(assignment.due_at).getTime();
      return Number.isFinite(dueTimestamp) && dueTimestamp < Date.now();
    })();

    // Log expiration status for debugging
    if (isExpired) {
      console.log('[QuestView] Assignment is past due, but still allowing completion:', assignment.due_at);
    }

    // REMOVED: Previously we would skip expired assignments and go to practice mode
    // Now we show the assignment regardless, as students should complete mandatory work even if late

    const normalizedQuestions = (assignment.questions || []).map(normalizeAssignmentQuestion);

    setActiveAssignment({ ...assignment, questions: normalizedQuestions });
    setIsAssignmentLate(isExpired);
    setLastCompletedAssignment(null);
    setMode('assignment');
    setHasDeferredAssignments(false);
    setTeacherQuestions(normalizedQuestions);
    setSelectedSubject({
      id: assignment.subject_id || assignment.subject_name,
      name: assignment.subject_name,
      difficulty: 1,
    });
    setSelectedTopic(assignment.topic_name || assignment.topic || null);
    setStage('assignment_blocked');
    setCurrentQuestionIndex(0);
    setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
    setSelectedOption(null);
    setAnswerResponse(null);
    setNextAction(null);
    setNextActionLabel('');
    setQuestionScores([]);
    setQuestionPerformances([]);
    setMissionSummary(null);
    setTopicSummary(null);
    setAssignmentSubmissionState('idle');
    setAssignmentStartTime(null);
  };

  const hydrateAssignment = async (options: { showLoading?: boolean; preferredId?: string | null } = {}) => {
    const { showLoading = false } = options;
    if (showLoading) {
      setStage('loading');
    }
    try {
      console.log('[QuestView] Checking for active assignment...');

      // Add timeout to prevent infinite loading
      const assignmentPromise = GameService.get_student_pending_assignments();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn('[QuestView] Assignment fetch timed out after 15s');
          resolve(null);
        }, 15000);
      });

      const assignment = await Promise.race([assignmentPromise, timeoutPromise]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const assignments = Array.isArray(assignment) ? assignment : assignment ? [assignment] : [];
      setPendingAssignments(assignments);
      const preferredId = options.preferredId ?? preferredAssignmentId ?? initialAssignment?.assignment_id ?? null;
      const selectedAssignment = preferredId
        ? assignments.find((item) => item.assignment_id === preferredId) ?? assignments[0]
        : assignments[0];

      console.log('[QuestView] Active assignment result:', selectedAssignment ? {
        id: selectedAssignment.assignment_id,
        title: selectedAssignment.title,
        questions: selectedAssignment.questions?.length || 0
      } : 'null');

      if (selectedAssignment) {
        setPreferredAssignmentId(selectedAssignment.assignment_id);
        applyAssignmentState({
          ...selectedAssignment,
          questions: (selectedAssignment.questions || []).map(normalizeAssignmentQuestion),
        });
        await refreshAssignment?.();
      } else {
        console.log('[QuestView] No active assignment found, showing subject selection');
        setActiveAssignment(null);
        setTeacherQuestions([]);
        setSelectedSubject(null);
        setHasDeferredAssignments(false);
        if (mode === 'assignment') {
          setMode('practice');
        }
        await loadSubjects();
        await refreshAssignment?.();
      }
    } catch (error) {
      console.error('[QuestView] Error loading assignment:', error);
      // Ensure we exit loading state on error
      await loadSubjects();
    }
  };

  const handleSelectAssignment = (assignment: StudentAssignmentTask) => {
    setPreferredAssignmentId(assignment.assignment_id);
    setHasDeferredAssignments(false);
    applyAssignmentState({
      ...assignment,
      questions: (assignment.questions || []).map(normalizeAssignmentQuestion),
    });
  };

  const handleDeferAssignment = async () => {
    setHasDeferredAssignments(true);
    setMode('practice');
    setSelectedSubject(null);
    setSelectedTopic(null);
    setSelectedDifficulty(null);
    setQuestions([]);
    setTeacherQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setAnswerResponse(null);
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    setQuestionStartTime(null);
    setNextAction(null);
    setNextActionLabel('');
    setFreeformAnswer('');
    await loadSubjects();
    setStage('subject_selection');
  };

  const handleSubjectSelect = async (subject: SubjectData) => {
    setSelectedSubject(subject);
    setSelectedTopic(null);
    setStage('loading');
    
    try {
      // No fake "teacher quests" - the Free Practice section shows all available questions
      // Teacher-assigned work only comes from actual assignments (handled separately)
      setTeacherQuests([]);
      setStage('unified_subject_play');
    } catch (err) {
      console.error('Error loading subject:', err);
      setTeacherQuests([]);
      setStage('unified_subject_play');
    }
  };
  
  const handleQuestSelect = async (questId: string) => {
    if (!selectedSubject) return;
    
    setMode('teacher');
    setSelectedTopic(null);
    setStage('loading');
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    setQuestionStartTime(null);
    
    try {
      const data = await GameService.get_public_questions(selectedSubject.name as any);
      if (data.length === 0) {
        brainsAlert('No teacher questions available for this quest yet.', 'info');
        setStage('unified_subject_play');
        return;
      }
      
      // Take up to 5 random questions
      const shuffled = data.sort(() => Math.random() - 0.5);
      setTeacherQuestions(shuffled.slice(0, Math.min(5, shuffled.length)));
      setCurrentQuestionIndex(0);
      setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
      setSelectedOption(null);
      setAnswerResponse(null);
      setStage('in_progress');
      setQuestionStartTime(Date.now());
    } catch (err) {
      console.error('Error loading teacher questions:', err);
      brainsAlert('Unable to load teacher questions.', 'error');
      setStage('unified_subject_play');
    }
  };

  const handleUseQuestionSet = (questionIds: string[], subject: Subject, topic: string) => {
    const matchedSubject = subjects.find((s) => s.name === subject) || { id: subject, name: subject, difficulty: 1 };
    const selectedQuestions = publicQuestions.filter((question) => questionIds.includes(question.id));

    if (selectedQuestions.length === 0) {
      brainsAlert('No questions available for this set yet.', 'info');
      return;
    }

    const normalizedQuestions = selectedQuestions.map(normalizeAssignmentQuestion);

    setMode('teacher');
    setSelectedSubject(matchedSubject);
    setSelectedTopic(topic || null);
    setTeacherQuestions(normalizedQuestions);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
    setSelectedOption(null);
    setAnswerResponse(null);
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    setQuestionStartTime(Date.now());
    setSelectedDifficulty(null);
    setNextAction(null);
    setNextActionLabel('');
    setFreeformAnswer('');
    setLastCompletedAssignment(null);
    setIsAssignmentLate(false);
    setStage('in_progress');
  };

  const handleDifficultySelect = (difficulty: SoloDifficulty) => {
    if (!selectedSubject) return;
    
    setMode('practice');
    setSelectedDifficulty(difficulty);
    setSelectedTopic(null);
    setStage('loading');
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    setQuestionStartTime(null);
    
    // Load questions filtered by difficulty
    // TODO: Update API to accept difficulty parameter
    GameService.mcq_questions_get(selectedSubject.id, 5).then(data => {
      // Filter by difficulty if questions have difficulty property
      const filteredQuestions = data.filter(q => q.difficulty === difficulty);
      setQuestions(filteredQuestions.length > 0 ? filteredQuestions : data);
      setCurrentQuestionIndex(0);
      setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
      setSelectedOption(null);
      setAnswerResponse(null);
      setStage('in_progress');
      setQuestionStartTime(Date.now());
    });
  };

  const handleAssignmentBegin = () => {
    if (!activeAssignment) return;
    setHasDeferredAssignments(false);
    if (!teacherQuestions.length && activeAssignment.questions?.length) {
      setTeacherQuestions(activeAssignment.questions);
    }
    setStage('in_progress');
    setMode('assignment');
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setAnswerResponse(null);
    setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    const now = Date.now();
    setAssignmentStartTime(now);
    setQuestionStartTime(now);
  };

  useEffect(() => {
    if (stage !== 'in_progress') return;
    const activeQuestion = mode === 'practice' ? questions[currentQuestionIndex] : teacherQuestions[currentQuestionIndex];
    if (activeQuestion) {
      setQuestionStartTime(Date.now());
    }
  }, [stage, currentQuestionIndex, mode, questions, teacherQuestions]);

  useEffect(() => {
    const preferredId = initialAssignment?.assignment_id ?? null;
    if (preferredId) {
      setPreferredAssignmentId(preferredId);
    }
    hydrateAssignment({ showLoading: true, preferredId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssignment?.assignment_id]);

  useEffect(() => {
    const submitResult = async () => {
      if (stage !== 'completed' || mode !== 'assignment' || !activeAssignment || assignmentSubmissionState !== 'idle') {
        return;
      }

      const totalQuestions = teacherQuestions.length;
      const correctCount = score.correct;
      const incorrectCount = Math.max(0, totalQuestions - correctCount);
      const accuracyPercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const missionTotal = Math.round(calculateMissionScore(questionScores));
      const timeTakenSeconds = assignmentStartTime ? Math.max(0, Math.round((Date.now() - assignmentStartTime) / 1000)) : 0;

      try {
        setAssignmentSubmissionState('submitting');
        await GameService.submit_assignment_result({
          assignmentId: activeAssignment.assignment_id,
          correct: correctCount,
          incorrect: incorrectCount,
          accuracy: accuracyPercent,
          score: missionTotal,
          timeTakenSeconds,
        });
        
        // Check for assignment achievements after submission
        try {
          const user = await GameService.whoami();
          if (user?.id) {
            const newAchievements = await GameService.check_assignment_achievements(user.id);
            if (newAchievements.length > 0) {
              // Show achievement notification for each new achievement
              newAchievements.forEach(ach => {
                console.log(`🏆 Assignment Achievement Earned: ${ach.achievement_name}`);
              });
            }
          }
        } catch (achievementError) {
          console.warn('Failed to check assignment achievements:', achievementError);
        }
        
        setAssignmentSubmissionState('submitted');
        setLastCompletedAssignment(activeAssignment);
        setActiveAssignment(null);
        await refreshAssignment?.();
        hydrateAssignment({ showLoading: true });
      } catch (error) {
        console.error('Failed to submit assignment result:', error);
        setAssignmentSubmissionState('idle');
      }
    };

    submitResult();
  }, [stage, mode, activeAssignment, teacherQuestions.length, score.correct, questionScores, assignmentStartTime, assignmentSubmissionState]);

  const handleAnswerSubmit = async (option: string) => {
    if (answerResponse || isSubmitting) return;

    setSelectedOption(option);
    setIsSubmitting(true);

    const spawnParticles = (response: AnswerResponse) => {
      if (!response.correct || !answerFeedbackRef.current) return;
      audioService.play('collect');
      const startRect = answerFeedbackRef.current.getBoundingClientRect();
      const newParticles: Omit<RewardParticleProps, 'onComplete'>[] = [];
      if (response.deltas.xp > 0) {
        for (let i = 0; i < 5; i += 1) {
          newParticles.push({ id: `xp_${Date.now()}_${i}`, type: 'xp', startRect });
        }
      }
      if (response.deltas.coins > 0) {
        for (let i = 0; i < 5; i += 1) {
          newParticles.push({ id: `coin_${Date.now()}_${i}`, type: 'coin', startRect });
        }
      }
      const gemstoneCount = response.deltas.gemstones || 0;
      if (gemstoneCount > 0) {
        const particleCount = Math.min(3, gemstoneCount);
        for (let i = 0; i < particleCount; i += 1) {
          newParticles.push({ id: `gem_${Date.now()}_${i}`, type: 'gem', startRect });
        }
      }
      setParticles((current) => [...current, ...newParticles]);
    };

    const afterAnswerCommon = (
      response: AnswerResponse,
      isLastQuestion: boolean,
      updatedScores: SoloQuestionScoreBreakdown[],
      updatedPerformances: SoloQuestionPerformance[],
      branchId: string,
      topicId: string,
      advanceFn: () => void
    ) => {
      setAnswerResponse(response);

      if (response.correct) {
        audioService.play('correct');
      } else {
        audioService.play('wrong');
      }

      const hasRewards = response.deltas.xp > 0 || response.deltas.coins > 0 || (response.deltas.gemstones || 0) > 0;

      // Check if this is a duplicate answer (no rewards given)
      const isDuplicate = response.correct && !hasRewards;
      
      if (isDuplicate) {
        // Show prominent duplicate warning
        response.explanation = 'Try a different subject or difficulty to earn more rewards.';
      }

      onGrantReward(response.deltas, response.finalProfileValues);
      
      // Only spawn particles if rewards were actually given
      if (!isDuplicate) {
        spawnParticles(response);
      }

      setScore((prev) => ({
        correct: prev.correct + (response.correct ? 1 : 0),
        xp: prev.xp + response.deltas.xp,
        coins: prev.coins + response.deltas.coins,
        gemstones: prev.gemstones + (response.deltas.gemstones || 0),
      }));

      setTimeout(() => {
        if (answerFeedbackRef.current) {
          answerFeedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);

      const proceed = () => {
        setNextAction(null);
        setNextActionLabel('');
        if (isLastQuestion) {
          finalizeMission(updatedScores, updatedPerformances, branchId, topicId);
          audioService.play('tada');
          setStage('completed');
          setAnswerResponse(null);
        } else {
          advanceFn();
          setSelectedOption(null);
          setAnswerResponse(null);
          setQuestionStartTime(Date.now());
        }
      };

      setNextAction(() => proceed);
      setNextActionLabel(isLastQuestion ? 'View results' : 'Next question');
    };

    if (mode === 'practice') {
      const currentQuestion = questions[currentQuestionIndex];
      if (!currentQuestion) {
        console.error('No question available for current index');
        setIsSubmitting(false);
        return;
      }

      try {
        console.log('[Quest] Submitting answer for question:', currentQuestion.id);
        const response = await GameService.mcq_answer_submit(currentQuestion, option);
        console.log('[Quest] Answer response received:', { 
          correct: response.correct, 
          deltas: response.deltas,
          finalProfileValues: response.finalProfileValues 
        });

        const telemetry = applyQuestionTelemetry(currentQuestion, response.correct, response);

        const correctAnswerText = currentQuestion.correct_answer || '';
        const explanation = response.correct
          ? response.explanation || 'Correct!'
          : response.explanation || (correctAnswerText ? `Incorrect. The correct answer was ${correctAnswerText}.` : 'Incorrect.');
        response.explanation = explanation;

        setQuestionStartTime(null);

        if (telemetry) {
          afterAnswerCommon(
            response,
            currentQuestionIndex >= questions.length - 1,
            telemetry.updatedScores,
            telemetry.updatedPerformances,
            telemetry.branchId,
            telemetry.topicId,
            () => setCurrentQuestionIndex((prev) => prev + 1)
          );
        }
      } catch (error) {
        console.error('[Quest] CRITICAL ERROR submitting answer:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // If it's a profile update error, it means rewards failed to save
        if (errorMsg.includes('profile') || errorMsg.includes('persist')) {
          brainsAlert('Your rewards could not be saved.\n\nPlease:\n1. Try again\n2. Refresh the page\n\nIf the problem persists, contact your teacher.', 'error');
        } else {
          brainsAlert('Unable to submit your answer. Please try again.', 'error');
        }
        setSelectedOption(null);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const currentQuestion = teacherQuestions[currentQuestionIndex];
      if (!currentQuestion) {
        console.error('No teacher question available for current index');
        setIsSubmitting(false);
        return;
      }

      try {
        const result = await GameService.submit_question_answer(
          currentQuestion.id,
          option,
          undefined,
          undefined
        );

        // Track individual answers for assignment analysis
        if (mode === 'assignment' && activeAssignment?.assignment_id) {
          try {
            await GameService.submit_assignment_answer({
              assignmentId: activeAssignment.assignment_id,
              questionId: currentQuestion.id,
              questionText: currentQuestion.question_text,
              correctAnswer: currentQuestion.correct_answer,
              studentAnswer: option,
              isCorrect: result.is_correct,
              timeTakenMs: questionStartTime ? Date.now() - questionStartTime : 0,
            });
          } catch (trackingError) {
            // Non-critical - continue even if tracking fails
            console.warn('Failed to track assignment answer:', trackingError);
          }
        }

        const response: AnswerResponse = {
          correct: result.is_correct,
          deltas: {
            xp: result.points_earned,
            coins: result.is_correct ? Math.floor(result.points_earned / 2) : 0,
            gemstones: 0,
          },
          finalProfileValues: result.final_profile_values,
          explanation: result.is_correct
            ? currentQuestion.explanation || 'Correct!'
            : `Incorrect. ${currentQuestion.explanation || 'The correct answer was ' + currentQuestion.correct_answer}`,
        };

        const telemetry = applyQuestionTelemetry(currentQuestion, response.correct, response);
        setQuestionStartTime(null);

        if (telemetry) {
          afterAnswerCommon(
            response,
            currentQuestionIndex >= teacherQuestions.length - 1,
            telemetry.updatedScores,
            telemetry.updatedPerformances,
            telemetry.branchId,
            telemetry.topicId,
            () => setCurrentQuestionIndex((prev) => prev + 1)
          );
        }
      } catch (error) {
        console.error('Error submitting teacher answer:', error);
        brainsAlert('Unable to submit answer. Please try again.', 'error');
        setSelectedOption(null);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const renderSubjectSelection = () => (
    <div className="space-y-6">
      {pendingAssignments.length > 0 && (
        <div className="max-w-5xl mx-auto rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-200">Assignments pending</p>
              <p className="text-xs text-amber-100/80">
                {pendingAssignments.length} teacher assignment{pendingAssignments.length === 1 ? '' : 's'} waiting. You can keep questing now and return later.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHasDeferredAssignments(false);
                if (!activeAssignment) {
                  hydrateAssignment({ showLoading: true });
                  return;
                }
                setMode('assignment');
                setStage('assignment_blocked');
              }}
              className="rounded-xl border border-amber-300/60 bg-amber-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-100 transition hover:border-amber-200/80 hover:bg-amber-500/30"
            >
              Review assignments
            </button>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto p-6 rounded-2xl bg-gradient-to-r from-slate-900/70 via-indigo-900/50 to-fuchsia-900/50 border border-cyan-400/30 shadow-[0_0_32px_rgba(34,211,238,0.18)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/BRAINS.svg"
              alt="Brains Heist logo"
              className="w-12 h-12 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]"
            />
            <div>
              <h2 className="font-heading text-2xl text-white">Explore the Question Bank</h2>
              <p className="text-sm text-slate-200">Browse every subject and topic just like your teacher.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-slate-200">
            <div className="card-glass p-3 border border-cyan-400/30 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Subjects</p>
              <p className="font-heading text-xl text-white">
                {new Set(publicQuestions.map((question) => normalizeQuestionBankSubject(question.subject))).size || '—'}
              </p>
            </div>
            <div className="card-glass p-3 border border-indigo-400/30 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Topics</p>
              <p className="font-heading text-xl text-white">
                {new Set(publicQuestions.map((question) => question.topic_name || question.topic || 'General')).size || '—'}
              </p>
            </div>
            <div className="card-glass p-3 border border-fuchsia-400/30 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Questions</p>
              <p className="font-heading text-xl text-white">{publicQuestions.length || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full">
        {questionBankLoading ? (
          <div className="flex justify-center mt-10">
            <img src="/BRAINS.svg" alt="Loading..." className="w-28 h-28 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} />
          </div>
        ) : questionBankError ? (
          <div className="card-glass p-6 text-center border border-red-500/40">
            <p className="text-red-300 font-semibold mb-2">We hit a snag loading the question bank.</p>
            <p className="text-gray-300 text-sm">{questionBankError}</p>
          </div>
        ) : publicQuestions.length === 0 ? (
          <div className="card-glass p-6 text-center border border-cyan-500/30">
            <p className="text-white font-heading text-xl mb-2">No questions are available yet.</p>
            <p className="text-gray-300 text-sm">Once your teacher publishes questions, they will appear here for practice.</p>
          </div>
        ) : (
          <QuestionBank
            questions={publicQuestions}
            teacher={null}
            onUseSet={handleUseQuestionSet}
            useActionLabel="Start Quest"
          />
        )}
      </div>
    </div>
  );

  const renderInProgress = () => {
    const assignmentQuestions = mode === 'assignment'
      ? (teacherQuestions.length ? teacherQuestions : activeAssignment?.questions || [])
      : [];
    const question = mode === 'practice' ? questions[currentQuestionIndex] : null;
    const teacherQuestion = mode === 'teacher' ? teacherQuestions[currentQuestionIndex] : null;
    const assignmentQuestion = mode === 'assignment' ? assignmentQuestions[currentQuestionIndex] : null;

    if (!question && !teacherQuestion && !assignmentQuestion) return null;

    const getOptionClasses = (option: string, correctAnswer: string) => {
        const baseClass = 'p-4 rounded-2xl border text-left transition-colors duration-300 disabled:cursor-not-allowed text-white shadow-sm';
        if (!answerResponse) {
            return `${baseClass} bg-slate-800/70 hover:bg-slate-700/80 border-cyan-500/40`;
        }
        const isCorrectChoice = option === correctAnswer;
        const isUserSelection = option === selectedOption;

        if (isCorrectChoice) {
            return `${baseClass} bg-green-500/30 border-green-300 text-white`;
        }
        if (isUserSelection && !answerResponse.correct) {
            return `${baseClass} bg-red-500/30 border-red-300 text-white`;
        }
        return `${baseClass} bg-slate-800/60 border-slate-600 text-gray-300`;
    };

    const activeTeacherQuestion = mode === 'assignment' ? assignmentQuestion : teacherQuestion;
    const questionText = mode === 'practice' ? question!.body : activeTeacherQuestion!.question_text;
    const rawOptions: (string | QuestionOption)[] = mode === 'practice'
      ? question?.options ?? []
      : activeTeacherQuestion?.options ?? [];
    const correctAnswer = mode === 'practice'
      ? question!.correct_answer ?? ''
      : activeTeacherQuestion!.correct_answer ?? '';
    const totalQuestions = mode === 'practice'
      ? questions.length
      : mode === 'assignment'
        ? assignmentQuestions.length
        : teacherQuestions.length;
    const assignmentDetails = mode === 'assignment' ? (activeAssignment || lastCompletedAssignment) : null;

    return (
      <div className="max-w-3xl mx-auto">
        {createPortal(
            particles.map(p => <RewardParticle key={p.id} {...p} onComplete={handleParticleComplete} />),
            document.body
        )}
        <div className="text-center mb-4">
          <p className="font-mono" style={{color: 'var(--mist-400)'}}>Question {currentQuestionIndex + 1} / {totalQuestions}</p>
          <h2 className="font-heading text-2xl mt-2" style={{color: 'var(--ion-blue)'}}>{selectedSubject?.name}</h2>
          {selectedTopic && (
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-100">
                {selectedTopic}
              </span>
            </div>
          )}
          {mode === 'teacher' && teacherQuestion && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 border border-purple-400">
                {teacherQuestion.difficulty}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 border border-yellow-400">
                {teacherQuestion.points} XP
              </span>
            </div>
          )}
          {mode === 'assignment' && assignmentDetails && (
            <div className="flex flex-col items-center gap-1 mt-2 text-sm text-gray-300">
              <span>Assigned by {assignmentDetails.teacher_username}</span>
              <span>Due {assignmentDetails.due_at ? new Date(assignmentDetails.due_at).toLocaleString() : 'No deadline'}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card-glass p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400">Mission Score</p>
            <p className="font-heading text-2xl text-white mt-1">{Math.round(calculateMissionScore(questionScores))}</p>
          </div>
          <div className="card-glass p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400">Accuracy</p>
            <p className="font-heading text-2xl text-white mt-1">
              {questionPerformances.length
                ? `${Math.round((questionPerformances.filter((item) => item.wasCorrect).length / questionPerformances.length) * 100)}%`
                : '—'}
            </p>
          </div>
          <div className="card-glass p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400">Streak</p>
            <p className="font-heading text-2xl text-white mt-1">{soloStreak}</p>
          </div>
        </div>
        <div className="card-glass p-6 mb-6">
            <p className="text-xl text-gray-200">{questionText}</p>
            {/* Display question image if available (for all question types) */}
            {resolveQuestionImageUrl(mode === 'practice' ? question?.image_url : activeTeacherQuestion?.image_url) && (
              <div className="mt-4 flex justify-center">
                <img
                  src={resolveQuestionImageUrl(mode === 'practice' ? question?.image_url : activeTeacherQuestion?.image_url) || ''}
                  alt="Question"
                  className="max-w-full max-h-64 rounded-lg border border-gray-600 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
        </div>
        {mode === 'assignment' && assignmentDetails?.instructions && (
          <div className="card-glass p-4 mb-6 border border-purple-500/30 text-sm text-gray-200">
            {assignmentDetails.instructions}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rawOptions.map((option, index) => {
            const optionText = getOptionText(option);
            const optionImageUrl = getOptionImageUrl(option);
            return (
              <button
                key={index}
                disabled={!!answerResponse || isSubmitting}
                onClick={() => handleAnswerSubmit(optionText)}
                className={getOptionClasses(optionText, correctAnswer)}
              >
                <div className="flex flex-col items-start w-full">
                  <div className="flex items-start">
                    <span className="font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
                    <span>{optionText}</span>
                  </div>
                  {optionImageUrl && (
                    <img
                      src={optionImageUrl}
                      alt={`Option ${String.fromCharCode(65 + index)}`}
                      className="mt-2 max-h-24 rounded border border-gray-600 object-contain"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {answerResponse && (
            <div ref={answerFeedbackRef} className={`mt-6 p-6 rounded-2xl text-center border-2 shadow-2xl ${
              answerResponse.correct && (answerResponse.deltas.xp > 0 || answerResponse.deltas.coins > 0 || (answerResponse.deltas.gemstones || 0) > 0)
                ? 'bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-400/60 shadow-green-500/20'
                : answerResponse.correct
                ? 'bg-gradient-to-br from-amber-900/30 to-yellow-900/20 border-amber-400/60 shadow-amber-500/20'
                : 'bg-gradient-to-br from-red-900/30 to-rose-900/20 border-red-400/60 shadow-red-500/20'
            }`}>
                {answerResponse.correct ? (
                  <div className="flex flex-col items-center">
                    {answerResponse.deltas.xp > 0 || answerResponse.deltas.coins > 0 || (answerResponse.deltas.gemstones || 0) > 0 ? (
                      <>
                        <div className="text-7xl mb-3 animate-bounce filter drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]">✓</div>
                        <h3 className="font-bold text-2xl text-green-300 mb-2 animate-pulse">Correct!</h3>
                        <div className="flex gap-3 mb-3">
                          <span className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/50 rounded-full text-cyan-300 font-bold flex items-center gap-2">
                            <XPIcon className="w-5 h-5" />
                            +{answerResponse.deltas.xp} XP
                          </span>
                          <span className="px-4 py-2 bg-amber-500/20 border border-amber-400/50 rounded-full text-amber-300 font-bold flex items-center gap-2">
                            <CoinIcon className="w-5 h-5" />
                            +{answerResponse.deltas.coins} Coins
                          </span>
                        </div>
                        <p className="text-gray-200 leading-relaxed">{answerResponse.explanation}</p>
                      </>
                    ) : (
                      <>
                        <div className="text-7xl mb-3 animate-pulse filter drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">⚠️</div>
                        <h3 className="font-bold text-2xl text-amber-300 mb-2">Already Answered!</h3>
                        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 mb-3">
                          <p className="text-amber-200 font-semibold mb-2">✓ Your answer is correct, but no rewards given.</p>
                          <p className="text-amber-100/80 text-sm">You've already earned rewards for this question before.</p>
                        </div>
                        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/30 rounded-xl p-4">
                          <p className="text-cyan-300 font-bold mb-2">💡 Want to earn more rewards?</p>
                          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{answerResponse.explanation}</p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="text-7xl mb-3 animate-pulse filter drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">✗</div>
                    <h3 className="font-bold text-2xl text-red-300 mb-2">Incorrect</h3>
                    <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4">
                      <p className="text-gray-200 leading-relaxed">{answerResponse.explanation}</p>
                    </div>
                  </div>
                )}
                {nextAction && (
                  <button
                    onClick={nextAction}
                    className="mt-6 px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 border border-cyan-400/30"
                  >
                    {nextActionLabel || 'Continue'} →
                  </button>
                )}
            </div>
        )}
      </div>
    );
  };
  
  const renderAssignmentBlocker = () => {
    if (!activeAssignment) return null;
    
    // Check if assignment is late
    const isLate = (activeAssignment as any).isLate || (() => {
      if (!activeAssignment.due_at) return false;
      const dueTimestamp = new Date(activeAssignment.due_at).getTime();
      return Number.isFinite(dueTimestamp) && dueTimestamp < Date.now();
    })();
    
    return (
      <div className="max-w-3xl mx-auto">
        {/* Assignment Mode Header */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-purple-400/50 shadow-lg mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-5xl">🎯</div>
            <div className="flex-1">
              <h2 className="font-heading text-2xl text-purple-300">Priority Assignment</h2>
              <p className="text-purple-200 text-sm font-semibold">(Required)</p>
            </div>
          </div>
          
          <div className="bg-slate-900/60 rounded-xl p-4 border border-purple-500/30 mb-4">
            <p className="text-gray-200 leading-relaxed">
              <span className="text-amber-400 font-semibold">Priority assignments are ready.</span> You can complete one now or jump into quests and return later.
            </p>
          </div>
          
          {isLate && (
            <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 mb-4">
              <p className="text-amber-300 font-semibold">⏰ This assignment is past due!</p>
              <p className="text-amber-200 text-sm">You can still complete it, but it will be marked as late.</p>
            </div>
          )}
        </div>

        {pendingAssignments.length > 1 && (
          <div className="card-glass p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-lg text-cyan-200">Choose your next assignment</h3>
              <span className="text-xs uppercase tracking-wide text-slate-400">{pendingAssignments.length} pending</span>
            </div>
            <div className="space-y-3">
              {pendingAssignments.map((assignment) => {
                const isSelected = assignment.assignment_id === activeAssignment.assignment_id;
                return (
                  <button
                    key={assignment.assignment_id}
                    type="button"
                    onClick={() => handleSelectAssignment(assignment)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_18px_rgba(34,211,238,0.15)]'
                        : 'border-slate-700/60 bg-slate-900/40 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {assignment.title || assignment.subject_name}
                          {isSelected && <span className="ml-2 text-xs text-cyan-300">(Selected)</span>}
                        </p>
                        <p className="text-xs text-slate-400">{assignment.subject_name} · {assignment.topic_name}</p>
                      </div>
                      <div className="text-xs text-slate-300 text-right">
                        <p>{assignment.questions?.length || 0} questions</p>
                        <p>Due {assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'anytime'}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Assignment Details Card */}
        <div className="card-glass p-6">
          <h3 className="font-heading text-xl text-white mb-4">{activeAssignment.title || 'Untitled Assignment'}</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div className="card-glass p-3 border border-purple-500/30">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Teacher</p>
              <p className="text-white font-semibold">{activeAssignment.teacher_username}</p>
            </div>
            <div className="card-glass p-3 border border-purple-500/30">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Subject</p>
              <p className="text-white font-semibold">{activeAssignment.subject_name}</p>
            </div>
            <div className="card-glass p-3 border border-purple-500/30">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Questions</p>
              <p className="text-white font-semibold">{activeAssignment.questions?.length || 0}</p>
            </div>
            <div className={`card-glass p-3 border ${isLate ? 'border-amber-500/50 bg-amber-500/10' : 'border-purple-500/30'}`}>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Due</p>
              <p className={`font-semibold ${isLate ? 'text-amber-400' : 'text-white'}`}>
                {activeAssignment.due_at ? new Date(activeAssignment.due_at).toLocaleString() : 'No deadline'}
                {isLate && ' (LATE)'}
              </p>
            </div>
          </div>
          
          {activeAssignment.description && (
            <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-lg p-5 mb-6 border border-blue-400/40">
              <p className="text-blue-300 text-xs uppercase tracking-wide font-semibold mb-2">📚 About This Assignment</p>
              <p className="text-gray-100 leading-relaxed">{activeAssignment.description}</p>
            </div>
          )}
          
          {activeAssignment.instructions && (
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-gray-600/30">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Instructions</p>
              <p className="text-gray-200">{activeAssignment.instructions}</p>
            </div>
          )}
          
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={handleAssignmentBegin}
              className={`w-full px-6 py-4 rounded-xl text-white font-heading text-lg hover:scale-[1.02] transition-all shadow-lg ${
                isLate
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400'
              }`}
            >
              {isLate ? '⏰ Complete Late Assignment' : '▶️ Start Assignment'}
            </button>
            <button
              onClick={handleDeferAssignment}
              className="w-full px-6 py-4 rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 font-heading text-lg transition-all hover:border-cyan-300/70 hover:bg-cyan-500/20"
            >
              🧭 Play quests for now
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCompleted = () => {
    const totalQuestions = mode === 'practice' ? questions.length : teacherQuestions.length;
    const missionTotal = missionSummary?.missionScore ?? Math.round(calculateMissionScore(questionScores));
    const accuracyPercent = missionSummary
      ? Math.round(missionSummary.accuracy * 100)
      : questionPerformances.length
        ? Math.round((questionPerformances.filter((item) => item.wasCorrect).length / questionPerformances.length) * 100)
        : 0;
    const fallbackTimeRatio = (() => {
      if (!questionPerformances.length) {
        return 0;
      }
      const totalTime = questionPerformances.reduce((sum, item) => sum + item.answerTimeSeconds, 0);
      const totalLimit = questionPerformances.reduce((sum, item) => sum + item.timeLimitSeconds, 0);
      if (totalLimit <= 0) {
        return 0;
      }
      return totalTime / totalLimit;
    })();
    const timeRatio = missionSummary?.avgTimeRatio ?? fallbackTimeRatio;
    const avgTimePercent = Math.round(Math.min(Math.max(timeRatio, 0), 2) * 100);
    const statusLabelMap: Record<TopicSummary['status'], string> = {
      CRUSHED: 'Crushed',
      AVERAGE: 'Holding Steady',
      STRUGGLED: 'Needs Work',
    };
    const topicStatusRaw = topicSummary?.status ?? 'AVERAGE';
    const topicStatus = statusLabelMap[topicStatusRaw] ?? topicStatusRaw;
    const unlockNote = topicSummary
      ? topicSummary.canUnlockNextTopic
        ? '✅ Next topic unlocked'
        : 'Keep pushing to unlock the next topic'
      : 'Run more missions to unlock new branches';

    const assignmentContext = mode === 'assignment' ? (activeAssignment || lastCompletedAssignment) : lastCompletedAssignment;
    const isAssignmentRun = Boolean(mode === 'assignment' || assignmentContext);
    const isAssignmentSubmitting = mode === 'assignment' && assignmentSubmissionState === 'submitting';

    return (
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-heading text-4xl mb-4 animate-fade-in-up" style={{ color: 'var(--amber-warn)' }}>
          Quest Complete!
        </h2>
        <div className="card-glass glow-warn p-8 animate-fade-in-up" style={{ borderColor: 'rgba(255, 176, 32, 0.3)' }}>
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          <p className="text-lg mb-6">
            You answered <span className="font-bold text-white">{score.correct}</span> out of{' '}
            <span className="font-bold text-white">{totalQuestions}</span> questions correctly.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="card-glass p-4 border border-cyan-500/30">
              <p className="text-xs uppercase tracking-widest text-gray-400">Mission Score</p>
              <p className="font-heading text-2xl text-white mt-1">{missionTotal}</p>
            </div>
            <div className="card-glass p-4 border border-cyan-500/30">
              <p className="text-xs uppercase tracking-widest text-gray-400">Accuracy</p>
              <p className="font-heading text-2xl text-white mt-1">{accuracyPercent}%</p>
            </div>
            <div className="card-glass p-4 border border-cyan-500/30">
              <p className="text-xs uppercase tracking-widest text-gray-400">Avg Time Used</p>
              <p className="font-heading text-2xl text-white mt-1">{avgTimePercent}%</p>
            </div>
            <div className="card-glass p-4 border border-cyan-500/30">
              <p className="text-xs uppercase tracking-widest text-gray-400">Current Classification</p>
              <p className="font-heading text-2xl text-white mt-1">{topicStatus}</p>
              <p className="text-xs text-gray-300 mt-2">{unlockNote}</p>
              {topicSummary ? (
                <p className="text-xs text-gray-400 mt-1">
                  Missions cleared: {topicSummary.missionsCompleted} · Avg accuracy {(topicSummary.accuracy * 100).toFixed(0)}%
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">First mission logged for this topic</p>
              )}
            </div>
          </div>
          <div className="text-2xl font-heading space-y-2 mb-6">
            <p>
              XP Gained: <span style={{ color: 'var(--ion-blue)' }}>{score.xp >= 0 ? `+${score.xp}` : score.xp}</span>
            </p>
            <p>
              Coins Earned: <span style={{ color: 'var(--amber-warn)' }}>{score.coins >= 0 ? `+${score.coins}` : score.coins}</span>
            </p>
            <p>
              Gemstones Found:{' '}
              <span style={{ color: 'var(--plasma-pink)' }}>{score.gemstones >= 0 ? `+${score.gemstones}` : score.gemstones}</span>
            </p>
          </div>
          {isAssignmentRun && assignmentContext && (
            <div className="card-glass p-4 border border-purple-500/40 text-left text-sm text-gray-200 mb-6">
              <p><span className="text-gray-400">Assigned by:</span> {assignmentContext.teacher_username}</p>
              <p><span className="text-gray-400">Subject:</span> {assignmentContext.subject_name} · {assignmentContext.topic_name}</p>
              <p><span className="text-gray-400">Due:</span> {assignmentContext.due_at ? new Date(assignmentContext.due_at).toLocaleString() : 'No deadline'}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <button
              disabled={isAssignmentSubmitting}
              onClick={() => {
                if (mode === 'assignment' || assignmentContext) {
                  setMode('practice');
                  setSelectedSubject(null);
                  setSelectedTopic(null);
                  setQuestions([]);
                  setTeacherQuestions([]);
                  setCurrentQuestionIndex(0);
                  setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
                  setQuestionScores([]);
                  setQuestionPerformances([]);
                  setSoloStreak(0);
                  setMissionSummary(null);
                  setTopicSummary(null);
                  setQuestionStartTime(null);
                  setAssignmentStartTime(null);
                  loadSubjects();
                  setLastCompletedAssignment(null);
                  setAssignmentSubmissionState('idle');
                  hydrateAssignment({ showLoading: true });
                } else {
                  setStage('subject_selection');
                  setSelectedSubject(null);
                  setSelectedTopic(null);
                  setQuestions([]);
                  setTeacherQuestions([]);
                  setCurrentQuestionIndex(0);
                  setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
                  setQuestionScores([]);
                  setQuestionPerformances([]);
                  setSoloStreak(0);
                  setMissionSummary(null);
                  setTopicSummary(null);
                  setQuestionStartTime(null);
                  // Reload subjects to refresh progress counts after answering questions
                  loadSubjects();
                }
              }}
              className={`px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg ${isAssignmentSubmitting ? 'opacity-60 cursor-not-allowed bg-gray-600 text-gray-300' : 'gradient-cyan hover:scale-105 active:scale-95 animate-pulse-glow'}`}
            >
              {isAssignmentSubmitting ? 'Submitting...' : '🎯 Next Quest'}
            </button>
            <button
              onClick={onComplete}
              className="px-8 py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 hover:scale-105 active:scale-95 transition-all shadow-lg"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="flex justify-center mt-20"><img src="/BRAINS.svg" alt="Loading..." className="w-32 h-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} /></div>;
      case 'subject_selection': return renderSubjectSelection();
      case 'unified_subject_play': {
        if (!selectedSubject) return null;
        const progress = subjectProgress.find(p => p.id === selectedSubject.id);
        if (!progress) return null;
        return (
          <UnifiedSubjectPlay
            subject={progress}
            teacherQuests={teacherQuests}
            onSelectDifficulty={handleDifficultySelect}
            onSelectQuest={handleQuestSelect}
            onBack={() => {
              setSelectedSubject(null);
              setTeacherQuests([]);
              setStage('subject_selection');
            }}
          />
        );
      }
      case 'in_progress': return renderInProgress();
      case 'completed': return renderCompleted();
      case 'assignment_blocked': return renderAssignmentBlocker();
      default: return null;
    }
  }

  return (
    <div className="mt-6">
      <BackButton onClick={onComplete} />
      {renderContent()}
    </div>
  );
};

export default QuestView;
