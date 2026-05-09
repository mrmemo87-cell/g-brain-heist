-- Normalize the Flicker / Glitch Theme cosmetic to the canonical value `flicker`.
-- This only touches users.active_cosmetic_theme (the theme column) and does NOT
-- modify users.active_cosmetic_effect, where `glitch` means the green glitch effect.

BEGIN;

-- Older deployments constrained active_cosmetic_theme to `glitch`; replace that
-- constraint with one that accepts the canonical value and the legacy value while
-- clients are rolling forward.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS check_active_cosmetic_theme;

ALTER TABLE public.users
  ADD CONSTRAINT check_active_cosmetic_theme
  CHECK (active_cosmetic_theme IS NULL OR active_cosmetic_theme IN ('flicker', 'glitch'));

-- Backfill legacy theme rows to the canonical value only when the user has owned
-- the theme cosmetic. This avoids touching the separate green glitch effect state.
UPDATE public.users AS u
SET active_cosmetic_theme = 'flicker'
WHERE u.active_cosmetic_theme = 'glitch'
  AND EXISTS (
    SELECT 1
    FROM public.inventory AS inv
    WHERE inv.user_id = u.id
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_theme'
      AND inv.state IN ('active', 'consumed', 'used')
  );

COMMENT ON COLUMN public.users.active_cosmetic_theme IS
  'Active cosmetic theme: flicker for Flicker Theme cosmetic. Legacy glitch reads as flicker during migration. NULL if none active.';

COMMIT;
