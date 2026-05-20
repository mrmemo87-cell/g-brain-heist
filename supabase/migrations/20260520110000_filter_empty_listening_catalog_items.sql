create or replace function public.rpc_ielts_practice_content_catalog(
  p_skill text default null,
  p_search text default null,
  p_limit int default 50
)
returns table (
  content_type text,
  content_id text,
  title text,
  skill text,
  description text,
  difficulty text,
  band text
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      lower(nullif(trim(p_skill), '')) as requested_skill,
      nullif(trim(p_search), '') as requested_search,
      greatest(1, least(coalesce(p_limit, 50), 100)) as requested_limit
  ), catalog as (
    select
      'ielts_reading_set'::text as content_type,
      r.id::text as content_id,
      coalesce(nullif(r.title, ''), r.slug, 'Reading set ' || r.id::text)::text as title,
      'reading'::text as skill,
      nullif(left(coalesce(r.description, ''), 240), '')::text as description,
      nullif(r.level, '')::text as difficulty,
      case
        when r.est_band_min is not null and r.est_band_max is not null then r.est_band_min::text || '-' || r.est_band_max::text
        when r.est_band_min is not null then r.est_band_min::text || '+'
        when r.est_band_max is not null then 'Up to ' || r.est_band_max::text
        else null
      end::text as band,
      r.created_at
    from public.ielts_reading_sets r
    where coalesce(r.is_active, true) = true

    union all

    select
      'ielts_listening_set'::text as content_type,
      l.id::text as content_id,
      coalesce(nullif(l.title, ''), l.slug, 'Listening set ' || l.id::text)::text as title,
      'listening'::text as skill,
      nullif(left(coalesce(l.description, ''), 240), '')::text as description,
      nullif(l.level, '')::text as difficulty,
      case
        when l.est_band_min is not null and l.est_band_max is not null then l.est_band_min::text || '-' || l.est_band_max::text
        when l.est_band_min is not null then l.est_band_min::text || '+'
        when l.est_band_max is not null then 'Up to ' || l.est_band_max::text
        else null
      end::text as band,
      l.created_at
    from public.ielts_listening_sets l
    where coalesce(l.is_active, true) = true
      and nullif(trim(coalesce(l.audio_url, '')), '') is not null
      and exists (
        select 1
        from public.ielts_listening_questions q
        where q.set_id = l.id
      )

    union all

    select
      'ielts_writing_task'::text as content_type,
      w.id::text as content_id,
      coalesce(nullif(w.title, ''), w.slug, 'Writing ' || coalesce(w.task_type, 'task') || ' ' || w.id::text)::text as title,
      'writing'::text as skill,
      nullif(left(coalesce(w.prompt, ''), 240), '')::text as description,
      nullif(w.task_type, '')::text as difficulty,
      nullif(w.bands_target, '')::text as band,
      w.created_at
    from public.ielts_writing_tasks w
    where coalesce(w.is_active, true) = true

    union all

    select
      'ielts_speaking_task'::text as content_type,
      s.id::text as content_id,
      coalesce(s.slug, 'Speaking part ' || s.part::text || ' task ' || s.id::text)::text as title,
      'speaking'::text as skill,
      nullif(left(coalesce(s.prompt, ''), 240), '')::text as description,
      ('part ' || s.part::text)::text as difficulty,
      null::text as band,
      s.created_at
    from public.ielts_speaking_tasks s
    where coalesce(s.is_active, true) = true
  )
  select
    c.content_type,
    c.content_id,
    c.title,
    c.skill,
    c.description,
    c.difficulty,
    c.band
  from catalog c
  cross join normalized n
  where (n.requested_skill is null or c.skill = n.requested_skill)
    and (n.requested_search is null or c.title ilike '%' || n.requested_search || '%')
  order by c.created_at desc nulls last, c.title asc
  limit (select requested_limit from normalized);
$$;

revoke execute on function public.rpc_ielts_practice_content_catalog(text, text, int) from public;
grant execute on function public.rpc_ielts_practice_content_catalog(text, text, int) to authenticated;

comment on function public.rpc_ielts_practice_content_catalog(text, text, int) is 'Public-safe IELTS practice content catalog for school assignment pickers. Returns active metadata only, excluding incomplete listening sets without audio/questions, and avoids solution fields or legacy admin checks.';
