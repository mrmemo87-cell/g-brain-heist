-- Writing prompt rotation integrity
-- - remove duplicate prompt-bank payload identities
-- - prevent duplicate identities from returning
-- - rotate by stable prompt id, not AI-reworded prompt text
-- - prefer an adjacent safe difficulty over immediately repeating the same task

with ranked_prompt_rows as (
  select
    id,
    row_number() over (
      partition by payload->>'id'
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.bh_writing_prompt_bank
  where nullif(trim(payload->>'id'), '') is not null
)
delete from public.bh_writing_prompt_bank prompt_bank
using ranked_prompt_rows ranked
where prompt_bank.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists bh_writing_prompt_bank_payload_id_unique
  on public.bh_writing_prompt_bank ((payload->>'id'))
  where nullif(trim(payload->>'id'), '') is not null;

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
  v_prompt jsonb;
  v_target_difficulty text;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_grade is null or p_grade < 6 or p_grade > 12 then
    raise exception 'Grade must be between 6 and 12';
  end if;
  if p_genre not in ('email', 'article', 'review', 'story', 'essay', 'report', 'paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  v_target_difficulty := case
    when p_grade <= 7 then 'foundational'
    when p_grade <= 10 then 'core'
    else 'stretch'
  end;

  with recent_attempts as (
    select
      nullif(a.payload->>'prompt_id', '') as prompt_id,
      row_number() over (order by a.created_at desc, a.id desc) as recent_rank
    from public.bh_writing_attempts a
    where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_student_id::text
      and a.payload->>'genre' = p_genre
      and nullif(a.payload->>'prompt_id', '') is not null
    order by a.created_at desc, a.id desc
    limit 5
  ),
  eligible_raw as (
    select
      pb.id,
      pb.created_at,
      pb.payload,
      coalesce(nullif(pb.payload->>'id', ''), pb.id::text) as prompt_id
    from public.bh_writing_prompt_bank pb
    where coalesce((pb.payload->>'is_active')::boolean, false) = true
      and coalesce((pb.payload->>'is_archived')::boolean, false) = false
      and pb.payload->>'safety_status' = 'approved'
      and coalesce(pb.payload->>'prompt_quality_flag', 'ok') = 'ok'
      and pb.payload->>'genre' = p_genre
      and split_part(pb.payload->>'grade_band', '-', 1) ~ '^[0-9]+$'
      and split_part(pb.payload->>'grade_band', '-', 2) ~ '^[0-9]+$'
      and p_grade between split_part(pb.payload->>'grade_band', '-', 1)::integer
                      and split_part(pb.payload->>'grade_band', '-', 2)::integer
  ),
  eligible as (
    select distinct on (prompt_id)
      payload,
      prompt_id,
      (
        select count(*)::integer
        from public.bh_writing_attempts attempt
        where coalesce(attempt.payload->>'student_id', attempt.payload->>'user_id') = v_student_id::text
          and attempt.payload->>'prompt_id' = eligible_raw.prompt_id
      ) as student_usage,
      (
        select min(recent.recent_rank)::integer
        from recent_attempts recent
        where recent.prompt_id = eligible_raw.prompt_id
      ) as recent_rank
    from eligible_raw
    order by prompt_id, created_at asc, id asc
  ),
  counted as (
    select *, count(*) over ()::integer as pool_size
    from eligible
  )
  select jsonb_build_object(
    'prompt_id', candidate.prompt_id,
    'prompt_text', candidate.payload->>'prompt_text',
    'title', candidate.payload->>'title',
    'genre', candidate.payload->>'genre',
    'difficulty_label', coalesce(candidate.payload->>'difficulty_label', 'core'),
    'target_word_count', coalesce(
      (candidate.payload->>'target_word_count')::integer,
      case when p_grade <= 7 then 80 when p_grade <= 9 then 120 else 160 end
    ),
    'focus_tags', coalesce(candidate.payload->'focus_tags', '[]'::jsonb),
    'context_tags', coalesce(candidate.payload->'context_tags', '[]'::jsonb),
    'curriculum_tags', coalesce(candidate.payload->'curriculum_tags', '[]'::jsonb),
    'pool_size', candidate.pool_size
  )
  into v_prompt
  from counted candidate
  order by
    case when candidate.prompt_id = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
    case when candidate.recent_rank is null then 0 else 1 end,
    candidate.recent_rank desc nulls first,
    case when coalesce(candidate.payload->>'difficulty_label', 'core') = v_target_difficulty then 0 else 1 end,
    candidate.student_usage,
    coalesce((candidate.payload->>'usage_count')::integer, 0),
    md5(v_student_id::text || current_date::text || candidate.prompt_id)
  limit 1;

  return v_prompt;
end;
$$;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated;

comment on function public.rpc_bh_writing_student_prompt(integer, text, text)
  is 'Returns a unique, approved, grade-safe writing task while avoiding the student''s current and recently completed prompt identities.';
