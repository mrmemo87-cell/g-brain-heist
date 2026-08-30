create or replace function public.rpc_academic_reporting_context(p_student_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_role text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select u.school_id into v_school_id from public.users u
  where u.id = coalesce(p_student_id, v_caller);
  if v_school_id is null then raise exception 'School context is required'; end if;
  if public.is_school_owner(v_school_id) then v_role := 'school_head';
  elsif exists (select 1 from public.school_members sm where sm.school_id = v_school_id
    and sm.user_id = v_caller and sm.status = 'active' and sm.role_in_school = 'school_admin')
    then v_role := 'school_admin';
  elsif p_student_id is not null and exists (
    select 1 from public.class_students cs
    join public.class_teacher_assignments cta on cta.class_id = cs.class_id
      and cta.school_id = v_school_id and cta.teacher_user_id = v_caller and cta.active is true
    where cs.student_id = p_student_id
  ) then v_role := 'teacher';
  elsif p_student_id is null and exists (
    select 1 from public.class_teacher_assignments cta
    where cta.school_id = v_school_id
      and cta.teacher_user_id = v_caller
      and cta.active is true
  ) then v_role := 'teacher';
  elsif p_student_id is null or p_student_id = v_caller then v_role := 'student';
  else raise exception 'Not authorised for academic reporting context'; end if;

  return jsonb_build_object(
    'success', true,
    'viewer', jsonb_build_object('id', v_caller, 'role', v_role),
    'schoolId', v_school_id,
    'years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id, 'name', y.name, 'startsOn', y.starts_on,
        'endsOn', y.ends_on, 'status', y.status
      ) order by y.starts_on desc, y.id)
      from public.school_academic_years y where y.school_id = v_school_id
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'academicYearId', t.academic_year_id, 'name', t.name,
        'sequenceNumber', t.sequence_number, 'startsOn', t.starts_on, 'endsOn', t.ends_on
      ) order by t.academic_year_id, t.sequence_number, t.id)
      from public.school_academic_terms t where t.school_id = v_school_id
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
        order by s.name, s.id)
      from public.academic_subjects s where s.is_active and (
        v_role in ('school_head','school_admin','student')
        or exists (
          select 1 from public.class_teacher_assignments cta
          where cta.school_id = v_school_id and cta.teacher_user_id = v_caller
            and cta.active is true and (
              public.academic_normalize_subject_key(cta.subject) = s.code
              or public.academic_resolve_subject_id(cta.subject, v_school_id) = s.id
            )
        )
      )
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.class_name, 'code', c.class_code, 'gradeLevel', c.grade_level
      ) order by c.grade_level, c.class_name, c.id)
      from public.classes c where c.school_id = v_school_id and (
        v_role in ('school_head','school_admin')
        or exists (select 1 from public.class_teacher_assignments cta
          where cta.class_id = c.id and cta.teacher_user_id = v_caller and cta.active is true)
      )
    ), '[]'::jsonb),
    'grades', coalesce((
      select jsonb_agg(g.grade_level order by g.grade_level)
      from (select distinct e.grade_level from public.student_academic_enrolments e
        where e.school_id = v_school_id and e.grade_level is not null) g
    ), '[]'::jsonb),
    'recentReports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reportType', r.report_type, 'audience', r.audience,
        'status', r.status, 'version', r.report_version,
        'academicYearId', r.academic_year_id, 'academicTermId', r.academic_term_id,
        'payloadHash', r.payload_hash, 'generatedAt', r.generated_at, 'finalizedAt', r.finalized_at
      ) order by r.generated_at desc)
      from (select x.* from public.academic_report_snapshots x
        where x.school_id = v_school_id and (
          (v_role = 'student' and x.student_id = v_caller and x.status = 'final'
            and x.audience = 'student')
          or (v_role <> 'student' and (x.generated_by = v_caller
            or v_role in ('school_head','school_admin')))
        ) order by x.generated_at desc limit 20) r
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canGenerateStudent', v_role in ('teacher','school_admin','school_head'),
      'canGenerateClass', v_role in ('teacher','school_admin','school_head'),
      'canGenerateGrade', v_role in ('school_admin','school_head'),
      'canGenerateSubject', v_role in ('school_admin','school_head'),
      'canGenerateSchool', v_role in ('school_admin','school_head')
    ),
    'disclosure', jsonb_build_object(
      'reportSnapshotsAreImmutable', true,
      'draftRequiresFinalApprovalBeforeExport', true,
      'privateTeacherNotesExcluded', true
    )
  );
end;
$function$;

revoke all on function public.rpc_academic_reporting_context(uuid) from public, anon;
grant execute on function public.rpc_academic_reporting_context(uuid) to authenticated, service_role;
