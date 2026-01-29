-- Fix: Add school_id to classes table and RLS policies for school admins
-- This allows school admins to view and manage classes in their school

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

-- 2. Add RLS policy for school admins to view classes in their school
DROP POLICY IF EXISTS "School admins can view classes in their school" ON classes;
CREATE POLICY "School admins can view classes in their school" ON classes
FOR SELECT
USING (
  -- Check if user is school admin by role
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'school_admin')
  OR
  -- Check if user is school admin via school_members
  school_id IN (
    SELECT school_id 
    FROM school_members 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role_in_school = 'school_admin'
  )
);

-- 3. Add RLS policy for school admins to manage classes in their school
DROP POLICY IF EXISTS "School admins can manage classes in their school" ON classes;
CREATE POLICY "School admins can manage classes in their school" ON classes
FOR ALL
USING (
  -- Check if user is school admin by role
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'school_admin')
  OR
  -- Check if user is school admin via school_members
  school_id IN (
    SELECT school_id 
    FROM school_members 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role_in_school = 'school_admin'
  )
)
WITH CHECK (
  -- Check if user is school admin by role
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'school_admin')
  OR
  -- Check if user is school admin via school_members
  school_id IN (
    SELECT school_id 
    FROM school_members 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role_in_school = 'school_admin'
  )
);

-- 4. Grant access to classes table
GRANT SELECT, INSERT, UPDATE, DELETE ON classes TO authenticated;

-- Verify the changes
DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_policy_count INT;
BEGIN
  -- Check if column was added
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) INTO v_column_exists;
  
  -- Count new policies
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'classes'
  AND policyname LIKE '%School admins%';
  
  RAISE NOTICE 'school_id column exists: %', v_column_exists;
  RAISE NOTICE 'School admin policies created: %', v_policy_count;
  
  IF v_column_exists AND v_policy_count = 2 THEN
    RAISE NOTICE '✅ Classes table is now configured for school admins!';
  ELSE
    RAISE WARNING '⚠️ Some configuration may be incomplete';
  END IF;
END $$;
