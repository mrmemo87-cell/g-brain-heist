-- IELTS growth report for the owner: which ad campaigns bring visitors, sign-ups, active learners and Prime buyers.
--
-- Owner direction 2026-11-04 (Asia/Bishkek): advertise IELTS to independent learners and see which ads earn money.
-- Superadmin only. Aggregates only: no names, emails or IPs leave this function.
--   visitors    distinct anonymous visitors of /ielts-prep (site_analytics.visits), by utm_campaign/utm_source
--   signups     IELTS learners whose saved first-touch tags (ielts_course_habits.acquisition) name the campaign
--   started     of those, learners who opened a course lesson
--   cleared     of those, learners who cleared Unit 1 or V1
--   paid        of those, learners with an IELTS Prime subscription created in the window
-- Learners with no campaign tags are grouped as "(direct or unknown)".

create or replace function public.rpc_ielts_growth_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_campaigns jsonb;
  v_daily jsonb;
  v_totals jsonb;
begin
  if not public.is_superadmin((select auth.uid())) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  with visits as (
    select coalesce(nullif(v.utm->>'utm_campaign', ''), nullif(v.utm->>'utm_source', ''), '(direct or unknown)') as campaign,
           nullif(v.utm->>'utm_source', '') as source,
           v.visitor_id
    from site_analytics.visits v
    where v.created_at >= v_since and v.path = '/ielts-prep'
  ), learners as (
    select h.user_id,
           coalesce(nullif(h.acquisition->>'utm_campaign', ''), nullif(h.acquisition->>'utm_source', ''), '(direct or unknown)') as campaign,
           nullif(h.acquisition->>'utm_source', '') as source,
           exists (select 1 from public.ielts_course_progress p where p.user_id = h.user_id and p.lesson_viewed_at is not null) as started,
           exists (select 1 from public.ielts_course_progress p
                   join public.ielts_course_units u on u.id = p.unit_id and u.position = 1
                   where p.user_id = h.user_id and p.completed_at is not null) as cleared,
           exists (select 1 from public.ielts_prime_subscriptions s where s.user_id = h.user_id and s.created_at >= v_since) as paid
    from private.ielts_course_habits h
    where h.created_at >= v_since
      and not exists (select 1 from public.school_members sm where sm.user_id = h.user_id and sm.status = 'active')
  ), names as (
    select campaign from visits union select campaign from learners
  )
  select coalesce(jsonb_agg(row order by (row->>'visitors')::int desc, (row->>'signups')::int desc), '[]'::jsonb) into v_campaigns
  from (
    select jsonb_build_object(
      'campaign', n.campaign,
      'source', coalesce((select min(v.source) from visits v where v.campaign = n.campaign), (select min(l.source) from learners l where l.campaign = n.campaign)),
      'visitors', (select count(distinct v.visitor_id) from visits v where v.campaign = n.campaign),
      'signups', (select count(*) from learners l where l.campaign = n.campaign),
      'started', (select count(*) from learners l where l.campaign = n.campaign and l.started),
      'cleared', (select count(*) from learners l where l.campaign = n.campaign and l.cleared),
      'paid', (select count(*) from learners l where l.campaign = n.campaign and l.paid)) as row
    from names n
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'signups', d.signups) order by d.day), '[]'::jsonb) into v_daily
  from (
    select g.day::date as day,
      (select count(distinct v.visitor_id) from site_analytics.visits v
        where v.path = '/ielts-prep' and (v.created_at at time zone 'Asia/Bishkek')::date = g.day::date) as visitors,
      (select count(*) from private.ielts_course_habits h
        where (h.created_at at time zone 'Asia/Bishkek')::date = g.day::date
          and not exists (select 1 from public.school_members sm where sm.user_id = h.user_id and sm.status = 'active')) as signups
    from generate_series((v_since at time zone 'Asia/Bishkek')::date, (now() at time zone 'Asia/Bishkek')::date, interval '1 day') g(day)
  ) d;

  select jsonb_build_object(
    'visitors', coalesce(sum((c->>'visitors')::int), 0),
    'signups', coalesce(sum((c->>'signups')::int), 0),
    'started', coalesce(sum((c->>'started')::int), 0),
    'cleared', coalesce(sum((c->>'cleared')::int), 0),
    'paid', coalesce(sum((c->>'paid')::int), 0),
    'active_prime', (select count(distinct s.user_id) from public.ielts_prime_subscriptions s
                     where s.status in ('active', 'trialing') or (s.status = 'cancelled' and s.current_period_end > now())))
  into v_totals
  from jsonb_array_elements(v_campaigns) c;

  return jsonb_build_object('days', greatest(1, least(coalesce(p_days, 30), 365)), 'totals', v_totals, 'campaigns', v_campaigns, 'daily', v_daily);
end;
$$;

revoke all on function public.rpc_ielts_growth_report(integer) from public, anon;
grant execute on function public.rpc_ielts_growth_report(integer) to authenticated;
