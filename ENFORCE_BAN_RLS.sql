-- ============================================================================
-- G-BRAINS HEIST: ENFORCE BAN-AWARE RLS ON CORE GAMEPLAY TABLES
-- ============================================================================
-- Run this in the Supabase SQL editor after the base schema is in place.
-- The script rebuilds the RLS policies for the configured tables so that:
--   * RLS is forced even for helpers or security definer functions
--   * Active (non-banned) users can only interact with their own rows
--   * Banned users lose access across gameplay tables (without touching base roster policies)
--   * Admins (role = 'admin' or is_admin = true) and the service role
--     retain full access for moderation tooling
--
-- The script is idempotent: rerunning it simply refreshes the policies.
-- Extend the table list inside the config VALUES clause if more tables
-- need the same treatment later on.
-- ============================================================================

DO $migration$
DECLARE
  cfg RECORD;
  existing_policy RECORD;
BEGIN
  FOR cfg IN
    SELECT *
    FROM (
      VALUES
  ('attempts', 'user_id', true, true, false, false),
  ('attempts_history', 'user_id', true, true, false, false),
  ('ap_changes', 'user_id', true, true, false, false),
  ('announcement_receipts', 'user_id', true, true, true, false),
  ('inventory', 'user_id', true, true, true, true),
  ('tasks', 'user_id', true, true, true, true),
  ('shop_purchases', 'user_id', true, true, false, false),
  ('sessions', 'user_id', true, true, true, true),
  ('caps', 'user_id', true, true, false, false),
  ('user_achievements', 'user_id', true, true, false, false)
    ) AS config(table_name, user_column, allow_select, allow_insert, allow_update, allow_delete)
  LOOP
    -- Skip tables that are not present in the public schema
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = cfg.table_name
    ) THEN
      RAISE NOTICE 'Skipping table % (not found in schema)', cfg.table_name;
      CONTINUE;
    END IF;

    -- Ensure the ownership column that links back to the player exists
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = cfg.table_name
        AND column_name = cfg.user_column
    ) THEN
      RAISE WARNING 'Skipping table % (missing expected column %)', cfg.table_name, cfg.user_column;
      CONTINUE;
    END IF;

    -- Enable and force RLS, then remove any existing policies so we can recreate them cleanly
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', cfg.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', cfg.table_name);

    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = cfg.table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', existing_policy.policyname, cfg.table_name);
    END LOOP;

    -- Admins (or the service role) keep full access so tooling continues to work
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
         EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = auth.uid()
             AND (
               COALESCE(u.is_admin, false)
               OR COALESCE(u.role, ''student'') = ''admin''
             )
         )
         OR auth.role() = ''service_role''
       ) WITH CHECK (
         EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = auth.uid()
             AND (
               COALESCE(u.is_admin, false)
               OR COALESCE(u.role, ''student'') = ''admin''
             )
         )
         OR auth.role() = ''service_role''
       );',
      'admins_manage_' || cfg.table_name,
      cfg.table_name
    );

    -- Active players can read their own rows when allowed
    IF cfg.allow_select THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (
           auth.uid() = %I
           AND EXISTS (
             SELECT 1
             FROM users u_guard
             WHERE u_guard.id = auth.uid()
               AND COALESCE(u_guard.is_banned, false) = false
           )
         );',
        'active_players_select_' || cfg.table_name,
        cfg.table_name,
        cfg.user_column
      );
    END IF;

    -- Active players can insert their own rows when allowed
    IF cfg.allow_insert THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
           auth.uid() = %I
           AND EXISTS (
             SELECT 1
             FROM users u_guard
             WHERE u_guard.id = auth.uid()
               AND COALESCE(u_guard.is_banned, false) = false
           )
         );',
        'active_players_insert_' || cfg.table_name,
        cfg.table_name,
        cfg.user_column
      );
    END IF;

    -- Updates stay optional per table; duplicates the guard in USING/WITH CHECK
    IF cfg.allow_update THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE USING (
           auth.uid() = %I
           AND EXISTS (
             SELECT 1
             FROM users u_guard
             WHERE u_guard.id = auth.uid()
               AND COALESCE(u_guard.is_banned, false) = false
           )
         ) WITH CHECK (
           auth.uid() = %I
           AND EXISTS (
             SELECT 1
             FROM users u_guard
             WHERE u_guard.id = auth.uid()
               AND COALESCE(u_guard.is_banned, false) = false
           )
         );',
        'active_players_update_' || cfg.table_name,
        cfg.table_name,
        cfg.user_column,
        cfg.user_column
      );
    END IF;

    -- Deletes remain opt-in; only configure if flagged in the table map above
    IF cfg.allow_delete THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR DELETE USING (
           auth.uid() = %I
           AND EXISTS (
             SELECT 1
             FROM users u_guard
             WHERE u_guard.id = auth.uid()
               AND COALESCE(u_guard.is_banned, false) = false
           )
         );',
        'active_players_delete_' || cfg.table_name,
        cfg.table_name,
        cfg.user_column
      );
    END IF;

    RAISE NOTICE 'RLS rebuilt for table %', cfg.table_name;
  END LOOP;

END;
$migration$;

-- Quick inspection helper: lists the policies created by this migration
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'attempts',
    'attempts_history',
    'ap_changes',
    'announcement_receipts',
    'inventory',
    'tasks',
    'shop_purchases',
    'sessions',
    'caps',
    'user_achievements'
  )
ORDER BY tablename, policyname, cmd;
