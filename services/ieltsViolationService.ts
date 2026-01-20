import { supabase } from './supabaseClient';

interface IeltsViolationPayload {
  userId: string;
  module: string;
  moduleType?: string | null;
  attemptId?: number | string | null;
  sessionId?: string | null;
  reason: string;
  code?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const logIeltsViolation = async (payload: IeltsViolationPayload) => {
  try {
    const { error } = await supabase.from('ielts_violation_logs').insert({
      user_id: payload.userId,
      module: payload.module,
      module_type: payload.moduleType ?? null,
      attempt_id: payload.attemptId ?? null,
      session_id: payload.sessionId ?? null,
      reason: payload.reason,
      code: payload.code ?? null,
      metadata: payload.metadata ?? null,
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('IELTS violation log failed:', error);
    }
  } catch (error) {
    console.warn('IELTS violation log failed:', error);
  }
};
