-- Make Cambridge attempts server-authoritative, idempotent, and subject-scoped.
-- Existing quiz shells remain compatible through the identity trigger and
-- unique active-attempt index; modern shells should use submit_cambridge_attempt.

alter table public.quiz_scores
  add column if not exists student_id uuid references public.users(id) on delete set null,
  add column if not exists test_id text,
  add column if not exists quiz_version text,
  add column if not exists attempt_number integer not null default 1,
  add column if not exists attempt_status text not null default 'submitted',
  add column if not exists submission_key text;

alter table public.quiz_scores
  drop constraint if exists quiz_scores_attempt_number_check,
  add constraint quiz_scores_attempt_number_check check (attempt_number > 0),
  drop constraint if exists quiz_scores_attempt_status_check,
  add constraint quiz_scores_attempt_status_check
    check (attempt_status in ('submitted', 'released'));

alter table public.cambridge_quiz_score_history
  add column if not exists student_id uuid references public.users(id) on delete set null,
  add column if not exists test_id text,
  add column if not exists quiz_version text,
  add column if not exists attempt_number integer;

alter table public.cambridge_quiz_score_history
  drop constraint if exists cambridge_quiz_score_history_archived_action_check,
  add constraint cambridge_quiz_score_history_archived_action_check
    check (archived_action in ('retake_authorized', 'duplicate_voided'));

-- Resolve legacy rows only when the school/name match identifies exactly one
-- user. Ambiguous historical names remain nullable instead of being guessed.
with unique_matches as (
  select qs.id as score_id, min(u.id::text)::uuid as student_id
  from public.quiz_scores qs
  join public.users u
    on u.school_id = qs.school_id
   and (
     lower(trim(coalesce(u.full_name, ''))) = lower(trim(qs.student_name))
     or lower(trim(coalesce(u.username, ''))) = lower(trim(qs.student_name))
   )
  where qs.student_id is null
  group by qs.id
  having count(*) = 1
)
update public.quiz_scores qs
set student_id = matches.student_id
from unique_matches matches
where qs.id = matches.score_id;

update public.quiz_scores qs
set
  test_id = coalesce(
    nullif(qs.test_id, ''),
    (
      select ct.id
      from public.cambridge_tests ct
      where lower(trim(ct.name)) = lower(trim(qs.quiz_name))
      order by ct.id
      limit 1
    ),
    btrim(regexp_replace(lower(trim(qs.quiz_name)), '[^a-z0-9]+', '-', 'g'), '-')
  ),
  quiz_version = coalesce(nullif(qs.quiz_version, ''), nullif(qs.answers->>'quiz_version', ''), 'legacy-v1'),
  attempt_status = case when coalesce(qs.scores_released, false) then 'released' else 'submitted' end,
  submission_key = coalesce(nullif(qs.submission_key, ''), gen_random_uuid()::text);

update public.cambridge_quiz_score_history h
set
  student_id = coalesce(h.student_id, nullif(h.attempt_snapshot->>'student_id', '')::uuid),
  test_id = coalesce(
    nullif(h.test_id, ''),
    nullif(h.attempt_snapshot->>'test_id', ''),
    (
      select ct.id
      from public.cambridge_tests ct
      where lower(trim(ct.name)) = lower(trim(h.quiz_name))
      order by ct.id
      limit 1
    ),
    btrim(regexp_replace(lower(trim(h.quiz_name)), '[^a-z0-9]+', '-', 'g'), '-')
  ),
  quiz_version = coalesce(
    nullif(h.quiz_version, ''),
    nullif(h.attempt_snapshot->>'quiz_version', ''),
    nullif(h.answers->>'quiz_version', ''),
    'legacy-v1'
  ),
  attempt_number = coalesce(h.attempt_number, nullif(h.attempt_snapshot->>'attempt_number', '')::integer, 1);

create index if not exists quiz_scores_student_id_idx
  on public.quiz_scores (student_id, submitted_at desc)
  where student_id is not null;

create index if not exists quiz_scores_test_identity_idx
  on public.quiz_scores (school_id, test_id, quiz_version, submitted_at desc);

create unique index if not exists quiz_scores_submission_key_unique
  on public.quiz_scores (student_id, submission_key)
  where student_id is not null and submission_key is not null;

create or replace function public.cambridge_assignment_matches_test(
  p_assignment_subject text,
  p_test_id text,
  p_quiz_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with catalog as (
    select
      lower(trim(coalesce(ct.curriculum_subject, ct.subject))) as curriculum_subject,
      lower(trim(ct.subject)) as display_subject
    from public.cambridge_tests ct
    where ct.id = p_test_id or lower(trim(ct.name)) = lower(trim(p_quiz_name))
  ), normalized as (
    select lower(trim(coalesce(p_assignment_subject, ''))) as assignment_subject, catalog.*
    from catalog
  )
  select exists (
    select 1 from normalized n
    where n.assignment_subject = n.curriculum_subject
       or n.assignment_subject = n.display_subject
       or (
         n.assignment_subject in ('maths', 'mathematics')
         and n.curriculum_subject in ('maths', 'mathematics')
       )
       or (
         n.assignment_subject in ('science', 'combined science')
         and n.curriculum_subject in ('science', 'combined science', 'biology', 'chemistry', 'physics')
       )
  );
$$;

revoke all on function public.cambridge_assignment_matches_test(text, text, text) from public, anon;
grant execute on function public.cambridge_assignment_matches_test(text, text, text) to authenticated;

create or replace function public.prepare_cambridge_quiz_score()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_catalog_id text;
  v_history_count integer := 0;
begin
  if tg_op = 'INSERT' then
    if v_actor is null then
      raise exception 'Cambridge submissions require an authenticated student';
    end if;

    select * into v_user from public.users where id = v_actor;
    if not found or v_user.role <> 'student' then
      raise exception 'Only students can submit Cambridge attempts';
    end if;
    if v_user.school_id is null then
      raise exception 'Your account is not linked to a school';
    end if;
    if v_user.full_name_status <> 'verified' or nullif(trim(v_user.full_name), '') is null then
      raise exception 'Your school must verify your real name before submission';
    end if;

    new.student_id := v_actor;
    new.school_id := v_user.school_id;
    new.student_name := trim(v_user.full_name);
    new.student_class := coalesce(nullif(trim(v_user.batch), ''), new.student_class);

    select ct.id into v_catalog_id
    from public.cambridge_tests ct
    where ct.id = nullif(new.test_id, '')
       or lower(trim(ct.name)) = lower(trim(new.quiz_name))
    order by case when ct.id = nullif(new.test_id, '') then 0 else 1 end, ct.id
    limit 1;

    new.test_id := coalesce(
      v_catalog_id,
      nullif(new.test_id, ''),
      btrim(regexp_replace(lower(trim(new.quiz_name)), '[^a-z0-9]+', '-', 'g'), '-')
    );
    new.quiz_version := coalesce(nullif(new.quiz_version, ''), nullif(new.answers->>'quiz_version', ''), 'legacy-v1');
    new.submission_key := coalesce(nullif(new.submission_key, ''), gen_random_uuid()::text);

    select count(*)::integer into v_history_count
    from public.cambridge_quiz_score_history h
    where h.school_id = new.school_id
      and (
        h.student_id = new.student_id
        or (h.student_id is null and lower(trim(h.student_name)) = lower(trim(new.student_name)))
      )
      and coalesce(h.test_id, btrim(regexp_replace(lower(trim(h.quiz_name)), '[^a-z0-9]+', '-', 'g'), '-')) = new.test_id
      and coalesce(h.quiz_version, nullif(h.answers->>'quiz_version', ''), 'legacy-v1') = new.quiz_version;

    new.attempt_number := greatest(coalesce(new.attempt_number, 1), v_history_count + 1);
  end if;

  if coalesce(new.scores_released, false) then
    new.attempt_status := 'released';
  else
    new.attempt_status := 'submitted';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_cambridge_quiz_score_trigger on public.quiz_scores;
create trigger prepare_cambridge_quiz_score_trigger
before insert or update of scores_released on public.quiz_scores
for each row execute function public.prepare_cambridge_quiz_score();

-- Preserve accidental duplicate rows before enforcing one active attempt.
with scored as (
  select
    qs.*,
    (
      select count(*)::integer
      from jsonb_each(
        case
          when jsonb_typeof(qs.answers->'responses') = 'object' then qs.answers->'responses'
          when jsonb_typeof(qs.answers) = 'object' then qs.answers
          else '{}'::jsonb
        end
      ) response
      where response.value is not null
        and btrim(response.value::text, '"') <> ''
    ) as answered_count
  from public.quiz_scores qs
  where qs.student_id is not null
), ranked as (
  select scored.*,
    row_number() over (
      partition by school_id, student_id, test_id, quiz_version
      order by answered_count desc, score desc, submitted_at asc nulls last, id
    ) as duplicate_rank
  from scored
), duplicates as (
  select * from ranked where duplicate_rank > 1
)
insert into public.cambridge_quiz_score_history (
  original_score_id, school_id, student_id, student_name, student_class,
  quiz_name, test_id, quiz_version, attempt_number, score, total_questions,
  percentage, answers, submitted_at, time_taken_seconds, scores_released,
  released_at, released_by, attempt_snapshot, archived_action,
  archived_by, archived_by_name, archived_by_role, archive_reason
)
select
  d.id, d.school_id, d.student_id, d.student_name, d.student_class,
  d.quiz_name, d.test_id, d.quiz_version, d.attempt_number, d.score,
  d.total_questions, d.percentage, d.answers, d.submitted_at,
  d.time_taken_seconds, coalesce(d.scores_released, false), d.released_at,
  d.released_by, to_jsonb(d), 'duplicate_voided', null,
  'System integrity repair', 'superadmin',
  'Accidental duplicate archived while enforcing one active Cambridge attempt'
from duplicates d
on conflict (original_score_id, archived_action) do nothing;

delete from public.quiz_scores qs
using public.cambridge_quiz_score_history h
where h.original_score_id = qs.id
  and h.archived_action = 'duplicate_voided';

create unique index if not exists quiz_scores_one_active_attempt
  on public.quiz_scores (school_id, student_id, test_id, quiz_version)
  where student_id is not null and attempt_status in ('submitted', 'released');

create or replace function public.can_manage_cambridge_score(
  p_score_id uuid,
  p_require_grade boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select u.id, u.school_id, u.role, coalesce(u.is_admin, false) as is_admin
    from public.users u
    where u.id = auth.uid()
  ), score as (
    select qs.* from public.quiz_scores qs where qs.id = p_score_id
  )
  select exists (
    select 1
    from actor a
    join score s on s.school_id = a.school_id
    where a.is_admin = true
       or a.role in ('admin', 'school_admin')
       or (
         a.role = 'teacher'
         and exists (
           select 1
           from public.class_teacher_assignments cta
           join public.classes c on c.id = cta.class_id and c.school_id = s.school_id
           where cta.teacher_user_id = a.id
             and cta.school_id = s.school_id
             and cta.active = true
             and (not p_require_grade or cta.can_grade = true)
             and (
               exists (
                 select 1
                 from public.class_students cs
                 where cs.class_id = cta.class_id
                   and cs.student_id = s.student_id
               )
               or (
                 s.student_id is null
                 and (c.class_code = s.student_class or c.class_name = s.student_class)
               )
             )
             and public.cambridge_assignment_matches_test(cta.subject, s.test_id, s.quiz_name)
         )
       )
  );
$$;

revoke all on function public.can_manage_cambridge_score(uuid, boolean) from public, anon;
grant execute on function public.can_manage_cambridge_score(uuid, boolean) to authenticated;

create or replace function public.enforce_cambridge_score_delete_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_cambridge_score(old.id, true) then
    raise exception 'You are not the assigned subject teacher for this Cambridge attempt';
  end if;
  return old;
end;
$$;

drop trigger if exists enforce_cambridge_score_delete_scope_trigger on public.quiz_scores;
create trigger enforce_cambridge_score_delete_scope_trigger
before delete on public.quiz_scores
for each row execute function public.enforce_cambridge_score_delete_scope();

-- Replace permissive legacy policies. Policies are permissive by default, so
-- every broad predecessor must be removed rather than merely supplemented.
drop policy if exists qs_insert_authenticated on public.quiz_scores;
drop policy if exists qs_select_own on public.quiz_scores;
drop policy if exists qs_select_released on public.quiz_scores;
drop policy if exists qs_select_school_staff on public.quiz_scores;
drop policy if exists qs_update_school_staff on public.quiz_scores;
drop policy if exists quiz_scores_select_scoped on public.quiz_scores;
drop policy if exists quiz_scores_update_scoped on public.quiz_scores;

create policy quiz_scores_student_select_own
  on public.quiz_scores for select to authenticated
  using ((select auth.uid()) = student_id);

create policy quiz_scores_student_insert_own
  on public.quiz_scores for insert to authenticated
  with check ((select auth.uid()) = student_id);

create policy quiz_scores_school_admin_select
  on public.quiz_scores for select to authenticated
  using (
    public.is_superadmin((select auth.uid()))
    or exists (
      select 1 from public.school_members sm
      where sm.user_id = (select auth.uid())
        and sm.school_id = quiz_scores.school_id
        and sm.status = 'active'
        and sm.role_in_school = 'school_admin'
    )
  );

create policy quiz_scores_teacher_select_assigned_subject
  on public.quiz_scores for select to authenticated
  using (public.can_manage_cambridge_score(id, false));

create policy quiz_scores_staff_update_assigned_subject
  on public.quiz_scores for update to authenticated
  using (public.can_manage_cambridge_score(id, true))
  with check (public.can_manage_cambridge_score(id, true));

revoke all on table public.quiz_scores from anon;
revoke delete, truncate on table public.quiz_scores from authenticated;
grant select, insert, update on table public.quiz_scores to authenticated;

create or replace function public.submit_cambridge_attempt(
  p_quiz_name text,
  p_test_id text,
  p_quiz_version text,
  p_answers jsonb,
  p_score integer,
  p_total_questions integer,
  p_percentage integer,
  p_time_taken_seconds integer,
  p_submission_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_test public.cambridge_tests%rowtype;
  v_existing public.quiz_scores%rowtype;
  v_inserted public.quiz_scores%rowtype;
  v_version text := coalesce(nullif(trim(p_quiz_version), ''), 'legacy-v1');
  v_key text := coalesce(nullif(trim(p_submission_key), ''), gen_random_uuid()::text);
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select * into v_user from public.users where id = v_actor;
  if not found or v_user.role <> 'student' then
    return jsonb_build_object('success', false, 'error', 'Only students can submit Cambridge attempts');
  end if;
  if v_user.school_id is null or nullif(trim(v_user.batch), '') is null then
    return jsonb_build_object('success', false, 'error', 'Your school and class must be confirmed before submission');
  end if;
  if v_user.full_name_status <> 'verified' or nullif(trim(v_user.full_name), '') is null then
    return jsonb_build_object('success', false, 'error', 'Your school must verify your real name before submission');
  end if;

  select * into v_test
  from public.cambridge_tests ct
  where ct.id = p_test_id and lower(trim(ct.name)) = lower(trim(p_quiz_name))
  limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'This Cambridge test is not registered');
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or p_total_questions <= 0
     or p_score < 0 or p_score > p_total_questions
     or p_percentage <> round((p_score::numeric / p_total_questions::numeric) * 100)::integer
     or p_time_taken_seconds < 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid Cambridge submission payload');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || v_test.id || ':' || v_version, 0));

  select * into v_existing
  from public.quiz_scores qs
  where qs.school_id = v_user.school_id
    and qs.student_id = v_actor
    and qs.test_id = v_test.id
    and qs.quiz_version = v_version
    and qs.attempt_status in ('submitted', 'released')
  order by qs.submitted_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'submission', to_jsonb(v_existing),
      'message', 'This test was already submitted. Your original attempt is unchanged.'
    );
  end if;

  insert into public.quiz_scores (
    student_id, student_name, student_class, school_id, quiz_name, test_id,
    quiz_version, score, total_questions, percentage, answers,
    time_taken_seconds, scores_released, attempt_status, submission_key
  ) values (
    v_actor, trim(v_user.full_name), trim(v_user.batch), v_user.school_id,
    v_test.name, v_test.id, v_version, p_score, p_total_questions,
    p_percentage, p_answers || jsonb_build_object('quiz_version', v_version),
    p_time_taken_seconds, false, 'submitted', v_key
  ) returning * into v_inserted;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'submission', to_jsonb(v_inserted),
    'message', 'Submission recorded successfully.'
  );
exception
  when unique_violation then
    select * into v_existing
    from public.quiz_scores qs
    where qs.school_id = v_user.school_id
      and qs.student_id = v_actor
      and qs.test_id = v_test.id
      and qs.quiz_version = v_version
    order by qs.submitted_at desc
    limit 1;
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'submission', to_jsonb(v_existing),
      'message', 'This test was already submitted. Your original attempt is unchanged.'
    );
end;
$$;

revoke all on function public.submit_cambridge_attempt(text, text, text, jsonb, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.submit_cambridge_attempt(text, text, text, jsonb, integer, integer, integer, integer, text) to authenticated;

create or replace function public.get_my_cambridge_attempt_state(
  p_test_id text,
  p_quiz_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.quiz_scores%rowtype;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select * into v_submission
  from public.quiz_scores qs
  where qs.student_id = v_actor
    and qs.test_id = p_test_id
    and (p_quiz_version is null or qs.quiz_version = p_quiz_version)
    and qs.attempt_status in ('submitted', 'released')
  order by qs.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'has_submission', found,
    'submission', case when found then to_jsonb(v_submission) else null end
  );
end;
$$;

revoke all on function public.get_my_cambridge_attempt_state(text, text) from public, anon;
grant execute on function public.get_my_cambridge_attempt_state(text, text) to authenticated;

drop function if exists public.get_school_cambridge_scores(integer);
create function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(
  id uuid, student_id uuid, student_name text, student_class text,
  quiz_name text, test_id text, quiz_version text, attempt_number integer,
  attempt_status text, score integer, total_questions integer,
  percentage integer, answers jsonb, time_taken_seconds integer,
  submitted_at timestamptz, scores_released boolean, released_at timestamptz,
  school_id uuid, test_subject text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_role text;
begin
  select u.school_id, u.role into v_school_id, v_role
  from public.users u where u.id = v_actor;

  if v_actor is null or v_school_id is null
     or v_role not in ('teacher', 'admin', 'school_admin') then
    raise exception 'Access denied';
  end if;

  return query
  select
    qs.id, qs.student_id, qs.student_name, qs.student_class,
    qs.quiz_name, qs.test_id, qs.quiz_version, qs.attempt_number,
    qs.attempt_status, qs.score, qs.total_questions, qs.percentage,
    qs.answers, qs.time_taken_seconds, qs.submitted_at,
    coalesce(qs.scores_released, false), qs.released_at, qs.school_id,
    coalesce(ct.curriculum_subject, ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct
    on ct.id = qs.test_id or lower(trim(ct.name)) = lower(trim(qs.quiz_name))
  where qs.school_id = v_school_id
    and qs.attempt_status in ('submitted', 'released')
    and (
      v_role in ('admin', 'school_admin')
      or exists (
        select 1
        from public.class_teacher_assignments cta
        join public.classes c on c.id = cta.class_id and c.school_id = qs.school_id
        where cta.teacher_user_id = v_actor
          and cta.school_id = qs.school_id
          and cta.active = true
          and cta.can_grade = true
          and (
            exists (
              select 1
              from public.class_students cs
              where cs.class_id = cta.class_id
                and cs.student_id = qs.student_id
            )
            or (
              qs.student_id is null
              and (c.class_code = qs.student_class or c.class_name = qs.student_class)
            )
          )
          and public.cambridge_assignment_matches_test(cta.subject, qs.test_id, qs.quiz_name)
      )
    )
  order by qs.submitted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;

revoke all on function public.get_school_cambridge_scores(integer) from public, anon;
grant execute on function public.get_school_cambridge_scores(integer) to authenticated;

create or replace function public.release_quiz_scores(p_quiz_name text, p_class text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_updated_count integer;
  v_role text;
  v_school_id uuid;
begin
  select u.role, u.school_id into v_role, v_school_id
  from public.users u where u.id = v_actor;
  if v_actor is null or v_school_id is null or v_role not in ('teacher', 'school_admin', 'admin') then
    return json_build_object('success', false, 'error', 'Not authorized');
  end if;

  update public.quiz_scores qs
  set scores_released = true, released_at = now(), released_by = v_actor
  where qs.school_id = v_school_id
    and qs.quiz_name = p_quiz_name
    and coalesce(qs.scores_released, false) = false
    and (p_class is null or qs.student_class = p_class)
    and (
      v_role in ('school_admin', 'admin')
      or public.can_manage_cambridge_score(qs.id, true)
    );
  get diagnostics v_updated_count = row_count;
  return json_build_object('success', true, 'updated_count', v_updated_count);
end;
$$;

create or replace function public.hide_quiz_scores(p_quiz_name text, p_class text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_updated_count integer;
  v_role text;
  v_school_id uuid;
begin
  select u.role, u.school_id into v_role, v_school_id
  from public.users u where u.id = v_actor;
  if v_actor is null or v_school_id is null or v_role not in ('teacher', 'school_admin', 'admin') then
    return json_build_object('success', false, 'error', 'Not authorized');
  end if;

  update public.quiz_scores qs
  set scores_released = false, released_at = null, released_by = null
  where qs.school_id = v_school_id
    and qs.quiz_name = p_quiz_name
    and coalesce(qs.scores_released, false) = true
    and (p_class is null or qs.student_class = p_class)
    and (
      v_role in ('school_admin', 'admin')
      or public.can_manage_cambridge_score(qs.id, true)
    );
  get diagnostics v_updated_count = row_count;
  return json_build_object('success', true, 'updated_count', v_updated_count);
end;
$$;

revoke all on function public.release_quiz_scores(text, text) from public, anon;
revoke all on function public.hide_quiz_scores(text, text) from public, anon;
grant execute on function public.release_quiz_scores(text, text) to authenticated;
grant execute on function public.hide_quiz_scores(text, text) to authenticated;

-- Wrap the existing audited retake implementation with subject authorization.
alter function public.allow_cambridge_retake(uuid, text)
  rename to allow_cambridge_retake_legacy_internal;
revoke all on function public.allow_cambridge_retake_legacy_internal(uuid, text)
  from public, anon, authenticated;

create function public.allow_cambridge_retake(p_score_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  if not public.can_manage_cambridge_score(p_score_id, true) then
    return jsonb_build_object(
      'success', false,
      'error', 'Only the assigned class and subject teacher can allow this retake'
    );
  end if;
  return public.allow_cambridge_retake_legacy_internal(p_score_id, p_reason);
end;
$$;

create or replace function public.school_admin_delete_quiz_submission(p_score_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.allow_cambridge_retake(p_score_id, 'School administrator authorized a retake');
$$;

revoke all on function public.allow_cambridge_retake(uuid, text) from public, anon;
revoke all on function public.school_admin_delete_quiz_submission(uuid) from public, anon;
grant execute on function public.allow_cambridge_retake(uuid, text) to authenticated;
grant execute on function public.school_admin_delete_quiz_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
