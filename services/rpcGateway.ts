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
