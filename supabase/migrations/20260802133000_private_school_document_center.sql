-- Private-by-default school document ownership and intentional sharing.

create schema if not exists private;

alter table public.school_document_records
  add column if not exists owner_teacher_id uuid references public.users(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists visibility_scope text not null default 'private';

update public.school_document_records
set owner_teacher_id = generated_by
where owner_teacher_id is null and generated_by is not null;

alter table public.school_document_records
  alter column owner_teacher_id set default auth.uid();

alter table public.school_document_records
  drop constraint if exists school_document_records_visibility_scope_check;
alter table public.school_document_records
  add constraint school_document_records_visibility_scope_check
  check (visibility_scope in ('private', 'class_staff', 'school_staff', 'student_family', 'admin_only'));

create table if not exists public.school_document_access_grants (
  id uuid primary key default gen_random_uuid(),
  document_record_id uuid not null references public.school_document_records(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  grantee_user_id uuid not null references public.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_record_id, grantee_user_id)
);

create index if not exists school_document_records_owner_generated_idx
  on public.school_document_records (school_id, owner_teacher_id, generated_at desc)
  where owner_teacher_id is not null;
create index if not exists school_document_records_class_generated_idx
  on public.school_document_records (school_id, class_id, generated_at desc)
  where class_id is not null;
create index if not exists school_document_records_visibility_generated_idx
  on public.school_document_records (school_id, visibility_scope, generated_at desc);
create index if not exists school_document_access_grants_grantee_idx
  on public.school_document_access_grants (grantee_user_id, school_id, expires_at);
create index if not exists school_document_access_grants_document_idx
  on public.school_document_access_grants (document_record_id, school_id);

create or replace function private.can_access_school_document(
  p_school_id uuid,
  p_owner_teacher_id uuid,
  p_generated_by uuid,
  p_class_id uuid,
  p_student_user_id uuid,
  p_visibility_scope text,
  p_audience text,
  p_status text,
  p_document_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin((select auth.uid()))
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = (select auth.uid())
        and sm.status = 'active' and sm.role_in_school = 'school_admin'
    )
    or p_owner_teacher_id = (select auth.uid())
    or p_generated_by = (select auth.uid())
    or exists (
      select 1
      from public.school_document_access_grants sag
      join public.school_members sm on sm.school_id = sag.school_id and sm.user_id = sag.grantee_user_id
      where sag.document_record_id = p_document_record_id and sag.school_id = p_school_id
        and sag.grantee_user_id = (select auth.uid()) and (sag.expires_at is null or sag.expires_at > now())
        and sm.status = 'active'
    )
    or (
      p_visibility_scope = 'class_staff' and p_class_id is not null
      and (
        exists (
          select 1 from public.class_teacher_assignments cta
          where cta.school_id = p_school_id and cta.class_id = p_class_id
            and cta.teacher_user_id = (select auth.uid()) and cta.active
        )
        or exists (
          select 1 from public.classes c
          where c.school_id = p_school_id and c.id = p_class_id and c.teacher_id = (select auth.uid())
        )
      )
    )
    or (
      p_visibility_scope = 'school_staff'
      and exists (
        select 1 from public.school_members sm
        where sm.school_id = p_school_id and sm.user_id = (select auth.uid())
          and sm.status = 'active' and sm.can_teach
      )
    )
    or (
      p_visibility_scope = 'student_family' and p_student_user_id = (select auth.uid())
      and p_status = 'final' and p_audience in ('family', 'student')
    );
$$;

create or replace function private.can_manage_school_document(p_document_record_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.school_document_records sdr
    where sdr.id = p_document_record_id and sdr.school_id = p_school_id
      and (
        sdr.owner_teacher_id = (select auth.uid())
        or sdr.generated_by = (select auth.uid())
        or exists (
          select 1 from public.school_members sm
          where sm.school_id = p_school_id and sm.user_id = (select auth.uid())
            and sm.status = 'active' and sm.role_in_school = 'school_admin'
        )
        or public.is_superadmin((select auth.uid()))
      )
  );
$$;

revoke all on function private.can_access_school_document(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) from public, anon;
revoke all on function private.can_manage_school_document(uuid,uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_school_document(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) to authenticated;
grant execute on function private.can_manage_school_document(uuid,uuid) to authenticated;

alter table public.school_document_records enable row level security;

drop policy if exists school_document_records_select on public.school_document_records;
create policy school_document_records_select on public.school_document_records
for select to authenticated
using (private.can_access_school_document(school_id, owner_teacher_id, generated_by, class_id, student_user_id, visibility_scope, audience, status, id));

drop policy if exists school_document_records_insert on public.school_document_records;
create policy school_document_records_insert on public.school_document_records
for insert to authenticated
with check (
  generated_by = (select auth.uid())
  and owner_teacher_id = (select auth.uid())
  and exists (
    select 1 from public.school_members sm
    where sm.school_id = school_document_records.school_id and sm.user_id = (select auth.uid())
      and sm.status = 'active' and (sm.role_in_school = 'school_admin' or sm.can_teach)
  )
  and (class_id is null or exists (select 1 from public.classes c where c.id = class_id and c.school_id = school_id))
  and (
    visibility_scope <> 'admin_only'
    or public.is_school_admin(school_id)
    or public.is_superadmin((select auth.uid()))
  )
  and (
    visibility_scope <> 'class_staff'
    or public.is_school_admin(school_id)
    or exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id = school_id and cta.class_id = school_document_records.class_id
        and cta.teacher_user_id = (select auth.uid()) and cta.active
    )
    or exists (
      select 1 from public.classes c
      where c.school_id = school_id and c.id = school_document_records.class_id and c.teacher_id = (select auth.uid())
    )
  )
  and (visibility_scope <> 'student_family' or student_user_id is not null)
);

drop policy if exists school_document_records_update on public.school_document_records;
create policy school_document_records_update on public.school_document_records
for update to authenticated
using (private.can_manage_school_document(id, school_id))
with check (private.can_manage_school_document(id, school_id));

drop policy if exists school_document_records_delete on public.school_document_records;
create policy school_document_records_delete on public.school_document_records
for delete to authenticated
using (public.is_school_admin(school_id) or public.is_superadmin((select auth.uid())));

alter table public.school_document_access_grants enable row level security;

create policy school_document_access_grants_select on public.school_document_access_grants
for select to authenticated
using (grantee_user_id = (select auth.uid()) or granted_by = (select auth.uid()) or private.can_manage_school_document(document_record_id, school_id));

create policy school_document_access_grants_insert on public.school_document_access_grants
for insert to authenticated
with check (
  granted_by = (select auth.uid())
  and private.can_manage_school_document(document_record_id, school_id)
  and exists (
    select 1 from public.school_members sm
    where sm.school_id = school_document_access_grants.school_id
      and sm.user_id = school_document_access_grants.grantee_user_id
      and sm.status = 'active' and (sm.can_teach or sm.role_in_school = 'school_admin')
  )
  and exists (
    select 1 from public.school_document_records sdr
    where sdr.id = document_record_id and sdr.school_id = school_document_access_grants.school_id
  )
);

create policy school_document_access_grants_delete on public.school_document_access_grants
for delete to authenticated
using (private.can_manage_school_document(document_record_id, school_id));

revoke all on table public.school_document_records from public, anon;
grant select, insert, delete on table public.school_document_records to authenticated;
grant update (visibility_scope, status, finalized_at, payload, file_path, checksum, updated_at) on public.school_document_records to authenticated;
revoke all on table public.school_document_access_grants from public, anon;
grant select, insert, delete on table public.school_document_access_grants to authenticated;

comment on column public.school_document_records.owner_teacher_id is 'Teacher or administrator who owns the generated record.';
comment on column public.school_document_records.visibility_scope is 'Private by default; wider access is explicit and enforced by RLS.';
comment on table public.school_document_access_grants is 'Auditable per-user exceptions to a document visibility scope.';
