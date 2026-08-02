-- Premium school document system
-- Adds a school-scoped document registry, repairs Writing report branding in
-- forward migration order, and narrows Admissions reports to school admins.

create table if not exists public.school_document_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  document_id text not null,
  template_key text not null,
  template_version text not null,
  title text not null,
  audience text not null check (audience in ('family', 'student', 'teacher', 'internal')),
  status text not null check (status in ('draft', 'final')),
  confidentiality text not null check (confidentiality in ('school-use', 'confidential', 'family-copy')),
  source_type text,
  source_id text,
  student_user_id uuid references public.users(id) on delete set null,
  generated_by uuid references auth.users(id) on delete set null default auth.uid(),
  generated_at timestamptz not null default now(),
  finalized_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  file_path text,
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, document_id)
);

create index if not exists school_document_records_school_generated_idx
  on public.school_document_records (school_id, generated_at desc);
create index if not exists school_document_records_student_idx
  on public.school_document_records (student_user_id, generated_at desc)
  where student_user_id is not null;
create index if not exists school_document_records_generated_by_idx
  on public.school_document_records (generated_by, generated_at desc)
  where generated_by is not null;
create index if not exists school_document_records_source_idx
  on public.school_document_records (school_id, source_type, source_id)
  where source_type is not null and source_id is not null;

alter table public.school_document_records enable row level security;

drop policy if exists school_document_records_select on public.school_document_records;
create policy school_document_records_select
on public.school_document_records
for select
to authenticated
using (
  exists (
    select 1
    from public.school_members sm
    where sm.school_id = school_document_records.school_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
      and (
        sm.role_in_school = 'school_admin'
        or sm.can_teach
        or school_document_records.student_user_id = (select auth.uid())
      )
      and (
        school_document_records.confidentiality <> 'confidential'
        or school_document_records.generated_by = (select auth.uid())
        or sm.role_in_school = 'school_admin'
      )
  )
  or public.is_superadmin((select auth.uid()))
);

drop policy if exists school_document_records_insert on public.school_document_records;
create policy school_document_records_insert
on public.school_document_records
for insert
to authenticated
with check (
  (
    generated_by = (select auth.uid())
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = school_document_records.school_id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
        and (sm.role_in_school = 'school_admin' or sm.can_teach)
    )
  )
  or public.is_superadmin((select auth.uid()))
);

drop policy if exists school_document_records_update on public.school_document_records;
create policy school_document_records_update
on public.school_document_records
for update
to authenticated
using (
  generated_by = (select auth.uid())
  or public.is_school_admin(school_id)
  or public.is_superadmin((select auth.uid()))
)
with check (
  (
    exists (
      select 1
      from public.school_members sm
      where sm.school_id = school_document_records.school_id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
        and (sm.role_in_school = 'school_admin' or sm.can_teach)
    )
    and (
      generated_by = (select auth.uid())
      or public.is_school_admin(school_id)
    )
  )
  or public.is_superadmin((select auth.uid()))
);

drop policy if exists school_document_records_delete on public.school_document_records;
create policy school_document_records_delete
on public.school_document_records
for delete
to authenticated
using (
  public.is_school_admin(school_id)
  or public.is_superadmin((select auth.uid()))
);

revoke all on table public.school_document_records from public, anon;
grant select, insert, update, delete on table public.school_document_records to authenticated;

comment on table public.school_document_records is
  'School-scoped audit and reprint registry for generated reports, rosters, papers, answer keys and operational documents.';
comment on column public.school_document_records.payload is
  'Sanitized document rendering payload. Large binary/data-URL content must be omitted and stored in private Storage instead.';

-- The premium Writing migration was absent from production migration history.
-- Preserve the proven scoped report function, then wrap it with canonical
-- institution branding in a forward-only migration.
do $$
begin
  if to_regprocedure('public.rpc_bh_writing_teacher_report_unbranded_v1(text,text,text,boolean)') is null
     and to_regprocedure('public.rpc_bh_writing_teacher_report(text,text,text,boolean)') is not null then
    alter function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
      rename to rpc_bh_writing_teacher_report_unbranded_v1;
  end if;
end
$$;

create or replace function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report jsonb;
  v_student_id uuid;
  v_school_id uuid;
  v_school_name text;
  v_school_logo_url text;
  v_teacher_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  v_report := public.rpc_bh_writing_teacher_report_unbranded_v1(
    p_student_id,
    p_month,
    p_genre,
    p_include_snippet
  );

  v_student_id := nullif(v_report #>> '{student,student_id}', '')::uuid;

  select u.school_id, coalesce(nullif(s.name, ''), 'Brains Heist'), s.logo_url
  into v_school_id, v_school_name, v_school_logo_url
  from public.users u
  left join public.schools s on s.id = u.school_id
  where u.id = v_student_id;

  select coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Writing teacher')
  into v_teacher_name
  from public.users u
  where u.id = (select auth.uid());

  return v_report || jsonb_build_object(
    'institution', jsonb_build_object(
      'school_id', v_school_id,
      'school_name', coalesce(v_school_name, 'Brains Heist'),
      'school_logo_url', v_school_logo_url,
      'teacher_name', coalesce(v_teacher_name, 'Writing teacher')
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_report_unbranded_v1(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) to authenticated;

comment on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) is
  'Returns the existing teacher-scoped Writing report plus canonical school identity for professional documents.';

-- Admissions reports contain candidate PII, internal activity observations and
-- full answer evidence. Keep the existing mature report builder behind an
-- admin-only wrapper rather than widening ordinary teacher access.
do $$
begin
  if to_regprocedure('public.rpc_adm_get_candidate_report_legacy(uuid)') is null
     and to_regprocedure('public.rpc_adm_get_candidate_report(uuid)') is not null then
    alter function public.rpc_adm_get_candidate_report(uuid)
      rename to rpc_adm_get_candidate_report_legacy;
  end if;
end
$$;

create or replace function public.rpc_adm_get_candidate_report(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select a.school_id into v_school_id
  from public.adm_attempts a
  where a.id = p_attempt_id;

  if v_school_id is null then
    return jsonb_build_object('success', false, 'error', 'Attempt not found');
  end if;

  if not (
    exists (
      select 1
      from public.school_members sm
      where sm.school_id = v_school_id
        and sm.user_id = (select auth.uid())
        and sm.role_in_school = 'school_admin'
        and sm.status = 'active'
    )
    or public.is_superadmin((select auth.uid()))
  ) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  return public.rpc_adm_get_candidate_report_legacy(p_attempt_id);
end;
$$;

revoke all on function public.rpc_adm_get_candidate_report_legacy(uuid) from public, anon, authenticated;
revoke all on function public.rpc_adm_get_candidate_report(uuid) from public, anon;
grant execute on function public.rpc_adm_get_candidate_report(uuid) to authenticated;

comment on function public.rpc_adm_get_candidate_report(uuid) is
  'Returns a scored candidate report only to an active school administrator for that school or a platform superadmin.';
