-- Run ONLY inside BEGIN / ROLLBACK after the candidate foundation migration.
-- Uses existing active school actors; all test subjects/groups are transient.
-- No notifications, assignments, student placement, or existing allocations mutate.
do $$
declare
  v_school uuid; v_year uuid; v_grade text; v_map uuid; v_teacher uuid; v_admin uuid;
  v_student uuid; v_other_student uuid; v_class uuid; v_other_class uuid;
  v_subject_a uuid; v_subject_b uuid; v_offering_a uuid; v_offering_b uuid;
  v_group_a uuid; v_group_b uuid; v_group_c uuid; v_membership uuid;
  v_other_school uuid; v_count integer; v_before_count bigint;
  v_classes uuid[]; v_can_create boolean;
begin
  select ae.school_id,ae.academic_year_id,ae.grade_level into v_school,v_year,v_grade
  from public.student_academic_enrolments ae
  join public.school_members sm on sm.user_id=ae.student_id and sm.school_id=ae.school_id and sm.status='active' and sm.role_in_school='student'
  join public.class_students cs on cs.student_id=ae.student_id and cs.class_id=ae.class_id
  join public.classes c on c.id=ae.class_id and c.school_id=ae.school_id and coalesce(c.is_active,true) and c.grade_level=ae.grade_level
  join public.users u on u.id=ae.student_id and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now())
  where ae.academic_year_id=public.academic_resolve_operational_year_id(ae.school_id,now())
    and ae.starts_on<=current_date and (ae.ends_on is null or ae.ends_on>=current_date)
    and exists(select 1 from public.school_members t where t.school_id=ae.school_id and t.status='active' and (t.can_teach or t.role_in_school='teacher'))
    and exists(select 1 from public.school_members a where a.school_id=ae.school_id and a.status='active' and a.role_in_school='school_admin')
  group by ae.school_id,ae.academic_year_id,ae.grade_level
  having count(distinct ae.student_id)>1 order by count(distinct ae.class_id) desc limit 1;
  if v_school is null then raise exception 'Fixture requires active school, administrator, teacher, and two enrolled students'; end if;
  select id into v_map from public.academic_subjects order by id limit 1;
  select user_id into v_teacher from public.school_members where school_id=v_school and status='active' and (can_teach or role_in_school='teacher') order by id limit 1;
  select user_id into v_admin from public.school_members where school_id=v_school and status='active' and role_in_school='school_admin' order by id limit 1;
  select id into v_other_school from public.schools where id<>v_school order by id limit 1;
  select count(*) into v_before_count from public.class_students;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);

  insert into public.school_subjects(school_id,name,is_active,academic_subject_id) values(v_school,'Group regression A '||gen_random_uuid(),true,v_map) returning id into v_subject_a;
  insert into public.school_subjects(school_id,name,is_active,academic_subject_id) values(v_school,'Group regression B '||gen_random_uuid(),true,v_map) returning id into v_subject_b;
  insert into public.school_subject_offerings(school_id,school_subject_id,academic_year_id,grade_level,access_mode,delivery_mode) values(v_school,v_subject_a,v_year,v_grade,'all_grade','by_class') returning id into v_offering_a;
  insert into public.school_subject_offerings(school_id,school_subject_id,academic_year_id,grade_level,access_mode,delivery_mode) values(v_school,v_subject_b,v_year,v_grade,'selected','custom_groups') returning id into v_offering_b;
  select student_id,class_id into v_student,v_class from private.subject_offering_eligible_students(v_offering_a) order by class_id,student_id limit 1;
  select student_id,class_id into v_other_student,v_other_class from private.subject_offering_eligible_students(v_offering_a) where student_id<>v_student order by (class_id<>v_class) desc,student_id limit 1;
  if v_student is null or v_other_student is null then raise exception 'Fixture roster missing'; end if;
  v_group_a:=public.rpc_school_admin_save_subject_group(v_school,v_offering_a,'Registration delivery','class',v_class);
  v_group_b:=public.rpc_school_admin_save_subject_group(v_school,v_offering_b,'Cross-class support','custom');
  perform public.rpc_school_admin_set_subject_group_teacher(v_school,v_group_a,v_teacher);
  perform public.rpc_school_admin_set_subject_group_teacher(v_school,v_group_b,v_teacher);

  -- Selected entitlement is mandatory even with the correct school/year/grade.
  begin
    perform public.rpc_school_admin_set_subject_group_students(v_school,v_group_b,array[v_student]);
    raise exception 'TEST_FAILURE: unselected student admitted';
  exception when others then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; if sqlerrm<>'student_not_eligible_for_subject_group' then raise; end if; end;
  insert into public.school_subject_enrolments(school_id,school_subject_id,academic_year_id,student_id,starts_on)
    values(v_school,v_subject_b,v_year,v_student,current_date),(v_school,v_subject_b,v_year,v_other_student,current_date);
  perform public.rpc_school_admin_set_subject_group_students(v_school,v_group_b,array[v_student,v_other_student]);
  select count(*) into v_count from private.teacher_group_authorized_students(v_teacher,v_group_b);
  if v_count<>2 then raise exception 'TEST_FAILURE: cross-class roster expected 2, got %',v_count; end if;
  if not exists(select 1 from private.subject_group_roster(v_group_a) where student_id=v_student) then raise exception 'TEST_FAILURE: class roster lost student'; end if;
  if v_class<>v_other_class and exists(select 1 from private.subject_group_roster(v_group_a) where student_id=v_other_student) then raise exception 'TEST_FAILURE: class roster leaked other class'; end if;
  if (select count(*) from public.class_students)<>v_before_count then raise exception 'TEST_FAILURE: registration roster changed'; end if;

  -- A roster edit cannot change enrolment, and withdrawn enrolment revokes access.
  update public.school_subject_enrolments set status='withdrawn',ends_on=current_date where school_subject_id=v_subject_b and student_id=v_student;
  if exists(select 1 from private.subject_group_roster(v_group_b) where student_id=v_student) then raise exception 'TEST_FAILURE: withdrawn student retained access'; end if;
  update public.school_subject_enrolments set status='active',ends_on=null where school_subject_id=v_subject_b and student_id=v_student;
  perform public.rpc_school_admin_set_subject_group_students(v_school,v_group_b,array[v_other_student]);
  if not exists(select 1 from public.school_subject_enrolments where school_subject_id=v_subject_b and student_id=v_student and status='active') then raise exception 'TEST_FAILURE: group edit revoked independent entitlement'; end if;

  -- Teacher creation privilege and membership both matter.
  perform public.rpc_school_admin_set_subject_group_teacher(v_school,v_group_b,v_teacher,true,false,true);
  if exists(select 1 from private.teacher_group_authorized_students(v_teacher,v_group_b)) then raise exception 'TEST_FAILURE: read-only teacher can assign'; end if;
  perform public.rpc_school_admin_set_subject_group_teacher(v_school,v_group_b,v_teacher,true,true,true);
  perform set_config('request.jwt.claim.sub',v_teacher::text,true);
  if jsonb_array_length(public.rpc_teacher_teaching_groups(v_school))<>2 then raise exception 'TEST_FAILURE: shared curriculum merged local groups'; end if;
  perform public.rpc_teacher_teaching_group_roster(v_school,v_group_b);

  -- Anonymous and other-school requests are rejected inside the API boundary.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.rpc_teacher_teaching_group_roster(v_school,v_group_b);
    raise exception 'TEST_FAILURE: anonymous roster visible';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  if v_other_school is not null then
    begin
      insert into public.school_subject_groups(school_id,school_subject_offering_id,name,group_type) values(v_other_school,v_offering_b,'Foreign tenant','custom');
      raise exception 'TEST_FAILURE: cross-school group accepted';
    exception when others then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; if sqlerrm<>'subject_offering_not_in_school' then raise; end if; end;
  end if;
  -- Immutable identity prevents moving historical groups into another subject/year.
  begin
    update public.school_subject_groups set school_subject_offering_id=v_offering_a where id=v_group_b;
    raise exception 'TEST_FAILURE: group was reparented';
  exception when others then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; if sqlerrm<>'group_identity_is_immutable_create_replacement' then raise; end if; end;

  -- Unmapping removes only resource capability, not local identity or roster.
  update public.school_subjects set academic_subject_id=null where id=v_subject_b;
  if (private.subject_group_read_model(v_group_b)->>'schoolSubjectId')::uuid<>v_subject_b or not exists(select 1 from private.subject_group_roster(v_group_b)) then raise exception 'TEST_FAILURE: unmapping lost operational identity'; end if;
  -- Changing delivery requires explicit confirmation and preserves archived groups.
  begin
    perform public.rpc_school_admin_set_subject_delivery(v_school,v_offering_b,'whole_grade');
    raise exception 'TEST_FAILURE: delivery changed without confirmation';
  exception when others then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; if sqlerrm<>'confirm_archive_existing_groups' then raise; end if; end;
  perform public.rpc_school_admin_set_subject_delivery(v_school,v_offering_b,'whole_grade',true);
  if not exists(select 1 from public.school_subject_groups where id=v_group_b and status='archived') then raise exception 'TEST_FAILURE: historical group destroyed'; end if;
  if exists(select 1 from public.school_subject_group_teachers where group_id=v_group_b and active) then raise exception 'TEST_FAILURE: archived allocation still active'; end if;
  if exists(select 1 from private.subject_group_roster(v_group_b)) then raise exception 'TEST_FAILURE: archived group exposes roster'; end if;
  v_group_c:=public.rpc_school_admin_save_subject_group(v_school,v_offering_b,'Whole grade elective','whole_grade');
  if (select count(*) from private.subject_group_roster(v_group_c))<>2 then raise exception 'TEST_FAILURE: whole-grade selected entitlement incorrect'; end if;
  perform public.rpc_school_admin_archive_subject_group(v_school,v_group_c);
  if not exists(select 1 from public.school_subject_groups where id=v_group_c) then raise exception 'TEST_FAILURE: archive deleted history'; end if;

  if has_table_privilege('authenticated','public.school_subject_groups','SELECT') or has_table_privilege('anon','public.school_subject_group_students','SELECT') or has_function_privilege('authenticated','private.subject_group_roster(uuid)','EXECUTE') then raise exception 'TEST_FAILURE: unguarded Data API access'; end if;
  if exists(select 1 from pg_class where oid in ('public.school_subject_groups'::regclass,'public.school_subject_group_students'::regclass,'public.school_subject_group_teachers'::regclass) and not relrowsecurity) then raise exception 'TEST_FAILURE: missing RLS'; end if;
  raise notice 'Teaching-group foundation behavioral assertions passed';
end;
$$;
