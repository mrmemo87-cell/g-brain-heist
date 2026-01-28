import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureOptionalNumber, ensureOptionalString, ensureString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

interface AnswerPayload {
  mission_id: string;
  question_id: string;
  submitted_answer: string;
  time_taken_seconds?: number;
  support_note?: string;
}

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to submit answers', 405);
    }

    const student = requireStudent(req);
    type AnswerBody = Partial<{
      missionId: unknown;
      mission_id: unknown;
      questionId: unknown;
      question_id: unknown;
      answer: unknown;
      submitted_answer: unknown;
      timeTaken: unknown;
      time_taken_seconds: unknown;
      supportNote: unknown;
      support_note: unknown;
    }>;
    const body = (req.body ?? {}) as AnswerBody;
    const payload: AnswerPayload = {
      mission_id: ensureString(body.missionId ?? body.mission_id, 'missionId'),
      question_id: ensureString(body.questionId ?? body.question_id, 'questionId'),
      submitted_answer: ensureString(body.answer ?? body.submitted_answer, 'answer'),
      time_taken_seconds: ensureOptionalNumber(body.timeTaken ?? body.time_taken_seconds, 'timeTaken'),
      support_note: ensureOptionalString(body.supportNote ?? body.support_note, 'supportNote'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('submit_brains_heist_answer', {
      p_student_id: student.userId,
      p_mission_id: payload.mission_id,
      p_question_id: payload.question_id,
      p_answer: payload.submitted_answer,
      p_time_taken_seconds: payload.time_taken_seconds,
      p_support_note: payload.support_note,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { attempt: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
