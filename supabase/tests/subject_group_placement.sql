-- Run ONLY inside BEGIN / ROLLBACK after 20261102150000_subject_group_placement_safety.sql.
-- Uses existing active school actors; all subjects/offerings/groups created here are transient.
do $$
declare
  v_school uuid; v_year uuid; v_grade text; v_map uuid; v_admin uuid;
  v_s1 uuid; v_s2 uuid; v_subject uuid; v_offering uuid; v_group uuid; v_group2 uuid;
  v_result jsonb; v_placement jsonb; v_name text; v_count integer;
begin
  select ae.school_id,ae.academic_year_id,ae.grade_level into v_school,v_year,v_grade
  from public.student_academic_enrolments ae
  join public.school_members sm on sm.user_id=ae.student_id and sm.school_id=ae.school_id and sm.status='active' and sm.role_in_school='student'
  join public.class_students cs on cs.student_id=ae.student_id and cs.class_id=ae.class_id
  join public.classes c on c.id=ae.class_id and c.school_id=ae.school_id and coalesce(c.is_active,true) and c.grade_level=ae.grade_level
  join public.users u on u.id=ae.student_id and u.school_id=ae.school_id and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now())
  where ae.academic_year_id=public.academic_resolve_operational_year_id(ae.school_id,now())
    and ae.starts_on<=current_date and (ae.ends_on is null or ae.ends_on>=current_date)
    and exists(select 1 from public.school_members a where a.school_id=ae.school_id and a.status='active' and a.role_in_school='school_admin')
  group by ae.school_id,ae.academic_year_id,ae.grade_level
  having count(distinct ae.student_id)>1 order by count(distinct ae.student_id) desc limit 1;
  if v_school is null then raise exception 'Fixture requires active school, administrator and two enrolled students'; end if;
  select id into v_map from public.academic_subjects where is_active order by id limit 1;
  select user_id into v_admin from public.school_members where school_id=v_school and status='active' and role_in_school='school_admin' order by id limit 1;
  select ae.student_id into v_s1 from public.student_academic_enrolments ae join public.users u on u.id=ae.student_id and u.school_id=v_school
    where ae.school_id=v_school and ae.academic_year_id=v_year and ae.grade_level=v_grade order by ae.student_id limit 1;
  select ae.student_id into v_s2 from public.student_academic_enrolments ae join public.users u on u.id=ae.student_id and u.school_id=v_school
    where ae.school_id=v_school and ae.academic_year_id=v_year and ae.grade_level=v_grade and ae.student_id<>v_s1 order by ae.student_id limit 1;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);

  v_name:='Placement regression '||gen_random_uuid();

  -- 1. Selective subject with one student; no groups yet → placement reports zero groups.
  v_result:=public.rpc_school_admin_save_school_subject(v_school,v_name,null,null,v_map,v_year,v_grade,null,'selected',array[v_s1]);
  if not coalesce((v_result->>'success')::boolean,false) then raise exception 'TEST_FAILURE: initial save failed %',v_result; end if;
  v_subject:=(v_result->>'schoolSubjectId')::uuid; v_offering:=(v_result->>'offeringId')::uuid;
  v_placement:=v_result->'placement';
  if (v_placement->>'customGroupCount')::int<>0 or (v_placement->>'placedCount')::int<>0 then raise exception 'TEST_FAILURE: unexpected placement without groups %',v_placement; end if;
  update public.school_subject_offerings set delivery_mode='custom_groups' where id=v_offering;

  -- 2. First custom group seeds from the selected roster.
  v_group:=public.rpc_school_admin_save_subject_group(v_school,v_offering,'Grade '||v_grade||' Placement','custom');
  if not exists(select 1 from public.school_subject_group_students where group_id=v_group and student_id=v_s1 and status='active') then raise exception 'TEST_FAILURE: first group did not seed selected student'; end if;

  -- 3. Adding a student in the Subjects editor places them in the sole custom group.
  v_result:=public.rpc_school_admin_save_school_subject(v_school,v_name,v_subject,null,v_map,v_year,v_grade,null,'selected',array[v_s1,v_s2]);
  v_placement:=v_result->'placement';
  if (v_placement->>'placedCount')::int<>1 or (v_placement->>'unplacedCount')::int<>0 or (v_placement->>'placedGroupId')::uuid<>v_group then
    raise exception 'TEST_FAILURE: sole-group auto placement %',v_placement; end if;
  if not exists(select 1 from public.school_subject_group_students where group_id=v_group and student_id=v_s2 and status='active') then raise exception 'TEST_FAILURE: s2 not placed'; end if;
  select count(*) into v_count from jsonb_array_elements(public.rpc_school_admin_offering_placement(v_school,v_offering)->'unplaced');
  if v_count<>0 then raise exception 'TEST_FAILURE: placement overview reports % unplaced after auto placement',v_count; end if;

  -- 4. Deselecting a student withdraws their group membership too.
  v_result:=public.rpc_school_admin_save_school_subject(v_school,v_name,v_subject,null,v_map,v_year,v_grade,null,'selected',array[v_s1]);
  if exists(select 1 from public.school_subject_group_students where group_id=v_group and student_id=v_s2 and status='active') then raise exception 'TEST_FAILURE: deselected student lingered on roster'; end if;

  -- 5. Near-duplicate custom group names are refused unless explicitly allowed.
  begin
    perform public.rpc_school_admin_save_subject_group(v_school,v_offering,v_grade||' placement','custom');
    raise exception 'TEST_FAILURE: near-duplicate group accepted';
  exception when others then
    if sqlerrm like 'TEST_FAILURE:%' then raise; end if;
    if sqlerrm<>'similar_custom_group_exists' then raise; end if;
  end;
  if private.subject_group_name_key('Grade 7 ESL')<>private.subject_group_name_key('7 ESL')
     or private.subject_group_name_key('G7 ESL')<>private.subject_group_name_key('ESL grade 7')
     or private.subject_group_name_key('Grade 7 ESL')=private.subject_group_name_key('Grade 8 ESL') then
    raise exception 'TEST_FAILURE: group name key normalisation'; end if;
  v_group2:=public.rpc_school_admin_save_subject_group(v_school,v_offering,v_grade||' placement','custom',null,null,true);
  if v_group2 is null then raise exception 'TEST_FAILURE: explicit duplicate allowance failed'; end if;

  -- 6. With two custom groups the editor does not guess; the gap is reported and listed.
  v_result:=public.rpc_school_admin_save_school_subject(v_school,v_name,v_subject,null,v_map,v_year,v_grade,null,'selected',array[v_s1,v_s2]);
  v_placement:=v_result->'placement';
  if (v_placement->>'customGroupCount')::int<>2 or (v_placement->>'placedCount')::int<>0 or (v_placement->>'unplacedCount')::int<>1 then
    raise exception 'TEST_FAILURE: multi-group placement should not guess %',v_placement; end if;
  v_result:=public.rpc_school_admin_offering_placement(v_school,v_offering);
  if not exists(select 1 from jsonb_array_elements(v_result->'unplaced') e where (e->>'studentId')::uuid=v_s2) then raise exception 'TEST_FAILURE: unplaced list missing s2 %',v_result; end if;
  if jsonb_array_length(v_result->'customGroups')<>2 then raise exception 'TEST_FAILURE: customGroups count %',v_result; end if;

  -- 7. Explicit roster save clears the gap.
  perform public.rpc_school_admin_set_subject_group_students(v_school,v_group,array[v_s1,v_s2]);
  select count(*) into v_count from jsonb_array_elements(public.rpc_school_admin_offering_placement(v_school,v_offering)->'unplaced');
  if v_count<>0 then raise exception 'TEST_FAILURE: gap not cleared by roster save'; end if;

  raise notice 'subject_group_placement: all checks passed';
end $$;
