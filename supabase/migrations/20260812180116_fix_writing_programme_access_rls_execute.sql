-- Programme-gated RLS policies execute this private helper as the authenticated role.
-- Keep the helper private and grant only the minimum privilege required for policy evaluation.
grant execute on function private.actor_has_programme_access(text, boolean) to authenticated;

comment on function private.actor_has_programme_access(text, boolean) is
  'Private RLS helper. EXECUTE is granted only to authenticated because programme-gated policies invoke it; the private schema is not API-exposed.';
