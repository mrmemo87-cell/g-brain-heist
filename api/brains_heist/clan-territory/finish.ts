import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureNumber, ensureString, ensureOptionalNumber } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to claim clan territory rewards', 405);
    }

    const student = requireStudent(req);
    type FinishBody = Partial<{
      roomId: unknown;
      playerId: unknown;
      coins: unknown;
      xp: unknown;
      gems: unknown;
      battleScore: unknown;
      questionsCorrect: unknown;
      questionsAnswered: unknown;
    }>;
    const body = (req.body ?? {}) as FinishBody;

    const payload = {
      room_id: ensureString(body.roomId, 'roomId'),
      player_id: ensureString(body.playerId, 'playerId'),
      coins: ensureNumber(body.coins, 'coins'),
      xp: ensureNumber(body.xp, 'xp'),
      gems: ensureOptionalNumber(body.gems, 'gems') ?? 0,
      battle_score: ensureNumber(body.battleScore, 'battleScore'),
      questions_correct: ensureNumber(body.questionsCorrect, 'questionsCorrect'),
      questions_answered: ensureNumber(body.questionsAnswered, 'questionsAnswered'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('claim_clan_territory_rewards', {
      p_student_id: student.userId,
      p_room_id: payload.room_id,
      p_player_id: payload.player_id,
      p_coins: payload.coins,
      p_xp: payload.xp,
      p_gems: payload.gems,
      p_battle_score: payload.battle_score,
      p_questions_correct: payload.questions_correct,
      p_questions_answered: payload.questions_answered,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { claimed: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
