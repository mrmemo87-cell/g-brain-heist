-- Fix: Add school_id to classes table and RLS policies for school admins
-- This allows school admins to view and manage classes in their school
-- FIXED: Uses SECURITY DEFINER function to avoid infinite recursion in RLS

-- STEP 0: DISABLE RLS FIRST to stop recursion, then drop ALL policies
ALTER TABLE classes DISABLE ROW LEVEL SECURITY;

-- Drop ALL policies on classes table (get them all dynamically)
DO $$
DECLARE
  policy_rec RECORD;
BEGIN
  FOR policy_rec IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'classes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON classes', policy_rec.policyname);
    RAISE NOTICE 'Dropped policy: %', policy_rec.policyname;
  END LOOP;
END $$;

-- 1. Add school_id column to classes table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);
    
    RAISE NOTICE 'Added school_id column to classes table';
  ELSE
    RAISE NOTICE 'school_id column already exists in classes table';
  END IF;
END $$;

-- 2. Drop the old function if it exists and create a new one
DROP FUNCTION IF EXISTS can_access_class(UUID);

-- Create a SECURITY DEFINER function to check class access (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION can_access_class(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    -- Global admins can access all classes
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'school_admin')
    )
    OR
    -- School admins via school_members
    EXISTS (
      SELECT 1 FROM school_members
      WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND status = 'active'
      AND role_in_school = 'school_admin'
    )
    OR
    -- Teachers can also see classes (optional - remove if not needed)
    EXISTS (
      SELECT 1 FROM school_members
      WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND status = 'active'
      AND role_in_school = 'teacher'
    )
$$;

-- 3. Now enable RLS and create simple policies
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- 4. Create simple, non-recursive policies using the SECURITY DEFINER function
CREATE POLICY "classes_select_policy" ON classes
FOR SELECT
USING (can_access_class(school_id));

CREATE POLICY "classes_insert_policy" ON classes
FOR INSERT
WITH CHECK (can_access_class(school_id));

CREATE POLICY "classes_update_policy" ON classes
FOR UPDATE
USING (can_access_class(school_id))
WITH CHECK (can_access_class(school_id));

CREATE POLICY "classes_delete_policy" ON classes
FOR DELETE
USING (can_access_class(school_id));

-- 6. Grant access to classes table
GRANT SELECT, INSERT, UPDATE, DELETE ON classes TO authenticated;

-- Verify the changes
DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_policy_count INT;
  v_function_exists BOOLEAN;
BEGIN
  -- Check if column was added
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) INTO v_column_exists;
  
  -- Check if function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'can_access_class'
  ) INTO v_function_exists;
  
  -- Count new policies
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'classes'
  AND policyname LIKE 'classes_%_policy';
  
  RAISE NOTICE 'school_id column exists: %', v_column_exists;
  RAISE NOTICE 'can_access_class function exists: %', v_function_exists;
  RAISE NOTICE 'Class policies created: %', v_policy_count;
  
  IF v_column_exists AND v_function_exists AND v_policy_count >= 4 THEN
    RAISE NOTICE '✅ Classes table is now configured for school admins (recursion-free)!';
  ELSE
    RAISE WARNING '⚠️ Some configuration may be incomplete';
  END IF;
END $$;
