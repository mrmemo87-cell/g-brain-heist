-- Remove confirmed legacy bot-seed personas from the real school roster.
--
-- Safety boundaries:
--   * the school is resolved by its stable slug, never a generated UUID;
--   * only the exact historical seed emails are eligible;
--   * an Auth identity must not exist;
--   * the profile must currently be a student member of this school.
--
-- The public.users rows are retained because immutable placement-history rows
-- intentionally reference them. Only active school operations are removed.

do $$
declare
  v_school_id uuid;
  v_seed_student_ids uuid[];
begin
  select s.id
  into v_school_id
  from public.schools s
  where s.slug = 'silk-road-international'
  limit 1;

  if v_school_id is null then
    return;
  end if;

  select array_agg(u.id order by u.id)
  into v_seed_student_ids
  from public.users u
  join public.school_members sm
    on sm.user_id = u.id
   and sm.school_id = v_school_id
   and sm.role_in_school = 'student'
  left join auth.users au on au.id = u.id
  where au.id is null
    and u.email = any(array[
      'aigerim.sultanova@student.kg',
      'altynai.zakirova@student.kg',
      'azat.nazarov@student.kg',
      'bektur.mamytov@student.kg',
      'bermet.toktogulova@student.kg',
      'kanykei.sultanova@student.kg',
      'nursultan.abdykalykov@student.kg',
      'temirlan.askarov@student.kg',
      'ulan.kasybekov@student.kg'
    ]);

  if coalesce(cardinality(v_seed_student_ids), 0) = 0 then
    return;
  end if;

  delete from public.student_assignments sa
  using public.assignments a
  where sa.assignment_id = a.id
    and a.school_id = v_school_id
    and sa.student_id = any(v_seed_student_ids);

  delete from public.school_year_rollover_student_decisions d
  where d.school_id = v_school_id
    and d.student_id = any(v_seed_student_ids);

  delete from public.student_academic_enrolments e
  where e.school_id = v_school_id
    and e.student_id = any(v_seed_student_ids);

  delete from public.school_student_placement_exceptions e
  where e.school_id = v_school_id
    and e.student_user_id = any(v_seed_student_ids);

  delete from public.class_students cs
  using public.classes c
  where cs.class_id = c.id
    and c.school_id = v_school_id
    and cs.student_id = any(v_seed_student_ids);

  -- This delete is the source-of-truth removal. Existing sync triggers clear the
  -- legacy users.school_id mirror without weakening tenant or RLS protections.
  delete from public.school_members sm
  where sm.school_id = v_school_id
    and sm.user_id = any(v_seed_student_ids)
    and sm.role_in_school = 'student';
end;
$$;
