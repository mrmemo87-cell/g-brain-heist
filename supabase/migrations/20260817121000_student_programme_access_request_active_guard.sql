-- A student cannot create an advisory request after programme access is already active.
create or replace function public.student_request_programme_access(p_module_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid());
  v_school_id uuid;
  v_student_name text;
  v_school_name text;
  v_reason text;
  v_request_id uuid;
  v_admin record;
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_module_key not in ('cambridge','ielts','writing') then
    return jsonb_build_object('success',false,'error','Choose a valid programme.');
  end if;

  select u.school_id,coalesce(nullif(trim(u.full_name),''),u.username),s.name
    into v_school_id,v_student_name,v_school_name
  from public.users u
  join public.schools s on s.id=u.school_id and coalesce(s.status,'active')='active'
  join public.school_members sm on sm.school_id=u.school_id and sm.user_id=u.id
    and coalesce(sm.status,'active')='active'
  where u.id=v_actor and u.role='student';
  if v_school_id is null then
    return jsonb_build_object('success',false,'error','Only an active school student can request programme access.');
  end if;
  if public.school_has_module_access(v_school_id,p_module_key)
    and private.student_has_programme_seat(v_school_id,p_module_key,v_actor) then
    return jsonb_build_object('success',false,'error','You already have access to this programme.');
  end if;

  v_reason:=case when public.school_has_module_access(v_school_id,p_module_key)
    then 'seat_not_allocated' else 'not_purchased' end;
  insert into public.school_programme_access_requests(school_id,student_user_id,module_key,access_reason)
  values(v_school_id,v_actor,p_module_key,v_reason)
  on conflict (school_id,student_user_id,module_key) where status='pending' do nothing
  returning id into v_request_id;
  if v_request_id is null then
    select id into v_request_id from public.school_programme_access_requests
    where school_id=v_school_id and student_user_id=v_actor and module_key=p_module_key and status='pending';
    return jsonb_build_object('success',true,'status','already_pending','request_id',v_request_id);
  end if;

  insert into public.notifications(user_id,type,title,message,data,priority,read)
  select sm.user_id,'school_head_decision','Student programme request',
    v_student_name||' asked to join '||initcap(p_module_key)||'.',
    jsonb_build_object('request_id',v_request_id,'school_id',v_school_id,'student_id',v_actor,
      'module_key',p_module_key,'access_reason',v_reason,'destination','programme_seats'),'medium',false
  from public.school_members sm
  where sm.school_id=v_school_id and coalesce(sm.status,'active')='active'
    and (sm.role_in_school='school_admin' or sm.is_owner);
  for v_admin in select distinct sm.user_id from public.school_members sm
    where sm.school_id=v_school_id and coalesce(sm.status,'active')='active'
      and (sm.role_in_school='school_admin' or sm.is_owner)
  loop
    perform private.enqueue_transactional_email(
      'student_programme_access_requested','school_operations','school_admin','programme_access_requested',
      'programme-access-request:'||v_request_id::text||':'||v_admin.user_id::text,
      jsonb_build_object('student_name',v_student_name,'module_key',p_module_key,'access_reason',v_reason),
      v_admin.user_id,null,v_school_id,v_school_name,now());
  end loop;
  return jsonb_build_object('success',true,'status','created','request_id',v_request_id);
end;
$$;
revoke all on function public.student_request_programme_access(text) from public,anon,authenticated,service_role;
grant execute on function public.student_request_programme_access(text) to authenticated,service_role;
