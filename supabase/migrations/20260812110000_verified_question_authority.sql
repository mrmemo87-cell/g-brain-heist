-- Verified-question authority boundary
--
-- Brains Heist Verified questions are immutable, curriculum-governed evidence.
-- Teacher-authored questions remain private classroom material and can never
-- contribute to the official longitudinal Academic Profile.

create extension if not exists pgcrypto with schema extensions;

alter table public.questions
  add column if not exists content_origin text not null default 'teacher',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists analytics_eligible boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_by_authority text,
  add column if not exists verified_content_hash text,
  add column if not exists current_content_hash text,
  add column if not exists content_fingerprint text,
  add column if not exists content_version text not null default 'teacher-1',
  add column if not exists content_revision integer not null default 1;

alter table public.questions
  drop constraint if exists questions_content_origin_check,
  drop constraint if exists questions_verification_status_check,
  drop constraint if exists questions_content_revision_check,
  drop constraint if exists questions_authority_invariants_check;
alter table public.questions
  add constraint questions_content_origin_check
    check (content_origin in ('brain_heist', 'teacher')),
  add constraint questions_verification_status_check
    check (verification_status in ('unverified', 'in_review', 'verified', 'retired', 'rejected')),
  add constraint questions_content_revision_check check (content_revision > 0);

create or replace function private.question_content_hash(
  p_id uuid, p_question_text text, p_options jsonb, p_correct_answer text,
  p_explanation text, p_image_url text, p_question_type text
)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(concat_ws(E'\n',
    p_id::text, p_question_text, coalesce(p_options::text, ''), p_correct_answer,
    coalesce(p_explanation, ''), coalesce(p_image_url, ''), coalesce(p_question_type, '')
  ), 'sha256'), 'hex')
$$;

create or replace function private.question_content_fingerprint(
  p_subject text, p_topic text, p_question_text text, p_options jsonb,
  p_correct_answer text, p_question_type text
)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(concat_ws(E'\n',
    lower(trim(coalesce(p_subject, ''))), lower(trim(coalesce(p_topic, ''))),
    lower(regexp_replace(trim(coalesce(p_question_text, '')), '\s+', ' ', 'g')),
    coalesce(p_options::text, ''), lower(trim(coalesce(p_correct_answer, ''))),
    lower(trim(coalesce(p_question_type, '')))
  ), 'sha256'), 'hex')
$$;
revoke all on function private.question_content_hash(uuid,text,jsonb,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.question_content_fingerprint(text,text,text,jsonb,text,text)
  from public, anon, authenticated, service_role;

-- Only records that already have an active assessment item and an approved,
-- current objective mapping are promoted into the verified bank.
update public.questions q
set content_origin = 'brain_heist',
    verification_status = 'verified',
    analytics_eligible = true,
    verified_at = coalesce(q.updated_at, q.created_at, now()),
    verified_by = null,
    verified_by_authority = 'Brains Heist Academic Governance',
    verified_content_hash = i.content_hash,
    current_content_hash = i.content_hash,
    content_fingerprint = private.question_content_fingerprint(
      q.subject, coalesce(nullif(q.topic_name, ''), q.topic), q.question_text,
      q.options, q.correct_answer, q.question_type
    ),
    content_version = 'brain-heist-2026-1',
    content_revision = 1,
    is_public = true,
    curriculum_review_status = 'approved'
from public.curriculum_assessment_items i
where i.source_type = 'question_bank'
  and i.source_record_id = q.id::text
  and i.source_item_key = 'question'
  and i.is_active
  and i.content_hash = private.question_content_hash(
    q.id, q.question_text, q.options, q.correct_answer, q.explanation,
    q.image_url, q.question_type
  )
  and exists (
    select 1 from public.curriculum_item_objective_mappings im
    join public.curriculum_framework_versions fv on fv.id = im.framework_version_id
    where im.assessment_item_id = i.id and im.status = 'approved'
      and im.mapping_role = 'primary' and im.item_content_hash = i.content_hash
      and fv.status in ('published', 'retired')
      and im.curriculum_version_content_hash = fv.content_hash
  );

-- Everything not promoted above becomes private teacher material. This is
-- intentionally destructive to legacy public flags: new-school safety wins.
update public.questions q
set content_origin = 'teacher', verification_status = 'unverified',
    analytics_eligible = false, verified_at = null, verified_by = null,
    verified_by_authority = null, verified_content_hash = null,
    current_content_hash = private.question_content_hash(
      q.id, q.question_text, q.options, q.correct_answer, q.explanation,
      q.image_url, q.question_type
    ),
    content_fingerprint = private.question_content_fingerprint(
      q.subject, coalesce(nullif(q.topic_name, ''), q.topic), q.question_text,
      q.options, q.correct_answer, q.question_type
    ),
    content_version = 'teacher-1', content_revision = greatest(q.content_revision, 1),
    is_public = false, curriculum_review_status = 'draft',
    curriculum_strand = null, curriculum_skill = null,
    curriculum_subskill = null, curriculum_objective = null
where q.content_origin <> 'brain_heist' or q.verification_status <> 'verified';

alter table public.questions add constraint questions_authority_invariants_check check (
  (
    content_origin = 'brain_heist'
    and verification_status in ('verified', 'retired')
    and verified_at is not null
    and nullif(trim(verified_by_authority), '') is not null
    and verified_content_hash ~ '^[0-9a-f]{64}$'
    and current_content_hash = verified_content_hash
    and content_fingerprint ~ '^[0-9a-f]{64}$'
    and nullif(trim(curriculum_strand), '') is not null
    and nullif(trim(curriculum_skill), '') is not null
    and nullif(trim(curriculum_subskill), '') is not null
    and nullif(trim(curriculum_objective), '') is not null
    and cardinality(eligible_grade_levels) > 0
    and curriculum_review_status = 'approved'
    and ((verification_status = 'verified' and analytics_eligible and is_public)
      or (verification_status = 'retired' and not analytics_eligible and not is_public))
  ) or (
    content_origin = 'teacher' and verification_status = 'unverified'
    and not analytics_eligible and not is_public
    and verified_at is null and verified_by is null
    and verified_by_authority is null and verified_content_hash is null
    and curriculum_review_status = 'draft'
    and curriculum_strand is null and curriculum_skill is null
    and curriculum_subskill is null and curriculum_objective is null
  )
);

create index if not exists questions_verified_analytics_idx
  on public.questions(academic_subject_id, is_active)
  where content_origin = 'brain_heist' and verification_status = 'verified'
    and analytics_eligible and is_public;
with ranked_teacher_duplicates as (
  select q.id, row_number() over (
    partition by q.teacher_id, q.content_fingerprint
    order by q.created_at, q.id
  ) as duplicate_rank
  from public.questions q
  where q.content_origin = 'teacher' and q.is_active and q.teacher_id is not null
)
update public.questions q set is_active = false, updated_at = now()
from ranked_teacher_duplicates d
where q.id = d.id and d.duplicate_rank > 1;
create unique index if not exists questions_teacher_active_fingerprint_uidx
  on public.questions(teacher_id, content_fingerprint)
  where content_origin = 'teacher' and is_active;

create or replace function private.enforce_question_authority()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
  v_content_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_content_changed := row(new.subject, new.topic, new.topic_name, new.question_text,
      new.options, new.correct_answer, new.explanation, new.image_url, new.question_type)
      is distinct from row(old.subject, old.topic, old.topic_name, old.question_text,
      old.options, old.correct_answer, old.explanation, old.image_url, old.question_type);
    if old.content_origin = 'brain_heist' and v_content_changed then
      raise exception using errcode = '55000', message = 'verified_question_content_is_immutable';
    end if;
    if not v_service and row(new.content_origin, new.verification_status,
      new.analytics_eligible, new.verified_at, new.verified_by,
      new.verified_by_authority, new.verified_content_hash, new.content_version)
      is distinct from row(old.content_origin, old.verification_status,
      old.analytics_eligible, old.verified_at, old.verified_by,
      old.verified_by_authority, old.verified_content_hash, old.content_version) then
      raise exception using errcode = '42501', message = 'question_authority_fields_are_protected';
    end if;
  end if;

  if not v_service and (tg_op = 'INSERT' or new.content_origin = 'teacher') then
    new.content_origin := 'teacher'; new.verification_status := 'unverified';
    new.analytics_eligible := false; new.is_public := false;
    new.verified_at := null; new.verified_by := null;
    new.verified_by_authority := null; new.verified_content_hash := null;
    new.curriculum_review_status := 'draft'; new.curriculum_strand := null;
    new.curriculum_skill := null; new.curriculum_subskill := null;
    new.curriculum_objective := null;
  end if;

  new.current_content_hash := private.question_content_hash(
    new.id, new.question_text, new.options, new.correct_answer,
    new.explanation, new.image_url, new.question_type
  );
  new.content_fingerprint := private.question_content_fingerprint(
    new.subject, coalesce(nullif(new.topic_name, ''), new.topic),
    new.question_text, new.options, new.correct_answer, new.question_type
  );
  if tg_op = 'UPDATE' and new.content_origin = 'teacher' and v_content_changed then
    new.content_revision := old.content_revision + 1;
    new.content_version := 'teacher-' || new.content_revision::text;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_question_authority()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_enforce_question_authority on public.questions;
create trigger trg_enforce_question_authority
before insert or update on public.questions for each row
execute function private.enforce_question_authority();

-- Replace permissive/legacy policies. Official bank visibility is explicit;
-- private teacher content is never shared across teachers or schools.
drop policy if exists "Public questions are viewable by everyone" on public.questions;
drop policy if exists "questions_read_all" on public.questions;
drop policy if exists "Students view assignment questions" on public.questions;
drop policy if exists "Teachers can insert own questions" on public.questions;
drop policy if exists "Teachers can update own questions" on public.questions;
drop policy if exists "Teachers can delete own questions" on public.questions;
drop policy if exists "Teachers can insert their own questions" on public.questions;
drop policy if exists "Teachers can update their own questions" on public.questions;
drop policy if exists "Teachers can delete their own questions" on public.questions;
drop policy if exists "questions_select_own" on public.questions;
drop policy if exists "questions_insert_own" on public.questions;
drop policy if exists "questions_update_own" on public.questions;
drop policy if exists "questions_delete_own" on public.questions;

alter table public.questions enable row level security;
create policy questions_select_authorized on public.questions for select to authenticated
using (
  (content_origin = 'teacher' and exists (
    select 1 from public.teachers t where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  ))
  or (content_origin = 'brain_heist' and verification_status = 'verified'
    and analytics_eligible and is_public and current_content_hash = verified_content_hash
    and (
      exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
      or exists (select 1 from public.users u where u.id = (select auth.uid())
        and (u.role in ('admin', 'school_admin', 'school_head') or coalesce(u.is_admin, false)))
      or exists (
        select 1 from public.assignment_questions aq
        join public.student_assignments sa on sa.assignment_id = aq.assignment_id
        where aq.question_id = questions.id and sa.student_id = (select auth.uid())
      )
    ))
);
create policy questions_insert_teacher_private on public.questions for insert to authenticated
with check (content_origin = 'teacher' and verification_status = 'unverified'
  and not analytics_eligible and not is_public and exists (
    select 1 from public.teachers t where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  ));
create policy questions_update_teacher_private on public.questions for update to authenticated
using (content_origin = 'teacher' and exists (
  select 1 from public.teachers t where t.id = questions.teacher_id
    and t.user_id = (select auth.uid())
)) with check (content_origin = 'teacher' and verification_status = 'unverified'
  and not analytics_eligible and not is_public and exists (
    select 1 from public.teachers t where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  ));
create policy questions_delete_teacher_private on public.questions for delete to authenticated
using (content_origin = 'teacher' and exists (
  select 1 from public.teachers t where t.id = questions.teacher_id
    and t.user_id = (select auth.uid())
));
revoke all on table public.questions from anon;
grant select, insert, update, delete on table public.questions to authenticated;

-- The teacher library returns only verified Brains Heist content plus the
-- caller's own private questions. p_teacher_id can never enumerate another pool.
drop function if exists public.get_all_active_questions(text,text,uuid,integer,integer);
create function public.get_all_active_questions(
  p_subject text default null, p_difficulty text default null,
  p_teacher_id uuid default null, p_limit integer default 500, p_offset integer default 0
)
returns table (
  id uuid, teacher_id uuid, subject text, subject_id text, topic text,
  topic_name text, difficulty text, question_text text, image_url text,
  question_type text, options jsonb, correct_answer text, explanation text,
  hints text[], time_limit integer, points integer, tags text[], grade_level text,
  is_public boolean, is_active boolean, times_answered integer, times_correct integer,
  created_at timestamptz, updated_at timestamptz, creator_name text,
  creator_school_id uuid, is_mine boolean, content_origin text,
  verification_status text, analytics_eligible boolean, verified_at timestamptz,
  verified_by uuid, verified_by_authority text, verified_content_hash text,
  current_content_hash text, content_version text, content_revision integer,
  eligible_grade_levels smallint[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_teacher uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id = v_actor;
  if v_teacher is null then raise exception using errcode = '42501', message = 'teacher_required'; end if;
  if p_teacher_id is not null and p_teacher_id <> v_teacher then
    raise exception using errcode = '42501', message = 'cannot_browse_another_teacher_pool';
  end if;
  return query
  select q.id, q.teacher_id, q.subject, q.subject_id, q.topic, q.topic_name,
    q.difficulty, q.question_text, q.image_url, q.question_type, q.options,
    q.correct_answer, q.explanation, q.hints, q.time_limit, q.points, q.tags,
    q.grade_level, q.is_public, q.is_active, q.times_answered, q.times_correct,
    q.created_at, q.updated_at,
    case when q.content_origin = 'brain_heist' then 'Brains Heist' else coalesce(u.username, 'Teacher') end,
    case when q.content_origin = 'brain_heist' then null else u.school_id end,
    q.content_origin = 'teacher' and q.teacher_id = v_teacher,
    q.content_origin, q.verification_status, q.analytics_eligible, q.verified_at,
    q.verified_by, q.verified_by_authority, q.verified_content_hash,
    q.current_content_hash, q.content_version, q.content_revision,
    q.eligible_grade_levels
  from public.questions q
  left join public.teachers t on t.id = q.teacher_id
  left join public.users u on u.id = t.user_id
  where q.is_active
    and (p_subject is null or q.subject = p_subject)
    and (p_difficulty is null or q.difficulty = p_difficulty)
    and (
      (q.content_origin = 'brain_heist' and q.verification_status = 'verified'
        and q.analytics_eligible and q.is_public
        and q.current_content_hash = q.verified_content_hash)
      or (q.content_origin = 'teacher' and q.teacher_id = v_teacher)
    )
    and (p_teacher_id is null or q.teacher_id = v_teacher)
  order by q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer)
  to authenticated, service_role;

-- One transaction, strict field allowlist, 500-row cap, and server-side
-- duplicate protection. Client-supplied authority fields are never accepted.
create or replace function public.rpc_teacher_bulk_create_questions(p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_teacher uuid;
  v_item jsonb;
  v_count integer;
  v_created integer := 0;
  v_options jsonb;
  v_question_type text;
  v_row integer := 0;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id = v_actor;
  if v_teacher is null then raise exception using errcode = '42501', message = 'teacher_required'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception using errcode = '22023', message = 'questions_array_required'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 500 then raise exception using errcode = '22023', message = 'bulk_import_requires_1_to_500_questions'; end if;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_row := v_row + 1;
    v_question_type := coalesce(nullif(trim(v_item->>'question_type'), ''), 'multiple_choice');
    v_options := coalesce(v_item->'options', '[]'::jsonb);
    if nullif(trim(v_item->>'subject'), '') is null
      or nullif(trim(v_item->>'question_text'), '') is null
      or nullif(trim(v_item->>'correct_answer'), '') is null then
      raise exception using errcode = '22023', message = format('invalid_required_fields_at_row_%s', v_row);
    end if;
    if v_question_type not in ('multiple_choice', 'true_false', 'short_answer') then
      raise exception using errcode = '22023', message = format('invalid_question_type_at_row_%s', v_row);
    end if;
    if coalesce(nullif(v_item->>'difficulty', ''), 'medium') not in ('easy', 'medium', 'hard') then
      raise exception using errcode = '22023', message = format('invalid_difficulty_at_row_%s', v_row);
    end if;
    if v_question_type = 'multiple_choice' and (jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2) then
      raise exception using errcode = '22023', message = format('multiple_choice_options_required_at_row_%s', v_row);
    end if;

    insert into public.questions (
      teacher_id, subject, subject_id, topic, topic_name, difficulty,
      question_text, question_type, options, correct_answer, explanation,
      hints, time_limit, points, tags, grade_level, eligible_grade_levels,
      content_origin, verification_status, analytics_eligible, is_public,
      curriculum_review_status
    ) values (
      v_teacher, trim(v_item->>'subject'), nullif(trim(v_item->>'subject_id'), ''),
      coalesce(nullif(trim(v_item->>'topic'), ''), 'General'),
      coalesce(nullif(trim(v_item->>'topic'), ''), 'General'),
      coalesce(nullif(v_item->>'difficulty', ''), 'medium'),
      trim(v_item->>'question_text'), v_question_type, v_options,
      trim(v_item->>'correct_answer'), nullif(trim(v_item->>'explanation'), ''),
      case when jsonb_typeof(v_item->'hints') = 'array' then
        array(select jsonb_array_elements_text(v_item->'hints')) else '{}'::text[] end,
      greatest(10, least(coalesce((v_item->>'time_limit')::integer, 30), 1800)),
      greatest(1, least(coalesce((v_item->>'points')::integer, 10), 30)),
      case when jsonb_typeof(v_item->'tags') = 'array' then
        array(select jsonb_array_elements_text(v_item->'tags')) else '{}'::text[] end,
      nullif(trim(v_item->>'grade_level'), ''),
      case when jsonb_typeof(v_item->'eligible_grade_levels') = 'array' then
        array(select value::smallint from jsonb_array_elements_text(v_item->'eligible_grade_levels') value
          where value::integer between 1 and 12) else '{}'::smallint[] end,
      'teacher', 'unverified', false, false, 'draft'
    ) on conflict (teacher_id, content_fingerprint)
      where content_origin = 'teacher' and is_active do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;
  return jsonb_build_object('submitted', v_count, 'created', v_created,
    'duplicatesSkipped', v_count - v_created);
end;
$$;
revoke all on function public.rpc_teacher_bulk_create_questions(jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_teacher_bulk_create_questions(jsonb)
  to authenticated, service_role;

-- Preserve the exact content and authority decision used when an assignment is
-- assembled. Later teacher edits/deletes cannot rewrite historical attempts.
alter table public.assignment_questions
  add column if not exists question_snapshot jsonb,
  add column if not exists question_content_hash text,
  add column if not exists content_origin_snapshot text,
  add column if not exists verification_status_snapshot text,
  add column if not exists analytics_eligible_snapshot boolean not null default false,
  add column if not exists snapshotted_at timestamptz;

update public.assignment_questions aq
set question_snapshot = to_jsonb(q),
    question_content_hash = q.current_content_hash,
    content_origin_snapshot = q.content_origin,
    verification_status_snapshot = q.verification_status,
    analytics_eligible_snapshot = (
      q.content_origin = 'brain_heist' and q.verification_status = 'verified'
      and q.analytics_eligible and q.is_public
      and q.current_content_hash = q.verified_content_hash
    ),
    snapshotted_at = coalesce(aq.snapshotted_at, now())
from public.questions q where q.id = aq.question_id
  and aq.question_snapshot is null;

create or replace function private.capture_assignment_question_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_question public.questions;
  v_assignment_teacher uuid;
begin
  select a.teacher_id into v_assignment_teacher from public.assignments a where a.id = new.assignment_id;
  if v_assignment_teacher is null then
    raise exception using errcode = '23503', message = 'assignment_not_found';
  end if;
  select q.* into v_question from public.questions q
  where q.id = new.question_id and q.is_active and (
    (q.content_origin = 'brain_heist' and q.verification_status = 'verified'
      and q.analytics_eligible and q.is_public
      and q.current_content_hash = q.verified_content_hash)
    or (q.content_origin = 'teacher' and q.teacher_id = v_assignment_teacher)
  );
  if v_question.id is null then
    raise exception using errcode = '42501', message = 'question_not_authorized_for_assignment';
  end if;
  new.question_snapshot := to_jsonb(v_question);
  new.question_content_hash := v_question.current_content_hash;
  new.content_origin_snapshot := v_question.content_origin;
  new.verification_status_snapshot := v_question.verification_status;
  new.analytics_eligible_snapshot := v_question.content_origin = 'brain_heist'
    and v_question.verification_status = 'verified' and v_question.analytics_eligible
    and v_question.is_public
    and v_question.current_content_hash = v_question.verified_content_hash;
  new.snapshotted_at := now();
  return new;
end;
$$;
revoke all on function private.capture_assignment_question_snapshot()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_capture_assignment_question_snapshot on public.assignment_questions;
create trigger trg_capture_assignment_question_snapshot
before insert or update of question_id on public.assignment_questions
for each row execute function private.capture_assignment_question_snapshot();

alter table public.assignment_questions alter column question_snapshot set not null;
alter table public.assignment_questions alter column question_content_hash set not null;
alter table public.assignment_questions alter column content_origin_snapshot set not null;
alter table public.assignment_questions alter column verification_status_snapshot set not null;
alter table public.assignment_questions alter column snapshotted_at set not null;
alter table public.assignment_questions
  drop constraint if exists assignment_questions_snapshot_authority_check;
alter table public.assignment_questions add constraint assignment_questions_snapshot_authority_check check (
  content_origin_snapshot in ('brain_heist', 'teacher')
  and verification_status_snapshot in ('unverified', 'in_review', 'verified', 'retired', 'rejected')
  and question_content_hash ~ '^[0-9a-f]{64}$'
  and (not analytics_eligible_snapshot or (
    content_origin_snapshot = 'brain_heist' and verification_status_snapshot = 'verified'
  ))
);

create or replace function public.rpc_get_student_pending_assignments()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid := auth.uid();
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return (select coalesce(jsonb_agg(payload order by assigned_at), '[]'::jsonb) from (
    select jsonb_build_object(
      'assignment_id', a.id, 'subject_id', a.subject_id, 'subject_name', a.subject_name,
      'topic_name', a.topic_name, 'batch', a.batch, 'teacher_username', u.username,
      'assigned_at', a.assigned_at, 'due_at', a.due_at, 'title', a.title,
      'instructions', a.instructions, 'publish_status', a.publish_status,
      'close_submissions_after_due', a.close_submissions_after_due,
      'is_late', (a.due_at is not null and a.due_at < now()),
      'is_closed', (a.close_submissions_after_due and a.due_at is not null and a.due_at < now()),
      'questions', (select coalesce(jsonb_agg(aq.question_snapshot order by aq.order_index), '[]'::jsonb)
        from public.assignment_questions aq where aq.assignment_id = a.id)
    ) payload, sa.assigned_at
    from public.student_assignments sa
    join public.assignments a on a.id = sa.assignment_id
    join public.teachers t on t.id = a.teacher_id
    join public.users u on u.id = t.user_id
    where sa.student_id = v_student_id and sa.status = 'pending'
      and a.publish_status in ('published', 'scheduled') and a.assigned_at <= now()
      and exists (select 1 from public.assignment_questions aq where aq.assignment_id = a.id)
  ) x);
end;
$$;
revoke all on function public.rpc_get_student_pending_assignments() from public, anon, authenticated;
grant execute on function public.rpc_get_student_pending_assignments() to authenticated, service_role;

create or replace function public.rpc_get_student_active_assignment()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid := auth.uid(); v_assignment_id uuid; v_payload jsonb;
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select sa.assignment_id into v_assignment_id
  from public.student_assignments sa join public.assignments a on a.id = sa.assignment_id
  where sa.student_id = v_student_id and sa.status = 'pending'
    and a.publish_status in ('published', 'scheduled') and a.assigned_at <= now()
    and not (a.close_submissions_after_due and a.due_at is not null and a.due_at < now())
    and exists (select 1 from public.assignment_questions aq where aq.assignment_id = a.id)
  order by sa.assigned_at limit 1;
  if v_assignment_id is null then return null; end if;
  select jsonb_build_object(
    'assignment_id', a.id, 'subject_id', a.subject_id, 'subject_name', a.subject_name,
    'topic_name', a.topic_name, 'batch', a.batch, 'teacher_username', u.username,
    'assigned_at', a.assigned_at, 'due_at', a.due_at, 'title', a.title,
    'instructions', a.instructions, 'publish_status', a.publish_status,
    'close_submissions_after_due', a.close_submissions_after_due,
    'is_late', (a.due_at is not null and a.due_at < now()), 'is_closed', false,
    'questions', (select coalesce(jsonb_agg(aq.question_snapshot order by aq.order_index), '[]'::jsonb)
      from public.assignment_questions aq where aq.assignment_id = a.id)
  ) into v_payload
  from public.assignments a join public.teachers t on t.id = a.teacher_id
  join public.users u on u.id = t.user_id where a.id = v_assignment_id;
  return v_payload;
end;
$$;
revoke all on function public.rpc_get_student_active_assignment() from public, anon, authenticated;
grant execute on function public.rpc_get_student_active_assignment() to authenticated, service_role;

-- Keep the legacy argument signature for deployed clients, but never trust
-- browser-supplied question text, answer key, or correctness.
create or replace function public.rpc_submit_assignment_answer(
  p_assignment_id uuid, p_question_id uuid, p_question_text text,
  p_correct_answer text, p_student_answer text, p_is_correct boolean,
  p_time_taken_ms integer default 0
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid(); v_snapshot jsonb; v_status text;
  v_due_at timestamptz; v_close boolean; v_is_correct boolean;
  v_normalized_student text; v_normalized_correct text;
begin
  if v_student is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select aq.question_snapshot, sa.status, a.due_at, a.close_submissions_after_due
  into v_snapshot, v_status, v_due_at, v_close
  from public.assignment_questions aq
  join public.assignments a on a.id = aq.assignment_id
  join public.student_assignments sa on sa.assignment_id = a.id and sa.student_id = v_student
  where aq.assignment_id = p_assignment_id and aq.question_id = p_question_id;
  if not found then raise exception 'QUESTION_NOT_IN_ASSIGNED_ASSIGNMENT'; end if;
  if v_status not in ('pending', 'in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
  if v_close and v_due_at is not null and now() > v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if nullif(trim(v_snapshot->>'correct_answer'), '') is null then raise exception 'ASSIGNMENT_ANSWER_KEY_MISSING'; end if;

  v_normalized_student := lower(regexp_replace(trim(coalesce(p_student_answer, '')), '\s+', ' ', 'g'));
  v_normalized_correct := lower(regexp_replace(trim(v_snapshot->>'correct_answer'), '\s+', ' ', 'g'));
  v_is_correct := v_normalized_student = v_normalized_correct;

  insert into public.student_assignment_answers (
    assignment_id, student_id, question_id, question_text, correct_answer,
    student_answer, is_correct, time_taken_ms, answered_at
  ) values (
    p_assignment_id, v_student, p_question_id, v_snapshot->>'question_text',
    v_snapshot->>'correct_answer', coalesce(p_student_answer, ''), v_is_correct,
    greatest(0, least(coalesce(p_time_taken_ms, 0), 3600000)), now()
  ) on conflict (assignment_id, student_id, question_id) do update set
    question_text = excluded.question_text, correct_answer = excluded.correct_answer,
    student_answer = excluded.student_answer, is_correct = excluded.is_correct,
    time_taken_ms = excluded.time_taken_ms, answered_at = excluded.answered_at;

  update public.student_assignments set status = 'in_progress'
  where assignment_id = p_assignment_id and student_id = v_student and status = 'pending';
end;
$$;
revoke all on function public.rpc_submit_assignment_answer(uuid,uuid,text,text,text,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.rpc_submit_assignment_answer(uuid,uuid,text,text,text,boolean,integer)
  to authenticated, service_role;

create or replace function public.rpc_submit_assignment_result(
  p_assignment_id uuid, p_correct integer, p_incorrect integer,
  p_accuracy integer, p_score integer, p_time_taken integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_student_id uuid := auth.uid(); v_assignment_status text; v_question_count integer;
  v_max_score integer; v_server_correct integer; v_server_incorrect integer;
  v_server_accuracy integer; v_server_score integer; v_updated_assignment_id uuid;
  v_due_at timestamptz; v_close boolean;
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select sa.status, count(aq.question_id)::integer,
    coalesce(sum(coalesce((aq.question_snapshot->>'points')::integer, 0)), 0)::integer,
    a.due_at, a.close_submissions_after_due
  into v_assignment_status, v_question_count, v_max_score, v_due_at, v_close
  from public.assignments a
  join public.student_assignments sa on sa.assignment_id = a.id and sa.student_id = v_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id group by sa.status, a.due_at, a.close_submissions_after_due;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED'; end if;
  if v_close and v_due_at is not null and now() > v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if v_question_count <= 0 then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS'; end if;
  if v_assignment_status not in ('pending', 'in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
  if exists (select 1 from public.student_assignment_results r
    where r.assignment_id = p_assignment_id and r.student_id = v_student_id) then
    raise exception 'ASSIGNMENT_ALREADY_SUBMITTED';
  end if;
  if p_time_taken < 0 then raise exception 'INVALID_VALUES'; end if;
  select count(*) filter (where saa.is_correct)::integer,
    count(*) filter (where not saa.is_correct)::integer,
    coalesce(sum(case when saa.is_correct then
      coalesce((aq.question_snapshot->>'points')::integer, 0) else 0 end), 0)::integer
  into v_server_correct, v_server_incorrect, v_server_score
  from public.assignment_questions aq
  left join public.student_assignment_answers saa on saa.assignment_id = aq.assignment_id
    and saa.question_id = aq.question_id and saa.student_id = v_student_id
  where aq.assignment_id = p_assignment_id;
  if v_server_correct + v_server_incorrect <> v_question_count then
    raise exception 'MISMATCHED_QUESTION_TOTAL';
  end if;
  v_server_accuracy := round((v_server_correct::numeric * 100.0) / greatest(v_question_count, 1));
  if v_server_score > v_max_score then raise exception 'INVALID_SERVER_SCORE'; end if;
  update public.student_assignments set status = 'completed', completed_at = now()
  where assignment_id = p_assignment_id and student_id = v_student_id
    and status in ('pending', 'in_progress') returning assignment_id into v_updated_assignment_id;
  if v_updated_assignment_id is null then raise exception 'ASSIGNMENT_STATE_TRANSITION_FAILED'; end if;
  insert into public.student_assignment_results(
    assignment_id, student_id, correct, incorrect, accuracy, score,
    time_taken_seconds, completed_at, submitted_late
  ) values (p_assignment_id, v_student_id, v_server_correct, v_server_incorrect,
    v_server_accuracy, v_server_score, greatest(p_time_taken, 0), now(),
    v_due_at is not null and now() > v_due_at);
end;
$$;
revoke all on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer)
  to authenticated, service_role;

create or replace function public.rpc_get_assignment_student_answers(
  p_assignment_id uuid, p_teacher_id uuid, p_student_id uuid default null
)
returns table (
  student_id uuid, student_name text, student_batch text, question_id uuid,
  question_text text, correct_answer text, student_answer text,
  is_correct boolean, time_taken_ms integer, answered_at timestamptz,
  explanation text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.assignments a join public.teachers t on t.id = a.teacher_id
    where a.id = p_assignment_id and a.teacher_id = p_teacher_id
      and t.user_id = auth.uid()
  ) then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select saa.student_id, u.username::text, u.batch::text, saa.question_id,
    saa.question_text, saa.correct_answer, saa.student_answer, saa.is_correct,
    saa.time_taken_ms, saa.answered_at, aq.question_snapshot->>'explanation'
  from public.student_assignment_answers saa
  join public.users u on u.id = saa.student_id
  join public.assignment_questions aq on aq.assignment_id = saa.assignment_id
    and aq.question_id = saa.question_id
  where saa.assignment_id = p_assignment_id
    and (p_student_id is null or saa.student_id = p_student_id)
  order by u.username, aq.order_index;
end;
$$;
revoke all on function public.rpc_get_assignment_student_answers(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_get_assignment_student_answers(uuid,uuid,uuid)
  to authenticated, service_role;

-- Student game/learning catalog is also fail-closed: public is insufficient.
create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null, p_limit integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid(); v_school uuid; v_year uuid;
  v_grade text; v_scope uuid; v_subject uuid;
begin
  if v_student is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select u.school_id into v_school from public.users u where u.id = v_student;
  if v_school is null then return jsonb_build_object('success', true, 'ready', false, 'code', 'school_required', 'questions', '[]'::jsonb); end if;

  select e.academic_year_id, e.grade_level into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y on y.id = e.academic_year_id and y.status = 'current'
  where e.student_id = v_student and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc limit 1;
  if v_year is null or v_grade is null then
    return jsonb_build_object('success', true, 'ready', false,
      'code', 'current_grade_enrolment_required', 'questions', '[]'::jsonb);
  end if;

  select m.curriculum_scope_id, m.academic_subject_id into v_scope, v_subject
  from public.school_curriculum_scope_mappings m
  join public.academic_subjects a on a.id = m.academic_subject_id
  where m.school_id = v_school and m.academic_year_id = v_year
    and m.grade_level = v_grade and m.status = 'active'
    and (a.code = public.academic_normalize_subject_key(p_subject_code) or a.id::text = p_subject_code)
    and (m.subject_requirement = 'required' or exists (
      select 1 from public.student_subject_enrolments se
      where se.student_id = v_student and se.academic_year_id = v_year
        and se.academic_subject_id = m.academic_subject_id and se.status = 'active'
        and current_date >= se.starts_on and (se.ends_on is null or current_date <= se.ends_on)
    )) limit 1;
  if v_scope is null then
    return jsonb_build_object('success', true, 'ready', true,
      'code', 'subject_not_enrolled', 'questions', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true, 'ready', true, 'academicYearId', v_year,
    'gradeLevel', v_grade, 'scopeId', v_scope,
    'questions', coalesce((
      select jsonb_agg(question_row.payload order by random()) from (
        select jsonb_build_object(
          'id', q.id, 'teacher_id', q.teacher_id, 'subject', a.name,
          'subject_id', a.code, 'topic', q.topic, 'topic_name', q.topic_name,
          'difficulty', q.difficulty, 'question_text', q.question_text,
          'image_url', q.image_url, 'question_type', q.question_type,
          'options', q.options, 'correct_answer', q.correct_answer,
          'explanation', q.explanation, 'hints', to_jsonb(q.hints),
          'time_limit', q.time_limit, 'points', q.points, 'tags', to_jsonb(q.tags),
          'grade_level', v_grade, 'is_public', q.is_public, 'is_active', q.is_active,
          'times_answered', q.times_answered, 'times_correct', q.times_correct,
          'created_at', q.created_at, 'updated_at', q.updated_at,
          'content_origin', q.content_origin, 'verification_status', q.verification_status,
          'analytics_eligible', q.analytics_eligible,
          'curriculum', jsonb_build_object(
            'objectiveId', o.id, 'objectiveCode', o.code, 'objective', o.statement,
            'scopeId', im.curriculum_scope_id, 'confidence', im.confidence_score,
            'mappingRole', im.mapping_role
          )
        ) payload
        from public.curriculum_item_objective_mappings im
        join public.curriculum_assessment_items i on i.id = im.assessment_item_id
          and i.is_active and i.source_type = 'question_bank'
        join public.questions q on q.id::text = i.source_record_id
          and q.is_active and q.is_public and q.content_origin = 'brain_heist'
          and q.verification_status = 'verified' and q.analytics_eligible
          and q.current_content_hash = q.verified_content_hash
          and i.content_hash = q.verified_content_hash
        join public.curriculum_objectives o on o.id = im.curriculum_objective_id
        join public.curriculum_framework_versions fv on fv.id = im.framework_version_id
          and fv.status = 'published'
        join public.academic_subjects a on a.id = i.academic_subject_id
        where im.curriculum_scope_id = v_scope and im.academic_subject_id = v_subject
          and im.status = 'approved' and im.mapping_role = 'primary'
          and im.item_content_hash = i.content_hash
          and im.curriculum_version_content_hash = fv.content_hash
        order by random() limit greatest(1, least(coalesce(p_limit, 20), 500))
      ) question_row
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_learning_catalog(text,integer)
  from public, anon, authenticated;
grant execute on function public.rpc_student_learning_catalog(text,integer)
  to authenticated, service_role;

-- Official assignment evidence is calculated only from the verified subset.
-- Teacher questions remain available to grading and classroom reports, but are
-- absent from this function by construction.
create or replace function public.student_learning_ingest_assignment_result(
  p_assignment_id uuid, p_student_id uuid, p_completed_at timestamptz,
  p_accuracy integer, p_score integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_assignment record; v_school_id uuid; v_expected_count integer := 0;
  v_answered_count integer := 0; v_group record; v_percentage numeric;
  v_kind text; v_skill_key text; v_source_key text; v_quality text;
  v_contributes boolean;
begin
  if p_assignment_id is null or p_student_id is null or p_completed_at is null then return; end if;
  select a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''),
      nullif(trim(a.subject_id), ''), 'General') as subject_name,
    sa.status, r.correct, r.incorrect, count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot, a.subject_name, a.subject,
    a.subject_id, sa.status, r.correct, r.incorrect;
  if not found then return; end if;

  v_expected_count := coalesce(v_assignment.expected_count, 0);
  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id;
  if v_assignment.status <> 'completed' or v_expected_count <= 0
    or v_answered_count <> v_expected_count
    or (coalesce(v_assignment.correct, 0) + coalesce(v_assignment.incorrect, 0)) <> v_expected_count
    or v_assignment.academic_year_id is null or v_assignment.academic_subject_id is null
    or nullif(trim(v_assignment.grade_level_snapshot), '') is null then return; end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  for v_group in
    select im.curriculum_objective_id, im.curriculum_scope_id,
      o.code as objective_code, o.statement as objective_statement,
      topic_node.name as topic_name, skill_node.name as skill_name,
      subskill_node.name as subskill_name, count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count,
      array_agg(distinct saa.question_id order by saa.question_id) as question_ids
    from public.student_assignment_answers saa
    join public.assignment_questions aq on aq.assignment_id = saa.assignment_id
      and aq.question_id = saa.question_id and aq.analytics_eligible_snapshot
      and aq.content_origin_snapshot = 'brain_heist'
      and aq.verification_status_snapshot = 'verified'
    join public.questions q on q.id = saa.question_id
      and q.content_origin = 'brain_heist' and q.verification_status = 'verified'
      and q.analytics_eligible and q.is_public
      and q.current_content_hash = q.verified_content_hash
      and aq.question_content_hash = q.verified_content_hash
    join public.curriculum_assessment_items i on i.source_type = 'question_bank'
      and i.source_record_id = saa.question_id::text and i.source_item_key = 'question'
      and i.is_active and i.content_hash = q.verified_content_hash
    join public.school_curriculum_scope_mappings scm on scm.school_id = v_school_id
      and scm.academic_year_id = v_assignment.academic_year_id
      and scm.grade_level = v_assignment.grade_level_snapshot
      and scm.academic_subject_id = v_assignment.academic_subject_id and scm.status = 'active'
    join public.curriculum_item_objective_mappings im on im.assessment_item_id = i.id
      and im.curriculum_scope_id = scm.curriculum_scope_id
      and im.academic_subject_id = v_assignment.academic_subject_id
      and im.status = 'approved' and im.mapping_role = 'primary'
      and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv on fv.id = im.framework_version_id
      and fv.status in ('published', 'retired')
      and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o on o.id = im.curriculum_objective_id
    join public.curriculum_nodes subskill_node on subskill_node.id = o.curriculum_node_id
      and subskill_node.node_type = 'subskill'
    join public.curriculum_nodes skill_node on skill_node.id = subskill_node.parent_node_id
      and skill_node.node_type = 'skill'
    join public.curriculum_nodes topic_node on topic_node.id = skill_node.parent_node_id
      and topic_node.node_type = 'topic'
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by im.curriculum_objective_id, im.curriculum_scope_id, o.code, o.statement,
      topic_node.name, skill_node.name, subskill_node.name
  loop
    if v_group.question_count <= 0 then continue; end if;
    v_percentage := round((v_group.correct_count::numeric / v_group.question_count::numeric) * 100, 2);
    v_kind := case when v_percentage < 60 then 'focus'
      when v_percentage >= 80 then 'strength' else 'developing' end;
    v_quality := case when v_group.question_count < 3 then 'provisional'
      when v_group.question_count < 6 then 'standard' else 'strong' end;
    v_contributes := v_group.question_count >= 3;
    v_skill_key := concat_ws(':', 'objective', v_group.curriculum_objective_id::text);
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text,
      'objective', v_group.curriculum_objective_id::text);

    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence_quality,
      contributes_to_focus_state, evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_assignment.subject_name, v_group.topic_name,
      v_group.skill_name, v_group.subskill_name, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key, p_completed_at,
      v_percentage, v_group.question_count, v_quality, v_contributes,
      jsonb_build_object(
        'source_label', 'Brains Heist Verified assignment evidence',
        'assignment_id', p_assignment_id, 'assignment_title', v_assignment.title,
        'class_id', v_assignment.class_id, 'class_code', v_assignment.class_code_snapshot,
        'teacher_id', v_assignment.teacher_id, 'academic_year_id', v_assignment.academic_year_id,
        'academic_term_id', v_assignment.academic_term_id,
        'academic_subject_id', v_assignment.academic_subject_id,
        'grade_level', v_assignment.grade_level_snapshot,
        'curriculum_scope_id', v_group.curriculum_scope_id,
        'curriculum_objective_id', v_group.curriculum_objective_id,
        'objective_code', v_group.objective_code, 'objective', v_group.objective_statement,
        'strand_topic', v_group.topic_name, 'skill', v_group.skill_name,
        'subskill', v_group.subskill_name, 'question_ids', to_jsonb(v_group.question_ids),
        'verified_question_count', v_group.question_count,
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'question_count', v_group.question_count,
        'expected_question_count', v_expected_count,
        'answered_question_count', v_answered_count,
        'overall_accuracy', p_accuracy, 'overall_score', p_score,
        'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
        'evidence_quality', v_quality, 'contributes_to_focus_state', v_contributes,
        'evidence_provenance', 'brains_heist_verified_question'
      ), true
    ) on conflict (student_id, source_key) do update set
      observed_at = excluded.observed_at, observation_type = excluded.observation_type,
      evidence_percentage = excluded.evidence_percentage,
      evidence_count = excluded.evidence_count, evidence_quality = excluded.evidence_quality,
      contributes_to_focus_state = excluded.contributes_to_focus_state,
      evidence = excluded.evidence;
  end loop;
end;
$$;
revoke all on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
  from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
  to service_role;

comment on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer) is
  'Creates official objective evidence only from immutable Brains Heist Verified question snapshots with current approved curriculum mappings. Teacher-authored questions remain classroom-only.';

-- Quarantine legacy assignment observations that cannot prove every source
-- question was verified. Valid historical rows receive explicit provenance.
create temporary table tmp_unverified_assignment_focus on commit drop as
select distinct o.student_id, o.skill_key
from public.student_learning_observations o
where o.source_type in ('assignment', 'assignment_result') and (
  jsonb_typeof(o.evidence->'question_ids') <> 'array'
  or jsonb_array_length(coalesce(o.evidence->'question_ids', '[]'::jsonb)) = 0
  or exists (
    select 1 from jsonb_array_elements_text(coalesce(o.evidence->'question_ids', '[]'::jsonb)) qid
    left join public.questions q on q.id = qid::uuid
    where q.id is null or q.content_origin <> 'brain_heist'
      or q.verification_status <> 'verified' or not q.analytics_eligible
      or not q.is_public or q.current_content_hash <> q.verified_content_hash
  )
);

delete from public.student_learning_observations o
using tmp_unverified_assignment_focus f
where o.student_id = f.student_id and o.skill_key = f.skill_key
  and o.source_type in ('assignment', 'assignment_result') and (
    jsonb_typeof(o.evidence->'question_ids') <> 'array'
    or jsonb_array_length(coalesce(o.evidence->'question_ids', '[]'::jsonb)) = 0
    or exists (
      select 1 from jsonb_array_elements_text(coalesce(o.evidence->'question_ids', '[]'::jsonb)) qid
      left join public.questions q on q.id = qid::uuid
      where q.id is null or q.content_origin <> 'brain_heist'
        or q.verification_status <> 'verified' or not q.analytics_eligible
        or not q.is_public or q.current_content_hash <> q.verified_content_hash
    )
  );

update public.student_learning_observations o
set evidence = o.evidence || jsonb_build_object(
  'source_label', 'Brains Heist Verified assignment evidence',
  'evidence_provenance', 'brains_heist_verified_question'
)
where o.source_type in ('assignment', 'assignment_result')
  and jsonb_typeof(o.evidence->'question_ids') = 'array'
  and jsonb_array_length(o.evidence->'question_ids') > 0
  and not exists (
    select 1 from jsonb_array_elements_text(o.evidence->'question_ids') qid
    left join public.questions q on q.id = qid::uuid
    where q.id is null or q.content_origin <> 'brain_heist'
      or q.verification_status <> 'verified' or not q.analytics_eligible
      or not q.is_public or q.current_content_hash <> q.verified_content_hash
  );

do $$
declare v_focus record;
begin
  for v_focus in select * from tmp_unverified_assignment_focus loop
    perform public.student_learning_refresh_focus_state(v_focus.student_id, v_focus.skill_key);
  end loop;
end;
$$;

comment on column public.questions.content_origin is
  'Authority boundary: brain_heist is governed official content; teacher is private classroom content.';
comment on column public.questions.analytics_eligible is
  'Fail-closed permission for official Academic Profile evidence; never writable by teachers.';
comment on column public.assignment_questions.question_snapshot is
  'Immutable question payload captured when the question enters the assignment.';
comment on column public.assignment_questions.analytics_eligible_snapshot is
  'Whether the question was Brains Heist Verified and eligible at assignment assembly time.';

notify pgrst, 'reload schema';
