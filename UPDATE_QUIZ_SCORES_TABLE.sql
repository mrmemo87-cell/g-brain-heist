-- Fix/Update quiz_scores table
-- Run this in your Supabase SQL Editor if you get "already exists" errors

-- Add the time_taken_seconds column if it doesn't exist
ALTER TABLE quiz_scores 
ADD COLUMN IF NOT EXISTS time_taken_seconds INTEGER;

-- That's it! The table and policies already exist.
-- This just adds the new time tracking column.
