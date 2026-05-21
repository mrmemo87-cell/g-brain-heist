create or replace function public.rpc_ielts_content_upsert_listening_set(
  p_id bigint default null,
  p_title text default null,
  p_slug text default null,
  p_description text default null,
  p_level text default null,
  p_est_band_min numeric default null,
  p_est_band_max numeric default null,
  p_duration_minutes int default null,
  p_audio_url text default null,
  p_is_active boolean default false,
  p_instructions text default null,
  p_example_prompt text default null,
  p_example_answer text default null,
  p_section_label text default null,
  p_question_range_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id bigint;
  v_slug text;
  v_q_count int := 0;
begin
  select role into v_role from public.users where id = v_uid;
  if v_uid is null or coalesce(v_role, '') not in ('superadmin','admin','school_admin') then
    raise exception 'forbidden';
  end if;

  if nullif(trim(coalesce(p_title,'')), '') is null then raise exception 'title_required'; end if;
  if nullif(trim(coalesce(p_level,'')), '') is null then raise exception 'level_required'; end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then raise exception 'invalid_duration'; end if;

  v_slug := nullif(trim(coalesce(p_slug,'')), '');
  if v_slug is null then
    v_slug := regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'listening-task'; end if;
  end if;

  if p_id is null then
    insert into public.ielts_listening_sets (title, slug, description, level, est_band_min, est_band_max, duration_minutes, audio_url, is_active, instructions, example_prompt, example_answer, section_label, question_range_label, created_by)
    values (trim(p_title), v_slug, p_description, trim(p_level), p_est_band_min, p_est_band_max, p_duration_minutes, nullif(trim(coalesce(p_audio_url,'')), ''), coalesce(p_is_active,false), p_instructions, p_example_prompt, p_example_answer, p_section_label, p_question_range_label, v_uid)
    returning id into v_id;
  else
    update public.ielts_listening_sets
    set title = trim(p_title),
        slug = v_slug,
        description = p_description,
        level = trim(p_level),
        est_band_min = p_est_band_min,
        est_band_max = p_est_band_max,
        duration_minutes = p_duration_minutes,
        audio_url = nullif(trim(coalesce(p_audio_url,'')), ''),
        is_active = coalesce(p_is_active,false),
        instructions = p_instructions,
        example_prompt = p_example_prompt,
        example_answer = p_example_answer,
        section_label = p_section_label,
        question_range_label = p_question_range_label,
        updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'listening_set_not_found'; end if;
  end if;

  if coalesce(p_is_active,false) then
    select count(*) into v_q_count from public.ielts_listening_questions where listening_set_id = v_id;
    if nullif(trim(coalesce(p_audio_url,'')), '') is null then raise exception 'active_requires_audio'; end if;
    if v_q_count = 0 then raise exception 'active_requires_question'; end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end
$$;

create or replace function public.rpc_ielts_content_replace_listening_questions(
  p_listening_set_id bigint,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_question jsonb;
  v_order int;
  v_type text;
  v_body text;
  v_correct jsonb;
  v_options jsonb;
  v_explanation text;
  v_is_active boolean;
begin
  select role into v_role from public.users where id = v_uid;
  if v_uid is null or coalesce(v_role, '') not in ('superadmin','admin','school_admin') then raise exception 'forbidden'; end if;
  if p_listening_set_id is null then raise exception 'listening_set_required'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'questions_must_be_array'; end if;

  delete from public.ielts_listening_questions where listening_set_id = p_listening_set_id;

  for v_question in select value from jsonb_array_elements(p_questions)
  loop
    v_order := nullif(v_question->>'question_order','')::int;
    v_type := nullif(trim(coalesce(v_question->>'question_type','')), '');
    v_body := nullif(trim(coalesce(v_question->>'body','')), '');
    v_options := v_question->'options';
    v_correct := v_question->'correct_answer';
    v_explanation := nullif(trim(coalesce(v_question->>'explanation','')), '');

    if v_order is null then raise exception 'question_order_required'; end if;
    if v_body is null then raise exception 'question_body_required'; end if;
    if lower(v_body) like '%tbd%' or lower(v_body) like '%placeholder%' then raise exception 'question_body_placeholder_not_allowed'; end if;
    if v_correct is null or jsonb_typeof(v_correct) = 'null' then raise exception 'correct_answer_required'; end if;

    insert into public.ielts_listening_questions (listening_set_id, question_order, question_type, body, options, correct_answer, explanation)
    values (p_listening_set_id, v_order, coalesce(v_type, 'short_answer'), v_body, v_options, v_correct, v_explanation);
  end loop;

  if exists (
    select 1 from public.ielts_listening_questions where listening_set_id = p_listening_set_id group by question_order having count(*) > 1
  ) then raise exception 'duplicate_question_order'; end if;

  select is_active into v_is_active from public.ielts_listening_sets where id = p_listening_set_id;
  if coalesce(v_is_active,false) then
    if not exists(select 1 from public.ielts_listening_questions where listening_set_id = p_listening_set_id) then raise exception 'active_requires_question'; end if;
    if exists(select 1 from public.ielts_listening_questions where listening_set_id = p_listening_set_id and (nullif(trim(body),'') is null or correct_answer is null)) then raise exception 'active_question_invalid'; end if;
  end if;

  return jsonb_build_object('listening_set_id', p_listening_set_id, 'question_count', (select count(*) from public.ielts_listening_questions where listening_set_id = p_listening_set_id));
end
$$;

grant execute on function public.rpc_ielts_content_upsert_listening_set(bigint, text, text, text, text, numeric, numeric, int, text, boolean, text, text, text, text, text) to authenticated;
grant execute on function public.rpc_ielts_content_replace_listening_questions(bigint, jsonb) to authenticated;
