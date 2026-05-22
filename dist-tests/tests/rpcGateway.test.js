import test from 'node:test';
import assert from 'node:assert/strict';
import { regenerateUserAp, notifyLevelUp, performHackAttempt, checkAchievements, createTeacherProfile, recordQuestionAttempt, notifyApFull } from '../services/rpcGateway.js';
const createMockClient = (mockData) => {
    const calls = [];
    const client = {
        rpc: async (name, params) => {
            calls.push({ name, params: params ?? {} });
            return { data: mockData, error: null };
        }
    };
    return { client, calls };
};
test('regenerateUserAp forwards payload to Supabase RPC', async () => {
    const { client, calls } = createMockClient([{ new_ap: 20 }]);
    const result = await regenerateUserAp('user-123', client);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        name: 'regenerate_user_ap',
        params: { user_id_param: 'user-123' }
    });
    assert.deepEqual(result.data, [{ new_ap: 20 }]);
});
test('notifyLevelUp sends structured payload', async () => {
    const { client, calls } = createMockClient(null);
    await notifyLevelUp('user-123', 5, 100, 200, client);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        name: 'notify_level_up',
        params: {
            user_id_param: 'user-123',
            new_level: 5,
            rewards_xp: 100,
            rewards_coins: 200
        }
    });
});
test('performHackAttempt bubbles Supabase response', async () => {
    const mockResponse = { result: 'win', attacker_deltas: { xp: 10, coins: 20 }, defender_deltas: { coins_loss: -15 }, shield_state: 'none' };
    const { client, calls } = createMockClient(mockResponse);
    const { data, error } = await performHackAttempt('defender-9', undefined, client);
    assert.equal(error, null);
    assert.equal(calls[0]?.name, 'rpc_hack_attempt');
    assert.deepEqual(calls[0]?.params, { p_defender_id: 'defender-9', p_request_id: null });
    assert.equal(data, mockResponse);
});
test('checkAchievements invokes rpc_check_achievements with user id', async () => {
    const { client, calls } = createMockClient([{ newly_earned: [] }]);
    await checkAchievements('user-abc', client);
    assert.deepEqual(calls[0], {
        name: 'rpc_check_achievements',
        params: { p_user_id: 'user-abc' }
    });
});
test('createTeacherProfile allows arbitrary payload passthrough', async () => {
    const payload = { school_name: 'Cyber High', subject_specializations: ['ICT'] };
    const { client, calls } = createMockClient({ success: true });
    await createTeacherProfile(payload, client);
    assert.deepEqual(calls[0], {
        name: 'create_teacher_profile',
        params: payload
    });
});
test('recordQuestionAttempt delegates to RPC with provided arguments', async () => {
    const payload = { p_question_id: 'q-1', p_answer_given: 'A', p_time_taken: 12 };
    const { client, calls } = createMockClient({ awarded_xp: 5 });
    const result = await recordQuestionAttempt(payload, client);
    assert.equal(result.error, null);
    assert.deepEqual(calls[0], {
        name: 'record_question_attempt',
        params: payload
    });
});
test('notifyApFull triggers notification RPC', async () => {
    const { client, calls } = createMockClient(null);
    await notifyApFull('user-xyz', client);
    assert.deepEqual(calls[0], {
        name: 'notify_ap_full',
        params: { user_id_param: 'user-xyz' }
    });
});
