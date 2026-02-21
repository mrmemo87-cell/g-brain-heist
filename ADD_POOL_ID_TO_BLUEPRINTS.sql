-- ============================================================
-- Add pool_id column to adm_blueprints
-- ============================================================
-- This allows blueprints to be explicitly tied to a specific
-- question pool, so admins can choose "English Stage 7 Pool"
-- vs "English Stage 8 Pool" when creating a blueprint.
--
-- If pool_id is NULL, the RPC falls back to matching by
-- subject + target_stage (the original behaviour).
-- ============================================================

-- 1. Add the column (nullable FK → backward-compatible)
ALTER TABLE adm_blueprints
  ADD COLUMN IF NOT EXISTS pool_id UUID REFERENCES adm_question_pools(id) ON DELETE SET NULL;

-- 2. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_adm_bp_pool ON adm_blueprints(pool_id);

-- 3. Back-fill existing blueprints if they have a clear match
-- (one pool per subject+stage combination)
UPDATE adm_blueprints bp
SET pool_id = sub.pool_id
FROM (
    SELECT p.id AS pool_id, p.subject, p.stage
    FROM adm_question_pools p
    WHERE p.is_active = true
      AND p.stage IS NOT NULL
      -- only where exactly one pool matches per subject+stage
      AND NOT EXISTS (
          SELECT 1 FROM adm_question_pools p2
          WHERE p2.subject = p.subject
            AND p2.stage = p.stage
            AND p2.is_active = true
            AND p2.id != p.id
      )
) sub
WHERE bp.subject = sub.subject
  AND bp.target_stage = sub.stage
  AND bp.pool_id IS NULL;
