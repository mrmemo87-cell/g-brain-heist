-- Fix for COALESCE type mismatch error
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.school_admin_move_student_to_class(
    p_student_id UUID,
    p_class_id UUID,
    p_grade SMALLINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID := public.my_school_id();
    v_class_code TEXT;
    v_grade_level INT;
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

    -- Get class code and grade level
    SELECT class_code, grade_level INTO v_class_code, v_grade_level
    FROM public.classes
    WHERE id = p_class_id;

    -- Update student's grade and batch
    -- Cast everything to TEXT to match users.grade column type
    UPDATE public.users
    SET 
        grade = COALESCE(p_grade::TEXT, v_grade_level::TEXT, grade),
        batch = v_class_code
    WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
