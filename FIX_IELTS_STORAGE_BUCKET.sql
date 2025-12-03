-- Fix storage bucket for IELTS speaking recordings
-- Run this in Supabase SQL Editor

-- First, check if the bucket exists, if not create it
INSERT INTO storage.buckets (id, name, public)
VALUES ('ielts-recordings', 'ielts-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "IELTS users upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "IELTS users view recordings" ON storage.objects;
DROP POLICY IF EXISTS "IELTS users delete recordings" ON storage.objects;

-- Create policy to allow authenticated users to upload to their own folder
CREATE POLICY "IELTS users upload recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ielts-recordings' 
  AND (storage.foldername(name))[1] = 'speaking'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Create policy to allow users to view their own recordings
CREATE POLICY "IELTS users view recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ielts-recordings'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Create policy to allow users to update their own recordings
CREATE POLICY "IELTS users update recordings"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ielts-recordings'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Create policy to allow users to delete their own recordings
CREATE POLICY "IELTS users delete recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ielts-recordings'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Verify bucket exists
SELECT * FROM storage.buckets WHERE id = 'ielts-recordings';

-- Verify policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'IELTS%';
