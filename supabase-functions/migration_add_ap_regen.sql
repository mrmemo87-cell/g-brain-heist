-- Migration: Add AP Regeneration System
-- Add last_ap_update column to users table if it doesn't exist
-- Run this in Supabase SQL Editor

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_ap_update'
    ) THEN
        ALTER TABLE users ADD COLUMN last_ap_update TIMESTAMPTZ DEFAULT NOW();
        
        -- Set last_ap_update to now for all existing users
        UPDATE users SET last_ap_update = NOW();
        
        RAISE NOTICE 'Column last_ap_update added successfully';
    ELSE
        RAISE NOTICE 'Column last_ap_update already exists';
    END IF;
END $$;
