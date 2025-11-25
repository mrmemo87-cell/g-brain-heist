-- ============================================
-- FIX: Ensure clan_join_requests table exists and RLS is configured
-- ============================================

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS clan_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_clan_id ON clan_join_requests(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_pending ON clan_join_requests(clan_id, status);
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_user_id ON clan_join_requests(user_id);

-- Enable RLS
ALTER TABLE clan_join_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "clan_join_requests_view" ON clan_join_requests;
DROP POLICY IF EXISTS "clan_join_requests_insert" ON clan_join_requests;
DROP POLICY IF EXISTS "clan_join_requests_update" ON clan_join_requests;
DROP POLICY IF EXISTS "clan_join_requests_delete" ON clan_join_requests;

-- Policy: Users can view join requests for their own clans (if they're leader/mod)
CREATE POLICY "clan_join_requests_view" ON clan_join_requests
    FOR SELECT
    USING (
        -- Leaders and moderators can see requests for their clan
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
        OR
        -- Users can see their own requests
        user_id = auth.uid()
    );

-- Policy: Users can insert join requests for themselves
CREATE POLICY "clan_join_requests_insert" ON clan_join_requests
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Policy: Leaders and moderators can update requests in their clan
CREATE POLICY "clan_join_requests_update" ON clan_join_requests
    FOR UPDATE
    USING (
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    )
    WITH CHECK (
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );

-- Policy: Leaders and moderators can delete requests in their clan
CREATE POLICY "clan_join_requests_delete" ON clan_join_requests
    FOR DELETE
    USING (
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON clan_join_requests TO authenticated;
