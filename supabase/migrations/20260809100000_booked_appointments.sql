-- Public demo booking intake with super-admin-only appointment management.

create table if not exists public.demo_bookings (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  role_title text not null,
  country text not null,
  school_size text,
  preferred_format text not null check (preferred_format in ('online', 'in_person', 'either')),
  preferred_date date not null,
  preferred_time text not null,
  timezone text not null,
  interests text[] not null default '{}'::text[],
  message text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'confirmed', 'completed', 'cancelled')),
  admin_notes text,
  source text not null default 'booked_page',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_bookings_status_created_at_idx
  on public.demo_bookings (status, created_at desc);

create index if not exists demo_bookings_preferred_date_idx
  on public.demo_bookings (preferred_date, status);

alter table public.demo_bookings enable row level security;

revoke all on public.demo_bookings from public, anon, authenticated;
grant select on public.demo_bookings to authenticated;
grant update (status, admin_notes, updated_at) on public.demo_bookings to authenticated;
grant all on public.demo_bookings to service_role;

drop policy if exists superadmins_read_demo_bookings on public.demo_bookings;
create policy superadmins_read_demo_bookings
  on public.demo_bookings
  for select
  to authenticated
  using (public.is_superadmin((select auth.uid())));

drop policy if exists superadmins_update_demo_bookings on public.demo_bookings;
create policy superadmins_update_demo_bookings
  on public.demo_bookings
  for update
  to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create or replace function public.rpc_create_demo_booking(p_booking jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_school_name text := btrim(coalesce(p_booking->>'school_name', ''));
  v_contact_name text := btrim(coalesce(p_booking->>'contact_name', ''));
  v_email text := lower(btrim(coalesce(p_booking->>'email', '')));
  v_phone text := nullif(btrim(coalesce(p_booking->>'phone', '')), '');
  v_role_title text := btrim(coalesce(p_booking->>'role_title', ''));
  v_country text := btrim(coalesce(p_booking->>'country', ''));
  v_school_size text := nullif(btrim(coalesce(p_booking->>'school_size', '')), '');
  v_preferred_format text := btrim(coalesce(p_booking->>'preferred_format', ''));
  v_preferred_date date;
  v_preferred_time text := btrim(coalesce(p_booking->>'preferred_time', ''));
  v_timezone text := btrim(coalesce(p_booking->>'timezone', ''));
  v_interests text[] := '{}'::text[];
  v_message text := nullif(btrim(coalesce(p_booking->>'message', '')), '');
begin
  -- Honeypot submissions receive a non-actionable response without storing spam.
  if btrim(coalesce(p_booking->>'website', '')) <> '' then
    return gen_random_uuid();
  end if;

  if jsonb_typeof(p_booking) <> 'object' then
    raise exception 'A valid booking request is required.' using errcode = '22023';
  end if;

  if char_length(v_school_name) not between 2 and 180 then
    raise exception 'School name must be between 2 and 180 characters.' using errcode = '22023';
  end if;
  if char_length(v_contact_name) not between 2 and 120 then
    raise exception 'Contact name must be between 2 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 50 then
    raise exception 'Phone number is too long.' using errcode = '22023';
  end if;
  if char_length(v_role_title) not between 2 and 100 then
    raise exception 'Role must be between 2 and 100 characters.' using errcode = '22023';
  end if;
  if char_length(v_country) not between 2 and 100 then
    raise exception 'Country must be between 2 and 100 characters.' using errcode = '22023';
  end if;
  if v_school_size is not null and char_length(v_school_size) > 50 then
    raise exception 'School size is too long.' using errcode = '22023';
  end if;
  if v_preferred_format not in ('online', 'in_person', 'either') then
    raise exception 'Choose a valid meeting format.' using errcode = '22023';
  end if;

  begin
    v_preferred_date := (p_booking->>'preferred_date')::date;
  exception when others then
    raise exception 'Choose a valid preferred date.' using errcode = '22023';
  end;

  if v_preferred_date < current_date or v_preferred_date > current_date + 180 then
    raise exception 'Preferred date must be within the next 180 days.' using errcode = '22023';
  end if;
  if char_length(v_preferred_time) not between 2 and 80 then
    raise exception 'Choose a preferred time.' using errcode = '22023';
  end if;
  if char_length(v_timezone) not between 2 and 100 then
    raise exception 'A valid timezone is required.' using errcode = '22023';
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    raise exception 'Message must be 2,000 characters or fewer.' using errcode = '22023';
  end if;
  if coalesce((p_booking->>'consent')::boolean, false) is not true then
    raise exception 'Consent is required to arrange the demo.' using errcode = '22023';
  end if;

  if p_booking ? 'interests' then
    if jsonb_typeof(p_booking->'interests') <> 'array' then
      raise exception 'Interests must be a list.' using errcode = '22023';
    end if;
    select coalesce(array_agg(value), '{}'::text[])
      into v_interests
      from jsonb_array_elements_text(p_booking->'interests') as interest(value);
  end if;

  if cardinality(v_interests) > 8 or not v_interests <@ array[
    'admissions', 'writing_ai', 'teacher_assignments', 'analytics',
    'cambridge', 'ielts', 'class_activities'
  ]::text[] then
    raise exception 'One or more selected interests are invalid.' using errcode = '22023';
  end if;

  insert into public.demo_bookings (
    school_name,
    contact_name,
    email,
    phone,
    role_title,
    country,
    school_size,
    preferred_format,
    preferred_date,
    preferred_time,
    timezone,
    interests,
    message
  ) values (
    v_school_name,
    v_contact_name,
    v_email,
    v_phone,
    v_role_title,
    v_country,
    v_school_size,
    v_preferred_format,
    v_preferred_date,
    v_preferred_time,
    v_timezone,
    v_interests,
    v_message
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_create_demo_booking(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.rpc_create_demo_booking(jsonb) to anon, authenticated, service_role;

comment on table public.demo_bookings is
  'Demo appointment requests submitted through the public /booked page; readable only by super-admins.';
comment on function public.rpc_create_demo_booking(jsonb) is
  'Narrow public intake endpoint for validated demo booking requests. Anonymous access is intentional.';
