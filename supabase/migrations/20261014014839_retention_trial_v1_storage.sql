-- Additive trial. No assessment/reward changes, new triggers, cron or realtime channels.
create table private.retention_trial_config(singleton boolean primary key default true check(singleton),enabled boolean not null default false,audience text not null default 'pilot' check(audience in('pilot','school','all')),pilot_user_ids uuid[] not null default '{}',school_id uuid,updated_at timestamptz not null default now(),updated_by uuid);
insert into private.retention_trial_config(singleton) values(true);
create table private.retention_trial_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,kind text not null check(kind in('drop','rescue','comeback')),focus_id uuid,focus_name text not null,difficulty text not null,questions jsonb not null check(jsonb_array_length(questions)=5),answers jsonb,correct integer,started_at timestamptz not null default now(),completed_at timestamptz);
create index retention_trial_runs_user_started on private.retention_trial_runs(user_id,started_at desc);
create table private.retention_trial_kudos(student_id uuid not null references public.users(id) on delete cascade,assignment_id uuid not null references public.assignments(id) on delete cascade,teacher_user_id uuid not null references public.users(id) on delete cascade,message_key text not null check(message_key in('clear','helpful','thanks')),created_at timestamptz not null default now(),primary key(student_id,assignment_id));
create index retention_trial_kudos_teacher_date on private.retention_trial_kudos(teacher_user_id,created_at desc);
create table private.retention_trial_events(user_id uuid not null references public.users(id) on delete cascade,event_day date not null default (now() at time zone 'Asia/Bishkek')::date,kind text not null check(kind in('student_view','teacher_view','next_move','profile_open','radar_open','wrap_open')),created_at timestamptz not null default now(),primary key(user_id,event_day,kind));
create table private.retention_trial_cache(user_id uuid primary key references public.users(id) on delete cascade,payload jsonb not null,expires_at timestamptz not null);
alter table private.retention_trial_config enable row level security;
alter table private.retention_trial_runs enable row level security;
alter table private.retention_trial_kudos enable row level security;
alter table private.retention_trial_events enable row level security;
alter table private.retention_trial_cache enable row level security;
revoke all on private.retention_trial_config,private.retention_trial_runs,private.retention_trial_kudos,private.retention_trial_events,private.retention_trial_cache from public,anon,authenticated;
