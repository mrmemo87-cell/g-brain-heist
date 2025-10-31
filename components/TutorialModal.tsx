import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

interface TutorialStep {
  title: string;
  description: string;
  action: string;
  icon: string;
}

interface TutorialModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to G-Brain Heist!',
    description: 'Complete quests to earn XP and level up your hacker skills. Each quest tests your knowledge and rewards you with coins.',
    action: 'Try completing a quest from the main dashboard',
    icon: '📚',
  },
  {
    title: 'Upgrade Your Arsenal',
    description: 'Visit the shop to buy powerful items like encryption keys, shields, and exploit kits. These items give you an edge in battles.',
    action: 'Purchase an item from the shop',
    icon: '🛒',
  },
  {
    title: 'Challenge Your Rivals',
    description: 'Test your skills in PvP battles! Hack rivals to steal their coins. Use shields to defend and exploit kits to attack.',
    action: 'Try a PvP attack (requires 5 AP)',
    icon: '⚔️',
  },
  {
    title: "You're Ready!",
    description: 'Join a clan, complete daily tasks, unlock achievements, and climb the leaderboards. Good luck, hacker!',
    action: 'Start your journey',
    icon: '🚀',
  },
];

const TutorialModal: React.FC<TutorialModalProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setFadeIn(false);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
      }, 200);
    } else {
      completeTutorial();
    }
  };

  const handleSkip = async () => {
    await completeTutorial();
    onSkip();
  };

  const completeTutorial = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({ tutorial_completed: true })
        .eq('id', user.id);
    }
    onComplete();
  };

  const step = TUTORIAL_STEPS[currentStep];
  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div 
        className={`card-glass max-w-2xl w-full mx-4 p-8 transition-all duration-300 ${
          fadeIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Tutorial Progress</span>
            <span>Step {currentStep + 1} of {TUTORIAL_STEPS.length}</span>
          </div>
          <div className="h-2 bg-black/50 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Icon */}
        <div className="text-center mb-4">
          <div className="text-7xl mb-4 animate-bounce">{step.icon}</div>
          <h2 className="font-heading text-3xl mb-2" style={{ color: 'var(--amber-warn)' }}>
            {step.title}
          </h2>
        </div>

        {/* Description */}
        <p className="text-center text-gray-300 text-lg mb-6 leading-relaxed">
          {step.description}
        </p>

        {/* Action */}
        <div className="card-glass bg-cyan-500/10 border border-cyan-500/30 p-4 mb-6">
          <p className="text-cyan-300 font-semibold text-center">
            <span className="mr-2">👉</span>
            {step.action}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          {currentStep === 0 && (
            <button
              onClick={handleSkip}
              className="flex-1 px-6 py-3 rounded-lg bg-black/30 hover:bg-black/50 text-gray-400 hover:text-white transition-all font-heading"
            >
              Skip Tutorial
            </button>
          )}
          <button
            onClick={handleNext}
            className={`px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-heading transition-all ${
              currentStep === 0 ? 'flex-1' : 'w-full'
            }`}
          >
            {currentStep < TUTORIAL_STEPS.length - 1 ? 'Next' : "Let's Go!"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
