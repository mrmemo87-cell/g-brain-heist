-- Diagnostic Bible 2.7.4 section 15.1 and Visual & UX Bible 1.24.0 section 13.13: the class report becomes the
-- teacher's mark book. Same function, same arguments, same authorization and scope rules as
-- 20261123090000_ielts_class_report.sql; every field it returned before is unchanged. It now also returns:
--   * per student `markbook.mocks`: each full mock (IELTS-M1..M3) sitting the student belongs to or has results in,
--     paper (teacher-entered, private.ielts_mock_results) and computer (private.ielts_mock_cbt_*), per section:
--     Listening/Reading raw marks /40, Writing/Speaking teacher criteria, and the bh-indicative-v1 indicative band
--     range from the existing private.ielts_indicative_* functions (none for a repeat sitting, section 12A);
--     sections with no result are 'not_sat';
--   * per student `markbook.course`: published course units completed / published units;
--   * per student `markbook.official`: official IELTS results recorded for this school (section 18A);
--   * on items: the teacher's finalized Writing task band for school Writing practice, the teacher-set Writing
--     starting point for a Writing screener (section 10.11), and Listening/Reading marks for school practice;
--   * new items of kind 'reviewed_writing': finalized, banded teacher Writing reviews that were not assigned work
--     (for example the paper Mock Test 1 Task 1/2 scripts).
-- Read-only: nothing is written, scored or added to evidence. AI estimates never appear.

create or replace function private.ielts_class_report_cbt_section(a private.ielts_mock_cbt_attempts, p_section text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_mock_cbt_scores; w private.ielts_mock_cbt_writing_reviews; closed boolean; begin
 closed := (a.sections->p_section->>'closed_at') is not null;
 if p_section in ('listening','reading') then
   select * into s from private.ielts_mock_cbt_scores x where x.attempt_id=a.id and x.section=p_section order by x.scored_at desc, x.id desc limit 1;
   if s.id is not null then
     return jsonb_build_object('state','result','raw',s.raw,'answered',null,'exposed',a.exposed,
       'indicative',case when not a.exposed then private.ielts_indicative_objective(p_section,s.raw) end);
   end if;
 elsif p_section='writing' then
   select * into w from private.ielts_mock_cbt_writing_reviews x where x.attempt_id=a.id order by x.reviewed_at desc, x.id desc limit 1;
   if w.id is not null then
     return jsonb_build_object('state','result','criteria',w.criteria,'exposed',a.exposed,
       'indicative',case when not a.exposed then private.ielts_indicative_productive('writing',w.criteria) end);
   end if;
   if closed then return jsonb_build_object('state','waiting'); end if;
 else
   return jsonb_build_object('state','not_part');
 end if;
 if a.status='in_progress' and a.section=p_section then return jsonb_build_object('state','in_progress'); end if;
 return jsonb_build_object('state','not_sat');
end $$;
revoke all on function private.ielts_class_report_cbt_section(private.ielts_mock_cbt_attempts,text) from public,anon,authenticated,service_role;

create or replace function public.rpc_ielts_class_report(p_school_id uuid, p_scope text default 'all', p_value text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare students jsonb; classes jsonb; batches jsonb; scope_name text; v_batch uuid; v_units int; begin
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
 select count(*) into v_units from public.ielts_course_units cu where cu.is_published;

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
      then jsonb_build_object('raw',s.score,'total',coalesce(jsonb_array_length(t.questions),6))
      when r.kind='school' and r.status in ('submitted','completed') and obj.raw is not null and obj.total>0
      then jsonb_build_object('raw',obj.raw,'total',obj.total) end,
    'review',case when r.feedback_status='shared' then 'reviewed' when r.feedback_status='pending' then 'waiting'
      when wr.finalized then 'reviewed' when wr.attempt_id is not null and r.status in ('submitted','completed') then 'waiting' end)
   || case when wr.finalized and wr.band is not null then jsonb_build_object('band',jsonb_build_object('value',wr.band,
        'label','Teacher Writing band'||coalesce(' · Task '||wr.task_no,''))) else '{}'::jsonb end item
  from private.ielts_teacher_practice_rows(p_school_id) r
  join scope on scope.id=r.student_id
  left join private.ielts_learning_submissions s on r.kind='targeted' and s.allocation_id=r.assignment_id
  left join private.ielts_learning_tasks t on r.kind='targeted' and t.code=r.material_id
  -- School practice: the attempt the student linked to this item (the student's own attempt only).
  left join lateral (select p.practice_attempt_type pat,p.practice_attempt_id paid from public.ielts_practice_assignment_item_students p
    where r.kind='school' and p.assignment_id=r.assignment_id and p.student_id=r.student_id
      and p.assignment_item_id::text=split_part(r.row_id,':',1) limit 1) pis on true
  left join lateral (select x.raw,x.total from (
      select la.raw_score raw,la.total_questions total from public.ielts_listening_attempts la
       where pis.pat='listening' and la.id=pis.paid and la.user_id=r.student_id and la.completed_at is not null
      union all
      select ra.raw_score,ra.total_questions from public.ielts_reading_attempts ra
       where pis.pat='reading' and ra.id=pis.paid and ra.user_id=r.student_id and ra.completed_at is not null) x limit 1) obj on true
  left join lateral (select wa.id attempt_id,coalesce(pr.finalized,false) finalized,pr.overall_band band,
      case when wt.task_type ilike '%1%' then '1' when wt.task_type ilike '%2%' then '2' end task_no
    from public.ielts_writing_attempts wa
    left join public.ielts_writing_tasks wt on wt.id=wa.task_id
    left join public.ielts_productive_skill_reviews pr on pr.attempt_type='writing' and pr.attempt_id=wa.id::text and pr.school_id=p_school_id
    where pis.pat='writing' and wa.id=pis.paid and wa.user_id=r.student_id limit 1) wr on true
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
      case when exists(select 1 from private.ielts_writing_screener_reviews wr where wr.attempt_id=att.id) then 'reviewed' else 'waiting' end end)
   || coalesce(case when sk.skill='writing' and a.status in ('submitted','auto_submitted') then
      (select jsonb_build_object('band',jsonb_build_object('value',sp.band,'label','Writing starting point · Task 2 · teacher-set'))
        from private.ielts_writing_starting_points sp where sp.attempt_id=att.id and sp.band is not null
        order by sp.set_at desc,sp.id desc limit 1) end,'{}'::jsonb) item
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
 -- Finalized, banded teacher Writing reviews for this school that are not linked to assigned work.
 reviewed_writing as (
  select pr.student_id,jsonb_build_object('key','writing:'||coalesce(wa.task_id::text,wa.id::text),'kind','reviewed_writing',
    'title',coalesce(nullif(wt.title,''),'Writing task'),'code',wt.display_code,'skill','writing',
    'assigned_at',coalesce(wa.submitted_at,pr.reviewed_at,pr.created_at),'due_at',null,'status','done',
    'done_at',wa.submitted_at,'score',null,
    'band',jsonb_build_object('value',pr.overall_band,'label','Teacher Writing band'
      ||coalesce(' · Task '||case when wt.task_type ilike '%1%' then '1' when wt.task_type ilike '%2%' then '2' end,'')),
    'review','reviewed') item
  from public.ielts_productive_skill_reviews pr join scope on scope.id=pr.student_id
  join public.ielts_writing_attempts wa on wa.id::text=pr.attempt_id and wa.user_id=pr.student_id
  left join public.ielts_writing_tasks wt on wt.id=wa.task_id
  where pr.attempt_type='writing' and pr.school_id=p_school_id and pr.finalized and pr.overall_band is not null
    and not exists(select 1 from public.ielts_practice_assignment_item_students p where p.practice_attempt_type='writing' and p.practice_attempt_id=wa.id)),
 items as (select * from practice union all select * from screeners union all select * from mocks union all select * from interviews
   union all select * from reviewed_writing),
 -- Full mock sittings (paper, or teacher-entered computer) of this school: the student's batch sittings and any with their results.
 sittings as (
  select sc.id student_id,s.id sitting_id,s.mock_code,s.sat_on,s.delivery,coalesce(f.title,s.mock_code) title,
    private.ielts_mock_exposed(sc.id,s.id) exposed
  from scope sc join private.ielts_mock_sittings s on s.school_id=p_school_id
  left join private.ielts_mock_forms f on f.code=s.mock_code
  where exists(select 1 from private.ielts_course_batch_members m where m.batch_id=s.batch_id and m.student_id=sc.id and m.left_at is null)
     or exists(select 1 from private.ielts_mock_results r where r.sitting_id=s.id and r.student_id=sc.id)),
 mock_rows as (
  select st.student_id,st.mock_code form,st.sat_on,jsonb_build_object('key','sitting:'||st.sitting_id,
    'group',st.delivery||':'||st.mock_code||':'||st.sat_on,'form',st.mock_code,'title',st.title,'delivery',st.delivery,
    'source','sitting','sat_on',st.sat_on,'practice',st.exposed,'attempt_no',null,
    'sections',(select jsonb_object_agg(sec,coalesce(
        (select (private.ielts_mock_result_json(r,st.exposed)-'marks'-'revision')||jsonb_build_object('state','result')
          from private.ielts_mock_results r where r.sitting_id=st.sitting_id and r.student_id=st.student_id and r.section=sec),
        jsonb_build_object('state','not_sat')))
      from unnest(array['listening','reading','writing','speaking']) sec)) mock
  from sittings st
  union all
  -- Computer mocks taken in the platform: the newest attempt per mock (a repeat is practice: no indicative range).
  select a.student_id,a.mock_code,(a.started_at at time zone 'Asia/Bishkek')::date,jsonb_build_object('key','cbt:'||a.id,
    'group','cbt:'||a.mock_code,'form',a.mock_code,'title',coalesce(f.title,a.mock_code),'delivery','computer',
    'source','cbt','sat_on',(a.started_at at time zone 'Asia/Bishkek')::date,'practice',a.exposed,'attempt_no',a.attempt_no,
    'sections',jsonb_build_object('listening',private.ielts_class_report_cbt_section(a,'listening'),
      'reading',private.ielts_class_report_cbt_section(a,'reading'),'writing',private.ielts_class_report_cbt_section(a,'writing'),
      'speaking',private.ielts_class_report_cbt_section(a,'speaking'))) mock
  from private.ielts_mock_cbt_attempts a
  left join private.ielts_mock_forms f on f.code=a.mock_code
  where a.id in (select distinct on (x.student_id,x.mock_code) x.id from private.ielts_mock_cbt_attempts x join scope on scope.id=x.student_id
        order by x.student_id,x.mock_code,x.attempt_no desc))
 select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'class_name',sc.class_name,
   'items',coalesce((select jsonb_agg(i.item order by i.item->>'assigned_at' desc) from items i where i.student_id=sc.id),'[]'),
   'markbook',jsonb_build_object(
     'mocks',coalesce((select jsonb_agg(m.mock order by m.form,m.sat_on,m.mock->>'key') from mock_rows m where m.student_id=sc.id),'[]'),
     'course',jsonb_build_object('done',(select count(*) from public.ielts_course_progress cp join public.ielts_course_units cu on cu.id=cp.unit_id
         where cp.user_id=sc.id and cp.completed_at is not null and cu.is_published),'total',v_units),
     'official',coalesce((select jsonb_agg(jsonb_build_object('test_date',o.test_date,'test_type',o.test_type,'delivery',o.delivery,
         'listening',o.listening,'reading',o.reading,'writing',o.writing,'speaking',o.speaking,'overall',o.overall,'verified',o.verified)
         order by o.test_date desc,o.created_at desc) from private.ielts_official_results o where o.student_id=sc.id and o.school_id=p_school_id),'[]')))
   order by sc.name,sc.id),'[]') into students from scope sc;

 return jsonb_build_object('school_id',p_school_id,'scope',jsonb_build_object('kind',p_scope,'value',p_value,'name',scope_name),
   'generated_at',now(),'classes',classes,'batches',batches,'students',students,'markbook_version',1);
end; $$;

revoke all on function public.rpc_ielts_class_report(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_class_report(uuid,text,text) to authenticated;
