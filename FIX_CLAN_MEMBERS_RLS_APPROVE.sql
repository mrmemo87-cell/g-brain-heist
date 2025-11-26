-- ============================================
-- FIX: Allow leaders/moderators to add clan members via approval
-- ============================================
-- Problem: When approving a join request, leaders/moderators try to insert a new clan_members row
-- but the RLS policy only allows users to insert their own membership.
-- Solution: Add a policy allowing leaders/moderators to insert members into their clan

-- Drop the old policy if it exists
DROP POLICY IF EXISTS "Leaders can add members to clan" ON clan_members;

-- New policy: Leaders and moderators can add members to their clan
-- This is used when approving clan join requests
CREATE POLICY "Leaders can add members to clan"
    ON clan_members FOR INSERT
    WITH CHECK (
        -- The leader/moderator inserting must be in this clan and have the right role
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );

-- Verify the policy exists
SELECT * FROM pg_policies WHERE tablename = 'clan_members' AND policyname = 'Leaders can add members to clan';
