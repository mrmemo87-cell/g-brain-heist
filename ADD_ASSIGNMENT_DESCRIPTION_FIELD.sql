-- ============================================================
-- Add description field to assignments table
-- ============================================================

-- Add description column if it doesn't exist
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create comment explaining the field
COMMENT ON COLUMN assignments.description IS 'Detailed explanation of what the assignment is about, shown to students before they start';

-- Update existing assignments to have empty description (optional)
UPDATE assignments
SET description = ''
WHERE description IS NULL;

-- Test query to verify
SELECT id, title, description, instructions FROM assignments LIMIT 5;
