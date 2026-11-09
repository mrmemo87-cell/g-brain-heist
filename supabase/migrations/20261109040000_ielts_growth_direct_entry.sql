-- Ads can now link straight to the warm-up (/ielts/start). Count those visitors as visitors in the growth report,
-- and add "stayed 5 seconds" to the funnel so accidental taps can be told apart from real readers.

do $do$
declare
  v_def text := pg_get_functiondef('private.ielts_growth_report_internal(integer)'::regprocedure);
  v_new text;
begin
  if position($q$v.path in ('/ielts-prep', '/ielts/start')$q$ in v_def) > 0 then
    return;
  end if;
  v_new := replace(v_def, $q$v.path = '/ielts-prep'$q$, $q$v.path in ('/ielts-prep', '/ielts/start')$q$);
  if v_new = v_def then
    raise exception 'ielts_growth_report_internal visitor filter not found';
  end if;
  execute v_new;
end;
$do$;

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
      and path in ('/ielts-prep', '/ielts-prep/engaged', '/ielts-prep/start', '/ielts/start', '/ielts/start/engaged',
                   '/ielts/start/quiz-done', '/ielts/start/lesson-done', '/ielts/signup', '/ielts/signup-created', '/ielts/signup-verified')
  ), per as (
    select campaign,
      count(distinct visitor_id) filter (where path = '/ielts-prep') as landing,
      count(distinct visitor_id) filter (where path = '/ielts-prep/engaged') as landing_engaged,
      count(distinct visitor_id) filter (where path = '/ielts-prep/start') as pressed_start,
      count(distinct visitor_id) filter (where path = '/ielts/start') as opened_warmup,
      count(distinct visitor_id) filter (where path = '/ielts/start/engaged') as warmup_engaged,
      count(distinct visitor_id) filter (where path = '/ielts/start/quiz-done') as quiz_done,
      count(distinct visitor_id) filter (where path = '/ielts/start/lesson-done') as lesson_done,
      count(distinct visitor_id) filter (where path = '/ielts/signup') as saw_signup,
      count(distinct visitor_id) filter (where path = '/ielts/signup-created') as created_account,
      count(distinct visitor_id) filter (where path = '/ielts/signup-verified') as confirmed_code
    from v group by campaign
  )
  select jsonb_build_object(
    'landing', (select count(distinct visitor_id) from v where path = '/ielts-prep'),
    'landing_engaged', (select count(distinct visitor_id) from v where path = '/ielts-prep/engaged'),
    'pressed_start', (select count(distinct visitor_id) from v where path = '/ielts-prep/start'),
    'opened_warmup', (select count(distinct visitor_id) from v where path = '/ielts/start'),
    'warmup_engaged', (select count(distinct visitor_id) from v where path = '/ielts/start/engaged'),
    'quiz_done', (select count(distinct visitor_id) from v where path = '/ielts/start/quiz-done'),
    'lesson_done', (select count(distinct visitor_id) from v where path = '/ielts/start/lesson-done'),
    'saw_signup', (select count(distinct visitor_id) from v where path = '/ielts/signup'),
    'created_account', (select count(distinct visitor_id) from v where path = '/ielts/signup-created'),
    'confirmed_code', (select count(distinct visitor_id) from v where path = '/ielts/signup-verified'),
    'by_campaign', coalesce((select jsonb_agg(to_jsonb(per) order by per.landing + per.opened_warmup desc) from per), '[]'::jsonb)
  );
$$;

revoke all on function private.ielts_signup_funnel_internal(integer) from public, anon, authenticated;
grant execute on function private.ielts_signup_funnel_internal(integer) to service_role;
