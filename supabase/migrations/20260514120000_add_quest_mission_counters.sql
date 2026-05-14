-- Add global mission counters to the Quest Mode mission list.
-- play_count: global mission views, including Quest runs plus assignment/task trials that use this mission's questions.
-- questions_answered_count: global answers for this mission, including Quest answers plus task/assignment question attempts.
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
    SELECT
      COUNT(*)::INT AS route_question_count,
      ARRAY_REMOVE(ARRAY_AGG(CASE WHEN NULLIF(node->>'question_id', '') IS NOT NULL THEN (node->>'question_id')::UUID END), NULL) AS question_ids
    FROM jsonb_array_elements(COALESCE(m.route_template, '[]'::jsonb)) AS node
    WHERE node->>'type' IN ('question', 'elite_question')
  ) AS route_stats ON TRUE
  LEFT JOIN LATERAL (
    WITH quest_run_totals AS (
      SELECT COUNT(DISTINCT r.id)::INT AS total
      FROM quest_runs r
      WHERE r.mission_id = m.id
    ),
    assignment_trial_totals AS (
      SELECT COUNT(*)::INT AS total
      FROM (
        SELECT saa.assignment_id, saa.student_id
        FROM student_assignment_answers saa
        WHERE route_stats.question_ids IS NOT NULL
          AND saa.question_id = ANY(route_stats.question_ids)

        UNION

        SELECT sar.assignment_id, sar.student_id
        FROM student_assignment_results sar
        JOIN assignment_questions aq ON aq.assignment_id = sar.assignment_id
        WHERE route_stats.question_ids IS NOT NULL
          AND aq.question_id = ANY(route_stats.question_ids)
      ) assignment_trials
    ),
    pinned_question_attempt_totals AS (
      SELECT COUNT(*)::INT AS total
      FROM question_attempts qa
      WHERE route_stats.question_ids IS NOT NULL
        AND qa.question_id = ANY(route_stats.question_ids)
    ),
    legacy_assignment_answer_totals AS (
      SELECT COUNT(*)::INT AS total
      FROM student_assignment_answers saa
      WHERE route_stats.question_ids IS NOT NULL
        AND saa.question_id = ANY(route_stats.question_ids)
        AND NOT EXISTS (
          SELECT 1
          FROM question_attempts qa
          WHERE qa.student_id = saa.student_id
            AND qa.question_id = saa.question_id
        )
    ),
    unpinned_quest_answer_totals AS (
      SELECT COUNT(n.id)::INT AS total
      FROM quest_runs r
      JOIN quest_run_nodes n ON n.run_id = r.id
      WHERE r.mission_id = m.id
        AND n.node_type IN ('question', 'elite_question')
        AND (
          route_stats.question_ids IS NULL
          OR n.question_id IS NULL
          OR NOT (n.question_id = ANY(route_stats.question_ids))
        )
    )
    SELECT
      (
        COALESCE((SELECT total FROM quest_run_totals), 0)
        + COALESCE((SELECT total FROM assignment_trial_totals), 0)
      )::INT AS play_count,
      (
        COALESCE((SELECT total FROM pinned_question_attempt_totals), 0)
        + COALESCE((SELECT total FROM legacy_assignment_answer_totals), 0)
        + COALESCE((SELECT total FROM unpinned_quest_answer_totals), 0)
      )::INT AS questions_answered_count
  ) AS run_stats ON TRUE
  WHERE m.is_active = true
    AND (p_subject IS NULL OR m.subject = p_subject);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_get_missions(TEXT) TO authenticated;
