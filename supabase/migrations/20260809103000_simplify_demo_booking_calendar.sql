-- Simplify the public demo request to name, phone, day, and a collision-safe slot.

alter table public.demo_bookings
  alter column school_name drop not null,
  alter column email drop not null,
  alter column role_title drop not null,
  alter column country drop not null,
  alter column preferred_format set default 'online',
  alter column timezone set default 'Asia/Bishkek';

create unique index if not exists demo_bookings_active_slot_uidx
  on public.demo_bookings (preferred_date, preferred_time)
  where status <> 'cancelled';

create table if not exists public.demo_booking_slots (
  booking_date date not null,
  booking_time text not null,
  is_blocked boolean not null default false,
  booking_id uuid unique references public.demo_bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (booking_date, booking_time),
  check (booking_date between date '2026-08-09' and date '2026-08-13'),
  check (booking_time = any (array[
    '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
  ]::text[]))
);

alter table public.demo_booking_slots enable row level security;
revoke all on public.demo_booking_slots from public, anon, authenticated;
grant select on public.demo_booking_slots to anon, authenticated;
grant all on public.demo_booking_slots to service_role;

drop policy if exists public_reads_demo_booking_slots on public.demo_booking_slots;
create policy public_reads_demo_booking_slots
  on public.demo_booking_slots
  for select
  to anon, authenticated
  using (true);

insert into public.demo_booking_slots (booking_date, booking_time)
select booking_date, booking_time
from generate_series(date '2026-08-09', date '2026-08-13', interval '1 day') as day(booking_date)
cross join unnest(array[
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30'
]::text[]) as slot(booking_time)
on conflict (booking_date, booking_time) do nothing;

-- Sunday is fully reserved. The remaining days intentionally show a varied
-- selection of unavailable times so the calendar feels live and realistic.
update public.demo_booking_slots
set is_blocked = (
  booking_date = date '2026-08-09'
  or (booking_date, booking_time) in (
    (date '2026-08-10', '10:30'),
    (date '2026-08-10', '14:00'),
    (date '2026-08-10', '16:30'),
    (date '2026-08-11', '11:00'),
    (date '2026-08-11', '13:30'),
    (date '2026-08-11', '15:30'),
    (date '2026-08-12', '10:00'),
    (date '2026-08-12', '12:30'),
    (date '2026-08-12', '17:00'),
    (date '2026-08-13', '11:30'),
    (date '2026-08-13', '15:00')
  )
)
where booking_id is null;

create or replace function private.sync_demo_booking_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed integer;
begin
  if tg_op = 'INSERT' then
    update public.demo_booking_slots
    set booking_id = new.id
    where booking_date = new.preferred_date
      and booking_time = new.preferred_time
      and not is_blocked
      and booking_id is null;

    get diagnostics v_claimed = row_count;
    if v_claimed <> 1 then
      raise exception 'That time slot is no longer available. Please choose another one.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.status <> 'cancelled' and new.status = 'cancelled' then
    update public.demo_booking_slots
    set booking_id = null
    where booking_id = new.id;
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    update public.demo_booking_slots
    set booking_id = new.id
    where booking_date = new.preferred_date
      and booking_time = new.preferred_time
      and not is_blocked
      and booking_id is null;

    get diagnostics v_claimed = row_count;
    if v_claimed <> 1 then
      raise exception 'That time slot has already been reassigned.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_demo_booking_slot() from public, anon, authenticated, service_role;

drop trigger if exists demo_bookings_sync_slot_after_insert on public.demo_bookings;
create trigger demo_bookings_sync_slot_after_insert
after insert on public.demo_bookings
for each row
when (
  new.source = 'booked_page'
  and new.preferred_date between date '2026-08-09' and date '2026-08-13'
)
execute function private.sync_demo_booking_slot();

drop trigger if exists demo_bookings_sync_slot_after_status_update on public.demo_bookings;
create trigger demo_bookings_sync_slot_after_status_update
after update of status on public.demo_bookings
for each row
when (
  old.status is distinct from new.status
  and new.source = 'booked_page'
  and new.preferred_date between date '2026-08-09' and date '2026-08-13'
)
execute function private.sync_demo_booking_slot();

grant insert (contact_name, phone, preferred_date, preferred_time)
  on public.demo_bookings to anon, authenticated;

drop policy if exists public_submits_campaign_demo_booking on public.demo_bookings;
create policy public_submits_campaign_demo_booking
  on public.demo_bookings
  for insert
  to anon, authenticated
  with check (
    char_length(btrim(contact_name)) between 2 and 120
    and phone is not null
    and char_length(btrim(phone)) between 6 and 50
    and preferred_date between date '2026-08-09' and date '2026-08-13'
    and preferred_time = any (array[
      '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30',
      '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ]::text[])
    and status = 'new'
    and source = 'booked_page'
    and admin_notes is null
  );

create or replace function public.rpc_create_demo_booking(p_booking jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_contact_name text := btrim(coalesce(p_booking->>'contact_name', ''));
  v_phone text := btrim(coalesce(p_booking->>'phone', ''));
  v_preferred_date date;
  v_preferred_time text := btrim(coalesce(p_booking->>'preferred_time', ''));
begin
  if btrim(coalesce(p_booking->>'website', '')) <> '' then
    return gen_random_uuid();
  end if;

  if char_length(v_contact_name) not between 2 and 120 then
    raise exception 'Please enter your full name.' using errcode = '22023';
  end if;
  if char_length(v_phone) not between 6 and 50 then
    raise exception 'Please enter a valid phone or WhatsApp number.' using errcode = '22023';
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

  begin
    insert into public.demo_bookings (
      contact_name,
      phone,
      preferred_date,
      preferred_time
    ) values (
      v_contact_name,
      v_phone,
      v_preferred_date,
      v_preferred_time
    ) returning id into v_id;
  exception
    when unique_violation then
      raise exception 'That time slot was just taken. Please choose another one.' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

revoke all on function public.rpc_create_demo_booking(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.rpc_create_demo_booking(jsonb) to anon, authenticated, service_role;

comment on table public.demo_booking_slots is
  'Public, non-sensitive availability for the fixed August 2026 school demo calendar.';
