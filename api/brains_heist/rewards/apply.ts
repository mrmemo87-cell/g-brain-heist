import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureBoolean, ensureNumber } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

const LEVEL_MILESTONE_INTERVAL = 5;
const LEVEL_MILESTONE_GEMSTONE_REWARD = 1;

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to apply rewards', 405);
    }

    const student = requireStudent(req);
    type RewardBody = Partial<{
      xpDelta: unknown;
      coinsDelta: unknown;
      gemstonesDelta: unknown;
      applyLevelMilestone: unknown;
    }>;
    const body = (req.body ?? {}) as RewardBody;

    const xpDelta = ensureNumber(body.xpDelta ?? 0, 'xpDelta');
    const coinsDelta = ensureNumber(body.coinsDelta ?? 0, 'coinsDelta');
    const gemstonesDelta = ensureNumber(body.gemstonesDelta ?? 0, 'gemstonesDelta');
    const applyLevelMilestone = body.applyLevelMilestone === undefined
      ? false
      : ensureBoolean(body.applyLevelMilestone, 'applyLevelMilestone');

    const supabase = getSupabaseServerClient();
    const { data: currentProfile, error: profileError } = await supabase
      .from('users')
      .select('xp, coins, level, gemstones, username')
      .eq('id', student.userId)
      .single();

    if (profileError || !currentProfile) {
      throw new ApiError('PROFILE_NOT_FOUND', 'Failed to load profile', 404, profileError);
    }

    const previousLevel = currentProfile.level ?? 1;
    const nextXp = Math.max(0, (currentProfile.xp ?? 0) + xpDelta);
    const nextCoins = Math.max(0, (currentProfile.coins ?? 0) + coinsDelta);
    let nextGemstones = Math.max(0, (currentProfile.gemstones ?? 0) + gemstonesDelta);

    let xpStatus: Record<string, unknown> | null = null;
    if (xpDelta !== 0) {
      const { data: statusData } = await supabase.rpc('xp_status', { p_xp: nextXp });
      if (statusData && typeof statusData === 'object' && 'level' in statusData) {
        xpStatus = statusData as Record<string, unknown>;
      }
    }

    if (applyLevelMilestone && xpStatus && typeof xpStatus['level'] === 'number' && xpStatus['level'] > previousLevel) {
      if (xpStatus['level'] % LEVEL_MILESTONE_INTERVAL === 0) {
        nextGemstones += LEVEL_MILESTONE_GEMSTONE_REWARD;
      }
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .update({
        xp: nextXp,
        coins: nextCoins,
        gemstones: nextGemstones,
      })
      .eq('id', student.userId)
      .select('xp, coins, level, gemstones, username')
      .single();

    if (updateError || !updatedProfile) {
      throw new ApiError('REWARD_UPDATE_FAILED', 'Failed to apply rewards', 500, updateError);
    }

    sendSuccess(res, {
      profile: updatedProfile,
      xpStatus,
      previousLevel,
    });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
