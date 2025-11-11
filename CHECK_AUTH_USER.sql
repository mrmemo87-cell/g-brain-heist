-- Check authentication status
-- This queries the auth.users table (not public.users)

SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE email = 'sobbi@bh.com';

-- If this returns NO ROWS: The auth user doesn't exist - create it in Dashboard
-- If email_confirmed_at is NULL: Email not confirmed - need to confirm it
-- If it exists and confirmed: Password might be wrong or different
