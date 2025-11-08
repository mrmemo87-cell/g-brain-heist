import { createClient } from '@supabase/supabase-js';

const envSource: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env as Record<string, string | undefined>
    : (typeof process !== 'undefined' ? process.env : {});

// Supabase configuration from environment variables
const supabaseUrl = envSource['VITE_SUPABASE_URL'];
const supabaseAnonKey = envSource['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

// Create Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
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
