-- Capture the school and full location on public demo bookings, expose a
-- read-only availability check, and reject past/colliding slots server-side.

alter table public.demo_bookings
  add column if not exists city text,
  add column if not exists street_address text;

revoke insert on public.demo_bookings from anon, authenticated;
grant insert (
  id,
  school_name,
  contact_name,
  phone,
  country,
  city,
  street_address,
  preferred_date,
  preferred_time,
  timezone
) on public.demo_bookings to anon, authenticated;

drop policy if exists public_submits_campaign_demo_booking on public.demo_bookings;
create policy public_submits_campaign_demo_booking
  on public.demo_bookings
  for insert
  to anon, authenticated
  with check (
    char_length(btrim(school_name)) between 2 and 180
    and char_length(btrim(contact_name)) between 2 and 120
    and phone is not null
    and char_length(btrim(phone)) between 6 and 50
    and char_length(btrim(country)) between 2 and 100
    and char_length(btrim(city)) between 2 and 120
    and char_length(btrim(street_address)) between 2 and 240
    and char_length(btrim(timezone)) between 2 and 100
    and preferred_date between date '2026-08-09' and date '2026-08-13'
    and preferred_time = any (array[
      '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30',
      '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ]::text[])
    and ((preferred_date + preferred_time::time) at time zone 'Asia/Bishkek') > now()
    and status = 'new'
    and source = 'booked_page'
    and admin_notes is null
  );

create or replace function public.rpc_check_demo_booking_slot(
  p_booking_date date,
  p_booking_time text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_booking_date not between date '2026-08-09' and date '2026-08-13' then
    return false;
  end if;
  if p_booking_time <> all (array[
    '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
  ]::text[]) then
    return false;
  end if;

  return exists (
    select 1
    from public.demo_booking_slots as slot
    where slot.booking_date = p_booking_date
      and slot.booking_time = p_booking_time
      and not slot.is_blocked
      and slot.booking_id is null
      and ((p_booking_date + p_booking_time::time) at time zone 'Asia/Bishkek') > now()
  );
end;
$$;

revoke all on function public.rpc_check_demo_booking_slot(date, text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_check_demo_booking_slot(date, text) to anon, authenticated, service_role;

create or replace function public.rpc_create_demo_booking(p_booking jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_school_name text := btrim(coalesce(p_booking->>'school_name', ''));
  v_contact_name text := btrim(coalesce(p_booking->>'contact_name', ''));
  v_phone text := btrim(coalesce(p_booking->>'phone', ''));
  v_country text := btrim(coalesce(p_booking->>'country', ''));
  v_city text := btrim(coalesce(p_booking->>'city', ''));
  v_street_address text := btrim(coalesce(p_booking->>'street_address', ''));
  v_preferred_date date;
  v_preferred_time text := btrim(coalesce(p_booking->>'preferred_time', ''));
  v_timezone text := btrim(coalesce(p_booking->>'timezone', ''));
begin
  if btrim(coalesce(p_booking->>'website', '')) <> '' then
    return gen_random_uuid();
  end if;

  if jsonb_typeof(p_booking) <> 'object' then
    raise exception 'A valid booking request is required.' using errcode = '22023';
  end if;
  if char_length(v_school_name) not between 2 and 180 then
    raise exception 'Please enter the school name.' using errcode = '22023';
  end if;
  if char_length(v_contact_name) not between 2 and 120 then
    raise exception 'Please enter your full name.' using errcode = '22023';
  end if;
  if char_length(v_phone) not between 6 and 50 then
    raise exception 'Please enter a valid phone or WhatsApp number.' using errcode = '22023';
  end if;
  if char_length(v_country) not between 2 and 100 then
    raise exception 'Please choose the school country.' using errcode = '22023';
  end if;
  if char_length(v_city) not between 2 and 120 then
    raise exception 'Please enter the school city.' using errcode = '22023';
  end if;
  if char_length(v_street_address) not between 2 and 240 then
    raise exception 'Please enter the school street or address.' using errcode = '22023';
  end if;
  if char_length(v_timezone) not between 2 and 100 then
    raise exception 'We could not detect a valid local timezone.' using errcode = '22023';
  end if;

  begin
    v_preferred_date := (p_booking->>'preferred_date')::date;
  exception when others then
    raise exception 'Please choose a booking day.' using errcode = '22023';
  end;

  if v_preferred_date not between date '2026-08-09' and date '2026-08-13' then
    raise exception 'Please choose one of the available booking days.' using errcode = '22023';
  end if;
  if v_preferred_time <> all (array[
    '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
  ]::text[]) then
    raise exception 'Please choose an available 30-minute time slot.' using errcode = '22023';
  end if;
  if ((v_preferred_date + v_preferred_time::time) at time zone 'Asia/Bishkek') <= now() then
    raise exception 'That time has already passed. Please choose another available slot.' using errcode = 'P0001';
  end if;
  if not public.rpc_check_demo_booking_slot(v_preferred_date, v_preferred_time) then
    raise exception 'That time slot was just taken. Please choose another one.' using errcode = 'P0001';
  end if;

  begin
    insert into public.demo_bookings (
      id,
      school_name,
      contact_name,
      phone,
      country,
      city,
      street_address,
      preferred_date,
      preferred_time,
      timezone
    ) values (
      v_id,
      v_school_name,
      v_contact_name,
      v_phone,
      v_country,
      v_city,
      v_street_address,
      v_preferred_date,
      v_preferred_time,
      v_timezone
    );
  exception
    when unique_violation then
      raise exception 'That time slot was just taken. Please choose another one.' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

revoke all on function public.rpc_create_demo_booking(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.rpc_create_demo_booking(jsonb) to anon, authenticated, service_role;

comment on function public.rpc_check_demo_booking_slot(date, text) is
  'Returns public availability for one fixed demo slot and rejects past times.';
comment on function public.rpc_create_demo_booking(jsonb) is
  'Validates school/location details and atomically claims one future demo slot.';
