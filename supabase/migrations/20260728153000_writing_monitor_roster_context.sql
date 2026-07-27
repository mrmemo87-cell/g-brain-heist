-- Preserve the existing monitoring calculation and enrich every row with the
-- teacher-authorized live class roster. This migration is intentionally a
-- wrapper so it remains compatible with schools running either monitoring
-- implementation that preceded it.

do $$
begin
  if to_regprocedure('public.rpc_bh_writing_teacher_monitoring_base_20260728(text,integer,text)') is null
     and to_regprocedure('public.rpc_bh_writing_teacher_monitoring(text,integer,text)') is not null then
    alter function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
      rename to rpc_bh_writing_teacher_monitoring_base_20260728;
  end if;
end;
$$;

create or replace function public.rpc_bh_writing_teacher_monitoring(
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
  v_payload jsonb;
  v_rows jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  v_payload := public.rpc_bh_writing_teacher_monitoring_base_20260728(
    p_month,
    p_grade,
    p_genre
  );

  with source_rows as (
    select item.row_json, item.ordinality
    from jsonb_array_elements(coalesce(v_payload->'student_rows', '[]'::jsonb))
      with ordinality as item(row_json, ordinality)
  ),
  resolved as (
    select
      source_rows.ordinality,
      source_rows.row_json,
      class_pick.class_id,
      class_pick.class_name,
      class_pick.class_grade,
      class_pick.integrity_mode
    from source_rows
    left join lateral (
      select
        c.id as class_id,
        coalesce(
          nullif(trim(c.class_name), ''),
          nullif(trim(c.class_code), ''),
          'Class'
        ) as class_name,
        case
          when c.grade_level::text ~ '^[0-9]+$' then c.grade_level::text::integer
          else null
        end as class_grade,
        coalesce(wis.mode, 'practice') as integrity_mode
      from public.class_students cs
      join public.classes c
        on c.id = cs.class_id
       and coalesce(c.is_active, true) = true
      left join public.bh_writing_integrity_settings wis
        on wis.class_id = c.id
      where cs.student_id = (source_rows.row_json->>'student_id')::uuid
        and (
          exists (
            select 1
            from public.users actor
            where actor.id = (select auth.uid())
              and (
                coalesce(actor.is_admin, false) = true
                or actor.role in ('admin', 'super_admin')
                or (
                  actor.role = 'school_admin'
                  and actor.school_id = c.school_id
                )
              )
          )
          or exists (
            select 1
            from public.class_teacher_assignments cta
            where cta.class_id = c.id
              and cta.teacher_user_id = (select auth.uid())
              and coalesce(cta.active, true) = true
          )
        )
      order by
        case coalesce(wis.mode, 'practice')
          when 'supervised' then 3
          when 'independent' then 2
          else 1
        end desc,
        c.created_at desc nulls last,
        c.id
      limit 1
    ) class_pick on true
  )
  select coalesce(
    jsonb_agg(
      resolved.row_json
      || jsonb_build_object(
        'class_id',
        resolved.class_id,
        'class_name',
        resolved.class_name,
        'current_grade',
        coalesce(
          case
            when resolved.row_json->>'current_grade' ~ '^[0-9]+$'
              then (resolved.row_json->>'current_grade')::integer
            else null
          end,
          resolved.class_grade
        ),
        'integrity_mode',
        coalesce(
          resolved.integrity_mode,
          nullif(resolved.row_json->>'integrity_mode', ''),
          'practice'
        )
      )
      order by resolved.ordinality
    ),
    '[]'::jsonb
  )
  into v_rows
  from resolved;

  return jsonb_set(
    coalesce(v_payload, '{}'::jsonb),
    '{student_rows}',
    v_rows,
    true
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) from public;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) to authenticated;

comment on function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
  is 'Returns teacher-scoped writing monitoring enriched with the authorized live class roster.';
