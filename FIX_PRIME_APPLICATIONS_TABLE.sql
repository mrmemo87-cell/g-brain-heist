-- ============================================================
-- FIX IELTS PRIME APPLICATIONS TABLE
-- ============================================================
-- This script adds the missing columns that the application form needs
-- ============================================================

-- Add missing columns to ielts_prime_applications
ALTER TABLE ielts_prime_applications 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE ielts_prime_applications 
ADD COLUMN IF NOT EXISTS current_level TEXT;

ALTER TABLE ielts_prime_applications 
ADD COLUMN IF NOT EXISTS goals TEXT;

ALTER TABLE ielts_prime_applications 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'monthly';

-- Rename motivation to goals if motivation exists and goals doesn't have data
-- (Skip this if you want to keep motivation separate)

-- ============================================================
-- CREATE ADMIN VIEW FOR PRIME APPLICATIONS
-- ============================================================

-- Create a view for admins to see all prime applications
CREATE OR REPLACE VIEW ielts_prime_applications_admin AS
SELECT 
  pa.id,
  pa.user_id,
  pa.full_name,
  pa.email,
  pa.phone,
  pa.target_band_score,
  pa.test_date,
  pa.current_level,
  pa.goals,
  pa.payment_method,
  pa.status,
  pa.reviewed_by,
  pa.reviewed_at,
  pa.rejection_reason,
  pa.created_at,
  pa.updated_at,
  -- Join with ielts_users to get username
  iu.username
FROM ielts_prime_applications pa
LEFT JOIN ielts_users iu ON pa.user_id = iu.id
ORDER BY pa.created_at DESC;

-- Grant access to authenticated users (admin check happens in app)
GRANT SELECT ON ielts_prime_applications_admin TO authenticated;

-- ============================================================
-- ADD ADMIN UPDATE POLICY
-- ============================================================

-- Allow admins to update application status
DROP POLICY IF EXISTS "Admins can update prime applications" ON ielts_prime_applications;
CREATE POLICY "Admins can update prime applications" 
ON ielts_prime_applications 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM ielts_users 
    WHERE id = auth.uid() 
    AND tier IN ('admin', 'super_admin')
  )
);

-- Allow admins to view all applications
DROP POLICY IF EXISTS "Admins can view all prime applications" ON ielts_prime_applications;
CREATE POLICY "Admins can view all prime applications" 
ON ielts_prime_applications 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM ielts_users 
    WHERE id = auth.uid() 
    AND tier IN ('admin', 'super_admin')
  )
);

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT '✅ Prime Applications table fixed!' AS status;

-- Show table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ielts_prime_applications'
ORDER BY ordinal_position;
