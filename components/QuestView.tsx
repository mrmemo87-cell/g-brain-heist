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
} from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import { BrainIcon, CoinIcon, GemIcon, XPIcon } from './icons';
import BackButton from './BackButton';
import { createPortal } from 'react-dom';
import {
  calculateSoloQuestionScore,
  SoloQuestionScoreBreakdown,
  calculateMissionScore,
  buildMissionSummary,
  normalizeDifficulty,
} from '../src/lib/brains_heist/scoring';
import { getMilestoneReward } from '../src/lib/brains_heist/rewards';
import { recordSoloQuestion, recordMissionSummary } from '../services/adaptiveService';

type QuestStage = 'loading' | 'mode_selection' | 'subject_selection' | 'in_progress' | 'completed' | 'assignment_blocked';
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
  onGrantReward: (deltas: { xp: number; coins: number; gemstones?: number }) => void;
}

const QuestView: React.FC<QuestViewProps> = ({ onComplete, onGrantReward }) => {
  const [stage, setStage] = useState<QuestStage>('loading');
  const [mode, setMode] = useState<QuestMode>('practice');
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teacherQuestions, setTeacherQuestions] = useState<TeacherQuestion[]>([]);
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
  const [lastCompletedAssignment, setLastCompletedAssignment] = useState<StudentAssignmentTask | null>(null);
  const [assignmentStartTime, setAssignmentStartTime] = useState<number | null>(null);
  const [assignmentSubmissionState, setAssignmentSubmissionState] = useState<'idle' | 'submitting' | 'submitted'>('idle');

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

  // Don't auto-load anymore - wait for mode selection
  const handleModeSelect = (selectedMode: QuestMode) => {
    if (activeAssignment) {
      setMode('assignment');
      setStage('assignment_blocked');
      return;
    }

    setMode(selectedMode);
    setStage('loading');
    
    if (selectedMode === 'practice') {
      // Load regular practice subjects
      GameService.mcq_subjects_list().then(data => {
        setSubjects(data);
        setStage('subject_selection');
      });
    } else {
      // Load teacher questions subjects
      setStage('subject_selection');
      setSubjects([
        { id: 'maths', name: 'Maths', difficulty: 1 },
        { id: 'science', name: 'Science', difficulty: 1 },
        { id: 'english', name: 'English', difficulty: 1 },
        { id: 'russian_language', name: 'Russian Language', difficulty: 1 },
        { id: 'kyrgyz_language', name: 'Kyrgyz Language', difficulty: 1 },
        { id: 'german_language', name: 'German Language', difficulty: 1 },
        { id: 'geography', name: 'Geography', difficulty: 1 },
        { id: 'global_perspective', name: 'Global Perspective', difficulty: 1 },
        { id: 'ict', name: 'ICT', difficulty: 1 }
      ]);
    }
  };
  
  const handleParticleComplete = (id: string) => {
      setParticles(current => current.filter(p => p.id !== id));
  };

  const hydrateAssignment = async (options: { showLoading?: boolean } = {}) => {
    const { showLoading = false } = options;
    if (showLoading) {
      setStage('loading');
    }
      try {
          const assignment = await GameService.get_student_active_assignment();
          if (assignment) {
              setActiveAssignment(assignment);
              setLastCompletedAssignment(null);
              setMode('assignment');
              setTeacherQuestions(assignment.questions);
              setSelectedSubject({ id: assignment.subject_id || assignment.subject_name, name: assignment.subject_name, difficulty: 1 });
              setStage('assignment_blocked');
              setCurrentQuestionIndex(0);
              setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
              setSelectedOption(null);
              setAnswerResponse(null);
              setQuestionScores([]);
              setQuestionPerformances([]);
              setMissionSummary(null);
              setTopicSummary(null);
              setAssignmentSubmissionState('idle');
              setAssignmentStartTime(null);
          } else {
              setActiveAssignment(null);
              setTeacherQuestions([]);
              setSelectedSubject(null);
              if (mode === 'assignment') {
                  setMode('practice');
              }
        setStage('mode_selection');
          }
      } catch (error) {
          console.error('Error loading assignment:', error);
      if (showLoading || stage === 'loading') {
        setStage('mode_selection');
      }
      }
  };

  const handleSubjectSelect = (subject: SubjectData) => {
    setSelectedSubject(subject);
    setStage('loading');
    setQuestionScores([]);
    setQuestionPerformances([]);
    setSoloStreak(0);
    setMissionSummary(null);
    setTopicSummary(null);
    setQuestionStartTime(null);
    
    if (mode === 'practice') {
      // Load regular practice questions
      GameService.mcq_questions_get(subject.id, 5).then(data => {
        setQuestions(data);
        setCurrentQuestionIndex(0);
            setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
        setSelectedOption(null);
        setAnswerResponse(null);
        setStage('in_progress');
        setQuestionStartTime(Date.now());
      });
    } else {
      // Load teacher questions for this subject
      GameService.get_public_questions(subject.name as any).then(data => {
        if (data.length === 0) {
          alert('No teacher questions available for this subject yet!');
          setStage('subject_selection');
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
      }).catch(err => {
        console.error('Error loading teacher questions:', err);
        alert('Failed to load teacher questions');
        setStage('subject_selection');
      });
    }
  };

  const handleAssignmentBegin = () => {
    if (!activeAssignment) return;
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
    hydrateAssignment({ showLoading: true });
  }, []);

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
        setAssignmentSubmissionState('submitted');
        setLastCompletedAssignment(activeAssignment);
        setActiveAssignment(null);
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

      onGrantReward(response.deltas);
      spawnParticles(response);

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

      if (isLastQuestion) {
        setTimeout(() => {
          finalizeMission(updatedScores, updatedPerformances, branchId, topicId);
          audioService.play('tada');
          setStage('completed');
        }, 1500);
      } else {
        setTimeout(() => {
          advanceFn();
          setSelectedOption(null);
          setAnswerResponse(null);
        }, 1500);
      }
    };

    if (mode === 'practice') {
      const currentQuestion = questions[currentQuestionIndex];
      if (!currentQuestion) {
        console.error('No question available for current index');
        setIsSubmitting(false);
        return;
      }

      try {
        const response = await GameService.mcq_answer_submit(currentQuestion, option);
        const telemetry = applyQuestionTelemetry(currentQuestion, response.correct, response);

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
        console.error('Error submitting answer:', error);
        alert('Failed to submit answer. Please try again.');
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

        const response: AnswerResponse = {
          correct: result.is_correct,
          deltas: {
            xp: result.points_earned,
            coins: result.is_correct ? Math.floor(result.points_earned / 2) : 0,
            gemstones: 0,
          },
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
        alert('Failed to submit answer. Please try again.');
        setSelectedOption(null);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const renderSubjectSelection = () => (
    <div>
      <h2 className="font-heading text-3xl text-center mb-8 animate-fade-in-up" style={{color: 'var(--ion-blue)'}}>Select a Subject</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {subjects.map(subject => (
          <button 
            key={subject.id} 
            onClick={() => handleSubjectSelect(subject)}
            className="card-glass glow-ion p-6 text-center transform hover:scale-105 hover:border-cyan-400 transition-all duration-300 animate-fade-in-up"
            style={{ borderColor: 'rgba(0, 208, 232, 0.4)' }}
          >
            <div className="w-16 h-16 mx-auto mb-4 animate-float" style={{ color: 'var(--ion-blue)'}}><BrainIcon /></div>
            <h3 className="font-heading text-xl mb-2">{subject.name}</h3>
            <p style={{color: 'var(--mist-400)'}}>Difficulty: {'⭐'.repeat(subject.difficulty)}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const renderInProgress = () => {
    const question = mode === 'practice' ? questions[currentQuestionIndex] : null;
    const teacherQuestion = mode === 'teacher' ? teacherQuestions[currentQuestionIndex] : null;
    const assignmentQuestion = mode === 'assignment' ? teacherQuestions[currentQuestionIndex] : null;

    if (!question && !teacherQuestion && !assignmentQuestion) return null;

    const getOptionClasses = (option: string, correctAnswer: string) => {
        const baseClass = 'p-4 rounded-2xl border text-left transition-colors duration-300 disabled:cursor-not-allowed';
        if (!answerResponse) {
            return `${baseClass} bg-black/20 hover:bg-black/40 border-gray-600`;
        }
        const isCorrectChoice = option === correctAnswer;
        const isUserSelection = option === selectedOption;

        if (isCorrectChoice) {
            return `${baseClass} bg-green-500/20 border-green-400 animate-pulse`;
        }
        if (isUserSelection && !answerResponse.correct) {
            return `${baseClass} bg-red-500/20 border-red-400`;
        }
        return `${baseClass} bg-black/10 border-gray-700 opacity-50`;
    };

    const activeTeacherQuestion = mode === 'assignment' ? assignmentQuestion : teacherQuestion;
    const questionText = mode === 'practice' ? question!.body : activeTeacherQuestion!.question_text;
    const options: string[] = mode === 'practice'
      ? question?.options ?? []
      : activeTeacherQuestion?.options ?? [];
    const correctAnswer = mode === 'practice'
      ? question!.correct_answer ?? ''
      : activeTeacherQuestion!.correct_answer ?? '';
    const totalQuestions = mode === 'practice' ? questions.length : teacherQuestions.length;
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
        </div>
        {mode === 'assignment' && assignmentDetails?.instructions && (
          <div className="card-glass p-4 mb-6 border border-purple-500/30 text-sm text-gray-200">
            {assignmentDetails.instructions}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {options.map((option, index) => (
            <button
              key={index}
              disabled={!!answerResponse || isSubmitting}
              onClick={() => handleAnswerSubmit(option)}
              className={getOptionClasses(option, correctAnswer)}
            >
              <span className="font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
              {option}
            </button>
          ))}
        </div>
        {answerResponse && (
            <div ref={answerFeedbackRef} className={`mt-6 p-4 rounded-2xl text-center border ${answerResponse.correct ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                {answerResponse.correct ? (
                  <div className="flex flex-col items-center">
                    <div className="text-6xl mb-2 animate-bounce">✓</div>
                    <h3 className="font-bold text-lg text-green-400">Correct!</h3>
                    <p className="text-gray-200">{answerResponse.explanation}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="text-6xl mb-2 animate-pulse">✗</div>
                    <h3 className="font-bold text-lg text-red-400">Incorrect!</h3>
                    <p className="text-gray-200">{answerResponse.explanation}</p>
                  </div>
                )}
            </div>
        )}
      </div>
    );
  };
  
  const renderModeSelection = () => (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-heading text-3xl text-center mb-4 animate-fade-in-up" style={{color: 'var(--ion-blue)'}}>Choose Your Path</h2>
      <p className="text-center text-gray-300 mb-8">Select a quest mode to begin your journey</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Practice Mode */}
        <button
          onClick={() => handleModeSelect('practice')}
          className="card-glass glow-ion p-8 text-center transform hover:scale-105 hover:border-cyan-400 transition-all duration-300 animate-fade-in-up group"
          style={{ borderColor: 'rgba(0, 208, 232, 0.4)' }}
        >
          <div className="w-20 h-20 mx-auto mb-4 animate-float" style={{ color: 'var(--ion-blue)'}}>
            <BrainIcon />
          </div>
          <h3 className="font-heading text-2xl mb-3">🎮 Practice Mode</h3>
          <p className="text-gray-300 mb-4">Challenge yourself with randomized questions to sharpen your skills</p>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400">Quick</span>
            <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400">Random</span>
          </div>
        </button>

        {/* Teacher Quests */}
        <button
          onClick={() => handleModeSelect('teacher')}
          className="card-glass glow-warn p-8 text-center transform hover:scale-105 hover:border-purple-400 transition-all duration-300 animate-fade-in-up group"
          style={{ borderColor: 'rgba(168, 85, 247, 0.4)' }}
        >
          <div className="text-6xl mb-4 animate-bounce">👨‍🏫</div>
          <h3 className="font-heading text-2xl mb-3" style={{color: 'var(--amber-warn)'}}>📚 Teacher Quests</h3>
          <p className="text-gray-300 mb-4">Take on curated questions created by expert teachers</p>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400">Curated</span>
            <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400">Expert</span>
          </div>
        </button>
      </div>
    </div>
  );

  const renderAssignmentBlocker = () => {
    if (!activeAssignment) return null;
    return (
      <div className="max-w-3xl mx-auto card-glass p-8 text-center">
        <div className="text-6xl mb-4">🚨</div>
        <h2 className="font-heading text-3xl text-white mb-3">Mandatory Assignment</h2>
        <p className="text-gray-300 mb-4">
          You have a compulsory assignment from <span className="text-white font-semibold">{activeAssignment.teacher_username}</span>.
          Complete it before continuing regular quests.
        </p>
        {activeAssignment.instructions && (
          <p className="text-gray-400 mb-4">{activeAssignment.instructions}</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
          <div className="card-glass p-4 border border-purple-500/30">
            <p className="text-gray-400">Subject</p>
            <p className="text-white font-semibold">{activeAssignment.subject_name}</p>
          </div>
          <div className="card-glass p-4 border border-purple-500/30">
            <p className="text-gray-400">Topic</p>
            <p className="text-white font-semibold">{activeAssignment.topic_name}</p>
          </div>
          <div className="card-glass p-4 border border-purple-500/30">
            <p className="text-gray-400">Assigned</p>
            <p className="text-white font-semibold">{new Date(activeAssignment.assigned_at).toLocaleString()}</p>
          </div>
          <div className="card-glass p-4 border border-purple-500/30">
            <p className="text-gray-400">Due</p>
            <p className="text-white font-semibold">{activeAssignment.due_at ? new Date(activeAssignment.due_at).toLocaleString() : 'No deadline'}</p>
          </div>
        </div>
        <button
          onClick={handleAssignmentBegin}
          className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-heading text-lg hover:scale-105 transition-all"
        >
          Begin Assignment
        </button>
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
                  setStage('mode_selection');
                  setSelectedSubject(null);
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
                  setLastCompletedAssignment(null);
                  setAssignmentSubmissionState('idle');
                  hydrateAssignment({ showLoading: true });
                } else {
                  setStage('subject_selection');
                  setSelectedSubject(null);
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
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--ion-blue)'}}>Loading...</div>;
      case 'mode_selection': return renderModeSelection();
      case 'subject_selection': return renderSubjectSelection();
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