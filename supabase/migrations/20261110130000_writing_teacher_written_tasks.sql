-- Writing Hub: a teacher can write their own task for a class.
--
-- A teacher-written task is stored in the prompt bank as a copy of a standard task for the same grade and genre, so
-- it keeps that grade's word limits, timing, syllabus tags and marking criteria. Only the situation, the reader and
-- the required points come from the teacher. It carries owner_school_id, which keeps it out of the general rotation
-- (see rpc_bh_writing_student_prompt) and limits it to classes in the same school. Students only receive it when a
-- teacher sets it as a class task.
--
-- Bank tasks were approved in advance. A teacher-written task has no second check: the teacher who writes it for their
-- own class is responsible for it, and the row records who wrote it (created_by, safety_reviewed_by = 'teacher_author').

create or replace function public.rpc_bh_writing_create_class_task(
  p_scope_id uuid,
  p_genre text,
  p_title text,
  p_situation text,
  p_reader text,
  p_points text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school_id uuid;
  v_roster_count integer;
  v_grade integer;
  v_template jsonb;
  v_template_text text;
  v_marker integer;
  v_sentence_end integer;
  v_tail text;
  v_title text := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_situation text := regexp_replace(trim(coalesce(p_situation, '')), '\s+', ' ', 'g');
  v_reader text := regexp_replace(trim(coalesce(p_reader, '')), '\s+', ' ', 'g');
  v_points text[];
  v_points_sentence text;
  v_prompt_id text := 'custom-' || gen_random_uuid()::text;
  v_prompt_text text;
  v_payload jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  select (array_agg(r.school_id))[1], count(distinct r.student_id)::integer
  into v_school_id, v_roster_count
  from public.bh_writing_authorized_english_roster() r
  where r.scope_id = p_scope_id;
  if coalesce(v_roster_count, 0) = 0 or v_school_id is null then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  select array_agg(point order by ord)
  into v_points
  from (
    select regexp_replace(regexp_replace(trim(item), '\s+', ' ', 'g'), '[.;]+$', '') as point, ord
    from unnest(coalesce(p_points, array[]::text[])) with ordinality as t(item, ord)
  ) cleaned
  where char_length(point) > 0;

  v_situation := regexp_replace(v_situation, '[.!?]+$', '') || '.';
  v_reader := regexp_replace(v_reader, '[.!?]+$', '');
  if char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'Give the task a short name (3 to 60 characters)'; end if;
  if char_length(v_situation) < 20 or char_length(v_situation) > 600 then raise exception 'Describe the situation in 20 to 600 characters'; end if;
  if char_length(v_reader) < 3 or char_length(v_reader) > 80 then raise exception 'Say who the student is writing for (3 to 80 characters)'; end if;
  if coalesce(array_length(v_points, 1), 0) < 2 or array_length(v_points, 1) > 4 then
    raise exception 'List 2 to 4 points the student must cover';
  end if;
  if exists (select 1 from unnest(v_points) p where char_length(p) < 3 or char_length(p) > 120) then
    raise exception 'Each point must be 3 to 120 characters';
  end if;

  -- The grade students in this class are served tasks for (most common authoritative grade).
  select g.grade into v_grade
  from (
    select public.bh_writing_authoritative_student_grade(r.student_id) as grade, count(*) as n
    from (select distinct student_id from public.bh_writing_authorized_english_roster() where scope_id = p_scope_id) r
    group by 1
  ) g
  where g.grade is not null
  order by g.n desc, g.grade
  limit 1;
  if v_grade is null then raise exception 'No student in this class has a grade recorded'; end if;

  select pb.payload into v_template
  from public.bh_writing_prompt_bank pb
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and (pb.payload->>'grade')::integer = v_grade
    and pb.payload->>'genre' = p_genre
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved'
    and not (pb.payload ? 'owner_school_id')
  order by pb.payload->>'id'
  limit 1;
  if v_template is null then raise exception 'No standard task exists for this grade and genre to copy the marking rules from'; end if;

  -- Keep the standard closing instruction for the genre (everything after the required-points sentence).
  v_template_text := v_template->>'prompt_text';
  v_marker := position('Your response must:' in v_template_text);
  v_tail := '';
  if v_marker > 0 then
    v_sentence_end := position('. ' in substring(v_template_text from v_marker));
    if v_sentence_end > 0 then
      v_tail := trim(substring(v_template_text from v_marker + v_sentence_end + 1));
    end if;
  end if;

  v_points_sentence := case
    when array_length(v_points, 1) = 2 then v_points[1] || '; and ' || v_points[2]
    else array_to_string(v_points[1:array_length(v_points, 1) - 1], '; ') || '; and ' || v_points[array_length(v_points, 1)]
  end;
  v_prompt_text := trim(
    v_situation || ' Write for ' || v_reader || '. Your response must: ' || v_points_sentence || '.'
    || case when v_tail <> '' then ' ' || v_tail else '' end
  );

  v_payload := v_template
    || jsonb_build_object(
      'id', v_prompt_id,
      'title', format('Grade %s %s · %s', v_grade, initcap(p_genre), v_title),
      'prompt_text', v_prompt_text,
      'usage_count', 0,
      'owner_school_id', v_school_id,
      'created_by', v_actor,
      'created_for_scope_id', p_scope_id,
      'safety_reviewed_by', 'teacher_author',
      'task_rules', (v_template->'task_rules') || jsonb_build_object(
        'audience', v_reader,
        'required_content_points', to_jsonb(v_points)
      )
    );

  insert into public.bh_writing_prompt_bank(payload) values (v_payload);

  return jsonb_build_object(
    'prompt_id', v_prompt_id,
    'title', v_payload->>'title',
    'prompt_text', v_prompt_text,
    'target_word_count', (v_payload->>'target_word_count')::integer,
    'time_limit_minutes', ((v_payload->>'time_limit_seconds')::integer / 60),
    'custom', true
  );
end;
$$;

revoke all on function public.rpc_bh_writing_create_class_task(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function public.rpc_bh_writing_create_class_task(uuid, text, text, text, text, text[]) to authenticated, service_role;

-- Options now include the school's own tasks for this grade and genre, listed first.
create or replace function public.rpc_bh_writing_class_task_options(p_scope_id uuid, p_genre text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope_name text;
  v_school_id uuid;
  v_grade integer;
  v_student_count integer;
  v_tasks jsonb;
  v_current jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  select max(r.scope_name), (array_agg(r.school_id))[1], count(distinct r.student_id)::integer
  into v_scope_name, v_school_id, v_student_count
  from public.bh_writing_authorized_english_roster() r
  where r.scope_id = p_scope_id;
  if coalesce(v_student_count, 0) = 0 then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  select g.grade into v_grade
  from (
    select public.bh_writing_authoritative_student_grade(r.student_id) as grade, count(*) as n
    from (select distinct student_id from public.bh_writing_authorized_english_roster() where scope_id = p_scope_id) r
    group by 1
  ) g
  where g.grade is not null
  order by g.n desc, g.grade
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'prompt_id', pb.payload->>'id',
    'title', pb.payload->>'title',
    'prompt_text', pb.payload->>'prompt_text',
    'target_word_count', (pb.payload->>'target_word_count')::integer,
    'time_limit_minutes', ((pb.payload->>'time_limit_seconds')::integer / 60),
    'custom', (pb.payload ? 'owner_school_id')
  ) order by (pb.payload ? 'owner_school_id') desc, pb.created_at desc, pb.payload->>'id'), '[]'::jsonb)
  into v_tasks
  from public.bh_writing_prompt_bank pb
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and (pb.payload->>'grade')::integer = v_grade
    and pb.payload->>'genre' = p_genre
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved'
    and (not (pb.payload ? 'owner_school_id') or pb.payload->>'owner_school_id' = v_school_id::text);

  select jsonb_build_object(
    'assignment_id', a.id,
    'genre', a.genre,
    'prompt_id', a.prompt_id,
    'prompt_title', a.prompt_title,
    'opens_at', a.opens_at,
    'closes_at', a.closes_at,
    'student_count', (select count(*) from public.bh_writing_task_assignment_students s where s.assignment_id = a.id),
    'submitted_count', (
      select count(*)
      from public.bh_writing_task_assignment_students s
      where s.assignment_id = a.id
        and exists (
          select 1 from public.bh_writing_attempts t
          where t.payload->>'student_id' = s.student_id::text
            and t.payload->>'prompt_id' = a.prompt_id
            and t.created_at >= a.opens_at
        )
    )
  )
  into v_current
  from public.bh_writing_task_assignments a
  where a.scope_id = p_scope_id
    and a.cancelled_at is null
    and now() < a.closes_at
  order by a.created_at desc
  limit 1;

  return jsonb_build_object(
    'scope_id', p_scope_id,
    'class_name', v_scope_name,
    'grade', v_grade,
    'roster_student_count', v_student_count,
    'tasks', coalesce(v_tasks, '[]'::jsonb),
    'current', v_current
  );
end;
$$;

revoke all on function public.rpc_bh_writing_class_task_options(uuid, text) from public, anon;
grant execute on function public.rpc_bh_writing_class_task_options(uuid, text) to authenticated, service_role;

-- Setting a task: a school-written task can only be set for classes in the school that wrote it.
create or replace function public.rpc_bh_writing_assign_class_task(p_scope_id uuid, p_prompt_id text, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope_name text;
  v_school_id uuid;
  v_roster_count integer;
  v_prompt jsonb;
  v_grade integer;
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 60);
  v_assignment_id uuid;
  v_assigned integer;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select max(r.scope_name), (array_agg(r.school_id))[1], count(distinct r.student_id)::integer
  into v_scope_name, v_school_id, v_roster_count
  from public.bh_writing_authorized_english_roster() r
  where r.scope_id = p_scope_id;
  if coalesce(v_roster_count, 0) = 0 or v_school_id is null then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  select pb.payload into v_prompt
  from public.bh_writing_prompt_bank pb
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and pb.payload->>'id' = nullif(trim(p_prompt_id), '')
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved'
    and (not (pb.payload ? 'owner_school_id') or pb.payload->>'owner_school_id' = v_school_id::text)
  limit 1;
  if v_prompt is null then raise exception 'This task is not available for this class'; end if;
  v_grade := (v_prompt->>'grade')::integer;

  update public.bh_writing_task_assignments
  set cancelled_at = now()
  where scope_id = p_scope_id and cancelled_at is null and now() < closes_at;

  insert into public.bh_writing_task_assignments(
    school_id, scope_id, scope_name, assigned_by, grade, genre, prompt_id, prompt_title, closes_at
  ) values (
    v_school_id, p_scope_id, coalesce(v_scope_name, 'Class'), v_actor, v_grade, v_prompt->>'genre',
    v_prompt->>'id', coalesce(v_prompt->>'title', v_prompt->>'id'), now() + make_interval(days => v_days)
  ) returning id into v_assignment_id;

  insert into public.bh_writing_task_assignment_students(assignment_id, student_id)
  select v_assignment_id, r.student_id
  from (select distinct student_id from public.bh_writing_authorized_english_roster() where scope_id = p_scope_id) r
  where public.bh_writing_authoritative_student_grade(r.student_id) = v_grade;
  get diagnostics v_assigned = row_count;

  if v_assigned = 0 then
    raise exception 'No student in this class is recorded in Grade %, so the task was not set', v_grade;
  end if;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'student_count', v_assigned,
    'skipped_count', v_roster_count - v_assigned,
    'closes_at', now() + make_interval(days => v_days)
  );
end;
$$;

revoke all on function public.rpc_bh_writing_assign_class_task(uuid, text, integer) from public, anon;
grant execute on function public.rpc_bh_writing_assign_class_task(uuid, text, integer) to authenticated, service_role;
