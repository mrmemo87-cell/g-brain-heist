import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Profile } from '../types';

interface TutorialStep {
  title: string;
  description: string;
  action: string;
  icon: string;
}

interface TutorialModalProps {
  onComplete: () => void;
  onSkip: () => void;
  profile?: Profile | null;
}

const buildTutorialSteps = (profile?: Profile | null): TutorialStep[] => {
  const displayName = profile?.full_name ?? profile?.username ?? 'there';
  const schoolName = profile?.school_name ?? 'your school';
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';

  if (isTeacher) {
    return [
      {
        title: `Welcome, ${displayName}!`,
        description: `Thanks for joining ${schoolName}. Your educator workspace is ready to go — let’s set you up for an amazing first day.`,
        action: 'Head to the educator dashboard to explore your tools',
        icon: '🍎',
      },
      {
        title: 'Build your first assignment',
        description: 'Use the Question Bank to craft curriculum-aligned quizzes and instantly assign them to your classes.',
        action: 'Open Question Bank and draft an assignment',
        icon: '📝',
      },
      {
        title: 'See student progress in real time',
        description: 'Review responses, spot learning gaps fast, and celebrate wins with your students.',
        action: 'Check Reports or My Responses for early insights',
        icon: '📊',
      },
      {
        title: 'Grow your classroom',
        description: 'Invite students, organize groups, and keep everything in one focused hub built for teachers.',
        action: 'Add a class or share your invite code',
        icon: '🤝',
      },
    ];
  }

  return [
    {
      title: `Welcome, ${displayName}!`,
      description: `We’re excited to have you at ${schoolName}. Your learning journey starts now — we’ll help you rack up wins fast.`,
      action: 'Start on the main dashboard and pick a quest',
      icon: '🎒',
    },
    {
      title: 'Complete your first quest',
      description: 'Quests boost your XP and help you level up. Each one is built to sharpen your skills.',
      action: 'Finish a quest from the dashboard',
      icon: '📚',
    },
    {
      title: 'Stay on top of assignments',
      description: 'Check your assignments tab to see what your teacher has queued up for you.',
      action: 'Open Assignments to view what’s due',
      icon: '✅',
    },
    {
      title: 'Track your growth',
      description: 'Watch your streak, XP, and achievements climb as you keep showing up.',
      action: 'Visit your profile to see your progress',
      icon: '🚀',
    },
  ];
};

const TutorialModal: React.FC<TutorialModalProps> = ({ onComplete, onSkip, profile }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const tutorialSteps = useMemo(() => buildTutorialSteps(profile), [profile]);

  useEffect(() => {
    setFadeIn(true);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
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

  const step = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

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
            <span>Step {currentStep + 1} of {tutorialSteps.length}</span>
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
            {currentStep < tutorialSteps.length - 1 ? 'Next' : "Let's Go!"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
