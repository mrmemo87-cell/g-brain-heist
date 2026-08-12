-- Brains Heist Writing Assessment Authority v2
-- Append-only, evidence-grounded assessment records. The existing student UX and
-- cinematic layer consume these records through an adapter; academic analytics
-- may consume verified/canonical records only.

create table if not exists public.bh_writing_assessments (
  id uuid primary key default gen_random_uuid(),
  attempt_key text not null,
  student_id uuid not null references public.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  submission_fingerprint text not null,
  prompt_definition_hash text not null,
  rubric_version text not null,
  evaluator_version text not null,
  evaluator_model text not null,
  assessment_status text not null check (assessment_status in ('verified','provisional','needs_review','failed')),
  total_score smallint not null check (total_score between 0 and 20),
  content_score smallint not null check (content_score between 0 and 5),
  communicative_achievement_score smallint not null check (communicative_achievement_score between 0 and 5),
  organisation_score smallint not null check (organisation_score between 0 and 5),
  language_score smallint not null check (language_score between 0 and 5),
  assessment_payload jsonb not null,
  feedback_payload jsonb not null,
  shadow_assessment jsonb,
  adjudication jsonb,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bh_writing_assessment_total_matches check (
    total_score = content_score + communicative_achievement_score + organisation_score + language_score
  ),
  constraint bh_writing_assessment_identity_unique unique (attempt_key, rubric_version, evaluator_version)
);

create index if not exists idx_bh_writing_assessments_student_created
  on public.bh_writing_assessments(student_id, created_at desc);
create index if not exists idx_bh_writing_assessments_school_status
  on public.bh_writing_assessments(school_id, assessment_status, created_at desc);
create index if not exists idx_bh_writing_assessments_review_queue
  on public.bh_writing_assessments(created_at desc)
  where assessment_status in ('provisional','needs_review');

create table if not exists public.bh_writing_assessment_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.bh_writing_assessments(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  review_status text not null check (review_status in ('draft','final')),
  criterion_scores jsonb not null,
  total_score smallint not null check (total_score between 0 and 20),
  rationale text,
  created_at timestamptz not null default now(),
  constraint bh_writing_review_criteria_shape check (
    jsonb_typeof(criterion_scores) = 'object'
    and criterion_scores ?& array['content','communicative_achievement','organisation','language']
  )
);

create index if not exists idx_bh_writing_reviews_assessment_created
  on public.bh_writing_assessment_reviews(assessment_id, created_at desc);
create index if not exists idx_bh_writing_reviews_school_created
  on public.bh_writing_assessment_reviews(school_id, created_at desc);

create or replace function private.reject_writing_assessment_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Writing assessment history is append-only';
end;
$$;

revoke all on function private.reject_writing_assessment_history_mutation() from public, anon, authenticated;
drop trigger if exists trg_bh_writing_assessments_immutable on public.bh_writing_assessments;
create trigger trg_bh_writing_assessments_immutable
before update on public.bh_writing_assessments
for each row execute function private.reject_writing_assessment_history_mutation();
drop trigger if exists trg_bh_writing_assessment_reviews_immutable on public.bh_writing_assessment_reviews;
create trigger trg_bh_writing_assessment_reviews_immutable
before update on public.bh_writing_assessment_reviews
for each row execute function private.reject_writing_assessment_history_mutation();

alter table public.bh_writing_assessments enable row level security;
alter table public.bh_writing_assessment_reviews enable row level security;

revoke all on table public.bh_writing_assessments from public, anon, authenticated;
revoke all on table public.bh_writing_assessment_reviews from public, anon, authenticated;
grant select on table public.bh_writing_assessments to authenticated, service_role;
grant select on table public.bh_writing_assessment_reviews to authenticated, service_role;
grant insert, update, delete on table public.bh_writing_assessments to service_role;
grant insert, update, delete on table public.bh_writing_assessment_reviews to service_role;

drop policy if exists "writing assessment student read own" on public.bh_writing_assessments;
create policy "writing assessment student read own"
on public.bh_writing_assessments for select to authenticated
using ((select auth.uid()) is not null and student_id = (select auth.uid()));

drop policy if exists "writing assessment review student read final" on public.bh_writing_assessment_reviews;
create policy "writing assessment review student read final"
on public.bh_writing_assessment_reviews for select to authenticated
using ((select auth.uid()) is not null and student_id = (select auth.uid()) and review_status = 'final');

create or replace function private.capture_final_writing_assessment_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.bh_writing_assessments%rowtype;
  v_item record;
  v_skill text;
  v_skill_key text;
  v_score integer;
  v_kind text;
  v_source_key text;
begin
  if new.review_status <> 'final' then return new; end if;
  select * into v_assessment from public.bh_writing_assessments where id = new.assessment_id;
  if not found then raise exception 'Reviewed assessment not found'; end if;

  for v_item in
    select * from (values
      ('content', 'Content'),
      ('communicative_achievement', 'Communicative Achievement'),
      ('organisation', 'Organisation'),
      ('language', 'Language')
    ) dimensions(dimension_key, display_name)
  loop
    v_score := (new.criterion_scores->>v_item.dimension_key)::integer;
    v_skill := v_item.display_name;
    v_skill_key := public.student_learning_build_skill_key('English', 'Writing rubric', v_skill, null);
    v_kind := case when v_score <= 2 then 'focus' when v_score >= 4 then 'strength' else 'developing' end;
    v_source_key := concat_ws(':', 'writing-review', new.id::text, v_item.dimension_key);

    insert into public.student_learning_observations(
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence, system_generated,
      created_by, evidence_quality, contributes_to_focus_state
    ) values (
      new.school_id, new.student_id, 'English', 'Writing rubric', v_skill,
      coalesce(v_assessment.assessment_payload->>'genre', 'writing'), v_skill_key,
      v_kind, 'writing_assessment_review', new.id, v_source_key, new.created_at,
      v_score * 20, 1,
      jsonb_build_object(
        'writing_signal', 'teacher_final_review',
        'assessment_id', new.assessment_id,
        'review_id', new.id,
        'attempt_key', v_assessment.attempt_key,
        'rubric_version', v_assessment.rubric_version,
        'evaluator_version', v_assessment.evaluator_version,
        'rubric_dimension', v_item.dimension_key,
        'rubric_score', v_score,
        'rubric_max', 5,
        'automated_score', v_assessment.assessment_payload->'criteria'->v_item.dimension_key->'score',
        'rationale', new.rationale
      ),
      false, new.reviewer_id, 'strong', true
    );
    perform public.student_learning_refresh_focus_state(new.student_id, v_skill_key);
  end loop;
  return new;
end;
$$;

revoke all on function private.capture_final_writing_assessment_review() from public, anon, authenticated;
drop trigger if exists trg_capture_final_writing_assessment_review on public.bh_writing_assessment_reviews;
create trigger trg_capture_final_writing_assessment_review
after insert on public.bh_writing_assessment_reviews
for each row when (new.review_status = 'final')
execute function private.capture_final_writing_assessment_review();

create or replace function public.rpc_bh_writing_submit_assessment_review(
  p_assessment_id uuid,
  p_criterion_scores jsonb,
  p_rationale text default null,
  p_is_final boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_assessment public.bh_writing_assessments%rowtype;
  v_content integer;
  v_communicative integer;
  v_organisation integer;
  v_language integer;
  v_total integer;
  v_review_id uuid;
  v_authorized boolean := false;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into v_assessment from public.bh_writing_assessments where id = p_assessment_id;
  if not found or v_assessment.school_id is null then raise exception 'Assessment not available for school review'; end if;

  v_authorized := public.is_school_owner(v_assessment.school_id)
    or public.is_school_admin_of(v_actor, v_assessment.school_id)
    or exists (
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta
        on cta.class_id = cs.class_id
       and cta.teacher_user_id = v_actor
       and coalesce(cta.active, true) = true
      join public.classes c on c.id = cs.class_id and c.school_id = v_assessment.school_id
      where cs.student_id = v_assessment.student_id
    );
  if not v_authorized then raise exception 'Forbidden: reviewer is not assigned to this student'; end if;

  if jsonb_typeof(p_criterion_scores) <> 'object' then raise exception 'Criterion scores are required'; end if;
  begin
    v_content := (p_criterion_scores->>'content')::integer;
    v_communicative := (p_criterion_scores->>'communicative_achievement')::integer;
    v_organisation := (p_criterion_scores->>'organisation')::integer;
    v_language := (p_criterion_scores->>'language')::integer;
  exception when others then
    raise exception 'All four criterion scores must be integers';
  end;
  if v_content not between 0 and 5 or v_communicative not between 0 and 5
    or v_organisation not between 0 and 5 or v_language not between 0 and 5 then
    raise exception 'Criterion scores must be between 0 and 5';
  end if;
  v_total := v_content + v_communicative + v_organisation + v_language;

  insert into public.bh_writing_assessment_reviews(
    assessment_id, school_id, student_id, reviewer_id, review_status, criterion_scores, total_score, rationale
  ) values (
    v_assessment.id, v_assessment.school_id, v_assessment.student_id, v_actor,
    case when p_is_final then 'final' else 'draft' end,
    jsonb_build_object(
      'content', v_content,
      'communicative_achievement', v_communicative,
      'organisation', v_organisation,
      'language', v_language
    ),
    v_total,
    nullif(trim(coalesce(p_rationale, '')), '')
  ) returning id into v_review_id;

  return jsonb_build_object(
    'review_id', v_review_id,
    'assessment_id', v_assessment.id,
    'review_status', case when p_is_final then 'final' else 'draft' end,
    'total_score', v_total,
    'criterion_scores', jsonb_build_object(
      'content', v_content,
      'communicative_achievement', v_communicative,
      'organisation', v_organisation,
      'language', v_language
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
  from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
  to authenticated, service_role;

create or replace view public.bh_writing_canonical_assessments
with (security_invoker = true)
as
select
  a.id as assessment_id,
  a.attempt_key,
  a.student_id,
  a.school_id,
  a.submission_fingerprint,
  a.prompt_definition_hash,
  a.rubric_version,
  a.evaluator_version,
  a.evaluator_model,
  case when final_review.id is not null then 'teacher_final' else a.assessment_status end as canonical_status,
  coalesce(final_review.total_score, a.total_score)::smallint as total_score,
  coalesce((final_review.criterion_scores->>'content')::integer, a.content_score)::smallint as content_score,
  coalesce((final_review.criterion_scores->>'communicative_achievement')::integer, a.communicative_achievement_score)::smallint as communicative_achievement_score,
  coalesce((final_review.criterion_scores->>'organisation')::integer, a.organisation_score)::smallint as organisation_score,
  coalesce((final_review.criterion_scores->>'language')::integer, a.language_score)::smallint as language_score,
  a.assessment_payload,
  a.feedback_payload,
  final_review.id as final_review_id,
  final_review.reviewer_id,
  final_review.rationale as review_rationale,
  coalesce(final_review.created_at, a.created_at) as canonical_at,
  a.created_at as automated_at
from public.bh_writing_assessments a
left join lateral (
  select r.*
  from public.bh_writing_assessment_reviews r
  where r.assessment_id = a.id and r.review_status = 'final'
  order by r.created_at desc, r.id desc
  limit 1
) final_review on true
where a.assessment_status = 'verified' or final_review.id is not null;

revoke all on table public.bh_writing_canonical_assessments from public, anon, authenticated;
grant select on table public.bh_writing_canonical_assessments to authenticated, service_role;

create or replace function public.rpc_bh_writing_canonical_assessment(p_attempt_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row record;
  v_authorized boolean := false;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into v_row
  from public.bh_writing_canonical_assessments
  where attempt_key = p_attempt_key
  limit 1;
  if not found then return null; end if;

  v_authorized := v_row.student_id = v_actor
    or (v_row.school_id is not null and (
      public.is_school_owner(v_row.school_id)
      or public.is_school_admin_of(v_actor, v_row.school_id)
      or exists (
        select 1 from public.class_students cs
        join public.class_teacher_assignments cta
          on cta.class_id = cs.class_id and cta.teacher_user_id = v_actor and coalesce(cta.active, true) = true
        join public.classes c on c.id = cs.class_id and c.school_id = v_row.school_id
        where cs.student_id = v_row.student_id
      )
    ));
  if not v_authorized then raise exception 'Forbidden: assessment is outside your scope'; end if;

  return jsonb_build_object(
    'assessment_id', v_row.assessment_id,
    'attempt_key', v_row.attempt_key,
    'student_id', v_row.student_id,
    'canonical_status', v_row.canonical_status,
    'total_score', v_row.total_score,
    'subscores', jsonb_build_object(
      'content', v_row.content_score,
      'communicative_achievement', v_row.communicative_achievement_score,
      'organisation', v_row.organisation_score,
      'language', v_row.language_score
    ),
    'rubric_version', v_row.rubric_version,
    'evaluator_version', v_row.evaluator_version,
    'assessment', v_row.assessment_payload,
    'feedback', v_row.feedback_payload,
    'final_review_id', v_row.final_review_id,
    'canonical_at', v_row.canonical_at
  );
end;
$$;

revoke all on function public.rpc_bh_writing_canonical_assessment(text) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_canonical_assessment(text) to authenticated, service_role;

create or replace function public.rpc_bh_writing_calibration_queue_v2(
  p_school_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if not (
    public.is_school_owner(p_school_id)
    or public.is_school_admin_of(v_actor, p_school_id)
    or public.can_teach_in_school(p_school_id)
  ) then raise exception 'Forbidden: school calibration access required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assessment_id', q.id,
      'attempt_key', q.attempt_key,
      'student_id', q.student_id,
      'assessment_status', q.assessment_status,
      'total_score', q.total_score,
      'subscores', jsonb_build_object(
        'content', q.content_score,
        'communicative_achievement', q.communicative_achievement_score,
        'organisation', q.organisation_score,
        'language', q.language_score
      ),
      'rubric_version', q.rubric_version,
      'evaluator_version', q.evaluator_version,
      'created_at', q.created_at,
      'reason', coalesce(q.assessment_payload->>'adjudication_reason', q.assessment_status)
    ) order by q.created_at desc)
    from (
      select a.*
      from public.bh_writing_assessments a
      where a.school_id = p_school_id
        and (
          a.assessment_status in ('provisional','needs_review')
          or mod(hashtextextended(a.id::text, 0), 20) = 0
        )
      order by case when a.assessment_status = 'needs_review' then 0 else 1 end, a.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.rpc_bh_writing_calibration_queue_v2(uuid,integer) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_calibration_queue_v2(uuid,integer) to authenticated, service_role;

create or replace function public.rpc_bh_writing_calibration_metrics_v2(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_metrics jsonb;
  v_reviewed_count integer;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if not (
    public.is_school_owner(p_school_id)
    or public.is_school_admin_of(v_actor, p_school_id)
    or public.can_teach_in_school(p_school_id)
  ) then raise exception 'Forbidden: school calibration access required'; end if;

  with latest_reviews as (
    select distinct on (r.assessment_id)
      r.assessment_id, r.criterion_scores, r.total_score
    from public.bh_writing_assessment_reviews r
    where r.school_id = p_school_id and r.review_status = 'final'
    order by r.assessment_id, r.created_at desc, r.id desc
  ), comparisons as (
    select
      a.id,
      dimension.dimension_key,
      dimension.automated_score,
      (lr.criterion_scores->>dimension.dimension_key)::numeric as teacher_score
    from public.bh_writing_assessments a
    join latest_reviews lr on lr.assessment_id = a.id
    cross join lateral (values
      ('content', a.content_score::numeric),
      ('communicative_achievement', a.communicative_achievement_score::numeric),
      ('organisation', a.organisation_score::numeric),
      ('language', a.language_score::numeric)
    ) dimension(dimension_key, automated_score)
    where a.school_id = p_school_id
  ), by_dimension as (
    select
      dimension_key,
      count(*)::integer comparison_count,
      round(avg(abs(teacher_score - automated_score)), 3) mean_absolute_error,
      round(avg(case when abs(teacher_score - automated_score) <= 1 then 1 else 0 end), 3) within_one_rate,
      round(avg(automated_score - teacher_score), 3) directional_bias
    from comparisons
    group by dimension_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'criterion', dimension_key,
    'comparison_count', comparison_count,
    'mean_absolute_error', mean_absolute_error,
    'within_one_rate', within_one_rate,
    'directional_bias', directional_bias
  ) order by dimension_key), '[]'::jsonb)
  into v_metrics
  from by_dimension;

  select count(distinct r.assessment_id)::integer into v_reviewed_count
  from public.bh_writing_assessment_reviews r
  where r.school_id = p_school_id and r.review_status = 'final';

  return jsonb_build_object(
    'school_id', p_school_id,
    'reviewed_assessment_count', coalesce(v_reviewed_count, 0),
    'criteria', coalesce(v_metrics, '[]'::jsonb),
    'release_targets', jsonb_build_object(
      'within_one_rate', 0.90,
      'max_directional_bias', 0.25,
      'teacher_agreement_margin', 0.15
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_calibration_metrics_v2(uuid) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_calibration_metrics_v2(uuid) to authenticated, service_role;

-- Preserve the mature scoped teacher UX while replacing its scoring authority.
-- Wrappers retain legacy-only rows for historical visibility, but whenever v2
-- canonical evidence exists it becomes the score/rubric/weakness source.
alter function public.rpc_bh_writing_teacher_monitoring(text,integer,text)
  rename to rpc_bh_writing_teacher_monitoring_legacy_v1;

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
  v_base jsonb;
  v_rows jsonb;
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(lower(trim(p_genre)), '');
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  v_base := public.rpc_bh_writing_teacher_monitoring_legacy_v1(p_month, p_grade, p_genre);

  select coalesce(jsonb_agg(
    case when latest.assessment_id is null then row_item.value || jsonb_build_object('assessment_authority', 'legacy_estimate')
    else row_item.value || jsonb_build_object(
      'latest_score', latest.total_score,
      'first_score', first_verified.total_score,
      'score_trend_delta', latest.total_score - first_verified.total_score,
      'latest_subscale_scores', jsonb_build_object(
        'content', latest.content_score,
        'communicative_achievement', latest.communicative_achievement_score,
        'organisation', latest.organisation_score,
        'language', latest.language_score
      ),
      'first_subscale_scores', jsonb_build_object(
        'content', first_verified.content_score,
        'communicative_achievement', first_verified.communicative_achievement_score,
        'organisation', first_verified.organisation_score,
        'language', first_verified.language_score
      ),
      'repeated_weakness_hotspots', coalesce(latest.feedback_payload->'weakness_tags', '[]'::jsonb),
      'assessment_authority', latest.canonical_status,
      'rubric_version', latest.rubric_version,
      'evaluator_version', latest.evaluator_version
    ) end
    order by row_item.ordinality
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'student_rows', '[]'::jsonb)) with ordinality row_item(value, ordinality)
  left join lateral (
    select c.*
    from public.bh_writing_canonical_assessments c
    where c.student_id::text = row_item.value->>'student_id'
      and (v_month is null or to_char(c.canonical_at, 'YYYY-MM') = v_month)
      and (
        p_grade is null
        or coalesce(c.assessment_payload->>'grade', c.assessment_payload #>> '{prompt_definition,grade}') = p_grade::text
      )
      and (
        v_genre is null
        or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}')) = v_genre
      )
    order by c.canonical_at desc, c.assessment_id desc
    limit 1
  ) latest on true
  left join lateral (
    select c.*
    from public.bh_writing_canonical_assessments c
    where c.student_id::text = row_item.value->>'student_id'
      and (v_month is null or to_char(c.canonical_at, 'YYYY-MM') = v_month)
      and (
        p_grade is null
        or coalesce(c.assessment_payload->>'grade', c.assessment_payload #>> '{prompt_definition,grade}') = p_grade::text
      )
      and (
        v_genre is null
        or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}')) = v_genre
      )
    order by c.canonical_at, c.assessment_id
    limit 1
  ) first_verified on true;

  return jsonb_set(v_base, '{student_rows}', v_rows, true)
    || jsonb_build_object('score_authority', 'canonical_v2_when_available');
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_monitoring_legacy_v1(text,integer,text) from public, anon, authenticated;
revoke all on function public.rpc_bh_writing_teacher_monitoring(text,integer,text) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text,integer,text) to authenticated, service_role;

alter function public.rpc_bh_writing_teacher_weakness_counts(text,integer,text)
  rename to rpc_bh_writing_teacher_weakness_counts_legacy_v1;

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
  v_genre text := nullif(lower(trim(p_genre)), '');
  v_canonical_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  select count(*)::integer into v_canonical_count
  from public.bh_writing_canonical_assessments c
  where public.can_access_bh_writing_student(c.student_id)
    and (v_month is null or to_char(c.canonical_at, 'YYYY-MM') = v_month)
    and (
      p_grade is null
      or coalesce(c.assessment_payload->>'grade', c.assessment_payload #>> '{prompt_definition,grade}') = p_grade::text
    )
    and (
      v_genre is null
      or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}')) = v_genre
    );

  if v_canonical_count = 0 then
    return public.rpc_bh_writing_teacher_weakness_counts_legacy_v1(p_month, p_grade, p_genre)
      || jsonb_build_object('assessment_authority', 'legacy_estimate');
  end if;

  return (
    with counts as (
      select c.student_id, tag.value tag, count(*)::integer occurrence_count
      from public.bh_writing_canonical_assessments c
      cross join lateral jsonb_array_elements_text(coalesce(c.feedback_payload->'weakness_tags', '[]'::jsonb)) tag(value)
      where public.can_access_bh_writing_student(c.student_id)
        and (v_month is null or to_char(c.canonical_at, 'YYYY-MM') = v_month)
        and (
          p_grade is null
          or coalesce(c.assessment_payload->>'grade', c.assessment_payload #>> '{prompt_definition,grade}') = p_grade::text
        )
        and (
          v_genre is null
          or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}')) = v_genre
        )
      group by c.student_id, tag.value
    )
    select jsonb_build_object(
      'assessment_authority', 'canonical_v2',
      'most_common_weakness_tags', coalesce((
        select jsonb_agg(jsonb_build_object('tag', tag, 'count', total) order by total desc, tag)
        from (select tag, sum(occurrence_count)::integer total from counts group by tag) totals
      ), '[]'::jsonb),
      'student_weakness_counts', coalesce((
        select jsonb_agg(jsonb_build_object('student_id', student_id, 'tags', tags) order by student_id)
        from (
          select student_id, jsonb_agg(jsonb_build_object('tag', tag, 'count', occurrence_count) order by occurrence_count desc, tag) tags
          from counts group by student_id
        ) student_totals
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_weakness_counts_legacy_v1(text,integer,text) from public, anon, authenticated;
revoke all on function public.rpc_bh_writing_teacher_weakness_counts(text,integer,text) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_teacher_weakness_counts(text,integer,text) to authenticated, service_role;

alter function public.rpc_bh_writing_teacher_report(text,text,text,boolean)
  rename to rpc_bh_writing_teacher_report_legacy_v1;

create or replace function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(lower(trim(p_genre)), '');
  v_report jsonb;
  v_canonical record;
  v_rubric jsonb;
  v_evaluation jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  v_report := public.rpc_bh_writing_teacher_report_legacy_v1(p_student_id, p_month, p_genre, p_include_snippet);
  select c.* into v_canonical
  from public.bh_writing_canonical_assessments c
  where c.student_id = v_sid
    and to_char(c.canonical_at, 'YYYY-MM') = v_month
    and (
      v_genre is null
      or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}')) = v_genre
    )
  order by c.canonical_at desc, c.assessment_id desc
  limit 1;
  if not found then return v_report || jsonb_build_object('assessment_authority', 'legacy_estimate'); end if;

  v_rubric := jsonb_build_object(
    'content', v_canonical.content_score,
    'communicative_achievement', v_canonical.communicative_achievement_score,
    'organisation', v_canonical.organisation_score,
    'language', v_canonical.language_score
  );
  v_evaluation := v_canonical.assessment_payload || jsonb_build_object(
    'total_score', v_canonical.total_score,
    'subscores', v_rubric,
    'assessment_status', v_canonical.canonical_status,
    'final_review_id', v_canonical.final_review_id
  );

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_report, '{overall_summary,latest_score}', to_jsonb(v_canonical.total_score), true),
        '{rubric_scores}', v_rubric, true
      ),
      '{latest_evaluation}', v_evaluation, true
    ),
    '{priority_weak_areas}', coalesce(v_canonical.feedback_payload->'weakness_tags', '[]'::jsonb), true
  ) || jsonb_build_object(
    'strengths', coalesce(v_canonical.feedback_payload->'what_is_working', v_canonical.feedback_payload->'strengths', '[]'::jsonb),
    'assessment_authority', v_canonical.canonical_status,
    'rubric_version', v_canonical.rubric_version,
    'evaluator_version', v_canonical.evaluator_version,
    'final_review_id', v_canonical.final_review_id
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_report_legacy_v1(text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.rpc_bh_writing_teacher_report(text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.rpc_bh_writing_teacher_report(text,text,text,boolean) to authenticated, service_role;

-- Only verified v2 attempts may add new signals to the student's academic profile.
-- Existing historical observations remain append-only and are not rewritten.
drop trigger if exists trg_student_learning_capture_writing_attempt on public.bh_writing_attempts;
create trigger trg_student_learning_capture_writing_attempt
after insert or update of payload on public.bh_writing_attempts
for each row
when (
  coalesce(new.payload #>> '{assessment,academic_profile_ready}', 'false') = 'true'
  and coalesce(new.payload #>> '{assessment,assessment_status}', '') = 'verified'
)
execute function public.student_learning_capture_writing_attempt();

comment on table public.bh_writing_assessments is
  'Append-only automated writing assessments with grounded evidence and evaluator provenance.';
comment on table public.bh_writing_assessment_reviews is
  'Append-only teacher rubric reviews. Final reviews override canonical reads without rewriting automated history.';
