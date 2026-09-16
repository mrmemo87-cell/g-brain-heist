import { supabase } from './supabaseClient';
import type {
  CommanderPracticeBattle,
  CommanderPracticeMove,
} from './commanderPracticeService';

export type CommanderPvpTarget = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  level: number;
  guard_name: string;
  archer_name: string;
  guard_school: string;
  archer_school: string;
  last_attacked_at: string | null;
};

export type CommanderPvpHistoryEntry = {
  battle_id: string;
  result: 'victory' | 'defeat' | 'draw' | 'expired' | 'cancelled';
  was_attacker: boolean;
  opponent_user_id: string;
  opponent_username: string;
  opponent_avatar_url: string | null;
  created_at: string;
  finished_at: string | null;
};

export type CommanderPvpActiveBattle = {
  battle_id: string;
  opponent_user_id: string;
  opponent_username: string;
  opponent_avatar_url: string | null;
  opponent_level: number;
  created_at: string;
  expires_at: string;
};

export type CommanderPvpLobby = {
  rules: {
    cooldownSeconds: number;
    battleTtlMinutes: number;
  };
  targets: CommanderPvpTarget[];
  activeBattle: CommanderPvpActiveBattle | null;
  history: CommanderPvpHistoryEntry[];
};

export type CommanderPvpOpponent = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

export type CommanderPvpSession = {
  battleId: string;
  expiresAt: string;
  opponent: CommanderPvpOpponent;
  battle: CommanderPracticeBattle;
  persistentWrites: true;
};

type PvpApiResponse = {
  ok?: boolean;
  error?: string;
  battleId?: string;
  expiresAt?: string;
  opponent?: CommanderPvpOpponent;
  battle?: CommanderPracticeBattle;
  persistentWrites?: boolean;
};

const requirePvpAuthHeaders = async (): Promise<Record<string, string>> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error('commander_pvp_auth_required');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
};

const extractFunctionError = async (error: unknown, data: PvpApiResponse | null) => {
  if (data?.error) return data.error;
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; code?: unknown; message?: unknown };
        if (typeof payload?.error === 'string' && payload.error) return payload.error;
        if (typeof payload?.code === 'string' && payload.code) return payload.code;
        if (typeof payload?.message === 'string' && payload.message) return payload.message;
      } catch {
        // Fall through to the connector error.
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'commander_pvp_unavailable';
};

const requireSession = async (
  data: PvpApiResponse | null,
  error: unknown,
): Promise<CommanderPvpSession> => {
  if (error || !data?.ok) throw new Error(await extractFunctionError(error, data));
  if (!data.battleId || !data.expiresAt || !data.opponent || !data.battle || data.persistentWrites !== true) {
    throw new Error('invalid_commander_pvp_response');
  }
  return {
    battleId: data.battleId,
    expiresAt: data.expiresAt,
    opponent: data.opponent,
    battle: data.battle,
    persistentWrites: true,
  };
};

export async function getCommanderPvpLobby(
  search = '',
  limit = 40,
): Promise<CommanderPvpLobby> {
  const { data, error } = await supabase.rpc('rpc_commander_pvp_lobby', {
    p_search: search.trim() || null,
    p_limit: Math.max(1, Math.min(limit, 60)),
  });
  if (error || !data || typeof data !== 'object') {
    throw error ?? new Error('commander_pvp_lobby_unavailable');
  }
  const payload = data as Partial<CommanderPvpLobby>;
  return {
    rules: {
      cooldownSeconds: Number(payload.rules?.cooldownSeconds ?? 300),
      battleTtlMinutes: Number(payload.rules?.battleTtlMinutes ?? 30),
    },
    targets: Array.isArray(payload.targets) ? payload.targets : [],
    activeBattle: payload.activeBattle ?? null,
    history: Array.isArray(payload.history) ? payload.history : [],
  };
}

export async function startCommanderPvp(
  targetUserId: string,
  signal?: AbortSignal,
): Promise<CommanderPvpSession> {
  const headers = await requirePvpAuthHeaders();
  const { data, error } = await supabase.functions.invoke<PvpApiResponse>('commander_pvp', {
    headers,
    signal,
    body: { action: 'start', targetUserId },
  });
  return requireSession(data, error);
}

export async function resumeCommanderPvp(
  battleId?: string,
  signal?: AbortSignal,
): Promise<CommanderPvpSession> {
  const headers = await requirePvpAuthHeaders();
  const { data, error } = await supabase.functions.invoke<PvpApiResponse>('commander_pvp', {
    headers,
    signal,
    body: { action: 'resume', ...(battleId ? { battleId } : {}) },
  });
  return requireSession(data, error);
}

export async function submitCommanderPvpTurn(
  battleId: string,
  move: CommanderPracticeMove,
  targetId?: string | null,
  signal?: AbortSignal,
): Promise<CommanderPvpSession> {
  const headers = await requirePvpAuthHeaders();
  const { data, error } = await supabase.functions.invoke<PvpApiResponse>('commander_pvp', {
    headers,
    signal,
    body: {
      action: 'turn',
      battleId,
      move,
      targetId: targetId ?? null,
    },
  });
  return requireSession(data, error);
}

export async function cancelCommanderPvp(battleId: string): Promise<void> {
  const headers = await requirePvpAuthHeaders();
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('commander_pvp', {
    headers,
    body: { action: 'cancel', battleId },
  });
  if (error || !data?.ok) throw new Error(data?.error ?? (error instanceof Error ? error.message : 'commander_pvp_cancel_failed'));
}

export const commanderPvpError = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  if (
    message.includes('commander_pvp_auth_required')
    || message.includes('UNAUTHORIZED_NO_AUTH_HEADER')
    || message.includes('Missing authorization header')
    || message.includes('invalid_auth_token')
  ) {
    return 'Your session could not be verified. Please sign in again and retry.';
  }
  if (message.includes('commander_enroll_first')) return 'Claim your Commander starter squad before entering player battles.';
  if (message.includes('commander_pvp_self_target')) return 'Choose another Commander to attack.';
  if (message.includes('commander_pvp_target_cooldown')) return 'That Commander was attacked recently. Choose another opponent or wait for the cooldown.';
  if (message.includes('commander_pvp_active_battle')) return 'Finish or resume your current Commander battle before starting another.';
  if (message.includes('commander_pvp_target_unavailable')) return 'That Commander is no longer available to battle.';
  if (message.includes('commander_pvp_battle_finished')) return 'This battle has already ended. Return to the battle network to choose another opponent.';
  if (message.includes('commander_pvp_stale_turn')) return 'The battle changed in another request. Resume it before issuing another command.';
  if (message.includes('commander_pvp_battle_not_found')) return 'That Commander battle could not be found.';
  if (message.includes('commander_pvp_students_only')) return 'Commander player battles are available to student accounts only.';
  if (message.includes('commander_pvp_') || message.includes('FunctionsHttpError') || message.includes('Failed to send')) {
    return 'Commander player battles are temporarily unavailable. No battle result or account reward was changed.';
  }
  return 'The Commander battle could not be completed. Please try again.';
};
