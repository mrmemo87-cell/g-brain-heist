import { supabase } from './supabaseClient.js';

export type RpcClient = Pick<typeof supabase, 'rpc'>;

type RpcResult<T> = Promise<{ data: T; error: { message?: string } | null }>;

type NotificationParams = Record<string, unknown>;

type AssignmentAnswerSubmission = {
  success?: boolean;
  is_correct?: boolean | null;
  grading_status?: 'graded' | 'under_review' | 'reviewing';
  pending_review?: boolean;
  points_earned?: number;
};

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
  requestId?: string,
  client?: RpcClient
): RpcResult<{ result: unknown }> => {
  return execute('rpc_hack_attempt', { p_defender_id: defenderId, p_request_id: requestId ?? null }, client);
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

export const createAssignment = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_create_assignment', payload, client);
};

export const getAssignmentsForTeacher = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_assignments_for_teacher', payload, client);
};

export const deleteTeacherAssignment = (
  assignmentId: string,
  client?: RpcClient
): RpcResult<boolean> => {
  return execute('rpc_delete_teacher_assignment', { p_assignment_id: assignmentId }, client);
};

export const updateTeacherAssignment = (
  assignmentId: string,
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_update_teacher_assignment', { p_assignment_id: assignmentId, ...payload }, client);
};

export const getTeacherAssignmentSuccessSummary = (
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_teacher_assignment_success_summary', {}, client);
};

export const getStudentsForAssignment = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_students_for_assignment', payload, client);
};

export const getStudentActiveAssignment = (client?: RpcClient): RpcResult<unknown> => {
  return execute('rpc_get_student_active_assignment_v2', {}, client);
};

export const getStudentPendingAssignments = (client?: RpcClient): RpcResult<unknown> => {
  return execute('rpc_get_student_pending_assignments_v2', {}, client);
};

export const submitAssignmentResult = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_submit_assignment_result_v2', payload, client);
};

export const submitAssignmentAnswer = async (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<AssignmentAnswerSubmission> => {
  const result = await execute<AssignmentAnswerSubmission>('rpc_submit_assignment_answer_v2', payload, client);

  if (!result.error && !client && result.data?.grading_status === 'under_review') {
    const assignmentId = typeof payload['p_assignment_id'] === 'string' ? payload['p_assignment_id'] : null;
    const questionId = typeof payload['p_question_id'] === 'string' ? payload['p_question_id'] : null;
    if (assignmentId && questionId) {
      void supabase.functions.invoke('assignment_short_answer_review', {
        body: { assignmentId, questionId },
      }).then(({ error }) => {
        if (error) console.warn('[short-answer-review] Background review dispatch failed:', error.message);
      }).catch((error) => {
        console.warn('[short-answer-review] Background review dispatch failed:', error);
      });
    }
  }

  return result;
};

export const teacherAssignmentReport = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_teacher_assignment_report', payload, client);
};

export const getAssignmentStudentAnswers = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_assignment_student_answers', payload, client);
};

export const getAssignmentQuestionAnalysis = (
  payload: Record<string, unknown>,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_assignment_question_analysis', payload, client);
};

export const getStudentCompletedAssignments = (
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_student_completed_assignments_v2', {}, client);
};

export const checkAssignmentAchievements = (
  userId: string,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('check_assignment_achievements', { p_user_id: userId }, client);
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

export const getMyAssignmentAnswers = (
  assignmentId: string,
  client?: RpcClient
): RpcResult<unknown> => {
  return execute('rpc_get_my_assignment_answers_v2', { p_assignment_id: assignmentId }, client);
};
