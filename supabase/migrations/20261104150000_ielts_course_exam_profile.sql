-- IELTS self-paced course: a learner's own exam plan (module, test date, target score) and where they came from.
--
-- Owner instruction 2026-11-04 (Asia/Bishkek): market IELTS to independent learners and university applicants in
-- Kyrgyzstan and Central Asia. A short first-visit question set personalises the course (countdown to the test).
-- The target score is the learner's own goal, never a prediction or an estimate by Brains Heist.
-- acquisition keeps the first ad/campaign tags the learner arrived with (utm_*, ref), to measure which ads work.

alter table private.ielts_course_habits add column if not exists exam_module text;
alter table private.ielts_course_habits add column if not exists exam_date date;
alter table private.ielts_course_habits add column if not exists target_band numeric(2,1);
alter table private.ielts_course_habits add column if not exists onboarded_at timestamptz;
alter table private.ielts_course_habits add column if not exists acquisition jsonb;
alter table private.ielts_course_habits drop constraint if exists ielts_course_habits_exam_module_valid;
alter table private.ielts_course_habits add constraint ielts_course_habits_exam_module_valid
  check (exam_module is null or exam_module in ('academic', 'general', 'unsure'));
alter table private.ielts_course_habits drop constraint if exists ielts_course_habits_target_band_valid;
alter table private.ielts_course_habits add constraint ielts_course_habits_target_band_valid
  check (target_band is null or (target_band between 4 and 9 and target_band * 2 = floor(target_band * 2)));

-- Learner-facing: save the exam plan. Every field is optional; calling it marks the welcome as done.
create or replace function public.rpc_ielts_course_exam_profile(
  p_module text default null, p_exam_date date default null, p_target numeric default null, p_acquisition jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_source jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_module is not null and p_module not in ('academic', 'general', 'unsure') then raise exception 'invalid_module'; end if;
  if p_target is not null and (p_target < 4 or p_target > 9 or p_target * 2 <> floor(p_target * 2)) then raise exception 'invalid_target'; end if;
  if p_exam_date is not null and (p_exam_date < current_date - 1 or p_exam_date > current_date + 730) then raise exception 'invalid_exam_date'; end if;
  -- Only short string campaign tags are kept.
  if jsonb_typeof(p_acquisition) = 'object' then
    select jsonb_object_agg(k, left(v #>> '{}', 100)) into v_source
    from jsonb_each(p_acquisition) as e(k, v)
    where k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'landing', 'at')
      and jsonb_typeof(v) = 'string';
  end if;
  insert into private.ielts_course_habits (user_id, exam_module, exam_date, target_band, onboarded_at, acquisition)
  values (v_actor, p_module, p_exam_date, p_target, now(), v_source)
  on conflict (user_id) do update set
    exam_module = excluded.exam_module,
    exam_date = excluded.exam_date,
    target_band = excluded.target_band,
    onboarded_at = coalesce(private.ielts_course_habits.onboarded_at, now()),
    acquisition = coalesce(private.ielts_course_habits.acquisition, excluded.acquisition),
    updated_at = now();
  return public.rpc_ielts_course_habit(null);
end;
$$;

revoke all on function public.rpc_ielts_course_exam_profile(text, date, numeric, jsonb) from public, anon;
grant execute on function public.rpc_ielts_course_exam_profile(text, date, numeric, jsonb) to authenticated;

-- Habit state also carries the exam plan.
create or replace function public.rpc_ielts_course_habit(p_tz text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_habit private.ielts_course_habits%rowtype;
  v_tz text;
  v_state jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_tz := nullif(trim(coalesce(p_tz, '')), '');
  if v_tz is not null and (length(v_tz) > 64 or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz)) then
    v_tz := null;
  end if;
  insert into private.ielts_course_habits (user_id, time_zone)
  values (v_actor, coalesce(v_tz, 'Asia/Bishkek'))
  on conflict (user_id) do update
    set time_zone = coalesce(v_tz, private.ielts_course_habits.time_zone),
        updated_at = case when v_tz is not null and v_tz <> private.ielts_course_habits.time_zone then now() else private.ielts_course_habits.updated_at end
  returning * into v_habit;
  v_state := private.ielts_course_habit_compute(v_actor, v_habit.time_zone, v_habit.daily_goal_xp);
  return v_state
    || jsonb_build_object(
      'reminders', coalesce((select p.ielts_course from public.push_preferences p where p.user_id = v_actor), true),
      'league_tier', v_habit.league_tier,
      'league_name', private.ielts_league_tier_name(v_habit.league_tier),
      'badges', private.ielts_course_badges(v_actor, (v_state->>'longest_streak')::integer, (v_state->>'total_xp')::integer),
      'exam', jsonb_build_object(
        'module', v_habit.exam_module,
        'date', v_habit.exam_date,
        'days_left', case when v_habit.exam_date is not null then v_habit.exam_date - (now() at time zone v_habit.time_zone)::date end,
        'target', v_habit.target_band,
        'onboarded', v_habit.onboarded_at is not null));
end;
$$;

revoke all on function public.rpc_ielts_course_habit(text) from public, anon;
grant execute on function public.rpc_ielts_course_habit(text) to authenticated;
