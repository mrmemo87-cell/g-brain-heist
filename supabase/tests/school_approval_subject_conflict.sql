-- Run as postgres. All probe data is rolled back inside the exception block.
DO $probe$
DECLARE v_school uuid; v_subject uuid; v_count integer;
BEGIN
  BEGIN
    INSERT INTO public.schools(name,slug,invite_code,status)
    VALUES ('Approval regression probe','approval-regression-'||gen_random_uuid()::text,
      upper('T'||substr(replace(gen_random_uuid()::text,'-',''),1,9)),'active')
    RETURNING id INTO v_school;
    SELECT id INTO STRICT v_subject FROM public.school_subjects
      WHERE school_id=v_school AND is_active AND lower(trim(name))='travel & tourism';
    PERFORM public.ensure_school_subject(v_school,'  TRAVEL & TOURISM  ','OTHER');
    SELECT count(*) INTO v_count FROM public.school_subjects
      WHERE school_id=v_school AND is_active AND lower(trim(name))='travel & tourism';
    IF v_count <> 1 THEN RAISE EXCEPTION 'Subject seeding is not idempotent'; END IF;
    IF (SELECT code FROM public.school_subjects WHERE id=v_subject) IS DISTINCT FROM 'TRAVEL'
      THEN RAISE EXCEPTION 'Existing subject code was overwritten'; END IF;
    UPDATE public.school_subjects SET is_active=false WHERE id=v_subject;
    PERFORM public.ensure_school_subject(v_school,'Travel & Tourism','TRAVEL');
    IF (SELECT is_active FROM public.school_subjects WHERE id=v_subject) IS DISTINCT FROM false
      THEN RAISE EXCEPTION 'Archived subject was modified'; END IF;
    SELECT count(*) INTO v_count FROM public.school_subjects WHERE school_id=v_school AND is_active;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Replacement active subject missing'; END IF;
    RAISE SQLSTATE 'ZX001' USING MESSAGE='rollback regression probe';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  IF EXISTS(SELECT 1 FROM public.schools WHERE id=v_school) THEN
    RAISE EXCEPTION 'Regression probe was not rolled back';
  END IF;
END;
$probe$;
