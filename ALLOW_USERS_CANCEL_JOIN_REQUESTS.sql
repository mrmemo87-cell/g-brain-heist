-- ============================================
-- Allow users to cancel their own pending join requests
-- ============================================

-- Drop the existing restrictive delete policy
DROP POLICY IF EXISTS "clan_join_requests_delete" ON clan_join_requests;

-- Create a new delete policy that allows:
-- 1. Leaders/Moderators to delete requests in their clan (for rejecting)
-- 2. Users to delete their own requests (for canceling)
CREATE POLICY "clan_join_requests_delete" ON clan_join_requests
    FOR DELETE
    USING (
        -- Users can delete their own requests
        user_id = auth.uid()
        OR
        -- Leaders and moderators can delete requests in their clan
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );

-- Verify the policy is in place
SELECT schemaname, tablename, policyname, permissive, roles, qual
FROM pg_policies
WHERE tablename = 'clan_join_requests'
AND policyname = 'clan_join_requests_delete';
