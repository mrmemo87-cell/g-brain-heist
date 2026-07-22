-- Verified student identity for school examinations.
alter table public.users
  add column if not exists full_name text,
  add column if not exists full_name_status text not null default 'pending',
  add column if not exists full_name_verified_at timestamptz,
  add column if not exists full_name_verified_by uuid references public.users(id) on delete set null;

alter table public.users drop constraint if exists users_full_name_status_check;
alter table public.users add constraint users_full_name_status_check
  check (full_name_status in ('pending','verified','rejected'));

create or replace function public.submit_my_full_name(p_full_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_name text := regexp_replace(trim(coalesce(p_full_name,'')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  if length(v_name)<5 or position(' ' in v_name)=0 then return jsonb_build_object('success',false,'error','Enter your real first and last name'); end if;
  if length(v_name)>120 then return jsonb_build_object('success',false,'error','Name is too long'); end if;
  update users set full_name=v_name,full_name_status='pending',full_name_verified_at=null,full_name_verified_by=null,updated_at=now()
  where id=auth.uid() and role='student';
  if not found then return jsonb_build_object('success',false,'error','Only students can submit a real name'); end if;
  return jsonb_build_object('success',true,'status','pending');
end $$;
revoke all on function public.submit_my_full_name(text) from public;
grant execute on function public.submit_my_full_name(text) to authenticated;

create or replace function public.school_admin_verify_student_full_name(p_student_id uuid,p_approved boolean,p_corrected_full_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid(); v_school uuid; v_name text;
begin
  select sm.school_id into v_school from school_members sm
  where sm.user_id=v_admin and sm.role_in_school='school_admin' and sm.status='active'
  and exists(select 1 from school_members t where t.school_id=sm.school_id and t.user_id=p_student_id and t.role_in_school='student' and t.status='active') limit 1;
  if v_school is null and not is_superadmin(v_admin) then return jsonb_build_object('success',false,'error','Student is not in your school'); end if;
  select regexp_replace(trim(coalesce(p_corrected_full_name,full_name,'')), '\s+', ' ', 'g') into v_name from users where id=p_student_id and role='student';
  if p_approved and (length(v_name)<5 or position(' ' in v_name)=0) then return jsonb_build_object('success',false,'error','A first and last name are required'); end if;
  update users set full_name=nullif(v_name,''),full_name_status=case when p_approved then 'verified' else 'rejected' end,
    full_name_verified_at=case when p_approved then now() else null end,full_name_verified_by=case when p_approved then v_admin else null end,updated_at=now()
  where id=p_student_id and role='student';
  if not found then return jsonb_build_object('success',false,'error','Student not found'); end if;
  return jsonb_build_object('success',true,'status',case when p_approved then 'verified' else 'rejected' end,'full_name',nullif(v_name,''));
end $$;
revoke all on function public.school_admin_verify_student_full_name(uuid,boolean,text) from public;
grant execute on function public.school_admin_verify_student_full_name(uuid,boolean,text) to authenticated;

create or replace function public.get_my_cambridge_exam_identity()
returns jsonb language sql security definer set search_path=public stable as $$
  select case
    when u.id is null then jsonb_build_object('success',false,'error','Not authenticated')
    when u.role<>'student' then jsonb_build_object('success',false,'error','Cambridge tests are for students')
    when u.full_name_status<>'verified' or nullif(trim(u.full_name),'') is null
      then jsonb_build_object('success',false,'error','Your real name must be confirmed by your school administrator before starting a Cambridge test','status',u.full_name_status)
    else jsonb_build_object('success',true,'name',u.full_name,'class',coalesce(u.batch,'N/A'),'grade',u.grade,'schoolId',u.school_id,'userId',u.id) end
  from (select auth.uid() id) a left join users u on u.id=a.id
$$;
revoke all on function public.get_my_cambridge_exam_identity() from public;
grant execute on function public.get_my_cambridge_exam_identity() to authenticated;

create or replace function public.school_admin_get_member_names()
returns jsonb language plpgsql security definer set search_path=public stable as $$
declare v_admin uuid:=auth.uid(); v_school uuid; v_rows jsonb;
begin
  select school_id into v_school from school_members where user_id=v_admin and role_in_school='school_admin' and status='active' order by joined_at limit 1;
  if v_school is null and not is_superadmin(v_admin) then return jsonb_build_object('success',false,'error','Access denied'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'full_name',u.full_name,'full_name_status',u.full_name_status)),'[]'::jsonb)
  into v_rows from school_members sm join users u on u.id=sm.user_id
  where (v_school is null or sm.school_id=v_school) and sm.status='active' and sm.role_in_school='student';
  return jsonb_build_object('success',true,'members',v_rows);
end $$;
revoke all on function public.school_admin_get_member_names() from public;
grant execute on function public.school_admin_get_member_names() to authenticated;
