-- Keep public booking inserts write-only: generate the UUID before INSERT so
-- the anonymous role never needs SELECT permission for INSERT ... RETURNING.

grant insert (id, contact_name, phone, preferred_date, preferred_time)
  on public.demo_bookings to anon, authenticated;

create or replace function public.rpc_create_demo_booking(p_booking jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
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
      id,
      contact_name,
      phone,
      preferred_date,
      preferred_time
    ) values (
      v_id,
      v_contact_name,
      v_phone,
      v_preferred_date,
      v_preferred_time
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
