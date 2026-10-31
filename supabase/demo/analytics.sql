-- Demo visitor analytics (DEMO PROJECT ONLY). Applied in clone and reset mode; idempotent.
-- Lives in its own schema so the nightly reset (which empties public/private) keeps it.
-- Visitors are told on the entry form that their details and demo activity are recorded.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

create schema if not exists demo_analytics;
revoke all on schema demo_analytics from public, anon, authenticated;

create table if not exists demo_analytics.visitors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  school text,
  role text,
  country text,
  city text,
  class_size text,
  interests text[] not null default '{}',
  message text,
  consent boolean not null default false,
  -- derived from the request, not typed by the visitor
  geo_country text, geo_region text, geo_city text, geo_timezone text,
  locale text, user_agent text, referrer text, utm jsonb not null default '{}'::jsonb,
  screen text, device text,
  visits integer not null default 1,
  active_seconds integer not null default 0,
  entered_as text
);
create index if not exists visitors_email_idx on demo_analytics.visitors (lower(email));
create index if not exists visitors_created_idx on demo_analytics.visitors (created_at desc);

create table if not exists demo_analytics.events (
  id bigserial primary key,
  visitor_id uuid not null references demo_analytics.visitors(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  client_at timestamptz,
  event_type text not null,
  label text,
  path text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists events_visitor_idx on demo_analytics.events (visitor_id, created_at desc);
create index if not exists events_created_idx on demo_analytics.events (created_at desc);

revoke all on all tables in schema demo_analytics from public, anon, authenticated;

-- Visitor registers on the entry form (anonymous call).
create or replace function public.rpc_demo_register_visitor(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(coalesce(p->>'email', ''))); v_name text := trim(coalesce(p->>'full_name', ''));
begin
  if to_regclass('demo_analytics.visitors') is null then raise exception 'demo analytics unavailable'; end if;
  if length(v_name) < 2 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name and a valid email address.');
  end if;
  if not coalesce((p->>'consent')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Please confirm you are happy for us to record your demo visit.');
  end if;
  -- Same person again (same email): keep one record, count the visit.
  select id into v_id from demo_analytics.visitors where lower(email) = v_email order by created_at limit 1;
  if v_id is not null then
    update demo_analytics.visitors set
      last_seen_at = now(), visits = visits + 1,
      full_name = coalesce(nullif(v_name, ''), full_name),
      school = coalesce(nullif(trim(p->>'school'), ''), school),
      role = coalesce(nullif(trim(p->>'role'), ''), role),
      country = coalesce(nullif(trim(p->>'country'), ''), country),
      city = coalesce(nullif(trim(p->>'city'), ''), city),
      class_size = coalesce(nullif(trim(p->>'class_size'), ''), class_size),
      interests = case when jsonb_typeof(p->'interests') = 'array' then array(select jsonb_array_elements_text(p->'interests')) else interests end,
      message = coalesce(nullif(trim(p->>'message'), ''), message),
      geo_country = coalesce(nullif(p->>'geo_country', ''), geo_country), geo_region = coalesce(nullif(p->>'geo_region', ''), geo_region),
      geo_city = coalesce(nullif(p->>'geo_city', ''), geo_city), geo_timezone = coalesce(nullif(p->>'geo_timezone', ''), geo_timezone),
      locale = coalesce(nullif(p->>'locale', ''), locale), user_agent = coalesce(nullif(p->>'user_agent', ''), user_agent),
      referrer = coalesce(nullif(p->>'referrer', ''), referrer), utm = coalesce(p->'utm', utm),
      screen = coalesce(nullif(p->>'screen', ''), screen), device = coalesce(nullif(p->>'device', ''), device),
      entered_as = coalesce(nullif(p->>'entered_as', ''), entered_as)
    where id = v_id;
    return jsonb_build_object('ok', true, 'visitor_id', v_id, 'returning', true);
  end if;
  insert into demo_analytics.visitors(full_name, email, school, role, country, city, class_size, interests, message, consent,
    geo_country, geo_region, geo_city, geo_timezone, locale, user_agent, referrer, utm, screen, device, entered_as)
  values (v_name, v_email, nullif(trim(p->>'school'), ''), nullif(trim(p->>'role'), ''), nullif(trim(p->>'country'), ''),
    nullif(trim(p->>'city'), ''), nullif(trim(p->>'class_size'), ''),
    case when jsonb_typeof(p->'interests') = 'array' then array(select jsonb_array_elements_text(p->'interests')) else '{}' end,
    nullif(trim(p->>'message'), ''), true,
    nullif(p->>'geo_country', ''), nullif(p->>'geo_region', ''), nullif(p->>'geo_city', ''), nullif(p->>'geo_timezone', ''),
    nullif(p->>'locale', ''), left(nullif(p->>'user_agent', ''), 400), left(nullif(p->>'referrer', ''), 400),
    coalesce(p->'utm', '{}'::jsonb), nullif(p->>'screen', ''), nullif(p->>'device', ''), nullif(p->>'entered_as', ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'visitor_id', v_id, 'returning', false);
end $$;
revoke all on function public.rpc_demo_register_visitor(jsonb) from public;
grant execute on function public.rpc_demo_register_visitor(jsonb) to anon, authenticated, service_role;

-- Batched activity events from the visitor's browser.
create or replace function public.rpc_demo_track(p_visitor_id uuid, p_session_id uuid, p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_seconds integer := 0;
begin
  if to_regclass('demo_analytics.events') is null then return jsonb_build_object('ok', false); end if;
  if p_visitor_id is null or p_session_id is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('ok', false);
  end if;
  if not exists (select 1 from demo_analytics.visitors v where v.id = p_visitor_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_visitor');
  end if;
  insert into demo_analytics.events(visitor_id, session_id, client_at, event_type, label, path, meta)
  select p_visitor_id, p_session_id,
    case when (e->>'at') ~ '^\d{4}-' then (e->>'at')::timestamptz else null end,
    left(coalesce(e->>'type', 'event'), 40), left(e->>'label', 160), left(e->>'path', 200),
    coalesce(e->'meta', '{}'::jsonb)
  from jsonb_array_elements(p_events) e
  limit 200;
  get diagnostics v_n = row_count;
  select coalesce(sum((e->'meta'->>'seconds')::integer), 0) into v_seconds
  from jsonb_array_elements(p_events) e where e->>'type' = 'heartbeat' and (e->'meta'->>'seconds') ~ '^\d+$';
  update demo_analytics.visitors set last_seen_at = now(), active_seconds = active_seconds + least(v_seconds, 3600)
  where id = p_visitor_id;
  return jsonb_build_object('ok', true, 'stored', v_n);
end $$;
revoke all on function public.rpc_demo_track(uuid, uuid, jsonb) from public;
grant execute on function public.rpc_demo_track(uuid, uuid, jsonb) to anon, authenticated, service_role;

-- Platform admin: everyone who visited, where from, what they did.
create or replace function public.rpc_demo_visitor_report(p_days integer default 90)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 365)));
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then raise exception 'Platform administrator required'; end if;
  return jsonb_build_object(
    'since', v_since,
    'totals', (select jsonb_build_object(
        'visitors', count(*), 'visits', coalesce(sum(visits), 0), 'countries', count(distinct coalesce(geo_country, country)),
        'schools', count(distinct lower(school)) filter (where school is not null),
        'avg_minutes', round(coalesce(avg(active_seconds), 0) / 60.0, 1),
        'today', count(*) filter (where last_seen_at >= date_trunc('day', now() at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek'),
        'this_week', count(*) filter (where last_seen_at >= now() - interval '7 days'))
      from demo_analytics.visitors where last_seen_at >= v_since),
    'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', c, 'visitors', n) order by n desc), '[]'::jsonb)
      from (select coalesce(geo_country, country, 'Unknown') c, count(*) n from demo_analytics.visitors where last_seen_at >= v_since group by 1 order by 2 desc limit 20) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', n) order by d), '[]'::jsonb)
      from (select (created_at at time zone 'Asia/Bishkek')::date d, count(*) n from demo_analytics.visitors where created_at >= v_since group by 1) x),
    'by_role', (select coalesce(jsonb_agg(jsonb_build_object('role', r, 'visitors', n) order by n desc), '[]'::jsonb)
      from (select coalesce(role, 'Not said') r, count(*) n from demo_analytics.visitors where last_seen_at >= v_since group by 1) x),
    'top_sections', (select coalesce(jsonb_agg(jsonb_build_object('section', s, 'visitors', n, 'views', v) order by n desc, v desc), '[]'::jsonb)
      from (select label s, count(distinct visitor_id) n, count(*) v from demo_analytics.events
            where created_at >= v_since and event_type = 'section' and label is not null group by 1 order by 2 desc, 3 desc limit 15) x),
    'interests', (select coalesce(jsonb_agg(jsonb_build_object('interest', i, 'visitors', n) order by n desc), '[]'::jsonb)
      from (select unnest(interests) i, count(*) n from demo_analytics.visitors where last_seen_at >= v_since group by 1) x),
    'visitors', (select coalesce(jsonb_agg(to_jsonb(v) order by v.last_seen_at desc), '[]'::jsonb) from (
      select v.id, v.created_at, v.last_seen_at, v.full_name, v.email, v.school, v.role, v.country, v.city, v.class_size,
        v.interests, v.message, v.geo_country, v.geo_region, v.geo_city, v.geo_timezone, v.locale, v.referrer, v.utm,
        v.device, v.screen, v.visits, v.active_seconds, v.entered_as,
        (select count(*) from demo_analytics.events e where e.visitor_id = v.id) as events,
        (select count(distinct session_id) from demo_analytics.events e where e.visitor_id = v.id) as sessions,
        (select coalesce(jsonb_agg(s order by s.n desc), '[]'::jsonb) from (
           select e.label as section, count(*) n from demo_analytics.events e
           where e.visitor_id = v.id and e.event_type = 'section' and e.label is not null group by e.label order by 2 desc limit 6) s) as sections,
        (select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'label', e.label, 'path', e.path, 'at', e.created_at, 'meta', e.meta) order by e.created_at desc), '[]'::jsonb)
           from (select * from demo_analytics.events e where e.visitor_id = v.id and e.event_type <> 'heartbeat' order by e.created_at desc limit 40) e) as recent_events
      from demo_analytics.visitors v where v.last_seen_at >= v_since order by v.last_seen_at desc limit 500) v)
  );
end $$;
revoke all on function public.rpc_demo_visitor_report(integer) from public, anon;
grant execute on function public.rpc_demo_visitor_report(integer) to authenticated, service_role;

-- Platform admin: full timeline for one visitor.
create or replace function public.rpc_demo_visitor_timeline(p_visitor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then raise exception 'Platform administrator required'; end if;
  return jsonb_build_object(
    'visitor', (select to_jsonb(v) from demo_analytics.visitors v where v.id = p_visitor_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'label', e.label, 'path', e.path, 'at', e.created_at, 'session', e.session_id, 'meta', e.meta) order by e.created_at), '[]'::jsonb)
      from (select * from demo_analytics.events e where e.visitor_id = p_visitor_id order by e.created_at desc limit 2000) e)
  );
end $$;
revoke all on function public.rpc_demo_visitor_timeline(uuid) from public, anon;
grant execute on function public.rpc_demo_visitor_timeline(uuid) to authenticated, service_role;
