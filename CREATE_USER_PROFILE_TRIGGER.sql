-- Create user profile automatically via trigger when auth user is created
-- This is the recommended Supabase pattern and bypasses all session/RLS issues

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create function that will be called by trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_role TEXT;
BEGIN
    -- Get metadata from auth.users.raw_user_meta_data
    v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    
    -- Log for debugging
    RAISE NOTICE 'Creating profile for new user: %, username: %, role: %', NEW.id, v_username, v_role;
    
    -- Insert into users table
    INSERT INTO public.users (
        id,
        email,
        username,
        role,
        grade,
        batch,
        avatar_url,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        v_username,
        v_role,
        CASE WHEN v_role = 'student' THEN 6 ELSE NULL END,
        CASE WHEN v_role = 'student' THEN 'N/A' ELSE NULL END,
        'https://picsum.photos/seed/' || v_username || '/100/100',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- In case profile already exists
    
    RAISE NOTICE 'Successfully created profile for user: %', NEW.id;
    
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    -- Don't fail the auth signup, just log the error
    RETURN NEW;
END;
$$;

-- Create trigger that fires after new user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Verify trigger was created
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
