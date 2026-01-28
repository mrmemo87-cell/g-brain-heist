import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureOptionalString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET or POST for next mission', 405);
    }

    const student = requireStudent(req);
    type NextBody = Partial<{ topicId: unknown; topic_id: unknown }>;
    const body = (req.method === 'POST' ? (req.body ?? {}) : {}) as NextBody;
    const topicHint = ensureOptionalString(body.topicId ?? body.topic_id, 'topicId');

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('get_next_brains_heist_mission', {
      p_student_id: student.userId,
      p_topic_id: topicHint,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { suggestion: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
