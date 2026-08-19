-- Recompile the formal Writing Hub student prompt RPC against the current
-- JSONB prompt-bank payload type. A stale runtime plan could otherwise treat
-- payload as text, fail on ->/->>, return no prompt id to the client, and leave
-- the formal response editor disabled.

create or replace function public.rpc_bh_writing_student_prompt(
  p_grade integer,
  p_genre text,
  p_current_prompt_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_grade integer;
  v_prompt jsonb;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  v_grade := public.bh_writing_authoritative_student_grade(v_student_id);
  if v_grade is null then
    raise exception 'An authoritative grade between 1 and 12 is required';
  end if;
  if p_grade is distinct from v_grade then
    raise exception 'Requested grade does not match the student record';
  end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  select jsonb_build_object(
    'prompt_id', (pb.payload::jsonb)->>'id',
    'prompt_text', (pb.payload::jsonb)->>'prompt_text',
    'title', (pb.payload::jsonb)->>'title',
    'genre', (pb.payload::jsonb)->>'genre',
    'difficulty_label', (pb.payload::jsonb)->>'difficulty_label',
    'minimum_word_count', ((pb.payload::jsonb)->>'minimum_word_count')::integer,
    'target_word_count', ((pb.payload::jsonb)->>'target_word_count')::integer,
    'maximum_word_count', ((pb.payload::jsonb)->>'maximum_word_count')::integer,
    'time_limit_seconds', ((pb.payload::jsonb)->>'time_limit_seconds')::integer,
    'syllabus_code', (pb.payload::jsonb)->>'syllabus_code',
    'syllabus_year', (pb.payload::jsonb)->>'syllabus_year',
    'framework_version', (pb.payload::jsonb)->>'framework_version',
    'rubric_version', (pb.payload::jsonb)->>'rubric_version',
    'task_rules', (pb.payload::jsonb)->'task_rules',
    'rubric_snapshot', (pb.payload::jsonb)->'rubric_snapshot',
    'focus_tags', (pb.payload::jsonb)->'focus_tags',
    'context_tags', (pb.payload::jsonb)->'context_tags',
    'curriculum_tags', (pb.payload::jsonb)->'curriculum_tags',
    'pool_size', 10
  )
  into v_prompt
  from public.bh_writing_prompt_bank pb
  where (pb.payload::jsonb)->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and ((pb.payload::jsonb)->>'grade')::integer = v_grade
    and (pb.payload::jsonb)->>'genre' = p_genre
    and coalesce(((pb.payload::jsonb)->>'is_active')::boolean, false)
    and (pb.payload::jsonb)->>'safety_status' = 'approved'
  order by
    case when (pb.payload::jsonb)->>'id' = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
    md5(v_student_id::text || current_date::text || (pb.payload::jsonb)->>'id')
  limit 1;

  return v_prompt;
end;
$$;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated, service_role;

comment on function public.rpc_bh_writing_student_prompt(integer, text, text) is
  'Returns an approved Cambridge Writing Hub prompt for the authenticated student authoritative grade. Recompiled with explicit JSONB payload access to avoid stale payload type plans.';
