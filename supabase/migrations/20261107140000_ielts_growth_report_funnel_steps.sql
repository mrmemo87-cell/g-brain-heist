-- Signup funnel steps for the owner's IELTS growth report: how many anonymous visitors reached each step
-- (landing → pressed Start → saw the sign-up form → created an account → confirmed the email code).
-- Additive: adds a 'funnel' key to private.ielts_growth_report_internal's result; nothing else changes.

create or replace function private.ielts_signup_funnel_internal(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select path, visitor_id, coalesce(nullif(utm->>'utm_campaign', ''), '(direct or unknown)') as campaign
    from site_analytics.visits
    where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
      and path in ('/ielts-prep', '/ielts-prep/start', '/ielts/signup', '/ielts/signup-created', '/ielts/signup-verified')
  )
  select jsonb_build_object(
    'landing', (select count(distinct visitor_id) from v where path = '/ielts-prep'),
    'pressed_start', (select count(distinct visitor_id) from v where path = '/ielts-prep/start'),
    'saw_signup', (select count(distinct visitor_id) from v where path = '/ielts/signup'),
    'created_account', (select count(distinct visitor_id) from v where path = '/ielts/signup-created'),
    'confirmed_code', (select count(distinct visitor_id) from v where path = '/ielts/signup-verified'),
    'by_campaign', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign', c.campaign,
        'landing', c.landing, 'pressed_start', c.pressed_start, 'saw_signup', c.saw_signup,
        'created_account', c.created_account, 'confirmed_code', c.confirmed_code) order by c.landing desc)
      from (
        select campaign,
          count(distinct visitor_id) filter (where path = '/ielts-prep') as landing,
          count(distinct visitor_id) filter (where path = '/ielts-prep/start') as pressed_start,
          count(distinct visitor_id) filter (where path = '/ielts/signup') as saw_signup,
          count(distinct visitor_id) filter (where path = '/ielts/signup-created') as created_account,
          count(distinct visitor_id) filter (where path = '/ielts/signup-verified') as confirmed_code
        from v group by campaign
      ) c), '[]'::jsonb)
  );
$$;

revoke all on function private.ielts_signup_funnel_internal(integer) from public, anon, authenticated;
grant execute on function private.ielts_signup_funnel_internal(integer) to service_role;

-- Add the funnel to the existing report without restating its body.
do $do$
declare
  v_def text := pg_get_functiondef('private.ielts_growth_report_internal(integer)'::regprocedure);
  v_old text := $q$'campaigns', v_campaigns, 'daily', v_daily);$q$;
  v_new text := $q$'campaigns', v_campaigns, 'daily', v_daily, 'funnel', private.ielts_signup_funnel_internal(p_days));$q$;
begin
  if position(v_new in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'ielts_growth_report_internal return clause not found';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$do$;
