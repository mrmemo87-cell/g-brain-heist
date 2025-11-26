-- ============================================
-- FIX: Clan Join Requests Visibility for Leaders
-- ============================================
-- 
-- Issue: Leaders/moderators weren't seeing join requests for their clan
-- Root Cause: RLS policy subquery not properly matching clan_id scope
-- Solution: Rewrite SELECT policy with explicit clan_id comparison
-- 

-- Drop the problematic view policy
DROP POLICY IF EXISTS "clan_join_requests_view" ON clan_join_requests;

-- Create a corrected policy that properly allows leaders/moderators to see requests
CREATE POLICY "clan_join_requests_view" ON clan_join_requests
    FOR SELECT
    USING (
        -- Leaders and moderators can see requests for their clan
        EXISTS (
            SELECT 1 FROM clan_members 
            WHERE clan_members.user_id = auth.uid()
            AND clan_members.clan_id = clan_join_requests.clan_id
            AND clan_members.role IN ('leader', 'moderator')
        )
        OR
        -- Users can see their own requests
        user_id = auth.uid()
    );

-- Verify the policy is in place
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'clan_join_requests'
ORDER BY policyname;
