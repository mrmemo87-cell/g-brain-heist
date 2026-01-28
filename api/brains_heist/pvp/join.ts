import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to join PvP battles', 405);
    }

    const student = requireStudent(req);
    type JoinBody = Partial<{ challengeCode: unknown; challenge_code: unknown }>;
    const body = (req.body ?? {}) as JoinBody;
    const challengeCode = ensureString(body.challengeCode ?? body.challenge_code, 'challengeCode');

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('join_bh_pvp_battle', {
      p_challenge_code: challengeCode,
      p_student_id: student.userId,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { battle: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
