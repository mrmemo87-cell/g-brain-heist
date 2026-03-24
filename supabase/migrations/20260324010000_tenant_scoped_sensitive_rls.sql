-- Tenant-scoped RLS hardening for sensitive shared tables.
-- Replaces broad authenticated/public SELECT access with school/tenant-bound policies.

CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.school_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.same_tenant_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users target
    JOIN public.users me ON me.id = auth.uid()
    WHERE target.id = p_user_id
      AND me.school_id IS NOT NULL
      AND target.school_id = me.school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.users actor ON actor.id = a.actor_id
    LEFT JOIN public.users target ON target.id = a.target_id
    JOIN public.users me ON me.id = auth.uid()
    WHERE a.id = p_activity_id
      AND (
        a.actor_id = auth.uid()
        OR a.target_id = auth.uid()
        OR (
          me.school_id IS NOT NULL
          AND (
            actor.school_id = me.school_id
            OR target.school_id = me.school_id
          )
        )
      )
  );
$$;

DO $$
DECLARE
  policy_row record;
BEGIN
  -- Remove unconstrained broad SELECT policies from priority sensitive tables.
  FOR policy_row IN
    SELECT p.schemaname, p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('users', 'activities', 'activity_reactions', 'clans', 'clan_members')
      AND lower(p.cmd) = 'select'
      AND replace(replace(coalesce(p.qual, ''), '(', ''), ')', '') = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
    DROP POLICY IF EXISTS "Users can view other users" ON public.users;
    DROP POLICY IF EXISTS "Admins view users" ON public.users;
    DROP POLICY IF EXISTS users_select_self_or_same_tenant ON public.users;

    CREATE POLICY users_select_self_or_same_tenant
      ON public.users
      FOR SELECT
      TO authenticated
      USING (
        id = auth.uid()
        OR public.same_tenant_user(id)
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view activities" ON public.activities;
    DROP POLICY IF EXISTS activities_select_same_tenant ON public.activities;

    CREATE POLICY activities_select_same_tenant
      ON public.activities
      FOR SELECT
      TO authenticated
      USING (
        actor_id = auth.uid()
        OR target_id = auth.uid()
        OR (
          public.current_user_school_id() IS NOT NULL
          AND (
            public.same_tenant_user(actor_id)
            OR (target_id IS NOT NULL AND public.same_tenant_user(target_id))
          )
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_reactions') THEN
    ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view reactions" ON public.activity_reactions;
    DROP POLICY IF EXISTS activity_reactions_select_visible_activity ON public.activity_reactions;

    CREATE POLICY activity_reactions_select_visible_activity
      ON public.activity_reactions
      FOR SELECT
      TO authenticated
      USING (public.can_read_activity(activity_id));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clans') THEN
    ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view clans" ON public.clans;
    DROP POLICY IF EXISTS clans_select_same_tenant_or_member ON public.clans;

    CREATE POLICY clans_select_same_tenant_or_member
      ON public.clans
      FOR SELECT
      TO authenticated
      USING (
        leader_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.clan_members cm
          WHERE cm.clan_id = clans.id
            AND cm.user_id = auth.uid()
        )
        OR (
          public.current_user_school_id() IS NOT NULL
          AND public.same_tenant_user(leader_id)
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clan_members') THEN
    ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view clan members" ON public.clan_members;
    DROP POLICY IF EXISTS clan_members_select_same_tenant_or_shared_clan ON public.clan_members;

    CREATE POLICY clan_members_select_same_tenant_or_shared_clan
      ON public.clan_members
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.clan_members mine
          WHERE mine.clan_id = clan_members.clan_id
            AND mine.user_id = auth.uid()
        )
        OR (
          public.current_user_school_id() IS NOT NULL
          AND public.same_tenant_user(user_id)
        )
      );
  END IF;
END
$$;
