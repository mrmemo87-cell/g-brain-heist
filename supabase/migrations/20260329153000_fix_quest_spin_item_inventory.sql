-- Ensure spin/reward quest event nodes that award shop items persist those items in inventory.
-- This migration extends rpc_quest_claim_event to mint inventory records when event_payload
-- includes an item reward (direct keys or nested object).

CREATE OR REPLACE FUNCTION public.rpc_quest_claim_event(
  p_run_id UUID,
  p_node_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_node JSONB;
  v_payload JSONB;
  v_xp_delta INTEGER := 0;
  v_coins_delta INTEGER := 0;
  v_next_node INTEGER;
  v_route JSONB;
  v_new_status TEXT := 'active';
  v_node_count INTEGER;
  v_profile RECORD;

  v_item_payload JSONB;
  v_item_id TEXT;
  v_item_name TEXT;
  v_item_kind TEXT;
  v_item_description TEXT;
  v_item_effect_summary TEXT;
  v_item_attack_bonus INTEGER;
  v_item_defense_bonus INTEGER;
  v_item_quantity INTEGER := 0;
  v_items_awarded JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow guarded XP/coins profile writes inside this server-authoritative RPC.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  IF v_run.current_node <> p_node_index THEN
    RAISE EXCEPTION 'Node index mismatch';
  END IF;

  v_route := v_run.route;
  v_node := v_route->p_node_index;
  v_node_count := jsonb_array_length(v_route);

  IF v_node->>'type' NOT IN ('reward', 'surprise') THEN
    RAISE EXCEPTION 'Node % is not an event node', p_node_index;
  END IF;

  IF v_node->>'state' <> 'active' THEN
    RAISE EXCEPTION 'Node % is not active', p_node_index;
  END IF;

  v_payload := COALESCE(v_node->'event_payload', '{"xp":15,"coins":20}'::jsonb);
  v_xp_delta := COALESCE((v_payload->>'xp')::int, 0);
  v_coins_delta := COALESCE((v_payload->>'coins')::int, 0);

  -- Grant currency rewards
  IF v_xp_delta > 0 OR v_coins_delta > 0 THEN
    UPDATE users
    SET xp = xp + v_xp_delta,
        coins = coins + v_coins_delta,
        xp_from_quests = COALESCE(xp_from_quests, 0) + v_xp_delta,
        coins_from_quests = COALESCE(coins_from_quests, 0) + v_coins_delta
    WHERE id = v_user_id;
  END IF;

  -- Grant optional shop/inventory item rewards from spin/event payload.
  -- Supported payload shapes:
  -- 1) { item_id, item_name?, item_kind?, quantity?, ... }
  -- 2) { shop_item_id, ... }
  -- 3) { item: { id|item_id, name, kind, ... }, quantity? }
  v_item_payload := COALESCE(v_payload->'item', '{}'::jsonb);
  v_item_id := NULLIF(COALESCE(v_payload->>'item_id', v_payload->>'shop_item_id', v_item_payload->>'id', v_item_payload->>'item_id'), '');

  IF v_item_id IS NOT NULL THEN
    v_item_quantity := GREATEST(
      COALESCE(
        CASE WHEN COALESCE(v_payload->>'quantity', '') ~ '^-?\d+$' THEN (v_payload->>'quantity')::int END,
        CASE WHEN COALESCE(v_item_payload->>'quantity', '') ~ '^-?\d+$' THEN (v_item_payload->>'quantity')::int END,
        1
      ),
      1
    );

    v_item_name := COALESCE(
      NULLIF(v_payload->>'item_name', ''),
      NULLIF(v_item_payload->>'name', ''),
      v_item_id
    );

    v_item_kind := COALESCE(
      NULLIF(v_payload->>'item_kind', ''),
      NULLIF(v_item_payload->>'kind', ''),
      'consumable'
    );

    v_item_description := COALESCE(
      NULLIF(v_payload->>'item_description', ''),
      NULLIF(v_item_payload->>'description', ''),
      format('Reward won from %s', COALESCE(v_node->>'label', 'quest event'))
    );

    v_item_effect_summary := COALESCE(
      NULLIF(v_payload->>'item_effect_summary', ''),
      NULLIF(v_item_payload->>'effect_summary', ''),
      NULLIF(v_payload->>'effect', ''),
      'Won from spin reward'
    );

    v_item_attack_bonus := COALESCE(
      CASE WHEN COALESCE(v_payload->>'attack_bonus', '') ~ '^-?\d+$' THEN (v_payload->>'attack_bonus')::int END,
      CASE WHEN COALESCE(v_item_payload->>'attack_bonus', '') ~ '^-?\d+$' THEN (v_item_payload->>'attack_bonus')::int END,
      0
    );
    v_item_defense_bonus := COALESCE(
      CASE WHEN COALESCE(v_payload->>'defense_bonus', '') ~ '^-?\d+$' THEN (v_payload->>'defense_bonus')::int END,
      CASE WHEN COALESCE(v_item_payload->>'defense_bonus', '') ~ '^-?\d+$' THEN (v_item_payload->>'defense_bonus')::int END,
      0
    );

    INSERT INTO inventory (
      user_id,
      item_id,
      name,
      kind,
      state,
      description,
      effect_summary,
      attack_bonus,
      defense_bonus
    )
    SELECT
      v_user_id,
      v_item_id,
      v_item_name,
      v_item_kind,
      'unused',
      v_item_description,
      v_item_effect_summary,
      v_item_attack_bonus,
      v_item_defense_bonus
    FROM generate_series(1, v_item_quantity);

    v_items_awarded := jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_id,
        'name', v_item_name,
        'kind', v_item_kind,
        'quantity', v_item_quantity,
        'attack_bonus', v_item_attack_bonus,
        'defense_bonus', v_item_defense_bonus
      )
    );
  END IF;

  -- Advance route
  v_next_node := p_node_index + 1;

  v_route := (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'index')::int = p_node_index THEN
          elem || '{"state":"cleared"}'::jsonb
        WHEN (elem->>'index')::int = v_next_node THEN
          elem || '{"state":"active"}'::jsonb
        ELSE elem
      END
      ORDER BY (elem->>'index')::int
    )
    FROM jsonb_array_elements(v_route) AS elem
  );

  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  UPDATE quest_runs
  SET current_node = v_next_node,
      rewards_xp = rewards_xp + v_xp_delta,
      rewards_coins = rewards_coins + v_coins_delta,
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  -- Log node
  INSERT INTO quest_run_nodes (run_id, node_index, node_type, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_xp_delta, v_coins_delta);

  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'event_title', v_node->>'event_title',
    'event_payload', v_payload,
    'deltas', jsonb_build_object('xp', v_xp_delta, 'coins', v_coins_delta),
    'items_awarded', v_items_awarded,
    'next_node_index', v_next_node,
    'run_status', v_new_status,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$$;
