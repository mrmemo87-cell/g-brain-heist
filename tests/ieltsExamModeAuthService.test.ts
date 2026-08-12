import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkIeltsExamModeAdminAccess,
  type IeltsExamModeAuthClient,
} from '../services/ieltsExamModeAuthService.js';

type MockClientOptions = {
  userId?: string | null;
  profile?: { role: string | null; is_admin: boolean | null } | null;
  isSuperadmin?: boolean;
  manageableExams?: unknown[];
};

const createAuthClient = (options: MockClientOptions): IeltsExamModeAuthClient => {
  const client: IeltsExamModeAuthClient = {
    auth: {
      getSession: async () => ({
        data: {
          session: options.userId === null ? null : { user: { id: options.userId ?? 'user-1' } },
        },
      }),
    },
    rpc: async (name: string) => {
      if (name === 'is_superadmin') {
        return { data: options.isSuperadmin ?? false, error: null };
      }
      if (name === 'rpc_ielts_list_manageable_exams') {
        return { data: options.manageableExams ?? [], error: null };
      }
      return { data: null, error: { message: `Unexpected RPC: ${name}` } };
    },
    from: (table: string) => {
      assert.equal(table, 'users');
      return {
        select: (columns: string) => {
          assert.equal(columns, 'role,is_admin');
          return {
            eq: (_column: string, _value: string) => ({
              maybeSingle: async () => ({ data: options.profile ?? null, error: null }),
            }),
          };
        },
      };
    },
  };
  return client;
};

test('IELTS Exam Mode guard allows Brains Heist school admins without legacy IELTS admin status', async () => {
  const decision = await checkIeltsExamModeAdminAccess(createAuthClient({
    profile: { role: 'school_admin', is_admin: false },
  }));

  assert.deepEqual(decision, { allowed: true, reason: 'role_school_admin' });
});

test('IELTS Exam Mode guard allows legacy users only when backend returns manageable exams', async () => {
  const legacyOnlyDecision = await checkIeltsExamModeAdminAccess(createAuthClient({
    profile: { role: 'student', is_admin: false },
    manageableExams: [],
  }));
  assert.deepEqual(legacyOnlyDecision, { allowed: false, reason: 'no_exam_mode_permission' });

  const manageableDecision = await checkIeltsExamModeAdminAccess(createAuthClient({
    profile: { role: 'student', is_admin: false },
    manageableExams: [{ id: 'exam-1' }],
  }));
  assert.deepEqual(manageableDecision, { allowed: true, reason: 'manageable_exam' });
});
