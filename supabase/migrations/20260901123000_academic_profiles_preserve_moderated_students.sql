-- Academic records must remain visible to authorised teachers even when a student's
-- operational account access is suspended or permanently banned.
--
-- Membership status is an access-control concern; it must not erase an enrolled
-- student's current class placement or historical academic record. Pending members
-- remain excluded because they are not yet active school participants.
--
-- Patch only the three year-aware Academic Profile read functions. The replacement
-- is guarded by the exact expected number of active-membership predicates so a
-- future function shape change fails closed instead of widening unrelated access.

do $migration$
declare
  v_target record;
  v_oid oid;
  v_def text;
  v_old constant text := 'sm.status = ''active''';
  v_new constant text := 'sm.status in (''active'', ''suspended'')';
  v_occurrences integer;
begin
  for v_target in
    select *
    from (values
      (
        'rpc_teacher_academic_profile_students_for_year'::text,
        'p_academic_year_id uuid'::text,
        2::integer
      ),
      (
        'rpc_student_academic_subjects_for_year'::text,
        'p_student_id uuid, p_academic_year_id uuid'::text,
        1::integer
      ),
      (
        'rpc_student_academic_profile_for_year'::text,
        'p_student_id uuid, p_subject text, p_academic_year_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone'::text,
        1::integer
      )
    ) as target(function_name, identity_arguments, expected_occurrences)
  loop
    select p.oid
      into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_target.function_name
      and pg_get_function_identity_arguments(p.oid) = v_target.identity_arguments;

    if v_oid is null then
      raise exception 'Academic Profile moderation visibility patch target not found: %(%)',
        v_target.function_name,
        v_target.identity_arguments;
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_occurrences := (
      length(v_def) - length(replace(v_def, v_old, ''))
    ) / length(v_old);

    -- Idempotent replay: if the old predicate is already gone and the new guarded
    -- predicate is present, this function has already been patched.
    if v_occurrences = 0 and position(v_new in v_def) > 0 then
      continue;
    end if;

    if v_occurrences <> v_target.expected_occurrences then
      raise exception
        'Academic Profile moderation visibility patch refused for %: expected % active-membership predicate(s), found %',
        v_target.function_name,
        v_target.expected_occurrences,
        v_occurrences;
    end if;

    execute replace(v_def, v_old, v_new);
  end loop;
end;
$migration$;

comment on function public.rpc_teacher_academic_profile_students_for_year(uuid) is
  'Authorised Academic Profile directory. Includes active and suspended enrolled students; pending members remain excluded.';

notify pgrst, 'reload schema';
