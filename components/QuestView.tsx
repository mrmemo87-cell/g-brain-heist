import React, { useState, useEffect, useRef } from 'react';
import { SubjectData, Question, AnswerResponse, TeacherQuestion, QuestionAttemptResult } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import { BrainIcon, CoinIcon, XPIcon } from './icons';
import BackButton from './BackButton';
import { createPortal } from 'react-dom';

type QuestStage = 'loading' | 'mode_selection' | 'subject_selection' | 'in_progress' | 'completed';
type QuestMode = 'practice' | 'teacher';

interface RewardParticleProps {
    id: string;
    type: 'xp' | 'coin';
    startRect: DOMRect;
    onComplete: (id: string) => void;
}

const RewardParticle: React.FC<RewardParticleProps> = ({ id, type, startRect, onComplete }) => {
    const elRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = elRef.current;
        if (!el) return;

        const destination = document.getElementById(type === 'xp' ? 'xp-hud' : 'coin-hud');
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
    
    const iconColor = type === 'xp' ? 'var(--ion-blue)' : 'var(--amber-warn)';

    return (
        <div ref={elRef} style={style}>
           <div className="w-6 h-6" style={{ color: iconColor, filter: `drop-shadow(0 0 5px ${iconColor})` }}>
                {type === 'xp' ? <XPIcon /> : <CoinIcon />}
            </div>
        </div>
    );
};


interface QuestViewProps {
  onComplete: () => void;
  onGrantReward: (deltas: { xp: number; coins: number }) => void;
}

const QuestView: React.FC<QuestViewProps> = ({ onComplete, onGrantReward }) => {
  const [stage, setStage] = useState<QuestStage>('mode_selection');
  const [mode, setMode] = useState<QuestMode>('practice');
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teacherQuestions, setTeacherQuestions] = useState<TeacherQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerResponse, setAnswerResponse] = useState<AnswerResponse | null>(null);
  const [score, setScore] = useState({ correct: 0, xp: 0, coins: 0 });
  const [particles, setParticles] = useState<Omit<RewardParticleProps, 'onComplete'>[]>([]);

  const answerFeedbackRef = useRef<HTMLDivElement>(null);

  // Don't auto-load anymore - wait for mode selection
  const handleModeSelect = (selectedMode: QuestMode) => {
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

  const handleSubjectSelect = (subject: SubjectData) => {
    setSelectedSubject(subject);
    setStage('loading');
    
    if (mode === 'practice') {
      // Load regular practice questions
      GameService.mcq_questions_get(subject.id, 5).then(data => {
        setQuestions(data);
        setCurrentQuestionIndex(0);
        setScore({ correct: 0, xp: 0, coins: 0 });
        setSelectedOption(null);
        setAnswerResponse(null);
        setStage('in_progress');
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
        setScore({ correct: 0, xp: 0, coins: 0 });
        setSelectedOption(null);
        setAnswerResponse(null);
        setStage('in_progress');
      }).catch(err => {
        console.error('Error loading teacher questions:', err);
        alert('Failed to load teacher questions');
        setStage('subject_selection');
      });
    }
  };

  const handleAnswerSubmit = async (option: string) => {
    if (answerResponse) return;

    setSelectedOption(option);

    if (mode === 'practice') {
      // Practice mode: Optimistic immediate feedback
      const localIsCorrect = option === questions[currentQuestionIndex].options[1];
      const localResponse: AnswerResponse = {
        correct: localIsCorrect,
        deltas: {
          xp: localIsCorrect ? questions[currentQuestionIndex].reward_xp : -5,
          coins: localIsCorrect ? questions[currentQuestionIndex].reward_coins : 0,
        },
        explanation: localIsCorrect ? 'Well done, agent!' : 'Incorrect. The correct answer was B.'
      };

      setAnswerResponse(localResponse);

      // Play sound effect immediately
      if (localResponse.correct) {
        audioService.play('correct');
      } else {
        audioService.play('wrong');
      }

      // Grant reward optimistically
      onGrantReward(localResponse.deltas);

      // Trigger particles using the feedback anchor (if correct)
      if (localResponse.correct && answerFeedbackRef.current) {
        audioService.play('collect');
        const startRect = answerFeedbackRef.current.getBoundingClientRect();
        const newParticles: Omit<RewardParticleProps, 'onComplete'>[] = [];
        for (let i = 0; i < 5; i++) {
          if (localResponse.deltas.xp > 0) newParticles.push({ id: `xp_${Date.now()}_${i}`, type: 'xp', startRect });
          if (localResponse.deltas.coins > 0) newParticles.push({ id: `coin_${Date.now()}_${i}`, type: 'coin', startRect });
        }
        setParticles(current => [...current, ...newParticles]);
      }

      // Update score optimistically
      setScore(prev => ({
        correct: prev.correct + (localResponse.correct ? 1 : 0),
        xp: prev.xp + localResponse.deltas.xp,
        coins: prev.coins + localResponse.deltas.coins,
      }));

      // Scroll feedback into view
      setTimeout(() => {
        if (answerFeedbackRef.current) {
          answerFeedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);

      // Fire the real request but don't block the UI
      GameService.mcq_answer_submit(questions[currentQuestionIndex].id, option)
        .then((response) => {
          if (response.correct !== localResponse.correct || response.deltas.xp !== localResponse.deltas.xp || response.deltas.coins !== localResponse.deltas.coins) {
            setScore(prev => ({
              correct: prev.correct - (localResponse.correct ? 1 : 0) + (response.correct ? 1 : 0),
              xp: prev.xp - localResponse.deltas.xp + response.deltas.xp,
              coins: prev.coins - localResponse.deltas.coins + response.deltas.coins,
            }));
            setAnswerResponse(response);
          }
        })
        .catch(err => {
          console.warn('mcq answer reconcile failed:', err);
        });

      // Auto-advance
      setTimeout(() => {
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedOption(null);
          setAnswerResponse(null);
        } else {
          audioService.play('tada');
          setStage('completed');
        }
      }, 700);
    } else {
      // Teacher mode: Submit to server and wait for grading
      const currentQuestion = teacherQuestions[currentQuestionIndex];
      
      try {
        const result = await GameService.submit_question_answer(
          currentQuestion.id,
          option,
          undefined, // time_taken
          undefined  // quest_session_id
        );

        const response: AnswerResponse = {
          correct: result.is_correct,
          deltas: {
            xp: result.points_earned,
            coins: result.is_correct ? Math.floor(result.points_earned / 2) : 0,
          },
          explanation: result.is_correct 
            ? currentQuestion.explanation || 'Correct!' 
            : `Incorrect. ${currentQuestion.explanation || 'The correct answer was ' + currentQuestion.correct_answer}`
        };

        setAnswerResponse(response);

        // Play sound effect
        if (response.correct) {
          audioService.play('correct');
        } else {
          audioService.play('wrong');
        }

        // Grant reward
        onGrantReward(response.deltas);

        // Trigger particles
        if (response.correct && answerFeedbackRef.current) {
          audioService.play('collect');
          const startRect = answerFeedbackRef.current.getBoundingClientRect();
          const newParticles: Omit<RewardParticleProps, 'onComplete'>[] = [];
          for (let i = 0; i < 5; i++) {
            if (response.deltas.xp > 0) newParticles.push({ id: `xp_${Date.now()}_${i}`, type: 'xp', startRect });
            if (response.deltas.coins > 0) newParticles.push({ id: `coin_${Date.now()}_${i}`, type: 'coin', startRect });
          }
          setParticles(current => [...current, ...newParticles]);
        }

        // Update score
        setScore(prev => ({
          correct: prev.correct + (response.correct ? 1 : 0),
          xp: prev.xp + response.deltas.xp,
          coins: prev.coins + response.deltas.coins,
        }));

        // Scroll feedback into view
        setTimeout(() => {
          if (answerFeedbackRef.current) {
            answerFeedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 80);

        // Auto-advance
        setTimeout(() => {
          if (currentQuestionIndex < teacherQuestions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedOption(null);
            setAnswerResponse(null);
          } else {
            audioService.play('tada');
            setStage('completed');
          }
        }, 1500); // Slightly longer for teacher mode to read explanation
      } catch (err) {
        console.error('Error submitting teacher answer:', err);
        alert('Failed to submit answer. Please try again.');
        setSelectedOption(null);
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
    
    if (!question && !teacherQuestion) return null;

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

    const questionText = mode === 'practice' ? question!.body : teacherQuestion!.question_text;
    const options = mode === 'practice' ? question!.options : teacherQuestion!.options;
    const correctAnswer = mode === 'practice' ? question!.options[1] : teacherQuestion!.correct_answer;
    const totalQuestions = mode === 'practice' ? questions.length : teacherQuestions.length;

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
        </div>
        <div className="card-glass p-6 mb-6">
            <p className="text-xl text-gray-200">{questionText}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {options.map((option, index) => (
            <button
              key={index}
              disabled={!!answerResponse}
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

  const renderCompleted = () => {
    const totalQuestions = mode === 'practice' ? questions.length : teacherQuestions.length;
    
    return (
    <div className="text-center max-w-lg mx-auto">
        <h2 className="font-heading text-4xl mb-4 animate-fade-in-up" style={{color: 'var(--amber-warn)'}}>Quest Complete!</h2>
        <div className="card-glass glow-warn p-8 animate-fade-in-up" style={{borderColor: 'rgba(255, 176, 32, 0.3)'}}>
            <div className="text-6xl mb-4 animate-bounce">🎉</div>
            <p className="text-lg mb-6">You answered <span className="font-bold text-white">{score.correct}</span> out of <span className="font-bold text-white">{totalQuestions}</span> questions correctly.</p>
            <div className="text-2xl font-heading space-y-2 mb-6">
                <p>XP Gained: <span style={{color: 'var(--ion-blue)'}}>{score.xp >= 0 ? `+${score.xp}` : score.xp}</span></p>
                <p>Coins Earned: <span style={{color: 'var(--amber-warn)'}}>{score.coins >= 0 ? `+${score.coins}`: score.coins}</span></p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                <button 
                    onClick={() => {
                        setStage('subject_selection');
                        setSelectedSubject(null);
                        setQuestions([]);
                        setTeacherQuestions([]);
                        setCurrentQuestionIndex(0);
                        setScore({ correct: 0, xp: 0, coins: 0 });
                    }}
                    className="px-8 py-4 rounded-lg font-bold text-lg gradient-cyan hover:scale-105 active:scale-95 transition-all shadow-lg animate-pulse-glow"
                >
                    🎯 Next Quest
                </button>
                <button 
                    onClick={() => {
                        onGrantReward({ xp: score.xp, coins: score.coins });
                        onComplete();
                    }}
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