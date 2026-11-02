-- Site visitor analytics for brainsheist.com (the main site, not the demo school).
--
-- Records anonymous page views from people who are NOT signed in, so the superadmin can
-- see how many new people visit, from which countries and sources, and which pages they
-- open. No names, emails or IP addresses are stored: a visitor is a random id kept in the
-- browser. Approximate country/city come from Vercel's edge headers via /api/site-visit.
--
-- Also gives the superadmin a list of accounts that signed up but never joined a school.

create schema if not exists site_analytics;
revoke all on schema site_analytics from public, anon, authenticated;

create table if not exists site_analytics.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor_id uuid not null,
  session_id uuid,
  path text,
  referrer_host text,
  utm jsonb not null default '{}'::jsonb,
  geo_country text,
  geo_city text,
  device text,
  locale text
);

create index if not exists site_visits_created_idx on site_analytics.visits (created_at desc);
create index if not exists site_visits_visitor_idx on site_analytics.visits (visitor_id, created_at desc);

alter table site_analytics.visits enable row level security;
revoke all on site_analytics.visits from public, anon, authenticated;

-- Write path: one anonymous page view. Called by /api/site-visit (anon key).
create or replace function public.rpc_site_visit(
  p_visitor_id uuid,
  p_session_id uuid,
  p_path text,
  p_referrer_host text,
  p_utm jsonb,
  p_country text,
  p_city text,
  p_device text,
  p_locale text
) returns boolean
language plpgsql
security definer
set search_path = public, site_analytics
as $$
declare
  v_recent int;
  v_utm jsonb := '{}'::jsonb;
begin
  if p_visitor_id is null then
    return false;
  end if;

  -- Abuse guard: at most 60 page views per visitor per hour.
  select count(*) into v_recent
  from site_analytics.visits
  where visitor_id = p_visitor_id and created_at > now() - interval '1 hour';
  if v_recent >= 60 then
    return false;
  end if;

  if jsonb_typeof(p_utm) = 'object' then
    select coalesce(jsonb_object_agg(key, left(value, 120)), '{}'::jsonb) into v_utm
    from jsonb_each_text(p_utm)
    where key in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term');
  end if;

  insert into site_analytics.visits (visitor_id, session_id, path, referrer_host, utm, geo_country, geo_city, device, locale)
  values (
    p_visitor_id,
    p_session_id,
    left(nullif(p_path, ''), 200),
    left(nullif(lower(p_referrer_host), ''), 120),
    v_utm,
    upper(left(nullif(p_country, ''), 2)),
    left(nullif(p_city, ''), 80),
    case when p_device in ('phone', 'tablet', 'desktop') then p_device else null end,
    left(nullif(p_locale, ''), 20)
  );
  return true;
end;
$$;

revoke all on function public.rpc_site_visit(uuid, uuid, text, text, jsonb, text, text, text, text) from public;
grant execute on function public.rpc_site_visit(uuid, uuid, text, text, jsonb, text, text, text, text) to anon, authenticated;

-- Read path: superadmin-only report.
create or replace function public.rpc_site_visitor_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, site_analytics, auth
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'Platform administrator required.' using errcode = '42501';
  end if;

  with v as (
    select * from site_analytics.visits where created_at >= v_since
  ),
  per_visitor as (
    select
      visitor_id,
      min(created_at) as first_seen,
      max(created_at) as last_seen,
      count(*) as pages,
      count(distinct coalesce(session_id, visitor_id)) as visits,
      (array_agg(geo_country order by created_at) filter (where geo_country is not null))[1] as country,
      (array_agg(geo_city order by created_at) filter (where geo_city is not null))[1] as city,
      (array_agg(device order by created_at) filter (where device is not null))[1] as device,
      (array_agg(referrer_host order by created_at) filter (where referrer_host is not null))[1] as referrer_host,
      (array_agg(utm->>'utm_source' order by created_at) filter (where utm ? 'utm_source'))[1] as utm_source,
      array_agg(distinct path) filter (where path is not null) as paths
    from v
    group by visitor_id
  ),
  sourced as (
    select *, coalesce(utm_source, referrer_host, 'Direct / unknown') as source from per_visitor
  )
  select jsonb_build_object(
    'days', v_days,
    'totals', jsonb_build_object(
      'visitors', (select count(*) from per_visitor),
      'page_views', (select count(*) from v),
      'today', (select count(distinct visitor_id) from v where created_at >= date_trunc('day', now())),
      'this_week', (select count(distinct visitor_id) from v where created_at >= now() - interval '7 days'),
      'countries', (select count(distinct country) from per_visitor where country is not null)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors) order by d.day)
      from (
        select date_trunc('day', created_at)::date as day, count(distinct visitor_id) as visitors
        from v group by 1
      ) d
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('country', c.country, 'visitors', c.n) order by c.n desc)
      from (select country, count(*) as n from per_visitor where country is not null group by 1 order by 2 desc limit 15) c
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'visitors', s.n) order by s.n desc)
      from (select source, count(*) as n from sourced group by 1 order by 2 desc limit 15) s
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', p.path, 'views', p.views, 'visitors', p.visitors) order by p.views desc)
      from (
        select path, count(*) as views, count(distinct visitor_id) as visitors
        from v where path is not null group by 1 order by 2 desc limit 15
      ) p
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visitor_id', r.visitor_id, 'first_seen', r.first_seen, 'last_seen', r.last_seen,
        'pages', r.pages, 'visits', r.visits, 'country', r.country, 'city', r.city,
        'device', r.device, 'source', r.source, 'paths', to_jsonb(r.paths)
      ) order by r.last_seen desc)
      from (select * from sourced order by last_seen desc limit 100) r
    ), '[]'::jsonb),
    'unplaced', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'username', pu.username, 'full_name', pu.full_name,
        'role', coalesce(pu.role, u.raw_user_meta_data->>'role'),
        'signed_up', u.created_at, 'last_sign_in', u.last_sign_in_at
      ) order by u.created_at desc)
      from (
        select au.* from auth.users au
        left join public.users pu2 on pu2.id = au.id
        where au.created_at >= v_since
          and au.deleted_at is null
          and pu2.school_id is null
          and coalesce(pu2.is_admin, false) = false
          and not exists (
            select 1 from public.school_members m
            where m.user_id = au.id and m.status = 'active'
          )
          and not exists (select 1 from public.superadmins sa where sa.user_id = au.id)
        order by au.created_at desc
        limit 200
      ) u
      left join public.users pu on pu.id = u.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_site_visitor_report(int) from public, anon;
grant execute on function public.rpc_site_visitor_report(int) to authenticated;
