-- Longitudinal Student Learning Memory foundation.
-- Historical observations are append-only. Current focus state is derived and rebuildable.

create table if not exists public.student_learning_observations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  skill_key text not null,
  observation_type text not null check (observation_type in ('focus', 'developing', 'strength')),
  source_type text not null check (source_type in ('assignment_result', 'writing_attempt', 'teacher_observation', 'import')),
  source_id uuid,
  source_key text not null,
  observed_at timestamptz not null,
  evidence_percentage numeric(6,2) check (evidence_percentage is null or (evidence_percentage >= 0 and evidence_percentage <= 100)),
  evidence_count integer not null default 1 check (evidence_count > 0),
  evidence jsonb not null default '{}'::jsonb,
  system_generated boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, source_key)
);

create index if not exists idx_student_learning_observations_student_time
  on public.student_learning_observations(student_id, observed_at desc);
create index if not exists idx_student_learning_observations_student_skill
  on public.student_learning_observations(student_id, skill_key, observed_at desc);
create index if not exists idx_student_learning_observations_school_subject
  on public.student_learning_observations(school_id, subject, observed_at desc);

create table if not exists public.student_learning_focus_states (
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  skill_key text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  focus_occurrences integer not null default 0,
  developing_occurrences integer not null default 0,
  strength_occurrences integer not null default 0,
  recent_focus_occurrences integer not null default 0,
  recent_developing_occurrences integer not null default 0,
  recent_strength_occurrences integer not null default 0,
  latest_observation_type text not null check (latest_observation_type in ('focus', 'developing', 'strength')),
  current_status text not null check (current_status in ('new_focus', 'recurring', 'persistent', 'improving', 'resolved', 'emerging_strength', 'consistent_strength')),
  trend text not null check (trend in ('declining', 'stable', 'improving', 'resolved', 'strong')),
  priority text not null check (priority in ('high', 'medium', 'low')),
  latest_evidence_percentage numeric(6,2),
  evidence_items integer not null default 0,
  evidence_occurrences integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, skill_key)
);

create index if not exists idx_student_learning_focus_states_school_status
  on public.student_learning_focus_states(school_id, current_status, priority);
create index if not exists idx_student_learning_focus_states_student_subject
  on public.student_learning_focus_states(student_id, subject, priority, updated_at desc);

alter table public.student_learning_observations enable row level security;
alter table public.student_learning_focus_states enable row level security;

-- The tables are intentionally not client-readable. Scoped RPCs are the public contract.
revoke all on table public.student_learning_observations from public, anon, authenticated;
revoke all on table public.student_learning_focus_states from public, anon, authenticated;
grant select, insert, update, delete on table public.student_learning_observations to service_role;
grant select, insert, update, delete on table public.student_learning_focus_states to service_role;

create or replace function public.student_learning_normalize_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function public.student_learning_normalize_key(text) from public, anon, authenticated;
grant execute on function public.student_learning_normalize_key(text) to service_role;

create or replace function public.student_learning_build_skill_key(p_subject text, p_topic text, p_skill text, p_subskill text default null)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(
    ':',
    public.student_learning_normalize_key(p_subject),
    public.student_learning_normalize_key(coalesce(nullif(trim(p_topic), ''), p_skill)),
    public.student_learning_normalize_key(p_skill),
    nullif(public.student_learning_normalize_key(p_subskill), '')
  );
$$;
revoke all on function public.student_learning_build_skill_key(text, text, text, text) from public, anon, authenticated;
grant execute on function public.student_learning_build_skill_key(text, text, text, text) to service_role;

create or replace function public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.student_learning_observations%rowtype;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_focus integer := 0;
  v_developing integer := 0;
  v_strength integer := 0;
  v_recent_focus integer := 0;
  v_recent_developing integer := 0;
  v_recent_strength integer := 0;
  v_items integer := 0;
  v_occurrences integer := 0;
  v_status text;
  v_trend text;
  v_priority text;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then return; end if;

  select o.* into v_latest
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
  order by o.observed_at desc, o.created_at desc, o.id desc
  limit 1;

  if not found then
    delete from public.student_learning_focus_states s where s.student_id = p_student_id and s.skill_key = p_skill_key;
    return;
  end if;

  select min(o.observed_at), max(o.observed_at),
    count(*) filter (where o.observation_type = 'focus')::integer,
    count(*) filter (where o.observation_type = 'developing')::integer,
    count(*) filter (where o.observation_type = 'strength')::integer,
    count(*)::integer, coalesce(sum(o.evidence_count), 0)::integer
  into v_first_at, v_last_at, v_focus, v_developing, v_strength, v_items, v_occurrences
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key;

  with recent as (
    select o.observation_type
    from public.student_learning_observations o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
    order by o.observed_at desc, o.created_at desc, o.id desc
    limit 3
  )
  select count(*) filter (where observation_type = 'focus')::integer,
    count(*) filter (where observation_type = 'developing')::integer,
    count(*) filter (where observation_type = 'strength')::integer
  into v_recent_focus, v_recent_developing, v_recent_strength from recent;

  if v_focus = 0 then
    if v_strength >= 2 then v_status := 'consistent_strength'; v_trend := 'strong';
    else v_status := 'emerging_strength'; v_trend := case when v_latest.observation_type = 'strength' then 'strong' else 'stable' end; end if;
  elsif v_latest.observation_type = 'strength' and v_recent_strength >= 2 and v_recent_focus = 0 then
    v_status := 'resolved'; v_trend := 'resolved';
  elsif v_latest.observation_type in ('strength', 'developing') and (v_recent_strength + v_recent_developing) >= 2 and v_recent_focus <= 1 then
    v_status := 'improving'; v_trend := 'improving';
  elsif v_focus >= 3 and v_recent_focus >= 2 then
    v_status := 'persistent'; v_trend := case when v_latest.observation_type = 'focus' then 'stable' else 'improving' end;
  elsif v_focus >= 2 then
    v_status := 'recurring';
    v_trend := case when v_latest.observation_type = 'focus' and v_recent_focus >= 2 then 'declining' when v_latest.observation_type in ('strength', 'developing') then 'improving' else 'stable' end;
  else
    v_status := 'new_focus'; v_trend := case when v_latest.observation_type = 'focus' then 'stable' else 'improving' end;
  end if;

  v_priority := case when v_status = 'persistent' then 'high' when v_status in ('recurring', 'new_focus') then 'medium' else 'low' end;

  insert into public.student_learning_focus_states (
    school_id, student_id, subject, topic, skill, subskill, skill_key, first_observed_at, last_observed_at,
    focus_occurrences, developing_occurrences, strength_occurrences, recent_focus_occurrences,
    recent_developing_occurrences, recent_strength_occurrences, latest_observation_type, current_status,
    trend, priority, latest_evidence_percentage, evidence_items, evidence_occurrences, updated_at
  ) values (
    v_latest.school_id, v_latest.student_id, v_latest.subject, v_latest.topic, v_latest.skill, v_latest.subskill,
    v_latest.skill_key, v_first_at, v_last_at, v_focus, v_developing, v_strength, v_recent_focus,
    v_recent_developing, v_recent_strength, v_latest.observation_type, v_status, v_trend, v_priority,
    v_latest.evidence_percentage, v_items, v_occurrences, now()
  )
  on conflict (student_id, skill_key) do update set
    school_id = excluded.school_id, subject = excluded.subject, topic = excluded.topic, skill = excluded.skill,
    subskill = excluded.subskill, first_observed_at = excluded.first_observed_at, last_observed_at = excluded.last_observed_at,
    focus_occurrences = excluded.focus_occurrences, developing_occurrences = excluded.developing_occurrences,
    strength_occurrences = excluded.strength_occurrences, recent_focus_occurrences = excluded.recent_focus_occurrences,
    recent_developing_occurrences = excluded.recent_developing_occurrences,
    recent_strength_occurrences = excluded.recent_strength_occurrences, latest_observation_type = excluded.latest_observation_type,
    current_status = excluded.current_status, trend = excluded.trend, priority = excluded.priority,
    latest_evidence_percentage = excluded.latest_evidence_percentage, evidence_items = excluded.evidence_items,
    evidence_occurrences = excluded.evidence_occurrences, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.student_learning_refresh_focus_state(uuid, text) from public, anon, authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid, text) to service_role;

create or replace function public.student_learning_after_observation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.student_learning_refresh_focus_state(new.student_id, new.skill_key);
  return new;
end;
$$;
revoke all on function public.student_learning_after_observation_insert() from public, anon, authenticated;

drop trigger if exists trg_student_learning_refresh_focus_state on public.student_learning_observations;
create trigger trg_student_learning_refresh_focus_state
after insert on public.student_learning_observations
for each row execute function public.student_learning_after_observation_insert();

create or replace function public.rpc_student_learning_profile(p_student_id uuid default null, p_subject text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, (select auth.uid()));
  v_school_id uuid;
  v_allowed boolean := false;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_student_id is null then raise exception 'Student is required'; end if;

  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  if v_caller = v_student_id then v_allowed := true; end if;

  if not v_allowed and exists (
    select 1 from public.school_members sm
    where sm.school_id = v_school_id and sm.user_id = v_caller and sm.status = 'active' and sm.role_in_school = 'school_admin'
  ) then v_allowed := true; end if;

  if not v_allowed and exists (
    select 1
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id and cta.school_id = v_school_id and cta.teacher_user_id = v_caller and cta.active is true
    where cs.student_id = v_student_id
      and (p_subject is null or lower(trim(cta.subject)) = lower(trim(p_subject)))
  ) then v_allowed := true; end if;

  if not v_allowed then raise exception 'Not authorized'; end if;

  select jsonb_build_object(
    'student', jsonb_build_object('id', u.id, 'name', coalesce(nullif(trim(u.full_name), ''), u.username), 'username', u.username, 'grade', u.grade, 'batch', u.batch, 'school_id', u.school_id),
    'summary', jsonb_build_object(
      'subjects_tracked', (select count(distinct s.subject) from public.student_learning_focus_states s where s.student_id = v_student_id and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))),
      'persistent_focus_count', (select count(*) from public.student_learning_focus_states s where s.student_id = v_student_id and s.current_status = 'persistent' and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))),
      'improving_count', (select count(*) from public.student_learning_focus_states s where s.student_id = v_student_id and s.current_status = 'improving' and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))),
      'resolved_count', (select count(*) from public.student_learning_focus_states s where s.student_id = v_student_id and s.current_status = 'resolved' and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))),
      'strength_count', (select count(*) from public.student_learning_focus_states s where s.student_id = v_student_id and s.current_status in ('emerging_strength', 'consistent_strength') and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject))))
    ),
    'focus_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', s.subject, 'topic', s.topic, 'skill', s.skill, 'subskill', s.subskill, 'skill_key', s.skill_key,
        'status', s.current_status, 'trend', s.trend, 'priority', s.priority, 'first_observed_at', s.first_observed_at,
        'last_observed_at', s.last_observed_at, 'focus_occurrences', s.focus_occurrences,
        'developing_occurrences', s.developing_occurrences, 'strength_occurrences', s.strength_occurrences,
        'latest_evidence_percentage', s.latest_evidence_percentage, 'evidence_items', s.evidence_items,
        'evidence_occurrences', s.evidence_occurrences
      ) order by case s.priority when 'high' then 1 when 'medium' then 2 else 3 end, s.last_observed_at desc, s.subject, s.skill)
      from public.student_learning_focus_states s
      where s.student_id = v_student_id and (p