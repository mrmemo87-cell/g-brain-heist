-- Restore the student-side Writing Hub database contract omitted from production.
-- This is intentionally limited to the three objects used directly by students:
-- durable attempt upserts, integrity mode lookup, and prompt rotation.

alter table public.bh_writing_attempts
  add column if not exists attempt_key text;

with ranked_attempt_keys as (
  select
    id,
    nullif(payload->>'id', '') as payload_attempt_key,
    row_number() over (
      partition by nullif(payload->>'id', '')
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.bh_writing_attempts
  where nullif(payload->>'id', '') is not null
)
update public.bh_writing_attempts attempts
set attempt_key = case
  when ranked.duplicate_rank = 1 then ranked.payload_attempt_key
  else null
end
from ranked_attempt_keys ranked
where ranked.id = attempts.id;

create unique index if not exists uq_bh_writing_attempts_attempt_key
  on public.bh_writing_attempts (attempt_key);

create table if not exists public.bh_writing_integrity_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  mode text not null default 'practice'
    check (mode in ('practice', 'independent', 'supervised')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id)
);

alter table public.bh_writing_integrity_settings enable row level security;
revoke all on table public.bh_writing_integrity_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.bh_writing_integrity_settings to service_role;

create or replace function public.rpc_bh_writing_student_integrity_mode()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_context jsonb;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'mode', coalesce(wis.mode, 'practice'),
    'class_id', c.id,
    'class_name', coalesce(nullif(c.class_name, ''), nullif(c.class_code, ''), 'Practice workspace')
  )
  into v_context
  from public.class_students cs
  join public.classes c
    on c.id = cs.class_id
   and coalesce(c.is_active, true) = true
  left join public.bh_writing_integrity_settings wis on wis.class_id = c.id
  where cs.student_id = v_student_id
  order by
    case coalesce(wis.mode, 'practice')
      when 'supervised' then 3
      when 'independent' then 2
      else 1
    end desc,
    c.created_at desc nulls last,
    c.id
  limit 1;

  return coalesce(
    v_context,
    jsonb_build_object(
      'mode', 'practice',
      'class_id', null,
      'class_name', 'Practice workspace'
    )
  );
end;
$$;

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

revoke all on function public.rpc_bh_writing_student_integrity_mode() from public, anon;
grant execute on function public.rpc_bh_writing_student_integrity_mode() to authenticated;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated;

comment on function public.rpc_bh_writing_student_integrity_mode()
  is 'Returns the authenticated student class Writing Hub integrity mode without exposing class settings.';

comment on function public.rpc_bh_writing_student_prompt(integer, text, text)
  is 'Returns a unique, approved, grade-safe writing task while avoiding the student current and recently completed prompt identities.';
