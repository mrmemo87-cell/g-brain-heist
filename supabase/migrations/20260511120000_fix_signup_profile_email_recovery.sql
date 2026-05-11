-- Make auth-user -> public.users profile creation idempotent and resilient to
-- orphaned public.users rows left behind by partial admin deletes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(NEW.email, '')));
    v_username TEXT;
    v_role TEXT;
    v_grade SMALLINT;
    v_batch TEXT;
    v_stale_user_id UUID;
BEGIN
    v_username := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''), split_part(v_email, '@', 1), 'user');
    v_role := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'role'), ''), 'student');
    IF v_role NOT IN ('student', 'teacher', 'school_admin') THEN
        v_role := 'student';
    END IF;

    BEGIN
        v_grade := NULLIF(NEW.raw_user_meta_data->>'grade', '')::SMALLINT;
    EXCEPTION WHEN OTHERS THEN
        v_grade := NULL;
    END;

    v_batch := NULLIF(upper(trim(COALESCE(NEW.raw_user_meta_data->>'batch', ''))), '');
    IF v_role = 'student' THEN
        v_grade := COALESCE(v_grade, 6);
        v_batch := COALESCE(v_batch, 'N/A');
    ELSE
        v_grade := NULL;
        v_batch := NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username AND id <> NEW.id) THEN
        v_username := v_username || '_' || substr(NEW.id::text, 1, 8);
    END IF;

    -- If an earlier delete removed auth.users but left public.users occupying this
    -- email, reclaim that orphaned profile for the new auth id. This is safe only
    -- when the old profile id no longer exists in auth.users; otherwise we leave it
    -- untouched so two active auth users never share one email profile.
    SELECT u.id INTO v_stale_user_id
    FROM public.users u
    WHERE lower(u.email) = v_email
      AND u.id <> NEW.id
      AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
    ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF v_stale_user_id IS NOT NULL THEN
        UPDATE public.users
        SET id = NEW.id,
            email = v_email,
            username = v_username,
            role = v_role,
            grade = v_grade,
            batch = v_batch,
            needs_setup = true,
            avatar_url = COALESCE(avatar_url, 'https://picsum.photos/seed/' || v_username || '/100/100'),
            updated_at = NOW()
        WHERE id = v_stale_user_id
          AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_stale_user_id);

        IF FOUND THEN
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO public.users (
        id,
        email,
        username,
        role,
        grade,
        batch,
        avatar_url,
        needs_setup,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_email,
        v_username,
        v_role,
        v_grade,
        v_batch,
        'https://picsum.photos/seed/' || v_username || '/100/100',
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        username = COALESCE(NULLIF(public.users.username, ''), EXCLUDED.username),
        role = COALESCE(NULLIF(public.users.role, ''), EXCLUDED.role),
        grade = COALESCE(public.users.grade, EXCLUDED.grade),
        batch = COALESCE(public.users.batch, EXCLUDED.batch),
        avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
        updated_at = NOW();

    RETURN NEW;
EXCEPTION WHEN unique_violation THEN
    -- Do not block auth.users creation if an active account already owns the email
    -- or username. The client maps duplicate-email failures to a safe login prompt.
    RETURN NEW;
WHEN OTHERS THEN
    -- Profile creation must never make Supabase Auth signup fail.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
