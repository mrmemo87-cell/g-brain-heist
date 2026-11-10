-- Writing Hub: keep every draft in the student's account, not only in one browser.
--
-- Drafts were saved in the browser's local storage, so a failed device, a cleared browser or a change of device lost
-- the work. The hub now saves the draft to the server every few seconds, with the time left and the number of tab
-- changes, and restores it on any device. The task picker returns a student to a task that still has a saved draft.
-- Teachers can see drafts in progress for classes in their English roster.
--
-- RLS is enabled with no policies; access is only through the security-definer functions below.

create table if not exists public.bh_writing_drafts (
  student_id uuid not null references public.users(id) on delete cascade,
  prompt_id text not null,
  genre text not null check (genre in ('email','article','review','story','essay','report','paragraph')),
  draft text not null check (char_length(draft) between 1 and 12000),
  remaining_seconds integer check (remaining_seconds is null or remaining_seconds between 0 and 14400),
  tab_change_count integer not null default 0 check (tab_change_count between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, prompt_id)
);

alter table public.bh_writing_drafts enable row level security;
revoke all on table public.bh_writing_drafts from public, anon, authenticated;
comment on table public.bh_writing_drafts is
  'Writing Hub drafts in progress, one per student and task. Accessed only through security-definer RPCs.';

-- Student: save (or, with empty text, clear) the draft for one task.
create or replace function public.rpc_bh_writing_save_draft(
  p_prompt_id text,
  p_genre text,
  p_draft text,
  p_remaining_seconds integer default null,
  p_tab_change_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_prompt_id text := nullif(trim(coalesce(p_prompt_id, '')), '');
begin
  if v_student_id is null then raise exception 'Not authenticated'; end if;
  if v_prompt_id is null or char_length(v_prompt_id) > 200 then raise exception 'A task is required to save a draft'; end if;

  if nullif(trim(coalesce(p_draft, '')), '') is null then
    delete from public.bh_writing_drafts where student_id = v_student_id and prompt_id = v_prompt_id;
    return jsonb_build_object('saved', false, 'cleared', true);
  end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;
  if char_length(p_draft) > 12000 then raise exception 'The draft is too long to save'; end if;

  insert into public.bh_writing_drafts(student_id, prompt_id, genre, draft, remaining_seconds, tab_change_count)
  values (
    v_student_id, v_prompt_id, p_genre, p_draft,
    case when p_remaining_seconds is null then null else least(greatest(p_remaining_seconds, 0), 14400) end,
    least(greatest(coalesce(p_tab_change_count, 0), 0), 1000)
  )
  on conflict (student_id, prompt_id) do update
  set genre = excluded.genre,
      draft = excluded.draft,
      remaining_seconds = excluded.remaining_seconds,
      -- A tab-change count never goes down, even if the browser lost its own count.
      tab_change_count = greatest(public.bh_writing_drafts.tab_change_count, excluded.tab_change_count),
      updated_at = now();

  return jsonb_build_object('saved', true, 'saved_at', now());
end;
$$;

revoke all on function public.rpc_bh_writing_save_draft(text, text, text, integer, integer) from public, anon;
grant execute on function public.rpc_bh_writing_save_draft(text, text, text, integer, integer) to authenticated, service_role;

-- Student: the saved draft for one task, if any.
create or replace function public.rpc_bh_writing_load_draft(p_prompt_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'draft', d.draft,
    'remaining_seconds', d.remaining_seconds,
    'tab_change_count', d.tab_change_count,
    'updated_at', d.updated_at
  )
  from public.bh_writing_drafts d
  where d.student_id = (select auth.uid())
    and d.prompt_id = nullif(trim(coalesce(p_prompt_id, '')), '');
$$;

revoke all on function public.rpc_bh_writing_load_draft(text) from public, anon;
grant execute on function public.rpc_bh_writing_load_draft(text) to authenticated, service_role;

-- Teacher: drafts in progress for one class in the teacher's English roster.
create or replace function public.rpc_bh_writing_class_drafts(p_scope_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.bh_writing_authorized_english_roster() r where r.scope_id = p_scope_id) then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', d.student_id,
    'student_name', coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student'),
    'prompt_id', d.prompt_id,
    'task_title', coalesce(pb.payload->>'title', d.prompt_id),
    'genre', d.genre,
    'draft', d.draft,
    'tab_change_count', d.tab_change_count,
    'updated_at', d.updated_at
  ) order by d.updated_at desc), '[]'::jsonb)
  into v_rows
  from (
    select distinct r.student_id
    from public.bh_writing_authorized_english_roster() r
    where r.scope_id = p_scope_id
  ) roster
  join public.bh_writing_drafts d on d.student_id = roster.student_id
  join public.users u on u.id = roster.student_id
  left join public.bh_writing_prompt_bank pb on pb.payload->>'id' = d.prompt_id;

  return jsonb_build_object('drafts', v_rows);
end;
$$;

revoke all on function public.rpc_bh_writing_class_drafts(uuid) from public, anon;
grant execute on function public.rpc_bh_writing_class_drafts(uuid) to authenticated, service_role;

-- The task picker: class task first, then a task with a saved draft, then tasks not yet written.
-- Tasks a school wrote for its own classes (owner_school_id) never enter the general rotation.
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
  v_assignment public.bh_writing_task_assignments;
  v_assignment_json jsonb := null;
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

  -- A task set by the teacher comes before the student's own choice of genre and the rotation.
  select * into v_assignment from private.bh_writing_open_task_assignment(v_student_id, v_grade);
  if v_assignment.id is not null then
    select pb.payload
    into v_payload
    from public.bh_writing_prompt_bank pb
    where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
      and pb.payload->>'id' = v_assignment.prompt_id
      and (pb.payload->>'grade')::integer = v_grade
      and coalesce((pb.payload->>'is_active')::boolean, false)
      and pb.payload->>'safety_status' = 'approved'
    limit 1;
    if v_payload is not null then
      v_assignment_json := jsonb_build_object(
        'assignment_id', v_assignment.id,
        'class_name', v_assignment.scope_name,
        'closes_at', v_assignment.closes_at
      );
    end if;
  end if;

  if v_payload is null then
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
    left join public.bh_writing_drafts saved
      on saved.student_id = v_student_id
     and saved.prompt_id = (pb.payload->>'id')
     and saved.updated_at > now() - interval '14 days'
    where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
      and (pb.payload->>'grade')::integer = v_grade
      and pb.payload->>'genre' = p_genre
      and coalesce((pb.payload->>'is_active')::boolean, false)
      and pb.payload->>'safety_status' = 'approved'
      and not (pb.payload ? 'owner_school_id')
    order by
      case when (pb.payload->>'id') = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
      case when saved.student_id is not null then 0 else 1 end,
      history.last_seen_at asc nulls first,
      md5(v_student_id::text || current_date::text || (pb.payload->>'id'))
    limit 1;
  end if;

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
    'pool_size', 10,
    'assignment', v_assignment_json
  );
end;
$$;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated, service_role;
