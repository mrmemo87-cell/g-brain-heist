import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './config';

let cachedClient: SupabaseClient | null = null;

export const getSupabaseServerClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();

  cachedClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
};
