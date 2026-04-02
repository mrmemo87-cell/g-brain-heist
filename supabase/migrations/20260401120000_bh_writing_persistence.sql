-- Brains Heist Writing production persistence

create table if not exists public.bh_writing_student_profiles (
  student_id uuid primary key references public.users(id) on delete cascade,
  grade int not null,
  genre text not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bh_writing_student_states (
  student_id uuid primary key references public.users(id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bh_writing_attempts (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_daily_submissions (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_daily_evaluations (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_memory_snapshots (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_prompt_bank (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_review_signals (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bh_writing_calibration_followups (
  student_id uuid primary key references public.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bh_writing_profiles_grade on public.bh_writing_student_profiles(grade);
create index if not exists idx_bh_writing_profiles_genre on public.bh_writing_student_profiles(genre);
create index if not exists idx_bh_writing_attempts_created_at on public.bh_writing_attempts(created_at);
create index if not exists idx_bh_writing_prompts_created_at on public.bh_writing_prompt_bank(created_at);
create index if not exists idx_bh_writing_signals_created_at on public.bh_writing_review_signals(created_at);

alter table public.bh_writing_student_profiles enable row level security;
alter table public.bh_writing_student_states enable row level security;
alter table public.bh_writing_attempts enable row level security;
alter table public.bh_writing_weekly_plans enable row level security;
alter table public.bh_writing_daily_tasks enable row level security;
alter table public.bh_writing_daily_submissions enable row level security;
alter table public.bh_writing_daily_evaluations enable row level security;
alter table public.bh_writing_monthly_reports enable row level security;
alter table public.bh_writing_memory_snapshots enable row level security;
alter table public.bh_writing_prompt_bank enable row level security;
alter table public.bh_writing_review_signals enable row level security;
alter table public.bh_writing_calibration_followups enable row level security;

create or replace function public.is_bh_admin_or_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (u.is_admin = true or u.role in ('admin','teacher'))
  );
$$;

create policy "bh writing profile self select" on public.bh_writing_student_profiles
for select using (student_id = auth.uid() or public.is_bh_admin_or_teacher());
create policy "bh writing profile self upsert" on public.bh_writing_student_profiles
for all using (student_id = auth.uid() or public.is_bh_admin_or_teacher())
with check (student_id = auth.uid() or public.is_bh_admin_or_teacher());

create policy "bh writing states self" on public.bh_writing_student_states
for all using (student_id = auth.uid() or public.is_bh_admin_or_teacher())
with check (student_id = auth.uid() or public.is_bh_admin_or_teacher());

create policy "bh writing attempts read" on public.bh_writing_attempts
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing attempts write" on public.bh_writing_attempts
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing weekly plans read" on public.bh_writing_weekly_plans
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing weekly plans write" on public.bh_writing_weekly_plans
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing daily tasks read" on public.bh_writing_daily_tasks
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing daily tasks write" on public.bh_writing_daily_tasks
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing submissions read" on public.bh_writing_daily_submissions
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing submissions write" on public.bh_writing_daily_submissions
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing evaluations read" on public.bh_writing_daily_evaluations
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing evaluations write" on public.bh_writing_daily_evaluations
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing monthly reports read" on public.bh_writing_monthly_reports
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing monthly reports write" on public.bh_writing_monthly_reports
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing memory read" on public.bh_writing_memory_snapshots
for select using (public.is_bh_admin_or_teacher() or (payload->>'student_id')::uuid = auth.uid());
create policy "bh writing memory write" on public.bh_writing_memory_snapshots
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing prompt bank read" on public.bh_writing_prompt_bank
for select using (public.is_bh_admin_or_teacher());
create policy "bh writing prompt bank write" on public.bh_writing_prompt_bank
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing review signals read" on public.bh_writing_review_signals
for select using (public.is_bh_admin_or_teacher());
create policy "bh writing review signals write" on public.bh_writing_review_signals
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());

create policy "bh writing calibration read" on public.bh_writing_calibration_followups
for select using (public.is_bh_admin_or_teacher() or student_id = auth.uid());
create policy "bh writing calibration write" on public.bh_writing_calibration_followups
for all using (public.is_bh_admin_or_teacher()) with check (public.is_bh_admin_or_teacher());
