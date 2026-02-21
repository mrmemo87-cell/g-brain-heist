import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './env.js';
// Supabase configuration from environment variables
// Use getEnvVar (non-throwing) so the app can render a friendly error screen
// instead of hard-crashing with a white page when vars are missing.
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') ?? '';
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') ?? '';
/** True when required Supabase env vars are missing. UI should show a config
 *  error screen instead of attempting network requests. */
export const isMissingSupabaseConfig = !supabaseUrl || !supabaseAnonKey;
if (isMissingSupabaseConfig) {
    console.error('[supabaseClient] Missing required environment variables: ' +
        [!supabaseUrl && 'VITE_SUPABASE_URL', !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY']
            .filter(Boolean)
            .join(', ') +
        '. The app will display a configuration error screen.');
}
// Create Supabase client instance with enhanced settings
// (client is still created with empty strings so downstream imports don't blow up;
//  all runtime calls will be gated behind the isMissingSupabaseConfig check.)
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
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
    if (error)
        throw error;
    return user;
};
// Helper function to get current session
export const getCurrentSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error)
        throw error;
    return session;
};
