import { supabase } from './supabaseClient';

const NEON_FRAME_ITEM_ID = 'item_cosmetic_frame';
const FLICKER_THEME_ITEM_ID = 'item_cosmetic_theme';
const GLITCH_THEME_ITEM_ID = FLICKER_THEME_ITEM_ID; // Alias for backwards compatibility
const GLITCH_EFFECT_ITEM_ID = 'item_cosmetic_glitch';

/**
 * Returns the set of user IDs that currently have the neon frame activated.
 * Queries from the users table column instead of inventory to avoid RLS restrictions.
 */
export const fetchNeonFrameOwners = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    // Query from users table which should have fewer RLS restrictions
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('active_cosmetic_frame', 'neon');

    if (error) {
      console.warn('Failed to fetch neon frame owners from users table:', error.message);
      // Fallback to inventory query
      return await fetchNeonFrameOwnersFromInventory(userIds);
    }

    const result = new Set((data || []).map((row: { id: string }) => row.id));
    return result;
  } catch (e) {
    console.error('Error fetching neon frame owners:', e);
    return new Set();
  }
};

/**
 * Returns the set of user IDs that currently have the flicker theme activated.
 * Queries from the users table column instead of inventory to avoid RLS restrictions.
 */
export const fetchFlickerThemeOwners = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    // Query from users table which should have fewer RLS restrictions
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('active_cosmetic_theme', 'glitch');

    if (error) {
      console.warn('Failed to fetch flicker theme owners from users table:', error.message);
      // Fallback to inventory query
      return await fetchFlickerThemeOwnersFromInventory(userIds);
    }

    const result = new Set((data || []).map((row: { id: string }) => row.id));
    console.log('[Cosmetic] Flicker theme owners fetched:', result);
    return result;
  } catch (e) {
    console.error('Error fetching glitch theme owners:', e);
    return new Set();
  }
};

/**
 * Fallback: Query inventory table directly for active neon cosmetics.
 */
export const fetchNeonFrameOwnersFromInventory = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('user_id')
      .in('user_id', userIds)
      .eq('state', 'active')
      .eq('kind', 'cosmetic')
      .eq('item_id', NEON_FRAME_ITEM_ID);

    if (error) {
      console.warn('Failed to fetch neon frame owners from inventory:', error.message);
      return new Set();
    }

    return new Set((data || []).map((row: { user_id: string }) => row.user_id));
  } catch (e) {
    console.error('Error fetching neon frames from inventory:', e);
    return new Set();
  }
};

/**
 * Fallback: Query inventory table directly for active flicker cosmetics.
 */
export const fetchFlickerThemeOwnersFromInventory = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('user_id')
      .in('user_id', userIds)
      .eq('state', 'active')
      .eq('kind', 'cosmetic')
      .eq('item_id', GLITCH_THEME_ITEM_ID);

    if (error) {
      console.warn('Failed to fetch flicker cosmetics from inventory:', error.message);
      return new Set();
    }

    return new Set((data || []).map((row: { user_id: string }) => row.user_id));
  } catch (e) {
    console.error('Error fetching glitch themes from inventory:', e);
    return new Set();
  }
};

/**
 * Query users table for users with active glitch effect cosmetic.
 * The glitch effect is stored in active_cosmetic_effect column.
 */
export const fetchGlitchEffectOwners = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('active_cosmetic_effect', 'glitch');

    if (error) {
      console.warn('Failed to fetch glitch effect owners:', error.message);
      return new Set();
    }

    const result = new Set((data || []).map((row: { id: string }) => row.id));
    console.log('[Cosmetic] Glitch effect owners fetched:', result);
    return result;
  } catch (e) {
    console.error('Error fetching glitch effect owners:', e);
    return new Set();
  }
};

/**
 * Fallback: Query inventory table directly for active glitch effect cosmetics.
 */
export const fetchGlitchEffectOwnersFromInventory = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('user_id')
      .in('user_id', userIds)
      .eq('state', 'active')
      .eq('kind', 'cosmetic')
      .eq('item_id', GLITCH_EFFECT_ITEM_ID);

    if (error) {
      console.warn('Failed to fetch glitch effect owners from inventory:', error.message);
      return new Set();
    }

    return new Set((data || []).map((row: { user_id: string }) => row.user_id));
  } catch (e) {
    console.error('Error fetching glitch effects from inventory:', e);
    return new Set();
  }
};

/**
 * Fallback RPC-based approach to fetch neon frame owners.
 * Useful if direct queries have RLS restrictions.
 */
export const fetchNeonFrameOwnersViaRPC = async (userIds: string[]): Promise<Set<string>> => {
  if (!userIds.length) {
    return new Set();
  }

  try {
    const { data, error } = await supabase.rpc('rpc_get_users_with_neon', {
      p_user_ids: userIds,
    });

    if (error) {
      console.warn('Failed to fetch neon frame owners via RPC:', error.message);
      return new Set();
    }

    return new Set((data || []).map((row: { user_id: string }) => row.user_id));
  } catch (e) {
    console.error('Error in RPC neon fetch:', e);
    return new Set();
  }
};
