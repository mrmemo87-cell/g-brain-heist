-- ============================================
-- SCHOOL ADMIN COMPREHENSIVE SETUP
-- ============================================
-- This migration implements a complete DB-driven school admin system:
-- 1. school_subjects table (no more free-text drift)
-- 2. Enhanced classes RLS policies
-- 3. School admin RPCs for managing members, roles, and class enrollment
-- 4. Missing admin_assign_teacher_to_class_subject RPC
-- 5. Helper functions for school context
-- ============================================

-- ============================================
-- PART 1: SCHOOL SUBJECTS TABLE
-- ============================================
-- Real subjects table per school (eliminates free-text drift)

CREATE TABLE IF NOT EXISTS public.school_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT, -- optional (e.g. ENG, CHEM, MATH)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_school_subjects_school_id ON public.school_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_school_subjects_active ON public.school_subjects(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.school_subjects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS school_subjects_admin_all ON public.school_subjects;
DROP POLICY IF EXISTS school_subjects_read_school ON public.school_subjects;

-- Policy: School admin can manage all subjects in their school
CREATE POLICY school_subjects_admin_all ON public.school_subjects
FOR ALL
USING (
    -- School admin via school_members
    EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = school_subjects.school_id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school = 'school_admin'
    )
    OR
    -- Superadmin can manage all
    public.is_superadmin(auth.uid())
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = school_subjects.school_id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school = 'school_admin'
    )
    OR
    public.is_superadmin(auth.uid())
);

-- Policy: School members can read subjects
CREATE POLICY school_subjects_read_school ON public.school_subjects
FOR SELECT
USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = school_subjects.school_id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
    )
);

-- ============================================
-- PART 2: CLASSES RLS POLICIES (SCHOOL ADMIN)
-- ============================================
-- Ensure school admins can fully manage classes in their school

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS classes_school_admin_all ON public.classes;

-- Policy: School admin has full control over classes
CREATE POLICY classes_school_admin_all ON public.classes
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = classes.school_id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school = 'school_admin'
    )
    OR
    public.is_superadmin(auth.uid())
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = classes.school_id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school = 'school_admin'
    )
    OR
    public.is_superadmin(auth.uid())
);

-- ============================================
-- PART 3: HELPER FUNCTIONS
-- ============================================

-- Function: my_school_id() - Get current user's school
CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT sm.school_id
    FROM public.school_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.status = 'active'
    ORDER BY sm.joined_at ASC
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.my_school_id() TO authenticated;

-- Function: is_school_admin_of() - Check if user is admin of specific school
CREATE OR REPLACE FUNCTION public.is_school_admin_of(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = p_school_id
          AND sm.user_id = auth.uid()
          AND sm.status = 'active'
          AND sm.role_in_school = 'school_admin'
    ) OR public.is_superadmin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_school_admin_of(UUID) TO authenticated;

-- ============================================
-- PART 4: SCHOOL ADMIN MEMBER MANAGEMENT RPCs
-- ============================================

-- RPC: List members in school (admin-only)
CREATE OR REPLACE FUNCTION public.school_admin_list_members(p_search TEXT DEFAULT NULL)
RETURNS TABLE(
    user_id UUID,
    username TEXT,
    email TEXT,
    role_in_school TEXT,
    status TEXT,
    batch TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID := public.my_school_id();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'No school';
    END IF;

    IF NOT public.is_school_admin_of(v_school_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT
        sm.user_id,
        u.username,
        au.email::TEXT,
        sm.role_in_school,
        sm.status,
        u.batch
    FROM public.school_members sm
    JOIN public.users u ON u.id = sm.user_id
    LEFT JOIN auth.users au ON au.id = sm.user_id
    WHERE sm.school_id = v_school_id
      AND sm.status = 'active'
      AND (
        p_search IS NULL
        OR p_search = ''
        OR u.username ILIKE ('%'||p_search||'%')
        OR au.email ILIKE ('%'||p_search||'%')
      )
    ORDER BY sm.role_in_school DESC, u.username ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_members(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.school_admin_list_members(TEXT) TO authenticated;

-- RPC: Set member role (teacher/student) (admin-only)
CREATE OR REPLACE FUNCTION public.school_admin_set_member_role(
    p_member_user_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID := public.my_school_id();
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF v_school_id IS NULL OR NOT public.is_school_admin_of(v_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF p_new_role NOT IN ('student','teacher') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
    END IF;

    -- Update in school_members
    UPDATE public.school_members
    SET role_in_school = p_new_role
    WHERE school_id = v_school_id
      AND user_id = p_member_user_id
      AND status = 'active';

    -- Keep global users.role in sync (optional but useful for UI)
    UPDATE public.users
    SET role = p_new_role
    WHERE id = p_member_user_id
      AND role <> 'admin';

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_set_member_role(UUID,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.school_admin_set_member_role(UUID,TEXT) TO authenticated;

-- RPC: Move student to a class (admin-only)
CREATE OR REPLACE FUNCTION public.school_admin_move_student_to_class(
    p_student_id UUID,
    p_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID := public.my_school_id();
    v_class_code TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF v_school_id IS NULL OR NOT public.is_school_admin_of(v_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    -- Ensure class belongs to this school
    IF NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id
          AND c.school_id = v_school_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not in this school');
    END IF;

    -- Remove student from other classes in this school
    DELETE FROM public.class_students cs
    USING public.classes c
    WHERE cs.student_id = p_student_id
      AND cs.class_id = c.id
      AND c.school_id = v_school_id;

    -- Add to new class
    INSERT INTO public.class_students (class_id, student_id)
    VALUES (p_class_id, p_student_id)
    ON CONFLICT DO NOTHING;

    -- Get class code
    SELECT class_code INTO v_class_code
    FROM public.classes
    WHERE id = p_class_id;

    -- Keep users.batch in sync for display (optional but recommended)
    UPDATE public.users
    SET batch = v_class_code
    WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_move_student_to_class(UUID,UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.school_admin_move_student_to_class(UUID,UUID) TO authenticated;

-- ============================================
-- PART 5: TEACHER ASSIGNMENT RPC (MISSING!)
-- ============================================
-- This RPC was being called but never existed!

CREATE OR REPLACE FUNCTION public.admin_assign_teacher_to_class_subject(
    p_school_id UUID,
    p_class_id UUID,
    p_teacher_user_id UUID,
    p_subject TEXT,
    p_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_assignment_id UUID;
BEGIN
    -- Verify caller is school admin
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF NOT public.is_school_admin_of(p_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Not a school admin');
    END IF;

    -- Verify class belongs to school
    IF NOT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id
          AND school_id = p_school_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found in this school');
    END IF;

    -- Verify teacher is a member of the school
    IF NOT EXISTS (
        SELECT 1 FROM public.school_members
        WHERE school_id = p_school_id
          AND user_id = p_teacher_user_id
          AND status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher not a member of this school');
    END IF;

    -- Check if assignment already exists
    SELECT id INTO v_assignment_id
    FROM public.class_teacher_assignments
    WHERE school_id = p_school_id
      AND class_id = p_class_id
      AND teacher_user_id = p_teacher_user_id
      AND subject = p_subject;

    IF v_assignment_id IS NOT NULL THEN
        -- Update existing assignment
        UPDATE public.class_teacher_assignments
        SET active = p_active
        WHERE id = v_assignment_id;
    ELSE
        -- Create new assignment
        INSERT INTO public.class_teacher_assignments (
            school_id,
            class_id,
            teacher_user_id,
            subject,
            active
        ) VALUES (
            p_school_id,
            p_class_id,
            p_teacher_user_id,
            p_subject,
            p_active
        )
        RETURNING id INTO v_assignment_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_teacher_to_class_subject(UUID,UUID,UUID,TEXT,BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_assign_teacher_to_class_subject(UUID,UUID,UUID,TEXT,BOOLEAN) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- ✅ Created school_subjects table with RLS
-- ✅ Added school admin policies for classes table
-- ✅ Created helper functions: my_school_id(), is_school_admin_of()
-- ✅ Created school_admin_list_members() RPC
-- ✅ Created school_admin_set_member_role() RPC
-- ✅ Created school_admin_move_student_to_class() RPC
-- ✅ Created admin_assign_teacher_to_class_subject() RPC (was missing!)
-- ============================================
-- NEXT STEPS:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Update frontend SchoolAdminPortal to use school_subjects table
-- 3. Test all RPCs from frontend
-- 4. Add UI for subjects management
-- ============================================
