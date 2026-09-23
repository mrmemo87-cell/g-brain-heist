
create or replace function public.bh_writing_authorized_english_roster()
returns table(scope_id uuid,scope_name text,current_grade integer,school_id uuid,student_id uuid)
language sql
stable
security definer
set search_path=''
as $function$
  with actor as (
    select u.id,u.role,coalesce(u.is_admin,false) is_admin,u.school_id
    from public.users u where u.id=auth.uid()
  ),
  teacher_rows as (
    select distinct
      r.group_id,
      r.group_name,
      case when r.grade_level~'^[0-9]+$' then r.grade_level::integer else null end,
      r.school_id,
      r.student_id
    from actor a
    cross join lateral private.teacher_current_teaching_roster(a.id,a.school_id) r
    where a.role='teacher'
      and private.actor_has_programme_access('writing',true)
      and (
        lower(coalesce(r.academic_subject_code,''))='english'
        or lower(coalesce(r.academic_subject_name,''))='english'
        or lower(trim(r.school_subject_name)) like 'english%'
        or lower(trim(r.school_subject_name))='esl'
      )
  ),
  admin_rows as (
    select distinct
      c.id,
      coalesce(nullif(trim(c.class_name),''),nullif(trim(c.class_code),''),'Class'),
      case when c.grade_level::text~'^[0-9]+$' then c.grade_level::text::integer else null end,
      c.school_id,
      cs.student_id
    from actor a
    join public.classes c
      on coalesce(c.is_active,true)
     and (
       ((a.is_admin or a.role in ('admin','super_admin')) and public.is_superadmin(a.id))
       or (a.role='school_admin' and a.school_id=c.school_id)
     )
    join public.class_students cs on cs.class_id=c.id
    join public.school_members sm
      on sm.school_id=c.school_id
     and sm.user_id=cs.student_id
     and sm.status in ('active','suspended')
     and sm.role_in_school='student'
    where private.actor_has_programme_access('writing',true)
  )
  select * from teacher_rows
  union all
  select * from admin_rows;
$function$;

revoke all on function public.bh_writing_authorized_english_roster()
from public,anon,authenticated,service_role;
grant execute on function public.bh_writing_authorized_english_roster()
to authenticated,service_role;

create or replace function public.bh_writing_authorized_english_classes()
returns table(class_id uuid,class_name text,current_grade integer,school_id uuid)
language sql
stable
security definer
set search_path=''
as $function$
  select distinct r.scope_id,r.scope_name,r.current_grade,r.school_id
  from public.bh_writing_authorized_english_roster() r
  where private.actor_has_programme_access('writing',true)
  order by 2,1;
$function$;

revoke all on function public.bh_writing_authorized_english_classes()
from public,anon,authenticated,service_role;
grant execute on function public.bh_writing_authorized_english_classes()
to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_bh_writing_teacher_monitoring_legacy_v1(p_month text DEFAULT NULL::text, p_grade integer DEFAULT NULL::integer, p_genre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(lower(trim(p_genre)), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid reporting month';
  end if;

  return (
    with authorized_roster as (
      select * from public.bh_writing_authorized_english_roster()
    ),
    authorized_classes as (
      select distinct
        ar.scope_id as class_id,
        ar.scope_name as class_name,
        ar.current_grade,
        ar.school_id
      from authorized_roster ar
    ),
    roster_memberships as (
      select
        ar.scope_id as class_id,
        ar.scope_name as class_name,
        ar.current_grade as class_grade,
        ar.student_id,
        coalesce(
          nullif(trim(u.full_name), ''),
          nullif(trim(u.username), ''),
          nullif(split_part(u.email, '@', 1), ''),
          'Student'
        ) as student_name,
        coalesce(
          case when sp.profile->>'grade' ~ '^[0-9]+$' then (sp.profile->>'grade')::integer end,
          ar.current_grade,
          case when u.grade::text ~ '^[0-9]+$' then u.grade::text::integer end,
          0
        ) as current_grade
      from authorized_roster ar
      join public.users u on u.id = ar.student_id and u.role = 'student'
      left join public.bh_writing_student_profiles sp on sp.student_id = ar.student_id
    ),
    roster as (
      select distinct on (rm.student_id)
        rm.class_id,
        rm.class_name,
        rm.student_id,
        rm.student_name,
        rm.current_grade
      from roster_memberships rm
      where p_grade is null or rm.current_grade = p_grade
      order by rm.student_id, rm.class_name, rm.class_id
    ),
    attempt_source as (
      select
        a.id,
        r.student_id,
        r.class_id,
        a.payload,
        a.created_at,
        lower(coalesce(nullif(a.payload->>'genre', ''), 'writing')) as genre,
        case when a.payload #>> '{assessment,total_score}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,total_score}')::numeric end as total_score,
        case when a.payload #>> '{assessment,subscores,content}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,content}')::numeric end as content_score,
        case when a.payload #>> '{assessment,subscores,communicative_achievement}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,communicative_achievement}')::numeric end as communicative_score,
        case when coalesce(a.payload #>> '{assessment,subscores,organisation}', a.payload #>> '{assessment,subscores,organization}') ~ '^-?\d+(\.\d+)?$'
          then coalesce(a.payload #>> '{assessment,subscores,organisation}', a.payload #>> '{assessment,subscores,organization}')::numeric end as organisation_score,
        case when a.payload #>> '{assessment,subscores,language}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,language}')::numeric end as language_score
      from public.bh_writing_attempts a
      join roster r
        on r.student_id::text = coalesce(a.payload->>'student_id', a.payload->>'user_id')
      where coalesce(a.payload->>'student_id', a.payload->>'user_id', '')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (v_genre is null or lower(a.payload->>'genre') = v_genre)
    ),
    ranked_attempts as (
      select
        a.*,
        row_number() over (partition by a.student_id order by a.created_at desc, a.id desc) as latest_rank,
        row_number() over (partition by a.student_id order by a.created_at, a.id) as first_rank
      from attempt_source a
    ),
    attempt_stats as (
      select
        a.student_id,
        count(*)::integer as all_time_submission_count,
        count(*) filter (where to_char(a.created_at, 'YYYY-MM') = v_month)::integer as submission_count,
        count(*) filter (
          where to_char(a.created_at, 'YYYY-MM') = v_month
            and coalesce(a.payload->>'attempt_type', '') = 'initial_assessment'
        )::integer as baseline_submission_count,
        max(a.total_score) filter (where a.latest_rank = 1) as latest_score,
        max(a.total_score) filter (where a.first_rank = 1) as first_score,
        max(a.content_score) filter (where a.latest_rank = 1) as latest_content,
        max(a.content_score) filter (where a.first_rank = 1) as first_content,
        max(a.communicative_score) filter (where a.latest_rank = 1) as latest_communicative,
        max(a.communicative_score) filter (where a.first_rank = 1) as first_communicative,
        max(a.organisation_score) filter (where a.latest_rank = 1) as latest_organisation,
        max(a.organisation_score) filter (where a.first_rank = 1) as first_organisation,
        max(a.language_score) filter (where a.latest_rank = 1) as latest_language,
        max(a.language_score) filter (where a.first_rank = 1) as first_language,
        max(a.created_at) as latest_attempt_at,
        (array_agg(a.payload order by a.created_at desc, a.id desc))[1] as latest_payload
      from ranked_attempts a
      group by a.student_id
    ),
    counted_focus as (
      select
        a.student_id,
        entry.key as tag,
        greatest(
          1,
          case when entry.value #>> '{}' ~ '^\d+$' then (entry.value #>> '{}')::integer else 1 end
        ) as occurrence_count
      from attempt_source a
      cross join lateral jsonb_each(
        case
          when jsonb_typeof(a.payload->'feedback_weakness_tag_counts') = 'object'
            then a.payload->'feedback_weakness_tag_counts'
          when jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') = 'object'
            then a.payload->'rich_feedback'->'weakness_tag_counts'
          else '{}'::jsonb
        end
      ) entry

      union all

      select
        a.student_id,
        tag.value as tag,
        1 as occurrence_count
      from attempt_source a
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
    focus_totals as (
      select student_id, tag, sum(occurrence_count)::integer as count
      from counted_focus
      where nullif(trim(tag), '') is not null
      group by student_id, tag
    ),
    student_rows as (
      select
        r.*,
        coalesce(s.all_time_submission_count, 0) as all_time_submission_count,
        coalesce(s.submission_count, 0) as submission_count,
        coalesce(s.baseline_submission_count, 0) as baseline_submission_count,
        s.latest_score,
        s.first_score,
        s.latest_content,
        s.first_content,
        s.latest_communicative,
        s.first_communicative,
        s.latest_organisation,
        s.first_organisation,
        s.latest_language,
        s.first_language,
        s.latest_attempt_at,
        s.latest_payload,
        coalesce(f.focus_area_counts, '[]'::jsonb) as focus_area_counts,
        coalesce(f.focus_tags, '[]'::jsonb) as focus_tags
      from roster r
      left join attempt_stats s on s.student_id = r.student_id
      left join lateral (
        select
          jsonb_agg(jsonb_build_object('tag', ranked.tag, 'count', ranked.count) order by ranked.count desc, ranked.tag) as focus_area_counts,
          jsonb_agg(to_jsonb(ranked.tag) order by ranked.count desc, ranked.tag) as focus_tags
        from (
          select ft.tag, ft.count
          from focus_totals ft
          where ft.student_id = r.student_id
          order by ft.count desc, ft.tag
          limit 8
        ) ranked
      ) f on true
    ),
    class_rows as (
      select
        ac.class_id,
        ac.class_name,
        ac.current_grade,
        count(distinct rm.student_id)::integer as student_count,
        coalesce(sum(sr.submission_count), 0)::integer as submission_count,
        coalesce(sum(sr.all_time_submission_count), 0)::integer as all_time_submission_count
      from authorized_classes ac
      left join roster_memberships rm on rm.class_id = ac.class_id
      left join student_rows sr on sr.student_id = rm.student_id and sr.class_id = ac.class_id
      where p_grade is null or ac.current_grade = p_grade
      group by ac.class_id, ac.class_name, ac.current_grade
    ),
    global_focus as (
      select tag, sum(count)::integer as count
      from focus_totals
      group by tag
    )
    select jsonb_build_object(
      'period', v_month,
      'class_rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'class_id', cr.class_id,
          'class_name', cr.class_name,
          'current_grade', cr.current_grade,
          'student_count', cr.student_count,
          'submission_count', cr.submission_count,
          'all_time_submission_count', cr.all_time_submission_count
        ) order by cr.class_name, cr.class_id)
        from class_rows cr
      ), '[]'::jsonb),
      'student_rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'student_name', sr.student_name,
          'student_id', sr.student_id,
          'current_grade', sr.current_grade,
          'class_id', sr.class_id,
          'class_name', sr.class_name,
          'completion_rate', 0,
          'latest_score', sr.latest_score,
          'latest_subscale_scores', jsonb_build_object(
            'content', sr.latest_content,
            'communicative_achievement', sr.latest_communicative,
            'organisation', sr.latest_organisation,
            'language', sr.latest_language
          ),
          'subscale_trend', jsonb_build_object(
            'content', coalesce(sr.latest_content - sr.first_content, 0),
            'communicative_achievement', coalesce(sr.latest_communicative - sr.first_communicative, 0),
            'organisation', coalesce(sr.latest_organisation - sr.first_organisation, 0),
            'language', coalesce(sr.latest_language - sr.first_language, 0)
          ),
          'repeated_weakness_hotspots', sr.focus_tags,
          'focus_area_counts', sr.focus_area_counts,
          'weekly_target_summary', case
            when jsonb_array_length(sr.focus_area_counts) > 0
              then 'Prioritize ' || replace(sr.focus_area_counts->0->>'tag', '_', ' ')
            else 'Build enough writing evidence to identify a focus area'
          end,
          'stalled', sr.all_time_submission_count >= 2 and coalesce(sr.latest_score - sr.first_score, 0) <= 0,
          'improving', sr.all_time_submission_count >= 2 and coalesce(sr.latest_score - sr.first_score, 0) > 0,
          'ready_for_monthly_review', sr.submission_count >= 2,
          'attempts_count', sr.all_time_submission_count,
          'submission_count', sr.submission_count,
          'all_time_submission_count', sr.all_time_submission_count,
          'baseline_submission_count', sr.baseline_submission_count,
          'practice_assigned_count', 0,
          'practice_completed_count', 0,
          'practice_completion_rate', 0,
          'status', case
            when sr.all_time_submission_count = 0 then 'not_started'
            when coalesce(sr.latest_payload->'integrity'->>'review_status', sr.latest_payload->'integrity_signals'->>'review_status') = 'review_recommended' then 'needs_review'
            when sr.all_time_submission_count >= 2 and coalesce(sr.latest_score - sr.first_score, 0) > 0 then 'improving'
            when sr.latest_score is not null and sr.latest_score < 14 then 'needs_support'
            else 'on_track'
          end,
          'status_reason', case
            when sr.all_time_submission_count = 0 then 'No writing has been submitted yet.'
            when sr.all_time_submission_count = 1 then 'A baseline is available; another comparable submission will show progress.'
            when coalesce(sr.latest_score - sr.first_score, 0) > 0 then 'The latest comparable writing evidence has improved.'
            when sr.latest_score is not null and sr.latest_score < 14 then 'The latest writing evidence shows focus areas that need teacher support.'
            else 'The current writing evidence is stable.'
          end,
          'latest_attempt_at', sr.latest_attempt_at,
          'latest_integrity_signals', coalesce(sr.latest_payload->'integrity_signals', sr.latest_payload->'integrity', 'null'::jsonb)
        ) order by sr.class_name, sr.student_name, sr.student_id)
        from student_rows sr
      ), '[]'::jsonb),
      'hotspot_tags', coalesce((
        select jsonb_agg(to_jsonb(gf.tag) order by gf.count desc, gf.tag)
        from (select * from global_focus order by count desc, tag limit 12) gf
      ), '[]'::jsonb),
      'stalled_students', coalesce((
        select jsonb_agg(to_jsonb(sr.student_id) order by sr.student_name)
        from student_rows sr
        where sr.all_time_submission_count >= 2 and coalesce(sr.latest_score - sr.first_score, 0) <= 0
      ), '[]'::jsonb),
      'monthly_review_ready_students', coalesce((
        select jsonb_agg(to_jsonb(sr.student_id) order by sr.student_name)
        from student_rows sr
        where sr.submission_count >= 2
      ), '[]'::jsonb)
    )
  );
end;
$function$
;
