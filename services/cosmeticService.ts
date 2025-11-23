import { supabase } from './supabaseClient';

const NEON_FRAME_ITEM_ID = 'item_cosmetic_frame';

/**
 * Returns the set of user IDs that currently have the neon frame activated.
 */
export const fetchNeonFrameOwners = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('inventory')
    .select('user_id')
    .in('user_id', userIds)
    .eq('state', 'active')
    .eq('kind', 'cosmetic')
    .eq('item_id', NEON_FRAME_ITEM_ID);

  if (error) {
    console.warn('Failed to fetch neon frame owners:', error.message);
    return new Set();
  }

  return new Set((data || []).map((row: { user_id: string }) => row.user_id));
};
