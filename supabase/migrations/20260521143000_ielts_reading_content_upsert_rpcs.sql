create or replace function public.rpc_ielts_content_upsert_reading_set(
  p_id bigint default null,
  p_title text default null,
  p_slug text default null,
  p_description text default null,
  p_level text default null,
  p_est_band_min numeric default null,
  p_est_band_max numeric default null,
  p_duration_minutes int default null,
  p_passage_text text default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_role text; v_id bigint; v_slug text; v_q_count int := 0;
begin
  select role into v_role from public.users where id=v_uid;
  if v_uid is null or coalesce(v_role,'') not in ('superadmin','admin','school_admin') then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'title_required'; end if;
  if nullif(trim(coalesce(p_level,'')),'') is null then raise exception 'level_required'; end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then raise exception 'invalid_duration'; end if;
  if nullif(trim(coalesce(p_passage_text,'')),'') is null then raise exception 'passage_text_required'; end if;
  v_slug := nullif(trim(coalesce(p_slug,'')), '');
  if v_slug is null then v_slug := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g')); if v_slug='' then v_slug:='reading-task'; end if; end if;

  if p_id is null then
    insert into public.ielts_reading_sets(title,slug,description,level,est_band_min,est_band_max,duration_minutes,passage_text,is_active,created_by)
    values(trim(p_title),v_slug,p_description,trim(p_level),p_est_band_min,p_est_band_max,p_duration_minutes,p_passage_text,coalesce(p_is_active,false),v_uid)
    returning id into v_id;
  else
    update public.ielts_reading_sets
    set title=trim(p_title),slug=v_slug,description=p_description,level=trim(p_level),est_band_min=p_est_band_min,est_band_max=p_est_band_max,duration_minutes=p_duration_minutes,passage_text=p_passage_text,is_active=coalesce(p_is_active,false)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'reading_set_not_found'; end if;
  end if;

  if coalesce(p_is_active,false) then
    select count(*) into v_q_count from public.ielts_reading_questions where set_id=v_id;
    if v_q_count=0 then raise exception 'active_requires_question'; end if;
  end if;

  return jsonb_build_object('id',v_id,'slug',v_slug);
end
$$;

create or replace function public.rpc_ielts_content_replace_reading_questions(
  p_reading_set_id bigint,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_uid uuid := auth.uid(); v_role text; vq jsonb; v_order int; v_type text; v_body text; v_options jsonb; v_correct jsonb; v_explanation text; v_active boolean;
begin
  select role into v_role from public.users where id=v_uid;
  if v_uid is null or coalesce(v_role,'') not in ('superadmin','admin','school_admin') then raise exception 'forbidden'; end if;
  if p_reading_set_id is null then raise exception 'reading_set_required'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'questions_must_be_array'; end if;

  delete from public.ielts_reading_questions where set_id=p_reading_set_id;
  for vq in select value from jsonb_array_elements(p_questions)
  loop
    v_order := nullif(vq->>'question_order','')::int;
    v_type := nullif(trim(coalesce(vq->>'question_type','')), '');
    v_body := nullif(trim(coalesce(vq->>'body','')), '');
    v_options := vq->'options';
    v_correct := vq->'correct_answer';
    v_explanation := nullif(trim(coalesce(vq->>'explanation','')), '');
    if v_order is null then raise exception 'question_order_required'; end if;
    if v_body is null then raise exception 'question_body_required'; end if;
    if lower(v_body) like '%tbd%' or lower(v_body) like '%placeholder%' then raise exception 'question_body_placeholder_not_allowed'; end if;
    if v_correct is null or jsonb_typeof(v_correct)='null' then raise exception 'correct_answer_required'; end if;
    insert into public.ielts_reading_questions(set_id,question_order,question_type,body,options,correct_answer,explanation)
    values(p_reading_set_id,v_order,coalesce(v_type,'short_answer'),v_body,v_options,v_correct,v_explanation);
  end loop;

  if exists(select 1 from public.ielts_reading_questions where set_id=p_reading_set_id group by question_order having count(*)>1) then raise exception 'duplicate_question_order'; end if;
  select is_active into v_active from public.ielts_reading_sets where id=p_reading_set_id;
  if coalesce(v_active,false) then
    if not exists(select 1 from public.ielts_reading_questions where set_id=p_reading_set_id) then raise exception 'active_requires_question'; end if;
    if exists(select 1 from public.ielts_reading_questions where set_id=p_reading_set_id and (nullif(trim(body),'') is null or correct_answer is null)) then raise exception 'active_question_invalid'; end if;
  end if;

  return jsonb_build_object('set_id',p_reading_set_id,'question_count',(select count(*) from public.ielts_reading_questions where set_id=p_reading_set_id));
end
$$;

grant execute on function public.rpc_ielts_content_upsert_reading_set(bigint,text,text,text,text,numeric,numeric,int,text,boolean) to authenticated;
grant execute on function public.rpc_ielts_content_replace_reading_questions(bigint,jsonb) to authenticated;
