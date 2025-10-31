import React, { useState, useEffect, useRef } from 'react';
import { Subject, Question, AnswerResponse } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import { BrainIcon, CoinIcon, XPIcon } from './icons';
import BackButton from './BackButton';
import { createPortal } from 'react-dom';
import LottieAnimation from './LottieAnimation';

type QuestStage = 'loading' | 'subject_selection' | 'in_progress' | 'completed';

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
  const [stage, setStage] = useState<QuestStage>('loading');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerResponse, setAnswerResponse] = useState<AnswerResponse | null>(null);
  const [score, setScore] = useState({ correct: 0, xp: 0, coins: 0 });
  const [particles, setParticles] = useState<Omit<RewardParticleProps, 'onComplete'>[]>([]);

  const answerFeedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    GameService.mcq_subjects_list().then(data => {
      setSubjects(data);
      setStage('subject_selection');
    });
  }, []);
  
  const handleParticleComplete = (id: string) => {
      setParticles(current => current.filter(p => p.id !== id));
  };

  const handleSubjectSelect = (subject: Subject) => {
    setSelectedSubject(subject);
    setStage('loading');
    GameService.mcq_questions_get(subject.id, 5).then(data => {
      setQuestions(data);
      setCurrentQuestionIndex(0);
      setScore({ correct: 0, xp: 0, coins: 0 });
      setSelectedOption(null);
      setAnswerResponse(null);
      setStage('in_progress');
    });
  };

  const handleAnswerSubmit = async (option: string) => {
    if (answerResponse) return;

    setSelectedOption(option);
    const response = await GameService.mcq_answer_submit(questions[currentQuestionIndex].id, option);
    setAnswerResponse(response);
    
    // Play sound effect based on answer
    if (response.correct) {
      audioService.play('correct');
    } else {
      audioService.play('wrong');
    }
    
    onGrantReward(response.deltas);

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

    setScore(prev => ({
        correct: prev.correct + (response.correct ? 1 : 0),
        xp: prev.xp + response.deltas.xp,
        coins: prev.coins + response.deltas.coins,
    }));

    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedOption(null);
        setAnswerResponse(null);
      } else {
        audioService.play('tada');
        setStage('completed');
      }
    }, 2000);
  };

  const renderSubjectSelection = () => (
    <div>
      <h2 className="font-heading text-3xl text-center mb-8" style={{color: 'var(--ion-blue)'}}>Select a Subject</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {subjects.map(subject => (
          <button 
            key={subject.id} 
            onClick={() => handleSubjectSelect(subject)}
            className="card-glass glow-ion p-6 text-center transform hover:scale-105 hover:border-cyan-400 transition-all duration-300"
            style={{ borderColor: 'rgba(0, 208, 232, 0.4)' }}
          >
            <div className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--ion-blue)'}}><BrainIcon /></div>
            <h3 className="font-heading text-xl mb-2">{subject.name}</h3>
            <p style={{color: 'var(--mist-400)'}}>Difficulty: {'*'.repeat(subject.difficulty)}</p>
          </button>
        ))}
      </div>
       <div className="text-center mt-8">
            <button onClick={onComplete} className="text-gray-400 hover:text-white transition-colors">Cancel</button>
        </div>
    </div>
  );

  const renderInProgress = () => {
    const question = questions[currentQuestionIndex];
    if (!question) return null;

    const getOptionClasses = (option: string) => {
        const baseClass = 'p-4 rounded-2xl border text-left transition-colors duration-300 disabled:cursor-not-allowed';
        if (!answerResponse) {
            return `${baseClass} bg-black/20 hover:bg-black/40 border-gray-600`;
        }
        const isCorrectChoice = option === question.options[1]; // MOCK
        const isUserSelection = option === selectedOption;

        if (isCorrectChoice) {
            return `${baseClass} bg-green-500/20 border-green-400 animate-pulse`;
        }
        if (isUserSelection && !answerResponse.correct) {
            return `${baseClass} bg-red-500/20 border-red-400`;
        }
        return `${baseClass} bg-black/10 border-gray-700 opacity-50`;
    };

    return (
      <div className="max-w-3xl mx-auto">
        {createPortal(
            particles.map(p => <RewardParticle key={p.id} {...p} onComplete={handleParticleComplete} />),
            document.body
        )}
        <div className="text-center mb-4">
          <p className="font-mono" style={{color: 'var(--mist-400)'}}>Question {currentQuestionIndex + 1} / {questions.length}</p>
          <h2 className="font-heading text-2xl mt-2" style={{color: 'var(--ion-blue)'}}>{selectedSubject?.name}</h2>
        </div>
        <div className="card-glass p-6 mb-6">
            <p className="text-xl text-gray-200">{question.body}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {question.options.map((option, index) => (
            <button
              key={index}
              disabled={!!answerResponse}
              onClick={() => handleAnswerSubmit(option)}
              className={getOptionClasses(option)}
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
                    <LottieAnimation 
                      url="/animations/success.json"
                      width={120}
                      height={120}
                      loop={false}
                    />
                    <h3 className="font-bold text-lg text-green-400">Correct!</h3>
                    <p className="text-gray-200">{answerResponse.explanation}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <LottieAnimation 
                      url="/animations/error.json"
                      width={120}
                      height={120}
                      loop={false}
                    />
                    <h3 className="font-bold text-lg text-red-400">Incorrect!</h3>
                    <p className="text-gray-200">{answerResponse.explanation}</p>
                  </div>
                )}
            </div>
        )}
      </div>
    );
  };
  
  const renderCompleted = () => (
    <div className="text-center max-w-lg mx-auto">
        <h2 className="font-heading text-4xl mb-4" style={{color: 'var(--amber-warn)'}}>Quest Complete!</h2>
        <div className="card-glass glow-warn p-8" style={{borderColor: 'rgba(255, 176, 32, 0.3)'}}>
            <p className="text-lg mb-6">You answered <span className="font-bold text-white">{score.correct}</span> out of <span className="font-bold text-white">{questions.length}</span> questions correctly.</p>
            <div className="text-2xl font-heading space-y-2">
                <p>XP Gained: <span style={{color: 'var(--ion-blue)'}}>{score.xp >= 0 ? `+${score.xp}` : score.xp}</span></p>
                <p>Coins Earned: <span style={{color: 'var(--amber-warn)'}}>{score.coins >= 0 ? `+${score.coins}`: score.coins}</span></p>
            </div>
        </div>
    </div>
  );

  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--ion-blue)'}}>Loading...</div>;
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