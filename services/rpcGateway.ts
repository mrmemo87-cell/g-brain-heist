import { supabase } from './supabaseClient.js';

export type RpcClient = Pick<typeof supabase, 'rpc'>;

type RpcResult<T> = Promise<{ data: T; error: { message?: string } | null }>;

type NotificationParams = Record<string, unknown>;

const withClient = (client?: RpcClient): RpcClient => client ?? supabase;

const execute = <T>(name: string, params: Record<string, unknown>, client?: RpcClient): RpcResult<T> => {
  return withClient(client).rpc(name, params) as unknown as RpcResult<T>;
};

export const regenerateUserAp = (userId: string, client?: RpcClient): RpcResult<any> => {
  return execute('regenerate_user_ap', { user_id_param: userId }, client);
};

export const notifyApFull = (userId: string, client?: RpcClient): RpcResult<unknown> => {
  return execute('notify_ap_full', { user_id_param: userId }, client);
};

export const notifyLevelUp = (
  userId: string,
  newLevel: number,
  rewardsXp: number,
  rewardsCoins: number,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('notify_level_up', {
    user_id_param: userId,
    new_level: newLevel,
    rewards_xp: rewardsXp,
    rewards_coins: rewardsCoins
  }, client);
};

export const notifyAttackIncoming = (payload: NotificationParams, client?: RpcClient): RpcResult<unknown> => {
  return execute('notify_attack_incoming', payload, client);
};

export const notifyCoinsLost = (payload: NotificationParams, client?: RpcClient): RpcResult<unknown> => {
  return execute('notify_coins_lost', payload, client);
};

export const notifyRevengeAvailable = (payload: NotificationParams, client?: RpcClient): RpcResult<unknown> => {
  return execute('notify_revenge_available', payload, client);
};

export const notifyAttackDefended = (payload: NotificationParams, client?: RpcClient): RpcResult<unknown> => {
  return execute('notify_attack_defended', payload, client);
};

export const performHackAttempt = (
  defenderId: string,
  client?: RpcClient
): RpcResult<{ result: unknown }> => {
  return execute('rpc_hack_attempt', { p_defender_id: defenderId }, client);
};

export const checkAchievements = (userId: string, client?: RpcClient): RpcResult<unknown> => {
  return execute('rpc_check_achievements', { p_user_id: userId }, client);
};

export const createTeacherProfile = (payload: Record<string, unknown>, client?: RpcClient): RpcResult<unknown> => {
  return execute('create_teacher_profile', payload, client);
};

export const recordQuestionAttempt = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('record_question_attempt', payload, client);
};

export const createRaidSession = (
  bossId: string,
  waveInfo: Record<string, unknown>,
  client?: RpcClient
): RpcResult<{ raid_id: string }> => {
  return execute('create_raid', { p_boss_id: bossId, p_wave_info: waveInfo }, client);
};

export const joinRaidSession = (
  raidId: string,
  client?: RpcClient
): RpcResult<{ participant_id: string }> => {
  return execute('join_raid', { p_raid_id: raidId }, client);
};

export const submitRaidAnswer = (
  payload: { raid_id: string; question_id: string; answer: string; time_spent: number },
  client?: RpcClient
): RpcResult<{ event_id: string }> => {
  return execute('submit_raid_answer', {
    p_raid_id: payload.raid_id,
    p_question_id: payload.question_id,
    p_answer: payload.answer,
    p_time: payload.time_spent,
  }, client);
};

export const finalizeRaidSession = (
  raidId: string,
  client?: RpcClient
): RpcResult<{ raid_id: string }> => {
  return execute('finalize_raid', { p_raid_id: raidId }, client);
};

export const fetchRaidStatus = (
  raidId: string,
  client?: RpcClient
): RpcResult<any> => {
  return execute('get_raid_status', { p_raid_id: raidId }, client);
};
