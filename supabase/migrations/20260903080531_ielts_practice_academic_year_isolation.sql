alter table public.ielts_practice_assignments
  add column if not exists academic_year_id uuid;

update public.ielts_practice_assignments a
set academic_year_id = public.academic_resolve_year_id(a.school_id,a.created_at)
where a.academic_year_id is null;

do $$
begin
  if exists(select 1 from public.ielts_practice_assignments where academic_year_id is null) then
    raise exception 'ielts_practice_academic_year_backfill_incomplete';
  end if;
end;
$$;

alter table public.ielts_practice_assignments
  alter column academic_year_id set not null;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.ielts_practice_assignments'::regclass and conname='ielts_practice_assignments_academic_year_id_fkey') then
    alter table public.ielts_practice_assignments
      add constraint ielts_practice_assignments_academic_year_id_fkey
      foreign key(academic_year_id) references public.school_academic_years(id) on delete restrict;
  end if;
end;
$$;

create index if not exists idx_ielts_practice_assignments_school_year_status
  on public.ielts_practice_assignments(school_id,academic_year_id,status,created_at desc);

-- Stamp every new IELTS Practice assignment with the school's operational year.
do $patch_create$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_ielts_practice_create_assignment'
    and pg_get_function_identity_arguments(p.oid)='p_school_id uuid, p_class_id uuid, p_title text, p_description text, p_due_at timestamp with time zone, p_items jsonb';
  if v_def is null
     or position('insert into public.ielts_practice_assignments (school_id, class_id, assigned_by, title, description, due_at, status)' in lower(v_def))=0 then
    raise exception 'ielts_create_assignment_patch_anchor_not_found';
  end if;
  v_def:=replace(v_def,
    'insert into public.ielts_practice_assignments (school_id, class_id, assigned_by, title, description, due_at, status)',
    'insert into public.ielts_practice_assignments (school_id, class_id, assigned_by, title, description, due_at, status, academic_year_id)');
  v_def:=replace(v_def,
    'values (p_school_id, p_class_id, auth.uid(), trim(p_title), p_description, p_due_at, ''draft'')',
    'values (p_school_id, p_class_id, auth.uid(), trim(p_title), p_description, p_due_at, ''draft'', public.academic_resolve_operational_year_id(p_school_id, now()))');
  execute v_def;
end;
$patch_create$;

-- Expose year context in the existing assignment payload without changing its shape otherwise.
do $patch_payload$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ielts_practice_assignment_payload'
    and pg_get_function_identity_arguments(p.oid)='p_assignment_id uuid';
  if v_def is null or position('''school_id'', a.school_id,' in v_def)=0 then
    raise exception 'ielts_payload_patch_anchor_not_found';
  end if;
  execute replace(v_def,'''school_id'', a.school_id,','''school_id'', a.school_id,'||E'\n    '||'''academic_year_id'', a.academic_year_id,');
end;
$patch_payload$;

create or replace function public.rpc_ielts_practice_student_assignments_entitlement_internal()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_user_id uuid:=auth.uid();
  v_school_id uuid;
  v_year_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select u.school_id into v_school_id
  from public.users u where u.id=v_user_id;
  if v_school_id is null then raise exception 'school_required'; end if;

  v_year_id:=public.academic_resolve_operational_year_id(v_school_id,now());
  if v_year_id is null then return '[]'::jsonb; end if;

  return coalesce((
    with visible_assignments as (
      -- Assignment recipients are immutable snapshots. Current class membership is not used.
      select distinct a.id
      from public.ielts_practice_assignment_students s
      join public.ielts_practice_assignments a on a.id=s.assignment_id
      where s.student_id=v_user_id
        and a.school_id=v_school_id
        and a.academic_year_id=v_year_id
        and (a.status in ('assigned','closed') or s.status='completed')
    )
    select jsonb_agg(
      public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object(
        'student_assignment_id',s.id,
        'student_status',coalesce(s.status,'assigned'),
        'completed_at',s.completed_at,
        'student_updated_at',s.updated_at
      ) order by a.created_at desc
    )
    from visible_assignments va
    join public.ielts_practice_assignments a on a.id=va.id
    join public.ielts_practice_assignment_students s
      on s.assignment_id=a.id and s.student_id=v_user_id
    where a.school_id=v_school_id
      and a.academic_year_id=v_year_id
      and a.status not in ('archived','draft')
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.rpc_ielts_practice_student_assignments_entitlement_internal() from public,anon,authenticated;
grant execute on function public.rpc_ielts_practice_student_assignments_entitlement_internal() to service_role;

create or replace function public.rpc_ielts_practice_list_assignments(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_status_filter text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_school_id uuid;
  v_year_id uuid;
  v_status_filter text:=lower(coalesce(nullif(trim(p_status_filter),''),'active'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_status_filter not in ('active','archived','all') then raise exception 'invalid_status_filter'; end if;
  select coalesce(p_school_id,u.school_id) into v_school_id from public.users u where u.id=auth.uid();
  if v_school_id is null then raise exception 'school_required'; end if;
  v_year_id:=public.academic_resolve_operational_year_id(v_school_id,now());

  return coalesce((
    select jsonb_agg(public.ielts_practice_assignment_payload(a.id) order by a.created_at desc)
    from public.ielts_practice_assignments a
    where a.school_id=v_school_id
      and (
        (v_status_filter='active' and a.status in ('draft','assigned','closed') and a.academic_year_id=v_year_id)
        or (v_status_filter='archived' and a.status='archived')
        or v_status_filter='all'
      )
      and (p_class_id is null or a.class_id=p_class_id)
      and public.can_manage_ielts_practice_class(a.school_id,a.class_id)
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.rpc_ielts_practice_list_assignments(uuid,uuid,text) from public,anon;
grant execute on function public.rpc_ielts_practice_list_assignments(uuid,uuid,text) to authenticated,service_role;
