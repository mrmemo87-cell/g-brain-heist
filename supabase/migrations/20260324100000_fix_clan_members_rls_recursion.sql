-- Fix infinite recursion in clan_members SELECT policy by moving membership check
-- into a SECURITY DEFINER helper.

CREATE OR REPLACE FUNCTION public.is_current_user_member_of_clan(p_clan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.clan_members cm
      WHERE cm.clan_id = p_clan_id
        AND cm.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_member_of_clan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_member_of_clan(uuid) TO authenticated;

DROP POLICY IF EXISTS clan_members_select_same_tenant_or_shared_clan ON public.clan_members;

CREATE POLICY clan_members_select_same_tenant_or_shared_clan
  ON public.clan_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_current_user_member_of_clan(clan_id)
    OR (
      public.current_user_school_id() IS NOT NULL
      AND public.same_tenant_user(user_id)
    )
  );
