-- Reconcile legacy Cambridge identity through an explicit, audited school-admin
-- decision. Historical values remain immutable; no student is guessed or
-- backfilled automatically. Also keep future score/release writes consistent
-- without rewriting legacy rows.

create table if not exists public.cambridge_quiz_identity_audit (
  id uuid primary key default gen_random_uuid(),
  original_score_id uuid not null unique,
  school_id uuid not null references public.schools(id) on delete restrict,
  linked_student_id uuid references public.users(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  historical_student_name text not null,
  historical_student_class text,
  test_id text,
  quiz_version text,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.cambridge_quiz_identity_audit is
  'Append-only evidence for manual school-admin links between legacy Cambridge submissions and verified students.';

alter table public.cambridge_quiz_identity_audit enable row level security;

create index if not exists cambridge_quiz_identity_audit_school_created_idx
  on public.cambridge_quiz_identity_audit (school_id, created_at desc);

create index if not exists cambridge_quiz_identity_audit_student_created_idx
  on public.cambridge_quiz_identity_audit (linked_student_id, created_at desc)
  where linked_student_id is not null;

drop policy if exists cambridge_quiz_identity_audit_school_admin_select
  on public.cambridge_quiz_identity_audit;
create policy cambridge_quiz_identity_audit_school_admin_select
  on public.cambridge_quiz_identity_audit
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      public.is_superadmin((select auth.uid()))
      or exists (
        select 1
        from public.school_members sm
        where sm.school_id = cambridge_quiz_identity_audit.school_id
          and sm.user_id = (select auth.uid())
          and sm.status = 'active'
          and sm.role_in_school = 'school_admin'
      )
    )
  );

revoke all on table public.cambridge_quiz_identity_audit from public, anon, authenticated;
grant select on table public.cambridge_quiz_identity_audit to authenticated;

create or replace function public.school_admin_link_cambridge_attempt_student(
  p_score_id uuid,
  p_student_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_score public.quiz_scores%rowtype;
  v_student public.users%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_audit_id uuid;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if p_score_id is null or p_student_id is null then
    return jsonb_build_object('success', false, 'error', 'Submission and student are required');
  end if;

  if v_reason is null then
    return jsonb_build_object(
      'success', false,
      'error', 'A reason is required to link a historical attempt',
      'code', 'CAMBRIDGE_IDENTITY_REASON_REQUIRED'
    );
  end if;

  if char_length(v_reason) > 500 then
    return jsonb_build_object(
      'success', false,
      'error', 'Reason must be 500 characters or fewer',
      'code', 'CAMBRIDGE_IDENTITY_REASON_TOO_LONG'
    );
  end if;

  select qs.*
  into v_score
  from public.quiz_scores qs
  where qs.id = p_score_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Submission not found');
  end if;

  if v_score.student_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'This submission already has a canonical student identity',
      'code', 'CAMBRIDGE_IDENTITY_ALREADY_LINKED'
    );
  end if;

  if not (
    public.is_superadmin(v_actor_id)
    or exists (
      select 1
      from public.school_members actor_membership
      where actor_membership.school_id = v_score.school_id
        and actor_membership.user_id = v_actor_id
        and actor_membership.status = 'active'
        and actor_membership.role_in_school = 'school_admin'
    )
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Only an active administrator for this school can link historical identities'
    );
  end if;

  select u.*
  into v_student
  from public.users u
  join public.school_members student_membership
    on student_membership.user_id = u.id
   and student_membership.school_id = v_score.school_id
   and student_membership.status = 'active'
   and student_membership.role_in_school = 'student'
  where u.id = p_student_id
    and u.school_id = v_score.school_id
    and u.role = 'student'
    and u.full_name_status = 'verified'
    and nullif(trim(u.full_name), '') is not null
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Choose an active, verified student from the same school',
      'code', 'CAMBRIDGE_IDENTITY_STUDENT_INELIGIBLE'
    );
  end if;

  update public.quiz_scores qs
  set student_id = v_student.id
  where qs.id = v_score.id
    and qs.student_id is null;

  if not found then
    raise exception using
      errcode = 'P4C02',
      message = 'The selected Cambridge submission changed during identity review';
  end if;

  insert into public.cambridge_quiz_identity_audit (
    original_score_id,
    school_id,
    linked_student_id,
    actor_user_id,
    historical_student_name,
    historical_student_class,
    test_id,
    quiz_version,
    reason
  ) values (
    v_score.id,
    v_score.school_id,
    v_student.id,
    v_actor_id,
    coalesce(nullif(trim(v_score.student_name), ''), 'Unknown student'),
    nullif(trim(v_score.student_class), ''),
    nullif(trim(v_score.test_id), ''),
    nullif(trim(v_score.quiz_version), ''),
    v_reason
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'score_id', v_score.id,
    'student_id', v_student.id,
    'student_name', trim(v_student.full_name),
    'message', 'Historical Cambridge identity linked and audited'
  );
exception
  when sqlstate 'P4C02' then
    return jsonb_build_object(
      'success', false,
      'error', 'The selected Cambridge submission changed during identity review',
      'code', 'CAMBRIDGE_IDENTITY_CONFLICT'
    );
  when unique_violation then
    return jsonb_build_object(
      'success', false,
      'error', 'This link conflicts with an existing active attempt or identity audit',
      'code', 'CAMBRIDGE_ACTIVE_ATTEMPT_CONFLICT'
    );
end;
$$;

comment on function public.school_admin_link_cambridge_attempt_student(uuid, uuid, text) is
  'Links one legacy Cambridge submission to one verified same-school student, with a required reason and append-only audit.';

revoke all on function public.school_admin_link_cambridge_attempt_student(uuid, uuid, text)
  from public, anon;
grant execute on function public.school_admin_link_cambridge_attempt_student(uuid, uuid, text)
  to authenticated;

-- scores_released is the canonical flag. The singular score_released column is
-- retained only for compatibility and follows canonical writes from now on.
create or replace function public.enforce_cambridge_score_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.total_questions is null or new.total_questions <= 0
     or new.score is null or new.score < 0 or new.score > new.total_questions then
    raise exception 'Invalid Cambridge score values';
  end if;

  if tg_op = 'INSERT'
     or new.score is distinct from old.score
     or new.total_questions is distinct from old.total_questions
     or new.percentage is distinct from old.percentage then
    new.percentage := round((new.score::numeric / new.total_questions::numeric) * 100)::integer;
  end if;

  -- A student submission can never release itself. Staff release an existing
  -- row through the authorized update paths after marking/review.
  if tg_op = 'INSERT' then
    new.scores_released := false;
    new.score_released := false;
  elsif new.scores_released is distinct from old.scores_released then
    new.score_released := coalesce(new.scores_released, false);
  elsif new.score_released is distinct from old.score_released then
    new.score_released := old.scores_released;
  end if;

  if coalesce(new.scores_released, false) then
    if not coalesce(old.scores_released, false) then
      new.released_at := coalesce(new.released_at, now());
      new.released_by := coalesce(new.released_by, auth.uid());
    end if;
  else
    new.released_at := null;
    new.released_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_cambridge_score_consistency()
  from public, anon, authenticated;

drop trigger if exists enforce_cambridge_score_consistency_trigger on public.quiz_scores;
create trigger enforce_cambridge_score_consistency_trigger
before insert or update of score, total_questions, percentage, scores_released, score_released
on public.quiz_scores
for each row execute function public.enforce_cambridge_score_consistency();

comment on column public.quiz_scores.score_released is
  'Deprecated compatibility alias. scores_released is canonical; database triggers synchronize future canonical writes.';

-- Reports show the current verified identity after a manual link while the
-- immutable submission and identity-audit rows retain the historical label.
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
set search_path = ''
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
    qs.id,
    qs.student_id,
    coalesce(nullif(trim(current_student.full_name), ''), qs.student_name),
    coalesce(current_class.class_code, qs.student_class),
    qs.quiz_name, qs.test_id, qs.quiz_version, qs.attempt_number,
    qs.attempt_status, qs.score, qs.total_questions, qs.percentage,
    qs.answers, qs.time_taken_seconds, qs.submitted_at,
    coalesce(qs.scores_released, false), qs.released_at, qs.school_id,
    coalesce(ct.curriculum_subject, ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct
    on ct.id = qs.test_id or lower(trim(ct.name)) = lower(trim(qs.quiz_name))
  left join public.users current_student
    on current_student.id = qs.student_id
   and current_student.school_id = qs.school_id
  left join lateral (
    select c.class_code
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = qs.school_id
    where cs.student_id = qs.student_id
      and (
        v_role in ('admin', 'school_admin')
        or exists (
          select 1
          from public.class_teacher_assignments current_cta
          where current_cta.class_id = c.id
            and current_cta.teacher_user_id = v_actor
            and current_cta.school_id = qs.school_id
            and current_cta.active = true
            and current_cta.can_grade = true
            and public.cambridge_assignment_matches_test(
              current_cta.subject,
              qs.test_id,
              qs.quiz_name
            )
        )
      )
    order by c.class_code
    limit 1
  ) current_class on true
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

notify pgrst, 'reload schema';
