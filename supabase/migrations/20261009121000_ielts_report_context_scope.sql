-- Avoid ambiguity with the legacy users.school column.
create or replace function public.rpc_ielts_learning_report_context(p_school uuid default null,p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=coalesce(p_student,auth.uid()); v_school uuid; staff boolean; plan jsonb; reports jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select school_id into v_school from public.users where id=sid;
 if p_school is not null and v_school is distinct from p_school then raise exception using errcode='42501',message='not_authorized'; end if;
 staff:=private.ielts_report_staff(v_school,sid);
 if not staff and not coalesce((sid=auth.uid() and private.ielts_speaking_student_eligible(sid) and exists(select 1 from public.school_members where school_id=v_school and user_id=sid and status='active')),false) then raise exception using errcode='42501',message='not_authorized'; end if;
 select jsonb_build_object('id',l.id,'version',l.version,'fields',l.fields,'created_at',l.created_at,'author',u.username) into plan
 from private.ielts_learning_plans l join public.users u on u.id=l.author_id where l.school_id=v_school and l.student_id=sid order by l.version desc limit 1;
 select coalesce(jsonb_agg(x.row order by x.generated_at desc),'[]') into reports from (
 select r.generated_at,jsonb_build_object('id',r.id,'version',r.report_version,'status',r.status,'period_start',r.period_start,'period_end',r.period_end,'finalized_at',r.finalized_at) row
 from public.academic_report_snapshots r where r.school_id=v_school and r.student_id=sid and r.report_payload->>'schemaVersion'='ielts-monthly-report-v1'
 and (staff or (r.status='final' and r.audience='student')) order by r.generated_at desc,r.id limit 20) x;
 return jsonb_build_object('school_id',v_school,'student_id',sid,'student_name',(select username from public.users where id=sid),
 'school_name',(select name from public.schools where id=v_school),'can_manage',staff,'plan',plan,'reports',reports,
 'years',case when staff then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'starts_on',starts_on,'ends_on',ends_on) order by starts_on desc),'[]') from public.school_academic_years where school_id=v_school) else '[]'::jsonb end,
 'evidence',case when staff then private.ielts_report_evidence(v_school,sid,now()) else '[]'::jsonb end);
end; $$;
revoke all on function public.rpc_ielts_learning_report_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_report_context(uuid,uuid) to authenticated;
