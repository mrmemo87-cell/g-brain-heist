-- Add gems column to users table for clan territory rewards
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS gems INTEGER DEFAULT 0 NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.gems IS 'Premium currency earned through clan territory battles and other activities';
