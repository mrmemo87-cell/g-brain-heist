-- Lightweight, privacy-safe IELTS public launch funnel analytics.
create table if not exists public.ielts_funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  session_id text null,
  event_name text not null,
  route text null,
  source text null,
  medium text null,
  campaign text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ielts_funnel_events_event_name_check check (event_name in (
    'landing_view',
    'start_free_assessment_click',
    'auth_required_for_diagnostic',
    'diagnostic_started',
    'diagnostic_completed',
    'result_viewed',
    'prime_upsell_click',
    'checkout_started',
    'checkout_opened',
    'checkout_completed',
    'subscription_activated',
    'funnel_error'
  )),
  constraint ielts_funnel_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

comment on table public.ielts_funnel_events is 'Privacy-safe IELTS launch funnel analytics. Do not store raw answers, essays, recordings, feedback, emails, names, or payment details in metadata.';

create index if not exists ielts_funnel_events_event_created_idx on public.ielts_funnel_events (event_name, created_at desc);
create index if not exists ielts_funnel_events_created_idx on public.ielts_funnel_events (created_at desc);
create index if not exists ielts_funnel_events_user_idx on public.ielts_funnel_events (user_id) where user_id is not null;

alter table public.ielts_funnel_events enable row level security;

create policy "ielts funnel authenticated own inserts"
  on public.ielts_funnel_events
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

create policy "ielts funnel anonymous inserts"
  on public.ielts_funnel_events
  for insert
  to anon
  with check (user_id is null);

create policy "ielts funnel admin read"
  on public.ielts_funnel_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.is_admin = true or lower(coalesce(u.role, '')) in ('admin', 'superadmin', 'school_admin'))
    )
  );
