-- IELTS self-paced course ("course path").
--
-- A fixed, ordered sequence of units. Each unit = a short lesson + 1-3 practice
-- tasks drawn from the existing reading/listening/writing/speaking banks.
-- Finishing a unit (lesson opened + every task attempted) unlocks the next one.
--
-- Access rule (server-side, single source of truth):
--   * Unit marked is_free_preview  -> any signed-in learner.
--   * Every other unit             -> school learners need an IELTS programme
--                                     seat (via the school's package);
--                                     everyone else needs an active IELTS Prime
--                                     subscription / prime tier.
--   * Superadmins always have access.
--
-- Practice tasks that belong to an unlocked course unit are openable even when
-- the school's "extra practice" switch is off or the task's required_tier is
-- above the learner's tier: the course is its own entitlement path.

create table if not exists public.ielts_course_units (
  id bigint generated always as identity primary key,
  position integer not null,
  slug text not null,
  title text not null,
  subtitle text,
  focus_skills text[] not null default '{}'::text[],
  lesson jsonb not null default '{}'::jsonb,
  estimated_minutes integer not null default 20,
  is_free_preview boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ielts_course_units_position_unique unique (position),
  constraint ielts_course_units_slug_unique unique (slug),
  constraint ielts_course_units_position_positive check (position > 0),
  constraint ielts_course_units_skills_valid check (
    focus_skills <@ array['reading','listening','writing','speaking']::text[]
  )
);

create table if not exists public.ielts_course_unit_tasks (
  id bigint generated always as identity primary key,
  unit_id bigint not null references public.ielts_course_units(id) on delete cascade,
  position integer not null,
  skill text not null check (skill in ('reading','listening','writing','speaking')),
  task_id bigint not null,
  constraint ielts_course_unit_tasks_unit_position_unique unique (unit_id, position),
  constraint ielts_course_unit_tasks_task_unique unique (skill, task_id)
);

create index if not exists ielts_course_unit_tasks_unit_idx
  on public.ielts_course_unit_tasks (unit_id, position);

create table if not exists public.ielts_course_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id bigint not null references public.ielts_course_units(id) on delete cascade,
  lesson_viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

alter table public.ielts_course_units enable row level security;
alter table public.ielts_course_unit_tasks enable row level security;
alter table public.ielts_course_progress enable row level security;

-- Unit metadata (titles, order) is readable by any signed-in learner so the
-- path can render locked units. Lesson bodies are only served through
-- rpc_ielts_course_unit, which applies the unlock rule.
create policy ielts_course_units_read on public.ielts_course_units
  for select to authenticated using (is_published = true or public.is_superadmin((select auth.uid())));

create policy ielts_course_units_admin on public.ielts_course_units
  for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create policy ielts_course_unit_tasks_read on public.ielts_course_unit_tasks
  for select to authenticated using (
    exists (select 1 from public.ielts_course_units u where u.id = unit_id and (u.is_published or public.is_superadmin((select auth.uid()))))
  );

create policy ielts_course_unit_tasks_admin on public.ielts_course_unit_tasks
  for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create policy ielts_course_progress_own_read on public.ielts_course_progress
  for select to authenticated using (user_id = (select auth.uid()) or public.is_superadmin((select auth.uid())));

-- Writes go through the RPCs below (security definer); no direct insert/update policy.

grant select on public.ielts_course_units to authenticated;
grant select on public.ielts_course_unit_tasks to authenticated;
grant select on public.ielts_course_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Access helpers (private schema)
-- ---------------------------------------------------------------------------

-- Full course access for the current actor.
create or replace function private.ielts_course_has_full_access()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile_school_id uuid;
  v_school_id uuid;
  v_tier text;
begin
  if v_actor is null then return false; end if;
  if public.is_superadmin(v_actor) then return true; end if;

  -- Personal Prime (subscription or granted tier) always counts.
  if public.has_active_ielts_prime_subscription(v_actor) then return true; end if;
  select iu.tier into v_tier from public.ielts_users iu where iu.id = v_actor;
  if v_tier in ('prime_prep_user', 'admin', 'pro') then return true; end if;

  -- School learners: the school must own the IELTS programme and (for
  -- students) a seat must be allocated. Teachers/admins of such a school pass.
  select u.school_id into v_profile_school_id from public.users u where u.id = v_actor;
  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_actor and sm.status = 'active'
    and (v_profile_school_id is null or sm.school_id = v_profile_school_id)
  order by sm.is_owner desc, sm.joined_at nulls last, sm.id
  limit 1;

  if v_school_id is not null then
    return private.actor_can_access_school_programme(v_school_id, 'ielts', false);
  end if;

  return false;
end;
$$;

-- Why the actor does not (or does) have full access; used for the UI message.
create or replace function private.ielts_course_access_reason()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_has_school boolean;
begin
  if v_actor is null then return 'not_authenticated'; end if;
  if public.is_superadmin(v_actor) then return 'superadmin'; end if;
  if public.has_active_ielts_prime_subscription(v_actor)
     or exists (select 1 from public.ielts_users iu where iu.id = v_actor and iu.tier in ('prime_prep_user','admin','pro')) then
    return 'prime';
  end if;
  select exists (
    select 1 from public.school_members sm where sm.user_id = v_actor and sm.status = 'active'
  ) into v_has_school;
  if v_has_school then
    return case when private.ielts_course_has_full_access() then 'school_seat' else 'school_seat_missing' end;
  end if;
  return 'prime_required';
end;
$$;

-- Has the current actor finished this task (any completed attempt)?
create or replace function private.ielts_course_task_completed(p_user uuid, p_skill text, p_task_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_skill
    when 'reading' then exists (
      select 1 from public.ielts_reading_attempts a
      where a.user_id = p_user and a.set_id = p_task_id and a.completed_at is not null)
    when 'listening' then exists (
      select 1 from public.ielts_listening_attempts a
      where a.user_id = p_user and a.set_id = p_task_id and a.completed_at is not null)
    when 'writing' then exists (
      select 1 from public.ielts_writing_attempts a
      where a.user_id = p_user and a.task_id = p_task_id and a.submitted_at is not null)
    when 'speaking' then exists (
      select 1 from public.ielts_speaking_attempts a
      where a.user_id = p_user and a.task_id = p_task_id and a.submitted_at is not null)
    else false
  end;
$$;

-- A unit is complete when its lesson was opened and every task is attempted.
create or replace function private.ielts_course_unit_completed(p_user uuid, p_unit_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.ielts_course_progress p
      where p.user_id = p_user and p.unit_id = p_unit_id and p.lesson_viewed_at is not null)
    and not exists (
      select 1 from public.ielts_course_unit_tasks t
      where t.unit_id = p_unit_id
        and not private.ielts_course_task_completed(p_user, t.skill, t.task_id));
$$;

-- Position of the first unfinished published unit (the learner's "current" unit).
-- Null when everything is finished.
create or replace function private.ielts_course_current_position(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select min(u.position)
  from public.ielts_course_units u
  where u.is_published
    and not private.ielts_course_unit_completed(p_user, u.id);
$$;

-- Is a given unit unlocked for the current actor? Sequential rule + access rule.
create or replace function private.ielts_course_unit_unlocked(p_unit_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_position integer;
  v_free boolean;
  v_current integer;
begin
  if v_actor is null then return false; end if;
  select u.position, u.is_free_preview into v_position, v_free
  from public.ielts_course_units u where u.id = p_unit_id and u.is_published;
  if v_position is null then return false; end if;
  if not v_free and not private.ielts_course_has_full_access() then return false; end if;
  v_current := private.ielts_course_current_position(v_actor);
  return v_current is null or v_position <= v_current;
end;
$$;

-- Does this practice task belong to an unlocked unit for the current actor?
-- Used as an additional allow-path inside the practice access gate.
create or replace function private.ielts_course_task_unlocked(p_content_type text, p_task_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skill text := case p_content_type
    when 'ielts_reading_set' then 'reading'
    when 'ielts_listening_set' then 'listening'
    when 'ielts_writing_task' then 'writing'
    when 'ielts_speaking_task' then 'speaking'
    else null end;
  v_unit_id bigint;
begin
  if v_skill is null then return false; end if;
  select t.unit_id into v_unit_id
  from public.ielts_course_unit_tasks t
  where t.skill = v_skill and t.task_id = p_task_id
  limit 1;
  if v_unit_id is null then return false; end if;
  return private.ielts_course_unit_unlocked(v_unit_id);
end;
$$;

-- Extend the practice gate: an unlocked course task is always openable.
create or replace function private.ielts_can_access_practice_content(
  p_content_type text, p_content_id text, p_is_active boolean, p_required_tier text, p_access_context jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_id bigint; v_context jsonb; v_school_id uuid;
begin
  if v_actor is null or p_content_id is null or p_content_id!~'^[0-9]+$' then return false; end if;
  begin v_id:=p_content_id::bigint; exception when numeric_value_out_of_range then return false; end;
  if p_content_type not in ('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then return false; end if;
  v_context:=coalesce(p_access_context,private.ielts_extra_practice_access_context());
  v_school_id:=nullif(v_context->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts')
     and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  if coalesce((v_context->>'is_staff')::boolean,false) then return true; end if;
  if p_is_active is not true then return false; end if;
  if private.ielts_content_is_assigned_to_current_user(p_content_type,p_content_id) then return true; end if;
  -- Self-paced course: a task inside an unlocked unit is openable regardless of
  -- the school's extra-practice switch or the task's required tier.
  if private.ielts_course_task_unlocked(p_content_type, v_id) then return true; end if;
  if not coalesce((v_context->>'resolved')::boolean,false) or not coalesce((v_context->>'enabled')::boolean,false) then return false; end if;
  if coalesce(p_required_tier,'free')<>'free' and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- Title/code lookup for a task reference.
create or replace function private.ielts_course_task_label(p_skill text, p_task_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_skill
    when 'reading' then (select jsonb_build_object('title', r.title, 'display_code', r.display_code, 'minutes', r.duration_minutes)
                         from public.ielts_reading_sets r where r.id = p_task_id)
    when 'listening' then (select jsonb_build_object('title', l.title, 'display_code', l.display_code, 'minutes', l.duration_minutes)
                           from public.ielts_listening_sets l where l.id = p_task_id)
    when 'writing' then (select jsonb_build_object('title', coalesce(w.title, 'Writing task'), 'display_code', w.display_code,
                                                   'minutes', case when lower(coalesce(w.task_type,'')) like '%1%' then 20 else 40 end)
                         from public.ielts_writing_tasks w where w.id = p_task_id)
    when 'speaking' then (select jsonb_build_object('title', 'Speaking Part ' || s.part, 'display_code', s.display_code,
                                                    'minutes', case s.part when 2 then 4 else 5 end)
                          from public.ielts_speaking_tasks s where s.id = p_task_id)
    else '{}'::jsonb
  end;
$$;

-- Whole course map for the current learner: access, every published unit with
-- lock/complete state and task progress, and the current unit id.
-- Lesson bodies are NOT included here (see rpc_ielts_course_unit).
create or replace function public.rpc_ielts_course_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_full boolean;
  v_reason text;
  v_current integer;
  v_units jsonb;
  v_current_unit_id bigint;
  v_total integer;
  v_done integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  v_full := private.ielts_course_has_full_access();
  v_reason := private.ielts_course_access_reason();
  v_current := private.ielts_course_current_position(v_actor);

  select u.id into v_current_unit_id
  from public.ielts_course_units u
  where u.is_published and u.position = v_current;

  select
    coalesce(jsonb_agg(unit_row order by pos), '[]'::jsonb),
    count(*),
    count(*) filter (where (unit_row->>'completed')::boolean)
  into v_units, v_total, v_done
  from (
    select u.position as pos, jsonb_build_object(
      'id', u.id,
      'position', u.position,
      'slug', u.slug,
      'title', u.title,
      'subtitle', u.subtitle,
      'focus_skills', to_jsonb(u.focus_skills),
      'estimated_minutes', u.estimated_minutes,
      'is_free_preview', u.is_free_preview,
      'lesson_viewed', exists (
        select 1 from public.ielts_course_progress p
        where p.user_id = v_actor and p.unit_id = u.id and p.lesson_viewed_at is not null),
      'completed', private.ielts_course_unit_completed(v_actor, u.id),
      'unlocked', (u.is_free_preview or v_full) and (v_current is null or u.position <= v_current),
      'locked_reason', case
        when not (u.is_free_preview or v_full) then 'needs_access'
        when v_current is not null and u.position > v_current then 'previous_unit'
        else null end,
      'tasks', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skill', t.skill,
          'task_id', t.task_id,
          'position', t.position,
          'completed', private.ielts_course_task_completed(v_actor, t.skill, t.task_id),
          'route', '/ielts/' || t.skill || '/' || t.task_id
        ) || coalesce(private.ielts_course_task_label(t.skill, t.task_id), '{}'::jsonb)
        order by t.position), '[]'::jsonb)
        from public.ielts_course_unit_tasks t where t.unit_id = u.id)
    ) as unit_row
    from public.ielts_course_units u
    where u.is_published
  ) x;

  return jsonb_build_object(
    'access', jsonb_build_object('full', v_full, 'reason', v_reason),
    'current_unit_id', v_current_unit_id,
    'units_total', v_total,
    'units_completed', v_done,
    'units', v_units
  );
end;
$$;

revoke all on function public.rpc_ielts_course_state() from public, anon;
grant execute on function public.rpc_ielts_course_state() to authenticated;

-- One unit with its lesson body. Only served when the unit is unlocked.
create or replace function public.rpc_ielts_course_unit(p_unit_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_unit public.ielts_course_units%rowtype;
  v_next_id bigint;
  v_prev_id bigint;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into v_unit from public.ielts_course_units u where u.id = p_unit_id and u.is_published;
  if v_unit.id is null then
    raise exception using errcode = 'P0002', message = 'unit_not_found';
  end if;
  if not private.ielts_course_unit_unlocked(p_unit_id) then
    return jsonb_build_object(
      'id', v_unit.id,
      'position', v_unit.position,
      'title', v_unit.title,
      'subtitle', v_unit.subtitle,
      'unlocked', false,
      'locked_reason', case when not (v_unit.is_free_preview or private.ielts_course_has_full_access())
                            then 'needs_access' else 'previous_unit' end,
      'access_reason', private.ielts_course_access_reason()
    );
  end if;

  select u.id into v_next_id from public.ielts_course_units u
  where u.is_published and u.position > v_unit.position order by u.position limit 1;
  select u.id into v_prev_id from public.ielts_course_units u
  where u.is_published and u.position < v_unit.position order by u.position desc limit 1;

  return jsonb_build_object(
    'id', v_unit.id,
    'position', v_unit.position,
    'slug', v_unit.slug,
    'title', v_unit.title,
    'subtitle', v_unit.subtitle,
    'focus_skills', to_jsonb(v_unit.focus_skills),
    'estimated_minutes', v_unit.estimated_minutes,
    'is_free_preview', v_unit.is_free_preview,
    'lesson', v_unit.lesson,
    'unlocked', true,
    'lesson_viewed', exists (
      select 1 from public.ielts_course_progress p
      where p.user_id = v_actor and p.unit_id = v_unit.id and p.lesson_viewed_at is not null),
    'completed', private.ielts_course_unit_completed(v_actor, v_unit.id),
    'next_unit_id', v_next_id,
    'prev_unit_id', v_prev_id,
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'skill', t.skill,
        'task_id', t.task_id,
        'position', t.position,
        'completed', private.ielts_course_task_completed(v_actor, t.skill, t.task_id),
        'route', '/ielts/' || t.skill || '/' || t.task_id
      ) || coalesce(private.ielts_course_task_label(t.skill, t.task_id), '{}'::jsonb)
      order by t.position), '[]'::jsonb)
      from public.ielts_course_unit_tasks t where t.unit_id = v_unit.id)
  );
end;
$$;

revoke all on function public.rpc_ielts_course_unit(bigint) from public, anon;
grant execute on function public.rpc_ielts_course_unit(bigint) to authenticated;

-- Learner opened the lesson of an unlocked unit.
create or replace function public.rpc_ielts_course_mark_lesson_viewed(p_unit_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not private.ielts_course_unit_unlocked(p_unit_id) then
    raise exception using errcode = '42501', message = 'unit_locked';
  end if;
  insert into public.ielts_course_progress (user_id, unit_id, lesson_viewed_at)
  values (v_actor, p_unit_id, now())
  on conflict (user_id, unit_id) do update
    set lesson_viewed_at = coalesce(public.ielts_course_progress.lesson_viewed_at, excluded.lesson_viewed_at),
        updated_at = now();
  -- Stamp completion if the tasks were already done (e.g. via the old dashboard).
  update public.ielts_course_progress p
     set completed_at = coalesce(p.completed_at, now()), updated_at = now()
   where p.user_id = v_actor and p.unit_id = p_unit_id
     and private.ielts_course_unit_completed(v_actor, p_unit_id);
  return jsonb_build_object('ok', true, 'completed', private.ielts_course_unit_completed(v_actor, p_unit_id));
end;
$$;

revoke all on function public.rpc_ielts_course_mark_lesson_viewed(bigint) from public, anon;
grant execute on function public.rpc_ielts_course_mark_lesson_viewed(bigint) to authenticated;

-- Called after a task is submitted: stamps completed_at when the unit is done.
-- Idempotent; safe to call any time.
create or replace function public.rpc_ielts_course_sync_progress(p_unit_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_done boolean;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_done := private.ielts_course_unit_completed(v_actor, p_unit_id);
  if v_done then
    insert into public.ielts_course_progress (user_id, unit_id, lesson_viewed_at, completed_at)
    values (v_actor, p_unit_id, now(), now())
    on conflict (user_id, unit_id) do update
      set completed_at = coalesce(public.ielts_course_progress.completed_at, excluded.completed_at),
          updated_at = now();
  end if;
  return jsonb_build_object('completed', v_done);
end;
$$;

revoke all on function public.rpc_ielts_course_sync_progress(bigint) from public, anon;
grant execute on function public.rpc_ielts_course_sync_progress(bigint) to authenticated;

comment on table public.ielts_course_units is 'Self-paced IELTS course: ordered units (lesson + practice tasks). Unlock sequentially.';
comment on table public.ielts_course_unit_tasks is 'Practice tasks belonging to a course unit, in order.';
comment on table public.ielts_course_progress is 'Per-learner unit progress (lesson viewed / unit completed).';
