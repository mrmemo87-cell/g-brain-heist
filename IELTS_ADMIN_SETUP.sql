-- ============================================================
-- IELTS ADMIN SETUP
-- ============================================================
-- This script creates:
-- 1. Notification preferences table for storing user preferences
-- 2. Indexes for fast admin queries
-- 3. Views for admin dashboard stats
-- ============================================================

-- ============================================================
-- STEP 1: NOTIFICATION PREFERENCES TABLE
-- ============================================================

-- Drop existing table if it has wrong column types
DROP TABLE IF EXISTS ielts_notification_preferences CASCADE;

CREATE TABLE ielts_notification_preferences (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('reading', 'listening', 'writing', 'speaking', 'mock')),
  attempt_id UUID NOT NULL,
  
  -- Contact Info
  alternate_email TEXT,
  phone_number TEXT,
  
  -- Notification Flags
  notify_by_email BOOLEAN DEFAULT true,
  notify_by_sms BOOLEAN DEFAULT false,
  show_in_app BOOLEAN DEFAULT true,
  
  -- Status
  email_sent_at TIMESTAMPTZ,
  sms_sent_at TIMESTAMPTZ,
  in_app_shown_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint - one preference per attempt
CREATE UNIQUE INDEX IF NOT EXISTS idx_ielts_notif_unique 
  ON ielts_notification_preferences(user_id, attempt_type, attempt_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ielts_notif_user ON ielts_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_ielts_notif_pending_email 
  ON ielts_notification_preferences(notify_by_email, email_sent_at) 
  WHERE notify_by_email = true AND email_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ielts_notif_pending_sms 
  ON ielts_notification_preferences(notify_by_sms, sms_sent_at) 
  WHERE notify_by_sms = true AND sms_sent_at IS NULL;

-- Enable RLS
ALTER TABLE ielts_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
DROP POLICY IF EXISTS "Users manage own notification prefs" ON ielts_notification_preferences;
CREATE POLICY "Users manage own notification prefs" ON ielts_notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- STEP 2: ADMIN VIEW FOR IELTS STATISTICS
-- ============================================================

-- Create a comprehensive view for admin stats
CREATE OR REPLACE VIEW ielts_admin_stats AS
SELECT 
  -- User Stats
  (SELECT COUNT(*) FROM ielts_users) AS total_ielts_users,
  (SELECT COUNT(*) FROM ielts_users WHERE tier = 'premium') AS premium_users,
  (SELECT COUNT(*) FROM ielts_users WHERE tier = 'free') AS free_users,
  
  -- Reading Stats
  (SELECT COUNT(*) FROM ielts_reading_attempts) AS total_reading_attempts,
  (SELECT COUNT(DISTINCT user_id) FROM ielts_reading_attempts) AS unique_reading_users,
  (SELECT ROUND(AVG(percent)::numeric, 1) FROM ielts_reading_attempts WHERE percent IS NOT NULL) AS avg_reading_percent,
  
  -- Listening Stats
  (SELECT COUNT(*) FROM ielts_listening_attempts) AS total_listening_attempts,
  (SELECT COUNT(DISTINCT user_id) FROM ielts_listening_attempts) AS unique_listening_users,
  (SELECT ROUND(AVG(percent)::numeric, 1) FROM ielts_listening_attempts WHERE percent IS NOT NULL) AS avg_listening_percent,
  
  -- Writing Stats
  (SELECT COUNT(*) FROM ielts_writing_attempts) AS total_writing_attempts,
  (SELECT COUNT(DISTINCT user_id) FROM ielts_writing_attempts) AS unique_writing_users,
  (SELECT ROUND(AVG(band_overall)::numeric, 1) FROM ielts_writing_attempts WHERE band_overall IS NOT NULL) AS avg_writing_band,
  
  -- Speaking Stats
  (SELECT COUNT(*) FROM ielts_speaking_attempts) AS total_speaking_attempts,
  (SELECT COUNT(DISTINCT user_id) FROM ielts_speaking_attempts) AS unique_speaking_users,
  (SELECT ROUND(AVG(band_overall)::numeric, 1) FROM ielts_speaking_attempts WHERE band_overall IS NOT NULL) AS avg_speaking_band,
  
  -- Content Stats
  (SELECT COUNT(*) FROM ielts_reading_sets WHERE is_active = true) AS active_reading_sets,
  (SELECT COUNT(*) FROM ielts_listening_sets WHERE is_active = true) AS active_listening_sets,
  (SELECT COUNT(*) FROM ielts_writing_tasks WHERE is_active = true) AS active_writing_tasks,
  (SELECT COUNT(*) FROM ielts_speaking_tasks WHERE is_active = true) AS active_speaking_tasks,
  
  -- Notification Stats
  (SELECT COUNT(*) FROM ielts_notification_preferences WHERE notify_by_email = true) AS email_notifications_requested,
  (SELECT COUNT(*) FROM ielts_notification_preferences WHERE notify_by_sms = true) AS sms_notifications_requested,
  (SELECT COUNT(*) FROM ielts_notification_preferences WHERE email_sent_at IS NOT NULL) AS emails_sent,
  (SELECT COUNT(*) FROM ielts_notification_preferences WHERE sms_sent_at IS NOT NULL) AS sms_sent;

-- ============================================================
-- STEP 3: RECENT ATTEMPTS VIEW FOR ADMIN
-- ============================================================

CREATE OR REPLACE VIEW ielts_admin_recent_attempts AS
-- Reading Attempts
SELECT 
  'reading' AS skill,
  ra.id,
  ra.user_id,
  u.full_name AS user_name,
  rs.title AS content_title,
  ra.raw_score,
  ra.total_questions,
  ra.percent,
  ra.est_band,
  ra.time_spent_seconds,
  ra.completed_at AS attempt_date,
  np.alternate_email,
  np.phone_number,
  np.notify_by_email,
  np.notify_by_sms,
  np.email_sent_at,
  np.sms_sent_at
FROM ielts_reading_attempts ra
LEFT JOIN ielts_users u ON ra.user_id = u.id
LEFT JOIN ielts_reading_sets rs ON ra.set_id = rs.id
LEFT JOIN ielts_notification_preferences np 
  ON np.user_id = ra.user_id 
  AND np.attempt_type = 'reading' 
  AND np.attempt_id = ra.id

UNION ALL

-- Listening Attempts
SELECT 
  'listening' AS skill,
  la.id,
  la.user_id,
  u.full_name AS user_name,
  ls.title AS content_title,
  la.raw_score,
  la.total_questions,
  la.percent,
  la.est_band,
  la.time_spent_seconds,
  la.completed_at AS attempt_date,
  np.alternate_email,
  np.phone_number,
  np.notify_by_email,
  np.notify_by_sms,
  np.email_sent_at,
  np.sms_sent_at
FROM ielts_listening_attempts la
LEFT JOIN ielts_users u ON la.user_id = u.id
LEFT JOIN ielts_listening_sets ls ON la.set_id = ls.id
LEFT JOIN ielts_notification_preferences np 
  ON np.user_id = la.user_id 
  AND np.attempt_type = 'listening' 
  AND np.attempt_id = la.id

UNION ALL

-- Writing Attempts
SELECT 
  'writing' AS skill,
  wa.id,
  wa.user_id,
  u.full_name AS user_name,
  wt.title AS content_title,
  NULL::integer AS raw_score,
  NULL::integer AS total_questions,
  NULL::numeric AS percent,
  wa.band_overall AS est_band,
  NULL::integer AS time_spent_seconds,
  wa.submitted_at AS attempt_date,
  np.alternate_email,
  np.phone_number,
  np.notify_by_email,
  np.notify_by_sms,
  np.email_sent_at,
  np.sms_sent_at
FROM ielts_writing_attempts wa
LEFT JOIN ielts_users u ON wa.user_id = u.id
LEFT JOIN ielts_writing_tasks wt ON wa.task_id = wt.id
LEFT JOIN ielts_notification_preferences np 
  ON np.user_id = wa.user_id 
  AND np.attempt_type = 'writing' 
  AND np.attempt_id = wa.id

UNION ALL

-- Speaking Attempts
SELECT 
  'speaking' AS skill,
  sa.id,
  sa.user_id,
  u.full_name AS user_name,
  st.prompt AS content_title,
  NULL::integer AS raw_score,
  NULL::integer AS total_questions,
  NULL::numeric AS percent,
  sa.band_overall AS est_band,
  NULL::integer AS time_spent_seconds,
  sa.submitted_at AS attempt_date,
  np.alternate_email,
  np.phone_number,
  np.notify_by_email,
  np.notify_by_sms,
  np.email_sent_at,
  np.sms_sent_at
FROM ielts_speaking_attempts sa
LEFT JOIN ielts_users u ON sa.user_id = u.id
LEFT JOIN ielts_speaking_tasks st ON sa.task_id = st.id
LEFT JOIN ielts_notification_preferences np 
  ON np.user_id = sa.user_id 
  AND np.attempt_type = 'speaking' 
  AND np.attempt_id = sa.id

ORDER BY attempt_date DESC;

-- Grant access to authenticated users (for admin checks in app)
GRANT SELECT ON ielts_admin_stats TO authenticated;
GRANT SELECT ON ielts_admin_recent_attempts TO authenticated;

-- ============================================================
-- STEP 4: UPDATE TRIGGER FOR NOTIFICATION PREFERENCES
-- ============================================================

CREATE OR REPLACE FUNCTION update_ielts_notif_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ielts_notif_timestamp ON ielts_notification_preferences;
CREATE TRIGGER update_ielts_notif_timestamp
  BEFORE UPDATE ON ielts_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_ielts_notif_timestamp();

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT '✅ IELTS Admin Setup Complete' AS status;
SELECT 'Notification preferences table created' AS step_1;
SELECT 'Admin stats view created' AS step_2;
SELECT 'Recent attempts view created' AS step_3;
