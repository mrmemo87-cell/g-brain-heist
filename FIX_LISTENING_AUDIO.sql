-- Fix IELTS Listening Audio URLs
-- The current audio_url values are placeholder paths that don't work.
-- 
-- OPTION 1: Upload your own audio files to Supabase Storage
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a bucket called 'ielts-audio' (make it public)
-- 3. Upload your MP3 files
-- 4. Update the URLs below with your actual Supabase storage URLs
--
-- OPTION 2: Use these sample audio URLs (for testing only)
-- These are placeholder URLs - replace with your actual audio files

-- First, let's check what listening sets exist
SELECT id, slug, title, audio_url FROM ielts_listening_sets;

-- Update with Supabase storage URLs (replace YOUR_PROJECT_ID with your actual project ID)
-- Example format: https://YOUR_PROJECT_ID.supabase.co/storage/v1/object/public/ielts-audio/filename.mp3

-- For now, we'll use a placeholder message in the UI if audio is missing
-- Update the audio_url to an empty string so the UI can handle it gracefully
UPDATE ielts_listening_sets 
SET audio_url = '' 
WHERE audio_url LIKE '/audio/%';

-- To add real audio URLs, use this format:
-- UPDATE ielts_listening_sets 
-- SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/travel-conversation.mp3'
-- WHERE slug = 'travel-conversation';

-- UPDATE ielts_listening_sets 
-- SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/university-orientation.mp3'
-- WHERE slug = 'university-orientation';

-- UPDATE ielts_listening_sets 
-- SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/environmental-lecture.mp3'
-- WHERE slug = 'environmental-lecture';

-- Create the ielts-audio bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('ielts-audio', 'ielts-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to ielts-audio bucket
DROP POLICY IF EXISTS "Public Access to IELTS Audio" ON storage.objects;
CREATE POLICY "Public Access to IELTS Audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'ielts-audio');

-- Allow authenticated users to upload audio
DROP POLICY IF EXISTS "Authenticated users can upload IELTS audio" ON storage.objects;
CREATE POLICY "Authenticated users can upload IELTS audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ielts-audio' AND auth.role() = 'authenticated');
