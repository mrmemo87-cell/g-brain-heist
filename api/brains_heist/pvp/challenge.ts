import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureNumber, ensureOptionalNumber, ensureOptionalString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to create PvP challenges', 405);
    }

    const student = requireStudent(req);
    type ChallengeBody = Partial<{
      topicId: unknown;
      topic_id: unknown;
      questionCount: unknown;
      timeLimitSeconds: unknown;
      time_limit_seconds: unknown;
      wagerCoins: unknown;
      wager_coins: unknown;
    }>;
    const body = (req.body ?? {}) as ChallengeBody;

    const payload = {
      topic_id: ensureOptionalString(body.topicId ?? body.topic_id, 'topicId'),
      question_count: body.questionCount ? ensureNumber(body.questionCount, 'questionCount') : 5,
      time_limit_seconds: ensureOptionalNumber(body.timeLimitSeconds ?? body.time_limit_seconds, 'timeLimitSeconds'),
      wager_coins: ensureOptionalNumber(body.wagerCoins ?? body.wager_coins, 'wagerCoins'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('create_bh_pvp_challenge', {
      p_creator_id: student.userId,
      p_topic_id: payload.topic_id,
      p_question_count: payload.question_count,
      p_time_limit_seconds: payload.time_limit_seconds,
      p_wager_coins: payload.wager_coins,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { challenge: data }, 201);
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
