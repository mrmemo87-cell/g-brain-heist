-- Operational RLS baseline: pvp_attack_attempts idempotency table

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pvp_attack_attempts'
  ) THEN
    ALTER TABLE public.pvp_attack_attempts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS pvp_attack_attempts_owner_select ON public.pvp_attack_attempts;
    CREATE POLICY pvp_attack_attempts_owner_select
      ON public.pvp_attack_attempts
      FOR SELECT
      TO authenticated
      USING (
        attacker_id = auth.uid()
        OR defender_id = auth.uid()
      );

    DROP POLICY IF EXISTS pvp_attack_attempts_owner_insert ON public.pvp_attack_attempts;
    CREATE POLICY pvp_attack_attempts_owner_insert
      ON public.pvp_attack_attempts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        attacker_id = auth.uid()
      );

    DROP POLICY IF EXISTS pvp_attack_attempts_owner_update ON public.pvp_attack_attempts;
    DROP POLICY IF EXISTS pvp_attack_attempts_owner_delete ON public.pvp_attack_attempts;
  END IF;
END
$$;
