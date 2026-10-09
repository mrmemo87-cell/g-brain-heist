-- Bible 1.7.0. IELTS module reuses canonical report snapshots/events/source hashes.
-- No assessment writes, band conversion, automatic longitudinal inference or content release.
create table private.ielts_learning_plans (
 id uuid primary key, school_id uuid not null references public.schools(id),
 student_id uuid not null references public.users(id), author_id uuid not null references public.users(id),
 previous_id uuid references private.ielts_learning_plans(id), version integer not null,
 fields jsonb not null, source_snapshot jsonb not null, created_at timestamptz not null default now(),
 unique(school_id,student_id,version)
);
create index ielts_plans_student_history on private.ielts_learning_plans(school_id,student_id,created_at desc);
alter table private.ielts_learning_plans enable row level security;
revoke all on private.ielts_learning_plans from public,anon,authenticated,service_role;
create trigger ielts_plan_append_only before update or delete on private.ielts_learning_plans
 for each row execute function private.academic_report_records_are_append_only();

alter table public.academic_report_source_snapshots drop constraint academic_report_source_snapshots_source_type_check;
alter table public.academic_report_source_snapshots add constraint academic_report_source_snapshots_source_type_check check(source_type in
 ('observation','confidence_projection','coverage_projection','intervention','ielts_score','ielts_writing','ielts_speaking','ielts_practice','ielts_school_practice','ielts_plan'));

create function private.ielts_report_staff(p_school uuid,p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.users actor where actor.id=auth.uid() and not coalesce(actor.is_banned,true))
 and public.school_has_module_access(p_school,'ielts')
 and exists(select 1 from public.users u join public.school_members m on m.user_id=u.id and m.school_id=p_school and m.status='active'
 where u.id=p_student and u.school_id=p_school and u.role='student' and not coalesce(u.is_banned,true) and private.ielts_speaking_student_eligible(u.id))
 and (public.can_manage_ielts_practice_school(p_school) or private.can_review_ielts_speaking_student(p_student));
$$;
revoke all on function private.ielts_report_staff(uuid,uuid) from public,anon,authenticated,service_role;

-- Exact source values as known by cutoff; whitelist prevents keys/audio/private drafts leaking.
-- The caller gates access before invoking this private projection. One run/review per instance.
create function private.ielts_report_evidence(p_school uuid,p_student uuid,p_cutoff timestamptz,p_work_through timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; work_through timestamptz:=least(p_cutoff,coalesce(p_work_through,p_cutoff));
begin
 with objective as (
 select jsonb_build_object('source_type','ielts_score','source_id',r.id,'instance_id',e.attempt_id,'skill',e.form_snapshot#>>'{items,0,skill}',
 'occurred_at',r.created_at,'kind','screener','raw_score',r.raw_score,'total',r.marks_possible,
 'version',e.form_snapshot#>>'{version,version}','test_type',e.form_snapshot#>>'{version,test_type}',
 'policy',r.scoring_policy_version,'confidence','low','conditions',r.integrity_state,
 'taxonomy_version',e.form_snapshot#>>'{version,taxonomy_version_id}',
 'item_observations',coalesce((select jsonb_agg(jsonb_build_object('item',i->>'order_index','construct',i#>>'{taxonomy,name}',
 'response_state',o->>'response_state','marks_awarded',o->'marks_awarded','marks_possible',o->'marks_possible') order by (i->>'order_index')::integer)
 from jsonb_array_elements(r.outcomes) o join jsonb_array_elements(e.form_snapshot->'items') i on i->>'item_key'=o->>'item_key' and i->>'skill'=o->>'skill'),'[]'),
 'exposure',case when exists(select 1 from private.ielts_diagnostic_attempt_evidence earlier where earlier.student_id=e.student_id and earlier.version_id=e.version_id and earlier.started_at<e.started_at) then 'same_form_practice' else 'exposure_not_confirmed' end,
 'route','/ielts/screener-result/'||e.attempt_id::text,
 'snapshot_hash',encode(extensions.digest(convert_to(to_jsonb(r)::text||e.form_snapshot::text||e.delivery_metadata::text,'UTF8'),'sha256'),'hex')) item
 from private.ielts_diagnostic_attempt_evidence e
 join lateral(select x.* from private.ielts_diagnostic_scoring_runs x where x.attempt_id=e.attempt_id and x.server_verified and x.created_at<=p_cutoff order by x.run_version desc,x.id limit 1) r on true
 where e.school_id=p_school and e.student_id=p_student and e.started_at<=p_cutoff
 and exists(select 1 from public.ielts_exam_attempts a where a.id=e.attempt_id and a.status='submitted' and a.submitted_at<=work_through)
 and e.form_snapshot#>>'{version,mode}'='screener'
 and e.form_snapshot#>>'{items,0,skill}' in ('listening','reading')
 and not exists(select 1 from jsonb_array_elements(e.form_snapshot->'items') q where q->>'skill' is distinct from e.form_snapshot#>>'{items,0,skill}')
 ), writing as (
 select jsonb_build_object('source_type','ielts_writing','source_id',w.attempt_id,'instance_id',w.attempt_id,'skill','writing',
 'occurred_at',w.submitted_at,'kind','screener','word_count',w.word_count,'exposure',w.evidence_kind,
 'version',e.form_snapshot#>>'{version,version}','test_type',e.form_snapshot#>>'{version,test_type}',
 'review_id',r.id,'reviewed_at',r.reviewed_at,'reviewer',u.username,'next_step',r.next_step,
 'observations',case when r.id is null then null else (select jsonb_object_agg(k,jsonb_build_object('status',v->>'status','comment',v->>'comment')) from jsonb_each(r.criterion_observations) x(k,v)) end,
 'confidence','low','route','/ielts/writing-screener/reviews/'||w.attempt_id::text,
 'snapshot_hash',encode(extensions.digest(convert_to(to_jsonb(w)::text||coalesce(to_jsonb(r)::text,'')||e.form_snapshot::text,'UTF8'),'sha256'),'hex')) item
 from private.ielts_diagnostic_attempt_evidence e join private.ielts_writing_screener_submissions w on w.attempt_id=e.attempt_id
 left join lateral(select x.* from private.ielts_writing_screener_reviews x where x.attempt_id=w.attempt_id and x.response_sha256=w.response_sha256 and x.reviewed_at<=p_cutoff order by x.run_version desc,x.id limit 1) r on true
 left join public.users u on u.id=r.reviewed_by
 where e.school_id=p_school and e.student_id=p_student and w.submitted_at<=work_through
 and exists(select 1 from public.ielts_exam_attempts a where a.id=e.attempt_id and a.status='submitted')
 ), speaking as (
 select jsonb_build_object('source_type','ielts_speaking','source_id',s.id,'instance_id',s.id,'skill','speaking',
 'occurred_at',s.submitted_at,'kind','screener','exposure',s.evidence_kind,'version',s.package_code,
 'review_id',r.id,'reviewed_at',r.reviewed_at,'reviewer',u.username,'next_step',r.fields->>'next_step',
 'observations',case when r.id is null then null else (select jsonb_object_agg(k,jsonb_build_object('status',v->>'status','comment',v->>'comment')) from jsonb_each(r.fields->'observations') x(k,v)) end,
 'confidence','low','route','/ielts/speaking-pilot/'||s.id::text,
 'snapshot_hash',encode(extensions.digest(convert_to(to_jsonb(s)::text||coalesce(to_jsonb(r)::text,''),'UTF8'),'sha256'),'hex')) item
 from private.ielts_speaking_sessions s
 left join lateral(select x.* from private.ielts_speaking_reviews x where x.session_id=s.id and x.teacher_confirmed and x.reviewed_at<=p_cutoff order by x.reviewed_at desc,x.id limit 1) r on true
 left join public.users u on u.id=r.reviewer_id
 where s.school_id=p_school and s.student_id=p_student and s.status='submitted' and s.submitted_at<=work_through
 ), practice as (
 select jsonb_build_object('source_type','ielts_practice','source_id',a.id,'instance_id',a.id,'skill',t.skill,
 'occurred_at',a.created_at,'submitted_at',case when a.submitted_at<=p_cutoff then a.submitted_at else null end,
 'kind','guided_practice','title',t.title,'version',t.version,'purpose',t.purpose,
 'review_id',r.id,'reviewed_at',r.reviewed_at,'reviewer',u.username,'feedback',r.feedback,
 'status',case when a.updated_at<=p_cutoff then a.status else 'historical_status_unavailable' end,
 'route','/ielts/practice/targeted/'||a.id::text,'confidence','not_assessment',
 'snapshot_hash',encode(extensions.digest(convert_to(jsonb_build_object('id',a.id,'task',a.task_code,'created',a.created_at,'submitted',case when a.submitted_at<=p_cutoff then a.submitted_at else null end,'status',case when a.updated_at<=p_cutoff then a.status else 'historical_status_unavailable' end,'review',to_jsonb(r),'version',t.version,'content_hash',t.content_sha256)::text,'UTF8'),'sha256'),'hex')) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code
 left join lateral(select x.* from private.ielts_learning_reviews x where x.allocation_id=a.id and x.reviewed_at<=p_cutoff order by x.reviewed_at desc,x.id limit 1) r on true
 left join public.users u on u.id=r.reviewer_id
 where a.school_id=p_school and a.student_id=p_student and a.created_at<=work_through
 ), school_practice as (
 select jsonb_build_object('source_type','ielts_school_practice','source_id',i.id,'instance_id',a.id,'skill',i.skill,
 'occurred_at',s.created_at,'kind','guided_practice','title',coalesce(i.title,'School practice'),
 'version',null,'status',case when s.updated_at>p_cutoff or p.updated_at>p_cutoff or a.updated_at>p_cutoff then 'historical_status_unavailable' else coalesce(p.status,'assigned') end,
 'submitted_at',case when p.submitted_at<=p_cutoff then p.submitted_at else null end,
 'feedback_availability','not_tracked','confidence','not_assessment','route','/ielts/practice/assigned',
 'staff_route','/ielts/programme?school='||p_school::text||'&programmeSection=practice',
 'snapshot_hash',encode(extensions.digest(convert_to(jsonb_build_object('item',i.id,'type',i.content_type,'content',i.content_id,'title',i.title,'assigned',s.created_at,
 'status',case when s.updated_at>p_cutoff or p.updated_at>p_cutoff or a.updated_at>p_cutoff then 'historical_status_unavailable' else coalesce(p.status,'assigned') end,
 'submitted',case when p.submitted_at<=p_cutoff then p.submitted_at else null end)::text,'UTF8'),'sha256'),'hex')) item
 from public.ielts_practice_assignments a join public.ielts_practice_assignment_students s on s.assignment_id=a.id
 join public.ielts_practice_assignment_items i on i.assignment_id=a.id
 left join public.ielts_practice_assignment_item_students p on p.assignment_id=a.id and p.assignment_item_id=i.id and p.student_id=s.student_id
 where a.school_id=p_school and s.student_id=p_student and s.created_at<=work_through and i.created_at<=work_through
 ), all_sources as(select item from objective union all select item from writing union all select item from speaking union all select item from practice union all select item from school_practice),
 bounded as(select item from all_sources order by item->>'occurred_at',item->>'source_id' limit 201)
 select coalesce(jsonb_agg(item order by item->>'occurred_at',item->>'source_id'),'[]') into result from bounded;
 if jsonb_array_length(result)>200 then raise exception 'report_evidence_limit_use_shorter_scope'; end if;
 return result;
end; $$;
revoke all on function private.ielts_report_evidence(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Teacher-entered plan fields are educational decisions, never automatic attainment states.
create function private.validate_ielts_plan(p_fields jsonb,p_sources jsonb) returns void
language plpgsql set search_path='' as $$
declare sk text; v jsonb; g jsonb; ref jsonb;
begin
 if jsonb_typeof(p_fields) is distinct from 'object' or length(p_fields::text)>20000
 or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('study_goal','next_action','review_on','skills','goals'))
 or length(trim(coalesce(p_fields->>'study_goal',''))) not between 5 and 500
 or length(trim(coalesce(p_fields->>'next_action',''))) not between 5 and 800
 or (p_fields->>'review_on') is null or (p_fields->>'review_on')::date not between current_date and current_date+180
 or jsonb_typeof(p_fields->'skills') is distinct from 'object'
 or (select count(*) from jsonb_object_keys(p_fields->'skills'))<>4
 or jsonb_typeof(p_fields->'goals') is distinct from 'array' or jsonb_array_length(p_fields->'goals') not between 1 and 3 then raise exception 'invalid_plan'; end if;
 foreach sk in array array['listening','reading','writing','speaking'] loop
 v:=p_fields->'skills'->sk;
 if v is null or jsonb_typeof(v) is distinct from 'object' or coalesce(v->>'pathway','') not in ('foundation','exam_preparation','more_evidence')
 or length(trim(coalesce(v->>'rationale',''))) not between 5 and 800 or jsonb_typeof(v->'sources') is distinct from 'array'
 or exists(select 1 from jsonb_object_keys(v) k where k not in ('pathway','rationale','sources')) then raise exception 'invalid_skill_plan'; end if;
 if v->>'pathway'<>'more_evidence' and jsonb_array_length(v->'sources')=0 then raise exception 'pathway_evidence_required'; end if;
 for ref in select value from jsonb_array_elements(v->'sources') loop
 if not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'source_id'=ref#>>'{}' and e->>'skill'=sk) then raise exception 'invalid_source_reference'; end if;
 end loop;
 end loop;
 for g in select value from jsonb_array_elements(p_fields->'goals') loop
 if jsonb_typeof(g) is distinct from 'object' or coalesce(g->>'skill','') not in ('listening','reading','writing','speaking')
 or length(trim(coalesce(g->>'action',''))) not between 5 and 500
 or length(trim(coalesce(g->>'success',''))) not between 5 and 500
 or length(trim(coalesce(g->>'check',''))) not between 5 and 500
 or exists(select 1 from jsonb_object_keys(g) k where k not in ('skill','action','success','check')) then raise exception 'invalid_goal'; end if;
 end loop;
end; $$;
revoke all on function private.validate_ielts_plan(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.rpc_ielts_save_learning_plan(p_school uuid,p_student uuid,p_fields jsonb,p_expected uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prev private.ielts_learning_plans; existing private.ielts_learning_plans; sources jsonb;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_request is null then raise exception 'request_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-plan:'||p_school||':'||p_student,0));
 select * into existing from private.ielts_learning_plans where id=p_request;
 if found then
 if (existing.school_id,existing.student_id,existing.author_id,existing.fields,existing.previous_id) is distinct from (p_school,p_student,auth.uid(),p_fields,p_expected) then raise exception 'request_conflict'; end if;
 return jsonb_build_object('id',existing.id,'version',existing.version);
 end if;
 select * into prev from private.ielts_learning_plans where school_id=p_school and student_id=p_student order by version desc limit 1;
 if prev.id is distinct from p_expected then raise exception 'plan_changed_reload'; end if;
 sources:=private.ielts_report_evidence(p_school,p_student,now());
 perform private.validate_ielts_plan(p_fields,sources);
 insert into private.ielts_learning_plans(id,school_id,student_id,author_id,previous_id,version,fields,source_snapshot)
 values(p_request,p_school,p_student,auth.uid(),prev.id,coalesce(prev.version,0)+1,p_fields,sources);
 return jsonb_build_object('id',p_request,'version',coalesce(prev.version,0)+1);
end; $$;
revoke all on function public.rpc_ielts_save_learning_plan(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_save_learning_plan(uuid,uuid,jsonb,uuid,uuid) to authenticated;

create function public.rpc_ielts_learning_report_context(p_school uuid default null,p_student uuid default null) returns jsonb
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

create function public.rpc_ielts_generate_monthly_report(p_school uuid,p_student uuid,p_year uuid,p_start date,p_end date,p_cutoff timestamptz,p_plan uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare y public.school_academic_years; l private.ielts_learning_plans; sources jsonb; payload jsonb; source_hash text; v_payload_hash text;
 scope text; previous uuid; version integer; report uuid; existing public.academic_report_snapshots; cutoff timestamptz;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into y from public.school_academic_years where id=p_year and school_id=p_school;
 -- Period is a course month (up to 35 days), explicitly uses Asia/Bishkek dates.
 cutoff:=p_cutoff;
 if y.id is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>34 or p_start<y.starts_on or p_end>y.ends_on
 or cutoff is null or cutoff>now() or cutoff<(p_start::timestamp at time zone 'Asia/Bishkek') then raise exception 'invalid_report_period'; end if;
 select * into l from private.ielts_learning_plans where school_id=p_school and student_id=p_student and created_at<=cutoff order by version desc limit 1;
 if l.id is null or l.id is distinct from p_plan then raise exception 'plan_required_or_changed'; end if;
 sources:=private.ielts_report_evidence(p_school,p_student,cutoff,((p_end+1)::timestamp at time zone 'Asia/Bishkek'));
 if exists(select 1 from jsonb_each(l.fields->'skills') skill, jsonb_array_elements(skill.value->'sources') ref where not exists(select 1 from jsonb_array_elements(sources) e where e->>'source_id'=ref#>>'{}')) then raise exception 'plan_source_changed_review'; end if;
 -- Include earlier dated baseline references but count only in-period work as activity.
 source_hash:=encode(extensions.digest(convert_to(sources::text||to_jsonb(l)::text,'UTF8'),'sha256'),'hex');
 payload:=jsonb_build_object('schemaVersion','ielts-monthly-report-v1','bibleVersion','1.7.0','policyVersion','ielts-learning-plan-v1',
 'student',jsonb_build_object('id',p_student,'name',(select username from public.users where id=p_student)),
 'school',jsonb_build_object('id',p_school,'name',(select name from public.schools where id=p_school)),
 'period',jsonb_build_object('start',p_start,'end',p_end,'cutoff',cutoff,'timezone','Asia/Bishkek','interim',cutoff<((p_end+1)::timestamp at time zone 'Asia/Bishkek')),
 'plan',jsonb_build_object('id',l.id,'version',l.version,'fields',l.fields,'author',(select username from public.users where id=l.author_id),'created_at',l.created_at),
 'evidence',sources,'confidence','low','progress','improvement_not_yet_established',
 'limitations',jsonb_build_array('Short checks show a starting point, not a full IELTS band.','Practice completion does not prove improvement.','Fresh comparable checks and approved progress policies are needed to establish change.','Legacy school practice records show participation only; exact material versions and feedback may be unavailable.'));
 v_payload_hash:=encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');
 scope:='ielts-monthly:'||p_student||':'||p_year||':'||p_start||':'||p_end;
 perform pg_advisory_xact_lock(hashtextextended(scope,0));
 select * into existing from public.academic_report_snapshots r where r.school_id=p_school and r.scope_key=scope and r.audience='student' and r.payload_hash=v_payload_hash order by report_version desc limit 1;
 if found then return jsonb_build_object('id',existing.id,'version',existing.report_version,'reused',true); end if;
 select r.id,r.report_version into previous,version from public.academic_report_snapshots r where r.school_id=p_school and r.scope_key=scope and r.audience='student' order by report_version desc limit 1;
 report:=gen_random_uuid();version:=coalesce(version,0)+1;
 insert into public.academic_report_snapshots(id,school_id,report_type,audience,status,report_version,supersedes_report_id,academic_year_id,student_id,scope_key,period_start,period_end,evidence_cutoff_at,source_snapshot_hash,payload_hash,report_payload,generated_by)
 values(report,p_school,'student','student','draft',version,previous,p_year,p_student,scope,p_start,p_end,cutoff,source_hash,v_payload_hash,payload,auth.uid());
 insert into public.academic_report_source_snapshots(report_id,source_type,source_id,source_snapshot_hash)
 select report,e->>'source_type',(e->>'source_id')::uuid,e->>'snapshot_hash' from jsonb_array_elements(sources) e;
 insert into public.academic_report_source_snapshots(report_id,source_type,source_id,source_snapshot_hash) values(report,'ielts_plan',l.id,encode(extensions.digest(convert_to(to_jsonb(l)::text,'UTF8'),'sha256'),'hex'));
 insert into public.academic_report_events(report_id,actor_user_id,event_type,event_data) values(report,auth.uid(),'generated',jsonb_build_object('module','ielts','bible','1.7.0'));
 return jsonb_build_object('id',report,'version',version,'reused',false);
end; $$;
revoke all on function public.rpc_ielts_generate_monthly_report(uuid,uuid,uuid,date,date,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_generate_monthly_report(uuid,uuid,uuid,date,date,timestamptz,uuid) to authenticated;

create function public.rpc_ielts_monthly_report(p_report uuid,p_finalize boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.academic_report_snapshots; staff boolean;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into r from public.academic_report_snapshots where id=p_report for update;
 if r.id is null or r.report_payload->>'schemaVersion' is distinct from 'ielts-monthly-report-v1' then raise exception using errcode='42501',message='not_authorized'; end if;
 staff:=private.ielts_report_staff(r.school_id,r.student_id);
 if not staff and not coalesce((not coalesce(p_finalize,false) and auth.uid()=r.student_id and r.status='final' and r.audience='student' and private.ielts_speaking_student_eligible(auth.uid()) and exists(select 1 from public.school_members where school_id=r.school_id and user_id=auth.uid() and status='active')),false) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_finalize and r.status='draft' then
 -- Do not finalise a superseded draft or a plan changed since snapshot creation.
 if exists(select 1 from public.academic_report_snapshots x where x.school_id=r.school_id and x.scope_key=r.scope_key and x.audience=r.audience and x.report_version>r.report_version)
 or r.report_payload->'evidence' is distinct from private.ielts_report_evidence(r.school_id,r.student_id,r.evidence_cutoff_at,((r.period_end+1)::timestamp at time zone 'Asia/Bishkek'))
 or (select id::text from private.ielts_learning_plans where school_id=r.school_id and student_id=r.student_id order by version desc limit 1) is distinct from r.report_payload#>>'{plan,id}' then raise exception 'report_changed_regenerate'; end if;
 update public.academic_report_snapshots set status='final',finalized_by=auth.uid(),finalized_at=now() where id=r.id returning * into r;
 insert into public.academic_report_events(report_id,actor_user_id,event_type,event_data) values(r.id,auth.uid(),'finalized',jsonb_build_object('module','ielts','payloadHash',r.payload_hash));
 end if;
 return jsonb_build_object('id',r.id,'version',r.report_version,'status',r.status,'generated_at',r.generated_at,'finalized_at',r.finalized_at,
 'finalized_by',(select username from public.users where id=r.finalized_by),'payload_hash',r.payload_hash,'payload',r.report_payload);
end; $$;
revoke all on function public.rpc_ielts_monthly_report(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_monthly_report(uuid,boolean) to authenticated;
do $patch$ declare fname text; definition text; anchor text; begin
 foreach fname in array array['rpc_get_academic_report_snapshot','rpc_finalize_academic_report_snapshot'] loop
 select pg_get_functiondef(p.oid) into definition from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fname;
 anchor := 'if not found then raise exception ''Academic report not found''; end if;';
 if definition is null or position(anchor in definition)=0 then raise exception 'academic_report_patch_anchor_missing'; end if;
 execute replace(definition,anchor,anchor||E'\n  if v_report.report_payload->>''schemaVersion''=''ielts-monthly-report-v1'' then raise exception ''use_ielts_report_workflow''; end if;');
 end loop;
end $patch$;
create function public.rpc_ielts_report_correction(p_report uuid,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.academic_report_snapshots; request_id uuid;
begin
 perform public.rpc_ielts_monthly_report(p_report,false);
 select * into r from public.academic_report_snapshots where id=p_report;
 if r.status<>'final' or length(trim(coalesce(p_detail,''))) not between 20 and 2000 then raise exception 'invalid_correction'; end if;
 insert into public.academic_report_correction_requests(school_id,report_id,reason_code,detail,requested_by)
 values(r.school_id,r.id,'interpretation_concern',trim(p_detail),auth.uid()) returning id into request_id;
 insert into public.academic_report_correction_events(correction_request_id,school_id,event_type,rationale,actor_user_id)
 values(request_id,r.school_id,'submitted','IELTS report correction requested; original version preserved.',auth.uid());
 return jsonb_build_object('id',request_id);
end; $$;
revoke all on function public.rpc_ielts_report_correction(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_report_correction(uuid,text) to authenticated;
notify pgrst,'reload schema';
