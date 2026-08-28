-- Scope Cambridge attempts and retake history to school academic years.
-- This migration is intentionally preservation-first: no Cambridge attempt,
-- score history, or evidence row is deleted during a year rollover.

alter table public.quiz_scores
  add column if not exists academic_year_id uuid;

alter table public.cambridge_quiz_score_history
  add column if not exists academic_year_id uuid;

comment on column public.quiz_scores.academic_year_id is
  'Academic year that owns this Cambridge attempt. Historical rows are backfilled by submitted_at; new rows use the school current academic year.';
comment on column public.cambridge_quiz_score_history.academic_year_id is
  'Academic year of the original Cambridge attempt preserved in retake history.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_scores_academic_year_id_fkey'
      and conrelid = 'public.quiz_scores'::regclass
  ) then
    alter table public.quiz_scores
      add constraint quiz_scores_academic_year_id_fkey
      foreign key (academic_year_id)
      references public.school_academic_years(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cambridge_quiz_score_history_academic_year_id_fkey'
      and conrelid = 'public.cambridge_quiz_score_history'::regclass
  ) then
    alter table public.cambridge_quiz_score_history
      add constraint cambridge_quiz_score_history_academic_year_id_fkey
      foreign key (academic_year_id)
      references public.school_academic_years(id)
      on delete restrict;
  end if;
end;
$$;

update public.quiz_scores q
set academic_year_id = public.academic_resolve_year_id(
  q.school_id,
  coalesce(q.submitted_at, now())
)
where q.academic_year_id is null
  and q.school_id is not null;

update public.cambridge_quiz_score_history h
set academic_year_id = coalesce(
  (
    select q.academic_year_id
    from public.quiz_scores q
    where q.id = h.original_score_id
      and q.school_id = h.school_id
    limit 1
  ),
  public.academic_resolve_year_id(
    h.school_id,
    coalesce(h.submitted_at, h.archived_at, now())
  )
)
where h.academic_year_id is null;

create index if not exists quiz_scores_school_academic_year_submitted_idx
  on public.quiz_scores (school_id, academic_year_id, submitted_at desc);
create index if not exists cambridge_quiz_score_history_school_academic_year_idx
  on public.cambridge_quiz_score_history (school_id, academic_year_id, archived_at desc);

-- Keep one active attempt per test/version within one academic year. A new
-- academic year can therefore start clean without deleting the older attempt.
drop index if exists public.quiz_scores_one_active_attempt;
create unique index quiz_scores_one_active_attempt
  on public.quiz_scores (
    school_id,
    student_id,
    test_id,
    quiz_version,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where student_id is not null
    and attempt_status in ('submitted','released');

create or replace function private.cambridge_guard_attempt_academic_year()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_year_id uuid;
begin
  if new.school_id is null then
    new.academic_year_id := null;
    return new;
  end if;

  if new.academic_year_id is null then
    select y.id into v_year_id
    from public.school_academic_years y
    where y.school_id = new.school_id
      and y.status = 'current'
    order by y.starts_on desc, y.id
    limit 1;

    if v_year_id is null then
      v_year_id := public.academic_resolve_year_id(
        new.school_id,
        coalesce(new.submitted_at, now())
      );
    end if;

    new.academic_year_id := v_year_id;
  end if;

  if new.academic_year_id is not null and not exists (
    select 1
    from public.school_academic_years y
    where y.id = new.academic_year_id
      and y.school_id = new.school_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'cambridge_academic_year_school_mismatch';
  end if;

  return new;
end;
$function$;

create or replace function private.cambridge_guard_history_academic_year()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_year_id uuid;
begin
  if new.school_id is null then
    new.academic_year_id := null;
    return new;
  end if;

  if new.academic_year_id is null then
    select q.academic_year_id into v_year_id
    from public.quiz_scores q
    where q.id = new.original_score_id
      and q.school_id = new.school_id
    limit 1;

    if v_year_id is null then
      v_year_id := public.academic_resolve_year_id(
        new.school_id,
        coalesce(new.submitted_at, new.archived_at, now())
      );
    end if;

    new.academic_year_id := v_year_id;
  end if;

  if new.academic_year_id is not null and not exists (
    select 1
    from public.school_academic_years y
    where y.id = new.academic_year_id
      and y.school_id = new.school_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'cambridge_history_academic_year_school_mismatch';
  end if;

  return new;
end;
$function$;

drop trigger if exists zz_cambridge_guard_attempt_academic_year on public.quiz_scores;
create trigger zz_cambridge_guard_attempt_academic_year
before insert or update of school_id, submitted_at, academic_year_id
on public.quiz_scores
for each row execute function private.cambridge_guard_attempt_academic_year();

drop trigger if exists zz_cambridge_guard_history_academic_year on public.cambridge_quiz_score_history;
create trigger zz_cambridge_guard_history_academic_year
before insert or update of school_id, submitted_at, academic_year_id
on public.cambridge_quiz_score_history
for each row execute function private.cambridge_guard_history_academic_year();

create or replace function public.prepare_cambridge_quiz_score()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_catalog_id text;
  v_history_count integer := 0;
  v_year_id uuid;
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

    select y.id into v_year_id
    from public.school_academic_years y
    where y.school_id = new.school_id
      and y.status = 'current'
    order by y.starts_on desc, y.id
    limit 1;
    new.academic_year_id := coalesce(
      new.academic_year_id,
      v_year_id,
      public.academic_resolve_year_id(new.school_id, coalesce(new.submitted_at, now()))
    );

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
      and h.academic_year_id is not distinct from new.academic_year_id
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
$function$;

create or replace function public.get_my_cambridge_attempt_state(
  p_test_id text,
  p_quiz_version text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_academic_year_id uuid;
  v_submission public.quiz_scores%rowtype;
begin
  select u.school_id into v_school_id
  from public.users u
  where u.id = v_actor and u.role = 'student';

  if not private.actor_can_access_school_programme(v_school_id,'cambridge',false) then
    return jsonb_build_object('success',false,'error','Cambridge is not included in this school agreement');
  end if;

  select y.id into v_academic_year_id
  from public.school_academic_years y
  where y.school_id = v_school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;

  if v_academic_year_id is null then
    v_academic_year_id := public.academic_resolve_year_id(v_school_id, now());
  end if;

  select * into v_submission
  from public.quiz_scores qs
  where qs.student_id = v_actor
    and qs.school_id = v_school_id
    and qs.test_id = p_test_id
    and qs.academic_year_id is not distinct from v_academic_year_id
    and (p_quiz_version is null or qs.quiz_version = p_quiz_version)
    and qs.attempt_status in ('submitted','released')
  order by qs.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'academic_year_id', v_academic_year_id,
    'has_submission', found,
    'submission', case when found then to_jsonb(v_submission) else null end
  );
end;
$function$;

create or replace function public.submit_cambridge_attempt_entitlement_internal(
  p_quiz_name text,
  p_test_id text,
  p_quiz_version text,
  p_answers jsonb,
  p_score integer,
  p_total_questions integer,
  p_percentage integer,
  p_time_taken_seconds integer,
  p_submission_key text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_test public.cambridge_tests%rowtype;
  v_existing public.quiz_scores%rowtype;
  v_inserted public.quiz_scores%rowtype;
  v_academic_year_id uuid;
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

  select y.id into v_academic_year_id
  from public.school_academic_years y
  where y.school_id = v_user.school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;
  if v_academic_year_id is null then
    v_academic_year_id := public.academic_resolve_year_id(v_user.school_id, now());
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

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || v_test.id || ':' || v_version || ':' || coalesce(v_academic_year_id::text, 'legacy'),
    0
  ));

  select * into v_existing
  from public.quiz_scores qs
  where qs.school_id = v_user.school_id
    and qs.student_id = v_actor
    and qs.test_id = v_test.id
    and qs.quiz_version = v_version
    and qs.academic_year_id is not distinct from v_academic_year_id
    and qs.attempt_status in ('submitted', 'released')
  order by qs.submitted_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'academic_year_id', v_academic_year_id,
      'submission', to_jsonb(v_existing),
      'message', 'This test was already submitted in the current academic year. Your original attempt is unchanged.'
    );
  end if;

  insert into public.quiz_scores (
    student_id, student_name, student_class, school_id, academic_year_id, quiz_name, test_id,
    quiz_version, score, total_questions, percentage, answers,
    time_taken_seconds, scores_released, attempt_status, submission_key
  ) values (
    v_actor, trim(v_user.full_name), trim(v_user.batch), v_user.school_id, v_academic_year_id,
    v_test.name, v_test.id, v_version, p_score, p_total_questions,
    p_percentage, p_answers || jsonb_build_object('quiz_version', v_version),
    p_time_taken_seconds, false, 'submitted', v_key
  ) returning * into v_inserted;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'academic_year_id', v_academic_year_id,
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
      and qs.academic_year_id is not distinct from v_academic_year_id
    order by qs.submitted_at desc
    limit 1;
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'academic_year_id', v_academic_year_id,
      'submission', to_jsonb(v_existing),
      'message', 'This test was already submitted in the current academic year. Your original attempt is unchanged.'
    );
end;
$function$;

create or replace function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(
  id uuid, student_id uuid, student_name text, student_class text, quiz_name text,
  test_id text, quiz_version text, attempt_number integer, attempt_status text,
  score integer, total_questions integer, percentage integer, answers jsonb,
  time_taken_seconds integer, submitted_at timestamp with time zone,
  scores_released boolean, released_at timestamp with time zone, school_id uuid,
  test_subject text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_role text;
  v_academic_year_id uuid;
begin
  select u.school_id,u.role into v_school_id,v_role
  from public.users u where u.id=v_actor;

  if v_actor is null or v_school_id is null or v_role not in ('teacher','admin','school_admin') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not public.school_has_module_access(v_school_id,'cambridge') then
    raise exception 'Cambridge is not included in this school agreement' using errcode='42501';
  end if;

  select y.id into v_academic_year_id
  from public.school_academic_years y
  where y.school_id = v_school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;

  return query
  select qs.id,qs.student_id,coalesce(nullif(trim(su.full_name),''),qs.student_name),
    coalesce(cc.class_code,qs.student_class),qs.quiz_name,qs.test_id,qs.quiz_version,qs.attempt_number,
    qs.attempt_status,qs.score,qs.total_questions,qs.percentage,qs.answers,qs.time_taken_seconds,
    qs.submitted_at,coalesce(qs.scores_released,false),qs.released_at,qs.school_id,
    coalesce(ct.curriculum_subject,ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct on ct.id=qs.test_id or lower(trim(ct.name))=lower(trim(qs.quiz_name))
  left join public.users su on su.id=qs.student_id and su.school_id=qs.school_id
  left join lateral(
    select c.class_code
    from public.class_students cs
    join public.classes c on c.id=cs.class_id and c.school_id=qs.school_id
    where cs.student_id=qs.student_id and (
      v_role in ('admin','school_admin') or exists(
        select 1 from public.class_teacher_assignments x
        where x.class_id=c.id and x.teacher_user_id=v_actor
          and x.school_id=qs.school_id and x.active and x.can_grade
          and public.cambridge_assignment_matches_test(x.subject,qs.test_id,qs.quiz_name)
      )
    )
    order by c.class_code limit 1
  ) cc on true
  where qs.school_id=v_school_id
    and qs.attempt_status in ('submitted','released')
    and (v_academic_year_id is null or qs.academic_year_id = v_academic_year_id)
    and (
      v_role in ('admin','school_admin') or exists(
        select 1
        from public.class_teacher_assignments cta
        join public.classes c on c.id=cta.class_id and c.school_id=qs.school_id
        where cta.teacher_user_id=v_actor and cta.school_id=qs.school_id and cta.active and cta.can_grade
          and (exists(select 1 from public.class_students cs where cs.class_id=cta.class_id and cs.student_id=qs.student_id)
            or (qs.student_id is null and (c.class_code=qs.student_class or c.class_name=qs.student_class)))
          and public.cambridge_assignment_matches_test(cta.subject,qs.test_id,qs.quiz_name)
      )
    )
  order by qs.submitted_at desc
  limit greatest(1,least(coalesce(p_limit,100),1000));
end;
$function$;

create or replace function public.get_school_cambridge_scores_for_year(
  p_academic_year_id uuid,
  p_limit integer default 100
)
returns table(
  id uuid, student_id uuid, student_name text, student_class text, quiz_name text,
  test_id text, quiz_version text, attempt_number integer, attempt_status text,
  score integer, total_questions integer, percentage integer, answers jsonb,
  time_taken_seconds integer, submitted_at timestamp with time zone,
  scores_released boolean, released_at timestamp with time zone, school_id uuid,
  test_subject text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_role text;
begin
  select u.school_id,u.role into v_school_id,v_role
  from public.users u where u.id=v_actor;

  if v_actor is null or v_school_id is null or v_role not in ('teacher','admin','school_admin') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not public.school_has_module_access(v_school_id,'cambridge') then
    raise exception 'Cambridge is not included in this school agreement' using errcode='42501';
  end if;
  if p_academic_year_id is null or not exists (
    select 1 from public.school_academic_years y
    where y.id = p_academic_year_id and y.school_id = v_school_id
  ) then
    raise exception 'Academic year does not belong to this school' using errcode='42501';
  end if;

  return query
  select qs.id,qs.student_id,coalesce(nullif(trim(su.full_name),''),qs.student_name),
    coalesce(hist_class.class_code,qs.student_class),qs.quiz_name,qs.test_id,qs.quiz_version,qs.attempt_number,
    qs.attempt_status,qs.score,qs.total_questions,qs.percentage,qs.answers,qs.time_taken_seconds,
    qs.submitted_at,coalesce(qs.scores_released,false),qs.released_at,qs.school_id,
    coalesce(ct.curriculum_subject,ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct on ct.id=qs.test_id or lower(trim(ct.name))=lower(trim(qs.quiz_name))
  left join public.users su on su.id=qs.student_id and su.school_id=qs.school_id
  left join lateral(
    select e.class_code, e.class_id
    from public.student_academic_enrolments e
    where e.school_id=qs.school_id
      and e.student_id=qs.student_id
      and e.academic_year_id=p_academic_year_id
    order by case e.context_quality when 'confirmed' then 1 else 2 end, e.starts_on desc
    limit 1
  ) hist_class on true
  where qs.school_id=v_school_id
    and qs.academic_year_id=p_academic_year_id
    and qs.attempt_status in ('submitted','released')
    and (
      v_role in ('admin','school_admin') or exists(
        select 1
        from public.class_teacher_assignments cta
        where cta.teacher_user_id=v_actor
          and cta.school_id=qs.school_id
          and cta.active and cta.can_grade
          and cta.class_id=hist_class.class_id
          and public.cambridge_assignment_matches_test(cta.subject,qs.test_id,qs.quiz_name)
      )
    )
  order by qs.submitted_at desc
  limit greatest(1,least(coalesce(p_limit,100),1000));
end;
$function$;

revoke all on function public.get_school_cambridge_scores_for_year(uuid, integer) from public;
grant execute on function public.get_school_cambridge_scores_for_year(uuid, integer) to authenticated;

create or replace function public.rpc_school_cambridge_evidence_readiness(
  p_school_id uuid,
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_attempts integer;
  v_processed integer;
  v_materialized integer;
  v_partial integer;
  v_blocked integer;
  v_observations integer;
  v_unregistered integer;
  v_unmapped integer;
  v_stale integer;
  v_academic_year_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.school_memberships sm
    where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'active_school_membership_required');
  end if;
  if p_from is not null and p_to is not null and p_to <= p_from then
    return jsonb_build_object('success', false, 'code', 'invalid_evidence_readiness_window');
  end if;

  if p_from is null and p_to is null then
    select y.id into v_academic_year_id
    from public.school_academic_years y
    where y.school_id = p_school_id and y.status = 'current'
    order by y.starts_on desc, y.id
    limit 1;
  end if;

  select count(*) into v_attempts
  from public.quiz_scores q
  where q.school_id = p_school_id
    and (v_academic_year_id is null or q.academic_year_id = v_academic_year_id)
    and (p_from is null or q.submitted_at >= p_from)
    and (p_to is null or q.submitted_at < p_to);

  select count(distinct r.quiz_score_id),
    count(*) filter (where r.status = 'materialized'),
    count(*) filter (where r.status = 'partial'),
    count(*) filter (where r.status = 'blocked'),
    coalesce(sum(r.observation_count), 0), coalesce(sum(r.unregistered_item_count), 0),
    coalesce(sum(r.unmapped_item_count), 0), coalesce(sum(r.stale_item_count), 0)
  into v_processed, v_materialized, v_partial, v_blocked, v_observations,
    v_unregistered, v_unmapped, v_stale
  from public.cambridge_evidence_runs r
  join public.quiz_scores q on q.id = r.quiz_score_id
  where r.school_id = p_school_id
    and (v_academic_year_id is null or q.academic_year_id = v_academic_year_id)
    and (p_from is null or q.submitted_at >= p_from)
    and (p_to is null or q.submitted_at < p_to);

  return jsonb_build_object(
    'success', true,
    'academicYearId', v_academic_year_id,
    'readiness', case when v_attempts = 0 then 'no_attempts'
      when coalesce(v_processed, 0) = 0 then 'not_processed'
      when coalesce(v_blocked, 0) + coalesce(v_partial, 0) > 0
        or v_processed < v_attempts then 'partial' else 'ready' end,
    'attempts', v_attempts, 'processedAttempts', coalesce(v_processed, 0),
    'unprocessedAttempts', greatest(v_attempts - coalesce(v_processed, 0), 0),
    'materializedRuns', coalesce(v_materialized, 0),
    'partialRuns', coalesce(v_partial, 0), 'blockedRuns', coalesce(v_blocked, 0),
    'provisionalObservations', coalesce(v_observations, 0),
    'unregisteredItems', coalesce(v_unregistered, 0),
    'unmappedItems', coalesce(v_unmapped, 0), 'staleItems', coalesce(v_stale, 0),
    'observationsContributeToFocusState', false,
    'nextGate', 'phase_5_confidence_and_coverage'
  );
end;
$function$;
