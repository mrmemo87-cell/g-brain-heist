-- Visual & UX Bible 1.21.0 section 13.13 and Diagnostic Bible 2.7.3 section 15.1: the teacher's IELTS class report.
-- Read-only. For one school, and optionally one class or one course batch, every student the caller may review
-- with every piece of IELTS work they were given: targeted and school practice, screeners, Speaking practice mocks
-- and Speaking interviews, each with its true state and only the scores the platform already governs:
--   * objective practice and screeners (Listening, Reading): raw marks "x of y", never a band (section 9.1);
--   * Speaking: the teacher's confirmed band, labelled (sections 10.8 and 10.12), never an AI estimate;
--   * Writing: review state only.
-- Nothing here is written, scored or added to evidence.
create function public.rpc_ielts_class_report(p_school_id uuid, p_scope text default 'all', p_value text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare students jsonb; classes jsonb; batches jsonb; scope_name text; v_batch uuid; begin
 if auth.uid() is null or p_school_id is null or not public.can_manage_ielts_practice_school(p_school_id)
    or coalesce((select is_banned from public.users where id=auth.uid()),true) then
   raise exception using errcode='42501',message='not_authorized'; end if;
 if coalesce(p_scope,'') not in ('all','class','batch') or length(coalesce(p_value,''))>120
    or (p_scope in ('class','batch') and coalesce(p_value,'')='') then raise exception 'invalid_scope'; end if;
 if p_scope='batch' then
   begin v_batch:=p_value::uuid; exception when others then raise exception 'invalid_scope'; end;
   select b.name into scope_name from private.ielts_course_batches b
    where b.id=v_batch and b.school_id=p_school_id and b.deleted_at is null;
   if scope_name is null then raise exception 'invalid_scope'; end if;
 elsif p_scope='class' then scope_name:=p_value; else scope_name:=null; end if;

 select coalesce(jsonb_agg(c order by c),'[]') into classes from (
  select distinct nullif(trim(u.batch),'') c from public.users u
  where u.role='student' and u.school_id=p_school_id and coalesce(u.is_banned,false)=false
    and nullif(trim(u.batch),'') is not null and private.can_review_ielts_speaking_student(u.id)) q;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id),'[]') into batches
  from private.ielts_course_batches b where b.school_id=p_school_id and b.deleted_at is null and b.archived_at is null;

 with scope as (
  select u.id,coalesce(nullif(u.full_name,''),u.username) name,nullif(trim(u.batch),'') class_name
  from public.users u
  where u.role='student' and u.school_id=p_school_id and coalesce(u.is_banned,false)=false
    and private.can_review_ielts_speaking_student(u.id)
    and (p_scope='all' or (p_scope='class' and nullif(trim(u.batch),'')=p_value)
      or (p_scope='batch' and exists(select 1 from private.ielts_course_batch_members m where m.batch_id=v_batch and m.student_id=u.id and m.left_at is null)))
  order by 2,1 limit 400),
 practice as (
  select r.student_id,jsonb_build_object(
    'key',case when r.kind='targeted' then 'targeted:'||r.material_id else 'school:'||split_part(r.row_id,':',1) end,
    'kind',case when r.kind='targeted' then 'targeted_practice' else 'school_practice' end,
    'title',r.title,'code',private.ielts_material_code(r.material_type,r.material_id),'skill',r.skill,
    'assigned_at',r.assigned_at,'due_at',r.due_at,
    'status',case when r.status in ('submitted','completed') then 'done' when r.status='in_progress' then 'in_progress'
      when r.status='excused' then 'excused' when r.status='skipped' then 'skipped' else 'not_started' end,
    'done_at',r.submitted_at,
    'score',case when r.kind='targeted' and r.skill in ('listening','reading') and s.score is not null
      then jsonb_build_object('raw',s.score,'total',coalesce(jsonb_array_length(t.questions),6)) end,
    'review',case when r.feedback_status='shared' then 'reviewed' when r.feedback_status='pending' then 'waiting' end) item
  from private.ielts_teacher_practice_rows(p_school_id) r
  join scope on scope.id=r.student_id
  left join private.ielts_learning_submissions s on r.kind='targeted' and s.allocation_id=r.assignment_id
  left join private.ielts_learning_tasks t on r.kind='targeted' and t.code=r.material_id
  where coalesce(r.assignment_status,'') not in ('draft','archived')),
 screeners as (
  select a.student_id,jsonb_build_object('key','screener:'||a.exam_event_id,'kind','screener','title',e.title,'code',null,
    'skill',sk.skill,'assigned_at',a.created_at,'due_at',null,
    'status',case when a.status in ('submitted','auto_submitted') then 'done' when a.status='started' then 'in_progress' else 'not_started' end,
    'done_at',att.submitted_at,
    'score',case when sk.skill in ('listening','reading') and a.status in ('submitted','auto_submitted') then
      (select jsonb_build_object('raw',sr.raw_score,'total',sr.marks_possible) from private.ielts_diagnostic_scoring_runs sr
        where sr.attempt_id=att.id and sr.raw_score is not null order by sr.created_at desc,sr.run_version desc limit 1) end,
    'review',case when sk.skill='writing' and a.status in ('submitted','auto_submitted') then
      case when exists(select 1 from private.ielts_writing_screener_reviews wr where wr.attempt_id=att.id) then 'reviewed' else 'waiting' end end) item
  from public.ielts_exam_assignments a join scope on scope.id=a.student_id
  join public.ielts_exam_events e on e.id=a.exam_event_id
  left join lateral (select x.id,x.submitted_at from public.ielts_exam_attempts x where x.assignment_id=a.id order by x.created_at desc limit 1) att on true
  left join lateral (select coalesce(
      (select ev.form_snapshot#>>'{items,0,skill}' from private.ielts_diagnostic_attempt_evidence ev where ev.attempt_id=att.id),
      case when e.title ilike '%listening%' then 'listening' when e.title ilike '%reading%' then 'reading'
        when e.title ilike '%writing%' then 'writing' when e.title ilike '%speaking%' then 'speaking' end) skill) sk on true
  where a.school_id=p_school_id),
 mocks as (
  select a.student_id,jsonb_build_object('key','mock:'||a.package_code,'kind','speaking_mock',
    'title','Speaking practice mock · '||coalesce(p.content->>'title',a.package_code),'code',null,'skill','speaking',
    'assigned_at',a.created_at,'due_at',null,
    'status',case when s.id is null then 'not_started' when s.status='submitted' or m.student_finished_at is not null then 'done' else 'in_progress' end,
    'done_at',coalesce(m.student_finished_at,s.submitted_at),'score',null,
    'band',case when rv.confirmed then (select jsonb_build_object('value',pb.overall,'label','Teacher Speaking band · practice mock')
        from private.ielts_speaking_part_bands pb where pb.session_id=s.id and pb.overall is not null order by pb.created_at desc limit 1) end,
    'review',case when s.id is null or not (s.status='submitted' or m.student_finished_at is not null) then null
      when rv.confirmed then 'reviewed' else 'waiting' end) item
  from private.ielts_speaking_mock_assignments a join scope on scope.id=a.student_id
  join private.ielts_speaking_packages p on p.code=a.package_code
  left join private.ielts_speaking_mock_sittings m on m.assignment_id=a.id
  left join private.ielts_speaking_sessions s on s.id=m.session_id
  left join lateral (select exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id and r.teacher_confirmed) confirmed) rv on true
  where a.cancelled_at is null),
 interviews as (
  select s.student_id,jsonb_build_object('key','interview:'||s.id,'kind','speaking_interview','title','Speaking interview','code',null,
    'skill','speaking','assigned_at',s.created_at,'due_at',null,
    'status',case when s.status='submitted' then 'done' else 'in_progress' end,'done_at',s.submitted_at,'score',null,
    'band',case when rv.confirmed then (select jsonb_build_object('value',pb.overall,'label','Teacher Speaking band')
        from private.ielts_speaking_part_bands pb where pb.session_id=s.id and pb.overall is not null order by pb.created_at desc limit 1) end,
    'review',case when s.status<>'submitted' then null when rv.confirmed then 'reviewed' else 'waiting' end) item
  from private.ielts_speaking_sessions s join scope on scope.id=s.student_id
  left join lateral (select exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id and r.teacher_confirmed) confirmed) rv on true
  where s.school_id=p_school_id and s.evidence_kind<>'practice_mock'),
 items as (select * from practice union all select * from screeners union all select * from mocks union all select * from interviews)
 select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'class_name',sc.class_name,
   'items',coalesce((select jsonb_agg(i.item order by i.item->>'assigned_at' desc) from items i where i.student_id=sc.id),'[]'))
   order by sc.name,sc.id),'[]') into students from scope sc;

 return jsonb_build_object('school_id',p_school_id,'scope',jsonb_build_object('kind',p_scope,'value',p_value,'name',scope_name),
   'generated_at',now(),'classes',classes,'batches',batches,'students',students);
end; $$;

revoke all on function public.rpc_ielts_class_report(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_class_report(uuid,text,text) to authenticated;
