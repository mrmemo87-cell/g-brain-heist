-- Migration: Add active_cosmetic_effect column to users table
-- This column stores the currently active cosmetic effect (e.g., 'glitch')
-- Run this in your Supabase SQL editor

-- Add the new column for cosmetic effect
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS active_cosmetic_effect text DEFAULT NULL;

-- Add a check constraint to ensure only valid values are stored
ALTER TABLE users 
ADD CONSTRAINT check_active_cosmetic_effect 
CHECK (active_cosmetic_effect IS NULL OR active_cosmetic_effect IN ('glitch'));

-- Create an index for efficient lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_effect 
ON users(active_cosmetic_effect) 
WHERE active_cosmetic_effect IS NOT NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'active_cosmetic_effect';

-- Grant necessary permissions (adjust based on your RLS policies)
-- The existing RLS policies should cover this new column

COMMENT ON COLUMN users.active_cosmetic_effect IS 'Currently active cosmetic effect (e.g., glitch). NULL means no effect active.';
