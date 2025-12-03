-- Add missing columns to ielts_speaking_attempts table
-- Run this if you get error: "Could not find the 'duration' column of 'ielts_speaking_attempts' in the schema cache"

-- Add duration column (stores recording duration in seconds)
ALTER TABLE ielts_speaking_attempts 
ADD COLUMN IF NOT EXISTS duration INTEGER;

-- Add status column for tracking review status
ALTER TABLE ielts_speaking_attempts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review' 
CHECK (status IN ('pending_review', 'reviewed', 'rejected'));

-- Add recording_url column (alias for audio_url for compatibility)
ALTER TABLE ielts_speaking_attempts 
ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Create a trigger to sync audio_url and recording_url
CREATE OR REPLACE FUNCTION sync_speaking_audio_urls()
RETURNS TRIGGER AS $$
BEGIN
  -- If recording_url is set but audio_url is not, copy it
  IF NEW.recording_url IS NOT NULL AND NEW.audio_url IS NULL THEN
    NEW.audio_url := NEW.recording_url;
  END IF;
  -- If audio_url is set but recording_url is not, copy it
  IF NEW.audio_url IS NOT NULL AND NEW.recording_url IS NULL THEN
    NEW.recording_url := NEW.audio_url;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_audio_urls_trigger ON ielts_speaking_attempts;
CREATE TRIGGER sync_audio_urls_trigger
  BEFORE INSERT OR UPDATE ON ielts_speaking_attempts
  FOR EACH ROW
  EXECUTE FUNCTION sync_speaking_audio_urls();

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_status ON ielts_speaking_attempts(status);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'ielts_speaking_attempts'
ORDER BY ordinal_position;
