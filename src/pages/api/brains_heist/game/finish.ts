import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureBoolean, ensureOptionalNumber, ensureString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to finish a mission', 405);
    }

    const student = requireStudent(req);
    type FinishBody = Partial<{
      missionId: unknown;
      mission_id: unknown;
      abandoned: unknown;
      remainingLives: unknown;
      remaining_lives: unknown;
    }>;
    const body = (req.body ?? {}) as FinishBody;

    const payload = {
      mission_id: ensureString(body.missionId ?? body.mission_id, 'missionId'),
      abandoned: body.abandoned === undefined ? false : ensureBoolean(body.abandoned, 'abandoned'),
      remaining_lives: ensureOptionalNumber(body.remainingLives ?? body.remaining_lives, 'remainingLives'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('finish_brains_heist_mission', {
      p_student_id: student.userId,
      p_mission_id: payload.mission_id,
      p_abandoned: payload.abandoned,
      p_remaining_lives: payload.remaining_lives,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { summary: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
