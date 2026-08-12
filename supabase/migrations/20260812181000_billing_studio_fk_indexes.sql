-- Supporting indexes for Billing Studio foreign-key checks and review joins.

create index if not exists billing_pricing_versions_created_by_idx
  on public.billing_pricing_versions (created_by) where created_by is not null;
create index if not exists school_billing_quotes_pricing_version_idx
  on public.school_billing_quotes (pricing_version_code);
create index if not exists school_billing_quotes_created_by_idx
  on public.school_billing_quotes (created_by);
create index if not exists school_billing_quotes_reviewed_by_idx
  on public.school_billing_quotes (reviewed_by) where reviewed_by is not null;
create index if not exists school_billing_quote_events_school_idx
  on public.school_billing_quote_events (school_id, created_at desc);
create index if not exists school_billing_quote_events_actor_idx
  on public.school_billing_quote_events (actor_user_id) where actor_user_id is not null;
create index if not exists school_pilot_lifecycle_started_by_idx
  on public.school_pilot_lifecycle (started_by) where started_by is not null;
