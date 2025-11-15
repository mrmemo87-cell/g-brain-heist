import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureOptionalNumber, ensureString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to answer PvP questions', 405);
    }

    const student = requireStudent(req);
    type PvpAnswerBody = Partial<{
      battleId: unknown;
      battle_id: unknown;
      questionId: unknown;
      question_id: unknown;
      answer: unknown;
      submitted_answer: unknown;
      timeTaken: unknown;
      time_taken_seconds: unknown;
    }>;
    const body = (req.body ?? {}) as PvpAnswerBody;
    const payload = {
      battle_id: ensureString(body.battleId ?? body.battle_id, 'battleId'),
      question_id: ensureString(body.questionId ?? body.question_id, 'questionId'),
      answer: ensureString(body.answer ?? body.submitted_answer, 'answer'),
      time_taken_seconds: ensureOptionalNumber(body.timeTaken ?? body.time_taken_seconds, 'timeTaken'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('submit_bh_pvp_answer', {
      p_battle_id: payload.battle_id,
      p_question_id: payload.question_id,
      p_student_id: student.userId,
      p_answer: payload.answer,
      p_time_taken_seconds: payload.time_taken_seconds,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { answer: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
