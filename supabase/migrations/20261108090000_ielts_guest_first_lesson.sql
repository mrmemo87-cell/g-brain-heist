-- Guest start: visitors from ads can read the first teaching lesson before creating an account.
-- Returns only the main track's Unit 1 lesson cards (intro, sections, example, tips). No tasks, no answer keys,
-- no progress and nothing about any user: the practice questions and all scoring stay behind sign-in.

create or replace function public.rpc_ielts_guest_first_lesson()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unit_id', u.id,
    'title', u.title,
    'lesson', jsonb_build_object(
      'intro', u.lesson->'intro',
      'sections', coalesce(u.lesson->'sections', '[]'::jsonb),
      'example', u.lesson->'example',
      'tips', coalesce(u.lesson->'tips', '[]'::jsonb)
    )
  )
  from public.ielts_course_units u
  where u.track = 'main' and u.position = 1
  order by u.id
  limit 1;
$$;

revoke all on function public.rpc_ielts_guest_first_lesson() from public, anon;
grant execute on function public.rpc_ielts_guest_first_lesson() to anon, authenticated;

-- Funnel report: add the guest steps (warm-up quiz finished, guest lesson finished).
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
      and path in ('/ielts-prep', '/ielts-prep/start', '/ielts/start', '/ielts/start/quiz-done', '/ielts/start/lesson-done',
                   '/ielts/signup', '/ielts/signup-created', '/ielts/signup-verified')
  )
  select jsonb_build_object(
    'landing', (select count(distinct visitor_id) from v where path = '/ielts-prep'),
    'pressed_start', (select count(distinct visitor_id) from v where path = '/ielts-prep/start'),
    'quiz_done', (select count(distinct visitor_id) from v where path = '/ielts/start/quiz-done'),
    'lesson_done', (select count(distinct visitor_id) from v where path = '/ielts/start/lesson-done'),
    'saw_signup', (select count(distinct visitor_id) from v where path = '/ielts/signup'),
    'created_account', (select count(distinct visitor_id) from v where path = '/ielts/signup-created'),
    'confirmed_code', (select count(distinct visitor_id) from v where path = '/ielts/signup-verified'),
    'by_campaign', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign', c.campaign,
        'landing', c.landing, 'pressed_start', c.pressed_start, 'quiz_done', c.quiz_done, 'lesson_done', c.lesson_done,
        'saw_signup', c.saw_signup, 'created_account', c.created_account, 'confirmed_code', c.confirmed_code) order by c.landing desc)
      from (
        select campaign,
          count(distinct visitor_id) filter (where path = '/ielts-prep') as landing,
          count(distinct visitor_id) filter (where path = '/ielts-prep/start') as pressed_start,
          count(distinct visitor_id) filter (where path = '/ielts/start/quiz-done') as quiz_done,
          count(distinct visitor_id) filter (where path = '/ielts/start/lesson-done') as lesson_done,
          count(distinct visitor_id) filter (where path = '/ielts/signup') as saw_signup,
          count(distinct visitor_id) filter (where path = '/ielts/signup-created') as created_account,
          count(distinct visitor_id) filter (where path = '/ielts/signup-verified') as confirmed_code
        from v group by campaign
      ) c), '[]'::jsonb)
  );
$$;

revoke all on function private.ielts_signup_funnel_internal(integer) from public, anon, authenticated;
grant execute on function private.ielts_signup_funnel_internal(integer) to service_role;
