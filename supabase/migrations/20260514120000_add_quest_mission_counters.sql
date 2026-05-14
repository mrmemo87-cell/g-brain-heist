-- Add per-player mission counters to the Quest Mode mission list.
-- play_count: how many runs the signed-in player has started for a mission.
-- questions_answered_count: how many question/elite nodes the player has answered for that mission.
-- route_question_count: how many answerable nodes exist in the mission template.

CREATE OR REPLACE FUNCTION public.rpc_quest_get_missions(
  p_subject TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_agg(
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
      'route_question_count', COALESCE(route_stats.route_question_count, 0),
      'play_count', COALESCE(run_stats.play_count, 0),
      'questions_answered_count', COALESCE(run_stats.questions_answered_count, 0),
      'best_run', (
        SELECT jsonb_build_object(
          'chest_tier', r.chest_tier,
          'perfect_run', r.perfect_run,
          'rewards_xp', r.rewards_xp,
          'completed_at', r.completed_at
        )
        FROM quest_runs r
        WHERE r.user_id = v_user_id
          AND r.mission_id = m.id
          AND r.status = 'completed'
        ORDER BY r.rewards_xp DESC
        LIMIT 1
      ),
      'active_run_id', (
        SELECT r.id
        FROM quest_runs r
        WHERE r.user_id = v_user_id
          AND r.mission_id = m.id
          AND r.status = 'active'
        LIMIT 1
      )
    )
    ORDER BY m.sort_order
  ) INTO v_result
  FROM quest_missions m
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS route_question_count
    FROM jsonb_array_elements(COALESCE(m.route_template, '[]'::jsonb)) AS node
    WHERE node->>'type' IN ('question', 'elite_question')
  ) AS route_stats ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT r.id)::INT AS play_count,
      COUNT(n.id) FILTER (WHERE n.node_type IN ('question', 'elite_question'))::INT AS questions_answered_count
    FROM quest_runs r
    LEFT JOIN quest_run_nodes n ON n.run_id = r.id
    WHERE r.user_id = v_user_id
      AND r.mission_id = m.id
  ) AS run_stats ON TRUE
  WHERE m.is_active = true
    AND (p_subject IS NULL OR m.subject = p_subject);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_get_missions(TEXT) TO authenticated;
