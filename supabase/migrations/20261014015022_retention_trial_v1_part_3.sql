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
