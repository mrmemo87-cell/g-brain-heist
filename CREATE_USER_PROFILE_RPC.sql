-- Create a simple profile bootstrap function for individual signups
-- This bypasses RLS using SECURITY DEFINER

CREATE OR REPLACE FUNCTION create_user_profile(
    p_username TEXT,
    p_role TEXT DEFAULT 'student'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_existing_user RECORD;
BEGIN
    -- Must be authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Get email from auth.users
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    
    IF v_user_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User email not found');
    END IF;

    -- Validate role
    IF p_role NOT IN ('student', 'teacher') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be student or teacher.');
    END IF;

    -- Check if profile already exists
    SELECT * INTO v_existing_user FROM users WHERE id = v_user_id;
    
    IF v_existing_user IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile already exists');
    END IF;

    -- Create the user profile
    INSERT INTO users (
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
        v_user_id,
        v_user_email,
        p_username,
        p_role,
        CASE WHEN p_role = 'student' THEN 6 ELSE NULL END,  -- Default grade 6 for students
        CASE WHEN p_role = 'student' THEN 'N/A' ELSE NULL END,  -- Default batch N/A for students
        'https://picsum.photos/seed/' || p_username || '/100/100',
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'role', p_role
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile(TEXT, TEXT) TO authenticated;

-- Test it (uncomment to test after running)
-- SELECT create_user_profile('testuser', 'student');
