-- ============================================================
-- IELTS Premium Tiers & Access Control
-- ============================================================
-- Implements free tier vs prime_prep_user system with:
-- - Free: Sample exercises with limited access
-- - Prime: Full trial per skill + mock test + certificates
-- ============================================================

-- Add tier column to ielts_users
ALTER TABLE ielts_users 
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'prime_prep_user', 'admin'));

ALTER TABLE ielts_users 
ADD COLUMN IF NOT EXISTS prime_approved_at TIMESTAMPTZ;

ALTER TABLE ielts_users 
ADD COLUMN IF NOT EXISTS prime_approved_by UUID REFERENCES ielts_users(id);

-- Create prime access applications table
CREATE TABLE IF NOT EXISTS ielts_prime_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  motivation TEXT NOT NULL,
  target_band_score NUMERIC(2,1),
  test_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES ielts_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add tier restrictions to reading sets
ALTER TABLE ielts_reading_sets 
ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'free' CHECK (required_tier IN ('free', 'prime_prep_user'));

-- Mark existing sets as free (samples)
UPDATE ielts_reading_sets 
SET required_tier = 'free' 
WHERE required_tier IS NULL;

-- Create certificates table
CREATE TABLE IF NOT EXISTS ielts_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  certificate_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('reading', 'listening', 'writing', 'speaking', 'full_mock')),
  band_score NUMERIC(2,1) NOT NULL,
  completion_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_url TEXT,
  is_verified BOOLEAN DEFAULT true
);

-- Create usage tracking table for trial limits
CREATE TABLE IF NOT EXISTS ielts_skill_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL CHECK (skill_type IN ('reading', 'listening', 'writing', 'speaking', 'full_mock')),
  attempts_used INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, skill_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prime_applications_user ON ielts_prime_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_prime_applications_status ON ielts_prime_applications(status);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON ielts_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_number ON ielts_certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_skill_usage_user ON ielts_skill_usage(user_id);

-- RLS Policies
ALTER TABLE ielts_prime_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_skill_usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users view own prime applications" ON ielts_prime_applications;
DROP POLICY IF EXISTS "Users create own prime applications" ON ielts_prime_applications;
DROP POLICY IF EXISTS "Users view own certificates" ON ielts_certificates;
DROP POLICY IF EXISTS "Users view own usage" ON ielts_skill_usage;

-- Users can view and create their own applications
CREATE POLICY "Users view own prime applications"
  ON ielts_prime_applications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users create own prime applications"
  ON ielts_prime_applications FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can view their own certificates
CREATE POLICY "Users view own certificates"
  ON ielts_certificates FOR SELECT
  USING (user_id = auth.uid());

-- Users can view their own usage
CREATE POLICY "Users view own usage"
  ON ielts_skill_usage FOR SELECT
  USING (user_id = auth.uid());

-- Function to check if user has access to content
CREATE OR REPLACE FUNCTION can_access_content(
  p_user_id UUID,
  p_required_tier TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_tier TEXT;
BEGIN
  SELECT tier INTO v_user_tier
  FROM ielts_users
  WHERE id = p_user_id;
  
  -- Free content accessible to everyone
  IF p_required_tier = 'free' THEN
    RETURN true;
  END IF;
  
  -- Prime content only for prime users
  IF p_required_tier = 'prime_prep_user' THEN
    RETURN v_user_tier IN ('prime_prep_user', 'admin');
  END IF;
  
  RETURN false;
END;
$$;

-- Function to check if user can attempt a skill
CREATE OR REPLACE FUNCTION can_attempt_skill(
  p_user_id UUID,
  p_skill_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_tier TEXT;
  v_attempts_used INTEGER;
  v_max_attempts INTEGER;
BEGIN
  SELECT tier INTO v_user_tier
  FROM ielts_users
  WHERE id = p_user_id;
  
  -- Free users have unlimited access to sample content
  IF v_user_tier = 'free' THEN
    RETURN true;
  END IF;
  
  -- Prime users check their trial limits
  SELECT attempts_used, max_attempts 
  INTO v_attempts_used, v_max_attempts
  FROM ielts_skill_usage
  WHERE user_id = p_user_id AND skill_type = p_skill_type;
  
  -- No record means they haven't used it yet
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  RETURN v_attempts_used < v_max_attempts;
END;
$$;

-- Function to generate certificate number
CREATE OR REPLACE FUNCTION generate_certificate_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'BHA-IELTS-' || 
         TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
END;
$$;

-- Verify setup
SELECT 'IELTS Premium Tier System Installed!' as status;
