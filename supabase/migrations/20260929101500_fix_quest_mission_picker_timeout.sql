-- Hotfix: keep the student Quest mission picker responsive under classroom load.
-- The previous mission catalogue counted assignment/task evidence for every mission
-- on every student request. With tens of thousands of answer rows and many
-- simultaneous students, authenticated PostgREST requests hit statement_timeout
-- and the Quest UI remained on its loading state.
--
-- Mission-list counters are display metadata, not academic evidence. Keep this
-- latency-sensitive RPC focused on Quest Mode activity. Assignment evidence stays
-- available through assignment/reporting RPCs.

create index if not exists idx_quest_runs_user_mission_status_rewards
  on public.quest_runs (user_id, mission_id, status, rewards_xp desc);

create or replace function public.rpc_quest_get_missions(
  p_subject text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with active_missions as (
    select
      m.id,
      m.subject,
      m.code,
      m.title,
      m.description,
      m.mission_type,
      m.difficulty,
      m.route_template,
      m.energy_cost,
      m.sort_order,
      (
        select count(*)::int
        from jsonb_array_elements(coalesce(m.route_template, '[]'::jsonb)) node
        where node->>'type' in ('question','elite_question')
      ) as route_question_count
    from public.quest_missions m
    where m.is_active = true
      and (p_subject is null or m.subject = p_subject)
  ),
  run_counts as (
    select
      r.mission_id,
      count(*)::int as play_count
    from public.quest_runs r
    join active_missions m on m.id = r.mission_id
    group by r.mission_id
  ),
  answer_counts as (
    select
      r.mission_id,
      count(n.id)::int as questions_answered_count
    from public.quest_runs r
    join active_missions m on m.id = r.mission_id
    join public.quest_run_nodes n on n.run_id = r.id
    where n.node_type in ('question','elite_question')
    group by r.mission_id
  ),
  my_best as (
    select distinct on (r.mission_id)
      r.mission_id,
      jsonb_build_object(
        'chest_tier', r.chest_tier,
        'perfect_run', r.perfect_run,
        'rewards_xp', r.rewards_xp,
        'completed_at', r.completed_at
      ) as best_run
    from public.quest_runs r
    join active_missions m on m.id = r.mission_id
    where r.user_id = auth.uid()
      and r.status = 'completed'
    order by r.mission_id, r.rewards_xp desc, r.completed_at desc nulls last
  ),
  my_active as (
    select distinct on (r.mission_id)
      r.mission_id,
      r.id as active_run_id
    from public.quest_runs r
    join active_missions m on m.id = r.mission_id
    where r.user_id = auth.uid()
      and r.status = 'active'
    order by r.mission_id, r.started_at desc, r.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'subject', m.subject,
        'code', m.code,
        'title', m.title,
        'description', m.description,
        'mission_type', m.mission_type,
        'difficulty', m.difficulty,
        'route_template', m.route_template,
        'energy_cost', m.energy_cost,
        'sort_order', m.sort_order,
        'route_question_count', coalesce(m.route_question_count, 0),
        'play_count', coalesce(rc.play_count, 0),
        'questions_answered_count', coalesce(ac.questions_answered_count, 0),
        'best_run', mb.best_run,
        'active_run_id', ma.active_run_id
      )
      order by m.sort_order, m.title, m.id
    ),
    '[]'::jsonb
  )
  from active_missions m
  left join run_counts rc on rc.mission_id = m.id
  left join answer_counts ac on ac.mission_id = m.id
  left join my_best mb on mb.mission_id = m.id
  left join my_active ma on ma.mission_id = m.id;
$$;

revoke all on function public.rpc_quest_get_missions(text) from public;
grant execute on function public.rpc_quest_get_missions(text) to authenticated;

comment on function public.rpc_quest_get_missions(text) is
  'Fast mission picker payload. Returns active missions, route question counts, Quest-run activity counters, and the signed-in learner best/active run without scanning assignment evidence tables.';
