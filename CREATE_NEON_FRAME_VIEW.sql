-- Public view for neon frame status (no RLS)
-- This allows any user to see which other users have active neon frames
CREATE OR REPLACE VIEW public_neon_frames AS
SELECT DISTINCT user_id
FROM inventory
WHERE state = 'active'
  AND kind = 'cosmetic'
  AND item_id = 'item_cosmetic_frame';

-- Allow all users to read from this view
ALTER VIEW public_neon_frames SET (security_barrier = false);

-- Create a policy to allow all authenticated users to select from it
-- (Views inherit policies from underlying tables, so we may need a simpler approach)
