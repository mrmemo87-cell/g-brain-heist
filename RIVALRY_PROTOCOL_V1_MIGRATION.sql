-- =============================================================
-- Rivalry Protocol (Clan Wars V1) - Isolated Subsystem Migration
-- =============================================================
-- MIGRATION SAFETY NOTES:
-- 1) Validate in production before running (schema drift is known in this repo).
-- 2) This migration is intentionally isolated and does NOT alter solo PvP flow.
-- 3) This migration uses CHECK-constrained TEXT columns instead of Postgres ENUMs
--    to reduce rollout/rollback friction across potentially drifted environments.
-- 4) Write access is designed for future SECURITY DEFINER RPCs; direct table writes
--    by normal authenticated users are intentionally blocked by RLS.

BEGIN;

-- -------------------------------------------------------------
-- Prerequisites
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------
-- Helper functions for RLS predicates
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rivalry_is_service_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.role() = 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.rivalry_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------
-- Core table: rivalry_wars
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_wars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  attacker_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,
  defender_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  declared_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  responded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'pending_response'
    CHECK (status IN (
      'pending_response','prep','live','blackout','settled','expired','declined','canceled'
    )),

  attacker_doctrine text CHECK (attacker_doctrine IS NULL OR attacker_doctrine IN ('breach','fortress','disruption')),
  defender_doctrine text CHECK (defender_doctrine IS NULL OR defender_doctrine IN ('breach','fortress','disruption')),

  challenge_expires_at timestamptz NOT NULL,
  prep_starts_at timestamptz,
  prep_ends_at timestamptz,
  live_starts_at timestamptz,
  blackout_starts_at timestamptz,
  live_ends_at timestamptz,
  settled_at timestamptz,

  winner_clan_id uuid REFERENCES public.clans(id) ON DELETE SET NULL,
  tie_break_reason text,

  attacker_final_wp bigint CHECK (attacker_final_wp IS NULL OR attacker_final_wp >= 0),
  defender_final_wp bigint CHECK (defender_final_wp IS NULL OR defender_final_wp >= 0),

  milestones_mirrored boolean NOT NULL DEFAULT false,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_wars_attacker_defender_diff CHECK (attacker_clan_id <> defender_clan_id),
  CONSTRAINT rivalry_wars_winner_participant_check CHECK (
    winner_clan_id IS NULL
    OR winner_clan_id = attacker_clan_id
    OR winner_clan_id = defender_clan_id
  )
);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.rivalry_wars'::regclass
      AND conname = 'rivalry_wars_winner_participant_check'
  ) THEN
    ALTER TABLE public.rivalry_wars
      ADD CONSTRAINT rivalry_wars_winner_participant_check
      CHECK (
        winner_clan_id IS NULL
        OR winner_clan_id = attacker_clan_id
        OR winner_clan_id = defender_clan_id
      ) NOT VALID;
  END IF;

  ALTER TABLE public.rivalry_wars
    VALIDATE CONSTRAINT rivalry_wars_winner_participant_check;
END;
$$;

COMMENT ON TABLE public.rivalry_wars IS 'Rivalry Protocol war lifecycle root table.';
COMMENT ON COLUMN public.rivalry_wars.status IS 'War phase/state machine status.';
COMMENT ON COLUMN public.rivalry_wars.challenge_expires_at IS 'Defender response deadline.';
COMMENT ON COLUMN public.rivalry_wars.blackout_starts_at IS 'Timestamp when hidden-score finale starts.';
COMMENT ON COLUMN public.rivalry_wars.milestones_mirrored IS 'Whether major milestones were mirrored into activities feed.';

CREATE INDEX IF NOT EXISTS idx_rivalry_wars_status ON public.rivalry_wars(status);
CREATE INDEX IF NOT EXISTS idx_rivalry_wars_created_at ON public.rivalry_wars(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_wars_attacker ON public.rivalry_wars(attacker_clan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_wars_defender ON public.rivalry_wars(defender_clan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_wars_live_ends ON public.rivalry_wars(live_ends_at) WHERE status IN ('live','blackout');

-- Active-war uniqueness across BOTH attacker and defender roles is enforced via trigger.
-- IMPORTANT: This trigger is a secondary guard only.
-- Final concurrency safety MUST be enforced in write RPCs using transaction-safe
-- locking (row locking and/or advisory locking). Do not rely on trigger-only checks
-- under concurrent write load.
CREATE OR REPLACE FUNCTION public.rivalry_enforce_single_active_war_per_clan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_conflict_exists boolean;
BEGIN
  IF NEW.status IN ('pending_response','prep','live','blackout') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.rivalry_wars rw
      WHERE rw.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND rw.status IN ('pending_response','prep','live','blackout')
        AND (
          rw.attacker_clan_id IN (NEW.attacker_clan_id, NEW.defender_clan_id)
          OR rw.defender_clan_id IN (NEW.attacker_clan_id, NEW.defender_clan_id)
        )
    ) INTO v_conflict_exists;

    IF v_conflict_exists THEN
      RAISE EXCEPTION 'active_war_conflict: one of the clans already has an active/pending war';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rivalry_single_active_war ON public.rivalry_wars;
CREATE TRIGGER trg_rivalry_single_active_war
BEFORE INSERT OR UPDATE OF attacker_clan_id, defender_clan_id, status
ON public.rivalry_wars
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_enforce_single_active_war_per_clan();

DROP TRIGGER IF EXISTS trg_rivalry_wars_updated_at ON public.rivalry_wars;
CREATE TRIGGER trg_rivalry_wars_updated_at
BEFORE UPDATE ON public.rivalry_wars
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Canonical pair cooldowns
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_pair_cooldowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_a_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  clan_b_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  cooldown_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rivalry_pair_canonical_order CHECK (clan_a_id < clan_b_id),
  CONSTRAINT rivalry_pair_distinct CHECK (clan_a_id <> clan_b_id),
  CONSTRAINT rivalry_pair_unique UNIQUE (clan_a_id, clan_b_id)
);

COMMENT ON TABLE public.rivalry_war_pair_cooldowns IS 'Canonical anti-farm cooldowns for clan pairs; clan_a_id < clan_b_id enforced.';
-- RPC NOTE: Always canonicalize pair ordering before writes:
-- clan_a_id = LEAST(clan_x, clan_y), clan_b_id = GREATEST(clan_x, clan_y).

CREATE INDEX IF NOT EXISTS idx_rivalry_pair_cooldowns_until
  ON public.rivalry_war_pair_cooldowns(cooldown_until);

DROP TRIGGER IF EXISTS trg_rivalry_pair_cooldowns_updated_at ON public.rivalry_war_pair_cooldowns;
CREATE TRIGGER trg_rivalry_pair_cooldowns_updated_at
BEFORE UPDATE ON public.rivalry_war_pair_cooldowns
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Rosters
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  role_pref text NOT NULL DEFAULT 'striker'
    CHECK (role_pref IN ('striker','saboteur','engineer')),

  is_locked_in boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_rosters_unique_user_per_war UNIQUE (war_id, user_id),
  CONSTRAINT rivalry_rosters_unique_member_per_clan_war UNIQUE (war_id, clan_id, user_id),
  CONSTRAINT rivalry_rosters_lock_consistency CHECK (
    (is_locked_in = false AND locked_at IS NULL)
    OR (is_locked_in = true AND locked_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.rivalry_war_rosters IS 'Roster entries for Rivalry wars; supports fixed-lock participants.';
COMMENT ON COLUMN public.rivalry_war_rosters.role_pref IS 'Preferred role: striker/saboteur/engineer.';

CREATE INDEX IF NOT EXISTS idx_rivalry_rosters_war_clan ON public.rivalry_war_rosters(war_id, clan_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_rosters_war_user ON public.rivalry_war_rosters(war_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_rosters_locked ON public.rivalry_war_rosters(war_id, is_locked_in);

DROP TRIGGER IF EXISTS trg_rivalry_rosters_updated_at ON public.rivalry_war_rosters;
CREATE TRIGGER trg_rivalry_rosters_updated_at
BEFORE UPDATE ON public.rivalry_war_rosters
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Helper functions that depend on rivalry tables
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rivalry_is_involved_clan_member(p_war_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rivalry_wars rw
    JOIN public.clan_members cm
      ON cm.user_id = auth.uid()
     AND cm.clan_id IN (rw.attacker_clan_id, rw.defender_clan_id)
    WHERE rw.id = p_war_id
  );
$$;

CREATE OR REPLACE FUNCTION public.rivalry_is_rostered_participant(p_war_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rivalry_war_rosters rwr
    WHERE rwr.war_id = p_war_id
      AND rwr.user_id = auth.uid()
      AND rwr.is_locked_in = true
  );
$$;

-- -------------------------------------------------------------
-- Structures
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  owner_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  structure_code text NOT NULL
    CHECK (structure_code IN ('relay_core','cipher_vault','sentinel_grid')),

  max_integrity integer NOT NULL CHECK (max_integrity > 0),
  current_integrity integer NOT NULL CHECK (current_integrity >= 0),

  state_band text NOT NULL DEFAULT 'healthy'
    CHECK (state_band IN ('healthy','strained','critical','down')),

  times_downed integer NOT NULL DEFAULT 0 CHECK (times_downed >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_structures_unique UNIQUE (war_id, owner_clan_id, structure_code),
  CONSTRAINT rivalry_structures_integrity_bounds CHECK (current_integrity <= max_integrity)
);

COMMENT ON TABLE public.rivalry_war_structures IS 'Per-war, per-clan structure integrity state.';
COMMENT ON COLUMN public.rivalry_war_structures.structure_code IS 'relay_core/cipher_vault/sentinel_grid.';

CREATE INDEX IF NOT EXISTS idx_rivalry_structures_war_clan ON public.rivalry_war_structures(war_id, owner_clan_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_structures_war_code ON public.rivalry_war_structures(war_id, structure_code);

DROP TRIGGER IF EXISTS trg_rivalry_structures_updated_at ON public.rivalry_war_structures;
CREATE TRIGGER trg_rivalry_structures_updated_at
BEFORE UPDATE ON public.rivalry_war_structures
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Effects (sabotage / temporary subsystem impacts)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,

  source_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,
  target_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  target_structure_code text NOT NULL
    CHECK (target_structure_code IN ('relay_core','cipher_vault','sentinel_grid')),

  effect_code text NOT NULL
    CHECK (effect_code IN ('jammed','breached','overheated','shielded_window')),

  potency numeric(8,3) NOT NULL DEFAULT 1.000 CHECK (potency >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  source_action_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_effects_time_order CHECK (expires_at > started_at)
);

COMMENT ON TABLE public.rivalry_war_effects IS 'Active timed effects applied during war actions.';

CREATE INDEX IF NOT EXISTS idx_rivalry_effects_war_target ON public.rivalry_war_effects(war_id, target_clan_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_rivalry_effects_war_source ON public.rivalry_war_effects(war_id, source_clan_id, created_at DESC);

-- -------------------------------------------------------------
-- Action log (immutable event ledger)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,

  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  action_type text NOT NULL CHECK (action_type IN ('strike','sabotage','repair')),

  target_clan_id uuid REFERENCES public.clans(id) ON DELETE RESTRICT,
  target_structure_code text CHECK (target_structure_code IN ('relay_core','cipher_vault','sentinel_grid')),

  idempotency_key uuid NOT NULL,

  oe_spent integer NOT NULL DEFAULT 0 CHECK (oe_spent >= 0),
  result_grade text NOT NULL DEFAULT 'solid'
    CHECK (result_grade IN ('critical','strong','solid','glancing','partial','failed','blocked')),

  damage_amount integer NOT NULL DEFAULT 0 CHECK (damage_amount >= 0 AND damage_amount <= 10000),
  repair_amount integer NOT NULL DEFAULT 0 CHECK (repair_amount >= 0 AND repair_amount <= 10000),

  wp_delta_visible integer NOT NULL DEFAULT 0,
  wp_delta_hidden integer NOT NULL DEFAULT 0,
  contribution_delta integer NOT NULL DEFAULT 0,

  combat_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_actions_idempotency UNIQUE (war_id, actor_user_id, idempotency_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rivalry_effects_source_action_fk'
      AND conrelid = 'public.rivalry_war_effects'::regclass
  ) THEN
    ALTER TABLE public.rivalry_war_effects
      ADD CONSTRAINT rivalry_effects_source_action_fk
      FOREIGN KEY (source_action_id)
      REFERENCES public.rivalry_war_actions(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON TABLE public.rivalry_war_actions IS 'Immutable action log for rivalry war gameplay actions.';
COMMENT ON COLUMN public.rivalry_war_actions.idempotency_key IS 'Client-provided idempotency key to prevent duplicate action processing.';

CREATE INDEX IF NOT EXISTS idx_rivalry_actions_war_created ON public.rivalry_war_actions(war_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_actions_war_actor ON public.rivalry_war_actions(war_id, actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_actions_war_clan ON public.rivalry_war_actions(war_id, actor_clan_id, created_at DESC);

-- -------------------------------------------------------------
-- Per-member runtime state (OE, cooldown, contribution)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_member_state (
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  current_oe integer NOT NULL DEFAULT 0 CHECK (current_oe >= 0 AND current_oe <= 10),
  oe_updated_at timestamptz NOT NULL DEFAULT now(),

  last_action_at timestamptz,
  cooldown_until timestamptz,

  action_count integer NOT NULL DEFAULT 0 CHECK (action_count >= 0),
  contribution_points bigint NOT NULL DEFAULT 0 CHECK (contribution_points >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (war_id, user_id)
);


DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.rivalry_war_member_state'::regclass
      AND c.contype = 'c'
      AND c.conname <> 'rivalry_war_member_state_current_oe_check'
      AND lower(regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g')) IN (
        'check((current_oe>=0)and(current_oe<=100))',
        'check((current_oe>=0)and(current_oe<=10))'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.rivalry_war_member_state DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.rivalry_war_member_state'::regclass
      AND conname = 'rivalry_war_member_state_current_oe_check'
  ) THEN
    ALTER TABLE public.rivalry_war_member_state
      ADD CONSTRAINT rivalry_war_member_state_current_oe_check
      CHECK (current_oe >= 0 AND current_oe <= 10) NOT VALID;
  END IF;

  ALTER TABLE public.rivalry_war_member_state
    VALIDATE CONSTRAINT rivalry_war_member_state_current_oe_check;
END;
$$;

COMMENT ON TABLE public.rivalry_war_member_state IS 'Per-war participant runtime state (OE, cooldowns, counters).';
COMMENT ON COLUMN public.rivalry_war_member_state.current_oe IS 'Operation Energy for this member in this war.';

CREATE INDEX IF NOT EXISTS idx_rivalry_member_state_war_clan ON public.rivalry_war_member_state(war_id, clan_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_member_state_cooldown ON public.rivalry_war_member_state(war_id, cooldown_until);

DROP TRIGGER IF EXISTS trg_rivalry_member_state_updated_at ON public.rivalry_war_member_state;
CREATE TRIGGER trg_rivalry_member_state_updated_at
BEFORE UPDATE ON public.rivalry_war_member_state
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Score ledger
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_scores (
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  visible_wp bigint NOT NULL DEFAULT 0,
  hidden_wp bigint NOT NULL DEFAULT 0,
  milestone_wp bigint NOT NULL DEFAULT 0,
  final_wp bigint,

  tie_break_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (war_id, clan_id),
  CONSTRAINT rivalry_scores_nonnegative CHECK (
    visible_wp >= 0 AND hidden_wp >= 0 AND milestone_wp >= 0 AND (final_wp IS NULL OR final_wp >= 0)
  )
);

COMMENT ON TABLE public.rivalry_war_scores IS 'Per-war per-clan score ledger used for live display and settlement.';

CREATE INDEX IF NOT EXISTS idx_rivalry_scores_war_final ON public.rivalry_war_scores(war_id, final_wp DESC);

DROP TRIGGER IF EXISTS trg_rivalry_scores_updated_at ON public.rivalry_war_scores;
CREATE TRIGGER trg_rivalry_scores_updated_at
BEFORE UPDATE ON public.rivalry_war_scores
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Rewards
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  eligible boolean NOT NULL DEFAULT false,

  reward_xp integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_coins integer NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  reward_war_credits integer NOT NULL DEFAULT 0 CHECK (reward_war_credits >= 0),

  mvp_tag text CHECK (mvp_tag IS NULL OR mvp_tag IN ('breaker','operator','guardian')),

  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_rewards_unique_user_per_war UNIQUE (war_id, user_id)
);

COMMENT ON TABLE public.rivalry_war_rewards IS 'Reward settlement rows; owner-readable only; claim handled via RPC.';

CREATE INDEX IF NOT EXISTS idx_rivalry_rewards_war_clan ON public.rivalry_war_rewards(war_id, clan_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_rewards_user_claimed ON public.rivalry_war_rewards(user_id, claimed_at);

DROP TRIGGER IF EXISTS trg_rivalry_rewards_updated_at ON public.rivalry_war_rewards;
CREATE TRIGGER trg_rivalry_rewards_updated_at
BEFORE UPDATE ON public.rivalry_war_rewards
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- Optional but isolated: stakes/escrow table (no vault coupling)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rivalry_war_stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.rivalry_wars(id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE RESTRICT,

  stake_type text NOT NULL DEFAULT 'war_credit'
    CHECK (stake_type IN ('war_credit','token','none')),

  stake_amount numeric(20,4) NOT NULL DEFAULT 0 CHECK (stake_amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','locked','released','forfeited','canceled')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rivalry_stakes_unique_per_war_clan UNIQUE (war_id, clan_id)
);

COMMENT ON TABLE public.rivalry_war_stakes IS 'Isolated war stake/escrow ledger; intentionally independent from clans.vault_coins.';

CREATE INDEX IF NOT EXISTS idx_rivalry_stakes_war ON public.rivalry_war_stakes(war_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_stakes_status ON public.rivalry_war_stakes(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_rivalry_stakes_updated_at ON public.rivalry_war_stakes;
CREATE TRIGGER trg_rivalry_stakes_updated_at
BEFORE UPDATE ON public.rivalry_war_stakes
FOR EACH ROW
EXECUTE FUNCTION public.rivalry_set_updated_at();

-- -------------------------------------------------------------
-- RLS setup (locked-down raw tables)
-- -------------------------------------------------------------
ALTER TABLE public.rivalry_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_pair_cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_member_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rivalry_war_stakes ENABLE ROW LEVEL SECURITY;

-- Remove previous policies if re-run
DROP POLICY IF EXISTS rivalry_wars_select_involved ON public.rivalry_wars;
DROP POLICY IF EXISTS rivalry_wars_select_service_admin ON public.rivalry_wars;
DROP POLICY IF EXISTS rivalry_pair_cooldowns_select_involved ON public.rivalry_war_pair_cooldowns;
DROP POLICY IF EXISTS rivalry_pair_cooldowns_select_service_admin ON public.rivalry_war_pair_cooldowns;
DROP POLICY IF EXISTS rivalry_rosters_select_involved ON public.rivalry_war_rosters;
DROP POLICY IF EXISTS rivalry_rosters_select_service_admin ON public.rivalry_war_rosters;
DROP POLICY IF EXISTS rivalry_structures_select_involved ON public.rivalry_war_structures;
DROP POLICY IF EXISTS rivalry_structures_select_service_admin ON public.rivalry_war_structures;
DROP POLICY IF EXISTS rivalry_effects_select_involved ON public.rivalry_war_effects;
DROP POLICY IF EXISTS rivalry_effects_select_service_admin ON public.rivalry_war_effects;
DROP POLICY IF EXISTS rivalry_actions_select_involved ON public.rivalry_war_actions;
DROP POLICY IF EXISTS rivalry_actions_select_service_admin ON public.rivalry_war_actions;
DROP POLICY IF EXISTS rivalry_member_state_select_involved ON public.rivalry_war_member_state;
DROP POLICY IF EXISTS rivalry_member_state_select_service_admin ON public.rivalry_war_member_state;
DROP POLICY IF EXISTS rivalry_scores_select_involved ON public.rivalry_war_scores;
DROP POLICY IF EXISTS rivalry_scores_select_service_admin ON public.rivalry_war_scores;
DROP POLICY IF EXISTS rivalry_rewards_select_owner ON public.rivalry_war_rewards;
DROP POLICY IF EXISTS rivalry_rewards_select_service_admin ON public.rivalry_war_rewards;
DROP POLICY IF EXISTS rivalry_stakes_select_involved ON public.rivalry_war_stakes;
DROP POLICY IF EXISTS rivalry_stakes_select_service_admin ON public.rivalry_war_stakes;

-- NOTE: No INSERT/UPDATE/DELETE policies are created for authenticated users.
-- Direct writes are denied; future SECURITY DEFINER RPCs should mediate writes.

-- rivalry_wars: involved clans + admin/service only
CREATE POLICY rivalry_wars_select_involved
ON public.rivalry_wars
FOR SELECT
USING (public.rivalry_is_involved_clan_member(id));

CREATE POLICY rivalry_wars_select_service_admin
ON public.rivalry_wars
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- pair cooldowns: involved clans only + admin/service
CREATE POLICY rivalry_pair_cooldowns_select_involved
ON public.rivalry_war_pair_cooldowns
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.clan_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.clan_id IN (clan_a_id, clan_b_id)
  )
);

CREATE POLICY rivalry_pair_cooldowns_select_service_admin
ON public.rivalry_war_pair_cooldowns
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- rosters: involved clan members + admin/service
CREATE POLICY rivalry_rosters_select_involved
ON public.rivalry_war_rosters
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_rosters_select_service_admin
ON public.rivalry_war_rosters
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- structures: involved clan members + admin/service
CREATE POLICY rivalry_structures_select_involved
ON public.rivalry_war_structures
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_structures_select_service_admin
ON public.rivalry_war_structures
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- effects: involved clan members + admin/service
CREATE POLICY rivalry_effects_select_involved
ON public.rivalry_war_effects
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_effects_select_service_admin
ON public.rivalry_war_effects
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- actions: involved clan members + admin/service
CREATE POLICY rivalry_actions_select_involved
ON public.rivalry_war_actions
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_actions_select_service_admin
ON public.rivalry_war_actions
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- member_state: involved clan members + admin/service
CREATE POLICY rivalry_member_state_select_involved
ON public.rivalry_war_member_state
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_member_state_select_service_admin
ON public.rivalry_war_member_state
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- scores: involved clan members + admin/service
CREATE POLICY rivalry_scores_select_involved
ON public.rivalry_war_scores
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_scores_select_service_admin
ON public.rivalry_war_scores
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- rewards: owner-only + admin/service
CREATE POLICY rivalry_rewards_select_owner
ON public.rivalry_war_rewards
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY rivalry_rewards_select_service_admin
ON public.rivalry_war_rewards
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- stakes: involved clan members + admin/service
CREATE POLICY rivalry_stakes_select_involved
ON public.rivalry_war_stakes
FOR SELECT
USING (public.rivalry_is_involved_clan_member(war_id));

CREATE POLICY rivalry_stakes_select_service_admin
ON public.rivalry_war_stakes
FOR SELECT
USING (public.rivalry_is_service_or_admin());

-- -------------------------------------------------------------
-- Grants (read-only for authenticated via RLS; writes remain blocked)
-- -------------------------------------------------------------
GRANT SELECT ON public.rivalry_wars TO authenticated;
GRANT SELECT ON public.rivalry_war_pair_cooldowns TO authenticated;
GRANT SELECT ON public.rivalry_war_rosters TO authenticated;
GRANT SELECT ON public.rivalry_war_structures TO authenticated;
GRANT SELECT ON public.rivalry_war_effects TO authenticated;
GRANT SELECT ON public.rivalry_war_actions TO authenticated;
GRANT SELECT ON public.rivalry_war_member_state TO authenticated;
GRANT SELECT ON public.rivalry_war_scores TO authenticated;
GRANT SELECT ON public.rivalry_war_rewards TO authenticated;
GRANT SELECT ON public.rivalry_war_stakes TO authenticated;

-- -------------------------------------------------------------
-- Safe public summary surface (outsider-readable, no detailed telemetry)
-- -------------------------------------------------------------
-- Raw tables remain protected; this SECURITY DEFINER function exposes only
-- sanitized milestone-level summary for public/social browsing.
CREATE OR REPLACE FUNCTION public.rivalry_public_wars_summary(p_limit integer DEFAULT 50)
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
  SELECT
    rw.id,
    rw.attacker_clan_id,
    ca.name,
    rw.defender_clan_id,
    cd.name,
    rw.status,
    rw.created_at,
    rw.prep_ends_at,
    rw.live_ends_at,
    rw.winner_clan_id,
    rw.settled_at
  FROM public.rivalry_wars rw
  JOIN public.clans ca ON ca.id = rw.attacker_clan_id
  JOIN public.clans cd ON cd.id = rw.defender_clan_id
  ORDER BY rw.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

COMMENT ON FUNCTION public.rivalry_public_wars_summary(integer)
IS 'Public-safe Rivalry wars summary (no detailed logs, no exact tactical state).';

GRANT EXECUTE ON FUNCTION public.rivalry_public_wars_summary(integer) TO authenticated, anon;

COMMIT;

-- -------------------------------------------------------------
-- OPTIONAL SECTION (DO NOT AUTO-APPLY):
-- If you later need stronger FK alignment guarantees for actor_clan_id/user,
-- add deferred trigger checks tying roster->member_state->actions consistency.
-- Kept out of base migration for minimal-diff rollout safety.
-- -------------------------------------------------------------
