import { supabase } from './supabaseClient';

export type RivalryDoctrine = 'breach' | 'fortress' | 'disruption';
export type RivalryRolePref = 'striker' | 'saboteur' | 'engineer';
export type RivalryActionType = 'strike' | 'sabotage' | 'repair';
export type RivalryStructureCode = 'relay_core' | 'cipher_vault' | 'sentinel_grid';
export type RivalryWarStatus = 'pending_response' | 'prep' | 'live' | 'blackout' | 'settled' | 'expired' | 'declined' | 'canceled';

export interface RivalryWarSummary {
  war_id: string;
  attacker_clan_id: string;
  attacker_clan_name?: string | null;
  defender_clan_id: string;
  defender_clan_name?: string | null;
  status: RivalryWarStatus | string;
  created_at: string;
  prep_ends_at?: string | null;
  live_ends_at?: string | null;
  winner_clan_id?: string | null;
  settled_at?: string | null;
}


export interface RivalryMemberState {
  current_oe?: number;
  cooldown_until?: string | null;
  action_count?: number;
  contribution_points?: number;
}

export interface RivalryWarStateResponse {
  success: boolean;
  scope?: 'participant' | 'public';
  war?: Record<string, unknown>;
  score?: {
    attacker_visible: number | null;
    defender_visible: number | null;
    blackout: boolean;
  };
  structures?: RivalryStructureState[];
  rosters?: RivalryRosterRow[];
  member_state?: RivalryMemberState | null;
  error?: string;
}

export interface RivalryStructureState {
  id?: string;
  war_id?: string;
  owner_clan_id: string;
  structure_code: RivalryStructureCode;
  current_integrity: number;
  max_integrity: number;
  state_band: 'healthy' | 'strained' | 'critical' | 'down' | string;
}

export interface RivalryRosterRow {
  war_id: string;
  clan_id: string;
  user_id: string;
  role_pref: RivalryRolePref;
  is_locked_in: boolean;
  locked_at?: string | null;
}

export interface RivalryLogEntry {
  id: string;
  war_id: string;
  action_type: RivalryActionType | string;
  target_structure_code: RivalryStructureCode | string;
  result_grade: string;
  created_at: string;
  actor_user_id?: string;
  actor_clan_id?: string;
  damage_amount?: number;
  repair_amount?: number;
  wp_delta_visible?: number;
  wp_delta_hidden?: number;
}

export interface RivalryLogsResponse {
  success: boolean;
  scope?: 'participant' | 'public';
  logs?: RivalryLogEntry[];
  error?: string;
}

export interface RivalryRpcResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

const getIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const unwrapRpc = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T> => {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message || 'RPC failed');
  }
  return data as T;
};


export interface RivalryService {
  getPublicWars: (limit?: number) => Promise<RivalryWarSummary[]>;
  getWarState: (warId: string) => Promise<RivalryWarStateResponse>;
  getWarLogs: (warId: string, limit?: number, before?: string | null) => Promise<RivalryLogsResponse>;
  declareWar: (targetClanId: string, idempotencyKey?: string) => Promise<RivalryRpcResult>;
  respondWar: (warId: string, response: 'accept' | 'decline', idempotencyKey?: string) => Promise<RivalryRpcResult>;
  setDoctrine: (warId: string, doctrine: RivalryDoctrine) => Promise<RivalryRpcResult>;
  updateRosterMember: (warId: string, memberUserId: string, rolePref: RivalryRolePref, include: boolean) => Promise<RivalryRpcResult>;
  lockRoster: (warId: string) => Promise<RivalryRpcResult>;
  submitAction: (warId: string, actionType: RivalryActionType, targetClanId: string, targetStructureCode: RivalryStructureCode, idempotencyKey?: string) => Promise<RivalryRpcResult>;
  claimReward: (warId: string) => Promise<RivalryRpcResult>;
}

export const rivalryService: RivalryService = {
  async getPublicWars(limit = 50): Promise<RivalryWarSummary[]> {
    const data = await unwrapRpc<RivalryWarSummary[]>(
      supabase.rpc('rpc_rivalry_get_public_wars', { p_limit: Math.max(1, Math.min(limit, 100)) })
    );
    return Array.isArray(data) ? data : [];
  },

  async getWarState(warId: string): Promise<RivalryWarStateResponse> {
    return unwrapRpc<RivalryWarStateResponse>(
      supabase.rpc('rpc_rivalry_get_war_state', { p_war_id: warId })
    );
  },

  async getWarLogs(warId: string, limit = 50, before: string | null = null): Promise<RivalryLogsResponse> {
    return unwrapRpc<RivalryLogsResponse>(
      supabase.rpc('rpc_rivalry_get_war_logs', {
        p_war_id: warId,
        p_limit: Math.max(1, Math.min(limit, 200)),
        p_before: before,
      })
    );
  },

  async declareWar(targetClanId: string, idempotencyKey = getIdempotencyKey()): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_declare_war', {
        p_target_clan_id: targetClanId,
        p_idempotency_key: idempotencyKey,
      })
    );
  },

  async respondWar(warId: string, response: 'accept' | 'decline', idempotencyKey = getIdempotencyKey()): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_respond_war', {
        p_war_id: warId,
        p_response: response,
        p_idempotency_key: idempotencyKey,
      })
    );
  },

  async setDoctrine(warId: string, doctrine: RivalryDoctrine): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_set_doctrine', {
        p_war_id: warId,
        p_doctrine: doctrine,
      })
    );
  },

  async updateRosterMember(warId: string, memberUserId: string, rolePref: RivalryRolePref, include: boolean): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_update_roster_member', {
        p_war_id: warId,
        p_member_user_id: memberUserId,
        p_role_pref: rolePref,
        p_include: include,
      })
    );
  },

  async lockRoster(warId: string): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_lock_roster', {
        p_war_id: warId,
      })
    );
  },

  async submitAction(
    warId: string,
    actionType: RivalryActionType,
    targetClanId: string,
    targetStructureCode: RivalryStructureCode,
    idempotencyKey = getIdempotencyKey()
  ): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_submit_action', {
        p_war_id: warId,
        p_action_type: actionType,
        p_target_clan_id: targetClanId,
        p_target_structure_code: targetStructureCode,
        p_idempotency_key: idempotencyKey,
      })
    );
  },

  async claimReward(warId: string): Promise<RivalryRpcResult> {
    return unwrapRpc<RivalryRpcResult>(
      supabase.rpc('rpc_rivalry_claim_reward', {
        p_war_id: warId,
      })
    );
  },
};
