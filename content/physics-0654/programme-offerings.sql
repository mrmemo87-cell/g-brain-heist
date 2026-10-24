-- Explicit school offering context; grade numbering does not define Cambridge stage.
create table if not exists public.physics_programme_offering_mappings (
  offering_id uuid primary key references public.school_subject_offerings(id) on delete restrict,
  programme_code text not null check(programme_code='0654'),
  source_version text not null check(source_version='2025-2027'),
  registry_phase text not null check(registry_phase='upper_secondary'),
  reviewed_by_authority text not null check(length(trim(reviewed_by_authority)) between 3 and 200),
  reviewed_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','retired'))
);
alter table public.physics_programme_offering_mappings enable row level security;
revoke all on public.physics_programme_offering_mappings from public,anon,authenticated;
grant select,insert,update on public.physics_programme_offering_mappings to service_role;
