import { supabase } from './supabaseClient.js';
const withClient = (client) => client ?? supabase;
const execute = (name, params, client) => {
    return withClient(client).rpc(name, params);
};
export const regenerateUserAp = (userId, client) => {
    return execute('regenerate_user_ap', { user_id_param: userId }, client);
};
export const notifyApFull = (userId, client) => {
    return execute('notify_ap_full', { user_id_param: userId }, client);
};
export const notifyLevelUp = (userId, newLevel, rewardsXp, rewardsCoins, client) => {
    return execute('notify_level_up', {
        user_id_param: userId,
        new_level: newLevel,
        rewards_xp: rewardsXp,
        rewards_coins: rewardsCoins
    }, client);
};
export const notifyAttackIncoming = (payload, client) => {
    return execute('notify_attack_incoming', payload, client);
};
export const notifyCoinsLost = (payload, client) => {
    return execute('notify_coins_lost', payload, client);
};
export const notifyRevengeAvailable = (payload, client) => {
    return execute('notify_revenge_available', payload, client);
};
export const notifyAttackDefended = (payload, client) => {
    return execute('notify_attack_defended', payload, client);
};
export const performHackAttempt = (defenderId, requestId, client) => {
    return execute('rpc_hack_attempt', { p_defender_id: defenderId, p_request_id: requestId ?? null }, client);
};
export const checkAchievements = (userId, client) => {
    return execute('rpc_check_achievements', { p_user_id: userId }, client);
};
export const createTeacherProfile = (payload, client) => {
    return execute('create_teacher_profile', payload, client);
};
export const recordQuestionAttempt = (payload, client) => {
    return execute('record_question_attempt', payload, client);
};
export const createAssignment = (payload, client) => {
    return execute('rpc_create_assignment', payload, client);
};
export const getAssignmentsForTeacher = (payload, client) => {
    return execute('rpc_get_assignments_for_teacher', payload, client);
};
export const getStudentsForAssignment = (payload, client) => {
    return execute('rpc_get_students_for_assignment', payload, client);
};
export const getStudentActiveAssignment = (client) => {
    return execute('rpc_get_student_active_assignment', {}, client);
};
export const getStudentPendingAssignments = (client) => {
    return execute('rpc_get_student_pending_assignments', {}, client);
};
export const submitAssignmentResult = (payload, client) => {
    return execute('rpc_submit_assignment_result', payload, client);
};
export const submitAssignmentAnswer = (payload, client) => {
    return execute('rpc_submit_assignment_answer', payload, client);
};
export const teacherAssignmentReport = (payload, client) => {
    return execute('rpc_teacher_assignment_report', payload, client);
};
export const getAssignmentStudentAnswers = (payload, client) => {
    return execute('rpc_get_assignment_student_answers', payload, client);
};
export const getAssignmentQuestionAnalysis = (payload, client) => {
    return execute('rpc_get_assignment_question_analysis', payload, client);
};
export const getStudentCompletedAssignments = (client) => {
    return execute('rpc_get_student_completed_assignments', {}, client);
};
export const checkAssignmentAchievements = (userId, client) => {
    return execute('check_assignment_achievements', { p_user_id: userId }, client);
};
export const createRaidSession = (bossId, waveInfo, client) => {
    return execute('create_raid', { p_boss_id: bossId, p_wave_info: waveInfo }, client);
};
export const joinRaidSession = (raidId, client) => {
    return execute('join_raid', { p_raid_id: raidId }, client);
};
export const submitRaidAnswer = (payload, client) => {
    return execute('submit_raid_answer', {
        p_raid_id: payload.raid_id,
        p_question_id: payload.question_id,
        p_answer: payload.answer,
        p_time: payload.time_spent,
    }, client);
};
export const finalizeRaidSession = (raidId, client) => {
    return execute('finalize_raid', { p_raid_id: raidId }, client);
};
export const fetchRaidStatus = (raidId, client) => {
    return execute('get_raid_status', { p_raid_id: raidId }, client);
};
export const getMyAssignmentAnswers = (assignmentId, client) => {
    return execute('rpc_get_my_assignment_answers', { p_assignment_id: assignmentId }, client);
};
