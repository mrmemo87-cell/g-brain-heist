-- Fix IELTS speaking task title references in review queue/detail RPCs.
-- ielts_speaking_tasks does not have a title column; derive a safe label instead.

create or replace function public.ielts_review_attempt_payload(p_skill text, p_attempt_id text, p_for_student boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if p_skill = 'writing' and to_regclass('public.ielts_writing_attempts') is not null then
    select jsonb_build_object(
      'attempt_id', a.id::text,
      'skill', 'writing',
      'student_id', a.user_id,
      'submitted_at', a.submitted_at,
      'prompt', t.prompt,
      'task_title', t.title,
      'task_type', t.task_type,
      'student_answer', case when p_for_student then null else a.answer_text end,
      'word_count', a.word_count
    ) into v_payload
    from public.ielts_writing_attempts a
    left join public.ielts_writing_tasks t on t.id::text = a.task_id::text
    where a.id::text = p_attempt_id;
  elsif p_skill = 'speaking' and to_regclass('public.ielts_speaking_attempts') is not null then
    select jsonb_build_object(
      'attempt_id', a.id::text,
      'skill', 'speaking',
      'student_id', a.user_id,
      'submitted_at', a.submitted_at,
      'prompt', t.prompt,
      'task_title', coalesce('Speaking Part ' || t.part::text, nullif(left(coalesce(t.prompt, ''), 72), ''), 'Speaking Task'),
      'part', t.part,
      'transcript', case when p_for_student then null else coalesce(to_jsonb(a)->>'transcript', to_jsonb(a)->>'transcript_text') end,
      'audio_url', case when p_for_student then null else a.audio_url end,
      'duration_seconds', nullif(to_jsonb(a)->>'duration_seconds', '')::int
    ) into v_payload
    from public.ielts_speaking_attempts a
    left join public.ielts_speaking_tasks t on t.id::text = a.task_id::text
    where a.id::text = p_attempt_id;
  end if;
  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_review_queue(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_skill text default null,
  p_review_status text default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;

  v_school_id := p_school_id;
  if v_school_id is null and p_student_id is not null then
    select u.school_id into v_school_id from public.users u where u.id = p_student_id;
  end if;
  if v_school_id is null then
    select u.school_id into v_school_id from public.users u where u.id = v_actor_id;
  end if;
  if v_school_id is null then raise exception 'school_required'; end if;

  if not public.can_manage_ielts_practice_school(v_school_id) then
    raise exception 'forbidden';
  end if;

  create temporary table if not exists tmp_ielts_review_queue (
    skill text,
    attempt_id text,
    student_id uuid,
    student_name text,
    class_id uuid,
    class_name text,
    submitted_at timestamptz,
    review_id uuid,
    review_status text,
    overall_band numeric,
    reviewed_by uuid,
    reviewed_at timestamptz,
    prompt text,
    task_title text,
    word_count int,
    duration_seconds int
  ) on commit drop;
  truncate tmp_ielts_review_queue;

  if (p_skill is null or p_skill = 'writing') and to_regclass('public.ielts_writing_attempts') is not null then
    insert into tmp_ielts_review_queue
    select 'writing', a.id::text, u.id, coalesce(u.username, u.email), c.id, c.class_name, a.submitted_at,
      r.id, coalesce(r.review_status, coalesce(a.review_status, 'pending')), coalesce(r.overall_band, a.band_overall), coalesce(r.reviewed_by, a.reviewed_by), coalesce(r.reviewed_at, a.reviewed_at),
      t.prompt, t.title, a.word_count, null::int
    from public.ielts_writing_attempts a
    join public.users u on u.id = a.user_id and u.school_id = v_school_id
    left join public.class_students cs on cs.student_id = u.id
    left join public.classes c on c.id = cs.class_id and c.school_id = v_school_id
    left join public.ielts_writing_tasks t on t.id::text = a.task_id::text
    left join public.ielts_productive_skill_reviews r on r.attempt_type = 'writing' and r.attempt_id = a.id::text
    where (p_class_id is null or c.id = p_class_id)
      and (p_student_id is null or u.id = p_student_id)
      and public.can_review_ielts_productive_submission(v_school_id, c.id, u.id)
      and (p_review_status is null or coalesce(r.review_status, coalesce(a.review_status, 'pending')) = p_review_status);
  end if;

  if (p_skill is null or p_skill = 'speaking') and to_regclass('public.ielts_speaking_attempts') is not null then
    insert into tmp_ielts_review_queue
    select 'speaking', a.id::text, u.id, coalesce(u.username, u.email), c.id, c.class_name, a.submitted_at,
      r.id, coalesce(r.review_status, coalesce(a.review_status, 'pending')), coalesce(r.overall_band, a.band_overall), coalesce(r.reviewed_by, a.reviewed_by), coalesce(r.reviewed_at, a.reviewed_at),
      t.prompt,
      coalesce('Speaking Part ' || t.part::text, nullif(left(coalesce(t.prompt, ''), 72), ''), 'Speaking Task'),
      null::int, nullif(to_jsonb(a)->>'duration_seconds', '')::int
    from public.ielts_speaking_attempts a
    join public.users u on u.id = a.user_id and u.school_id = v_school_id
    left join public.class_students cs on cs.student_id = u.id
    left join public.classes c on c.id = cs.class_id and c.school_id = v_school_id
    left join public.ielts_speaking_tasks t on t.id::text = a.task_id::text
    left join public.ielts_productive_skill_reviews r on r.attempt_type = 'speaking' and r.attempt_id = a.id::text
    where (p_class_id is null or c.id = p_class_id)
      and (p_student_id is null or u.id = p_student_id)
      and public.can_review_ielts_productive_submission(v_school_id, c.id, u.id)
      and (p_review_status is null or coalesce(r.review_status, coalesce(a.review_status, 'pending')) = p_review_status);
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.submitted_at desc nulls last)
    from (select distinct on (skill, attempt_id) * from tmp_ielts_review_queue order by skill, attempt_id, class_name nulls last limit v_limit) q
  ), '[]'::jsonb);
end;
$$;
