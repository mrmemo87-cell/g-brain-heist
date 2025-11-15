import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { requireQueryValue } from '../_lib/request';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET to fetch battle state', 405);
    }

    const student = requireStudent(req);
    const battleId = requireQueryValue(req, 'battleId');
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase.rpc('get_bh_pvp_state', {
      p_battle_id: battleId,
      p_student_id: student.userId,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { state: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
