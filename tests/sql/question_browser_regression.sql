-- Run after the bounded browser migration. All checks are read-only and rolled back.
begin;
do $test$
declare
  v_actor uuid; v_school uuid; v_student uuid; v_page jsonb; v_cursor jsonb;
  v_seen uuid[] := '{}'::uuid[]; v_ids uuid[]; v_expected integer; v_count integer;
  v_keyword text; v_facets jsonb; v_calendar jsonb; v_steps integer:=0;
begin
  select u.id,u.school_id into v_actor,v_school from public.users u where u.username='jess.bishkek';
  if v_actor is null then raise exception 'allocated_teacher_fixture_required'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  v_facets:=public.rpc_teacher_question_facets(null,null);
  select sum((value->>'count')::integer) into v_expected from jsonb_array_elements(v_facets);
  loop
    v_page:=public.rpc_teacher_question_browser(jsonb_build_object('limit',60,'cursor',v_cursor,'metadata',false));
    select array_agg((value->>'id')::uuid) into v_ids from jsonb_array_elements(v_page->'questions');
    if coalesce(cardinality(v_ids),0)>60 or coalesce(v_seen&&v_ids,false) then raise exception 'invalid_or_duplicate_page'; end if;
    v_seen:=v_seen||coalesce(v_ids,'{}'::uuid[]); v_steps:=v_steps+1;
    exit when not (v_page->>'hasMore')::boolean;
    v_cursor:=v_page->'nextCursor';
    if v_cursor is null or v_steps>100 then raise exception 'non_terminating_cursor'; end if;
  end loop;
  if cardinality(v_seen)<>v_expected then raise exception 'pagination_dropped_questions: % vs %',cardinality(v_seen),v_expected; end if;
  select count(*) into v_count from public.questions q where q.id=any(v_seen) and q.subject='Economics';
  if v_count<>240 then raise exception 'economics_access_regressed: %',v_count; end if;
  v_page:=public.rpc_teacher_question_browser('{"subject":"Economics","limit":10000,"metadata":false}');
  if jsonb_array_length(v_page->'questions')<>100 then raise exception 'page_bound_not_enforced'; end if;
  if exists(select 1 from jsonb_array_elements(v_page->'questions') q where q->>'subject'<>'Economics') then raise exception 'subject_filter_failed'; end if;
  v_page:=public.rpc_teacher_question_browser('{"search":"no-such-question-98adb","metadata":false}');
  if jsonb_array_length(v_page->'questions')<>0 then raise exception 'search_filter_failed'; end if;
  select focus.name into v_keyword from public.verified_question_registry_taxonomy tx
    join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id
    where tx.question_id=any(v_seen) and tx.review_status='approved' and not tx.human_review_required limit 1;
  if v_keyword is null then raise exception 'registry_search_fixture_required'; end if;
  v_page:=public.rpc_teacher_question_browser(jsonb_build_object('search',v_keyword));
  if jsonb_array_length(v_page->'questions')=0 then raise exception 'registry_search_regressed'; end if;
  v_facets:=public.rpc_teacher_question_facets(v_keyword,null);
  if jsonb_array_length(v_facets)=0 then raise exception 'registry_search_facets_regressed'; end if;
  v_calendar:=public.rpc_school_report_calendar(v_school);
  if v_calendar ? 'electiveEnrolments' or v_calendar ? 'frameworks' or not v_calendar ? 'years' then raise exception 'calendar_scope_failed'; end if;
  begin
    perform public.rpc_school_report_calendar('760dd3e4-f5a0-490a-8445-4bf04e59484a');
    raise exception 'cross_school_calendar_leak';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rpc_school_admin_academic_setup(v_school);
    raise exception 'teacher_gained_admin_setup_access';
  exception when insufficient_privilege then null; end;
  select e.student_id into v_student from public.student_academic_enrolments e
    join public.school_academic_years y on y.id=e.academic_year_id and y.status='current'
    where e.school_id=v_school and current_date between e.starts_on and coalesce(e.ends_on,current_date)
      and not exists(select 1 from public.teachers t where t.user_id=e.student_id) limit 1;
  if v_student is null then raise exception 'student_fixture_required'; end if;
  perform set_config('request.jwt.claim.sub',v_student::text,true);
  begin perform public.rpc_teacher_question_browser('{}'); raise exception 'student_teacher_bank_leak';
  exception when insufficient_privilege then null; end;
  begin perform public.rpc_school_report_calendar(v_school); raise exception 'student_staff_calendar_leak';
  exception when insufficient_privilege then null; end;
  v_page:=public.rpc_student_question_browser('{"limit":10000}');
  v_facets:=public.rpc_student_question_summary(null);
  select coalesce(sum((value->>'count')::integer),0) into v_count from jsonb_array_elements(v_facets);
  if v_count<jsonb_array_length(v_page->'questions') then raise exception 'student_summary_count_regressed'; end if;
  perform public.rpc_student_question_summary('no-such-question-98adb');
  if jsonb_array_length(v_page->'questions')>100 then raise exception 'student_page_bound_failed'; end if;
  if exists(select 1 from jsonb_array_elements(v_page->'questions') q where q->>'pool_scope'='teacher') then raise exception 'student_private_pool_leak'; end if;
  if has_function_privilege('anon','public.rpc_teacher_question_browser(jsonb)','execute')
    or has_function_privilege('anon','public.rpc_student_question_browser(jsonb)','execute')
    or has_function_privilege('anon','public.rpc_school_report_calendar(uuid)','execute') then raise exception 'anonymous_execute_leak'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.rpc_student_question_browser('{}'); raise exception 'anonymous_student_bank_leak';
  exception when insufficient_privilege then null; end;
end;
$test$;
select 'PASS: pagination, complete counts, Economics, filters, calendar and tenant/role isolation' verification;
rollback;
