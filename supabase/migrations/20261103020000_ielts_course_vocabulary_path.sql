-- IELTS self-paced course: a second, separate path for vocabulary.
--
-- Owner instruction 2026-11-03 07:08 (Asia/Bishkek): "Can we make separate path for the vocabulary like the
-- locked by order lessons? But still in the course tab". Owner answers 2026-11-03: approve all six vocabulary
-- lessons (V1-V6) for course learners; V1 free like Unit 1 of the main path.
--
-- * ielts_course_units gains a track ('main' | 'vocabulary'). Order and unlocking are per track, so the
--   vocabulary path never waits for the main path and vice versa.
-- * Vocabulary units link to the released Vocabulary V1-V6 step tasks (R-080 to R-115) by task code.
--   Those exact versions were owner-approved and released on 2026-10-28
--   (20261028073905_ielts_targeted_vocabulary_01_originality_and_release.sql); every serve re-checks
--   private.ielts_learning_publicly_released and private.ielts_practice_material_allowed.
-- * Self-paced attempts are stored in private.ielts_course_vocab_attempts, not in teacher allocations, so a
--   course attempt never appears as assigned work, teacher evidence or a band. Auto-marked practice only.
-- * rpc_ielts_course_state keeps 'units' as the main path (unchanged shape) and adds a 'vocabulary' block.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.ielts_course_units add column if not exists track text not null default 'main';
alter table public.ielts_course_units drop constraint if exists ielts_course_units_track_valid;
alter table public.ielts_course_units add constraint ielts_course_units_track_valid check (track in ('main','vocabulary'));
alter table public.ielts_course_units drop constraint if exists ielts_course_units_position_unique;
alter table public.ielts_course_units drop constraint if exists ielts_course_units_track_position_unique;
alter table public.ielts_course_units add constraint ielts_course_units_track_position_unique unique (track, position);
alter table public.ielts_course_units drop constraint if exists ielts_course_units_skills_valid;
alter table public.ielts_course_units add constraint ielts_course_units_skills_valid
  check (focus_skills <@ array['reading','listening','writing','speaking','vocabulary']::text[]);

alter table public.ielts_course_unit_tasks add column if not exists task_code text;
alter table public.ielts_course_unit_tasks alter column task_id drop not null;
alter table public.ielts_course_unit_tasks drop constraint if exists ielts_course_unit_tasks_skill_check;
alter table public.ielts_course_unit_tasks drop constraint if exists ielts_course_unit_tasks_skill_valid;
alter table public.ielts_course_unit_tasks add constraint ielts_course_unit_tasks_skill_valid
  check (skill in ('reading','listening','writing','speaking','vocabulary'));
alter table public.ielts_course_unit_tasks drop constraint if exists ielts_course_unit_tasks_reference_valid;
alter table public.ielts_course_unit_tasks add constraint ielts_course_unit_tasks_reference_valid
  check ((skill = 'vocabulary' and task_code is not null and task_id is null)
      or (skill <> 'vocabulary' and task_id is not null and task_code is null));
alter table public.ielts_course_unit_tasks drop constraint if exists ielts_course_unit_tasks_code_unique;
alter table public.ielts_course_unit_tasks add constraint ielts_course_unit_tasks_code_unique unique (task_code);

alter table public.ielts_course_units enable row level security;
alter table public.ielts_course_unit_tasks enable row level security;

create table if not exists private.ielts_course_vocab_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id bigint not null references public.ielts_course_units(id) on delete cascade,
  task_code text not null,
  content_sha256 text not null,
  answers jsonb not null,
  outcomes jsonb not null,
  score integer not null,
  total integer not null,
  submitted_at timestamptz not null default now()
);
create index if not exists ielts_course_vocab_attempts_user_task_idx
  on private.ielts_course_vocab_attempts (user_id, task_code, submitted_at desc);
alter table private.ielts_course_vocab_attempts enable row level security;
revoke all on private.ielts_course_vocab_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Progress helpers (track-aware)
-- ---------------------------------------------------------------------------

create or replace function private.ielts_course_vocab_completed(p_user uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.ielts_course_vocab_attempts a where a.user_id = p_user and a.task_code = p_code);
$$;

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
        and not (case when t.skill = 'vocabulary'
                      then private.ielts_course_vocab_completed(p_user, t.task_code)
                      else private.ielts_course_task_completed(p_user, t.skill, t.task_id) end));
$$;

create or replace function private.ielts_course_current_position(p_user uuid, p_track text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select min(u.position)
  from public.ielts_course_units u
  where u.is_published and u.track = p_track
    and not private.ielts_course_unit_completed(p_user, u.id);
$$;

-- Kept for callers of the original signature: the main path.
create or replace function private.ielts_course_current_position(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.ielts_course_current_position(p_user, 'main');
$$;

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
  v_track text;
  v_current integer;
begin
  if v_actor is null then return false; end if;
  select u.position, u.is_free_preview, u.track into v_position, v_free, v_track
  from public.ielts_course_units u where u.id = p_unit_id and u.is_published;
  if v_position is null then return false; end if;
  if not v_free and not private.ielts_course_has_full_access() then return false; end if;
  v_current := private.ielts_course_current_position(v_actor, v_track);
  return v_current is null or v_position <= v_current;
end;
$$;

-- Short step title, display code and minutes for a vocabulary task.
create or replace function private.ielts_course_vocab_label(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', regexp_replace(t.title, '^Vocabulary V[0-9]+ step [0-9]+ of [0-9]+: ', ''),
    'display_code', private.ielts_material_code('targeted', t.code),
    'minutes', nullif(t.content->>'suggested_minutes', '')::int,
    'purpose', t.purpose)
  from private.ielts_learning_tasks t where t.code = p_code;
$$;

-- One task link as the client sees it.
create or replace function private.ielts_course_task_json(p_user uuid, p_skill text, p_task_id bigint, p_code text, p_position integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_skill = 'vocabulary' then
    jsonb_build_object(
      'skill', 'vocabulary',
      'task_id', null,
      'task_code', p_code,
      'position', p_position,
      'completed', private.ielts_course_vocab_completed(p_user, p_code),
      'route', '/ielts/vocabulary/' || p_code)
    || coalesce(private.ielts_course_vocab_label(p_code), '{}'::jsonb)
  else
    jsonb_build_object(
      'skill', p_skill,
      'task_id', p_task_id,
      'position', p_position,
      'completed', private.ielts_course_task_completed(p_user, p_skill, p_task_id),
      'route', '/ielts/' || p_skill || '/' || p_task_id)
    || coalesce(private.ielts_course_task_label(p_skill, p_task_id), '{}'::jsonb)
  end;
$$;

-- Units of one track with lock state, for the course map.
create or replace function private.ielts_course_track_state(p_user uuid, p_track text, p_full boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current integer := private.ielts_course_current_position(p_user, p_track);
  v_units jsonb;
  v_total integer;
  v_done integer;
  v_current_unit_id bigint;
begin
  select u.id into v_current_unit_id from public.ielts_course_units u
  where u.is_published and u.track = p_track and u.position = v_current;

  select coalesce(jsonb_agg(unit_row order by pos), '[]'::jsonb),
         count(*),
         count(*) filter (where (unit_row->>'completed')::boolean)
  into v_units, v_total, v_done
  from (
    select u.position as pos, jsonb_build_object(
      'id', u.id,
      'track', u.track,
      'position', u.position,
      'slug', u.slug,
      'title', u.title,
      'subtitle', u.subtitle,
      'focus_skills', to_jsonb(u.focus_skills),
      'estimated_minutes', u.estimated_minutes,
      'is_free_preview', u.is_free_preview,
      'lesson_viewed', exists (
        select 1 from public.ielts_course_progress p
        where p.user_id = p_user and p.unit_id = u.id and p.lesson_viewed_at is not null),
      'completed', private.ielts_course_unit_completed(p_user, u.id),
      'unlocked', (u.is_free_preview or p_full) and (v_current is null or u.position <= v_current),
      'locked_reason', case
        when not (u.is_free_preview or p_full) then 'needs_access'
        when v_current is not null and u.position > v_current then 'previous_unit'
        else null end,
      'tasks', (
        select coalesce(jsonb_agg(private.ielts_course_task_json(p_user, t.skill, t.task_id, t.task_code, t.position) order by t.position), '[]'::jsonb)
        from public.ielts_course_unit_tasks t where t.unit_id = u.id)
    ) as unit_row
    from public.ielts_course_units u
    where u.is_published and u.track = p_track
  ) x;

  return jsonb_build_object('units', v_units, 'units_total', v_total, 'units_completed', v_done, 'current_unit_id', v_current_unit_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

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
  v_main jsonb;
  v_vocab jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_full := private.ielts_course_has_full_access();
  v_main := private.ielts_course_track_state(v_actor, 'main', v_full);
  v_vocab := private.ielts_course_track_state(v_actor, 'vocabulary', v_full);
  return jsonb_build_object(
    'access', jsonb_build_object('full', v_full, 'reason', private.ielts_course_access_reason()),
    'current_unit_id', v_main->'current_unit_id',
    'units_total', v_main->'units_total',
    'units_completed', v_main->'units_completed',
    'units', v_main->'units',
    'vocabulary', v_vocab
  );
end;
$$;

revoke all on function public.rpc_ielts_course_state() from public, anon;
grant execute on function public.rpc_ielts_course_state() to authenticated;

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
      'track', v_unit.track,
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
  where u.is_published and u.track = v_unit.track and u.position > v_unit.position order by u.position limit 1;
  select u.id into v_prev_id from public.ielts_course_units u
  where u.is_published and u.track = v_unit.track and u.position < v_unit.position order by u.position desc limit 1;

  return jsonb_build_object(
    'id', v_unit.id,
    'track', v_unit.track,
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
      select coalesce(jsonb_agg(private.ielts_course_task_json(v_actor, t.skill, t.task_id, t.task_code, t.position) order by t.position), '[]'::jsonb)
      from public.ielts_course_unit_tasks t where t.unit_id = v_unit.id)
  );
end;
$$;

revoke all on function public.rpc_ielts_course_unit(bigint) from public, anon;
grant execute on function public.rpc_ielts_course_unit(bigint) to authenticated;

-- The unit a vocabulary step belongs to, when it is unlocked and still released; otherwise raises.
create or replace function private.ielts_course_vocab_unit_for(p_code text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_unit_id bigint;
begin
  select t.unit_id into v_unit_id
  from public.ielts_course_unit_tasks t
  join public.ielts_course_units u on u.id = t.unit_id and u.is_published and u.track = 'vocabulary'
  where t.skill = 'vocabulary' and t.task_code = p_code;
  if v_unit_id is null or not exists (select 1 from private.ielts_learning_tasks where code = p_code) then
    raise exception using errcode = 'P0002', message = 'task_not_found';
  end if;
  if not private.ielts_course_unit_unlocked(v_unit_id) then
    raise exception using errcode = '42501', message = 'unit_locked';
  end if;
  if not private.ielts_learning_publicly_released(p_code) or not private.ielts_practice_material_allowed('targeted', p_code) then
    raise exception using errcode = 'P0002', message = 'task_not_available';
  end if;
  return v_unit_id;
end;
$$;

-- Per-question explanations from the task's answer notes ("1 ...", "2 ...").
create or replace function private.ielts_course_vocab_explanations(p_notes text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg('q' || m[1], trim(m[2])), '{}'::jsonb)
  from regexp_matches(coalesce(p_notes, ''), '(?:^|\n)([1-9])\s+([^\n]+)', 'g') as m;
$$;

-- Result payload for an attempt (answers revealed only after submitting).
create or replace function private.ielts_course_vocab_result(p_attempt private.ielts_course_vocab_attempts, p_task private.ielts_learning_tasks)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id', p_attempt.id,
    'score', p_attempt.score,
    'total', p_attempt.total,
    'submitted_at', p_attempt.submitted_at,
    'answers', p_attempt.answers,
    'outcomes', p_attempt.outcomes,
    'explanations', private.ielts_course_vocab_explanations(p_task.content->>'teacher_notes'));
$$;

-- One vocabulary step for the learner: content without answer keys, plus their latest result.
create or replace function public.rpc_ielts_course_vocab_task(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_unit_id bigint;
  v_task private.ielts_learning_tasks%rowtype;
  v_link public.ielts_course_unit_tasks%rowtype;
  v_attempt private.ielts_course_vocab_attempts%rowtype;
  v_next text;
  v_steps integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_unit_id := private.ielts_course_vocab_unit_for(p_code);
  select * into v_task from private.ielts_learning_tasks where code = p_code;
  select * into v_link from public.ielts_course_unit_tasks where task_code = p_code;
  select t.task_code into v_next from public.ielts_course_unit_tasks t
  where t.unit_id = v_unit_id and t.position > v_link.position order by t.position limit 1;
  select count(*) into v_steps from public.ielts_course_unit_tasks t where t.unit_id = v_unit_id;
  select * into v_attempt from private.ielts_course_vocab_attempts a
  where a.user_id = v_actor and a.task_code = p_code order by a.submitted_at desc limit 1;

  return jsonb_build_object(
    'code', v_task.code,
    'unit_id', v_unit_id,
    'unit_title', (select u.title from public.ielts_course_units u where u.id = v_unit_id),
    'step', v_link.position,
    'steps', v_steps,
    'next_code', v_next,
    'purpose', v_task.purpose,
    'instructions', v_task.instructions,
    'success_description', v_task.success_description,
    'focus', v_task.content->>'focus',
    'passage', v_task.content->>'passage',
    'minutes', nullif(v_task.content->>'suggested_minutes', '')::int,
    'questions', (select coalesce(jsonb_agg(q - 'accepted_answers' - 'taxonomy_node_id' - 'supporting_node_id' order by q->>'id'), '[]'::jsonb)
                  from jsonb_array_elements(v_task.questions) q)
  ) || coalesce(private.ielts_course_vocab_label(p_code), '{}'::jsonb)
    || jsonb_build_object('result', case when v_attempt.id is null then null else private.ielts_course_vocab_result(v_attempt, v_task) end);
end;
$$;

revoke all on function public.rpc_ielts_course_vocab_task(text) from public, anon;
grant execute on function public.rpc_ielts_course_vocab_task(text) to authenticated;

-- Mark a vocabulary step. Retries are allowed; each try is kept. Practice only: no band, no teacher evidence.
create or replace function public.rpc_ielts_course_vocab_submit(p_code text, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_unit_id bigint;
  v_task private.ielts_learning_tasks%rowtype;
  v_attempt private.ielts_course_vocab_attempts%rowtype;
  k text; v jsonb; q jsonb;
  v_response text; v_correct boolean; v_score integer := 0; v_total integer := 0; v_outcomes jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_unit_id := private.ielts_course_vocab_unit_for(p_code);
  select * into v_task from private.ielts_learning_tasks where code = p_code;

  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'invalid_answers'; end if;
  for k, v in select * from jsonb_each(p_answers) loop
    if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 120
       or not exists (select 1 from jsonb_array_elements(v_task.questions) x where x->>'id' = k) then
      raise exception 'invalid_answers';
    end if;
  end loop;

  -- Light guard against scripted resubmission.
  if (select count(*) from private.ielts_course_vocab_attempts a
      where a.user_id = v_actor and a.task_code = p_code and a.submitted_at > now() - interval '1 minute') >= 5 then
    raise exception 'too_many_attempts';
  end if;

  for q in select value from jsonb_array_elements(v_task.questions) loop
    v_total := v_total + 1;
    v_response := lower(trim(regexp_replace(coalesce(p_answers->>(q->>'id'), ''), '\s+', ' ', 'g')));
    select v_response <> '' and exists (
      select 1 from jsonb_array_elements_text(q->'accepted_answers') answer where lower(trim(answer)) = v_response)
    into v_correct;
    v_score := v_score + case when v_correct then 1 else 0 end;
    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
      'id', q->>'id',
      'correct', v_correct,
      'response_state', case when v_response = '' then 'unanswered' else 'answered' end,
      'accepted_answers', q->'accepted_answers'));
  end loop;

  insert into private.ielts_course_vocab_attempts (user_id, unit_id, task_code, content_sha256, answers, outcomes, score, total)
  values (v_actor, v_unit_id, p_code, v_task.content_sha256, p_answers, v_outcomes, v_score, v_total)
  returning * into v_attempt;

  -- Stamp unit completion when this was the last step.
  if private.ielts_course_unit_completed(v_actor, v_unit_id) then
    insert into public.ielts_course_progress (user_id, unit_id, lesson_viewed_at, completed_at)
    values (v_actor, v_unit_id, now(), now())
    on conflict (user_id, unit_id) do update
      set completed_at = coalesce(public.ielts_course_progress.completed_at, excluded.completed_at), updated_at = now();
  end if;

  return private.ielts_course_vocab_result(v_attempt, v_task)
    || jsonb_build_object('unit_completed', private.ielts_course_unit_completed(v_actor, v_unit_id));
end;
$$;

revoke all on function public.rpc_ielts_course_vocab_submit(text, jsonb) from public, anon;
grant execute on function public.rpc_ielts_course_vocab_submit(text, jsonb) to authenticated;

revoke all on function private.ielts_course_vocab_completed(uuid, text) from public, anon, authenticated;
revoke all on function private.ielts_course_current_position(uuid, text) from public, anon, authenticated;
revoke all on function private.ielts_course_vocab_label(text) from public, anon, authenticated;
revoke all on function private.ielts_course_task_json(uuid, text, bigint, text, integer) from public, anon, authenticated;
revoke all on function private.ielts_course_track_state(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.ielts_course_vocab_unit_for(text) from public, anon, authenticated;
revoke all on function private.ielts_course_vocab_explanations(text) from public, anon, authenticated;
revoke all on function private.ielts_course_vocab_result(private.ielts_course_vocab_attempts, private.ielts_learning_tasks) from public, anon, authenticated;

comment on table private.ielts_course_vocab_attempts is 'Self-paced vocabulary path attempts. Auto-marked practice; not teacher evidence, not a band.';
