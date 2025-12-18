-- Fix: "infinite recursion detected in policy for relation school_members (42P17)"
--
-- Safe to run in Supabase SQL Editor as database owner.
-- Idempotent: re-creates the helper and replaces ALL SELECT/ALL policies on school_members.
-- Also ensures `users` has a simple non-recursive self-select policy.

BEGIN;

-- Ensure RLS is enabled, but DO NOT force it.
-- FORCE RLS breaks SECURITY DEFINER patterns used throughout this codebase.
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_members NO FORCE ROW LEVEL SECURITY;

-- Helper: fetch the caller's active school_id without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.get_my_active_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT sm.school_id
  FROM public.school_members sm
  WHERE sm.user_id = auth.uid()
    AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_active_school_id() TO authenticated;

-- Drop ALL existing SELECT/ALL policies on school_members (some may be recursive).
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'school_members'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.school_members;', p.policyname);
  END LOOP;
END $$;

-- Non-recursive SELECT policy: self OR same-school.
CREATE POLICY school_members_select
ON public.school_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR school_id = public.get_my_active_school_id()
);

-- ---- users ----
-- Keep `users` readable for the signed-in user without any cross-table checks.
-- This avoids `users` <-> `school_members` policy recursion patterns.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users;', p.policyname);
  END LOOP;
END $$;

CREATE POLICY users_select_self
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid());

COMMIT;
