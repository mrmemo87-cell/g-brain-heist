-- Fresh Start, Smart Memory
--
-- Academic-year setup must isolate new-year attainment without erasing or
-- rewriting the school's historical assignments and Writing Hub work.
-- Raw automated writing remains useful history, but only teacher-finalized
-- writing reviews can become authoritative Academic Profile evidence.

create or replace function private.student_learning_enforce_writing_attempt_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'writing_attempt' then
    new.contributes_to_focus_state := false;
    new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
      'evidence_authority', 'automated_history',
      'official_profile_eligible', false,
      'academic_continuity', 'historical_context_only'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.student_learning_enforce_writing_attempt_history()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_zzz_student_learning_enforce_writing_attempt_history
  on public.student_learning_observations;
create trigger trg_zzz_student_learning_enforce_writing_attempt_history
before insert or update of source_type, contributes_to_focus_state, evidence
on public.student_learning_observations
for each row execute function private.student_learning_enforce_writing_attempt_history();

-- Repair legacy metadata only. The original submission, scores, feedback,
-- timestamps, source IDs, and evidence payload remain preserved.
update public.student_learning_observations o
set contributes_to_focus_state = false,
    evidence = coalesce(o.evidence, '{}'::jsonb) || jsonb_build_object(
      'evidence_authority', 'automated_history',
      'official_profile_eligible', false,
      'academic_continuity', 'historical_context_only'
    )
where o.source_type = 'writing_attempt'
  and (
    o.contributes_to_focus_state
    or o.evidence->>'evidence_authority' is distinct from 'automated_history'
    or lower(coalesce(o.evidence->>'official_profile_eligible', 'true')) <> 'false'
  );

alter table public.student_learning_observations
  validate constraint student_learning_writing_attempt_non_authoritative_chk;

create or replace function private.academic_refresh_school_context_for_period(
  p_school_id uuid,
  p_starts_on date,
  p_ends_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_school_id is null
     or p_starts_on is null
     or p_ends_on is null
     or p_ends_on < p_starts_on then
    return;
  end if;

  update public.school_subjects ss
  set academic_subject_id = public.academic_resolve_subject_id(ss.name, ss.school_id)
  where ss.school_id = p_school_id
    and ss.academic_subject_id is distinct from
      public.academic_resolve_subject_id(ss.name, ss.school_id);

  -- Published assignments are immutable historical evidence. They are resolved
  -- to an academic year by their original assigned_at date on read surfaces;
  -- only drafts may receive a refreshed stored snapshot.
  update public.assignments a
  set subject_name = a.subject_name
  where a.school_id = p_school_id
    and coalesce(a.publish_status, 'published') = 'draft'
    and (a.assigned_at at time zone 'UTC')::date
      between p_starts_on and p_ends_on;

  -- Re-run the existing source-agnostic enrichment trigger only for evidence
  -- inside the calendar/enrolment period that actually changed.
  update public.student_learning_observations o
  set subject = o.subject
  where o.school_id = p_school_id
    and (o.observed_at at time zone 'UTC')::date
      between p_starts_on and p_ends_on;

  update public.student_learning_focus_states f
  set academic_subject_id = public.academic_resolve_subject_id(f.subject, f.school_id)
  where f.school_id = p_school_id
    and (f.last_observed_at at time zone 'UTC')::date
      between p_starts_on and p_ends_on
    and f.academic_subject_id is distinct from
      public.academic_resolve_subject_id(f.subject, f.school_id);
end;
$$;
revoke all on function private.academic_refresh_school_context_for_period(uuid, date, date)
  from public, anon, authenticated, service_role;

-- Compatibility entry point for trusted backend callers. Normal school setup
-- RPCs below use the exact affected period instead of sweeping all history.
create or replace function private.academic_refresh_school_context(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period record;
begin
  for v_period in
    select y.starts_on, y.ends_on
    from public.school_academic_years y
    where y.school_id = p_school_id
    order by y.starts_on
  loop
    perform private.academic_refresh_school_context_for_period(
      p_school_id, v_period.starts_on, v_period.ends_on
    );
  end loop;
end;
$$;
revoke all on function private.academic_refresh_school_context(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_school_admin_upsert_academic_year(
  p_school_id uuid,
  p_year_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_status text default 'planned'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_old_starts_on date;
  v_old_ends_on date;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if length(trim(coalesce(p_name, ''))) < 3
     or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_status not in ('planned', 'current', 'closed') then
    return jsonb_build_object('success', false, 'code', 'invalid_academic_year');
  end if;

  select coalesce(
    p_year_id,
    (select y.id from public.school_academic_years y
      where y.school_id = p_school_id
        and lower(trim(y.name)) = lower(trim(p_name))
      limit 1),
    gen_random_uuid()
  ) into v_id;

  select y.starts_on, y.ends_on
  into v_old_starts_on, v_old_ends_on
  from public.school_academic_years y
  where y.id = v_id and y.school_id = p_school_id;

  if exists (
    select 1 from public.school_academic_years y
    where y.id = v_id and y.school_id <> p_school_id
  ) then
    raise exception using errcode = '42501', message = 'academic_year_school_mismatch';
  end if;
  if exists (
    select 1 from public.school_academic_years y
    where y.school_id = p_school_id and y.id <> v_id
      and daterange(y.starts_on, y.ends_on, '[]')
        && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    return jsonb_build_object('success', false, 'code', 'academic_years_overlap');
  end if;

  if p_status = 'current' then
    update public.school_academic_years
    set status = 'closed', updated_at = now()
    where school_id = p_school_id and status = 'current' and id <> v_id;
  end if;

  insert into public.school_academic_years(
    id, school_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_id, p_school_id, trim(p_name), p_starts_on, p_ends_on, p_status, v_actor
  )
  on conflict (id) do update set
    name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = excluded.status,
    updated_at = now()
  where school_academic_years.school_id = p_school_id;

  perform private.academic_refresh_school_context_for_period(
    p_school_id,
    least(coalesce(v_old_starts_on, p_starts_on), p_starts_on),
    greatest(coalesce(v_old_ends_on, p_ends_on), p_ends_on)
  );

  return jsonb_build_object(
    'success', true,
    'academicYearId', v_id,
    'historicalRecordsRewritten', false,
    'refreshScope', 'affected_period_only'
  );
end;
$$;
revoke all on function public.rpc_school_admin_upsert_academic_year(
  uuid, uuid, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.rpc_school_admin_upsert_academic_year(
  uuid, uuid, text, date, date, text
) to authenticated, service_role;

create or replace function public.rpc_school_admin_upsert_academic_term(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_name text,
  p_sequence_number smallint,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_old_starts_on date;
  v_old_ends_on date;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2
     or p_sequence_number is null or p_sequence_number <= 0
     or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    return jsonb_build_object('success', false, 'code', 'invalid_academic_term');
  end if;

  select coalesce(
    p_term_id,
    (select t.id from public.school_academic_terms t
      where t.school_id = p_school_id
        and t.academic_year_id = p_academic_year_id
        and lower(trim(t.name)) = lower(trim(p_name))
      limit 1),
    gen_random_uuid()
  ) into v_id;

  select t.starts_on, t.ends_on
  into v_old_starts_on, v_old_ends_on
  from public.school_academic_terms t
  where t.id = v_id
    and t.school_id = p_school_id
    and t.academic_year_id = p_academic_year_id;

  if exists (
    select 1 from public.school_academic_terms t
    where t.id = v_id
      and (t.school_id <> p_school_id or t.academic_year_id <> p_academic_year_id)
  ) then
    raise exception using errcode = '42501', message = 'academic_term_school_mismatch';
  end if;

  insert into public.school_academic_terms(
    id, school_id, academic_year_id, name, sequence_number, starts_on, ends_on
  ) values (
    v_id, p_school_id, p_academic_year_id, trim(p_name),
    p_sequence_number, p_starts_on, p_ends_on
  )
  on conflict (id) do update set
    name = excluded.name,
    sequence_number = excluded.sequence_number,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    updated_at = now()
  where school_academic_terms.school_id = p_school_id
    and school_academic_terms.academic_year_id = p_academic_year_id;

  perform private.academic_refresh_school_context_for_period(
    p_school_id,
    least(coalesce(v_old_starts_on, p_starts_on), p_starts_on),
    greatest(coalesce(v_old_ends_on, p_ends_on), p_ends_on)
  );

  return jsonb_build_object(
    'success', true,
    'academicTermId', v_id,
    'historicalRecordsRewritten', false,
    'refreshScope', 'affected_period_only'
  );
end;
$$;
revoke all on function public.rpc_school_admin_upsert_academic_term(
  uuid, uuid, uuid, text, smallint, date, date
) from public, anon, authenticated;
grant execute on function public.rpc_school_admin_upsert_academic_term(
  uuid, uuid, uuid, text, smallint, date, date
) to authenticated, service_role;

create or replace function public.rpc_school_admin_seed_academic_enrolments(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_inserted integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id and y.school_id = p_school_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;

  insert into public.student_academic_enrolments(
    school_id, student_id, academic_year_id, class_id, grade_level, class_code,
    starts_on, ends_on, context_quality, source, created_by
  )
  select
    p_school_id, cs.student_id, v_year.id, c.id, c.grade_level, c.class_code,
    v_year.starts_on, v_year.ends_on, 'estimated',
    'current_placement_baseline', v_actor
  from public.class_students cs
  join public.classes c on c.id = cs.class_id and c.school_id = p_school_id
  join public.school_members sm on sm.school_id = p_school_id
    and sm.user_id = cs.student_id
    and sm.status = 'active'
    and sm.role_in_school = 'student'
  where coalesce(c.is_active, true)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  perform private.academic_refresh_school_context_for_period(
    p_school_id, v_year.starts_on, v_year.ends_on
  );
  return jsonb_build_object(
    'success', true,
    'academicYearId', p_academic_year_id,
    'inserted', v_inserted,
    'contextQuality', 'estimated',
    'historicalRecordsRewritten', false
  );
end;
$$;
revoke all on function public.rpc_school_admin_seed_academic_enrolments(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_seed_academic_enrolments(uuid, uuid)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_confirm_academic_roster(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_readiness jsonb;
  v_updated_estimated integer := 0;
  v_inserted_missing integer := 0;
  v_confirmed_total integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = p_school_id
    and y.status in ('planned', 'current')
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_confirmable');
  end if;

  v_readiness := public.rpc_school_admin_academic_roster_readiness(
    p_school_id, p_academic_year_id
  );
  if not coalesce((v_readiness->>'success')::boolean, false) then
    return v_readiness;
  end if;
  if not coalesce((v_readiness->>'ready')::boolean, false) then
    return v_readiness || jsonb_build_object(
      'success', false,
      'code', 'academic_roster_not_ready'
    );
  end if;

  with placements as (
    select sm.user_id as student_id, c.id as class_id,
           c.grade_level, c.class_code
    from public.school_members sm
    join public.class_students cs on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = p_school_id
     and coalesce(c.is_active, true)
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  )
  update public.student_academic_enrolments e
  set class_id = p.class_id,
      grade_level = p.grade_level,
      class_code = p.class_code,
      starts_on = v_year.starts_on,
      ends_on = v_year.ends_on,
      context_quality = 'confirmed',
      source = 'school_admin',
      created_by = coalesce(e.created_by, v_actor),
      updated_at = now()
  from placements p
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id
    and e.student_id = p.student_id
    and e.context_quality = 'estimated';
  get diagnostics v_updated_estimated = row_count;

  with placements as (
    select sm.user_id as student_id, c.id as class_id,
           c.grade_level, c.class_code
    from public.school_members sm
    join public.class_students cs on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = p_school_id
     and coalesce(c.is_active, true)
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  )
  insert into public.student_academic_enrolments(
    school_id, student_id, academic_year_id, class_id, grade_level, class_code,
    starts_on, ends_on, context_quality, source, created_by
  )
  select
    p_school_id, p.student_id, p_academic_year_id,
    p.class_id, p.grade_level, p.class_code,
    v_year.starts_on, v_year.ends_on, 'confirmed', 'school_admin', v_actor
  from placements p
  where not exists (
    select 1
    from public.student_academic_enrolments e
    where e.school_id = p_school_id
      and e.academic_year_id = p_academic_year_id
      and e.student_id = p.student_id
  );
  get diagnostics v_inserted_missing = row_count;

  select count(*)::integer
  into v_confirmed_total
  from public.student_academic_enrolments e
  join public.school_members sm
    on sm.school_id = p_school_id
   and sm.user_id = e.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id
    and e.context_quality = 'confirmed';

  perform private.academic_refresh_school_context_for_period(
    p_school_id, v_year.starts_on, v_year.ends_on
  );

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', p_academic_year_id,
    'updatedEstimated', v_updated_estimated,
    'insertedMissing', v_inserted_missing,
    'confirmedEnrolments', v_confirmed_total,
    'historicalRecordsRewritten', false
  );
end;
$$;
revoke all on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_academic_year_continuity(
  p_school_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_current_year_id uuid;
  v_years jsonb := '[]'::jsonb;
  v_fresh_start boolean := false;
  v_previous_history boolean := false;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  select y.id into v_current_year_id
  from public.school_academic_years y
  where y.school_id = p_school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;

  with year_metrics as materialized (
    select
      y.id,
      y.name,
      y.starts_on,
      y.ends_on,
      y.status,
      (
        select count(*)::integer
        from public.assignments a
        where a.school_id = p_school_id
          and coalesce(
            a.academic_year_id,
            public.academic_resolve_year_id(a.school_id, a.assigned_at)
          ) = y.id
      ) as assignments,
      (
        select count(distinct coalesce(
          nullif(o.evidence->>'logical_attempt_key', ''),
          o.source_id::text,
          o.source_key
        ))::integer
        from public.student_learning_observations o
        where o.school_id = p_school_id
          and o.source_type in ('writing_attempt', 'writing_assessment_review')
          and coalesce(
            o.academic_year_id,
            public.academic_resolve_year_id(o.school_id, o.observed_at)
          ) = y.id
      ) as writing_submissions,
      (
        select count(distinct coalesce(
          nullif(o.evidence->>'logical_attempt_key', ''),
          o.source_id::text,
          o.source_key
        ))::integer
        from public.student_learning_observations o
        where o.school_id = p_school_id
          and o.source_type = 'writing_assessment_review'
          and coalesce(
            o.academic_year_id,
            public.academic_resolve_year_id(o.school_id, o.observed_at)
          ) = y.id
      ) as teacher_reviewed_writing,
      (
        select count(*)::integer
        from public.student_learning_observations o
        where o.school_id = p_school_id
          and coalesce(
            o.academic_year_id,
            public.academic_resolve_year_id(o.school_id, o.observed_at)
          ) = y.id
          and public.student_learning_observation_is_qualified(
            o.source_type, o.contributes_to_focus_state, o.evidence
          )
      ) as official_learning_observations,
      (
        select count(distinct e.student_id)::integer
        from public.student_academic_enrolments e
        where e.school_id = p_school_id and e.academic_year_id = y.id
      ) as students_enrolled,
      (
        select count(*)::integer
        from public.academic_report_snapshots r
        where r.school_id = p_school_id
          and r.academic_year_id = y.id
          and r.status = 'final'
      ) as final_reports,
      (
        select count(*)::integer
        from public.student_learning_focus_states f
        where f.school_id = p_school_id
          and f.academic_year_id = y.id
          and f.current_status in ('new_focus', 'recurring', 'persistent')
          and exists (
            select 1
            from public.student_learning_observations qualified
            where qualified.school_id = f.school_id
              and qualified.student_id = f.student_id
              and qualified.skill_key = f.skill_key
              and qualified.academic_year_id = y.id
              and public.student_learning_observation_is_qualified(
                qualified.source_type,
                qualified.contributes_to_focus_state,
                qualified.evidence
              )
          )
      ) as open_support_signals,
      (
        select count(distinct f.student_id)::integer
        from public.student_learning_focus_states f
        where f.school_id = p_school_id
          and f.academic_year_id = y.id
          and f.current_status in ('new_focus', 'recurring', 'persistent')
          and exists (
            select 1
            from public.student_learning_observations qualified
            where qualified.school_id = f.school_id
              and qualified.student_id = f.student_id
              and qualified.skill_key = f.skill_key
              and qualified.academic_year_id = y.id
              and public.student_learning_observation_is_qualified(
                qualified.source_type,
                qualified.contributes_to_focus_state,
                qualified.evidence
              )
          )
      ) as students_with_support_signals,
      (
        select count(*)::integer
        from public.assignments a
        where a.school_id = p_school_id
          and a.academic_year_id is null
          and public.academic_resolve_year_id(a.school_id, a.assigned_at) = y.id
      ) as legacy_projected_assignments,
      (
        select count(distinct coalesce(
          nullif(o.evidence->>'logical_attempt_key', ''),
          o.source_id::text,
          o.source_key
        ))::integer
        from public.student_learning_observations o
        where o.school_id = p_school_id
          and o.source_type = 'writing_attempt'
          and o.academic_year_id is null
          and public.academic_resolve_year_id(o.school_id, o.observed_at) = y.id
      ) as legacy_projected_writing_submissions,
      (
        select max(o.observed_at)
        from public.student_learning_observations o
        where o.school_id = p_school_id
          and coalesce(
            o.academic_year_id,
            public.academic_resolve_year_id(o.school_id, o.observed_at)
          ) = y.id
      ) as latest_evidence_at
    from public.school_academic_years y
    where y.school_id = p_school_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'startsOn', m.starts_on,
      'endsOn', m.ends_on,
      'status', m.status,
      'accessMode', case when m.status = 'closed' then 'read_only' else 'active' end,
      'assignments', m.assignments,
      'writingSubmissions', m.writing_submissions,
      'teacherReviewedWriting', m.teacher_reviewed_writing,
      'officialLearningObservations', m.official_learning_observations,
      'studentsEnrolled', m.students_enrolled,
      'finalReports', m.final_reports,
      'openSupportSignals', m.open_support_signals,
      'studentsWithSupportSignals', m.students_with_support_signals,
      'legacyProjectedAssignments', m.legacy_projected_assignments,
      'legacyProjectedWritingSubmissions', m.legacy_projected_writing_submissions,
      'latestEvidenceAt', m.latest_evidence_at,
      'hasActivity', (
        m.assignments + m.writing_submissions
        + m.official_learning_observations + m.final_reports
      ) > 0
    ) order by m.starts_on desc, m.id), '[]'::jsonb),
    coalesce(bool_and(
      case when m.id = v_current_year_id then
        m.assignments = 0
        and m.writing_submissions = 0
        and m.official_learning_observations = 0
        and m.final_reports = 0
      else true end
    ), false),
    coalesce(bool_or(
      m.status = 'closed'
      and (
        m.assignments > 0
        or m.writing_submissions > 0
        or m.official_learning_observations > 0
        or m.final_reports > 0
      )
    ), false)
  into v_years, v_fresh_start, v_previous_history
  from year_metrics m;

  return jsonb_build_object(
    'success', true,
    'schoolId', p_school_id,
    'currentYearId', v_current_year_id,
    'freshStart', v_current_year_id is not null and v_fresh_start,
    'previousHistoryAvailable', v_previous_history,
    'years', v_years,
    'policy', jsonb_build_object(
      'defaultYearScope', 'current',
      'historicalYearsReadOnly', true,
      'currentYearResultsIsolated', true,
      'historicalRecordsRemainAvailable', true,
      'previousEvidenceAffectsCurrentAttainment', false,
      'teacherCanUseHistoryAsContext', true,
      'historicalAssignmentsResolvedByOriginalAssignedDate', true,
      'rawAutomatedWritingIsAuthoritative', false
    )
  );
end;
$$;
revoke all on function public.rpc_school_admin_academic_year_continuity(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_academic_year_continuity(uuid)
  to authenticated, service_role;

comment on function public.rpc_school_admin_academic_year_continuity(uuid) is
  'Fresh Start, Smart Memory summary: current-year metrics stay isolated while closed-year history remains available as read-only context.';