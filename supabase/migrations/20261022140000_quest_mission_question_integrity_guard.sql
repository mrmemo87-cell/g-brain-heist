-- Keep live quest missions playable when questions are retired.
--
-- Incident 2026-10-22: the Aug 15 / Oct 12 curriculum clean-ups retired 284
-- questions that 56 active quest missions still pinned, so rpc_quest_start_run
-- failed for those missions. Nothing linked retiring a question to the missions
-- that use it.
--
-- This guard:
--   * when a question is retired (is_active true -> false) or deleted, swaps it
--     in every active mission for a reviewed replacement: an active copy of the
--     same content, otherwise an approved, verified, public multiple-choice
--     question from the same subject, topic and grade (same difficulty first),
--     never one already used in that mission;
--   * hides a mission when no replacement exists, instead of leaving it broken;
--   * applies the same repair whenever a mission is published or its route
--     edited, so a mission can never be switched on with a retired question;
--   * records every swap and every hidden mission in
--     private.quest_mission_integrity_log.

create table if not exists private.quest_mission_integrity_log (
  id bigint generated always as identity primary key,
  logged_at timestamptz not null default now(),
  mission_id uuid not null,
  event text not null check (event in ('question_swapped', 'mission_hidden')),
  node_index int,
  old_question_id uuid,
  new_question_id uuid,
  reason text not null
);
revoke all on private.quest_mission_integrity_log from public, anon, authenticated;

create or replace function private.quest_pick_replacement_question(p_old_question_id uuid, p_exclude uuid[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_new uuid;
begin
  select q.subject, q.topic_name, q.grade_level, q.difficulty, q.content_fingerprint
  into v_old
  from public.questions q
  where q.id = p_old_question_id;

  if not found then
    return null; -- deleted question: nothing to match on
  end if;

  -- 1. An active copy of the identical content.
  if v_old.content_fingerprint is not null then
    select q.id into v_new
    from public.questions q
    where q.content_fingerprint = v_old.content_fingerprint
      and q.id <> p_old_question_id
      and q.is_active and q.is_public
      and not (q.id = any(coalesce(p_exclude, '{}')))
    order by q.id
    limit 1;
    if v_new is not null then
      return v_new;
    end if;
  end if;

  -- 2. A reviewed question from the same subject, topic and grade.
  select q.id into v_new
  from public.questions q
  where q.subject = v_old.subject
    and q.topic_name is not distinct from v_old.topic_name
    and coalesce(q.grade_level, '') = coalesce(v_old.grade_level, '')
    and q.is_active and q.is_public
    and q.question_type = 'multiple_choice'
    and q.verification_status = 'verified'
    and q.curriculum_review_status = 'approved'
    and q.id <> p_old_question_id
    and not (q.id = any(coalesce(p_exclude, '{}')))
  order by (q.difficulty is not distinct from v_old.difficulty) desc, q.id
  limit 1;

  return v_new;
end;
$$;
revoke all on function private.quest_pick_replacement_question(uuid, uuid[]) from public, anon, authenticated;

-- Returns the route with every retired or missing pinned question replaced,
-- and how many could not be replaced. p_log_mission_id (when not null) logs swaps.
create or replace function private.quest_repair_route(p_route jsonb, p_log_mission_id uuid, p_reason text, p_retiring uuid default null)
returns table (route jsonb, unresolved int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nodes jsonb[] := '{}';
  v_used uuid[] := '{}';
  v_node jsonb;
  v_qid uuid;
  v_new uuid;
  v_missing int := 0;
  i int;
begin
  if p_route is null or jsonb_typeof(p_route) <> 'array' then
    return query select p_route, 0;
    return;
  end if;

  -- Questions that stay in the mission are never chosen as replacements.
  select coalesce(array_agg(q.id), '{}') into v_used
  from jsonb_array_elements(p_route) e
  join public.questions q on q.id = nullif(e->>'question_id', '')::uuid
  where q.is_active and q.id is distinct from p_retiring;

  for i in 0 .. jsonb_array_length(p_route) - 1 loop
    v_node := p_route -> i;
    v_qid := nullif(v_node->>'question_id', '')::uuid;
    if v_node->>'type' in ('question', 'elite_question')
       and v_qid is not null
       and (v_qid = p_retiring
            or not exists (select 1 from public.questions q where q.id = v_qid and q.is_active)) then
      v_new := private.quest_pick_replacement_question(v_qid, v_used);
      if v_new is null then
        v_missing := v_missing + 1;
      else
        v_node := jsonb_set(v_node, '{question_id}', to_jsonb(v_new::text));
        v_used := v_used || v_new;
        if p_log_mission_id is not null then
          insert into private.quest_mission_integrity_log (mission_id, event, node_index, old_question_id, new_question_id, reason)
          values (p_log_mission_id, 'question_swapped', i, v_qid, v_new, p_reason);
        end if;
      end if;
    end if;
    v_nodes := v_nodes || v_node;
  end loop;

  return query select to_jsonb(v_nodes), v_missing;
end;
$$;
revoke all on function private.quest_repair_route(jsonb, uuid, text, uuid) from public, anon, authenticated;

-- A mission being published or edited: repair it, or keep it hidden.
create or replace function private.quest_missions_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route jsonb;
  v_missing int;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.is_active
     and old.route_template is not distinct from new.route_template then
    return new; -- unrelated edit of a live mission
  end if;

  select r.route, r.unresolved into v_route, v_missing
  from private.quest_repair_route(new.route_template, new.id, 'mission published or edited') r;
  new.route_template := v_route;

  if v_missing > 0 then
    new.is_active := false;
    insert into private.quest_mission_integrity_log (mission_id, event, reason)
    values (new.id, 'mission_hidden',
            format('%s retired question(s) had no approved replacement when the mission was published or edited', v_missing));
  end if;
  return new;
end;
$$;
revoke all on function private.quest_missions_integrity_guard() from public, anon, authenticated;

drop trigger if exists quest_missions_integrity_guard on public.quest_missions;
create trigger quest_missions_integrity_guard
before insert or update of is_active, route_template on public.quest_missions
for each row execute function private.quest_missions_integrity_guard();

-- A question being retired or deleted: repair every live mission that uses it.
create or replace function private.questions_retirement_quest_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qid uuid := old.id;
  v_mission record;
  v_route jsonb;
  v_missing int;
  v_reason text := case when tg_op = 'DELETE' then 'question deleted' else 'question retired' end;
begin
  for v_mission in
    select m.id, m.route_template
    from public.quest_missions m
    where m.is_active
      and exists (
        select 1 from jsonb_array_elements(m.route_template) e
        where nullif(e->>'question_id', '')::uuid = v_qid)
    for update
  loop
    select r.route, r.unresolved into v_route, v_missing
    from private.quest_repair_route(v_mission.route_template, v_mission.id, v_reason, v_qid) r;

    if v_missing > 0 then
      update public.quest_missions
      set route_template = v_route, is_active = false, updated_at = now()
      where id = v_mission.id;
      insert into private.quest_mission_integrity_log (mission_id, event, old_question_id, reason)
      values (v_mission.id, 'mission_hidden', v_qid,
              format('%s: %s question(s) had no approved replacement', v_reason, v_missing));
    else
      update public.quest_missions
      set route_template = v_route, updated_at = now()
      where id = v_mission.id;
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else null end;
end;
$$;
revoke all on function private.questions_retirement_quest_guard() from public, anon, authenticated;

drop trigger if exists questions_retirement_quest_guard on public.questions;
create trigger questions_retirement_quest_guard
after update of is_active on public.questions
for each row
when (old.is_active and not new.is_active)
execute function private.questions_retirement_quest_guard();

drop trigger if exists questions_delete_quest_guard on public.questions;
-- Before delete, so the question's subject/topic/grade can still be matched.
create trigger questions_delete_quest_guard
before delete on public.questions
for each row
execute function private.questions_retirement_quest_guard();
