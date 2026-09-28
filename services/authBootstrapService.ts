import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { createBootstrapFlight, type AuthBootstrap } from '../src/lib/authBootstrap';
const flight = createBootstrapFlight<AuthBootstrap>(async signal => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const { data, error } = await supabase.rpc('rpc_auth_bootstrap_v1').abortSignal(controller.signal);
    if (error) throw new Error(controller.signal.aborted
      ? 'Sign-in took too long. Check your connection and retry.' : error.message);
    if (!data || typeof data.user_id !== 'string' || typeof data.email_verified !== 'boolean'
      || typeof data.needs_setup !== 'boolean' || typeof data.is_banned !== 'boolean'
      || typeof data.is_superadmin !== 'boolean' || typeof data.has_parent_workspace !== 'boolean') {
      throw new Error('Unable to verify your account. Please retry.');
    }
    const result = data as AuthBootstrap;
    if (result.profile && result.profile.id !== result.user_id) throw new Error('Account identity mismatch.');
    if (result.profile && result.school) result.profile = { ...result.profile, school_name: result.school.name, school_logo_url: result.school.logo_url };
    return result;
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
});
export async function getAuthBootstrap(session: Session): Promise<AuthBootstrap> {
  const result = await flight.load(session.access_token);
  if (result.user_id !== session.user.id) throw new Error('Your account changed. Please sign in again.');
  return result;
}
export const clearAuthBootstrap = () => flight.clear();
