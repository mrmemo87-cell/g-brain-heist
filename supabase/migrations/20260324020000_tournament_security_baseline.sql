-- Tournament security baseline
-- - Enable RLS on tournament tables
-- - Restrict mutating operations to admins
-- - Keep public/authenticated bracket/season reads available

CREATE OR REPLACE FUNCTION public.is_tournament_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        coalesce(u.role, 'student') IN ('admin', 'school_admin')
        OR coalesce(u.is_admin, false)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.require_tournament_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_tournament_admin() THEN
    RAISE EXCEPTION 'Tournament admin authorization required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tournament_signup(signup_id uuid)
RETURNS public.tournament_school_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_school_signups;
BEGIN
  PERFORM public.require_tournament_admin();

  UPDATE public.tournament_school_signups
  SET status = 'approved'
  WHERE id = signup_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Signup not found';
  END IF;

  RETURN updated;
END;
$$;

DROP FUNCTION IF EXISTS public.generate_season_bracket(uuid);
CREATE OR REPLACE FUNCTION public.generate_season_bracket(season_id uuid)
RETURNS SETOF public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved_signups uuid[];
  index integer := 1;
  match_record public.tournament_matches;
BEGIN
  PERFORM public.require_tournament_admin();

  SELECT array_agg(id ORDER BY random())
  INTO approved_signups
  FROM public.tournament_school_signups
  WHERE season_id = generate_season_bracket.season_id
    AND status = 'approved';

  IF approved_signups IS NULL OR array_length(approved_signups, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least two approved signups to generate bracket';
  END IF;

  DELETE FROM public.tournament_matches WHERE season_id = generate_season_bracket.season_id;

  WHILE index <= array_length(approved_signups, 1) LOOP
    INSERT INTO public.tournament_matches (
      season_id,
      round_number,
      match_number,
      team_a_id,
      team_b_id,
      status
    ) VALUES (
      generate_season_bracket.season_id,
      1,
      (index + 1) / 2,
      approved_signups[index],
      approved_signups[index + 1],
      'scheduled'
    )
    RETURNING * INTO match_record;

    RETURN NEXT match_record;
    index := index + 2;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_match_schedule(
  match_id uuid,
  scheduled_at timestamptz,
  location text,
  stream_url text,
  metadata jsonb DEFAULT NULL
)
RETURNS public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_matches;
BEGIN
  PERFORM public.require_tournament_admin();

  UPDATE public.tournament_matches
  SET
    scheduled_at = update_match_schedule.scheduled_at,
    location = update_match_schedule.location,
    stream_url = update_match_schedule.stream_url,
    metadata = coalesce(update_match_schedule.metadata, metadata)
  WHERE id = match_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_match_winner(
  match_id uuid,
  winner uuid,
  status text DEFAULT 'completed'
)
RETURNS public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_matches;
BEGIN
  PERFORM public.require_tournament_admin();

  UPDATE public.tournament_matches
  SET
    winner_id = winner,
    status = coalesce(status, 'completed')
  WHERE id = match_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  RETURN updated;
END;
$$;

-- Function execute grants: authenticated users may call, but mutating functions self-enforce admin checks.
REVOKE ALL ON FUNCTION public.approve_tournament_signup(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_tournament_signup(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_season_bracket(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_season_bracket(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_match_schedule(uuid, timestamptz, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_match_schedule(uuid, timestamptz, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.record_match_winner(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_match_winner(uuid, uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tournament_seasons') THEN
    ALTER TABLE public.tournament_seasons ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tournament_seasons_select_all ON public.tournament_seasons;
    CREATE POLICY tournament_seasons_select_all
      ON public.tournament_seasons
      FOR SELECT
      TO authenticated
      USING (true);

    DROP POLICY IF EXISTS tournament_seasons_admin_insert ON public.tournament_seasons;
    CREATE POLICY tournament_seasons_admin_insert
      ON public.tournament_seasons
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_seasons_admin_update ON public.tournament_seasons;
    CREATE POLICY tournament_seasons_admin_update
      ON public.tournament_seasons
      FOR UPDATE
      TO authenticated
      USING (public.is_tournament_admin())
      WITH CHECK (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_seasons_admin_delete ON public.tournament_seasons;
    CREATE POLICY tournament_seasons_admin_delete
      ON public.tournament_seasons
      FOR DELETE
      TO authenticated
      USING (public.is_tournament_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tournament_school_signups') THEN
    ALTER TABLE public.tournament_school_signups ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tournament_signups_select_admin_only ON public.tournament_school_signups;
    CREATE POLICY tournament_signups_select_admin_only
      ON public.tournament_school_signups
      FOR SELECT
      TO authenticated
      USING (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_signups_insert_authenticated ON public.tournament_school_signups;
    CREATE POLICY tournament_signups_insert_authenticated
      ON public.tournament_school_signups
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);

    DROP POLICY IF EXISTS tournament_signups_admin_update ON public.tournament_school_signups;
    CREATE POLICY tournament_signups_admin_update
      ON public.tournament_school_signups
      FOR UPDATE
      TO authenticated
      USING (public.is_tournament_admin())
      WITH CHECK (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_signups_admin_delete ON public.tournament_school_signups;
    CREATE POLICY tournament_signups_admin_delete
      ON public.tournament_school_signups
      FOR DELETE
      TO authenticated
      USING (public.is_tournament_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tournament_matches') THEN
    ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tournament_matches_select_all ON public.tournament_matches;
    CREATE POLICY tournament_matches_select_all
      ON public.tournament_matches
      FOR SELECT
      TO authenticated
      USING (true);

    DROP POLICY IF EXISTS tournament_matches_admin_insert ON public.tournament_matches;
    CREATE POLICY tournament_matches_admin_insert
      ON public.tournament_matches
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_matches_admin_update ON public.tournament_matches;
    CREATE POLICY tournament_matches_admin_update
      ON public.tournament_matches
      FOR UPDATE
      TO authenticated
      USING (public.is_tournament_admin())
      WITH CHECK (public.is_tournament_admin());

    DROP POLICY IF EXISTS tournament_matches_admin_delete ON public.tournament_matches;
    CREATE POLICY tournament_matches_admin_delete
      ON public.tournament_matches
      FOR DELETE
      TO authenticated
      USING (public.is_tournament_admin());
  END IF;
END
$$;
