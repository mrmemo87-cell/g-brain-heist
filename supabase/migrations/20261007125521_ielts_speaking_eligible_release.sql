-- Bible 1.2.0. Owner accepted the Speaking test and explicitly requested publication.
-- Release metadata is separate from the immutable, already approved content.
create table private.ielts_speaking_releases (
 package_code text primary key references private.ielts_speaking_packages(code),
 content_hash text not null, authorized_by uuid not null references public.users(id),
 published_at timestamptz not null default now(), acceptance_note text not null
);
alter table private.ielts_speaking_releases enable row level security;
revoke all on private.ielts_speaking_releases from public,anon,authenticated,service_role;
create trigger speaking_release_history before update or delete on private.ielts_speaking_releases
 for each row execute function private.guard_ielts_speaking_history();

create function public.rpc_ielts_speaking_workspace(p_student_id uuid default null,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.ielts_speaking_packages; chosen uuid; teacher boolean; released boolean; students jsonb; rows jsonb; begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into p from private.ielts_speaking_packages where code='bh-speaking-interview-a';
 released:=p.approved_at is not null and exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash);
 if private.ielts_speaking_student_eligible(auth.uid()) then
   if p_student_id is not null and p_student_id<>auth.uid() then raise exception using errcode='42501',message='not_authorized'; end if;
   if not released and auth.uid()<>p.pilot_student then return jsonb_build_object('available',false); end if;
   chosen:=auth.uid(); teacher:=false; students:='[]'::jsonb;
 else
   -- Filter school before invoking the canonical reviewer predicate. Never list another school's students.
   select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.username) order by u.username,u.id),'[]'::jsonb) into students
   from (select u.id,u.username from public.users u where u.role='student'
     and (public.is_superadmin(auth.uid()) or u.school_id=(select school_id from public.users where id=auth.uid()))
     and (released or u.id=p.pilot_student) and private.can_review_ielts_speaking_student(u.id)
     and (coalesce(p_search,'')='' or position(lower(left(p_search,80)) in lower(coalesce(u.username,'')))>0)
     order by u.username,u.id limit 50) u;
   chosen:=coalesce(p_student_id,(students->0->>'id')::uuid);
   if chosen is null then
     -- A search without matches must not turn an authorized workspace into an access error.
     if p_search<>'' and exists(select 1 from public.users u where u.role='student' and (public.is_superadmin(auth.uid()) or u.school_id=(select school_id from public.users where id=auth.uid())) and (released or u.id=p.pilot_student) and private.can_review_ielts_speaking_student(u.id)) then return jsonb_build_object('available',true,'can_teacher',true,'approved',p.approved_at is not null,'published',released,'students',students,'sessions','[]'::jsonb); end if;
     return jsonb_build_object('available',false);
   end if;
   if (not released and chosen<>p.pilot_student) or not private.can_review_ielts_speaking_student(chosen) then raise exception using errcode='42501',message='not_authorized'; end if;
   teacher:=true;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into rows from
 (select s.id,s.status,s.created_at,s.evidence_kind,exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id) as reviewed
 from private.ielts_speaking_sessions s where s.student_id=chosen and private.can_access_ielts_speaking(s.id) order by s.created_at desc limit 100) x;
 return jsonb_build_object('available',true,'can_teacher',teacher,'can_approve',teacher and public.is_superadmin(auth.uid()),
 'approved',p.approved_at is not null,'published',released,'content_hash',p.content_hash,'package',case when teacher then p.content else null end,
 'student_name',(select username from public.users where id=chosen),'student_id',chosen,'students',students,'sessions',rows);
end; $$;

-- Keep the existing home endpoint compatible with the deployed pilot client.
create or replace function public.rpc_ielts_speaking_home() returns jsonb
language sql stable security definer set search_path='' as $$
 select public.rpc_ielts_speaking_workspace(case when private.can_review_ielts_speaking_student((select pilot_student from private.ielts_speaking_packages where code='bh-speaking-interview-a')) then (select pilot_student from private.ielts_speaking_packages where code='bh-speaking-interview-a') else null end);
$$;

create function public.rpc_ielts_start_speaking_interview(p_student_id uuid,p_session_id uuid,p_consent boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; s private.ielts_speaking_sessions; begin
 select * into p from private.ielts_speaking_packages where code='bh-speaking-interview-a';
 if not private.can_review_ielts_speaking_student(p_student_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p.approved_at is null or p_consent is distinct from true then raise exception 'speaking_review_and_consent_required'; end if;
 if p_student_id<>p.pilot_student and not exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash) then raise exception 'speaking_not_published'; end if;
 if p_session_id is null then raise exception 'speaking_session_id_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text,0));
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if found then if s.teacher_id<>auth.uid() or s.student_id<>p_student_id then raise exception 'speaking_session_conflict'; end if; return s.id; end if;
 select * into s from private.ielts_speaking_sessions where student_id=p_student_id and status='in_progress' order by created_at desc limit 1;
 if found then if s.teacher_id<>auth.uid() then raise exception 'speaking_interview_already_started'; end if; return s.id; end if;
 insert into private.ielts_speaking_sessions(id,student_id,teacher_id,school_id,package_code,content_hash,package_snapshot,evidence_kind,recording_consent)
 values(p_session_id,p_student_id,auth.uid(),(select school_id from public.users where id=p_student_id),p.code,p.content_hash,p.content,
 case when exists(select 1 from private.ielts_speaking_sessions where student_id=p_student_id and package_code=p.code and status='submitted') then 'same_form_practice' else 'first_sitting' end,true);
 return p_session_id;
end; $$;

revoke all on function public.rpc_ielts_speaking_workspace(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_speaking_interview(uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_home() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_home() to authenticated;
grant execute on function public.rpc_ielts_speaking_workspace(uuid,text),public.rpc_ielts_start_speaking_interview(uuid,uuid,boolean) to authenticated;

-- Actual owner approval/accepted pilot must exist; no generated reviewer identity or fabricated device checks.
insert into private.ielts_speaking_releases(package_code,content_hash,authorized_by,acceptance_note)
select p.code,p.content_hash,p.approved_by,
 'Owner reported Speaking test completed successfully with Gulzada on 2026-10-07 and explicitly authorized wider publication. Teacher-led development snapshot; no band or calibration claim. Device-specific acceptance details were not supplied.'
from private.ielts_speaking_packages p where p.code='bh-speaking-interview-a' and p.approved_at is not null
 and exists(select 1 from private.ielts_speaking_sessions s join private.ielts_speaking_reviews r on r.session_id=s.id
 join private.ielts_speaking_ai_drafts d on d.session_id=s.id and d.state='ready'
 where s.student_id=p.pilot_student and s.content_hash=p.content_hash and s.status='submitted' and r.teacher_confirmed);

notify pgrst,'reload schema';
