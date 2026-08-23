-- Parent dashboard identity polish: return the student's existing Brains Heist avatar
-- through the already verified, guardian-scoped child list RPC.
-- No raw users table access is granted to guardians.

create or replace function public.rpc_guardian_my_children()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id',r.id,
    'student_id',u.id,
    'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
    'relationship_label',r.relationship_label,
    'grade',u.grade,
    'class_name',coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
    'school_id',s.id,
    'school_name',s.name,
    'school_logo_url',s.logo_url,
    'avatar_url',u.avatar_url,
    'verified_at',r.verified_at
  ) order by s.name,coalesce(u.full_name,u.username)),'[]'::jsonb)
  into v_result
  from public.student_guardian_relationships r
  join public.users u on u.id=r.student_id
  join public.schools s on s.id=r.school_id
  left join public.class_students cs on cs.student_id=u.id
  left join public.classes c on c.id=cs.class_id and c.school_id=r.school_id and c.is_active is true
  where r.guardian_user_id=v_caller and r.status='active';

  return v_result;
end;
$$;

revoke all on function public.rpc_guardian_my_children() from public, anon, authenticated;
grant execute on function public.rpc_guardian_my_children() to authenticated, service_role;
