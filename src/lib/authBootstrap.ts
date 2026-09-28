import type { Profile } from '../../types';
import type { SchoolCapabilities } from '../../services/schoolAdminService';
export interface AuthBootstrap {
  user_id: string; email: string | null; email_verified: boolean; needs_setup: boolean; is_banned: boolean;
  profile: Profile | null;
  school: { id: string; name: string; logo_url: string | null } | null;
  capabilities: SchoolCapabilities | null; is_superadmin: boolean; has_parent_workspace: boolean;
}
/** Share concurrent requests only; never persist authorization or cache a settled result. */
export function createBootstrapFlight<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  let pending: { key: string; controller: AbortController; promise: Promise<T> } | null = null;
  return {
    load(key: string): Promise<T> {
      if (pending?.key === key) return pending.promise;
      pending?.controller.abort();
      const controller = new AbortController();
      const promise = fetcher(controller.signal).then(value => {
        if (controller.signal.aborted) throw new Error('Sign-in changed. Please try again.');
        return value;
      }).finally(() => { if (pending?.promise === promise) pending = null; });
      pending = { key, controller, promise };
      return promise;
    },
    clear() { pending?.controller.abort(); pending = null; },
  };
}
/** Routine resume checks must not reset an active lesson when authority is unchanged. */
export function sameBootstrapAuthority(a: AuthBootstrap, b: AuthBootstrap): boolean {
  const authority = (value: AuthBootstrap) => JSON.stringify([
    value.user_id, value.email_verified, value.needs_setup, value.is_banned,
    value.capabilities, value.is_superadmin, value.has_parent_workspace,
    value.profile?.role, value.profile?.school_id, value.profile?.required_changes,
  ]);
  return authority(a) === authority(b);
}
