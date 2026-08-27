-- Add an additive, School Head-only engagement trend for the executive overview.
--
-- The metric is intentionally narrow and auditable: each point is the number of
-- distinct active school students who started at least one Brains Heist session
-- during that rolling 7-day window. It does not infer or fabricate activity from
-- the current last_seen snapshot.

create or replace function public.school_head_get_engagement_trend(
  p_school_id uuid,
  p_weeks integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_weeks integer := greatest(4, least(coalesce(p_weeks, 8), 12));
  v_students integer := 0;
  v_points jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  select count(*)::integer
  into v_students
  from public.school_members sm
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student';

  with buckets as (
    select
      g as bucket_index,
      now() - make_interval(days => ((v_weeks - g) * 7)) as starts_at,
      now() - make_interval(days => ((v_weeks - g - 1) * 7)) as ends_at
    from generate_series(0, v_weeks - 1) as g
  ),
  school_sessions as (
    select s.user_id, s.started_at
    from public.sessions s
    join public.school_members sm
      on sm.user_id = s.user_id
     and sm.school_id = p_school_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where s.started_at >= now() - make_interval(days => (v_weeks * 7))
      and s.started_at < now()
  ),
  weekly as (
    select
      b.bucket_index,
      b.starts_at,
      b.ends_at,
      count(distinct ss.user_id)::integer as active_students
    from buckets b
    left join school_sessions ss
      on ss.started_at >= b.starts_at
     and ss.started_at < b.ends_at
    group by b.bucket_index, b.starts_at, b.ends_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', to_char(w.starts_at, 'Mon DD'),
        'starts_at', w.starts_at,
        'ends_at', w.ends_at,
        'active_students', w.active_students,
        'activity_rate', case
          when v_students > 0 then round((w.active_students::numeric * 100) / v_students, 1)
          else 0
        end
      )
      order by w.bucket_index
    ),
    '[]'::jsonb
  )
  into v_points
  from weekly w;

  return jsonb_build_object(
    'weeks', v_weeks,
    'student_total', v_students,
    'definition', 'Distinct active students with at least one Brains Heist session in each rolling 7-day window.',
    'points', v_points,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.school_head_get_engagement_trend(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.school_head_get_engagement_trend(uuid, integer)
  to authenticated;

comment on function public.school_head_get_engagement_trend(uuid, integer) is
  'School Head-only rolling weekly engagement trend. Counts distinct active school students with at least one Brains Heist session per 7-day window.';
