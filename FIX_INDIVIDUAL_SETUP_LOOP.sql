-- ============================================================
-- Fix: Individuals (no school) stuck in setup loop
-- ============================================================
-- Problem: check_user_setup_status() treats school_id IS NULL
-- as needs_setup=true, but individuals intentionally have no school.
-- After completing individual setup (needs_setup=false), they get
-- kicked back to the SetupWizard on every tab switch / auth refresh.
--
-- Fix: Only flag needs_setup when the DB column needs_setup=true,
-- NOT when school_id IS NULL alone. Individuals who completed
-- onboarding have needs_setup=false and a role set.
-- ============================================================

CREATE OR REPLACE FUNCTION check_user_setup_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user RECORD;
BEGIN
    v_user_id := auth.uid();
    
    -- Fast path: not authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'needs_setup', false
        );
    END IF;
    
    -- Single query to get all needed info
    SELECT 
        id,
        username,
        role,
        school_id,
        needs_setup,
        email
    INTO v_user 
    FROM users 
    WHERE id = v_user_id;
    
    -- No profile row: needs setup
    IF v_user IS NULL OR v_user.id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'no_profile',
            'user_id', v_user_id
        );
    END IF;
    
    -- Explicitly flagged as needing setup (new account, not yet onboarded)
    IF v_user.needs_setup = true THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'incomplete_profile',
            'has_username', v_user.username IS NOT NULL AND v_user.username != '',
            'has_role', v_user.role IS NOT NULL,
            'username', v_user.username,
            'user_id', v_user.id
        );
    END IF;
    
    -- Fully set up (includes individuals with school_id=NULL but needs_setup=false)
    RETURN jsonb_build_object(
        'authenticated', true,
        'needs_setup', false,
        'user_id', v_user.id,
        'username', v_user.username,
        'role', v_user.role,
        'school_id', v_user.school_id,
        'has_username', v_user.username IS NOT NULL AND v_user.username != '',
        'has_role', v_user.role IS NOT NULL
    );
END;
$$;
