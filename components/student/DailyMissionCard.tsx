import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import {
  fetchDailyMission,
  submitDailyMissionAnswer,
  type DailyMission,
  type DailyMissionAnswerResult,
} from '../../services/dailyMissionService';
import type { DailyStreakRewardReceipt } from '../../types';
import { celebrateWithMascot, mascotMoment } from '../../src/features/studentMascot/mascotMoments';
import './DailyMissionCard.css';

interface DailyMissionCardProps {
  currentStreak: number;
  /** Profile values returned after each answer (XP, coins, level). */
  onProfileValues?: (values: NonNullable<DailyMissionAnswerResult['final_profile_values']>) => void;
  /** Called once when finishing the mission earns today's streak reward. */
  onStreakReward?: (receipt: DailyStreakRewardReceipt) => void;
  /** Called once when the last question is answered. */
  onMissionCompleted?: () => void;
}

type Feedback = { questionId: string; chosen: string; result: DailyMissionAnswerResult };

const DailyMissionCard: React.FC<DailyMissionCardProps> = ({ currentStreak, onProfileValues, onStreakReward, onMissionCompleted }) => {
  const { t } = useLanguage();
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await fetchDailyMission();
    setMission(next);
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !mission) return null;

  const current = mission.questions.find((question) => !question.answered) || null;
  const position = Math.min(mission.answered + 1, mission.total);
  const focusText = mission.teacher_topic
    ? t('Practice from your teacher: {topic}', { topic: mission.teacher_topic })
    : mission.focus_label
    ? (mission.source === 'review' ? t('Fix your mistakes in {topic}', { topic: mission.focus_label }) : t('Focus: {topic}', { topic: mission.focus_label }))
    : t('Picked for your level');

  const choose = async (questionId: string, option: string) => {
    if (busy || feedback) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitDailyMissionAnswer(questionId, option);
      setFeedback({ questionId, chosen: option, result });
      setMission((prev) => prev && {
        ...prev,
        answered: result.answered,
        correct: result.mission_correct,
        completed: result.completed,
        reward_claimed_today: prev.reward_claimed_today || Boolean(result.streak_reward),
        questions: prev.questions.map((question) => question.id === questionId ? { ...question, answered: true } : question),
      });
      if (result.final_profile_values) onProfileValues?.(result.final_profile_values);
      if (result.completed) {
        // The cat celebrates first, then the coin reward opens, so they never overlap.
        const reward = result.streak_reward;
        void celebrateWithMascot().then(() => {
          if (reward) onStreakReward?.(reward);
          onMissionCompleted?.();
        });
      } else {
        mascotMoment(result.correct ? 'correct' : 'wrong');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('We could not save your answer.'));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setFeedback(null);
    if (mission.completed) setPlaying(false);
  };

  // Finished for today
  if (mission.completed && !feedback) {
    return (
      <article className="student-feed-card dmc dmc--done" aria-labelledby="dmc-title">
        <div className="dmc-head">
          <span className="dmc-pill dmc-pill--done">{t('Done for today')}</span>
          <span className="dmc-meta">🔥 {t('Streak: {count}', { count: currentStreak })}</span>
        </div>
        <h2 id="dmc-title" className="dmc-title font-heading">{t('Today’s mission complete')}</h2>
        <p className="dmc-copy">
          {t('You got {correct} of {total} right. Come back tomorrow to keep your streak going.', { correct: mission.correct, total: mission.total })}
        </p>
        <div className="dmc-dots" aria-hidden="true">
          {mission.questions.map((question) => <span key={question.id} className="is-filled" />)}
        </div>
      </article>
    );
  }

  // Not started / paused
  if (!playing) {
    const started = mission.answered > 0;
    return (
      <article className="student-feed-card dmc" aria-labelledby="dmc-title">
        <div className="dmc-head">
          <span className="dmc-pill">{mission.teacher_topic ? t('Set by your teacher') : t('Today’s mission')}</span>
          <span className="dmc-meta">{t('{count} questions · about 4 min', { count: mission.total })}</span>
        </div>
        <h2 id="dmc-title" className="dmc-title font-heading">{focusText}</h2>
        <p className="dmc-copy">
          {mission.reward_claimed_today
            ? t('Practise to grow your skills. Today’s streak reward is already yours.')
            : currentStreak > 0
              ? t('Finish all {count} to keep your 🔥 {streak}-day streak and earn today’s coins.', { count: mission.total, streak: currentStreak })
              : t('Finish all {count} to start a streak and earn today’s coins.', { count: mission.total })}
        </p>
        <div className="dmc-dots" aria-label={t('{answered} of {total} answered', { answered: mission.answered, total: mission.total })}>
          {mission.questions.map((question) => <span key={question.id} className={question.answered ? 'is-filled' : undefined} />)}
        </div>
        <button type="button" className="student-primary-button dmc-start" onClick={() => { if (!started) mascotMoment('mission-start'); setPlaying(true); }}>
          {started ? t('Continue ({answered}/{total})', { answered: mission.answered, total: mission.total }) : t('Start mission')}
          <span aria-hidden="true">→</span>
        </button>
      </article>
    );
  }

  const shown = feedback ? mission.questions.find((question) => question.id === feedback.questionId) || null : current;
  if (!shown) return null;
  const shownIndex = mission.questions.findIndex((question) => question.id === shown.id) + 1;

  return (
    <article className="student-feed-card dmc dmc--play" aria-labelledby="dmc-question">
      <div className="dmc-head">
        <span className="dmc-pill">{t('Question {n} of {total}', { n: feedback ? shownIndex : position, total: mission.total })}</span>
        <button type="button" className="dmc-link" onClick={() => { setPlaying(false); setFeedback(null); }}>
          {t('Pause')}
        </button>
      </div>
      <div className="dmc-progress" aria-hidden="true">
        <span style={{ width: `${(mission.answered / mission.total) * 100}%` }} />
      </div>
      {shown.subject || shown.topic_name ? (
        <p className="dmc-topic">{[shown.subject, shown.topic_name].filter(Boolean).join(' · ')}</p>
      ) : null}
      <h2 id="dmc-question" className="dmc-question" dir="auto">{shown.question_text}</h2>
      {shown.image_url ? (
        <img className="dmc-image" src={shown.image_url} alt={shown.image_alt_text || ''} loading="lazy" />
      ) : null}

      <div className="dmc-options" role="group" aria-labelledby="dmc-question">
        {shown.options.map((option) => {
          let state = '';
          if (feedback) {
            if (option === feedback.result.correct_answer) state = 'is-correct';
            else if (option === feedback.chosen) state = 'is-wrong';
          }
          return (
            <button
              key={option}
              type="button"
              dir="auto"
              className={`dmc-option ${state}`}
              disabled={busy || Boolean(feedback)}
              aria-pressed={feedback?.chosen === option}
              onClick={() => void choose(shown.id, option)}
            >
              {option}
            </button>
          );
        })}
      </div>

      {error ? <p className="dmc-error" role="alert">{error}</p> : null}

      {feedback ? (
        <div className={`dmc-feedback ${feedback.result.correct ? 'is-correct' : 'is-wrong'}`} role="status">
          <strong>{feedback.result.correct ? t('Correct!') : t('Not quite.')}</strong>
          {!feedback.result.correct && feedback.result.correct_answer ? (
            <span>{t('The answer is: {answer}', { answer: feedback.result.correct_answer })}</span>
          ) : null}
          {feedback.result.explanation ? <span>{feedback.result.explanation}</span> : null}
          <button type="button" className="student-primary-button dmc-next" onClick={next} autoFocus>
            {feedback.result.completed ? t('Finish') : t('Next question')}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
    </article>
  );
};

export default DailyMissionCard;
