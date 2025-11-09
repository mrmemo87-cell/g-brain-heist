import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AttemptSubmissionResult, PhaseQuestion, Profile, Grade } from '../../types';
import {
  fetchNextQuestion,
  submitAttempt,
} from '../../services/competitionService';

type Stage = 'loading' | 'question' | 'result' | 'empty';

type ChoiceState = {
  selected: number | null;
  isSubmitting: boolean;
  feedback: AttemptSubmissionResult | null;
};

interface Phase1PlayViewProps {
  profile: Profile;
  onExit: () => void;
  onProfileUpdate: (profile: Profile) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const optionLabels = ['A', 'B', 'C', 'D'];

const Phase1PlayView: React.FC<Phase1PlayViewProps> = ({
  profile,
  onExit,
  onProfileUpdate,
  addToast,
}) => {
  const [stage, setStage] = useState<Stage>('loading');
  const [question, setQuestion] = useState<PhaseQuestion | null>(null);
  const [choice, setChoice] = useState<ChoiceState>({ selected: null, isSubmitting: false, feedback: null });
  const [error, setError] = useState<string | null>(null);

  const grade: Grade | null = useMemo(() => {
    if (profile.grade === 8 || profile.grade === 9) {
      return profile.grade as Grade;
    }
    return null;
  }, [profile.grade]);

  const loadQuestion = useCallback(async () => {
    if (!grade) {
      setStage('empty');
      return;
    }

    setStage('loading');
    setError(null);
    setChoice({ selected: null, isSubmitting: false, feedback: null });

    try {
      const nextQuestion = await fetchNextQuestion(grade);
      if (!nextQuestion) {
        setStage('empty');
        setQuestion(null);
        return;
      }
      setQuestion(nextQuestion);
      setStage('question');
    } catch (err: any) {
      const message = err?.message || 'Failed to load question';
      setError(message);
      addToast(message, 'error');
      setStage('empty');
    }
  }, [grade, addToast]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (!question || choice.selected === null || choice.isSubmitting) {
      return;
    }

    setChoice((prev) => ({ ...prev, isSubmitting: true }));

    try {
      const feedback = await submitAttempt(question.id, choice.selected + 1);
      setChoice({ selected: choice.selected, isSubmitting: false, feedback });
      setStage('result');

      const updatedProfile: Profile = {
        ...profile,
        xp: feedback.profile_xp,
        coins: feedback.profile_coins,
        streak: feedback.profile_streak,
      };
      onProfileUpdate(updatedProfile);

      addToast(feedback.is_correct ? 'Correct answer! Great job, agent.' : 'Attempt recorded.', feedback.is_correct ? 'success' : 'info');
    } catch (err: any) {
      const message = err?.message || 'Failed to submit attempt';
      addToast(message, 'error');
      setChoice((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleNextQuestion = () => {
    setChoice({ selected: null, isSubmitting: false, feedback: null });
    loadQuestion();
  };

  if (profile.is_banned) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card-glass p-8 text-center">
          <h2 className="font-heading text-3xl mb-4" style={{ color: '#F87171' }}>
            Access Restricted
          </h2>
          <p className="text-gray-300">Your account has been temporarily disabled for the competition. Please speak with Mr. Sobbi.</p>
          <button
            onClick={onExit}
            className="mt-6 px-6 py-3 rounded-lg gradient-cyan font-bold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!grade) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card-glass p-8 text-center">
          <h2 className="font-heading text-3xl mb-4" style={{ color: 'var(--ion-blue)' }}>
            Select Your Grade
          </h2>
          <p className="text-gray-300">
            Your profile is missing grade information. Please contact the event administrator to complete onboarding.
          </p>
          <button
            onClick={onExit}
            className="mt-6 px-6 py-3 rounded-lg gradient-cyan font-bold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'loading') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card-glass p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Scanning the Silk Road archives for your next challenge...</p>
        </div>
      </div>
    );
  }

  if (stage === 'empty') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card-glass p-8 text-center">
          <h2 className="font-heading text-3xl mb-4" style={{ color: 'var(--ion-blue)' }}>
            No Questions Available
          </h2>
          <p className="text-gray-300">
            {error
              ? error
              : 'No more questions are available for your grade right now. Please check back later or inform your teacher.'}
          </p>
          <button
            onClick={onExit}
            className="mt-6 px-6 py-3 rounded-lg gradient-cyan font-bold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!question) {
    return null;
  }

  const options = [question.opt1, question.opt2, question.opt3, question.opt4];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card-glass p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>
              Silk Road Challenge
            </h2>
            <p className="text-sm text-gray-400">Grade {grade} • Streak {profile.streak}</p>
          </div>
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
          >
            Exit
          </button>
        </div>

        <div className="bg-black/40 border border-cyan-500/30 rounded-xl p-6 mb-6">
          <p className="text-lg text-white whitespace-pre-line">{question.stem}</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {options.map((option, index) => {
            const isSelected = choice.selected === index;
            const isCorrect = choice.feedback?.correct_option === index + 1;
            const isIncorrectSelection = choice.feedback && !choice.feedback.is_correct && isSelected;

            let buttonClass = 'w-full text-left p-4 rounded-xl border transition-all';
            let buttonStyle: React.CSSProperties = {};

            if (choice.feedback) {
              if (isCorrect) {
                buttonClass += ' border-green-400 bg-green-500/20';
                buttonStyle = { color: '#4ADE80' };
              } else if (isIncorrectSelection) {
                buttonClass += ' border-red-400 bg-red-500/20';
                buttonStyle = { color: '#F87171' };
              } else {
                buttonClass += ' border-gray-700 bg-gray-800/60 text-gray-300';
              }
            } else if (isSelected) {
              buttonClass += ' border-cyan-400 bg-cyan-500/20 text-cyan-300';
            } else {
              buttonClass += ' border-gray-700 hover:border-cyan-400 hover:bg-cyan-500/10 text-gray-200';
            }

            return (
              <button
                key={index}
                disabled={!!choice.feedback}
                onClick={() => setChoice({ selected: index, isSubmitting: false, feedback: choice.feedback })}
                className={buttonClass}
                style={buttonStyle}
              >
                <span className="font-bold mr-2">{optionLabels[index]}.</span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          {stage === 'question' && (
            <button
              disabled={choice.selected === null || choice.isSubmitting}
              onClick={handleSubmit}
              className="px-6 py-3 rounded-lg gradient-cyan font-bold disabled:opacity-50"
            >
              {choice.isSubmitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          )}
          {stage === 'result' && (
            <button
              onClick={handleNextQuestion}
              className="px-6 py-3 rounded-lg border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
            >
              Next Question
            </button>
          )}
        </div>
      </div>

      {choice.feedback && (
        <div className="card-glass p-6 border border-cyan-500/30">
          <h3 className="font-heading text-2xl mb-2" style={{ color: choice.feedback.is_correct ? '#4ADE80' : '#FBBF24' }}>
            {choice.feedback.is_correct ? '✅ Correct!' : 'Answer Recorded'}
          </h3>
          <p className="text-gray-300 mb-4">
            {choice.feedback.is_correct
              ? 'You earned XP and coins for your streak.'
              : `The correct answer was option ${optionLabels[(choice.feedback.correct_option ?? 1) - 1]}.`}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-black/30 rounded-lg p-4 border border-cyan-500/20">
              <div className="text-sm text-gray-400">XP Gained</div>
              <div className="text-2xl font-bold text-white">+{choice.feedback.xp_awarded}</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 border border-cyan-500/20">
              <div className="text-sm text-gray-400">Coins Gained</div>
              <div className="text-2xl font-bold text-white">+{choice.feedback.coins_awarded}</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 border border-cyan-500/20">
              <div className="text-sm text-gray-400">Current Streak</div>
              <div className="text-2xl font-bold text-white">{choice.feedback.profile_streak}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Phase1PlayView;
