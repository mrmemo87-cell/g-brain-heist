-- Count every persisted writing weakness occurrence, including repeated errors
-- within one submission, while preserving the existing teacher scope boundary.
create or replace function public.rpc_bh_writing_teacher_weakness_counts(
  p_month text default null,
  p_grade integer default null,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
  v_monitor jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  -- This RPC performs the same authorization and roster scoping as the main
  -- analytics endpoint, then limits counting to the returned students.
  v_monitor := public.rpc_bh_writing_teacher_monitoring(v_month, p_grade, v_genre);

  return (
    with authorized_students as (
      select *
      from jsonb_to_recordset(coalesce(v_monitor->'student_rows', '[]'::jsonb)) as r(
        student_id uuid,
        student_name text
      )
    ),
    attempts as (
      select
        s.student_id,
        coalesce(s.student_name, 'Student') as student_name,
        a.payload
      from public.bh_writing_attempts a
      join authorized_students s
        on s.student_id::text = coalesce(a.payload->>'student_id', a.payload->>'user_id')
      where to_char(a.created_at, 'YYYY-MM') = v_month
        and (v_genre is null or a.payload->>'genre' = v_genre)
        and (a.attempt_key is not null or nullif(a.payload->>'id', '') is null)
    ),
    counted as (
      select
        a.student_id,
        a.student_name,
        item.key as tag,
        greatest(1, case when jsonb_typeof(item.value) = 'number' then (item.value #>> '{}')::integer else 1 end) as occurrence_count
      from attempts a
      cross join lateral jsonb_each(
        case
          when jsonb_typeof(a.payload->'feedback_weakness_tag_counts') = 'object'
            then a.payload->'feedback_weakness_tag_counts'
          when jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') = 'object'
            then a.payload->'rich_feedback'->'weakness_tag_counts'
          else '{}'::jsonb
        end
      ) item

      union all

      select
        a.student_id,
        a.student_name,
        tag.value as tag,
        1 as occurrence_count
      from attempts a
      cross join lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(a.payload->'assessment'->'weakness_tags') = 'array'
            then a.payload->'assessment'->'weakness_tags'
          else '[]'::jsonb
        end
      ) tag(value)
      where jsonb_typeof(a.payload->'feedback_weakness_tag_counts') is distinct from 'object'
        and jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') is distinct from 'object'
    ),
    per_student as (
      select student_id, max(student_name) as student_name, tag, sum(occurrence_count)::integer as count
      from counted
      group by student_id, tag
    ),
    totals as (
      select tag, sum(count)::integer as count
      from per_student
      group by tag
    )
    select jsonb_build_object(
      'most_common_weakness_tags', coalesce((
        select jsonb_agg(jsonb_build_object('tag', tag, 'count', count) order by count desc, tag)
        from (select * from totals order by count desc, tag limit 12) ranked_totals
      ), '[]'::jsonb),
      'student_weakness_counts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'student_id', student_id,
            'student_name', student_name,
            'tags', tags
          ) order by student_name, student_id
        )
        from (
          select
            student_id,
            max(student_name) as student_name,
            jsonb_agg(jsonb_build_object('tag', tag, 'count', count) order by count desc, tag) as tags
          from per_student
          group by student_id
        ) students
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_weakness_counts(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_weakness_counts(text, integer, text) to authenticated;
