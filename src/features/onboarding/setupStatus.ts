export interface SetupStatusLike {
  authenticated?: boolean;
  needs_setup?: boolean;
  reason?: string;
  has_role?: boolean;
}

export interface SetupDecisionInput {
  status: SetupStatusLike | null | undefined;
  /**
   * Direct public.users.needs_setup value, when available. This disambiguates
   * legacy RPC responses that reported `needs_setup=true` just because
   * `school_id` was null from real new-account rows that are explicitly marked
   * as setup-incomplete.
   */
  profileNeedsSetup?: boolean | null;
}

export interface SetupDecision {
  needsSetup: boolean;
  reason: string;
}

export const decideNeedsSetup = ({ status, profileNeedsSetup }: SetupDecisionInput): SetupDecision => {
  if (!status?.authenticated) {
    return { needsSetup: false, reason: 'not_authenticated' };
  }

  if (!status.needs_setup) {
    return { needsSetup: false, reason: 'setup_status_false' };
  }

  if (status.reason === 'no_profile') {
    return { needsSetup: true, reason: 'missing_profile' };
  }

  if (profileNeedsSetup !== undefined && profileNeedsSetup !== null) {
    return profileNeedsSetup
      ? { needsSetup: true, reason: 'profile_needs_setup_true' }
      : { needsSetup: false, reason: 'profile_needs_setup_false' };
  }

  return { needsSetup: true, reason: 'setup_status_true' };
};
