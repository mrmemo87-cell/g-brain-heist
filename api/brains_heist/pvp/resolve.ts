import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to resolve PvP battles', 405);
    }

    const student = requireStudent(req);
    type ResolveBody = Partial<{ battleId: unknown; battle_id: unknown }>;
    const body = (req.body ?? {}) as ResolveBody;
    const battleId = ensureString(body.battleId ?? body.battle_id, 'battleId');

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('resolve_bh_pvp_battle', {
      p_battle_id: battleId,
      p_student_id: student.userId,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { result: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
