import { supabase } from './supabaseClient';

export interface WeeklyBoardEntry {
  rank: number;
  position: number;
  name: string;
  avatar_url: string | null;
  points: number;
  is_me: boolean;
}

export interface WeeklyClassBoard {
  class_label: string;
  class_size: number;
  days_until_reset: number;
  my_rank: number;
  my_points: number;
  rank_at_start_of_today: number;
  places_climbed_today: number;
  next_name: string | null;
  points_to_next: number | null;
  entries: WeeklyBoardEntry[];
}

/** This week's board for the signed-in student's class, or null if none. Never throws. */
export async function fetchWeeklyClassBoard(): Promise<WeeklyClassBoard | null> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_weekly_class_board');
    if (error || !data || data.available !== true) return null;
    return {
      ...data,
      entries: Array.isArray(data.entries) ? data.entries : [],
    } as WeeklyClassBoard;
  } catch {
    return null;
  }
}
