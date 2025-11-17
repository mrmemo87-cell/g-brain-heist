-- ============================================================
-- IELTS Storage Bucket Setup
-- ============================================================
-- Creates storage for speaking/writing submissions
-- Run this AFTER the main IELTS migrations
-- ============================================================

-- Create storage bucket for IELTS recordings and submissions
INSERT INTO storage.buckets (id, name, public)
VALUES ('ielts-recordings', 'ielts-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY IF NOT EXISTS "Users can upload own recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ielts-recordings' AND
  (storage.foldername(name))[1] = 'speaking' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to read their own recordings
CREATE POLICY IF NOT EXISTS "Users can read own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ielts-recordings' AND
  (storage.foldername(name))[1] = 'speaking' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Create table for speaking attempts if not exists
CREATE TABLE IF NOT EXISTS ielts_speaking_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES ielts_speaking_tasks(id) ON DELETE CASCADE,
  recording_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  band_score NUMERIC(2,1),
  feedback TEXT,
  reviewed_by UUID REFERENCES ielts_users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create table for writing attempts if not exists
CREATE TABLE IF NOT EXISTS ielts_writing_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES ielts_writing_tasks(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  band_score NUMERIC(2,1),
  feedback TEXT,
  reviewed_by UUID REFERENCES ielts_users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create table for listening attempts if not exists
CREATE TABLE IF NOT EXISTS ielts_listening_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  set_id BIGINT NOT NULL REFERENCES ielts_listening_sets(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  time_spent INTEGER NOT NULL,
  score INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_user ON ielts_speaking_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_status ON ielts_speaking_attempts(status);
CREATE INDEX IF NOT EXISTS idx_writing_attempts_user ON ielts_writing_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_attempts_status ON ielts_writing_attempts(status);
CREATE INDEX IF NOT EXISTS idx_listening_attempts_user ON ielts_listening_attempts(user_id);

-- RLS Policies
ALTER TABLE ielts_speaking_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_writing_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_listening_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view their own attempts
CREATE POLICY IF NOT EXISTS "Users view own speaking attempts"
  ON ielts_speaking_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users create own speaking attempts"
  ON ielts_speaking_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users view own writing attempts"
  ON ielts_writing_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users create own writing attempts"
  ON ielts_writing_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users view own listening attempts"
  ON ielts_listening_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users create own listening attempts"
  ON ielts_listening_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Verify setup
SELECT 'IELTS Storage and Attempt Tracking Installed!' as status;

SELECT 
  'Reading Sets' as content_type, 
  COUNT(*) as count 
FROM ielts_reading_sets 
WHERE is_active = true
UNION ALL
SELECT 
  'Listening Sets', 
  COUNT(*) 
FROM ielts_listening_sets 
WHERE is_active = true
UNION ALL
SELECT 
  'Writing Tasks', 
  COUNT(*) 
FROM ielts_writing_tasks 
WHERE is_active = true
UNION ALL
SELECT 
  'Speaking Tasks', 
  COUNT(*) 
FROM ielts_speaking_tasks 
WHERE is_active = true;
