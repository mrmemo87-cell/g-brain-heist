-- Existing IELTS access elsewhere cannot grant access to former-school work.
create or replace function private.can_access_ielts_learning(p_id uuid,p_write_teacher boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.ielts_learning_allocations a
 join public.users actor on actor.id=auth.uid()
 where a.id=p_id and not coalesce(actor.is_banned,false)
 and exists(select 1 from public.school_members m where m.school_id=a.school_id and m.user_id=a.student_id and m.status='active')
 and private.ielts_speaking_student_eligible(a.student_id)
 and (public.can_manage_ielts_practice_school(a.school_id)
 or (not p_write_teacher and a.student_id=auth.uid())));
$$;
revoke all on function private.can_access_ielts_learning(uuid,boolean) from public,anon,authenticated,service_role;
