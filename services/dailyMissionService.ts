import { supabase } from './supabaseClient';
import type { DailyStreakRewardReceipt } from '../types';

export interface DailyMissionQuestion {
  id: string;
  question_text: string;
  options: string[];
  subject: string | null;
  topic_name: string | null;
  image_url: string | null;
  image_alt_text: string | null;
  answered: boolean;
}

export type DailyMissionSource = 'review' | 'topic' | 'subject' | 'grade';

export interface DailyMission {
  mission_date: string;
  source: DailyMissionSource;
  focus_label: string | null;
  /** Set when a teacher's follow-up or support plan chose part of today's questions. */
  teacher_topic?: string | null;
  total: number;
  answered: number;
  correct: number;
  completed: boolean;
  reward_claimed_today: boolean;
  questions: DailyMissionQuestion[];
}

export interface DailyMissionAnswerResult {
  correct: boolean;
  correct_answer: string | null;
  explanation: string | null;
  answered: number;
  total: number;
  mission_correct: number;
  completed: boolean;
  deltas: { xp: number; coins: number; gemstones: number };
  final_profile_values?: { xp?: number; coins?: number; level?: number; gemstones?: number } | null;
  streak_reward: DailyStreakRewardReceipt | null;
}

/**
 * Today's mission for the signed-in student, or null when there is none
 * (not a student, too few suitable questions, or the feature is not yet
 * available on this database). Never throws, so the dashboard is unaffected.
 */
export async function fetchDailyMission(): Promise<DailyMission | null> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_daily_mission');
    if (error || !data || data.available !== true) return null;
    return {
      ...data,
      questions: (data.questions || []).map((question: DailyMissionQuestion) => ({
        ...question,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
      })),
    } as DailyMission;
  } catch {
    return null;
  }
}

export async function submitDailyMissionAnswer(questionId: string, answer: string): Promise<DailyMissionAnswerResult> {
  const { data, error } = await supabase.rpc('rpc_submit_daily_mission_answer', {
    p_question_id: questionId,
    p_answer: answer,
  });
  if (error) {
    if (/already answered/i.test(error.message)) throw new Error('You already answered this question.');
    if (/No mission for today/i.test(error.message)) throw new Error('A new day has started. Refresh to get today’s mission.');
    throw new Error('We could not save your answer. Check your connection and try again.');
  }

  const reward = data?.streak_reward;
  return {
    correct: data?.correct === true,
    correct_answer: data?.correct_answer ?? null,
    explanation: data?.explanation ?? null,
    answered: Number(data?.answered ?? 0),
    total: Number(data?.total ?? 5),
    mission_correct: Number(data?.mission_correct ?? 0),
    completed: data?.completed === true,
    deltas: {
      xp: Number(data?.deltas?.xp ?? 0),
      coins: Number(data?.deltas?.coins ?? 0),
      gemstones: Number(data?.deltas?.gemstones ?? 0),
    },
    final_profile_values: data?.final_profile_values ?? null,
    streak_reward: reward && reward.claimed === true
      ? {
          claimed: true,
          reward_date: String(reward.reward_date),
          streak: Number(reward.streak ?? 0),
          coins_awarded: Number(reward.coins_awarded ?? 0),
          coins: Number(reward.coins ?? 0),
        }
      : null,
  };
}
