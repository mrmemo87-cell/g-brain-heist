-- ============================================================
-- Add Question Image Support
-- ============================================================
-- This migration adds support for question images in the teacher question system.
-- Run this in your Supabase SQL Editor.
--
-- FEATURES SUPPORTED:
-- 1. Question images: Teachers can upload an image for the question itself
-- 2. Option images: Each MCQ answer option can have an optional image
--
-- The options column already stores JSONB, so it can handle the new format:
-- Old format: ["Option A", "Option B", "Option C", "Option D"]
-- New format: [{"text": "Option A", "image_url": "https://..."}, {"text": "Option B"}, ...]
-- Both formats are backwards compatible.

-- Step 1: Add image_url column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Step 2: Create storage bucket for question images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-images',
  'question-images', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create storage policies for question images

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Teachers can upload question images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'question-images' 
  AND (storage.foldername(name))[1] = 'questions'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow anyone to view question images (they are public)
CREATE POLICY "Anyone can view question images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'question-images');

-- Allow teachers to update their own images
CREATE POLICY "Teachers can update own question images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'question-images' 
  AND (storage.foldername(name))[1] = 'questions'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow teachers to delete their own images
CREATE POLICY "Teachers can delete own question images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'question-images' 
  AND (storage.foldername(name))[1] = 'questions'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Step 4: Add index for faster queries (optional)
CREATE INDEX IF NOT EXISTS idx_questions_image_url ON questions(image_url) WHERE image_url IS NOT NULL;

-- Step 5: Update assignment_question_details view to include image_url
CREATE OR REPLACE VIEW assignment_question_details AS
SELECT
  aq.assignment_id,
  aq.question_id,
  aq.order_index,
  q.teacher_id,
  q.subject,
  q.subject_id,
  q.topic,
  q.topic_name,
  q.difficulty,
  q.question_text,
  q.image_url,
  q.question_type,
  q.options,
  q.correct_answer,
  q.explanation,
  q.hints,
  q.time_limit,
  q.points,
  q.tags,
  q.grade_level,
  q.is_public,
  q.is_active,
  q.times_answered,
  q.times_correct,
  q.created_at,
  q.updated_at
FROM assignment_questions aq
JOIN questions q ON q.id = aq.question_id;

-- Verification query - run this to check if migration was successful:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'image_url';
-- SELECT * FROM storage.buckets WHERE id = 'question-images';
