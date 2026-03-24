-- ============================================================
-- Migration: Brains Master Premium Rank + Individuals Mode
-- ============================================================
-- Adds:
--   1. brains_master_until (timestamptz)  — expiry for Brains Master
--   2. brains_master_show_badge (boolean) — public badge display toggle
--   3. brains_master_purchases table      — audit trail / purchase log
--   4. rpc_purchase_brains_master()       — atomic purchase RPC
--   5. is_brains_master_active() helper   — checks active status
--   6. get_user_effective_caps() helper   — returns caps with BM boost
-- ============================================================

-- ─── 1. Schema: New columns on users ────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS brains_master_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brains_master_show_badge boolean DEFAULT true;

COMMENT ON COLUMN public.users.brains_master_until IS 'Timestamp when Brains Master premium expires. NULL = inactive.';
COMMENT ON COLUMN public.users.brains_master_show_badge IS 'Whether the user publicly shows their Brains Master badge.';

-- ─── 2. Audit table: purchase history ───────────────────────
CREATE TABLE IF NOT EXISTS public.brains_master_purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purchased_at  timestamptz NOT NULL DEFAULT now(),
  gemstones_cost int NOT NULL DEFAULT 0,
  coins_granted int NOT NULL DEFAULT 0,
  gemstones_granted int NOT NULL DEFAULT 0,
  daily_coin_cap_at_purchase int NOT NULL DEFAULT 0,
  was_already_active boolean NOT NULL DEFAULT false,
  old_expiry    timestamptz,
  new_expiry    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bm_purchases_user ON public.brains_master_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_bm_purchases_date ON public.brains_master_purchases(purchased_at);

-- RLS: users can read their own purchases
ALTER TABLE public.brains_master_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY bm_purchases_select_own ON public.brains_master_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bm_purchases_insert_own ON public.brains_master_purchases
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── 3. Helper: is_brains_master_active ─────────────────────
CREATE OR REPLACE FUNCTION public.is_brains_master_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT brains_master_until > now()
     FROM public.users
     WHERE id = p_user_id),
    false
  );
$$;

-- ─── 4. Configuration constants (stored as a simple config) ─
-- These are referenced by the purchase RPC.
-- BM_GEMSTONE_PRICE      = 150 gems to purchase
-- BM_INSTANT_GEMSTONES   = 25 gems granted instantly
-- BM_COIN_CAP_MULTIPLIER = 5 (coins granted = 5 × daily coin cap)
-- BM_DURATION_DAYS       = 7
-- BM_CAP_BOOST_FACTOR    = 1.5 (50% increase to daily/weekly caps)
--
-- Rather than a separate config table, we embed them as constants
-- in the purchase function for simplicity and atomicity.

-- ─── 5. Purchase RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_purchase_brains_master()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id       uuid;
  v_gemstones     int;
  v_coins         int;
  v_level         int;
  v_bm_until      timestamptz;
  -- Config constants
  c_gem_price     int := 150;
  c_instant_gems  int := 25;
  c_coin_mult     int := 5;
  c_duration      interval := '7 days'::interval;
  -- Computed values
  v_daily_coin_cap int;
  v_coins_granted  int;
  v_was_active     boolean;
  v_old_expiry     timestamptz;
  v_new_expiry     timestamptz;
  v_new_gems       int;
  v_new_coins      int;
BEGIN
  -- Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Lock the user row for atomic update
  SELECT gemstones, coins, level, brains_master_until
    INTO v_gemstones, v_coins, v_level, v_bm_until
    FROM public.users
   WHERE id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Check if user can afford it
  IF v_gemstones < c_gem_price THEN
    RETURN jsonb_build_object('error', 'Not enough gemstones', 'required', c_gem_price, 'current', v_gemstones);
  END IF;

  -- Compute daily coin cap based on level (base 2000, +200 per level above 1)
  v_daily_coin_cap := 2000 + GREATEST(v_level - 1, 0) * 200;

  -- Instant coin grant = 5 × daily cap
  v_coins_granted := c_coin_mult * v_daily_coin_cap;

  -- Determine whether already active
  v_was_active := (v_bm_until IS NOT NULL AND v_bm_until > now());
  v_old_expiry := v_bm_until;

  -- Compute new expiry: extend from existing if active, else from now
  IF v_was_active THEN
    v_new_expiry := v_bm_until + c_duration;
  ELSE
    v_new_expiry := now() + c_duration;
  END IF;

  -- Apply changes atomically
  v_new_gems  := v_gemstones - c_gem_price + c_instant_gems;
  v_new_coins := v_coins + v_coins_granted;

  UPDATE public.users
     SET gemstones = v_new_gems,
         coins = v_new_coins,
         brains_master_until = v_new_expiry
   WHERE id = v_user_id;

  -- Audit trail
  INSERT INTO public.brains_master_purchases
    (user_id, gemstones_cost, coins_granted, gemstones_granted,
     daily_coin_cap_at_purchase, was_already_active, old_expiry, new_expiry)
  VALUES
    (v_user_id, c_gem_price, v_coins_granted, c_instant_gems,
     v_daily_coin_cap, v_was_active, v_old_expiry, v_new_expiry);

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'gemstones_spent', c_gem_price,
    'gemstones_granted', c_instant_gems,
    'coins_granted', v_coins_granted,
    'daily_coin_cap_at_purchase', v_daily_coin_cap,
    'was_already_active', v_was_active,
    'new_expiry', v_new_expiry,
    'new_gemstone_balance', v_new_gems,
    'new_coin_balance', v_new_coins
  );
END;
$$;

-- ─── 6. Effective caps helper (for frontend) ────────────────
-- Returns the user's caps with Brains Master boost applied.
-- Base caps: daily_xp=1000, daily_coins=2000+(level-1)*200,
--            weekly_xp=6500, weekly_coins=10000+(level-1)*500
-- BM boost: 1.5× all caps
CREATE OR REPLACE FUNCTION public.get_user_effective_caps(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_uid       uuid;
  v_level     int;
  v_bm_active boolean;
  v_boost     numeric := 1.0;
  v_daily_xp  int;
  v_daily_coins int;
  v_weekly_xp  int;
  v_weekly_coins int;
  v_caps_row  record;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No user');
  END IF;

  SELECT level, (brains_master_until IS NOT NULL AND brains_master_until > now())
    INTO v_level, v_bm_active
    FROM public.users
   WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF v_bm_active THEN
    v_boost := 1.5;
  END IF;

  -- Base caps
  v_daily_xp     := FLOOR(1000 * v_boost);
  v_daily_coins  := FLOOR((2000 + GREATEST(v_level - 1, 0) * 200) * v_boost);
  v_weekly_xp    := FLOOR(6500 * v_boost);
  v_weekly_coins := FLOOR((10000 + GREATEST(v_level - 1, 0) * 500) * v_boost);

  -- Read current usage from caps table if it exists
  -- Caps table tracks earned amounts; remaining = cap - earned
  BEGIN
    SELECT xp_daily_earned, coins_daily_earned,
           xp_weekly_earned, coins_weekly_earned
      INTO v_caps_row
      FROM public.caps
     WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN
    -- caps table may not exist yet; return full caps
    v_caps_row := NULL;
  END;

  RETURN jsonb_build_object(
    'daily_xp_cap',          v_daily_xp,
    'daily_coins_cap',       v_daily_coins,
    'weekly_xp_cap',         v_weekly_xp,
    'weekly_coins_cap',      v_weekly_coins,
    'xp_daily_remaining',    v_daily_xp   - COALESCE(v_caps_row.xp_daily_earned, 0),
    'coins_daily_remaining', v_daily_coins - COALESCE(v_caps_row.coins_daily_earned, 0),
    'xp_weekly_remaining',   v_weekly_xp  - COALESCE(v_caps_row.xp_weekly_earned, 0),
    'coins_weekly_remaining',v_weekly_coins- COALESCE(v_caps_row.coins_weekly_earned, 0),
    'brains_master_active',  v_bm_active,
    'boost_factor',          v_boost
  );
END;
$$;

-- ─── 7. Grant execute permissions ───────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_purchase_brains_master() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_brains_master_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_effective_caps(uuid) TO authenticated;
