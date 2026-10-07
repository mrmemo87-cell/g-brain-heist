-- Bible 1.2.0: school operations and explicit delegation, no scoring/content change.
create table private.ielts_programme_leads (
 id uuid primary key, school_id uuid not null references public.schools(id), teacher_id uuid not null references public.users(id),
 assigned_by uuid not null references public.users(id), assigned_at timestamptz not null default now(),
 revoked_by uuid references public.users(id), revoked_at timestamptz,
 check ((revoked_at is null)=(revoked_by is null))
);
create unique index ielts_one_current_lead on private.ielts_programme_leads(school_id) where revoked_at is null;
create index ielts_lead_teacher on private.ielts_programme_leads(teacher_id,school_id) where revoked_at is null;
create table private.ielts_programme_lead_changes (
 id uuid primary key, school_id uuid not null references public.schools(id), actor_id uuid not null references public.users(id),
 teacher_id uuid references public.users(id), expected_lead_id uuid, changed_at timestamptz not null default now()
);
alter table private.ielts_programme_leads enable row level security;
alter table private.ielts_programme_lead_changes enable row level security;
revoke all on private.ielts_programme_leads,private.ielts_programme_lead_changes from public,anon,authenticated,service_role;
create function private.guard_ielts_programme_lead_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or tg_table_name='ielts_programme_lead_changes' then raise exception 'ielts_lead_history_immutable'; end if;
 if old.revoked_at is not null
 or (to_jsonb(old)-array['revoked_at','revoked_by']) is distinct from (to_jsonb(new)-array['revoked_at','revoked_by'])
 or new.revoked_at is null or new.revoked_by is null then raise exception 'ielts_lead_history_immutable'; end if;
 return new;
end; $$;
create trigger lead_history before update or delete on private.ielts_programme_leads for each row execute function private.guard_ielts_programme_lead_history();
create trigger lead_change_history before update or delete on private.ielts_programme_lead_changes for each row execute function private.guard_ielts_programme_lead_history();

create function private.is_ielts_programme_lead(p_school_id uuid,p_actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select p_actor is not null and public.school_has_module_access(p_school_id,'ielts') and exists(
 select 1 from private.ielts_programme_leads l join public.users u on u.id=l.teacher_id
 join public.school_members m on m.user_id=u.id and m.school_id=l.school_id and m.status='active' and m.role_in_school='teacher'
 where l.school_id=p_school_id and l.teacher_id=p_actor and l.revoked_at is null and u.role='teacher' and not coalesce(u.is_banned,false));
$$;
create function private.can_allocate_ielts_lead(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.school_has_module_access(p_school_id,'ielts') and exists(
 select 1 from public.users u where u.id=auth.uid() and not coalesce(u.is_banned,false) and
 (public.is_superadmin(auth.uid()) or exists(select 1 from public.school_members m where m.user_id=u.id and m.school_id=p_school_id and m.status='active' and m.role_in_school in ('school_admin','admin','owner'))));
$$;

-- Extend school-specific operation gates, never global admin or content-publication roles.
create or replace function public.can_manage_ielts_practice_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.school_has_module_access(p_school_id,'ielts') and (
 private.is_ielts_programme_lead(p_school_id) or public.is_superadmin(auth.uid())
 or exists(select 1 from public.users u where u.id=auth.uid() and (coalesce(u.is_admin,false) or u.role in ('admin','superadmin') or (u.role='school_admin' and u.school_id=p_school_id)))
 or exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active' and sm.role_in_school in ('school_admin','admin','superadmin')));
$$;
create or replace function public.can_create_ielts_exam(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_superadmin(auth.uid()) or (public.school_has_module_access(p_school_id,'ielts') and (
 private.is_ielts_programme_lead(p_school_id)
 or exists(select 1 from public.users u where u.id=auth.uid() and (coalesce(u.is_admin,false) or u.role in ('admin','superadmin') or (u.role='school_admin' and u.school_id=p_school_id)))
 or exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active' and sm.role_in_school in ('school_admin','admin','superadmin'))));
$$;
create or replace function public.can_manage_ielts_exam(p_exam_event_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_superadmin(auth.uid()) or exists(select 1 from public.ielts_exam_events e where e.id=p_exam_event_id and e.school_id is not null and public.can_create_ielts_exam(e.school_id));
$$;
revoke all on function public.can_manage_ielts_practice_school(uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_create_ielts_exam(uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_manage_ielts_exam(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_manage_ielts_practice_school(uuid),public.can_create_ielts_exam(uuid),public.can_manage_ielts_exam(uuid) to authenticated;

-- Preserve exact existing reviewer rules and add only the delegated school scope.
do $patch$ declare name text; s text; anchor text; replacement text; begin
 foreach name in array array['can_review_ielts_speaking_student','can_review_ielts_writing_screener'] loop
   select pg_get_functiondef(p.oid) into s from pg_proc p where p.pronamespace='private'::regnamespace and p.proname=name;
   if name='can_review_ielts_speaking_student' then
     anchor:='public.is_superadmin(auth.uid()) or (u.school_id';
     replacement:='public.is_superadmin(auth.uid()) or private.is_ielts_programme_lead(u.school_id) or (u.school_id';
   else
     anchor:='public.is_superadmin(auth.uid())';
     replacement:='public.is_superadmin(auth.uid()) or private.is_ielts_programme_lead(e.school_id)';
   end if;
   if s is null or position(anchor in s)=0 then raise exception 'ielts_reviewer_patch_anchor_missing'; end if;
   execute replace(s,anchor,replacement);
 end loop;
end $patch$;
do $patch$ declare s text; anchor text; begin
 select pg_get_functiondef('public.rpc_ielts_speaking_workspace(uuid,text)'::regprocedure) into s;
 anchor:='public.is_superadmin(auth.uid()) or u.school_id=';
 if position(anchor in s)=0 then raise exception 'speaking_workspace_patch_anchor_missing'; end if;
 execute replace(s,anchor,'public.is_superadmin(auth.uid()) or private.is_ielts_programme_lead(u.school_id) or u.school_id=');
 select pg_get_functiondef('public.rpc_ielts_diagnostic_result(uuid)'::regprocedure) into s;
 anchor:='not public.can_manage_ielts_exam(a.exam_event_id)';
 if position(anchor in s)=0 then raise exception 'diagnostic_result_patch_anchor_missing'; end if;
 execute replace(s,anchor,anchor||' and not private.is_ielts_programme_lead(e.school_id) and not (private.can_review_ielts_speaking_student(e.student_id) and exists(select 1 from public.users u where u.id=e.student_id and u.school_id=e.school_id))');
end $patch$;
revoke all on function public.rpc_ielts_speaking_workspace(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_workspace(uuid,text) to authenticated;
revoke all on function public.rpc_ielts_diagnostic_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_diagnostic_result(uuid) to authenticated;
revoke all on function private.guard_ielts_programme_lead_history(),private.is_ielts_programme_lead(uuid,uuid),private.can_allocate_ielts_lead(uuid) from public,anon,authenticated,service_role;

create function public.rpc_ielts_programme_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('platform_owner',public.is_superadmin(auth.uid()),'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
 'can_allocate',private.can_allocate_ielts_lead(s.id),'can_manage',public.can_manage_ielts_practice_school(s.id)) order by s.name)
 from public.schools s where auth.uid() is not null and public.school_has_module_access(s.id,'ielts')
 and exists(select 1 from public.users actor where actor.id=auth.uid() and not coalesce(actor.is_banned,false))
 and (private.can_allocate_ielts_lead(s.id) or private.is_ielts_programme_lead(s.id)
 or exists(select 1 from public.users u where u.school_id=s.id and private.can_review_ielts_speaking_student(u.id)))),'[]'::jsonb));
$$;
revoke all on function public.rpc_ielts_programme_access() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_programme_access() to authenticated;

create function public.rpc_ielts_set_programme_lead(p_school_id uuid,p_teacher_id uuid,p_expected_lead_id uuid,p_change_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_id uuid; previous private.ielts_programme_lead_changes; begin
 if not private.can_allocate_ielts_lead(p_school_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_change_id is null then raise exception 'change_id_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-lead-'||p_school_id::text,0));
 select * into previous from private.ielts_programme_lead_changes where id=p_change_id;
 if found then
   if (previous.school_id,previous.actor_id,previous.teacher_id,previous.expected_lead_id) is distinct from (p_school_id,auth.uid(),p_teacher_id,p_expected_lead_id) then raise exception 'lead_change_conflict'; end if;
   return;
 end if;
 select id into current_id from private.ielts_programme_leads where school_id=p_school_id and revoked_at is null;
 if current_id is distinct from p_expected_lead_id then raise exception 'lead_changed_reload'; end if;
 if p_teacher_id is not null and not exists(select 1 from public.users u join public.school_members m on m.user_id=u.id
 where u.id=p_teacher_id and u.role='teacher' and not coalesce(u.is_banned,false) and m.school_id=p_school_id and m.status='active' and m.role_in_school='teacher') then raise exception 'active_school_teacher_required'; end if;
 if current_id is not null then update private.ielts_programme_leads set revoked_at=now(),revoked_by=auth.uid() where id=current_id; end if;
 insert into private.ielts_programme_lead_changes(id,school_id,actor_id,teacher_id,expected_lead_id) values(p_change_id,p_school_id,auth.uid(),p_teacher_id,p_expected_lead_id);
 if p_teacher_id is not null then insert into private.ielts_programme_leads(id,school_id,teacher_id,assigned_by) values(p_change_id,p_school_id,p_teacher_id,auth.uid()); end if;
end; $$;
revoke all on function public.rpc_ielts_set_programme_lead(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_set_programme_lead(uuid,uuid,uuid,uuid) to authenticated;

create index if not exists ielts_evidence_school_student on private.ielts_diagnostic_attempt_evidence(school_id,student_id,started_at desc);
create function public.rpc_ielts_programme_workspace(p_school_id uuid,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare access jsonb; rows jsonb; teachers jsonb; lead jsonb; queue jsonb; total integer; pending integer; classes jsonb; begin
 access:=public.rpc_ielts_programme_access();
 if not exists(select 1 from jsonb_array_elements(access->'schools') s where s->>'id'=p_school_id::text) then raise exception using errcode='42501',message='not_authorized'; end if;
 select jsonb_build_object('id',l.id,'teacher_id',l.teacher_id,'name',u.username,'assigned_at',l.assigned_at,
 'active',private.is_ielts_programme_lead(p_school_id,l.teacher_id)) into lead from private.ielts_programme_leads l join public.users u on u.id=l.teacher_id where l.school_id=p_school_id and l.revoked_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.username) order by u.username),'[]') into teachers
 from public.users u join public.school_members m on m.user_id=u.id and m.school_id=p_school_id and m.status='active' and m.role_in_school='teacher'
 where private.can_allocate_ielts_lead(p_school_id) and u.role='teacher' and not coalesce(u.is_banned,false);
 select count(*) into total from public.users u where u.school_id=p_school_id and private.can_review_ielts_speaking_student(u.id)
 and (coalesce(p_search,'')='' or position(lower(left(p_search,80)) in lower(coalesce(u.username,'')))>0);
 select coalesce(jsonb_agg(x.row order by x.name,x.id),'[]') into rows from (
 select u.id,u.username name,jsonb_build_object('id',u.id,'name',u.username,
 'listening',(select jsonb_build_object('attempt_id',e.attempt_id,'raw_score',r.raw_score,'total',r.marks_possible) from private.ielts_diagnostic_attempt_evidence e join private.ielts_diagnostic_scoring_runs r on r.attempt_id=e.attempt_id
   where e.student_id=u.id and e.school_id=p_school_id and e.form_snapshot#>>'{items,0,skill}'='listening' and not exists(select 1 from jsonb_array_elements(e.form_snapshot->'items') item where item->>'skill' is distinct from 'listening') order by r.created_at desc,r.run_version desc limit 1),
 'reading',(select jsonb_build_object('attempt_id',e.attempt_id,'raw_score',r.raw_score,'total',r.marks_possible) from private.ielts_diagnostic_attempt_evidence e join private.ielts_diagnostic_scoring_runs r on r.attempt_id=e.attempt_id
   where e.student_id=u.id and e.school_id=p_school_id and e.form_snapshot#>>'{items,0,skill}'='reading' and not exists(select 1 from jsonb_array_elements(e.form_snapshot->'items') item where item->>'skill' is distinct from 'reading') order by r.created_at desc,r.run_version desc limit 1),
 'writing',(select jsonb_build_object('attempt_id',w.attempt_id,'reviewed',exists(select 1 from private.ielts_writing_screener_reviews r where r.attempt_id=w.attempt_id)) from private.ielts_writing_screener_submissions w join private.ielts_diagnostic_attempt_evidence e on e.attempt_id=w.attempt_id
   where e.student_id=u.id and e.school_id=p_school_id and private.can_review_ielts_writing_screener(w.attempt_id) order by w.submitted_at desc limit 1),
 'speaking',(select jsonb_build_object('attempt_id',s.id,'status',s.status,'reviewed',exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id)) from private.ielts_speaking_sessions s
   where s.student_id=u.id and s.school_id=p_school_id and private.can_access_ielts_speaking(s.id) order by s.created_at desc limit 1)) row
 from public.users u where u.school_id=p_school_id and private.can_review_ielts_speaking_student(u.id)
 and (coalesce(p_search,'')='' or position(lower(left(p_search,80)) in lower(coalesce(u.username,'')))>0)
 order by u.username,u.id limit 50 offset greatest(0,least(coalesce(p_offset,0),100000))) x;
 with waiting as (
 select 'writing' skill,w.attempt_id,u.username name,w.submitted_at created_at from private.ielts_writing_screener_submissions w join private.ielts_diagnostic_attempt_evidence e on e.attempt_id=w.attempt_id join public.users u on u.id=e.student_id
 where e.school_id=p_school_id and private.can_review_ielts_writing_screener(w.attempt_id) and not exists(select 1 from private.ielts_writing_screener_reviews r where r.attempt_id=w.attempt_id)
 union all
 select 'speaking',s.id,u.username,s.submitted_at from private.ielts_speaking_sessions s join public.users u on u.id=s.student_id
 where s.school_id=p_school_id and s.status='submitted' and private.can_access_ielts_speaking(s.id) and not exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id)
 ) select (select count(*) from waiting),coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at) from (select * from waiting order by created_at limit 30) q),'[]') into pending,queue;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'class_name',c.class_name,'student_count',(select count(distinct cs.student_id) from public.class_students cs where cs.class_id=c.id and private.ielts_speaking_student_eligible(cs.student_id))) order by c.class_name),'[]') into classes
 from public.classes c where c.school_id=p_school_id and coalesce(c.is_active,true) and public.can_manage_ielts_practice_school(p_school_id);
 return jsonb_build_object('platform_owner',access->'platform_owner','schools',access->'schools','school_id',p_school_id,'can_allocate',private.can_allocate_ielts_lead(p_school_id),'can_manage',public.can_manage_ielts_practice_school(p_school_id),
 'lead',lead,'teachers',teachers,'students',rows,'total_students',total,'pending_count',pending,'queue',queue,'classes',classes,'confidence','low','readiness_available',false);
end; $$;
revoke all on function public.rpc_ielts_programme_workspace(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_programme_workspace(uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
