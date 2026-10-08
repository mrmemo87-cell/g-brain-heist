-- School-managed Speaking uses the same IELTS seat granted by school administration.
create or replace function private.ielts_speaking_student_eligible(p_student uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u
 where u.id=p_student and u.role='student' and not coalesce(u.is_banned,false)
 and (u.school_id is null or (
 public.school_has_module_access(u.school_id,'ielts')
 and private.student_has_programme_seat(u.school_id,'ielts',u.id)
 and exists(select 1 from public.school_members m
 where m.user_id=u.id and m.school_id=u.school_id and m.status='active'))));
$$;
revoke all on function private.ielts_speaking_student_eligible(uuid) from public,anon,authenticated,service_role;
