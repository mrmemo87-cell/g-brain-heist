-- Roll the public school-demo calendar forward automatically while preserving
-- the existing Sunday-to-Thursday schedule and collision-safe booking flow.

alter table public.demo_booking_slots
  drop constraint if exists demo_booking_slots_booking_date_check;

alter table public.demo_booking_slots
  add constraint demo_booking_slots_booking_date_check
  check (booking_date >= date '2026-08-09');

create or replace function public.rpc_demo_booking_week_start(
  p_now timestamptz default now()
)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  with booking_clock as (
    select p_now at time zone 'Asia/Bishkek' as local_now
  ), booking_week as (
    select
      local_now,
      local_now::date - extract(dow from local_now)::integer as sunday
    from booking_clock
  )
  select greatest(
    date '2026-08-16',
    case
      when local_now >= (sunday + 4 + time '17:30') then sunday + 7
      else sunday
    end
  )
  from booking_week;
$$;

revoke all on function public.rpc_demo_booking_week_start(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_demo_booking_week_start(timestamptz)
  to anon, authenticated, service_role;

create or replace function public.rpc_list_demo_booking_slots()
returns table (
  booking_date date,
  booking_time text,
  is_taken boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_week_start date := public.rpc_demo_booking_week_start(now());
begin
  -- SECURITY DEFINER is intentionally limited to materializing and returning
  -- non-sensitive slot availability; it accepts no caller-controlled input.
  with generated_slots as (
    select
      day_value::date as booking_date,
      slot_value.booking_time,
      row_number() over (
        partition by day_value::date
        order by md5(day_value::date::text || ':' || slot_value.booking_time)
      ) as blocked_rank
    from generate_series(
      v_week_start,
      v_week_start + 4,
      interval '1 day'
    ) as days(day_value)
    cross join unnest(array[
      '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30',
      '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ]::text[]) as slot_value(booking_time)
  )
  insert into public.demo_booking_slots (
    booking_date,
    booking_time,
    is_blocked
  )
  select
    generated_slots.booking_date,
    generated_slots.booking_time,
    generated_slots.blocked_rank <= 3
  from generated_slots
  on conflict on constraint demo_booking_slots_pkey do nothing;

  return query
  select
    slot.booking_date,
    slot.booking_time,
    (
      slot.is_blocked
      or slot.booking_id is not null
      or ((slot.booking_date + slot.booking_time::time) at time zone 'Asia/Bishkek') <= now()
    ) as is_taken
  from public.demo_booking_slots as slot
  where slot.booking_date between v_week_start and v_week_start + 4
  order by slot.booking_date, slot.booking_time;
end;
$$;

revoke all on function public.rpc_list_demo_booking_slots()
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_list_demo_booking_slots()
  to anon, authenticated, service_role;

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
    and preferred_date between (select public.rpc_demo_booking_week_start(now()))
      and (select public.rpc_demo_booking_week_start(now())) + 4
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
volatile
security invoker
set search_path = ''
as $$
declare
  v_week_start date := public.rpc_demo_booking_week_start(now());
begin
  if p_booking_date not between v_week_start and v_week_start + 4 then
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

  perform 1 from public.rpc_list_demo_booking_slots();

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

revoke all on function public.rpc_check_demo_booking_slot(date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_check_demo_booking_slot(date, text)
  to anon, authenticated, service_role;

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
  v_week_start date := public.rpc_demo_booking_week_start(now());
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

  if v_preferred_date not between v_week_start and v_week_start + 4 then
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

revoke all on function public.rpc_create_demo_booking(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_create_demo_booking(jsonb)
  to anon, authenticated, service_role;

drop trigger if exists demo_bookings_sync_slot_after_insert on public.demo_bookings;
create trigger demo_bookings_sync_slot_after_insert
after insert on public.demo_bookings
for each row
when (new.source = 'booked_page')
execute function private.sync_demo_booking_slot();

drop trigger if exists demo_bookings_sync_slot_after_status_update on public.demo_bookings;
create trigger demo_bookings_sync_slot_after_status_update
after update of status on public.demo_bookings
for each row
when (
  old.status is distinct from new.status
  and new.source = 'booked_page'
)
execute function private.sync_demo_booking_slot();

comment on table public.demo_booking_slots is
  'Public, non-sensitive availability for the rolling Sunday-to-Thursday school demo calendar.';
comment on function public.rpc_demo_booking_week_start(timestamptz) is
  'Returns the active demo-calendar Sunday, starting at 2026-08-16 and rolling after the final Thursday slot.';
comment on function public.rpc_list_demo_booking_slots() is
  'Materializes and returns non-sensitive availability for the active Sunday-to-Thursday demo week.';
comment on function public.rpc_check_demo_booking_slot(date, text) is
  'Returns public availability for one active rolling demo slot and rejects past times.';
comment on function public.rpc_create_demo_booking(jsonb) is
  'Validates school/location details and atomically claims one future rolling demo slot.';
