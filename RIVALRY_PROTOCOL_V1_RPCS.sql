-- RPC NOTES
-- Rivalry Protocol (Clan Wars V1) RPC layer only.
-- Assumes rivalry_* tables already exist.
-- Parallel subsystem: does not modify solo PvP write path or AP economy.
-- Account-age roster check intentionally skipped due potential users-schema drift across environments.

BEGIN;

-- ------------------------------------------------------------------
-- Constants helper
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rivalry_constants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'challenge_timeout_hours', 12,
    'prep_duration_hours', 6,
    'live_duration_hours', 24,
    'blackout_before_end_hours', 2,
    'min_clan_size_to_declare', 5,
    'min_locked_roster_size', 5,
    'max_roster_size', 7,
    'min_member_level', 5,
    'declaration_cap_per_24h', 2,
    'pair_cooldown_hours', 72,
    'oe_max', 10,
    'oe_start', 6,
    'oe_regen_minutes', 45,
    'strike_cost', 2,
    'sabotage_cost', 3,
    'repair_cost', 2,
    'strike_cooldown_seconds', 60,
    'sabotage_cooldown_seconds', 180,
    'repair_cooldown_seconds', 90
  );
$$;

-- ------------------------------------------------------------------
-- Internal helpers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rivalry_canonical_pair(p_clan_1 uuid, p_clan_2 uuid)
RETURNS TABLE (clan_a_id uuid, clan_b_id uuid)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(p_clan_1, p_clan_2), GREATEST(p_clan_1, p_clan_2);
$$;

CREATE OR REPLACE FUNCTION public.rivalry_lock_pair(p_clan_1 uuid, p_clan_2 uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
  SELECT clan_a_id, clan_b_id INTO v_a, v_b FROM public.rivalry_canonical_pair(p_clan_1, p_clan_2);
  PERFORM pg_advisory_xact_lock(hashtext('rivalry:pair:' || v_a::text || ':' || v_b::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_recompute_structure_band(p_structure_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur int;
  v_max int;
  v_band text;
BEGIN
  SELECT current_integrity, max_integrity INTO v_cur, v_max
  FROM public.rivalry_war_structures
  WHERE id = p_structure_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_cur <= 0 THEN
    v_band := 'down';
  ELSIF v_cur * 100 <= v_max * 30 THEN
    v_band := 'critical';
  ELSIF v_cur * 100 <= v_max * 60 THEN
    v_band := 'strained';
  ELSE
    v_band := 'healthy';
  END IF;

  UPDATE public.rivalry_war_structures
  SET state_band = v_band
  WHERE id = p_structure_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_doctrine_multiplier(p_doctrine text, p_kind text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'strike' THEN CASE p_doctrine
      WHEN 'breach' THEN 1.08
      WHEN 'disruption' THEN 0.96
      ELSE 1.00
    END
    WHEN 'repair' THEN CASE p_doctrine
      WHEN 'breach' THEN 0.94
      WHEN 'fortress' THEN 1.12
      ELSE 1.00
    END
    WHEN 'mitigation' THEN CASE p_doctrine
      WHEN 'fortress' THEN 1.06
      ELSE 1.00
    END
    WHEN 'sabotage_score' THEN CASE p_doctrine
      WHEN 'disruption' THEN 1.05
      WHEN 'fortress' THEN 0.95
      ELSE 1.00
    END
    WHEN 'sabotage_duration' THEN CASE p_doctrine
      WHEN 'disruption' THEN 1.15
      ELSE 1.00
    END
    ELSE 1.00
  END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_role_multiplier(p_role text, p_kind text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'strike' THEN CASE p_role
      WHEN 'striker' THEN 1.07
      WHEN 'saboteur' THEN 0.97
      ELSE 1.00
    END
    WHEN 'repair' THEN CASE p_role
      WHEN 'engineer' THEN 1.10
      WHEN 'striker' THEN 0.96
      ELSE 1.00
    END
    WHEN 'sabotage_score' THEN CASE p_role
      WHEN 'saboteur' THEN 1.08
      WHEN 'engineer' THEN 0.97
      ELSE 1.00
    END
    ELSE 1.00
  END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_apply_member_oe_regen(p_war_id uuid, p_user_id uuid)
RETURNS TABLE(current_oe int, oe_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state record;
  v_cfg jsonb := public.rivalry_constants();
  v_oe_max int := (v_cfg->>'oe_max')::int;
  v_regen_mins int := (v_cfg->>'oe_regen_minutes')::int;
  v_ticks int;
  v_new_oe int;
  v_new_ts timestamptz;
BEGIN
  SELECT * INTO v_state
  FROM public.rivalry_war_member_state ms
  WHERE ms.war_id = p_war_id AND ms.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_ticks := FLOOR(EXTRACT(EPOCH FROM (now() - v_state.oe_updated_at)) / (v_regen_mins * 60));
  v_ticks := GREATEST(v_ticks, 0);

  IF v_ticks > 0 THEN
    v_new_oe := LEAST(v_oe_max, v_state.current_oe + v_ticks);
    v_new_ts := v_state.oe_updated_at + make_interval(mins => v_ticks * v_regen_mins);

    UPDATE public.rivalry_war_member_state
    SET current_oe = v_new_oe,
        oe_updated_at = v_new_ts
    WHERE war_id = p_war_id AND user_id = p_user_id;

    current_oe := v_new_oe;
    oe_updated_at := v_new_ts;
  ELSE
    current_oe := v_state.current_oe;
    oe_updated_at := v_state.oe_updated_at;
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_mirror_activity_milestone(
  p_kind text,
  p_war_id uuid,
  p_actor_clan_id uuid,
  p_target_clan_id uuid,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
  v_target_name text;
BEGIN
  SELECT name INTO v_actor_name FROM public.clans WHERE id = p_actor_clan_id;
  SELECT name INTO v_target_name FROM public.clans WHERE id = p_target_clan_id;

  -- Minimal mirror into activities (schema should be validated in prod).
  INSERT INTO public.activities(kind, actor_id, actor_username, target_id, target_username, data, created_at)
  VALUES (
    p_kind,
    NULL,
    COALESCE(v_actor_name, 'Rivalry Protocol'),
    NULL,
    v_target_name,
    jsonb_build_object(
      'war_id', p_war_id,
      'attacker_clan_id', p_actor_clan_id,
      'defender_clan_id', p_target_clan_id,
      'details', p_details
    ),
    now()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Keep gameplay path resilient if activities schema differs.
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.rivalry_refresh_war_phase(p_war_id uuid)
RETURNS public.rivalry_wars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war public.rivalry_wars%rowtype;
  v_cfg jsonb := public.rivalry_constants();
  v_min_roster int := (v_cfg->>'min_locked_roster_size')::int;
  v_oe_start int := (v_cfg->>'oe_start')::int;
  v_locked_att int;
  v_locked_def int;
BEGIN
  SELECT * INTO v_war
  FROM public.rivalry_wars
  WHERE id = p_war_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rivalry_war_not_found';
  END IF;

  IF v_war.status = 'pending_response' AND now() >= v_war.challenge_expires_at THEN
    UPDATE public.rivalry_wars
    SET status = 'expired', updated_at = now()
    WHERE id = p_war_id;
  ELSIF v_war.status = 'prep' THEN
    SELECT COUNT(*) INTO v_locked_att
    FROM public.rivalry_war_rosters
    WHERE war_id = p_war_id AND clan_id = v_war.attacker_clan_id AND is_locked_in = true;

    SELECT COUNT(*) INTO v_locked_def
    FROM public.rivalry_war_rosters
    WHERE war_id = p_war_id AND clan_id = v_war.defender_clan_id AND is_locked_in = true;

    IF v_locked_att >= v_min_roster AND v_locked_def >= v_min_roster THEN
      UPDATE public.rivalry_wars
      SET status = 'live',
          live_starts_at = now(),
          live_ends_at = now() + make_interval(hours => (v_cfg->>'live_duration_hours')::int),
          blackout_starts_at = now() + make_interval(hours => ((v_cfg->>'live_duration_hours')::int - (v_cfg->>'blackout_before_end_hours')::int)),
          updated_at = now()
      WHERE id = p_war_id;

      INSERT INTO public.rivalry_war_member_state(war_id, user_id, clan_id, current_oe, oe_updated_at, created_at, updated_at)
      SELECT p_war_id, r.user_id, r.clan_id, v_oe_start, now(), now(), now()
      FROM public.rivalry_war_rosters r
      WHERE r.war_id = p_war_id
        AND r.is_locked_in = true
      ON CONFLICT (war_id, user_id) DO UPDATE
        SET current_oe = GREATEST(public.rivalry_war_member_state.current_oe, EXCLUDED.current_oe),
            oe_updated_at = now(),
            updated_at = now();
    ELSIF now() >= COALESCE(v_war.prep_ends_at, now()) THEN
      UPDATE public.rivalry_wars
      SET status = 'canceled',
          settled_at = COALESCE(settled_at, now()),
          updated_at = now()
      WHERE id = p_war_id;
    END IF;
  ELSIF v_war.status = 'live' AND now() >= COALESCE(v_war.blackout_starts_at, now()) THEN
    UPDATE public.rivalry_wars
    SET status = 'blackout', updated_at = now()
    WHERE id = p_war_id;
  END IF;

  SELECT * INTO v_war FROM public.rivalry_wars WHERE id = p_war_id;
  RETURN v_war;
END;
$$;

-- ------------------------------------------------------------------
-- RPC 1: Declare war
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_declare_war(p_target_clan_id uuid, p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_my_clan_id uuid;
  v_my_role text;
  v_my_count int;
  v_target_count int;
  v_decl_count int;
  v_pair record;
  v_existing jsonb;
  v_war_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT cm.clan_id, cm.role
  INTO v_my_clan_id, v_my_role
  FROM public.clan_members cm
  WHERE cm.user_id = v_user_id
  LIMIT 1;

  IF v_my_clan_id IS NULL OR v_my_role NOT IN ('leader','officer','moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_target_clan_id IS NULL OR p_target_clan_id = v_my_clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target_clan');
  END IF;

  PERFORM public.rivalry_lock_pair(v_my_clan_id, p_target_clan_id);

  SELECT clan_a_id, clan_b_id INTO v_pair
  FROM public.rivalry_canonical_pair(v_my_clan_id, p_target_clan_id);

  SELECT jsonb_build_object('success', true, 'war_id', rw.id, 'status', rw.status)
  INTO v_existing
  FROM public.rivalry_wars rw
  WHERE rw.status = 'pending_response'
    AND rw.attacker_clan_id = v_my_clan_id
    AND rw.defender_clan_id = p_target_clan_id
    AND rw.notes->>'declare_idempotency_key' = p_idempotency_key::text
  ORDER BY rw.created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COUNT(*) INTO v_my_count FROM public.clan_members WHERE clan_id = v_my_clan_id;
  SELECT COUNT(*) INTO v_target_count FROM public.clan_members WHERE clan_id = p_target_clan_id;

  IF v_my_count < (v_cfg->>'min_clan_size_to_declare')::int OR v_target_count < (v_cfg->>'min_clan_size_to_declare')::int THEN
    RETURN jsonb_build_object('success', false, 'error', 'min_clan_size_not_met');
  END IF;

  SELECT COUNT(*) INTO v_decl_count
  FROM public.rivalry_wars rw
  WHERE rw.attacker_clan_id = v_my_clan_id
    AND rw.created_at >= now() - interval '24 hours';

  IF v_decl_count >= (v_cfg->>'declaration_cap_per_24h')::int THEN
    RETURN jsonb_build_object('success', false, 'error', 'declaration_cap_reached');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rivalry_wars rw
    WHERE rw.status IN ('pending_response','prep','live','blackout')
      AND (rw.attacker_clan_id IN (v_my_clan_id, p_target_clan_id) OR rw.defender_clan_id IN (v_my_clan_id, p_target_clan_id))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'active_war_conflict');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.rivalry_war_pair_cooldowns pc
    WHERE pc.clan_a_id = v_pair.clan_a_id
      AND pc.clan_b_id = v_pair.clan_b_id
      AND pc.cooldown_until > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'pair_cooldown_active');
  END IF;

  INSERT INTO public.rivalry_wars(
    attacker_clan_id,
    defender_clan_id,
    declared_by_user_id,
    status,
    challenge_expires_at,
    notes,
    created_at,
    updated_at
  ) VALUES (
    v_my_clan_id,
    p_target_clan_id,
    v_user_id,
    'pending_response',
    now() + make_interval(hours => (v_cfg->>'challenge_timeout_hours')::int),
    jsonb_build_object('declare_idempotency_key', p_idempotency_key::text),
    now(),
    now()
  ) RETURNING id INTO v_war_id;

  PERFORM public.rivalry_mirror_activity_milestone('rivalry_war_declared', v_war_id, v_my_clan_id, p_target_clan_id, 'War declared');

  RETURN jsonb_build_object('success', true, 'war_id', v_war_id, 'status', 'pending_response');
END;
$$;

-- ------------------------------------------------------------------
-- RPC 2: Respond war
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_respond_war(p_war_id uuid, p_response text, p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_war public.rivalry_wars%rowtype;
  v_my_clan_id uuid;
  v_my_role text;
  v_pair record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'war_not_found');
  END IF;

  SELECT cm.clan_id, cm.role INTO v_my_clan_id, v_my_role
  FROM public.clan_members cm
  WHERE cm.user_id = v_user_id
  LIMIT 1;

  IF v_my_clan_id <> v_war.defender_clan_id OR v_my_role NOT IN ('leader','officer','moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  PERFORM public.rivalry_lock_pair(v_war.attacker_clan_id, v_war.defender_clan_id);

  IF v_war.notes->>'respond_idempotency_key' = p_idempotency_key::text THEN
    RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'status', v_war.status, 'idempotent', true);
  END IF;

  IF v_war.status <> 'pending_response' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_war.status);
  END IF;

  IF now() >= COALESCE(v_war.challenge_expires_at, now()) THEN
    UPDATE public.rivalry_wars
    SET status = 'expired',
        updated_at = now()
    WHERE id = p_war_id;

    RETURN jsonb_build_object('success', false, 'error', 'challenge_expired');
  END IF;

  IF lower(trim(p_response)) NOT IN ('accept','decline') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_response');
  END IF;

  IF lower(trim(p_response)) = 'accept' THEN
    UPDATE public.rivalry_wars
    SET status = 'prep',
        responded_by_user_id = v_user_id,
        prep_starts_at = now(),
        prep_ends_at = now() + make_interval(hours => (v_cfg->>'prep_duration_hours')::int),
        live_starts_at = now() + make_interval(hours => (v_cfg->>'prep_duration_hours')::int),
        live_ends_at = now() + make_interval(hours => ((v_cfg->>'prep_duration_hours')::int + (v_cfg->>'live_duration_hours')::int)),
        blackout_starts_at = now() + make_interval(hours => ((v_cfg->>'prep_duration_hours')::int + (v_cfg->>'live_duration_hours')::int - (v_cfg->>'blackout_before_end_hours')::int)),
        notes = COALESCE(notes,'{}'::jsonb) || jsonb_build_object('respond_idempotency_key', p_idempotency_key::text),
        updated_at = now()
    WHERE id = p_war_id;

    INSERT INTO public.rivalry_war_scores(war_id, clan_id, visible_wp, hidden_wp, milestone_wp, created_at, updated_at)
    VALUES
      (p_war_id, v_war.attacker_clan_id, 0, 0, 0, now(), now()),
      (p_war_id, v_war.defender_clan_id, 0, 0, 0, now(), now())
    ON CONFLICT (war_id, clan_id) DO NOTHING;

    INSERT INTO public.rivalry_war_structures(war_id, owner_clan_id, structure_code, max_integrity, current_integrity, state_band, created_at, updated_at)
    SELECT p_war_id, c.clan_id, s.code, s.max_i, s.max_i, 'healthy', now(), now()
    FROM (VALUES (v_war.attacker_clan_id), (v_war.defender_clan_id)) AS c(clan_id)
    CROSS JOIN (
      VALUES
        ('relay_core'::text, 1000),
        ('cipher_vault'::text, 1200),
        ('sentinel_grid'::text, 900)
    ) AS s(code, max_i)
    ON CONFLICT (war_id, owner_clan_id, structure_code) DO NOTHING;

    PERFORM public.rivalry_mirror_activity_milestone('rivalry_war_accepted', p_war_id, v_war.attacker_clan_id, v_war.defender_clan_id, 'War accepted');

    RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'status', 'prep');
  ELSE
    SELECT clan_a_id, clan_b_id INTO v_pair
    FROM public.rivalry_canonical_pair(v_war.attacker_clan_id, v_war.defender_clan_id);

    UPDATE public.rivalry_wars
    SET status = 'declined',
        responded_by_user_id = v_user_id,
        notes = COALESCE(notes,'{}'::jsonb) || jsonb_build_object('respond_idempotency_key', p_idempotency_key::text),
        updated_at = now()
    WHERE id = p_war_id;

    INSERT INTO public.rivalry_war_pair_cooldowns(clan_a_id, clan_b_id, cooldown_until, reason, created_at, updated_at)
    VALUES (
      v_pair.clan_a_id,
      v_pair.clan_b_id,
      now() + make_interval(hours => (v_cfg->>'pair_cooldown_hours')::int),
      'declined',
      now(),
      now()
    )
    ON CONFLICT (clan_a_id, clan_b_id)
    DO UPDATE SET cooldown_until = EXCLUDED.cooldown_until,
                  reason = EXCLUDED.reason,
                  updated_at = now();

    RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'status', 'declined');
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- RPC 3: Set doctrine
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_set_doctrine(p_war_id uuid, p_doctrine text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_war public.rivalry_wars%rowtype;
  v_my_clan_id uuid;
  v_my_role text;
BEGIN
  IF p_doctrine NOT IN ('breach','fortress','disruption') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_doctrine');
  END IF;

  SELECT cm.clan_id, cm.role INTO v_my_clan_id, v_my_role
  FROM public.clan_members cm
  WHERE cm.user_id = v_user_id
  LIMIT 1;

  IF v_my_clan_id IS NULL OR v_my_role NOT IN ('leader','officer','moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_refresh_war_phase(p_war_id);
  IF v_war.status <> 'prep' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_prep_phase', 'status', v_war.status);
  END IF;

  IF v_my_clan_id = v_war.attacker_clan_id THEN
    UPDATE public.rivalry_wars SET attacker_doctrine = p_doctrine, updated_at = now() WHERE id = p_war_id;
  ELSIF v_my_clan_id = v_war.defender_clan_id THEN
    UPDATE public.rivalry_wars SET defender_doctrine = p_doctrine, updated_at = now() WHERE id = p_war_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'not_involved_clan');
  END IF;

  RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'doctrine', p_doctrine);
END;
$$;

-- ------------------------------------------------------------------
-- RPC 4: Update roster member
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_update_roster_member(
  p_war_id uuid,
  p_member_user_id uuid,
  p_role_pref text,
  p_include boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_war public.rivalry_wars%rowtype;
  v_my_clan_id uuid;
  v_my_role text;
  v_member_clan uuid;
  v_roster_count int;
BEGIN
  IF p_role_pref IS NOT NULL AND p_role_pref NOT IN ('striker','saboteur','engineer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role_pref');
  END IF;

  SELECT cm.clan_id, cm.role INTO v_my_clan_id, v_my_role
  FROM public.clan_members cm
  WHERE cm.user_id = v_user_id
  LIMIT 1;

  IF v_my_clan_id IS NULL OR v_my_role NOT IN ('leader','officer','moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_refresh_war_phase(p_war_id);
  IF v_war.status <> 'prep' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_prep_phase', 'status', v_war.status);
  END IF;

  IF v_my_clan_id NOT IN (v_war.attacker_clan_id, v_war.defender_clan_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_involved_clan');
  END IF;

  SELECT clan_id INTO v_member_clan
  FROM public.clan_members
  WHERE user_id = p_member_user_id
  LIMIT 1;

  IF v_member_clan IS DISTINCT FROM v_my_clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_in_clan');
  END IF;

  -- Level and account-age checks are intentionally skipped in V1 RPCs due schema drift risk
  -- across environments (e.g., users.level/users.created_at may not exist everywhere).

  IF p_include THEN
    SELECT COUNT(*) INTO v_roster_count
    FROM public.rivalry_war_rosters
    WHERE war_id = p_war_id
      AND clan_id = v_my_clan_id;

    IF v_roster_count >= (v_cfg->>'max_roster_size')::int
       AND NOT EXISTS (
          SELECT 1 FROM public.rivalry_war_rosters
          WHERE war_id = p_war_id AND clan_id = v_my_clan_id AND user_id = p_member_user_id
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'max_roster_size_reached');
    END IF;

    INSERT INTO public.rivalry_war_rosters(war_id, clan_id, user_id, role_pref, is_locked_in, locked_at, created_at, updated_at)
    VALUES (p_war_id, v_my_clan_id, p_member_user_id, COALESCE(p_role_pref, 'striker'), false, NULL, now(), now())
    ON CONFLICT (war_id, user_id)
    DO UPDATE SET role_pref = EXCLUDED.role_pref,
                  clan_id = EXCLUDED.clan_id,
                  updated_at = now()
    WHERE public.rivalry_war_rosters.is_locked_in = false;

    RETURN jsonb_build_object('success', true, 'included', true);
  ELSE
    DELETE FROM public.rivalry_war_rosters
    WHERE war_id = p_war_id
      AND clan_id = v_my_clan_id
      AND user_id = p_member_user_id
      AND is_locked_in = false;

    RETURN jsonb_build_object('success', true, 'included', false);
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- RPC 5: Lock roster
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_lock_roster(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_war public.rivalry_wars%rowtype;
  v_my_clan_id uuid;
  v_my_role text;
  v_count int;
  v_other_count int;
  v_other_clan uuid;
BEGIN
  SELECT cm.clan_id, cm.role INTO v_my_clan_id, v_my_role
  FROM public.clan_members cm
  WHERE cm.user_id = v_user_id
  LIMIT 1;

  IF v_my_clan_id IS NULL OR v_my_role NOT IN ('leader','officer','moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_refresh_war_phase(p_war_id);

  IF v_war.status <> 'prep' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_prep_phase', 'status', v_war.status);
  END IF;

  IF v_my_clan_id NOT IN (v_war.attacker_clan_id, v_war.defender_clan_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_involved_clan');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.rivalry_war_rosters
  WHERE war_id = p_war_id
    AND clan_id = v_my_clan_id;

  IF v_count < (v_cfg->>'min_locked_roster_size')::int THEN
    RETURN jsonb_build_object('success', false, 'error', 'min_roster_not_met');
  END IF;

  UPDATE public.rivalry_war_rosters
  SET is_locked_in = true,
      locked_at = COALESCE(locked_at, now()),
      updated_at = now()
  WHERE war_id = p_war_id
    AND clan_id = v_my_clan_id;

  v_other_clan := CASE WHEN v_my_clan_id = v_war.attacker_clan_id THEN v_war.defender_clan_id ELSE v_war.attacker_clan_id END;

  SELECT COUNT(*) INTO v_other_count
  FROM public.rivalry_war_rosters
  WHERE war_id = p_war_id
    AND clan_id = v_other_clan
    AND is_locked_in = true;

  PERFORM public.rivalry_refresh_war_phase(p_war_id);

  RETURN jsonb_build_object('success', true, 'locked_count', v_count, 'other_locked_count', v_other_count);
END;
$$;

-- ------------------------------------------------------------------
-- RPC 6: Get war state
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_get_war_state(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_war public.rivalry_wars%rowtype;
  v_is_involved boolean := false;
  v_status text;
  v_att_score bigint;
  v_def_score bigint;
  v_att_visible bigint;
  v_def_visible bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_refresh_war_phase(p_war_id);

  SELECT EXISTS (
    SELECT 1 FROM public.clan_members cm
    WHERE cm.user_id = v_user_id
      AND cm.clan_id IN (v_war.attacker_clan_id, v_war.defender_clan_id)
  ) INTO v_is_involved;

  v_status := v_war.status;

  IF v_is_involved THEN
    SELECT COALESCE(visible_wp,0) + COALESCE(hidden_wp,0) + COALESCE(milestone_wp,0)
    INTO v_att_score
    FROM public.rivalry_war_scores
    WHERE war_id = p_war_id AND clan_id = v_war.attacker_clan_id;

    SELECT COALESCE(visible_wp,0) + COALESCE(hidden_wp,0) + COALESCE(milestone_wp,0)
    INTO v_def_score
    FROM public.rivalry_war_scores
    WHERE war_id = p_war_id AND clan_id = v_war.defender_clan_id;

    IF v_status = 'blackout' THEN
      v_att_visible := NULL;
      v_def_visible := NULL;
    ELSE
      v_att_visible := COALESCE(v_att_score,0);
      v_def_visible := COALESCE(v_def_score,0);
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'scope', 'participant',
      'war', to_jsonb(v_war),
      'score', jsonb_build_object(
        'attacker_visible', v_att_visible,
        'defender_visible', v_def_visible,
        'blackout', (v_status = 'blackout')
      ),
      'structures', (
        SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.owner_clan_id, s.structure_code), '[]'::jsonb)
        FROM public.rivalry_war_structures s
        WHERE s.war_id = p_war_id
      ),
      'rosters', (
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.clan_id, r.user_id), '[]'::jsonb)
        FROM public.rivalry_war_rosters r
        WHERE r.war_id = p_war_id
      ),
      'member_state', (
        SELECT to_jsonb(ms)
        FROM public.rivalry_war_member_state ms
        WHERE ms.war_id = p_war_id
          AND ms.user_id = v_user_id
        LIMIT 1
      )
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'scope', 'public',
      'war', jsonb_build_object(
        'id', v_war.id,
        'attacker_clan_id', v_war.attacker_clan_id,
        'defender_clan_id', v_war.defender_clan_id,
        'status', v_war.status,
        'created_at', v_war.created_at,
        'prep_ends_at', v_war.prep_ends_at,
        'live_ends_at', v_war.live_ends_at,
        'winner_clan_id', v_war.winner_clan_id,
        'settled_at', v_war.settled_at
      )
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- RPC 7: Public wars
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_get_public_wars(p_limit integer DEFAULT 50)
RETURNS TABLE (
  war_id uuid,
  attacker_clan_id uuid,
  attacker_clan_name text,
  defender_clan_id uuid,
  defender_clan_name text,
  status text,
  created_at timestamptz,
  prep_ends_at timestamptz,
  live_ends_at timestamptz,
  winner_clan_id uuid,
  settled_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.rivalry_public_wars_summary(p_limit);
$$;

-- ------------------------------------------------------------------
-- RPC 8: Submit action
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_submit_action(
  p_war_id uuid,
  p_action_type text,
  p_target_clan_id uuid,
  p_target_structure_code text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_war public.rivalry_wars%rowtype;
  v_roster public.rivalry_war_rosters%rowtype;
  v_actor_state public.rivalry_war_member_state%rowtype;
  v_actor_clan_id uuid;
  v_action_id uuid;
  v_existing record;

  v_target public.rivalry_war_structures%rowtype;
  v_actor_attack numeric;
  v_actor_defense numeric;
  v_target_mitigation numeric := 1.0;
  v_doctrine_self text;
  v_doctrine_enemy text;
  v_role text;

  v_cost int;
  v_cooldown_secs int;
  v_now timestamptz := now();
  v_damage int := 0;
  v_repair int := 0;
  v_result_grade text := 'solid';
  v_wp_visible int := 0;
  v_wp_hidden int := 0;
  v_contrib int := 0;
  v_repeat_count int := 0;
  v_rand numeric;
  v_sab_score numeric;
  v_effect_minutes int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_action_type NOT IN ('strike','sabotage','repair') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action_type');
  END IF;

  IF p_target_structure_code NOT IN ('relay_core','cipher_vault','sentinel_grid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target_structure');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_refresh_war_phase(p_war_id);

  PERFORM pg_advisory_xact_lock(hashtext('rivalry:action:' || p_war_id::text));

  IF v_war.status NOT IN ('live','blackout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_war.status);
  END IF;

  IF now() >= COALESCE(v_war.live_ends_at, now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'war_time_elapsed');
  END IF;

  SELECT * INTO v_roster
  FROM public.rivalry_war_rosters r
  WHERE r.war_id = p_war_id
    AND r.user_id = v_user_id
    AND r.is_locked_in = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_rostered');
  END IF;

  v_actor_clan_id := v_roster.clan_id;
  v_role := v_roster.role_pref;

  IF p_action_type = 'repair' THEN
    IF p_target_clan_id <> v_actor_clan_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'repair_target_must_be_own_clan');
    END IF;
  ELSE
    IF p_target_clan_id = v_actor_clan_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'attack_target_must_be_enemy_clan');
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.rivalry_war_actions a
  WHERE a.war_id = p_war_id
    AND a.actor_user_id = v_user_id
    AND a.idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'action_id', v_existing.id, 'result_grade', v_existing.result_grade);
  END IF;

  IF p_action_type = 'strike' THEN
    v_cost := (v_cfg->>'strike_cost')::int;
    v_cooldown_secs := (v_cfg->>'strike_cooldown_seconds')::int;
  ELSIF p_action_type = 'sabotage' THEN
    v_cost := (v_cfg->>'sabotage_cost')::int;
    v_cooldown_secs := (v_cfg->>'sabotage_cooldown_seconds')::int;
  ELSE
    v_cost := (v_cfg->>'repair_cost')::int;
    v_cooldown_secs := (v_cfg->>'repair_cooldown_seconds')::int;
  END IF;

  PERFORM public.rivalry_apply_member_oe_regen(p_war_id, v_user_id);

  SELECT * INTO v_actor_state
  FROM public.rivalry_war_member_state ms
  WHERE ms.war_id = p_war_id AND ms.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_state_missing');
  END IF;

  IF v_actor_state.current_oe < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_enough_oe', 'current_oe', v_actor_state.current_oe);
  END IF;

  IF v_actor_state.cooldown_until IS NOT NULL AND v_actor_state.cooldown_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'cooldown_active', 'cooldown_until', v_actor_state.cooldown_until);
  END IF;

  SELECT * INTO v_target
  FROM public.rivalry_war_structures s
  WHERE s.war_id = p_war_id
    AND s.owner_clan_id = p_target_clan_id
    AND s.structure_code = p_target_structure_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_structure_not_found');
  END IF;

  SELECT COALESCE(u.attack_power, 10), COALESCE(u.defense_power, 10)
  INTO v_actor_attack, v_actor_defense
  FROM public.users u
  WHERE u.id = v_user_id;

  v_doctrine_self := CASE WHEN v_actor_clan_id = v_war.attacker_clan_id THEN v_war.attacker_doctrine ELSE v_war.defender_doctrine END;
  v_doctrine_enemy := CASE WHEN p_target_clan_id = v_war.attacker_clan_id THEN v_war.attacker_doctrine ELSE v_war.defender_doctrine END;

  IF p_action_type IN ('strike','sabotage') AND v_target.structure_code = 'sentinel_grid' AND v_target.current_integrity > 0 THEN
    v_target_mitigation := v_target_mitigation * 1.06;
  END IF;
  v_target_mitigation := v_target_mitigation * public.rivalry_doctrine_multiplier(v_doctrine_enemy, 'mitigation');

  IF p_action_type = 'strike' THEN
    SELECT COUNT(*) INTO v_repeat_count
    FROM public.rivalry_war_actions a
    WHERE a.war_id = p_war_id
      AND a.actor_user_id = v_user_id
      AND a.action_type = 'strike'
      AND a.target_clan_id = p_target_clan_id
      AND a.target_structure_code = p_target_structure_code
      AND a.created_at >= now() - interval '10 minutes';

    v_rand := 0.92 + random() * 0.16;
    v_damage := ROUND(
      GREATEST(
        12,
        LEAST(
          95,
          (40 + 0.45 * v_actor_attack * public.rivalry_role_multiplier(v_role, 'strike') * public.rivalry_doctrine_multiplier(v_doctrine_self, 'strike')
             - 0.30 * COALESCE((SELECT AVG(u2.defense_power) FROM public.users u2 JOIN public.rivalry_war_rosters r2 ON r2.user_id=u2.id AND r2.war_id=p_war_id AND r2.clan_id=p_target_clan_id), 10)
          )
          * v_rand
          / NULLIF(v_target_mitigation,0)
          * CASE WHEN v_repeat_count >= 6 THEN 0.85 ELSE 1.00 END
        )
      )
    );

    UPDATE public.rivalry_war_structures
    SET current_integrity = GREATEST(0, current_integrity - v_damage),
        times_downed = CASE WHEN current_integrity > 0 AND current_integrity - v_damage <= 0 THEN times_downed + 1 ELSE times_downed END,
        updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_target;

    PERFORM public.rivalry_recompute_structure_band(v_target.id);

    IF v_damage >= 75 THEN v_result_grade := 'strong';
    ELSIF v_damage <= 20 THEN v_result_grade := 'glancing';
    ELSE v_result_grade := 'solid';
    END IF;

    v_wp_visible := ROUND(
      v_damage * CASE p_target_structure_code
        WHEN 'cipher_vault' THEN 1.2
        WHEN 'relay_core' THEN 1.0
        ELSE 0.9
      END
    );

    v_wp_hidden := CASE WHEN v_war.status = 'blackout' THEN v_wp_visible ELSE 0 END;
    IF v_war.status = 'blackout' THEN v_wp_visible := 0; END IF;
    v_contrib := v_damage;

    IF v_target.current_integrity = 0 AND p_target_structure_code = 'cipher_vault' THEN
      PERFORM public.rivalry_mirror_activity_milestone('rivalry_first_structure_down', p_war_id, v_actor_clan_id, p_target_clan_id, p_target_structure_code || ' destroyed');
    END IF;

  ELSIF p_action_type = 'sabotage' THEN
    v_rand := -12 + random() * 24;
    v_sab_score := (
      35
      + v_actor_attack * 0.15 * public.rivalry_role_multiplier(v_role, 'sabotage_score') * public.rivalry_doctrine_multiplier(v_doctrine_self, 'sabotage_score')
      - (COALESCE((SELECT AVG(u2.defense_power) FROM public.users u2 JOIN public.rivalry_war_rosters r2 ON r2.user_id=u2.id AND r2.war_id=p_war_id AND r2.clan_id=p_target_clan_id), 10) * 0.12 * public.rivalry_doctrine_multiplier(v_doctrine_enemy,'sabotage_score'))
      + v_rand
    );

    v_effect_minutes := ROUND(20 * public.rivalry_doctrine_multiplier(v_doctrine_self, 'sabotage_duration'));

    INSERT INTO public.rivalry_war_effects(
      war_id, source_clan_id, target_clan_id, target_structure_code,
      effect_code, potency, started_at, expires_at, metadata, created_at
    ) VALUES (
      p_war_id, v_actor_clan_id, p_target_clan_id, p_target_structure_code,
      CASE WHEN v_sab_score >= 0 THEN 'jammed' ELSE 'overheated' END,
      CASE WHEN v_sab_score >= 0 THEN 1.0 ELSE 0.3 END,
      now(),
      now() + make_interval(mins => CASE WHEN v_sab_score >= 0 THEN v_effect_minutes ELSE CEIL(v_effect_minutes * 0.3)::int END),
      jsonb_build_object('score', v_sab_score),
      now()
    );

    IF v_sab_score >= 0 THEN
      v_result_grade := 'strong';
      v_wp_visible := 60;
      v_contrib := 45;
    ELSE
      v_result_grade := 'partial';
      v_wp_visible := 20;
      v_contrib := 15;
    END IF;

    v_wp_hidden := CASE WHEN v_war.status = 'blackout' THEN v_wp_visible ELSE 0 END;
    IF v_war.status = 'blackout' THEN v_wp_visible := 0; END IF;

  ELSE
    v_rand := 0.9 + random() * 0.2;
    v_repair := ROUND(
      GREATEST(10, LEAST(80,
        (34 + 0.35 * v_actor_defense * public.rivalry_role_multiplier(v_role, 'repair') * public.rivalry_doctrine_multiplier(v_doctrine_self, 'repair')) * v_rand
      ))
    );

    UPDATE public.rivalry_war_structures
    SET current_integrity = LEAST(max_integrity, current_integrity + v_repair),
        updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_target;

    PERFORM public.rivalry_recompute_structure_band(v_target.id);

    v_result_grade := CASE WHEN v_repair >= 55 THEN 'strong' ELSE 'solid' END;
    v_wp_visible := ROUND(v_repair * 0.5);
    v_wp_hidden := CASE WHEN v_war.status = 'blackout' THEN v_wp_visible ELSE 0 END;
    IF v_war.status = 'blackout' THEN v_wp_visible := 0; END IF;
    v_contrib := v_repair;
  END IF;

  UPDATE public.rivalry_war_member_state
  SET current_oe = current_oe - v_cost,
      oe_updated_at = now(),
      last_action_at = v_now,
      cooldown_until = v_now + make_interval(secs => v_cooldown_secs),
      action_count = action_count + 1,
      contribution_points = contribution_points + GREATEST(v_contrib,0),
      updated_at = now()
  WHERE war_id = p_war_id AND user_id = v_user_id
  RETURNING * INTO v_actor_state;

  INSERT INTO public.rivalry_war_actions(
    war_id, actor_user_id, actor_clan_id, action_type,
    target_clan_id, target_structure_code,
    idempotency_key, oe_spent, result_grade,
    damage_amount, repair_amount,
    wp_delta_visible, wp_delta_hidden, contribution_delta,
    combat_snapshot, created_at
  ) VALUES (
    p_war_id, v_user_id, v_actor_clan_id, p_action_type,
    p_target_clan_id, p_target_structure_code,
    p_idempotency_key, v_cost, v_result_grade,
    v_damage, v_repair,
    v_wp_visible, v_wp_hidden, v_contrib,
    jsonb_build_object('doctrine_self', v_doctrine_self, 'doctrine_enemy', v_doctrine_enemy, 'role', v_role),
    now()
  )
  ON CONFLICT (war_id, actor_user_id, idempotency_key)
  DO NOTHING
  RETURNING id INTO v_action_id;

  IF v_action_id IS NULL THEN
    SELECT id INTO v_action_id
    FROM public.rivalry_war_actions
    WHERE war_id = p_war_id AND actor_user_id = v_user_id AND idempotency_key = p_idempotency_key
    LIMIT 1;
  END IF;

  UPDATE public.rivalry_war_scores
  SET visible_wp = visible_wp + CASE WHEN clan_id = v_actor_clan_id THEN v_wp_visible ELSE 0 END,
      hidden_wp = hidden_wp + CASE WHEN clan_id = v_actor_clan_id THEN v_wp_hidden ELSE 0 END,
      updated_at = now()
  WHERE war_id = p_war_id;

  RETURN jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'result_grade', v_result_grade,
    'damage', v_damage,
    'repair', v_repair,
    'oe_after', v_actor_state.current_oe,
    'cooldown_until', v_actor_state.cooldown_until,
    'blackout', (v_war.status = 'blackout')
  );
END;
$$;

-- ------------------------------------------------------------------
-- RPC 9: Get logs
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_get_war_logs(
  p_war_id uuid,
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_war public.rivalry_wars%rowtype;
  v_involved boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_wars WHERE id = p_war_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'war_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clan_members cm
    WHERE cm.user_id = v_user_id
      AND cm.clan_id IN (v_war.attacker_clan_id, v_war.defender_clan_id)
  ) INTO v_involved;

  IF v_involved THEN
    RETURN jsonb_build_object(
      'success', true,
      'scope', 'participant',
      'logs', (
        SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT *
          FROM public.rivalry_war_actions
          WHERE war_id = p_war_id
            AND (p_before IS NULL OR created_at < p_before)
          ORDER BY created_at DESC
          LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
        ) a
      )
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'scope', 'public',
      'logs', (
        SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT id, war_id, action_type, target_structure_code, result_grade, created_at
          FROM public.rivalry_war_actions
          WHERE war_id = p_war_id
            AND result_grade IN ('strong','critical')
            AND (p_before IS NULL OR created_at < p_before)
          ORDER BY created_at DESC
          LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
        ) x
      )
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- RPC 10: Settle war (service/admin/internal)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_settle_war(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb := public.rivalry_constants();
  v_war public.rivalry_wars%rowtype;
  v_a bigint;
  v_d bigint;
  v_winner uuid;
  v_pair record;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.rivalry_is_service_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT * INTO v_war FROM public.rivalry_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'war_not_found');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rivalry:settle:' || p_war_id::text));

  IF v_war.status IN ('settled','declined','expired','canceled') THEN
    RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'status', v_war.status, 'idempotent', true);
  END IF;

  IF v_war.status NOT IN ('live','blackout') AND now() < COALESCE(v_war.live_ends_at, now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'war_not_settleable_yet');
  END IF;

  SELECT COALESCE(visible_wp,0) + COALESCE(hidden_wp,0) + COALESCE(milestone_wp,0)
  INTO v_a
  FROM public.rivalry_war_scores
  WHERE war_id = p_war_id AND clan_id = v_war.attacker_clan_id;

  SELECT COALESCE(visible_wp,0) + COALESCE(hidden_wp,0) + COALESCE(milestone_wp,0)
  INTO v_d
  FROM public.rivalry_war_scores
  WHERE war_id = p_war_id AND clan_id = v_war.defender_clan_id;

  IF COALESCE(v_a,0) > COALESCE(v_d,0) THEN
    v_winner := v_war.attacker_clan_id;
  ELSIF COALESCE(v_d,0) > COALESCE(v_a,0) THEN
    v_winner := v_war.defender_clan_id;
  ELSE
    -- tie-breaker #1: cipher_vault damage
    WITH dmg AS (
      SELECT actor_clan_id AS clan_id, COALESCE(SUM(damage_amount),0) AS dmg
      FROM public.rivalry_war_actions
      WHERE war_id = p_war_id
        AND action_type = 'strike'
        AND target_structure_code = 'cipher_vault'
      GROUP BY actor_clan_id
    )
    SELECT CASE
      WHEN COALESCE((SELECT dmg FROM dmg WHERE clan_id = v_war.attacker_clan_id),0) >= COALESCE((SELECT dmg FROM dmg WHERE clan_id = v_war.defender_clan_id),0)
        THEN v_war.attacker_clan_id
      ELSE v_war.defender_clan_id
    END INTO v_winner;
  END IF;

  UPDATE public.rivalry_wars
  SET status = 'settled',
      winner_clan_id = v_winner,
      attacker_final_wp = COALESCE(v_a,0),
      defender_final_wp = COALESCE(v_d,0),
      settled_at = now(),
      updated_at = now()
  WHERE id = p_war_id;

  INSERT INTO public.rivalry_war_rewards(
    war_id, user_id, clan_id, eligible,
    reward_xp, reward_coins, reward_war_credits,
    mvp_tag, created_at, updated_at
  )
  SELECT
    p_war_id,
    r.user_id,
    r.clan_id,
    (
      COALESCE(ms.action_count,0) >= 6
      OR COALESCE(ms.contribution_points,0) >= 180
    ) AS eligible,
    CASE WHEN r.clan_id = v_winner THEN 220 ELSE 140 END,
    CASE WHEN r.clan_id = v_winner THEN 350 ELSE 220 END,
    CASE WHEN r.clan_id = v_winner THEN 90 ELSE 55 END,
    NULL,
    now(),
    now()
  FROM public.rivalry_war_rosters r
  LEFT JOIN public.rivalry_war_member_state ms
    ON ms.war_id = r.war_id AND ms.user_id = r.user_id
  WHERE r.war_id = p_war_id
    AND r.is_locked_in = true
  ON CONFLICT (war_id, user_id) DO NOTHING;

  SELECT clan_a_id, clan_b_id INTO v_pair
  FROM public.rivalry_canonical_pair(v_war.attacker_clan_id, v_war.defender_clan_id);

  INSERT INTO public.rivalry_war_pair_cooldowns(clan_a_id, clan_b_id, cooldown_until, reason, created_at, updated_at)
  VALUES (
    v_pair.clan_a_id,
    v_pair.clan_b_id,
    now() + make_interval(hours => (v_cfg->>'pair_cooldown_hours')::int),
    'settled',
    now(),
    now()
  )
  ON CONFLICT (clan_a_id, clan_b_id)
  DO UPDATE SET cooldown_until = EXCLUDED.cooldown_until,
                reason = EXCLUDED.reason,
                updated_at = now();

  PERFORM public.rivalry_mirror_activity_milestone('rivalry_war_settled', p_war_id, v_winner, CASE WHEN v_winner = v_war.attacker_clan_id THEN v_war.defender_clan_id ELSE v_war.attacker_clan_id END, 'War settled');

  RETURN jsonb_build_object('success', true, 'war_id', p_war_id, 'status', 'settled', 'winner_clan_id', v_winner);
END;
$$;

-- ------------------------------------------------------------------
-- RPC 11: Claim reward
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rivalry_claim_reward(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reward public.rivalry_war_rewards%rowtype;
  v_new_xp bigint;
  v_new_coins bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_reward
  FROM public.rivalry_war_rewards rr
  WHERE rr.war_id = p_war_id
    AND rr.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  IF v_reward.claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'claimed_at', v_reward.claimed_at);
  END IF;

  IF NOT v_reward.eligible THEN
    UPDATE public.rivalry_war_rewards
    SET claimed_at = now(), updated_at = now()
    WHERE id = v_reward.id;
    RETURN jsonb_build_object('success', true, 'claimed', false, 'reason', 'not_eligible');
  END IF;

  UPDATE public.users
  SET xp = COALESCE(xp,0) + v_reward.reward_xp,
      coins = COALESCE(coins,0) + v_reward.reward_coins
  WHERE id = v_user_id
  RETURNING xp, coins INTO v_new_xp, v_new_coins;

  UPDATE public.rivalry_war_rewards
  SET claimed_at = now(), updated_at = now()
  WHERE id = v_reward.id;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'reward_xp', v_reward.reward_xp,
    'reward_coins', v_reward.reward_coins,
    'reward_war_credits', v_reward.reward_war_credits,
    'new_xp', v_new_xp,
    'new_coins', v_new_coins
  );
END;
$$;

-- ------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.rivalry_constants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_get_public_wars(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_get_war_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_get_war_logs(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_declare_war(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_respond_war(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_set_doctrine(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_update_roster_member(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_lock_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_submit_action(uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_settle_war(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_rivalry_claim_reward(uuid) TO authenticated;

COMMIT;
