-- Accept username/student-reference text for teacher writing RPCs and normalize to UUID.

create or replace function public.bh_writing_resolve_student_uuid(p_student_ref text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref text := nullif(trim(p_student_ref), '');
  v_student_id uuid;
begin
  if v_ref is null then
    raise exception 'Student reference is required';
  end if;

  begin
    v_student_id := v_ref::uuid;
  exception
    when others then
      v_student_id := null;
  end;

  if v_student_id is null then
    select u.id
      into v_student_id
    from public.users u
    where lower(coalesce(u.username, '')) = lower(v_ref)
      and coalesce(u.role, '') = 'student'
    order by u.created_at asc
    limit 1;
  end if;

  if v_student_id is null then
    raise exception 'Unknown student reference: %', v_ref;
  end if;

  return v_student_id;
end;
$$;

create or replace function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_teacher_report(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_month,
    p_genre,
    p_include_snippet
  );
$$;

create or replace function public.rpc_bh_writing_teacher_attempts(
  p_student_id text,
  p_genre text default null,
  p_limit int default 80
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_teacher_attempts(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_genre,
    p_limit
  );
$$;

create or replace function public.rpc_bh_writing_teacher_general_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_teacher_general_report(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_month,
    p_genre
  );
$$;

create or replace function public.rpc_bh_writing_teacher_attempt_report(
  p_student_id text,
  p_attempt_id text,
  p_genre text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_teacher_attempt_report(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_attempt_id,
    p_genre
  );
$$;

create or replace function public.rpc_bh_writing_teacher_reports(
  p_student_id text,
  p_attempt_id text default null,
  p_mode text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_teacher_reports(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_attempt_id,
    p_mode
  );
$$;

create or replace function public.rpc_bh_writing_save_teacher_report(
  p_student_id text,
  p_attempt_id text default null,
  p_mode text default 'student',
  p_month text default null,
  p_genre text default null,
  p_status text default 'draft',
  p_report_payload jsonb default '{}'::jsonb,
  p_teacher_comment text default null,
  p_report_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rpc_bh_writing_save_teacher_report(
    public.bh_writing_resolve_student_uuid(p_student_id),
    p_attempt_id,
    p_mode,
    p_month,
    p_genre,
    p_status,
    p_report_payload,
    p_teacher_comment,
    p_report_id
  );
$$;

revoke all on function public.bh_writing_resolve_student_uuid(text) from public, anon;
grant execute on function public.bh_writing_resolve_student_uuid(text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_attempts(text, text, int) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_attempts(text, text, int) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_general_report(text, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_general_report(text, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_attempt_report(text, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_attempt_report(text, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_reports(text, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_reports(text, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_save_teacher_report(text, text, text, text, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.rpc_bh_writing_save_teacher_report(text, text, text, text, text, text, jsonb, text, uuid) to authenticated;
