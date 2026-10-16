create function public.rpc_retention_crew_signal(p_assignment_id uuid,p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); user_role text;
begin
 if uid is null or not private.retention_trial_allowed(uid) then raise exception 'TRIAL_PAUSED';end if;
 if not private.retention_crew_access(uid,p_assignment_id) then raise exception 'NOT_AUTHORIZED';end if;
 select role into user_role from public.users where id=uid;
 if p_kind is null or (user_role='student' and p_kind not in('cheer','together','nice_work'))
 or(user_role='teacher' and p_kind not in('keep_going','proud','curiosity')) then raise exception 'INVALID_SIGNAL';end if;
 -- One preset per person/assignment/Bishkek day. Retrying cannot add another.
 insert into private.retention_crew_signals(assignment_id,user_id,kind) values(p_assignment_id,uid,p_kind) on conflict do nothing;
 return true;
end $$;
revoke all on function public.rpc_retention_crew_signal(uuid,text) from public,anon;
grant execute on function public.rpc_retention_crew_signal(uuid,text) to authenticated;

create function public.rpc_retention_companion_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); user_role text; user_school uuid; profile jsonb; crews jsonb; memories jsonb;
begin
 if uid is null then raise exception 'NOT_AUTHENTICATED';end if;
 if not private.retention_trial_allowed(uid) then return jsonb_build_object('enabled',false);end if;
 select role,school_id into user_role,user_school from public.users where id=uid;
 if user_role not in('student','teacher') then return jsonb_build_object('enabled',true,'crews','[]'::jsonb,'memories','[]'::jsonb);end if;
 select jsonb_build_object('name',name,'palette',palette) into profile from private.retention_companions where user_id=uid;
 with mine as(
 select a.id,a.title,a.assigned_at from public.assignments a
 where a.school_id=user_school and a.publish_status='published'
 and a.assigned_at>=now()-interval '90 days' and a.assigned_at<=now()
 and ((user_role='student' and exists(select 1 from public.student_assignments sa where sa.student_id=uid and sa.assignment_id=a.id)) or(user_role='teacher' and exists(select 1 from public.teachers t where t.user_id=uid and t.id=a.teacher_id)))
 and private.retention_crew_access(uid,a.id)
 order by a.assigned_at desc,a.id limit 12
 ), crew as(
 select m.id,m.title,m.assigned_at,
 (select count(*) from public.student_assignments sa where sa.assignment_id=m.id and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=sa.assignment_id and q.student_id=sa.student_id)) total,
 (select count(*) from public.student_assignments sa where sa.assignment_id=m.id and sa.status='completed' and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=sa.assignment_id and q.student_id=sa.student_id)) completed,
 exists(select 1 from private.retention_crew_signals s where s.assignment_id=m.id and s.user_id=uid and s.signal_day=(now() at time zone 'Asia/Bishkek')::date) sent_today,
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(
 select kind,count(*) count from private.retention_crew_signals where assignment_id=m.id and kind in('cheer','together','nice_work') and created_at>=now()-interval '7 days' group by kind)s) cheers,
 (select jsonb_build_object('kind',s.kind,'teacher_name',u.username,'created_at',s.created_at) from private.retention_crew_signals s join public.users u on u.id=s.user_id join public.assignments a on a.id=s.assignment_id join public.teachers t on t.id=a.teacher_id and t.user_id=s.user_id where s.assignment_id=m.id and s.kind in('keep_going','proud','curiosity') order by s.created_at desc limit 1) encouragement
 from mine m)
 select coalesce(jsonb_agg(to_jsonb(crew) order by assigned_at desc,id),'[]') into crews from crew;
 -- Private keepsakes retain the latest 12 real teacher encouragements (not expiry rewards).
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into memories from(
 select a.title,s.kind,u.username teacher_name,s.created_at from private.retention_crew_signals s
 join public.assignments a on a.id=s.assignment_id join public.teachers t on t.id=a.teacher_id and t.user_id=s.user_id
 join public.users u on u.id=t.user_id
 where a.school_id=user_school and s.kind in('keep_going','proud','curiosity')
 and ((user_role='student' and exists(select 1 from public.student_assignments sa where sa.student_id=uid and sa.assignment_id=a.id)) or(user_role='teacher' and t.user_id=uid))
 and private.retention_crew_access(uid,a.id)
 order by s.created_at desc limit 12)x;
 return jsonb_build_object('enabled',true,'companion',coalesce(profile,jsonb_build_object('name','Echo','palette','cyan')),'crews',crews,'memories',memories,'generated_at',now());
end $$;
revoke all on function public.rpc_retention_companion_snapshot() from public,anon;
grant execute on function public.rpc_retention_companion_snapshot() to authenticated;
