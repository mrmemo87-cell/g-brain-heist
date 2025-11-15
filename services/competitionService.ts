import { supabase } from './supabaseClient';
import type {
  AttemptSubmissionResult,
  Batch,
  BatchLeaderboardSummary,
  Grade,
  LeaderboardEntry,
  PhaseQuestion,
  Announcement,
  AdminOverviewStats,
} from '../types';

const mapQuestionRow = (row: any): PhaseQuestion | null => {
  if (!row) return null;
  return {
    id: row.id,
    stem: row.stem,
    opt1: row.opt1,
    opt2: row.opt2,
    opt3: row.opt3,
    opt4: row.opt4,
    lang: row.lang ?? 'ru',
    reward_xp: row.reward_xp ?? 20,
    reward_coins: row.reward_coins ?? 10,
  };
};

export const fetchNextQuestion = async (grade: Grade): Promise<PhaseQuestion | null> => {
  const { data, error } = await supabase.rpc('rpc_questions_next', { p_grade: grade });

  if (error) {
    throw new Error(error.message || 'Failed to load question');
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapQuestionRow(Array.isArray(data) ? data[0] : data);
};

export const submitAttempt = async (
  questionId: number,
  choice: number
): Promise<AttemptSubmissionResult> => {
  const { data, error } = await supabase.rpc('rpc_submit_attempt', {
    p_question_id: questionId,
    p_choice: choice,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit attempt');
  }

  if (!data || data.length === 0) {
    throw new Error('Invalid response from submit attempt RPC');
  }

  const payload = Array.isArray(data) ? data[0] : data;

  return {
    is_correct: !!payload.is_correct,
    correct_option: Number(payload.correct_option ?? payload.correct),
    xp_awarded: Number(payload.xp_awarded ?? payload.reward_xp ?? 0),
    coins_awarded: Number(payload.coins_awarded ?? payload.reward_coins ?? 0),
    profile_xp: Number(payload.profile_xp ?? payload.new_xp ?? 0),
    profile_coins: Number(payload.profile_coins ?? payload.new_coins ?? 0),
    profile_streak: Number(payload.profile_streak ?? payload.new_streak ?? 0),
  };
};

const mapLeaderboard = (data: any[]): LeaderboardEntry[] => {
  if (!Array.isArray(data)) return [];

  return data.map((row) => ({
    user_id: row.user_id ?? row.id,
    username: row.username,
    xp: Number(row.xp ?? 0),
    coins: Number(row.coins ?? 0),
    streak: Number(row.streak ?? 0),
    batch: (row.batch ?? null) as Batch | null,
    grade: Number(row.grade ?? row.player_grade ?? 8) as Grade,
  }));
};

export const fetchGradeLeaderboard = async (
  grade: Grade,
  limit = 10
): Promise<LeaderboardEntry[]> => {
  // Ensure the grade is a number and within allowed values before calling RPC
  const g = Number(grade);
  if (![8, 9].includes(g)) throw new Error('Invalid grade parameter');

  let rpcData: any, rpcError: any;
  try {
    const resp = await supabase.rpc('rpc_leaderboard_grade', {
      p_grade: g,
      p_limit: Number(limit),
    });
  rpcData = resp.data;
  rpcError = resp.error;
  } catch (e: any) {
    throw new Error(`RPC rpc_leaderboard_grade failed: ${e?.message || String(e)}`);
  }

  if (rpcError) {
    throw new Error(rpcError.message || `Failed to load grade leaderboard (code: ${rpcError?.code ?? 'unknown'})`);
  }

  return mapLeaderboard(rpcData ?? []);
};

export const fetchBatchLeaderboard = async (
  batch: Batch,
  limit = 10
): Promise<LeaderboardEntry[]> => {
  // Validate batch parameter
  const validBatches: Batch[] = ['8A', '8B', '8C', '9A', '9B', '9C'];
  if (!validBatches.includes(batch)) throw new Error('Invalid batch parameter');

  let rpcData: any, rpcError: any;
  try {
    const resp = await supabase.rpc('rpc_leaderboard_batch', {
      p_batch: String(batch),
      p_limit: Number(limit),
    });
    rpcData = resp.data;
    rpcError = resp.error;
  } catch (e: any) {
    throw new Error(`RPC rpc_leaderboard_batch failed: ${e?.message || String(e)}`);
  }
  if (rpcError) {
    throw new Error(rpcError.message || `Failed to load class leaderboard (code: ${rpcError?.code ?? 'unknown'})`);
  }

  return mapLeaderboard(rpcData ?? []);
};

export const fetchBatchSummaries = async (): Promise<BatchLeaderboardSummary[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, batch, xp, grade');

  if (error) {
    throw new Error(error.message || 'Failed to load profiles for summaries');
  }

  const summaries = new Map<Batch, { total: number; count: number }>();

  (data ?? []).forEach((row) => {
    const batch = row.batch as Batch | null;
    if (!batch) return;
    if (!summaries.has(batch)) {
      summaries.set(batch, { total: 0, count: 0 });
    }
    const stat = summaries.get(batch)!;
    stat.total += Number(row.xp ?? 0);
    stat.count += 1;
  });

  return Array.from(summaries.entries()).map(([batch, values]) => ({
    batch,
    total_xp: values.total,
    player_count: values.count,
  }));
};

export const fetchAnnouncements = async (limit = 10): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, text, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to fetch announcements');
  }

  return (data ?? []).map((row) => ({
    ...row,
    id: String((row as any).id),
  })) as Announcement[];
};

export const postAnnouncement = async (text: string): Promise<void> => {
  const { error } = await supabase.rpc('rpc_announcement_post', { p_text: text });

  if (error) {
    throw new Error(error.message || 'Failed to send announcement');
  }
};

export const fetchNextAnnouncement = async (): Promise<Announcement | null> => {
  const { data, error } = await supabase.rpc('rpc_announcement_next');

  if (error) {
    throw new Error(error.message || 'Failed to load announcements');
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  return {
    ...(payload as Record<string, unknown>),
    id: String((payload as any).id),
  } as Announcement;
};

export const markAnnouncementSeen = async (announcementId: string): Promise<void> => {
  const { error } = await supabase.rpc('rpc_announcement_mark_seen', {
    p_announcement_id: announcementId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to dismiss announcement');
  }
};

export const grantPlayerRewards = async (
  userId: string,
  xpDelta: number,
  coinsDelta: number
): Promise<void> => {
  const { error } = await supabase.rpc('rpc_admin_grant', {
    p_user_id: userId,
    p_xp_delta: xpDelta,
    p_coins_delta: coinsDelta,
  });

  if (error) {
    throw new Error(error.message || 'Failed to grant rewards');
  }
};

export const resetPlayerProgress = async (userId: string): Promise<void> => {
  const { error } = await supabase.rpc('rpc_admin_reset_user', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to reset player');
  }
};

export const resetAllPlayerProgress = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('rpc_admin_reset_all');

  if (error) {
    throw new Error(error.message || 'Failed to reset all players');
  }

  if (Array.isArray(data) && data.length > 0) {
    return Number(data[0]?.affected_rows ?? 0);
  }

  if (typeof data === 'object' && data !== null && 'affected_rows' in data) {
    return Number((data as any).affected_rows ?? 0);
  }

  return 0;
};

export const refillAllAp = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('rpc_admin_refill_all_ap');
  if (error) throw new Error(error.message || 'Failed to refill AP');
  if (Array.isArray(data) && data.length > 0) return Number(data[0]?.affected_rows ?? 0);
  if (typeof data === 'object' && data !== null && 'affected_rows' in data) return Number((data as any).affected_rows ?? 0);
  return 0;
};

export const resetPvpWinsLeaderboard = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('rpc_admin_reset_pvp_wins');
  if (error) throw new Error(error.message || 'Failed to reset PvP wins');
  if (Array.isArray(data) && data.length > 0) return Number(data[0]?.affected_rows ?? 0);
  if (typeof data === 'object' && data !== null && 'affected_rows' in data) return Number((data as any).affected_rows ?? 0);
  return 0;
};

export const disbandClan = async (clanId: string): Promise<void> => {
  const { error } = await supabase.rpc('rpc_admin_disband_clan', { p_clan_id: clanId });
  if (error) throw new Error(error.message || 'Failed to disband clan');
};

export const updatePlayerAcademics = async (
  userId: string,
  grade: number | null,
  batch: string | null
): Promise<void> => {
  const { error } = await supabase.rpc('rpc_admin_set_user_academics', {
    p_user_id: userId,
    p_grade: grade,
    p_batch: batch,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update user grade/class');
  }
};

export const setPlayerBanned = async (userId: string, isBanned: boolean): Promise<boolean> => {
  const { data, error } = await supabase.rpc('rpc_admin_ban_user', {
    p_user_id: userId,
    p_is_banned: isBanned,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update ban status');
  }

  if (Array.isArray(data) && data.length > 0) {
    return Boolean(data[0]?.is_banned);
  }

  if (data && typeof data === 'object' && 'is_banned' in data) {
    return Boolean((data as any).is_banned);
  }

  return isBanned;
};

export const deletePlayer = async (userId: string): Promise<void> => {
  const { error } = await supabase.rpc('rpc_admin_delete_user', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to delete player');
  }
};

export const searchPlayers = async (query: string, limit = 20) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, grade, batch, xp, coins, streak, gemstones, updated_at, is_banned')
    .ilike('username', `%${trimmed}%`)
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to search players');
  }

  return data ?? [];
};

export const fetchPlayerLastAttempt = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('attempts')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load attempt history');
  }

  return data?.created_at ?? null;
};

export const fetchQuestionBank = async () => {
  const { data, error } = await supabase
    .from('mcq_questions')
    .select('id, grade, difficulty, active, stem, lang');

  if (error) {
    throw new Error(error.message || 'Failed to load question bank');
  }

  return data ?? [];
};

export const updateQuestionActiveState = async (questionId: number, active: boolean) => {
  const { error } = await supabase
    .from('mcq_questions')
    .update({ active })
    .eq('id', questionId);

  if (error) {
    throw new Error(error.message || 'Failed to update question state');
  }
};

export const fetchQuestionCountsByGrade = async () => {
  const questions = await fetchQuestionBank();
  const counts = new Map<Grade, { total: number; active: number; difficulty: Record<string, number> }>();

  questions.forEach((question: any) => {
    const grade = Number(question.grade) as Grade;
    if (!counts.has(grade)) {
      counts.set(grade, { total: 0, active: 0, difficulty: {} });
    }
    const entry = counts.get(grade)!;
    entry.total += 1;
    if (question.active) {
      entry.active += 1;
    }
    const key = question.difficulty ?? 'unknown';
    entry.difficulty[key] = (entry.difficulty[key] ?? 0) + 1;
  });

  return Array.from(counts.entries()).map(([grade, value]) => ({ grade, ...value }));
};

export const fetchAdminOverviewStats = async (): Promise<AdminOverviewStats> => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const [playersTodayRes, attemptsRes, summaries, errorLogRes, gemRes] = await Promise.all([
    supabase
      .from('attempts')
      .select('user_id', { head: true, count: 'exact' })
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('attempts')
      .select('id', { head: true, count: 'exact' })
      .gte('created_at', fiveMinutesAgo.toISOString()),
    fetchBatchSummaries(),
    supabase
      .from('rpc_event_log')
      .select('message, created_at, log_level')
      .eq('log_level', 'error')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // aggregate gemstones across users (non-null numbers expected)
    supabase
      .from('users')
      .select('sum(gemstones)')
      .maybeSingle(),
  ]);

  const errorLogData = (errorLogRes as { data?: { message?: string; created_at?: string } | null })?.data ?? null;

  const topBatch = summaries.reduce<{ batch: Batch | null; total: number | null }>(
    (acc, curr) => {
      if (acc.total === null || curr.total_xp > acc.total) {
        return { batch: curr.batch, total: curr.total_xp };
      }
      return acc;
    },
    { batch: null, total: null }
  );

  return {
    players_today: playersTodayRes.count ?? 0,
    attempts_last_five_minutes: attemptsRes.count ?? 0,
    top_batch: topBatch.batch,
    top_batch_total_xp: topBatch.total,
    last_error_message: errorLogData?.message ?? null,
    last_error_at: errorLogData?.created_at ?? null,
    total_gemstones: gemRes && (gemRes as any).data ? Number(((gemRes as any).data as any)[Object.keys((gemRes as any).data)[0]] ?? 0) : 0,
  };
};

export const fetchAttemptsPerMinute = async () => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('attempts')
    .select('created_at')
    .gte('created_at', tenMinutesAgo);

  if (error) {
    throw new Error(error.message || 'Failed to load telemetry');
  }

  return data ?? [];
};

// ============================================================================
// Realtime Subscriptions (Patch Mode)
// ============================================================================

export const mapRowToEntry = (row: any): LeaderboardEntry => {
  return {
    user_id: row.user_id ?? row.id,
    username: row.username,
    xp: Number(row.xp ?? 0),
    coins: Number(row.coins ?? 0),
    streak: Number(row.streak ?? 0),
    batch: (row.batch ?? null) as Batch | null,
    grade: Number(row.grade ?? 8) as Grade,
  };
};

export const handlePatchUpdate = (
  setList: React.Dispatch<React.SetStateAction<LeaderboardEntry[]>>,
  updateFn: (entry: LeaderboardEntry) => LeaderboardEntry
) => {
  setList((prev) => {
    const newList = prev.map(updateFn);
    return newList.sort((a, b) => b.xp - a.xp).slice(0, 50);
  });
};

export const subscribeToGradeLeaderboard = (
  grade: Grade,
  onUpdate: (entry: LeaderboardEntry) => void
): (() => void) => {
  const channelName = `grade-${grade}-realtime`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `grade=eq.${grade}`,
      },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          // When a user is deleted, refetch since complex operation
          // In patch mode, we just trigger a refetch for this case
          console.warn('[realtime] DELETE event, consider refetching');
          return;
        }

        const row = payload.new;
        if (!row) return;

        const entry = mapRowToEntry(row);
        onUpdate(entry);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToBatchLeaderboard = (
  batch: Batch,
  onUpdate: (entry: LeaderboardEntry) => void
): (() => void) => {
  const channelName = `batch-${batch}-realtime`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `batch=eq.${batch}`,
      },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          console.warn('[realtime] DELETE event, consider refetching');
          return;
        }

        const row = payload.new;
        if (!row) return;

        const entry = mapRowToEntry(row);
        onUpdate(entry);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

