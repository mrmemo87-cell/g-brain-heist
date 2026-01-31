-- FIX: Allow new users to insert their own profile during signup
-- This fixes the "new row violates row-level security policy" error

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- Create new INSERT policy that allows users to insert their own row
CREATE POLICY "Users can insert their own profile"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Verify other policies are still in place
-- SELECT policy should allow users to read their own data
DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- UPDATE policy should allow users to update their own data
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Optional: Allow public read access for leaderboards/profiles (if needed)
-- Uncomment if you want public profile visibility
-- DROP POLICY IF EXISTS "Public can read user profiles" ON users;
-- CREATE POLICY "Public can read user profiles"
-- ON users
-- FOR SELECT
-- TO public
-- USING (true);

-- Verify RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Show all policies for verification
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;
