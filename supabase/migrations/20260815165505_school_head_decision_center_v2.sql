-- School Head Decision Center v2
-- Executive signals, durable notification cadence, and assignment display repair.

create table if not exists public.school_head_decision_alerts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  decision_key text not null,
  severity text not null check (severity in ('info','notice','warning','critical')),
  title text not null,
  description text not null,
  destination text not null check (destination in ('overview','decisions','academic','people','programs','subscription','governance')),
  decision_payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_in_app_notified_at timestamptz,
  next_in_app_at timestamptz,
  last_email_notified_at timestamptz,
  next_email_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, decision_key)
);

create index if not exists school_head_decision_alerts_open_idx
  on public.school_head_decision_alerts(school_id, severity, next_email_at)
  where status = 'open';

alter table public.school_head_decision_alerts enable row level security;
revoke all on table public.school_head_decision_alerts from public, anon, authenticated;
grant select on table public.school_head_decision_alerts to authenticated;
drop policy if exists school_head_reads_decision_alerts on public.school_head_decision_alerts;
create policy school_head_reads_decision_alerts
  on public.school_head_decision_alerts for select to authenticated
  using ((select public.is_school_owner(school_id)));

create table if not exists public.school_head_metric_snapshots (
  school_id uuid not null references public.schools(id) on delete cascade,
  snapshot_date date not null default current_date,
  student_count integer not null default 0,
  inactive_student_count integer not null default 0,
  academic_average numeric,
  missing_class_subject_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, snapshot_date)
);
create index if not exists school_head_metric_snapshots_history_idx
  on public.school_head_metric_snapshots(school_id, snapshot_date desc);
alter table public.school_head_metric_snapshots enable row level security;
revoke all on table public.school_head_metric_snapshots from public, anon, authenticated;

create or replace function private.school_head_make_decision(
  p_id text,
  p_severity text,
  p_count integer,
  p_title text,
  p_description text,
  p_action text,
  p_destination text,
  p_category text,
  p_owner text,
  p_why text,
  p_oldest_at timestamptz,
  p_affected jsonb default '[]'::jsonb
) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_id,
    'severity', p_severity,
    'count', greatest(coalesce(p_count,0),0),
    'title', p_title,
    'description', p_description,
    'action', p_action,
    'destination', p_destination,
    'category', p_category,
    'owner', p_owner,
    'why', p_why,
    'oldest_at', p_oldest_at,
    'age_days', case when p_oldest_at is null then 0 else greatest(0, floor(extract(epoch from (now()-p_oldest_at))/86400)::integer) end,
    'affected', coalesce(p_affected,'[]'::jsonb),
    'notification_level', case p_severity
      when 'critical' then 'Immediate in-app and email; repeats daily while unresolved'
      when 'warning' then 'In-app and daily email digest while unresolved'
      when 'notice' then 'Decision Center and weekly email digest while unresolved'
      else 'Decision Center only'
    end
  );
$$;
revoke all on function private.school_head_make_decision(text,text,integer,text,text,text,text,text,text,text,timestamptz,jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.school_head_build_operational_decisions(
  p_school_id uuid,
  p_days integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decisions jsonb := '[]'::jsonb;
  v_affected jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_total integer := 0;
  v_previous integer := null;
  v_oldest timestamptz := null;
  v_rate numeric := 0;
  v_severity text;
  v_description text;
begin
  if p_school_id is null then return '[]'::jsonb; end if;
  p_days := greatest(7, least(coalesce(p_days,30), 180));

  -- Required class-subject pairs must have an active, eligible teaching member.
  with issues as materialized (
    select c.id as class_id, c.class_code, c.class_name, c.grade_level,
           s.id as subject_id, s.name as subject_name,
           least(c.created_at, m.created_at) as issue_at
    from public.classes c
    join public.school_academic_years y on y.school_id=c.school_id and y.status='current'
    join public.school_curriculum_scope_mappings m on m.school_id=c.school_id
      and m.academic_year_id=y.id and m.status='active'
      and m.subject_requirement='required' and m.grade_level=c.grade_level
    join public.academic_subjects s on s.id=m.academic_subject_id and s.is_active
    where c.school_id=p_school_id and c.is_active is distinct from false
      and not exists (
        select 1 from public.class_teacher_assignments cta
        join public.school_members sm on sm.school_id=cta.school_id
          and sm.user_id=cta.teacher_user_id and sm.status='active' and sm.can_teach
        join public.users tu on tu.id=cta.teacher_user_id and not coalesce(tu.is_banned,false)
        where cta.school_id=c.school_id and cta.class_id=c.id and cta.active is distinct from false
          and (
            lower(trim(cta.subject))=lower(trim(s.name))
            or public.academic_normalize_subject_key(cta.subject)=s.code
          )
      )
  ), sample as (
    select * from issues order by grade_level, class_code, subject_name limit 12
  )
  select (select count(*) from issues), (select min(issue_at) from issues),
         coalesce((select jsonb_agg(jsonb_build_object(
           'label', class_code||' · '||subject_name,
           'detail', coalesce(class_name,class_code)||' · Grade '||coalesce(grade_level,'Not set'),
           'class_id', class_id, 'subject_id', subject_id
         ) order by grade_level,class_code,subject_name) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'missing_class_subject_teachers','critical',v_count,'Required subjects have no assigned teacher',
      format('%s required class-subject allocation(s) are not covered by an active teacher.',v_count),
      'Assign missing teachers','people','Staffing','School administration',
      'Students can lose instruction, assessment ownership, and teacher-scoped access when a required subject has no accountable teacher.',
      v_oldest,v_affected));
  end if;

  -- Active assignments linked to inactive, banned, removed, or non-teaching members.
  with issues as materialized (
    select cta.id, c.class_code, cta.subject, cta.created_at as issue_at,
      coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unknown teacher') as teacher_name,
      case
        when sm.user_id is null then 'Teacher is not a school member'
        when sm.status<>'active' then 'School membership is '||coalesce(sm.status,'inactive')
        when not coalesce(sm.can_teach,false) then 'Teaching-staff status is disabled'
        when coalesce(u.is_banned,false) then 'Account is suspended or banned'
        else 'Teacher account is unavailable'
      end as reason
    from public.class_teacher_assignments cta
    join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id
    left join public.school_members sm on sm.school_id=cta.school_id and sm.user_id=cta.teacher_user_id
    left join public.users u on u.id=cta.teacher_user_id
    where cta.school_id=p_school_id and cta.active is distinct from false
      and (sm.user_id is null or sm.status<>'active' or not coalesce(sm.can_teach,false) or coalesce(u.is_banned,false))
  ), sample as (select * from issues order by class_code,subject limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',class_code||' · '||subject,'detail',teacher_name||' · '||reason,'assignment_id',id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'inactive_teacher_assignments','critical',v_count,'Teaching allocations point to unavailable staff',
      format('%s active allocation(s) belong to an inactive, suspended, removed, or non-teaching account.',v_count),
      'Repair teacher assignments','people','Staffing','School administration',
      'An unavailable assigned teacher can block delivery, grading, reporting, and secure teacher access.',v_oldest,v_affected));
  end if;

  -- Registered teaching staff with no active allocation.
  with issues as materialized (
    select sm.user_id, coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unnamed teacher') teacher_name,
      coalesce(sm.joined_at,sm.updated_at,u.created_at) issue_at
    from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and sm.can_teach
      and not exists (select 1 from public.class_teacher_assignments cta
        where cta.school_id=sm.school_id and cta.teacher_user_id=sm.user_id and cta.active is distinct from false)
  ), sample as (select * from issues order by teacher_name limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',teacher_name,'detail','No active class-subject allocation','teacher_user_id',user_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'unassigned_teachers','warning',v_count,'Teaching staff need assignments',
      format('%s registered teaching staff member(s) have no active class-subject allocation.',v_count),
      'Review teacher assignments','people','Staffing','School administration',
      'Registered teaching capacity is not connected to students or curriculum delivery.',v_oldest,v_affected));
  end if;

  -- Teacher workload concentration.
  with issues as materialized (
    select cta.teacher_user_id,
      coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unnamed teacher') teacher_name,
      count(*) allocation_count,count(distinct cta.class_id) class_count,count(distinct lower(trim(cta.subject))) subject_count,
      min(cta.created_at) issue_at
    from public.class_teacher_assignments cta
    join public.school_members sm on sm.school_id=cta.school_id and sm.user_id=cta.teacher_user_id and sm.status='active' and sm.can_teach
    join public.users u on u.id=cta.teacher_user_id
    join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and c.is_active is distinct from false
    where cta.school_id=p_school_id and cta.active is distinct from false
    group by cta.teacher_user_id,u.full_name,u.username,u.email
    having count(*)>=8 or count(distinct cta.class_id)>=6
  ), sample as (select * from issues order by allocation_count desc limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',teacher_name,'detail',allocation_count||' allocations · '||class_count||' classes · '||subject_count||' subjects','teacher_user_id',teacher_user_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'teacher_overload','warning',v_count,'Teaching workload may be concentrated',
      format('%s teacher(s) are carrying an unusually high number of active allocations.',v_count),
      'Review workload balance','people','Staffing','School leadership',
      'Concentrated class and subject ownership increases absence risk and can reduce feedback quality.',v_oldest,v_affected));
  end if;

  -- Students without a class.
  with issues as materialized (
    select sm.user_id,coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unnamed student') student_name,
      coalesce(sm.joined_at,sm.updated_at,u.created_at) issue_at
    from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
      and not exists (select 1 from public.class_students cs join public.classes c on c.id=cs.class_id
        where cs.student_id=sm.user_id and c.school_id=sm.school_id and c.is_active is distinct from false)
  ), sample as (select * from issues order by student_name limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',student_name,'detail','No active class placement','student_id',user_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'unplaced_students','critical',v_count,'Students need class placement',
      format('%s active student(s) are not connected to an active class.',v_count),
      'Place students in classes','people','Student placement','School administration',
      'Unplaced students can miss assignments, reporting scope, guardian reporting, and class-based access.',v_oldest,v_affected));
  end if;

  -- Active classes with no students.
  with issues as materialized (
    select c.id,c.class_code,c.class_name,c.grade_level,c.created_at issue_at
    from public.classes c where c.school_id=p_school_id and c.is_active is distinct from false
      and not exists (select 1 from public.class_students cs where cs.class_id=c.id)
  ), sample as (select * from issues order by grade_level,class_code limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',class_code,'detail',coalesce(class_name,'Class')||' · Grade '||coalesce(grade_level,'Not set'),'class_id',id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'empty_classes','warning',v_count,'Active classes have no students',
      format('%s active class(es) currently have no enrolled students.',v_count),
      'Review class registration','people','Student placement','School administration',
      'Empty active classes distort capacity and coverage reporting and may represent incomplete setup.',v_oldest,v_affected));
  end if;

  -- Academic decline by grade with minimum evidence on both periods.
  with scored as materialized (
    select distinct qs.id,c.grade_level,qs.percentage,qs.submitted_at
    from public.quiz_scores qs
    join public.class_students cs on cs.student_id=qs.student_id
    join public.classes c on c.id=cs.class_id and c.school_id=qs.school_id and c.is_active is distinct from false
    where qs.school_id=p_school_id and qs.submitted_at>=now()-make_interval(days=>p_days*2)
      and coalesce(qs.attempt_status,'completed')<>'deleted'
  ), periods as (
    select grade_level,
      avg(percentage) filter(where submitted_at>=now()-make_interval(days=>p_days)) current_average,
      count(*) filter(where submitted_at>=now()-make_interval(days=>p_days)) current_count,
      avg(percentage) filter(where submitted_at<now()-make_interval(days=>p_days)) previous_average,
      count(*) filter(where submitted_at<now()-make_interval(days=>p_days)) previous_count,
      min(submitted_at) filter(where submitted_at>=now()-make_interval(days=>p_days)) issue_at
    from scored group by grade_level
  ), issues as materialized (
    select grade_level,round(current_average,1) current_average,round(previous_average,1) previous_average,
      round(previous_average-current_average,1) decline,issue_at
    from periods where current_count>=5 and previous_count>=5 and previous_average-current_average>=10
  ), sample as (select * from issues order by decline desc limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label','Grade '||coalesce(grade_level,'Not set'),'detail',previous_average||'% → '||current_average||'% · down '||decline||' points')) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'academic_decline','critical',v_count,'Academic performance has declined materially',
      format('%s grade level(s) fell by at least 10 percentage points against the previous reporting period.',v_count),
      'Review academic performance','academic','Academic performance','Academic leadership',
      'A sustained decline with enough assessment evidence can indicate curriculum, engagement, or support problems.',v_oldest,v_affected));
  end if;

  -- Overdue grading and review queues.
  with issues as materialized (
    select 'Assignment' source,coalesce(a.title,'Untitled assignment') label,
      'Completed work has no result after 7 days' detail,sa.completed_at issue_at
    from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id
    where a.school_id=p_school_id and sa.completed_at<now()-interval '7 days'
      and not exists (select 1 from public.student_assignment_results r where r.assignment_id=sa.assignment_id and r.student_id=sa.student_id)
    union all
    select 'Writing', 'Writing assessment', 'Human review pending for more than 7 days',wa.created_at
    from public.bh_writing_assessments wa
    where wa.school_id=p_school_id and wa.assessment_status='needs_review' and wa.created_at<now()-interval '7 days'
    union all
    select 'IELTS',upper(ir.attempt_type)||' review','Review pending for more than 7 days',ir.created_at
    from public.ielts_productive_skill_reviews ir
    where ir.school_id=p_school_id and not ir.finalized and ir.created_at<now()-interval '7 days'
  ), sample as (select * from issues order by issue_at limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',source||' · '||label,'detail',detail)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'overdue_grading_reviews','warning',v_count,'Student work is waiting too long for review',
      format('%s submission or review item(s) have remained unresolved for more than seven days.',v_count),
      'Review academic queues','academic','Academic workflow','Academic leadership',
      'Delayed feedback weakens learning momentum and leaves students and families without timely outcomes.',v_oldest,v_affected));
  end if;

  -- Published assignments with materially low completion after the deadline.
  with issues as materialized (
    select a.id,a.title,a.class_code_snapshot,a.subject_name,a.due_at,
      count(sa.id) assigned_count,
      count(sa.id) filter(where sa.completed_at is not null or lower(coalesce(sa.status,'')) in ('completed','submitted','graded')) completed_count,
      round(100.0*count(sa.id) filter(where sa.completed_at is not null or lower(coalesce(sa.status,'')) in ('completed','submitted','graded'))/nullif(count(sa.id),0),1) completion_rate
    from public.assignments a join public.student_assignments sa on sa.assignment_id=a.id
    where a.school_id=p_school_id and a.due_at<now()-interval '24 hours' and coalesce(a.publish_status,'published')<>'draft'
    group by a.id,a.title,a.class_code_snapshot,a.subject_name,a.due_at
    having count(sa.id)>=3 and 100.0*count(sa.id) filter(where sa.completed_at is not null or lower(coalesce(sa.status,'')) in ('completed','submitted','graded'))/nullif(count(sa.id),0)<50
  ), sample as (select * from issues order by completion_rate,due_at limit 12)
  select (select count(*) from issues),(select min(due_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(title,'Assignment'),'detail',coalesce(class_code_snapshot,'Class')||' · '||coalesce(subject_name,'Subject')||' · '||completion_rate||'% complete','assignment_id',id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'low_assignment_completion','warning',v_count,'Assignment completion needs intervention',
      format('%s assignment(s) closed with fewer than half of assigned students completing.',v_count),
      'Review completion gaps','academic','Academic performance','Academic leadership',
      'Low completion can reveal access, engagement, workload, or instructional follow-up problems.',v_oldest,v_affected));
  end if;

  -- Student disengagement, with a historical comparison once daily snapshots exist.
  select count(*) into v_total from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student';
  with issues as materialized (
    select sm.user_id,coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unnamed student') student_name,u.last_seen,
      coalesce(u.last_seen,sm.joined_at,u.created_at) issue_at
    from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
      and (u.last_seen is null or u.last_seen<now()-interval '14 days')
  ), sample as (select * from issues order by last_seen nulls first limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',student_name,'detail',case when last_seen is null then 'No recorded activity' else 'Last active '||last_seen::date end,'student_id',user_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  select ms.inactive_student_count into v_previous
  from public.school_head_metric_snapshots ms
  where ms.school_id=p_school_id and ms.snapshot_date<=current_date-7
  order by ms.snapshot_date desc limit 1;
  if v_count>0 then
    v_rate:=case when v_total>0 then round(100.0*v_count/v_total,1) else 0 end;
    v_severity:=case when v_rate>=25 or (v_previous is not null and v_count-v_previous>=greatest(3,ceil(v_total*0.10)::integer)) then 'critical' else 'warning' end;
    v_description:=case when v_previous is not null and v_count>v_previous
      then format('%s student(s), %s%% of enrolment, are inactive for 14+ days; this is %s more than the latest comparable snapshot.',v_count,v_rate,v_count-v_previous)
      else format('%s student(s), %s%% of enrolment, have been inactive for at least 14 days.',v_count,v_rate) end;
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'student_disengagement',v_severity,v_count,case when v_severity='critical' then 'Student disengagement needs immediate attention' else 'Students need re-engagement' end,
      v_description,'Review engagement','academic','Student engagement','Pastoral and academic leadership',
      'Extended inactivity can precede missed work, attainment decline, and withdrawal from school programmes.',v_oldest,v_affected));
  end if;

  -- Required curriculum offerings with no recent published assignment activity.
  with issues as materialized (
    select m.grade_level,s.id subject_id,s.name subject_name,m.updated_at issue_at
    from public.school_curriculum_scope_mappings m
    join public.school_academic_years y on y.id=m.academic_year_id and y.school_id=m.school_id and y.status='current'
    join public.academic_subjects s on s.id=m.academic_subject_id and s.is_active
    where m.school_id=p_school_id and m.status='active' and m.subject_requirement='required'
      and not exists (
        select 1 from public.assignments a
        where a.school_id=m.school_id and a.created_at>=now()-make_interval(days=>p_days)
          and coalesce(a.publish_status,'published')<>'draft'
          and (a.academic_subject_id=m.academic_subject_id
            or lower(trim(coalesce(a.subject_name,a.subject,'')))=lower(trim(s.name))
            or public.academic_normalize_subject_key(coalesce(a.subject_name,a.subject,''))=s.code)
          and (a.grade_level_snapshot=m.grade_level or exists (
            select 1 from public.classes c where c.id=a.class_id and c.grade_level=m.grade_level
          ))
      )
  ), sample as (select * from issues order by grade_level,subject_name limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label','Grade '||grade_level||' · '||subject_name,'detail','No published assignment activity in the last '||p_days||' days','subject_id',subject_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'curriculum_activity_gaps','notice',v_count,'Curriculum areas have no recent assignment activity',
      format('%s required grade-subject offering(s) have no published assignment evidence in the last %s days.',v_count,p_days),
      'Review curriculum delivery','academic','Curriculum coverage','Academic leadership',
      'This is an activity signal, not a mastery judgment; it highlights areas where the platform has no recent delivery evidence.',v_oldest,v_affected));
  end if;

  -- Admissions records that have not progressed within the service window.
  with issues as materialized (
    select ac.id,ac.full_name,ac.applied_grade,ac.status,ac.updated_at issue_at
    from public.adm_candidates ac
    where ac.school_id=p_school_id and lower(coalesce(ac.status,'')) in ('pending','registered','invited','in_progress','testing','under_review')
      and ac.updated_at<now()-interval '7 days'
  ), sample as (select * from issues order by issue_at limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',full_name,'detail','Grade '||coalesce(applied_grade::text,'Not set')||' · '||replace(status,'_',' ')||' since '||issue_at::date,'candidate_id',id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'stalled_admissions','warning',v_count,'Admission candidates are waiting too long',
      format('%s candidate(s) have remained in an active admission stage without an update for more than seven days.',v_count),
      'Review Admissions','programs','Admissions','Admissions leadership',
      'Slow progression can reduce applicant confidence and leave important placement decisions unresolved.',v_oldest,v_affected));
  end if;

  -- Operational continuity requires at least one delegated administrator besides the Head.
  select count(*) into v_count from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='school_admin' and not sm.is_owner;
  if v_count=0 then
    select coalesce(min(sm.joined_at),min(s.created_at)) into v_oldest
      from public.schools s left join public.school_members sm on sm.school_id=s.id and sm.is_owner where s.id=p_school_id;
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'no_delegated_admin','notice',1,'No delegated school administrator is active',
      'The School Head is currently the only active administrator for this school.',
      'Review administrative delegation','governance','Governance','School Head',
      'A second accountable administrator improves operational continuity when the School Head is unavailable.',v_oldest,'[]'::jsonb));
  end if;

  -- Younger students without an active guardian link.
  with issues as materialized (
    select distinct sm.user_id,coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unnamed student') student_name,
      c.class_code,c.grade_level,coalesce(sm.joined_at,u.created_at) issue_at
    from public.school_members sm join public.users u on u.id=sm.user_id
    join public.class_students cs on cs.student_id=sm.user_id
    join public.classes c on c.id=cs.class_id and c.school_id=sm.school_id and c.is_active is distinct from false
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
      and c.grade_level~'^[0-9]+$' and c.grade_level::integer<=8
      and not exists (select 1 from public.student_guardian_relationships sgr
        where sgr.school_id=sm.school_id and sgr.student_id=sm.user_id and sgr.status='active' and sgr.revoked_at is null)
  ), sample as (select * from issues order by grade_level,class_code,student_name limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',student_name,'detail',class_code||' · Grade '||grade_level,'student_id',user_id)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'missing_guardian_links','notice',v_count,'Younger students are missing guardian access',
      format('%s student(s) in Grade 8 or below have no active guardian relationship.',v_count),
      'Review parent access','people','Parent engagement','School administration',
      'Verified guardian access supports communication, progress visibility, and accountable family engagement.',v_oldest,v_affected));
  end if;

  -- Seat capacity and billing risk.
  select count(*) into v_total from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student';
  select case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else 0 end
    into v_count from public.schools s where s.id=p_school_id;
  if v_count>0 and v_total*100.0/v_count>=80 then
    v_rate:=round(v_total*100.0/v_count,1);
    v_severity:=case when v_rate>=95 then 'critical' else 'warning' end;
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'seat_capacity',v_severity,v_total,'Student seat capacity is running low',
      format('%s of %s student seats are in use (%s%%).',v_total,v_count,v_rate),
      'Review plan capacity','subscription','Subscription capacity','School Head',
      'Reaching the seat limit can prevent new student onboarding and disrupt planned growth.',now(),'[]'::jsonb));
  end if;

  with latest as (
    select bs.* from public.billing_subscriptions bs where bs.school_id=p_school_id
    order by bs.updated_at desc,bs.created_at desc limit 1
  )
  select count(*),min(coalesce(updated_at,created_at)),coalesce(jsonb_agg(jsonb_build_object(
    'label',coalesce(plan,'School plan'),'detail',replace(coalesce(status,'unknown'),'_',' ')||case when current_period_end is not null then ' · period ends '||current_period_end::date else '' end
  )),'[]'::jsonb)
  into v_count,v_oldest,v_affected from latest
  where lower(coalesce(status,'')) in ('past_due','unpaid','paused','canceled','cancelled')
    or cancel_at_period_end
    or (current_period_end is not null and current_period_end<=now()+interval '7 days' and lower(coalesce(status,'')) not in ('active','trialing'));
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'subscription_risk','critical',1,'School access may be interrupted',
      'The latest subscription record requires billing or renewal attention.',
      'Review Plan & Billing','subscription','Billing','School Head',
      'Unresolved payment, pause, cancellation, or expiry risk can interrupt school access.',v_oldest,v_affected));
  end if;

  -- Enabled modules with no meaningful setup or adoption signal after seven days.
  with enabled as materialized (
    select sme.module_key,coalesce(sme.starts_at,sme.created_at) issue_at
    from public.school_module_entitlements sme
    where sme.school_id=p_school_id and sme.enabled
      and (sme.starts_at is null or sme.starts_at<=now()) and (sme.ends_at is null or sme.ends_at>now())
      and coalesce(sme.starts_at,sme.created_at)<now()-interval '7 days'
  ), issues as materialized (
    select e.module_key,e.issue_at from enabled e where
      (e.module_key='cambridge' and not exists(select 1 from public.school_curriculum_scope_mappings m where m.school_id=p_school_id and m.status='active'))
      or (e.module_key='ielts' and not exists(select 1 from public.ielts_users iu join public.school_members sm on sm.user_id=iu.id where sm.school_id=p_school_id and sm.status='active'))
      or (e.module_key='writing' and not exists(select 1 from public.bh_writing_student_profiles wp join public.school_members sm on sm.user_id=wp.student_id where sm.school_id=p_school_id and sm.status='active'))
      or (e.module_key='admissions' and not exists(select 1 from public.adm_candidates ac where ac.school_id=p_school_id))
  ), sample as (select * from issues order by module_key limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',initcap(module_key),'detail','Enabled but no setup or adoption signal is recorded')) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'enabled_programs_unconfigured','notice',v_count,'Enabled programmes need setup or adoption',
      format('%s enabled programme(s) have no meaningful setup or participation signal after seven days.',v_count),
      'Review programme setup','programs','Programme adoption','Programme leadership',
      'Paid or approved capability should have accountable setup, ownership, and learner adoption.',v_oldest,v_affected));
  end if;

  -- Structural data-integrity problems that make reporting unreliable.
  with issues as materialized (
    select 'Invalid teaching allocation' label,
      coalesce(c.class_code,'Missing class')||' · '||coalesce(cta.subject,'Missing subject') detail,cta.created_at issue_at
    from public.class_teacher_assignments cta
    left join public.classes c on c.id=cta.class_id
    where cta.school_id=p_school_id and cta.active is distinct from false
      and (c.id is null or c.school_id<>cta.school_id or c.is_active is false)
    union all
    select 'Multiple class placements',coalesce(nullif(u.full_name,''),u.username,u.email,'Unnamed student')||' · '||count(*)||' active classes',min(c.created_at)
    from public.class_students cs join public.classes c on c.id=cs.class_id and c.school_id=p_school_id and c.is_active is distinct from false
    join public.users u on u.id=cs.student_id
    group by cs.student_id,u.full_name,u.username,u.email having count(*)>1
    union all
    select 'School membership mismatch',coalesce(nullif(u.full_name,''),u.username,u.email,'Unnamed member')||' · profile school differs from active membership',sm.joined_at
    from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and u.school_id is distinct from sm.school_id
  ), sample as (select * from issues order by issue_at limit 12)
  select (select count(*) from issues),(select min(issue_at) from issues),
    coalesce((select jsonb_agg(jsonb_build_object('label',label,'detail',detail)) from sample),'[]'::jsonb)
  into v_count,v_oldest,v_affected;
  if v_count>0 then
    v_decisions:=v_decisions||jsonb_build_array(private.school_head_make_decision(
      'school_data_quality','warning',v_count,'School structure contains conflicting records',
      format('%s structural data issue(s) may make staffing, placement, or reporting unreliable.',v_count),
      'Review governance and structure','governance','Data quality','School administration',
      'Executive decisions are only trustworthy when membership, class, and assignment relationships agree.',v_oldest,v_affected));
  end if;

  return v_decisions;
end;
$$;
revoke all on function private.school_head_build_operational_decisions(uuid,integer)
  from public, anon, authenticated, service_role;

-- Keep the previous aggregate implementation as the stable source for all non-decision metrics.
alter function public.school_head_get_executive_snapshot(uuid,integer)
  rename to school_head_get_executive_snapshot_legacy_20260815;

create or replace function public.school_head_get_executive_snapshot(p_school_id uuid,p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_operational jsonb;
  v_kept jsonb;
  v_enriched jsonb;
begin
  if (select auth.uid()) is null or not coalesce(public.is_school_owner(p_school_id),false) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  v_base:=public.school_head_get_executive_snapshot_legacy_20260815(p_school_id,p_days);
  v_operational:=private.school_head_build_operational_decisions(p_school_id,p_days);
  select coalesce(jsonb_agg(item),'[]'::jsonb) into v_kept
  from jsonb_array_elements(coalesce(v_base->'decisions','[]'::jsonb)) item
  where item->>'id' not in (
    'unplaced_students','uncovered_classes','unassigned_teachers','inactive_students',
    'pending_admissions','subscription_cancellation'
  );
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'first_seen_at',a.first_seen_at,'last_seen_at',a.last_seen_at,
    'alert_status',coalesce(a.status,'open')
  )),'[]'::jsonb) into v_enriched
  from jsonb_array_elements(v_operational) item
  left join public.school_head_decision_alerts a
    on a.school_id=p_school_id and a.decision_key=item->>'id';
  return jsonb_set(v_base,'{decisions}',v_kept||v_enriched,true)
    ||jsonb_build_object('decision_policy',jsonb_build_object(
      'critical','Immediate in-app and branded email; daily reminder while open',
      'warning','In-app and daily branded email digest while open',
      'notice','Decision Center and weekly branded email digest while open',
      'auto_resolution',true
    ));
end;
$$;
revoke all on function public.school_head_get_executive_snapshot(uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot(uuid,integer) to authenticated;

create or replace function private.refresh_school_head_decision_alerts(p_school_id uuid,p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decisions jsonb:=private.school_head_build_operational_decisions(p_school_id,p_days);
  v_decision jsonb;
  v_active_keys text[]:='{}'::text[];
  v_student_count integer;
  v_inactive_count integer;
  v_average numeric;
  v_missing integer;
  v_open integer;
begin
  for v_decision in select value from jsonb_array_elements(v_decisions) loop
    v_active_keys:=array_append(v_active_keys,v_decision->>'id');
    insert into public.school_head_decision_alerts(
      school_id,decision_key,severity,title,description,destination,decision_payload,status,
      first_seen_at,last_seen_at,resolved_at,next_in_app_at,next_email_at
    ) values (
      p_school_id,v_decision->>'id',v_decision->>'severity',v_decision->>'title',
      v_decision->>'description',v_decision->>'destination',v_decision,'open',now(),now(),null,
      now(),case when v_decision->>'severity'='info' then null else now() end
    ) on conflict(school_id,decision_key) do update set
      severity=excluded.severity,title=excluded.title,description=excluded.description,
      destination=excluded.destination,decision_payload=excluded.decision_payload,status='open',
      first_seen_at=case when public.school_head_decision_alerts.status='resolved' then now() else public.school_head_decision_alerts.first_seen_at end,
      last_seen_at=now(),resolved_at=null,
      next_in_app_at=case when public.school_head_decision_alerts.status='resolved' then now() else public.school_head_decision_alerts.next_in_app_at end,
      next_email_at=case when public.school_head_decision_alerts.status='resolved' and excluded.severity<>'info' then now() else public.school_head_decision_alerts.next_email_at end,
      updated_at=now();
  end loop;

  update public.school_head_decision_alerts set status='resolved',resolved_at=now(),updated_at=now(),
    next_in_app_at=null,next_email_at=null
  where school_id=p_school_id and status='open'
    and not(decision_key=any(v_active_keys));

  select count(*) into v_student_count from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student';
  select count(*) into v_inactive_count from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
      and (u.last_seen is null or u.last_seen<now()-interval '14 days');
  select round(avg(qs.percentage)::numeric,1) into v_average from public.quiz_scores qs
    where qs.school_id=p_school_id and qs.submitted_at>=now()-make_interval(days=>greatest(7,least(coalesce(p_days,30),180)))
      and coalesce(qs.attempt_status,'completed')<>'deleted';
  select coalesce((select (d->>'count')::integer from jsonb_array_elements(v_decisions) d where d->>'id'='missing_class_subject_teachers'),0)
    into v_missing;
  insert into public.school_head_metric_snapshots(school_id,snapshot_date,student_count,inactive_student_count,academic_average,missing_class_subject_count)
  values(p_school_id,current_date,v_student_count,v_inactive_count,v_average,v_missing)
  on conflict(school_id,snapshot_date) do update set
    student_count=excluded.student_count,inactive_student_count=excluded.inactive_student_count,
    academic_average=excluded.academic_average,missing_class_subject_count=excluded.missing_class_subject_count,updated_at=now();

  select count(*) into v_open from public.school_head_decision_alerts where school_id=p_school_id and status='open';
  return jsonb_build_object('success',true,'school_id',p_school_id,'open_alerts',v_open,'decisions',v_decisions);
end;
$$;
revoke all on function private.refresh_school_head_decision_alerts(uuid,integer)
  from public, anon, authenticated, service_role;

-- Add the executive alert type without removing current game and teacher notification contracts.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type=any(array[
  'attack_incoming','attack_defended','attack_success','attack_failed','level_up','achievement_earned',
  'coins_earned','coins_lost','quest_completed','gemstone_earned','low_ap','ap_full','challenge_received',
  'clan_invite','revenge_available','streak_danger','new_rival','leaderboard_change','assignment_completed',
  'cambridge_test_taken','student_improvement','new_submission','class_milestone','school_head_decision'
]::text[]));

create or replace function private.dispatch_school_head_decision_notifications(p_school_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert record;
  v_group record;
  v_owner uuid;
  v_school_name text;
  v_in_app integer:=0;
  v_email integer:=0;
  v_interval interval;
  v_priority text;
begin
  for v_alert in
    select a.*,sm.user_id owner_user_id
    from public.school_head_decision_alerts a
    join public.school_members sm on sm.school_id=a.school_id and sm.is_owner and sm.status='active'
    where a.status='open' and a.next_in_app_at is not null and a.next_in_app_at<=now()
      and (p_school_id is null or a.school_id=p_school_id)
  loop
    v_priority:=case v_alert.severity when 'critical' then 'urgent' when 'warning' then 'high' else 'medium' end;
    insert into public.notifications(user_id,type,title,message,data,priority,read)
    values(v_alert.owner_user_id,'school_head_decision',v_alert.title,v_alert.description,
      jsonb_build_object('school_id',v_alert.school_id,'decision_key',v_alert.decision_key,'destination',v_alert.destination,'severity',v_alert.severity),
      v_priority,false);
    v_interval:=case v_alert.severity when 'critical' then interval '1 day' when 'warning' then interval '1 day' else interval '7 days' end;
    update public.school_head_decision_alerts set last_in_app_notified_at=now(),next_in_app_at=now()+v_interval,updated_at=now()
      where id=v_alert.id;
    v_in_app:=v_in_app+1;
  end loop;

  for v_group in
    select a.school_id,
      count(*) alert_count,
      bool_or(a.severity='critical') has_critical,
      jsonb_agg(jsonb_build_object(
        'id',a.decision_key,'severity',a.severity,'title',a.title,'description',a.description,
        'count',coalesce((a.decision_payload->>'count')::integer,0),'destination',a.destination
      ) order by case a.severity when 'critical' then 1 when 'warning' then 2 else 3 end,a.title) alerts
    from public.school_head_decision_alerts a
    where a.status='open' and a.next_email_at is not null and a.next_email_at<=now()
      and a.severity in ('critical','warning','notice') and (p_school_id is null or a.school_id=p_school_id)
    group by a.school_id
  loop
    select sm.user_id,s.name into v_owner,v_school_name
    from public.school_members sm join public.schools s on s.id=sm.school_id
    where sm.school_id=v_group.school_id and sm.is_owner and sm.status='active' limit 1;
    if v_owner is not null then
      perform private.enqueue_transactional_email(
        'school_head_decision_digest','school_operations','school_head','school_head_decision_digest',
        'school-head-decision-digest-'||v_group.school_id::text||'-'||to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
        jsonb_build_object('alert_count',v_group.alert_count,'has_critical',v_group.has_critical,'alerts',v_group.alerts),
        v_owner,null,v_group.school_id,v_school_name,now()
      );
      update public.school_head_decision_alerts set last_email_notified_at=now(),
        next_email_at=case severity when 'critical' then now()+interval '1 day' when 'warning' then now()+interval '1 day' else now()+interval '7 days' end,
        updated_at=now()
      where school_id=v_group.school_id and status='open' and next_email_at is not null and next_email_at<=now();
      v_email:=v_email+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'in_app_notifications',v_in_app,'email_digests',v_email);
end;
$$;
revoke all on function private.dispatch_school_head_decision_notifications(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_school_head_refresh_decision_alerts(p_school_id uuid,p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb; v_delivery jsonb;
begin
  if (select auth.uid()) is null or not coalesce(public.is_school_owner(p_school_id),false) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  v_result:=private.refresh_school_head_decision_alerts(p_school_id,p_days);
  v_delivery:=private.dispatch_school_head_decision_notifications(p_school_id);
  return v_result||jsonb_build_object('notifications',v_delivery);
end;
$$;
revoke all on function public.rpc_school_head_refresh_decision_alerts(uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_head_refresh_decision_alerts(uuid,integer) to authenticated;

create or replace function public.rpc_refresh_all_school_head_decisions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_school record; v_count integer:=0; v_delivery jsonb;
begin
  if current_user not in ('postgres','service_role') then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  for v_school in
    select distinct s.id from public.schools s join public.school_members sm on sm.school_id=s.id
    where s.status='active' and sm.is_owner and sm.status='active'
  loop
    perform private.refresh_school_head_decision_alerts(v_school.id,30);
    v_count:=v_count+1;
  end loop;
  v_delivery:=private.dispatch_school_head_decision_notifications(null);
  delete from public.school_head_metric_snapshots where snapshot_date<current_date-400;
  return jsonb_build_object('success',true,'schools_refreshed',v_count,'notifications',v_delivery);
end;
$$;
revoke all on function public.rpc_refresh_all_school_head_decisions()
  from public, anon, authenticated;
grant execute on function public.rpc_refresh_all_school_head_decisions() to service_role;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='school-head-decision-center' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('school-head-decision-center','12 * * * *','select public.rpc_refresh_all_school_head_decisions();');
end $$;

-- Assignment rows now carry their own teacher identity. Rendering no longer depends
-- on a second eligibility list being perfectly synchronized.
create or replace function public.school_admin_list_teacher_assignments(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'school_id',a.school_id,'class_id',a.class_id,'teacher_user_id',a.teacher_user_id,
      'subject',a.subject,'active',a.active,
      'assigned_at',coalesce(to_jsonb(a)->>'assigned_at',to_jsonb(a)->>'created_at'),
      'teacher_name',coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unknown teacher'),
      'teacher_username',u.username,'teacher_email',u.email,
      'teacher_membership_status',sm.status,'teacher_can_teach',coalesce(sm.can_teach,false),
      'class_code',c.class_code,'class_name',c.class_name,'grade_level',c.grade_level
    ) order by c.grade_level,c.class_code,a.subject,coalesce(u.full_name,u.username,u.email))
    from public.class_teacher_assignments a
    left join public.classes c on c.id=a.class_id and c.school_id=a.school_id
    left join public.users u on u.id=a.teacher_user_id
    left join public.school_members sm on sm.school_id=a.school_id and sm.user_id=a.teacher_user_id
    where a.school_id=p_school_id
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.school_admin_list_teacher_assignments(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_list_teacher_assignments(uuid) to authenticated;

notify pgrst,'reload schema';
