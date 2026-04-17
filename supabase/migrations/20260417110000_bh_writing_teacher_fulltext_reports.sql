-- Full-text teacher attempt visibility + editable teacher reports for Writing Hub.

create table if not exists public.bh_writing_teacher_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  attempt_id text null,
  report_mode text not null check (report_mode in ('student', 'attempt')),
  month text null,
  genre text null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  report_payload jsonb not null default '{}'::jsonb,
  teacher_comment text null,
  created_by uuid not null references public.users(id) on delete cascade,
  updated_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bh_writing_teacher_reports_student on public.bh_writing_teacher_reports(student_id, created_at desc);
create index if not exists idx_bh_writing_teacher_reports_attempt on public.bh_writing_teacher_reports(attempt_id);
create index if not exists idx_bh_writing_teacher_reports_created_by on public.bh_writing_teacher_reports(created_by);

alter table public.bh_writing_teacher_reports enable row level security;

drop policy if exists "bh writing teacher reports read" on public.bh_writing_teacher_reports;
create policy "bh writing teacher reports read" on public.bh_writing_teacher_reports
for select
using (public.can_access_bh_writing_student(student_id));

drop policy if exists "bh writing teacher reports write" on public.bh_writing_teacher_reports;
create policy "bh writing teacher reports write" on public.bh_writing_teacher_reports
for insert
with check (
  public.can_access_bh_writing_student(student_id)
  and auth.uid() is not null
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "bh writing teacher reports update" on public.bh_writing_teacher_reports;
create policy "bh writing teacher reports update" on public.bh_writing_teacher_reports
for update
using (public.can_access_bh_writing_student(student_id))
with check (
  public.can_access_bh_writing_student(student_id)
  and auth.uid() is not null
  and updated_by = auth.uid()
);

create or replace function public.rpc_bh_writing_teacher_attempts(
  p_student_id uuid,
  p_genre text default null,
  p_limit int default 80
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genre text := nullif(trim(p_genre), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_bh_writing_student(p_student_id) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  return (
    with attempts as (
      select
        a.id as row_id,
        a.created_at,
        a.payload
      from public.bh_writing_attempts a
      where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = p_student_id
        and (v_genre is null or a.payload->>'genre' = v_genre)
      order by a.created_at desc
      limit v_limit
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'row_id', row_id,
          'attempt_id', coalesce(payload->>'id', row_id::text),
          'student_id', coalesce(payload->>'student_id', payload->>'user_id'),
          'genre', coalesce(payload->>'genre', 'essay'),
          'attempt_type', payload->>'attempt_type',
          'attempt_number', nullif(payload->>'attempt_number', '')::int,
          'retry_kind', payload->>'retry_kind',
          'revision_cycle_id', payload->>'revision_cycle_id',
          'parent_attempt_id', payload->>'parent_attempt_id',
          'prompt_id', payload->>'prompt_id',
          'prompt_text', coalesce(payload->>'prompt_text', ''),
          'student_submission', coalesce(payload->>'student_submission', ''),
          'assessment', coalesce(payload->'assessment', '{}'::jsonb),
          'rich_feedback', coalesce(payload->'rich_feedback', '{}'::jsonb),
          'created_at', created_at
        )
      ),
      '[]'::jsonb
    )
    from attempts
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_general_report(
  p_student_id uuid,
  p_month text default null,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
  v_base jsonb := '{}'::jsonb;
  v_attempts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_bh_writing_student(p_student_id) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select public.rpc_bh_writing_teacher_report(p_student_id, v_month, v_genre, true) into v_base;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attempt_id', coalesce(a.payload->>'id', a.id::text),
        'created_at', a.created_at,
        'attempt_type', a.payload->>'attempt_type',
        'retry_kind', a.payload->>'retry_kind',
        'revision_cycle_id', a.payload->>'revision_cycle_id',
        'prompt_text', coalesce(a.payload->>'prompt_text', ''),
        'student_submission', coalesce(a.payload->>'student_submission', ''),
        'assessment', coalesce(a.payload->'assessment', '{}'::jsonb)
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_attempts
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = p_student_id
    and (v_genre is null or a.payload->>'genre' = v_genre)
  limit 25;

  return jsonb_build_object(
    'report_mode', 'student',
    'report', v_base,
    'attempts', v_attempts
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_attempt_report(
  p_student_id uuid,
  p_attempt_id text,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_genre text := nullif(trim(p_genre), '');
  v_attempt jsonb := null;
  v_prev_attempt jsonb := null;
  v_latest_eval jsonb := '{}'::jsonb;
  v_next_action text := null;
  v_issues text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_bh_writing_student(p_student_id) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select jsonb_build_object(
    'attempt_id', coalesce(a.payload->>'id', a.id::text),
    'row_id', a.id,
    'created_at', a.created_at,
    'genre', coalesce(a.payload->>'genre', 'essay'),
    'attempt_type', a.payload->>'attempt_type',
    'attempt_number', nullif(a.payload->>'attempt_number', '')::int,
    'retry_kind', a.payload->>'retry_kind',
    'revision_cycle_id', a.payload->>'revision_cycle_id',
    'parent_attempt_id', a.payload->>'parent_attempt_id',
    'prompt_id', a.payload->>'prompt_id',
    'prompt_text', coalesce(a.payload->>'prompt_text', ''),
    'student_submission', coalesce(a.payload->>'student_submission', ''),
    'assessment', coalesce(a.payload->'assessment', '{}'::jsonb),
    'rich_feedback', coalesce(a.payload->'rich_feedback', '{}'::jsonb)
  )
  into v_attempt
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = p_student_id
    and (coalesce(a.payload->>'id', a.id::text)) = p_attempt_id
    and (v_genre is null or a.payload->>'genre' = v_genre)
  limit 1;

  if v_attempt is null then
    raise exception 'Attempt not found';
  end if;

  select jsonb_build_object(
    'attempt_id', coalesce(a.payload->>'id', a.id::text),
    'created_at', a.created_at,
    'prompt_text', coalesce(a.payload->>'prompt_text', ''),
    'student_submission', coalesce(a.payload->>'student_submission', ''),
    'assessment', coalesce(a.payload->'assessment', '{}'::jsonb)
  )
  into v_prev_attempt
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = p_student_id
    and a.created_at < (v_attempt->>'created_at')::timestamptz
    and (v_genre is null or a.payload->>'genre' = coalesce(v_genre, v_attempt->>'genre'))
  order by a.created_at desc
  limit 1;

  select de.payload into v_latest_eval
  from public.bh_writing_daily_evaluations de
  where (coalesce(de.payload->>'student_id', de.payload->>'user_id'))::uuid = p_student_id
    and (v_genre is null or de.payload->>'genre' = coalesce(v_genre, v_attempt->>'genre'))
  order by de.created_at desc
  limit 1;

  if jsonb_typeof(v_attempt->'assessment'->'weakness_tags') = 'array' then
    select coalesce(array_agg(value), '{}') into v_issues
    from jsonb_array_elements_text(v_attempt->'assessment'->'weakness_tags');
  end if;

  v_next_action := coalesce(v_latest_eval->'evaluation'->>'recommended_next_action', 'Revisit the top weakness tags and submit a focused retry attempt.');

  return jsonb_build_object(
    'report_mode', 'attempt',
    'attempt', v_attempt,
    'previous_attempt', coalesce(v_prev_attempt, '{}'::jsonb),
    'evaluation', coalesce(v_latest_eval->'evaluation', '{}'::jsonb),
    'precise_issues', to_jsonb(v_issues),
    'suggested_next_action', v_next_action
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_reports(
  p_student_id uuid,
  p_attempt_id text default null,
  p_mode text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'student_id', r.student_id,
          'attempt_id', r.attempt_id,
          'report_mode', r.report_mode,
          'month', r.month,
          'genre', r.genre,
          'status', r.status,
          'report_payload', r.report_payload,
          'teacher_comment', r.teacher_comment,
          'created_by', r.created_by,
          'updated_by', r.updated_by,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        )
        order by r.updated_at desc
      )
      from public.bh_writing_teacher_reports r
      where r.student_id = p_student_id
        and public.can_access_bh_writing_student(r.student_id)
        and (p_attempt_id is null or r.attempt_id = p_attempt_id)
        and (p_mode is null or r.report_mode = p_mode)
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.rpc_bh_writing_save_teacher_report(
  p_student_id uuid,
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_mode text := lower(coalesce(p_mode, 'student'));
  v_status text := lower(coalesce(p_status, 'draft'));
  v_row public.bh_writing_teacher_reports;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_mode not in ('student', 'attempt') then
    raise exception 'Invalid report mode';
  end if;

  if v_status not in ('draft', 'final') then
    raise exception 'Invalid report status';
  end if;

  if not public.can_access_bh_writing_student(p_student_id) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  if p_report_id is not null then
    update public.bh_writing_teacher_reports r
    set
      attempt_id = p_attempt_id,
      report_mode = v_mode,
      month = p_month,
      genre = p_genre,
      status = v_status,
      report_payload = coalesce(p_report_payload, '{}'::jsonb),
      teacher_comment = p_teacher_comment,
      updated_by = auth.uid(),
      updated_at = now()
    where r.id = p_report_id
      and r.student_id = p_student_id
      and public.can_access_bh_writing_student(r.student_id)
    returning r.id into v_id;

    if v_id is null then
      raise exception 'Report not found or not authorized';
    end if;
  else
    insert into public.bh_writing_teacher_reports (
      student_id,
      attempt_id,
      report_mode,
      month,
      genre,
      status,
      report_payload,
      teacher_comment,
      created_by,
      updated_by
    ) values (
      p_student_id,
      p_attempt_id,
      v_mode,
      p_month,
      p_genre,
      v_status,
      coalesce(p_report_payload, '{}'::jsonb),
      p_teacher_comment,
      auth.uid(),
      auth.uid()
    )
    returning id into v_id;
  end if;

  select * into v_row from public.bh_writing_teacher_reports where id = v_id;

  return jsonb_build_object(
    'id', v_row.id,
    'student_id', v_row.student_id,
    'attempt_id', v_row.attempt_id,
    'report_mode', v_row.report_mode,
    'month', v_row.month,
    'genre', v_row.genre,
    'status', v_row.status,
    'report_payload', v_row.report_payload,
    'teacher_comment', v_row.teacher_comment,
    'created_by', v_row.created_by,
    'updated_by', v_row.updated_by,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_attempts(uuid, text, int) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_attempts(uuid, text, int) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_general_report(uuid, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_general_report(uuid, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_attempt_report(uuid, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_attempt_report(uuid, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_reports(uuid, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_reports(uuid, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_save_teacher_report(uuid, text, text, text, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.rpc_bh_writing_save_teacher_report(uuid, text, text, text, text, text, jsonb, text, uuid) to authenticated;
