create or replace function private.year_rollover_terminal_grade_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_overridden,false) is false
     and coalesce(private.year_rollover_grade_number(new.source_grade),0) >= 12
     and new.review_state <> 'applied' then
    new.outcome := 'graduate';
    new.target_class_id := null;
    new.target_grade := null;
    new.review_state := 'auto_ready';
    new.rationale := 'Terminal Grade 12 is configured to graduate automatically at rollover unless a school administrator explicitly overrides the student to repeat.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_year_rollover_terminal_grade_default on public.school_year_rollover_student_decisions;
create trigger trg_year_rollover_terminal_grade_default
before insert or update on public.school_year_rollover_student_decisions
for each row execute function private.year_rollover_terminal_grade_default();

create or replace function private.trg_admissions_auto_place_active_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.role_in_school <> 'student' or new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.role_in_school = new.role_in_school
     and old.status = new.status then
    return new;
  end if;

  select lower(trim(au.email))
  into v_email
  from auth.users au
  where au.id = new.user_id
    and au.email_confirmed_at is not null;

  if v_email is null then
    return new;
  end if;

  update public.adm_candidates c
  set status = 'placed', updated_at = now()
  where c.school_id = new.school_id
    and lower(trim(c.email)) = v_email
    and c.status in ('registered','testing','completed');

  return new;
end;
$$;

drop trigger if exists trg_admissions_auto_place_active_student on public.school_members;
create trigger trg_admissions_auto_place_active_student
after insert or update of status, role_in_school on public.school_members
for each row execute function private.trg_admissions_auto_place_active_student();

create or replace function private.school_year_rollover_integrity_audit_internal(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.school_year_rollover_plans%rowtype;
  v_target public.school_academic_years%rowtype;
  v_exit_leaks integer := 0;
  v_duplicate_enrolments integer := 0;
  v_multiple_classes integer := 0;
  v_unscoped_ielts integer := 0;
  v_wrong_year_assignments integer := 0;
  v_live_cambridge_teacher_overrides integer := 0;
  v_bad_teacher_allocations integer := 0;
  v_bad_programme_seats integer := 0;
  v_admissions_overlap integer := 0;
  v_terminal_unresolved integer := 0;
  v_roster_only integer := 0;
  v_empty_teacher_classes integer := 0;
  v_pending_programme_requests integer := 0;
  v_optional_subject_scopes integer := 0;
  v_subject_enrolments integer := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select * into v_plan
  from public.school_year_rollover_plans p
  where p.id = p_plan_id;
  if not found then
    return jsonb_build_object('healthy',false,'blockers',jsonb_build_array(jsonb_build_object('code','rollover_plan_not_found')),'warnings','[]'::jsonb);
  end if;

  select * into v_target
  from public.school_academic_years y
  where y.id = v_plan.target_academic_year_id and y.school_id = v_plan.school_id;

  select count(distinct d.student_id)::integer into v_exit_leaks
  from public.school_year_rollover_student_decisions d
  where d.plan_id = v_plan.id
    and d.outcome in ('graduate','leave')
    and (
      exists(select 1 from public.school_members sm where sm.school_id=v_plan.school_id and sm.user_id=d.student_id and sm.status='active')
      or exists(select 1 from public.class_students cs join public.classes c on c.id=cs.class_id and c.school_id=v_plan.school_id where cs.student_id=d.student_id)
      or exists(select 1 from public.student_academic_enrolments e where e.school_id=v_plan.school_id and e.student_id=d.student_id and e.academic_year_id=v_plan.target_academic_year_id)
    );

  select count(*)::integer into v_duplicate_enrolments
  from (
    select e.student_id
    from public.student_academic_enrolments e
    where e.school_id=v_plan.school_id and e.academic_year_id=v_plan.target_academic_year_id
    group by e.student_id having count(*) > 1
  ) x;

  select count(*)::integer into v_multiple_classes
  from (
    select cs.student_id
    from public.class_students cs
    join public.classes c on c.id=cs.class_id and c.school_id=v_plan.school_id
    group by cs.student_id having count(*) > 1
  ) x;

  select count(*)::integer into v_unscoped_ielts
  from public.ielts_practice_assignments a
  where a.school_id=v_plan.school_id
    and a.status in ('assigned','closed')
    and a.academic_year_id is null;

  select count(*)::integer into v_wrong_year_assignments
  from public.assignments a
  where a.school_id=v_plan.school_id
    and a.assigned_at is not null
    and a.assigned_at::date between v_target.starts_on and v_target.ends_on
    and a.academic_year_id is distinct from v_plan.target_academic_year_id;

  select (
    (select count(*) from public.teacher_cambridge_class_visibility t join public.classes c on c.id=t.class_id and c.school_id=v_plan.school_id)
    + (select count(*) from public.cambridge_test_visibility t where t.school_id=v_plan.school_id)
  )::integer into v_live_cambridge_teacher_overrides;

  select count(*)::integer into v_bad_teacher_allocations
  from public.class_teacher_assignments cta
  where cta.school_id=v_plan.school_id and cta.active
    and (
      not exists(select 1 from public.school_members sm where sm.school_id=v_plan.school_id and sm.user_id=cta.teacher_user_id and sm.status='active' and (sm.role_in_school='teacher' or sm.can_teach))
      or not exists(select 1 from public.classes c where c.id=cta.class_id and c.school_id=v_plan.school_id and coalesce(c.is_active,true))
    );

  select count(*)::integer into v_bad_programme_seats
  from public.school_programme_seat_assignments a
  where a.school_id=v_plan.school_id and a.released_at is null
    and not exists(select 1 from public.school_members sm where sm.school_id=v_plan.school_id and sm.user_id=a.student_user_id and sm.status='active' and sm.role_in_school='student');

  select count(*)::integer into v_admissions_overlap
  from public.adm_candidates c
  where c.school_id=v_plan.school_id and c.status in ('registered','testing','completed')
    and exists(
      select 1
      from public.school_members sm
      join public.users u on u.id=sm.user_id
      join auth.users au on au.id=u.id and au.email_confirmed_at is not null
      where sm.school_id=v_plan.school_id and sm.status='active' and sm.role_in_school='student'
        and lower(trim(au.email))=lower(trim(c.email))
    );

  select count(*)::integer into v_terminal_unresolved
  from public.school_year_rollover_student_decisions d
  where d.plan_id=v_plan.id
    and coalesce(d.is_overridden,false) is false
    and coalesce(private.year_rollover_grade_number(d.source_grade),0) >= 12
    and d.outcome <> 'graduate';

  select count(distinct cs.student_id)::integer into v_roster_only
  from public.class_students cs
  join public.classes c on c.id=cs.class_id and c.school_id=v_plan.school_id
  where not exists(
    select 1 from public.school_members sm
    where sm.school_id=v_plan.school_id and sm.user_id=cs.student_id and sm.status='active' and sm.role_in_school='student'
  );

  select count(*)::integer into v_empty_teacher_classes
  from public.class_teacher_assignments cta
  where cta.school_id=v_plan.school_id and cta.active
    and not exists(select 1 from public.class_students cs where cs.class_id=cta.class_id);

  select count(*)::integer into v_pending_programme_requests
  from public.school_programme_access_requests r
  where r.school_id=v_plan.school_id and r.status='pending';

  select count(*)::integer into v_optional_subject_scopes
  from public.school_curriculum_scope_mappings m
  where m.school_id=v_plan.school_id and m.academic_year_id=v_plan.target_academic_year_id
    and m.status='active' and m.subject_requirement <> 'required';

  select count(*)::integer into v_subject_enrolments
  from public.student_subject_enrolments e
  where e.school_id=v_plan.school_id and e.academic_year_id=v_plan.target_academic_year_id and e.status='active';

  if v_exit_leaks > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','exit_student_leak','count',v_exit_leaks)); end if;
  if v_duplicate_enrolments > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','duplicate_target_enrolment','count',v_duplicate_enrolments)); end if;
  if v_multiple_classes > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','multiple_current_classes','count',v_multiple_classes)); end if;
  if v_unscoped_ielts > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','unscoped_active_ielts_practice','count',v_unscoped_ielts)); end if;
  if v_wrong_year_assignments > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','wrong_year_assignment','count',v_wrong_year_assignments)); end if;
  if v_live_cambridge_teacher_overrides > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','cambridge_teacher_overrides_not_reset','count',v_live_cambridge_teacher_overrides)); end if;
  if v_bad_teacher_allocations > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','invalid_active_teacher_assignment','count',v_bad_teacher_allocations)); end if;
  if v_bad_programme_seats > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','programme_seat_for_inactive_student','count',v_bad_programme_seats)); end if;
  if v_admissions_overlap > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','admissions_student_overlap','count',v_admissions_overlap)); end if;
  if v_terminal_unresolved > 0 then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','terminal_grade_not_graduated','count',v_terminal_unresolved)); end if;

  if v_roster_only > 0 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','roster_only_students','count',v_roster_only)); end if;
  if v_empty_teacher_classes > 0 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','teacher_assignments_on_empty_classes','count',v_empty_teacher_classes)); end if;
  if v_pending_programme_requests > 0 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','pending_programme_access_requests','count',v_pending_programme_requests)); end if;
  if v_optional_subject_scopes > 0 and v_subject_enrolments = 0 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','optional_subject_scopes_without_student_enrolments','count',v_optional_subject_scopes)); end if;

  return jsonb_build_object(
    'healthy',jsonb_array_length(v_blockers)=0,
    'planId',v_plan.id,
    'schoolId',v_plan.school_id,
    'targetAcademicYearId',v_plan.target_academic_year_id,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'checks',jsonb_build_object(
      'exitStudentLeaks',v_exit_leaks,
      'duplicateTargetEnrolments',v_duplicate_enrolments,
      'multipleCurrentClasses',v_multiple_classes,
      'unscopedActiveIeltsPractice',v_unscoped_ielts,
      'wrongYearAssignments',v_wrong_year_assignments,
      'liveCambridgeTeacherOverrides',v_live_cambridge_teacher_overrides,
      'invalidTeacherAssignments',v_bad_teacher_allocations,
      'invalidProgrammeSeats',v_bad_programme_seats,
      'admissionsStudentOverlap',v_admissions_overlap,
      'terminalGradeUnresolved',v_terminal_unresolved,
      'rosterOnlyStudents',v_roster_only,
      'emptyTeacherClasses',v_empty_teacher_classes,
      'pendingProgrammeRequests',v_pending_programme_requests,
      'optionalSubjectScopes',v_optional_subject_scopes,
      'activeSubjectEnrolments',v_subject_enrolments
    )
  );
end;
$$;

create or replace function public.rpc_school_admin_rollover_integrity_audit(p_school_id uuid, p_plan_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_id uuid := p_plan_id;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501', message='school_administrator_access_required';
  end if;

  if v_plan_id is null then
    select p.id into v_plan_id
    from public.school_year_rollover_plans p
    where p.school_id=p_school_id and p.status='completed'
    order by p.completed_at desc nulls last,p.updated_at desc,p.id
    limit 1;
  end if;

  if v_plan_id is null or not exists(select 1 from public.school_year_rollover_plans p where p.id=v_plan_id and p.school_id=p_school_id) then
    return jsonb_build_object('healthy',false,'blockers',jsonb_build_array(jsonb_build_object('code','rollover_plan_not_found')),'warnings','[]'::jsonb);
  end if;

  return private.school_year_rollover_integrity_audit_internal(v_plan_id);
end;
$$;

revoke all on function public.rpc_school_admin_rollover_integrity_audit(uuid,uuid) from public,anon;
grant execute on function public.rpc_school_admin_rollover_integrity_audit(uuid,uuid) to authenticated,service_role;

create or replace function private.capture_school_year_rollover_snapshots_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit jsonb;
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.capture_school_year_rollover_snapshots_for_plan(new.id);
    perform private.apply_school_year_rollover_post_commit_policies(new.id);
    perform private.refresh_school_roster_identity_states(new.school_id);
    v_audit := private.school_year_rollover_integrity_audit_internal(new.id);
    if coalesce((v_audit->>'healthy')::boolean,false) is not true then
      raise exception using errcode='23514', message='rollover_integrity_blocked', detail=left(v_audit::text,4000);
    end if;
    update public.school_year_rollover_plans p
    set completion_summary=coalesce(p.completion_summary,'{}'::jsonb)||jsonb_build_object('integrityAudit',v_audit,'integrityGatePassed',true),updated_at=now()
    where p.id=new.id;
  end if;
  return new;
end;
$$;
