-- Phase 1 FTUE foundation: minimal durable onboarding state + optional event log.

create table if not exists public.user_onboarding (
  user_id uuid primary key references public.users(id) on delete cascade,
  segment text check (segment in ('school_student', 'solo_learner', 'teacher', 'school_admin')),
  context_type text check (context_type in ('school', 'solo', 'teacher_trial', 'admin_school')),
  context_id uuid,
  current_step text check (current_step in (
    'intent',
    'school_confirm',
    'identity',
    'placement',
    'goal',
    'mission_brief',
    'mission_started',
    'reward_reveal',
    'teacher_context',
    'class_setup',
    'starter_mission',
    'invite_share',
    'admin_checklist',
    'admin_action',
    'dashboard_reveal',
    'complete'
  )),
  completed_steps jsonb not null default '[]'::jsonb,
  core_completed_at timestamptz,
  first_value_started_at timestamptz,
  first_value_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_onboarding_segment
  on public.user_onboarding (segment)
  where core_completed_at is null;

create index if not exists idx_user_onboarding_current_step
  on public.user_onboarding (current_step)
  where core_completed_at is null;

alter table public.user_onboarding enable row level security;

drop policy if exists "user_onboarding_select_own" on public.user_onboarding;
create policy "user_onboarding_select_own"
  on public.user_onboarding
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_onboarding_insert_own" on public.user_onboarding;
create policy "user_onboarding_insert_own"
  on public.user_onboarding
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_onboarding_update_own" on public.user_onboarding;
create policy "user_onboarding_update_own"
  on public.user_onboarding
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_onboarding_delete_own" on public.user_onboarding;
create policy "user_onboarding_delete_own"
  on public.user_onboarding
  for delete
  using (auth.uid() = user_id);

create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  event text not null,
  segment text,
  context_type text,
  step text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_onboarding_events_user_created
  on public.onboarding_events (user_id, created_at desc);

create index if not exists idx_onboarding_events_event_created
  on public.onboarding_events (event, created_at desc);

alter table public.onboarding_events enable row level security;

drop policy if exists "onboarding_events_insert_own" on public.onboarding_events;
create policy "onboarding_events_insert_own"
  on public.onboarding_events
  for insert
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "onboarding_events_select_own" on public.onboarding_events;
create policy "onboarding_events_select_own"
  on public.onboarding_events
  for select
  using (auth.uid() = user_id);
