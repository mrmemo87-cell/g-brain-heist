import { createClient } from '@supabase/supabase-js';
import { getRequiredEnvVar } from './env.js';

// Supabase configuration from environment variables
const supabaseUrl = getRequiredEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getRequiredEnvVar('VITE_SUPABASE_ANON_KEY');

// Create Supabase client instance with enhanced settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    // Set fetch options for better connection handling
    fetch: (url, options) => {
      // Edge Functions need longer timeout (GPT calls can take 30-60s)
      const isEdgeFunction = typeof url === 'string' && url.includes('/functions/v1/');
      const timeoutMs = isEdgeFunction ? 120000 : 30000; // 2 min for functions, 30s for others
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  db: {
    schema: 'public',
  },
});

// Helper function to get current user
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Helper function to get current session
export const getCurrentSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

// Export types for convenience
export type { User, Session } from '@supabase/supabase-js';
