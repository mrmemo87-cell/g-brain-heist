-- Phase 1: make the school academic model the only source of student practice scope.
--
-- A school first creates its academic year, chooses a published framework version,
-- and offers subjects by grade. Required subjects are available to every student in
-- that grade; elective subjects additionally require an explicit student enrolment.
-- Student practice is read through a SECURITY DEFINER catalogue RPC so raw public
-- question policies can no longer bypass school, year, grade, or subject scope.

alter table public.school_curriculum_scope_mappings
  add column if not exists subject_requirement text not null default 'required'
    check (subject_requirement in ('required', 'elective'));

create index if not exists school_curriculum_scope_mappings_offering_idx
  on public.school_curriculum_scope_mappings(
    school_id, academic_year_id, grade_level, subject_requirement, status, academic_subject_id
  );

-- Preserve the legacy singular app label while resolving to the canonical subject.
insert into public.academic_subject_aliases(academic_subject_id, school_id, alias)
select a.id, null, 'Global Perspective'
from public.academic_subjects a where a.code = 'global-perspectives'
on conflict (alias_key) where school_id is null do update
set academic_subject_id = excluded.academic_subject_id, alias = excluded.alias;

create table if not exists public.student_subject_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid not null,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  starts_on date not null,
  ends_on date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete cascade,
  unique (student_id, academic_year_id, academic_subject_id),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists student_subject_enrolments_scope_idx
  on public.student_subject_enrolments(
    student_id, academic_year_id, status, academic_subject_id
  );
create index if not exists student_subject_enrolments_school_idx
  on public.student_subject_enrolments(
    school_id, academic_year_id, academic_subject_id, status
  );

alter table public.student_subject_enrolments enable row level security;
revoke all on table public.student_subject_enrolments from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.student_subject_enrolments to service_role;

create or replace function public.rpc_school_admin_academic_setup(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  return jsonb_build_object(
    'success', true,
    'schoolId', p_school_id,
    'years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id, 'name', y.name, 'startsOn', y.starts_on,
        'endsOn', y.ends_on, 'status', y.status
      ) order by y.starts_on desc)
      from public.school_academic_years y where y.school_id = p_school_id
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'academicYearId', t.academic_year_id, 'name', t.name,
        'sequence', t.sequence_number, 'startsOn', t.starts_on, 'endsOn', t.ends_on
      ) order by t.academic_year_id, t.sequence_number)
      from public.school_academic_terms t where t.school_id = p_school_id
    ), '[]'::jsonb),
    'frameworks', coalesce((
      select jsonb_agg(framework_row.payload order by framework_row.name)
      from (
        select f.name, jsonb_build_object(
          'id', f.id, 'code', f.code, 'name', f.name,
          'providerName', f.provider_name, 'authorityType', f.authority_type,
          'versionId', v.id, 'versionCode', v.version_code,
          'versionName', v.display_name, 'effectiveFrom', v.effective_from,
          'subjects', coalesce((
            select jsonb_agg(jsonb_build_object(
              'academicSubjectId', fs.academic_subject_id,
              'code', a.code, 'name', a.name,
              'category', case when a.code in ('english', 'mathematics', 'science')
                then 'core' else 'additional' end,
              'scopes', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'scopeId', sc.id, 'scopeCode', sc.code,
                  'scopeName', sc.name, 'stageCode', st.code,
                  'stageName', st.name, 'gradeLevel', st.sequence_number,
                  'objectiveCount', (select count(*) from public.curriculum_objectives o where o.curriculum_scope_id = sc.id),
                  'approvedQuestionCount', (
                    select count(distinct m.assessment_item_id)
                    from public.curriculum_item_objective_mappings m
                    join public.curriculum_assessment_items i on i.id = m.assessment_item_id and i.is_active
                    where m.curriculum_scope_id = sc.id
                      and m.status = 'approved'
                      and m.mapping_role = 'primary'
                      and m.item_content_hash = i.content_hash
                      and m.curriculum_version_content_hash = v.content_hash
                  )
                ) order by st.sequence_number)
                from public.curriculum_scopes sc
                join public.curriculum_stages st on st.id = sc.stage_id
                where sc.framework_subject_id = fs.id
              ), '[]'::jsonb)
            ) order by fs.sequence_number, a.name)
            from public.curriculum_framework_subjects fs
            join public.academic_subjects a on a.id = fs.academic_subject_id
            where fs.framework_version_id = v.id
          ), '[]'::jsonb)
        ) as payload
        from public.curriculum_frameworks f
        join public.curriculum_framework_versions v
          on v.framework_id = f.id and v.status = 'published'
        where f.is_active
          and (f.school_id is null or f.school_id = p_school_id)
      ) framework_row
    ), '[]'::jsonb),
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mappingId', m.id, 'academicYearId', m.academic_year_id,
        'gradeLevel', m.grade_level, 'academicSubjectId', m.academic_subject_id,
        'subjectName', a.name, 'scopeId', m.curriculum_scope_id,
        'subjectRequirement', m.subject_requirement, 'status', m.status,
        'mappingQuality', m.mapping_quality
      ) order by m.academic_year_id, m.grade_level, a.name)
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a on a.id = m.academic_subject_id
      where m.school_id = p_school_id and m.status in ('planned', 'active')
    ), '[]'::jsonb),
    'electiveEnrolments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', se.id, 'studentId', se.student_id,
        'academicYearId', se.academic_year_id,
        'academicSubjectId', se.academic_subject_id,
        'subjectName', a.name, 'status', se.status
      ) order by a.name, se.student_id)
      from public.student_subject_enrolments se
      join public.academic_subjects a on a.id = se.academic_subject_id
      where se.school_id = p_school_id and se.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_school_admin_academic_setup(uuid) from public, anon, authenticated;
grant execute on function public.rpc_school_admin_academic_setup(uuid) to authenticated, service_role;

create or replace function public.rpc_school_admin_apply_subject_offerings(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_offerings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_grade text;
  v_subject uuid;
  v_scope uuid;
  v_requirement text;
  v_saved integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if jsonb_typeof(coalesce(p_offerings, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('success', false, 'code', 'offerings_must_be_an_array');
  end if;
  if not exists (
    select 1 from public.school_academic_years y
    where y.id = p_academic_year_id and y.school_id = p_school_id
  ) then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;

  for v_item in select value from jsonb_array_elements(p_offerings)
  loop
    v_grade := nullif(trim(v_item->>'gradeLevel'), '');
    v_subject := nullif(v_item->>'academicSubjectId', '')::uuid;
    v_scope := nullif(v_item->>'scopeId', '')::uuid;
    v_requirement := coalesce(nullif(v_item->>'subjectRequirement', ''), 'required');
    if v_grade is null or v_grade !~ '^(?:[1-9]|1[0-2])$'
       or v_subject is null or v_scope is null
       or v_requirement not in ('required', 'elective') then
      raise exception using errcode = '22023', message = 'invalid_subject_offering';
    end if;
    if not exists (
      select 1
      from public.curriculum_scopes sc
      join public.curriculum_stages st on st.id = sc.stage_id
      join public.curriculum_framework_versions v on v.id = sc.framework_version_id
      where sc.id = v_scope and sc.academic_subject_id = v_subject
        and st.sequence_number::text = v_grade and v.status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'offering_scope_does_not_match_grade_subject';
    end if;

    insert into public.school_curriculum_scope_mappings(
      school_id, academic_year_id, grade_level, academic_subject_id,
      curriculum_scope_id, status, mapping_quality, subject_requirement,
      created_by, confirmed_by, confirmed_at
    ) values (
      p_school_id, p_academic_year_id, v_grade, v_subject,
      v_scope, 'active', 'confirmed', v_requirement,
      v_actor, v_actor, now()
    )
    on conflict (school_id, academic_year_id, grade_level, academic_subject_id)
      where status in ('planned', 'active')
    do update set
      curriculum_scope_id = excluded.curriculum_scope_id,
      status = 'active', mapping_quality = 'confirmed',
      subject_requirement = excluded.subject_requirement,
      confirmed_by = v_actor, confirmed_at = now(), updated_at = now();
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('success', true, 'saved', v_saved);
end;
$$;
revoke all on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_set_student_subject_enrolment(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_student_id uuid,
  p_academic_subject_id uuid,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_id uuid;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if p_status not in ('active', 'withdrawn') then
    return jsonb_build_object('success', false, 'code', 'invalid_enrolment_status');
  end if;
  select * into v_year from public.school_academic_years y
  where y.id = p_academic_year_id and y.school_id = p_school_id;
  if not found then return jsonb_build_object('success', false, 'code', 'academic_year_not_found'); end if;
  if not exists (
    select 1 from public.users u where u.id = p_student_id and u.school_id = p_school_id
  ) then return jsonb_build_object('success', false, 'code', 'student_not_in_school'); end if;
  if not exists (
    select 1 from public.school_curriculum_scope_mappings m
    join public.student_academic_enrolments e
      on e.school_id = m.school_id and e.academic_year_id = m.academic_year_id
      and e.student_id = p_student_id and e.grade_level = m.grade_level
    where m.school_id = p_school_id and m.academic_year_id = p_academic_year_id
      and m.academic_subject_id = p_academic_subject_id
      and m.subject_requirement = 'elective' and m.status = 'active'
  ) then return jsonb_build_object('success', false, 'code', 'elective_not_offered_to_student_grade'); end if;

  insert into public.student_subject_enrolments(
    school_id, student_id, academic_year_id, academic_subject_id,
    status, starts_on, ends_on, created_by
  ) values (
    p_school_id, p_student_id, p_academic_year_id, p_academic_subject_id,
    p_status, v_year.starts_on,
    case when p_status = 'withdrawn' then current_date else null end,
    v_actor
  )
  on conflict (student_id, academic_year_id, academic_subject_id)
  do update set status = excluded.status, ends_on = excluded.ends_on,
    created_by = v_actor, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'enrolmentId', v_id, 'status', p_status);
end;
$$;
revoke all on function public.rpc_school_admin_set_student_subject_enrolment(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_set_student_subject_enrolment(uuid, uuid, uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.rpc_student_academic_subjects(p_student_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_student uuid := coalesce(p_student_id, auth.uid());
  v_school uuid;
  v_year uuid;
  v_grade text;
begin
  if v_caller is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select u.school_id into v_school from public.users u where u.id = v_student;
  if v_school is null then return jsonb_build_object('success', true, 'ready', false, 'code', 'school_required', 'subjects', '[]'::jsonb); end if;
  if v_caller <> v_student and not (
    public.can_administer_school(v_school) or public.is_school_owner(v_school)
    or exists (
      select 1 from public.class_students cs
      join public.class_teacher_assignments cta on cta.class_id = cs.class_id and cta.active
      where cs.student_id = v_student and cta.teacher_user_id = v_caller and cta.school_id = v_school
    )
  ) then raise exception using errcode = '42501', message = 'student_academic_subject_access_denied'; end if;

  select e.academic_year_id, e.grade_level into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y on y.id = e.academic_year_id and y.status = 'current'
  where e.student_id = v_student and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc limit 1;
  if v_year is null or v_grade is null then
    return jsonb_build_object('success', true, 'ready', false, 'code', 'current_grade_enrolment_required', 'subjects', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true, 'ready', true, 'academicYearId', v_year, 'gradeLevel', v_grade,
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'code', a.code, 'name', a.name,
        'requirement', m.subject_requirement, 'scopeId', m.curriculum_scope_id,
        'approvedQuestionCount', (
          select count(distinct im.assessment_item_id)
          from public.curriculum_item_objective_mappings im
          join public.curriculum_assessment_items i on i.id = im.assessment_item_id and i.is_active
          join public.curriculum_framework_versions fv on fv.id = im.framework_version_id and fv.status = 'published'
          where im.curriculum_scope_id = m.curriculum_scope_id
            and im.status = 'approved' and im.mapping_role = 'primary'
            and im.item_content_hash = i.content_hash
            and im.curriculum_version_content_hash = fv.content_hash
        )
      ) order by a.name)
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a on a.id = m.academic_subject_id and a.is_active
      where m.school_id = v_school and m.academic_year_id = v_year
        and m.grade_level = v_grade and m.status = 'active'
        and (
          m.subject_requirement = 'required'
          or exists (
            select 1 from public.student_subject_enrolments se
            where se.student_id = v_student and se.academic_year_id = v_year
              and se.academic_subject_id = m.academic_subject_id and se.status = 'active'
              and current_date >= se.starts_on and (se.ends_on is null or current_date <= se.ends_on)
          )
        )
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_academic_subjects(uuid) from public, anon, authenticated;
grant execute on function public.rpc_student_academic_subjects(uuid) to authenticated, service_role;

create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_scope uuid;
  v_subject uuid;
begin
  if v_student is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select u.school_id into v_school from public.users u where u.id = v_student;
  if v_school is null then return jsonb_build_object('success', true, 'ready', false, 'code', 'school_required', 'questions', '[]'::jsonb); end if;

  select e.academic_year_id, e.grade_level into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y on y.id = e.academic_year_id and y.status = 'current'
  where e.student_id = v_student and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc limit 1;
  if v_year is null or v_grade is null then
    return jsonb_build_object('success', true, 'ready', false, 'code', 'current_grade_enrolment_required', 'questions', '[]'::jsonb);
  end if;

  select m.curriculum_scope_id, m.academic_subject_id into v_scope, v_subject
  from public.school_curriculum_scope_mappings m
  join public.academic_subjects a on a.id = m.academic_subject_id
  where m.school_id = v_school and m.academic_year_id = v_year
    and m.grade_level = v_grade and m.status = 'active'
    and (a.code = public.academic_normalize_subject_key(p_subject_code) or a.id::text = p_subject_code)
    and (
      m.subject_requirement = 'required'
      or exists (
        select 1 from public.student_subject_enrolments se
        where se.student_id = v_student and se.academic_year_id = v_year
          and se.academic_subject_id = m.academic_subject_id and se.status = 'active'
          and current_date >= se.starts_on and (se.ends_on is null or current_date <= se.ends_on)
      )
    )
  limit 1;
  if v_scope is null then
    return jsonb_build_object('success', true, 'ready', true, 'code', 'subject_not_enrolled', 'questions', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true, 'ready', true, 'academicYearId', v_year,
    'gradeLevel', v_grade, 'scopeId', v_scope,
    'questions', coalesce((
      select jsonb_agg(question_row.payload order by random())
      from (
        select jsonb_build_object(
          'id', q.id, 'teacher_id', q.teacher_id, 'subject', a.name,
          'subject_id', a.code, 'topic', q.topic, 'topic_name', q.topic_name,
          'difficulty', q.difficulty, 'question_text', q.question_text,
          'image_url', q.image_url, 'question_type', q.question_type,
          'options', q.options, 'correct_answer', q.correct_answer,
          'explanation', q.explanation, 'hints', to_jsonb(q.hints),
          'time_limit', q.time_limit, 'points', q.points, 'tags', to_jsonb(q.tags),
          'grade_level', v_grade, 'is_public', q.is_public, 'is_active', q.is_active,
          'times_answered', q.times_answered, 'times_correct', q.times_correct,
          'created_at', q.created_at, 'updated_at', q.updated_at,
          'curriculum', jsonb_build_object(
            'objectiveId', o.id, 'objectiveCode', o.code,
            'objective', o.statement, 'scopeId', im.curriculum_scope_id,
            'confidence', im.confidence_score, 'mappingRole', im.mapping_role
          )
        ) as payload
        from public.curriculum_item_objective_mappings im
        join public.curriculum_assessment_items i
          on i.id = im.assessment_item_id and i.is_active and i.source_type = 'question_bank'
        join public.questions q on q.id::text = i.source_record_id
          and q.is_active and q.is_public
        join public.curriculum_objectives o on o.id = im.curriculum_objective_id
        join public.curriculum_framework_versions fv
          on fv.id = im.framework_version_id and fv.status = 'published'
        join public.academic_subjects a on a.id = i.academic_subject_id
        where im.curriculum_scope_id = v_scope and im.academic_subject_id = v_subject
          and im.status = 'approved' and im.mapping_role = 'primary'
          and im.item_content_hash = i.content_hash
          and im.curriculum_version_content_hash = fv.content_hash
        order by random()
        limit greatest(1, least(coalesce(p_limit, 20), 500))
      ) question_row
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_learning_catalog(text, integer) from public, anon, authenticated;
grant execute on function public.rpc_student_learning_catalog(text, integer) to authenticated, service_role;

-- Students must use the scope-aware catalogue RPC. Assignment access and teacher
-- ownership policies remain available for their distinct workflows.
drop policy if exists "questions_read_all" on public.questions;
drop policy if exists "Public questions are viewable by everyone" on public.questions;

notify pgrst, 'reload schema';
