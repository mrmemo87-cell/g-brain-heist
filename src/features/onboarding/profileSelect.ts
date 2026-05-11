// Keep this list limited to columns that exist in all currently deployed
// public.users schemas. school_name is derived elsewhere from schools and is
// not guaranteed to be a physical users column in production.
export const ONBOARDING_PROFILE_SELECT = 'id, email, username, grade, batch, role, school_id, needs_setup, tutorial_completed, account_tier';
