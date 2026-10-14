-- Additive trial. No assessment/reward changes, new triggers, cron or realtime channels.
create table private.retention_trial_config(singleton boolean primary key default true check(singleton),enabled boolean not null default false,audience text not null default 'pilot' check(audience in('pilot','school','all')),pilot_user_ids uuid[] not null default '{}',school_id uuid,updated_at timestamptz not null default now(),updated_by uuid);
insert into private.retention_trial_config(singleton) values(true);
create table private.retention_trial_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,kind text not null check(kind in('drop','rescue','comeback')),focus_id uuid,focus_name text not null,difficulty text not null,questions jsonb not null check(jsonb_array_length(questions)=5),answers jsonb,correct integer,started_at timestamptz not null default now(),completed_at timestamptz);
create index retention_trial_runs_user_started on private.retention_trial_runs(user_id,started_at desc);
create table private.retention_trial_kudos(student_id uuid not null references public.users(id) on delete cascade,assignment_id uuid not null references public.assignments(id) on delete cascade,teacher_user_id uuid not null references public.users(id) on delete cascade,message_key text not null check(message_key in('clear','helpful','thanks')),created_at timestamptz not null default now(),primary key(student_id,assignment_id));
create index retention_trial_kudos_teacher_date on private.retention_trial_kudos(teacher_user_id,created_at desc);
create table private.retention_trial_events(user_id uuid not null references public.users(id) on delete cascade,event_day date not null default (now() at time zone 'Asia/Bishkek')::date,kind text not null check(kind in('student_view','teacher_view','next_move','profile_open','radar_open','wrap_open')),created_at timestamptz not null default now(),primary key(user_id,event_day,kind));
create table private.retention_trial_cache(user_id uuid primary key references public.users(id) on delete cascade,payload jsonb not null,expires_at timestamptz not null);
alter table private.retention_trial_config enable row level security;
alter table private.retention_trial_runs enable row level security;
alter table private.retention_trial_kudos enable row level security;
alter table private.retention_trial_events enable row level security;
alter table private.retention_trial_cache enable row level security;
revoke all on private.retention_trial_config,private.retention_trial_runs,private.retention_trial_kudos,private.retention_trial_events,private.retention_trial_cache from public,anon,authenticated;
create function private.retention_trial_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u cross join private.retention_trial_config c where u.id=p_user and c.enabled and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now()) and (c.audience='all' or (c.audience='school' and u.school_id=c.school_id) or (c.audience='pilot' and u.id=any(c.pilot_user_ids))));
$$;
revoke all on function private.retention_trial_allowed(uuid) from public,anon,authenticated;
create function public.rpc_retention_trial_status() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('enabled',auth.uid() is not null and private.retention_trial_allowed(auth.uid()),'version',1)$$;
revoke all on function public.rpc_retention_trial_status() from public,anon;
grant execute on function public.rpc_retention_trial_status() to authenticated;
create function public.rpc_retention_trial_control(p_enabled boolean default null,p_audience text default null,p_pilot_user_ids uuid[] default null,p_school_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.retention_trial_config;
begin
 if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED';end if;
 if p_enabled is not null then
  if p_audience is null or p_audience not in('pilot','school','all') then raise exception 'INVALID_AUDIENCE';end if;
  if p_audience='pilot' and (coalesce(cardinality(p_pilot_user_ids),0)=0 or cardinality(p_pilot_user_ids)>100) then raise exception 'PILOT_REQUIRED';end if;
  if p_audience='pilot' and exists(select 1 from unnest(p_pilot_user_ids) id where not exists(select 1 from public.users u where u.id=id)) then raise exception 'INVALID_PILOT';end if;
  if p_audience='school' and not exists(select 1 from public.schools s where s.id=p_school_id) then raise exception 'SCHOOL_REQUIRED';end if;
  update private.retention_trial_config set enabled=p_enabled,audience=p_audience,pilot_user_ids=coalesce(p_pilot_user_ids,'{}'),school_id=p_school_id,updated_at=now(),updated_by=auth.uid() where singleton;
 end if;
 select * into c from private.retention_trial_config;return to_jsonb(c)-'singleton';
end $$;
revoke all on function public.rpc_retention_trial_control(boolean,text,uuid[],uuid) from public,anon;
grant execute on function public.rpc_retention_trial_control(boolean,text,uuid[],uuid) to authenticated;
-- Internal candidate helper is never a public answer-key API.
create function private.retention_trial_candidates(p_grade integer,p_focus uuid) returns setof public.questions language sql stable security definer set search_path='' as $$
 select q.* from public.questions q where q.is_active and q.analytics_eligible and q.verification_status='verified' and q.pool_scope='global' and q.question_type='multiple_choice' and q.verified_content_hash=q.current_content_hash and q.verified_content_hash is not null and p_grade=any(q.eligible_grade_levels) and lower(q.subject) not like '%ielts%' and q.image_url is null and jsonb_typeof(q.options)='array' and jsonb_array_length(q.options)=4 and not exists(select 1 from jsonb_array_elements(q.options) o where jsonb_typeof(o)<>'string') and q.correct_answer in(select jsonb_array_elements_text(q.options)) and (select count(distinct o) from jsonb_array_elements_text(q.options) o)=4 and (p_focus is null or exists(select 1 from public.verified_question_registry_taxonomy tx where tx.question_id=q.id and tx.atomic_subskill_node_id=p_focus and tx.question_content_hash=q.current_content_hash and tx.review_status='approved'));
$$;
revoke all on function private.retention_trial_candidates(integer,uuid) from public,anon,authenticated;
create function public.rpc_retention_trial_start(p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;r private.retention_trial_runs;prev private.retention_trial_runs;focus uuid;focus_label text;grade_no integer;diff text;subj text;qs jsonb;
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) then raise exception 'TRIAL_PAUSED';end if;
 select * into u from public.users where id=auth.uid();
 if u.role<>'student' or p_kind is null or p_kind not in('drop','rescue','comeback') then raise exception 'NOT_AUTHORIZED';end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id::text,706));
 select * into r from private.retention_trial_runs where user_id=u.id and kind=p_kind and completed_at is null and started_at>now()-interval '24 hours' order by started_at desc limit 1;
 if r.id is null then
  if(select count(*) from private.retention_trial_runs where user_id=u.id and started_at>=(date_trunc('day',now() at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek'))>=3 then raise exception 'DAILY_LIMIT';end if;
  if coalesce(u.grade,'') !~ '^([1-9]|1[012])$' then raise exception 'GRADE_REQUIRED';end if;grade_no:=u.grade::integer;
  if p_kind='comeback' then
   select * into prev from private.retention_trial_runs where user_id=u.id and completed_at is not null order by completed_at desc limit 1;
   if prev.id is null then raise exception 'BASELINE_REQUIRED';end if;
   if prev.focus_id is null then raise exception 'POOL_NOT_READY';end if;
   focus:=prev.focus_id;focus_label:=prev.focus_name;diff:=prev.difficulty;select q->>'subject' into subj from jsonb_array_elements(prev.questions) q limit 1;
  elsif p_kind='rescue' then
   select e.atomic_subskill_node_id,n.name into focus,focus_label from public.student_learning_registry_item_evidence e join public.academic_skill_registry_nodes n on n.id=e.atomic_subskill_node_id and n.status='active' join public.school_academic_years y on y.id=e.academic_year_id and y.status='current' where e.student_id=u.id and e.school_id=u.school_id and e.answered_at>=now()-interval '90 days' group by e.atomic_subskill_node_id,n.name having count(*)>=3 and count(*) filter(where not e.is_correct)>=2 order by count(*) filter(where not e.is_correct) desc,max(e.answered_at) desc limit 1;
   if focus is null then raise exception 'FOCUS_NOT_READY';end if;
  else
   select tx.atomic_subskill_node_id,n.name,q.difficulty,q.subject into focus,focus_label,diff,subj from private.retention_trial_candidates(grade_no,null) q join public.verified_question_registry_taxonomy tx on tx.question_id=q.id and tx.question_content_hash=q.current_content_hash and tx.review_status='approved' join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id and n.status='active' group by tx.atomic_subskill_node_id,n.name,q.difficulty,q.subject having count(distinct q.id)>=10 order by case when lower(q.subject)='english' then 0 else 1 end,md5(tx.atomic_subskill_node_id::text||date_trunc('week',now() at time zone 'Asia/Bishkek')::text) limit 1;
  end if;
  if diff is null then select q.difficulty,q.subject into diff,subj from private.retention_trial_candidates(grade_no,focus) q group by q.difficulty,q.subject having count(*)>=5 order by case when lower(q.subject)='english' then 0 else 1 end,q.difficulty limit 1;end if;
  select jsonb_agg(to_jsonb(c)) into qs from(select q.id,q.question_text,q.options,q.correct_answer,q.explanation,q.subject,q.difficulty from private.retention_trial_candidates(grade_no,focus) q where q.subject=subj and q.difficulty=diff and (prev.id is null or not exists(select 1 from jsonb_array_elements(prev.questions) pq where pq->>'id'=q.id::text)) order by md5(q.id::text||u.id::text||date_trunc('week',now() at time zone 'Asia/Bishkek')::text||coalesce(prev.id::text,p_kind)) limit 5)c;
  if coalesce(jsonb_array_length(qs),0)<>5 then raise exception 'POOL_NOT_READY';end if;
  insert into private.retention_trial_runs(user_id,kind,focus_id,focus_name,difficulty,questions) values(u.id,p_kind,focus,coalesce(focus_label,subj||' · '||diff||' practice'),diff,qs) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'kind',r.kind,'focus_name',r.focus_name,'questions',(select jsonb_agg(q-'correct_answer'-'explanation') from jsonb_array_elements(r.questions) q));
end $$;
revoke all on function public.rpc_retention_trial_start(text) from public,anon;
grant execute on function public.rpc_retention_trial_start(text) to authenticated;
create function public.rpc_retention_trial_finish(p_run_id uuid,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.retention_trial_runs;prev_score integer;score integer;
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) then raise exception 'TRIAL_PAUSED';end if;
 select * into r from private.retention_trial_runs where id=p_run_id and user_id=auth.uid() for update;
 if r.id is null then raise exception 'NOT_AUTHORIZED';end if;
 if r.completed_at is null then
  if r.started_at<now()-interval '24 hours' then raise exception 'RUN_EXPIRED';end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>5 then raise exception 'INVALID_ANSWERS';end if;
  if exists(select 1 from jsonb_array_elements(r.questions) with ordinality q(value,idx) where p_answers->(idx::integer-1) is null or jsonb_typeof(p_answers->(idx::integer-1))<>'string' or not(p_answers->>(idx::integer-1) in(select jsonb_array_elements_text(value->'options')))) then raise exception 'INVALID_ANSWERS';end if;
  select count(*) into score from jsonb_array_elements(r.questions) with ordinality q(value,idx) where value->>'correct_answer'=p_answers->>(idx::integer-1);
  update private.retention_trial_runs set correct=score,answers=p_answers,completed_at=now() where id=r.id returning * into r;
  delete from private.retention_trial_cache where user_id=auth.uid();
 end if;
 select p.correct into prev_score from private.retention_trial_runs p where p.user_id=auth.uid() and p.completed_at<r.started_at and r.focus_id is not null and p.focus_id=r.focus_id and p.difficulty=r.difficulty and not exists(select 1 from jsonb_array_elements(p.questions) a join jsonb_array_elements(r.questions) b on a->>'id'=b->>'id') order by p.completed_at desc limit 1;
 return jsonb_build_object('id',r.id,'correct',r.correct,'total',5,'previous_correct',prev_score,'questions',r.questions,'answers',r.answers);
end $$;
revoke all on function public.rpc_retention_trial_finish(uuid,jsonb) from public,anon;
grant execute on function public.rpc_retention_trial_finish(uuid,jsonb) to authenticated;
create function public.rpc_retention_trial_kudos(p_assignment_id uuid,p_message_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare teacher_uid uuid;
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) then raise exception 'TRIAL_PAUSED';end if;
 if p_message_key is null or p_message_key not in('clear','helpful','thanks') then raise exception 'INVALID_MESSAGE';end if;
 select t.user_id into teacher_uid from public.student_assignment_results r join public.assignments a on a.id=r.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=r.student_id where r.student_id=auth.uid() and r.assignment_id=p_assignment_id and u.role='student' and a.school_id=u.school_id and coalesce(r.pending_review_count,0)=0 and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=r.assignment_id and q.student_id=r.student_id);
 if teacher_uid is null then raise exception 'COMPLETION_REQUIRED';end if;
 insert into private.retention_trial_kudos values(auth.uid(),p_assignment_id,teacher_uid,p_message_key,now()) on conflict do nothing;
 delete from private.retention_trial_cache where user_id in(auth.uid(),teacher_uid);return true;
end $$;
revoke all on function public.rpc_retention_trial_kudos(uuid,text) from public,anon;
grant execute on function public.rpc_retention_trial_kudos(uuid,text) to authenticated;
create function public.rpc_retention_trial_events(p_kinds text[]) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) or coalesce(cardinality(p_kinds),0)>6 then return false;end if;
 insert into private.retention_trial_events(user_id,kind) select auth.uid(),kind from(select distinct unnest(p_kinds) kind)e where kind in('student_view','teacher_view','next_move','profile_open','radar_open','wrap_open') on conflict do nothing;return true;
end $$;
revoke all on function public.rpc_retention_trial_events(text[]) from public,anon;
grant execute on function public.rpc_retention_trial_events(text[]) to authenticated;
create function public.rpc_retention_trial_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;data jsonb;month_start timestamptz;week_start timestamptz;
begin
 if auth.uid() is null then raise exception 'NOT_AUTHENTICATED';end if;
 if not private.retention_trial_allowed(auth.uid()) then return jsonb_build_object('enabled',false);end if;
 select * into u from public.users where id=auth.uid();select payload into data from private.retention_trial_cache where user_id=u.id and expires_at>now();if data is not null then return data;end if;
 month_start:=date_trunc('month',now() at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek';week_start:=date_trunc('week',now() at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek';
 if u.role='student' then
  with results as(select r.* from public.student_assignment_results r join public.assignments a on a.id=r.assignment_id where r.student_id=u.id and a.school_id=u.school_id and r.completed_at>=month_start and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=r.assignment_id and q.student_id=r.student_id)),practice as(select * from private.retention_trial_runs where user_id=u.id and completed_at>=month_start),recent as(select id,kind,focus_id,focus_name,difficulty,correct,completed_at from private.retention_trial_runs where user_id=u.id and completed_at is not null order by completed_at desc limit 6),va as(select a.id,a.title from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id where sa.student_id=u.id and a.school_id=u.school_id and a.assigned_at>=week_start and a.assigned_at<=now() and a.publish_status='published' order by a.assigned_at desc limit 1),vault as(select va.title,count(*) total,count(*) filter(where sa.status='completed') completed from va join public.student_assignments sa on sa.assignment_id=va.id group by va.title),gratitude as(select a.id assignment_id,coalesce(a.title,a.topic_name,'Your lesson') title,tu.username teacher_name,exists(select 1 from private.retention_trial_kudos k where k.student_id=u.id and k.assignment_id=a.id) sent from public.student_assignment_results r join public.assignments a on a.id=r.assignment_id join public.teachers t on t.id=a.teacher_id join public.users tu on tu.id=t.user_id where r.student_id=u.id and a.school_id=u.school_id and r.completed_at>=month_start and coalesce(r.pending_review_count,0)=0 and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=r.assignment_id and q.student_id=r.student_id) order by r.completed_at desc limit 3)
  select jsonb_build_object('enabled',true,'role','student','generated_at',now(),'period_start',month_start,'online_assignments',(select count(*) from results where completion_source='online'),'paper_assignments',(select count(*) from results where completion_source='paper'),'practice_runs',(select count(*) from practice),'lifetime_runs',(select count(*) from private.retention_trial_runs where user_id=u.id and completed_at is not null),'practice_questions',(select count(*)*5 from practice),'active_days',(select count(distinct active_day) from(select (completed_at at time zone 'Asia/Bishkek')::date active_day from practice union select (completed_at at time zone 'Asia/Bishkek')::date from results where completion_source='online')days),'recent_runs',(select coalesce(jsonb_agg(to_jsonb(recent)),'[]') from recent),'vault',(select to_jsonb(vault) from vault),'gratitude',(select coalesce(jsonb_agg(to_jsonb(gratitude)),'[]') from gratitude)) into data;
 else
  select jsonb_build_object('enabled',true,'role','teacher','generated_at',now(),'period_start',week_start,'kudos_total',(select count(*) from private.retention_trial_kudos where teacher_user_id=u.id and created_at>=week_start),'kudos',(select coalesce(jsonb_agg(to_jsonb(k)),'[]') from(select message_key,count(*) count from private.retention_trial_kudos where teacher_user_id=u.id and created_at>=week_start group by message_key)k)) into data;
 end if;
 insert into private.retention_trial_cache values(u.id,data,now()+interval '5 minutes') on conflict(user_id) do update set payload=excluded.payload,expires_at=excluded.expires_at;return data;
end $$;
revoke all on function public.rpc_retention_trial_snapshot() from public,anon;
grant execute on function public.rpc_retention_trial_snapshot() to authenticated;
create function public.rpc_retention_trial_metrics() returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb;
begin
 if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED';end if;
 with actions as(
 select student_id user_id,completed_at at time zone 'Asia/Bishkek' at_time,'student' role from public.student_assignment_results r where completed_at>=now()-interval '42 days' and completion_source='online' and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=r.assignment_id and q.student_id=r.student_id)
 union all select user_id,completed_at at time zone 'Asia/Bishkek','student' from public.quest_runs where completed_at>=now()-interval '42 days' and status='completed'
 union all select user_id,completed_at at time zone 'Asia/Bishkek','student' from private.retention_trial_runs where completed_at>=now()-interval '42 days'
 union all select t.user_id,a.created_at at time zone 'Asia/Bishkek','teacher' from public.assignments a join public.teachers t on t.id=a.teacher_id where a.created_at>=now()-interval '42 days'
 union all select recorded_by,confirmed_at at time zone 'Asia/Bishkek','teacher' from public.assignment_paper_submissions where confirmed_at>=now()-interval '42 days'
 ),valid as(select a.* from actions a join public.users u on u.id=a.user_id where not coalesce(u.is_banned,false) and (a.role<>'student' or u.role='student')),firsts as(select user_id,role,date_trunc('week',min(at_time)) first_week from valid group by user_id,role),cohorts as(select f.role,f.first_week,count(*) users,count(*) filter(where exists(select 1 from valid a where a.user_id=f.user_id and a.at_time>=f.first_week+interval '7 days' and a.at_time<f.first_week+interval '14 days')) week_one,count(*) filter(where exists(select 1 from valid a where a.user_id=f.user_id and a.at_time>=f.first_week+interval '28 days' and a.at_time<f.first_week+interval '35 days')) week_four from firsts f group by f.role,f.first_week),weekly as(select role,date_trunc('week',at_time) week,count(distinct user_id) users from valid group by role,date_trunc('week',at_time))
 select jsonb_build_object('generated_at',now(),'cohort_definition','First meaningful action observed in this 42-day window; not signup cohorts.','weekly',(select coalesce(jsonb_agg(to_jsonb(w) order by week),'[]') from weekly w),'cohorts',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('week_one_mature',first_week+interval '14 days'<=now() at time zone 'Asia/Bishkek','week_four_mature',first_week+interval '35 days'<=now() at time zone 'Asia/Bishkek') order by first_week),'[]') from cohorts c),'paper_completions',(select count(*) from public.student_assignment_results where completed_at>=now()-interval '42 days' and completion_source='paper'),'views',(select count(*) from private.retention_trial_events where event_day>=(now() at time zone 'Asia/Bishkek')::date-42 and kind in('student_view','teacher_view'))) into data;return data;
end $$;
revoke all on function public.rpc_retention_trial_metrics() from public,anon;
grant execute on function public.rpc_retention_trial_metrics() to authenticated;
