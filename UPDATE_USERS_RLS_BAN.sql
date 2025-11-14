-- ============================================================================
-- G-BRAIN HEIST: BAN-AWARE RLS FOR USERS TABLE
-- ============================================================================
-- Run this after restoring the base users policies. The script refreshes the
-- policies so banned players lose access while admins keep full control.
-- ============================================================================

-- Apply ban-aware policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view other users" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Admin update any user" ON users;
DROP POLICY IF EXISTS "Admins view users" ON users;

-- Active users can read their own row
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (
    auth.uid() = id
    AND COALESCE(is_banned, false) = false
  );

-- Active users can update their own row
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (
    auth.uid() = id
    AND COALESCE(is_banned, false) = false
  )
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(is_banned, false) = false
  );

-- Active users can insert their profile on signup
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Active (non-banned) users can see other active users
CREATE POLICY "Users can view other users"
  ON users FOR SELECT
  USING (
    COALESCE(is_banned, false) = false
  );

-- Admins (and service role) can read any user row
CREATE POLICY "Admins view users"
  ON users FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR auth.uid() IN (
      SELECT id
      FROM users
      WHERE COALESCE(is_admin, false) = true
         OR COALESCE(role, 'student') = 'admin'
    )
  );

-- Admins (and service role) can manage any user row
CREATE POLICY "Admin update any user"
  ON users FOR UPDATE
  USING (true)
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() IN (
      SELECT id
      FROM users
      WHERE COALESCE(is_admin, false) = true
         OR COALESCE(role, 'student') = 'admin'
    )
  );
