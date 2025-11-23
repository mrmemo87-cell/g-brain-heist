-- RPC to fetch users with active neon frames
-- This bypasses per-user RLS by querying at the function level with elevated privileges
CREATE OR REPLACE FUNCTION rpc_get_users_with_neon(p_user_ids UUID[])
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT inv.user_id
  FROM inventory inv
  WHERE inv.user_id = ANY(p_user_ids)
    AND inv.state = 'active'
    AND inv.kind = 'cosmetic'
    AND inv.item_id = 'item_cosmetic_frame';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow all authenticated users to call this function
GRANT EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) TO anon;
