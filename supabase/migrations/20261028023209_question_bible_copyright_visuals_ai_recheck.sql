-- Brains Heist Question Bible, Phase 1 (applied to production 2026-10-28; recorded here to close repo drift)
-- 1) copyright holder, 2) data-driven visuals, 3) AI recheck queue that keeps
--    unrechecked AI questions live but out of student evidence.

alter table public.questions
  add column if not exists copyright_holder text not null default 'Brains Heist LLC',
  add column if not exists visual_spec jsonb,
  add column if not exists ai_generated boolean not null default false,
  add column if not exists recheck_status text not null default 'not_required',
  add column if not exists recheck_requested_at timestamptz,
  add column if not exists rechecked_at timestamptz,
  add column if not exists rechecked_by uuid;

alter table public.questions
  add constraint questions_copyright_holder_check
    check (length(trim(copyright_holder)) between 2 and 200),
  add constraint questions_recheck_status_check
    check (recheck_status in ('not_required','pending','rechecked')),
  add constraint questions_visual_spec_check
    check (visual_spec is null or (
      jsonb_typeof(visual_spec) = 'object'
      and visual_spec->>'type' in ('graph','diagram','table')
      and length(trim(coalesce(visual_spec->>'alt_text',''))) between 20 and 240
    ));

comment on column public.questions.copyright_holder is 'Source and copyright owner of the question. Brains Heist LLC for all bank content.';
comment on column public.questions.visual_spec is 'Data for an app-drawn visual: {type: graph|diagram|table, alt_text, ...}. Rendered by the client; images stay in image_url.';
comment on column public.questions.ai_generated is 'True when the question was drafted by AI. Permanent marker, kept after recheck.';
comment on column public.questions.recheck_status is 'AI recheck state. pending = live for practice but excluded from student learning evidence until a super admin rechecks it.';

create index if not exists questions_recheck_pending_idx
  on public.questions (recheck_requested_at, id) where recheck_status = 'pending';

-- Flag AI-drafted Brains Heist questions on insert.
create or replace function private.flag_ai_question_for_recheck()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.content_origin = 'brain_heist'
     and (new.ai_generated
          or coalesce(new.verified_by_authority,'') ~* '(^|[^a-z])ai([^a-z]|$)') then
    new.ai_generated := true;
    if new.recheck_status = 'not_required' then
      new.recheck_status := 'pending';
    end if;
  end if;
  if new.recheck_status = 'pending' and new.recheck_requested_at is null then
    new.recheck_requested_at := now();
  end if;
  return new;
end $$;

create trigger trg_02_flag_ai_question_for_recheck
  before insert on public.questions
  for each row execute function private.flag_ai_question_for_recheck();

-- Visuals on verified questions are part of what was assessed: only trusted
-- service code may change them (content hash does not yet include visual_spec).
create or replace function private.guard_verified_question_visual_spec()
returns trigger language plpgsql set search_path to '' as $$
declare
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role'
    or current_user in ('postgres','supabase_admin','service_role');
begin
  if not v_service
     and old.pool_scope in ('global','school')
     and old.verification_status in ('verified','retired')
     and new.visual_spec is distinct from old.visual_spec then
    raise exception using errcode = '55000', message = 'verified_question_visual_is_immutable';
  end if;
  return new;
end $$;

create trigger trg_guard_verified_question_visual_spec
  before update of visual_spec on public.questions
  for each row execute function private.guard_verified_question_visual_spec();

-- Append-only recheck log.
create table if not exists public.question_recheck_events (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_content_hash text not null,
  action text not null check (action in ('rechecked','retired')),
  notes text,
  actor uuid not null,
  occurred_at timestamptz not null default now()
);
comment on table public.question_recheck_events is 'Append-only super admin decisions on AI-drafted questions in the recheck queue.';
alter table public.question_recheck_events enable row level security;
revoke all on public.question_recheck_events from anon, authenticated;

create or replace function private.reject_question_recheck_event_mutation()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception using errcode = '55000', message = 'question_recheck_events_are_append_only';
end $$;
create trigger trg_question_recheck_events_append_only
  before update or delete on public.question_recheck_events
  for each row execute function private.reject_question_recheck_event_mutation();

-- Super admin queue.
create or replace function public.rpc_superadmin_ai_recheck_queue(
  p_subject text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.questions q
              where q.recheck_status = 'pending'
                and (p_subject is null or q.subject = p_subject)),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.recheck_requested_at, x.id)
      from (
        select q.id, q.subject, q.topic_name, q.difficulty, q.grade, q.eligible_grade_levels,
               q.question_type, q.question_text, q.options, q.correct_answer, q.accepted_answers,
               q.explanation, q.image_url, q.image_alt_text, q.visual_spec,
               q.curriculum_objective, q.verified_by_authority, q.copyright_holder,
               q.is_active, q.times_answered, q.times_correct,
               q.created_at, q.recheck_requested_at
        from public.questions q
        where q.recheck_status = 'pending'
          and (p_subject is null or q.subject = p_subject)
        order by q.recheck_requested_at, q.id
        limit v_limit offset v_offset
      ) x), '[]'::jsonb)
  );
end $$;

create or replace function public.rpc_superadmin_ai_recheck_decide(
  p_question_id uuid, p_action text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_notes text := nullif(trim(coalesce(p_notes,'')),'');
  v_q public.questions%rowtype;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;
  if v_action not in ('approve','retire') then
    raise exception using errcode = '22023', message = 'invalid_recheck_action';
  end if;
  if v_action = 'retire' and length(coalesce(v_notes,'')) < 10 then
    raise exception using errcode = '22023', message = 'retire_requires_reason_of_10_characters';
  end if;

  select * into v_q from public.questions where id = p_question_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'question_not_found';
  end if;
  if v_q.recheck_status <> 'pending' then
    raise exception using errcode = '55000', message = 'question_not_awaiting_recheck';
  end if;

  if v_action = 'approve' then
    update public.questions
       set recheck_status = 'rechecked', rechecked_at = now(), rechecked_by = v_actor, updated_at = now()
     where id = p_question_id;
  else
    update public.questions
       set recheck_status = 'rechecked', rechecked_at = now(), rechecked_by = v_actor,
           verification_status = case when verification_status = 'verified' then 'retired' else verification_status end,
           analytics_eligible = false, is_public = false, is_active = false, updated_at = now()
     where id = p_question_id;
  end if;

  insert into public.question_recheck_events(question_id, question_content_hash, action, notes, actor)
  values (p_question_id, coalesce(v_q.current_content_hash,''),
          case when v_action = 'approve' then 'rechecked' else 'retired' end, v_notes, v_actor);

  return jsonb_build_object('question_id', p_question_id, 'action', v_action, 'recheck_status', 'rechecked');
end $$;

revoke all on function public.rpc_superadmin_ai_recheck_queue(text,integer,integer) from public, anon;
revoke all on function public.rpc_superadmin_ai_recheck_decide(uuid,text,text) from public, anon;
grant execute on function public.rpc_superadmin_ai_recheck_queue(text,integer,integer) to authenticated;
grant execute on function public.rpc_superadmin_ai_recheck_decide(uuid,text,text) to authenticated;

-- Keep pending-recheck questions out of both evidence ledgers.
do $do$
declare
  f text;
  d text;
  n integer;
begin
  foreach f in array array['materialize_verified_assignment_item_evidence',
                           'materialize_verified_assignment_registry_evidence'] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'private' and p.proname = f;
    if n <> 1 then raise exception 'expected one function %, found %', f, n; end if;
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'private' and p.proname = f;
    select count(*) into n from regexp_matches(d, 'q\.is_active', 'g');
    if n <> 1 then raise exception 'unexpected is_active matches in %: %', f, n; end if;
    d := replace(d, 'q.is_active', 'q.is_active' || E'\n     and q.recheck_status <> ''pending''');
    execute d;
  end loop;
end
$do$;
