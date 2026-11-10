-- Writing Hub: do not hand a student a task they have already written.
--
-- The rotation was a daily shuffle with no memory, so with ten tasks per grade and genre a student met repeats within
-- days. Tasks the student has already submitted (or had archived by the integrity rules) now sort after every task
-- they have not seen. When all ten are used, the one written longest ago comes back first.
-- The daily shuffle still decides the order among unseen tasks, and "New prompt" still never returns the current task
-- while another is available.

create index if not exists idx_bh_writing_attempts_student_prompt
  on public.bh_writing_attempts ((payload->>'student_id'), (payload->>'prompt_id'));

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
  v_payload jsonb;
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

  select pb.payload
  into v_payload
  from public.bh_writing_prompt_bank pb
  left join lateral (
    select max(seen.seen_at) as last_seen_at
    from (
      select a.created_at as seen_at
      from public.bh_writing_attempts a
      where a.payload->>'student_id' = v_student_id::text
        and a.payload->>'prompt_id' = (pb.payload->>'id')
      union all
      select v.created_at
      from public.bh_writing_voided_attempts v
      where v.student_id = v_student_id
        and v.prompt_id = (pb.payload->>'id')
    ) seen
  ) history on true
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and (pb.payload->>'grade')::integer = v_grade
    and pb.payload->>'genre' = p_genre
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved'
  order by
    case when (pb.payload->>'id') = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
    history.last_seen_at asc nulls first,
    md5(v_student_id::text || current_date::text || (pb.payload->>'id'))
  limit 1;

  if v_payload is null then
    return null;
  end if;

  return jsonb_build_object(
    'prompt_id', v_payload->>'id',
    'prompt_text', v_payload->>'prompt_text',
    'title', v_payload->>'title',
    'genre', v_payload->>'genre',
    'difficulty_label', v_payload->>'difficulty_label',
    'minimum_word_count', (v_payload->>'minimum_word_count')::integer,
    'target_word_count', (v_payload->>'target_word_count')::integer,
    'maximum_word_count', (v_payload->>'maximum_word_count')::integer,
    'time_limit_seconds', (v_payload->>'time_limit_seconds')::integer,
    'syllabus_code', v_payload->>'syllabus_code',
    'syllabus_year', v_payload->>'syllabus_year',
    'framework_version', v_payload->>'framework_version',
    'rubric_version', v_payload->>'rubric_version',
    'task_rules', v_payload->'task_rules',
    'rubric_snapshot', v_payload->'rubric_snapshot',
    'focus_tags', v_payload->'focus_tags',
    'context_tags', v_payload->'context_tags',
    'curriculum_tags', v_payload->'curriculum_tags',
    'pool_size', 10
  );
end;
$$;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated, service_role;

comment on function public.rpc_bh_writing_student_prompt(integer, text, text) is
  'Returns an approved Cambridge Writing Hub prompt for the authenticated student authoritative grade. Tasks the student has not written come first; among those the order is a per-student daily shuffle.';
