-- Complete the teacher-authoritative Writing Hub review path.
--
-- Automated assessments remain formative. Only one append-only final teacher
-- review may become canonical and contribute to the Academic Profile.

create extension if not exists "uuid-ossp" with schema extensions;

create unique index if not exists bh_writing_assessment_reviews_one_final_idx
  on public.bh_writing_assessment_reviews (assessment_id)
  where review_status = 'final';

-- BEGIN SAFE LEGACY WRITING ASSESSMENT BACKFILL
-- Historical Writing Hub attempts predate the append-only assessment ledger.
-- Recover only persisted four-criterion results whose identity and arithmetic
-- can be proven from the source row. Incomplete three-criterion attempts stay
-- in bh_writing_attempts for an explicit future re-evaluation; no missing score
-- is imputed and no automated result is promoted to Academic Profile authority.
with source_attempts as (
  select
    a.id as source_attempt_row_id,
    a.created_at as source_created_at,
    a.payload,
    coalesce(nullif(trim(a.payload->>'id'), ''), a.id::text) as logical_attempt_key,
    coalesce(
      nullif(trim(a.payload->>'student_id'), ''),
      nullif(trim(a.payload->>'user_id'), '')
    ) as source_student_id_text
  from public.bh_writing_attempts a
),
unlinked_attempts as (
  select source.*
  from source_attempts source
  where not exists (
    select 1
    from public.bh_writing_assessments existing
    where existing.attempt_key = source.logical_attempt_key
  )
),
ranked_attempts as (
  select
    unlinked.*,
    row_number() over (
      partition by unlinked.logical_attempt_key
      order by unlinked.source_created_at desc, unlinked.source_attempt_row_id desc
    ) as logical_attempt_rank
  from unlinked_attempts unlinked
),
raw_candidates as (
  select
    ranked.*,
    case
      when ranked.source_student_id_text ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ranked.source_student_id_text::uuid
      else null
    end as student_id,
    ranked.payload->'assessment'->'subscores'->>'content' as content_score_text,
    ranked.payload->'assessment'->'subscores'->>'communicative_achievement'
      as communicative_achievement_score_text,
    ranked.payload->'assessment'->'subscores'->>'organisation' as organisation_score_text,
    ranked.payload->'assessment'->'subscores'->>'language' as language_score_text,
    ranked.payload->'assessment'->>'total_score' as total_score_text
  from ranked_attempts ranked
  where ranked.logical_attempt_rank = 1
    and jsonb_typeof(ranked.payload->'assessment') = 'object'
    and jsonb_typeof(ranked.payload->'assessment'->'subscores') = 'object'
    and jsonb_typeof(ranked.payload->'student_submission') = 'string'
    and nullif(trim(ranked.payload->>'student_submission'), '') is not null
    and jsonb_typeof(ranked.payload->'prompt_text') = 'string'
    and nullif(trim(ranked.payload->>'prompt_text'), '') is not null
),
typed_candidates as (
  select
    raw.*,
    case when raw.content_score_text ~ '^[0-5]$'
      then raw.content_score_text::smallint end as content_score,
    case when raw.communicative_achievement_score_text ~ '^[0-5]$'
      then raw.communicative_achievement_score_text::smallint end
      as communicative_achievement_score,
    case when raw.organisation_score_text ~ '^[0-5]$'
      then raw.organisation_score_text::smallint end as organisation_score,
    case when raw.language_score_text ~ '^[0-5]$'
      then raw.language_score_text::smallint end as language_score,
    case when raw.total_score_text ~ '^(?:[0-9]|1[0-9]|20)$'
      then raw.total_score_text::smallint end as total_score
  from raw_candidates raw
),
eligible_candidates as (
  select typed.*, student.school_id
  from typed_candidates typed
  join public.users student
    on student.id = typed.student_id
   and student.role = 'student'
  join public.schools school
    on school.id = student.school_id
  where typed.content_score is not null
    and typed.communicative_achievement_score is not null
    and typed.organisation_score is not null
    and typed.language_score is not null
    and typed.total_score is not null
    and typed.total_score =
      typed.content_score
      + typed.communicative_achievement_score
      + typed.organisation_score
      + typed.language_score
)
insert into public.bh_writing_assessments (
  id,
  attempt_key,
  student_id,
  school_id,
  submission_fingerprint,
  prompt_definition_hash,
  rubric_version,
  evaluator_version,
  evaluator_model,
  assessment_status,
  total_score,
  content_score,
  communicative_achievement_score,
  organisation_score,
  language_score,
  assessment_payload,
  feedback_payload,
  shadow_assessment,
  adjudication,
  request_metadata,
  created_at
)
select
  extensions.uuid_generate_v5(
    '6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
    concat_ws(
      ':',
      'brains-heist-writing-assessment',
      'legacy-four-criterion-backfill-v1',
      eligible.logical_attempt_key,
      eligible.student_id::text
    )
  ),
  eligible.logical_attempt_key,
  eligible.student_id,
  eligible.school_id,
  'legacy_submission_sha256_' || encode(
    extensions.digest(
      convert_to(eligible.payload->>'student_submission', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'legacy_prompt_sha256_' || encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'prompt_id', nullif(trim(eligible.payload->>'prompt_id'), ''),
          'prompt_text', trim(eligible.payload->>'prompt_text'),
          'grade', coalesce(
            nullif(trim(eligible.payload->>'grade'), ''),
            nullif(trim(eligible.payload->'assessment'->>'grade'), '')
          ),
          'genre', coalesce(
            nullif(trim(eligible.payload->>'genre'), ''),
            nullif(trim(eligible.payload->'assessment'->>'genre'), '')
          ),
          'target_word_count', eligible.payload->'assessment'->'target_word_count'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'legacy-writing-rubric-persisted-v1',
  'legacy-four-criterion-backfill-v1',
  'legacy-persisted-assessment-model-not-recorded',
  'needs_review',
  eligible.total_score,
  eligible.content_score,
  eligible.communicative_achievement_score,
  eligible.organisation_score,
  eligible.language_score,
  eligible.payload->'assessment' || jsonb_build_object(
    'assessment_status', 'needs_review',
    'academic_profile_ready', false,
    'rubric_version', 'legacy-writing-rubric-persisted-v1',
    'evaluator_version', 'legacy-four-criterion-backfill-v1',
    'evaluator_model', 'legacy-persisted-assessment-model-not-recorded',
    'historical_backfill', jsonb_build_object(
      'version', 'legacy-four-criterion-backfill-v1',
      'source_table', 'bh_writing_attempts',
      'source_attempt_row_id', eligible.source_attempt_row_id,
      'teacher_review_required', true
    )
  ),
  case
    when jsonb_typeof(eligible.payload->'rich_feedback') = 'object'
      then eligible.payload->'rich_feedback'
    else '{}'::jsonb
  end,
  null,
  null,
  jsonb_build_object(
    'source', 'bh_writing_attempts_historical_backfill',
    'backfill_version', 'legacy-four-criterion-backfill-v1',
    'source_attempt_row_id', eligible.source_attempt_row_id,
    'logical_attempt_key', eligible.logical_attempt_key,
    'source_created_at', eligible.source_created_at,
    'source_payload_sha256', encode(
      extensions.digest(convert_to(eligible.payload::text, 'UTF8'), 'sha256'),
      'hex'
    ),
    'score_source', 'payload.assessment.subscores',
    'total_score_source', 'payload.assessment.total_score',
    'selection_rule', 'latest_created_at_then_row_id_per_logical_attempt',
    'submission_hash_algorithm', 'sha256_exact_utf8_v1',
    'prompt_hash_algorithm', 'sha256_jsonb_prompt_definition_v1',
    'teacher_review_required', true,
    'academic_profile_authority', false
  ),
  eligible.source_created_at
from eligible_candidates eligible
on conflict (attempt_key, rubric_version, evaluator_version) do nothing;
-- END SAFE LEGACY WRITING ASSESSMENT BACKFILL

create or replace function private.actor_can_review_bh_writing_assessment(
  p_actor uuid,
  p_school_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_actor is not null
    and p_school_id is not null
    and p_student_id is not null
    and (
      public.is_superadmin(p_actor)
      or exists (
        select 1
        from public.users actor
        where actor.id = p_actor
          and (coalesce(actor.is_admin, false) or actor.role = 'admin')
      )
      or public.is_school_owner(p_school_id)
      or public.is_school_admin_of(p_actor, p_school_id)
      or exists (
        select 1
        from public.class_students cs
        join public.class_teacher_assignments cta
          on cta.class_id = cs.class_id
         and cta.teacher_user_id = p_actor
         and coalesce(cta.active, true)
        join public.classes c
          on c.id = cs.class_id
         and c.school_id = p_school_id
        where cs.student_id = p_student_id
          and lower(trim(coalesce(cta.subject, c.subject, ''))) like 'english%'
      )
    );
$$;

revoke all on function private.actor_can_review_bh_writing_assessment(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_bh_writing_teacher_review_context(
  p_attempt_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_attempt_key text := nullif(trim(coalesce(p_attempt_key, '')), '');
  v_assessment public.bh_writing_assessments%rowtype;
  v_latest_draft public.bh_writing_assessment_reviews%rowtype;
  v_final_review public.bh_writing_assessment_reviews%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_attempt_key is null then
    raise exception using errcode = '22023', message = 'writing_attempt_key_required';
  end if;
  if not private.actor_has_programme_access('writing', true) then
    raise exception using
      errcode = '42501',
      message = 'writing_hub_entitlement_required';
  end if;

  select a.*
    into v_assessment
  from public.bh_writing_assessments a
  where a.attempt_key = v_attempt_key
    and a.assessment_status in ('verified', 'provisional', 'needs_review')
  order by a.created_at desc, a.id desc
  limit 1;

  if not found then
    return null;
  end if;
  if not private.actor_can_review_bh_writing_assessment(
    v_actor,
    v_assessment.school_id,
    v_assessment.student_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'writing_assessment_review_forbidden';
  end if;

  select r.*
    into v_latest_draft
  from public.bh_writing_assessment_reviews r
  join public.bh_writing_assessments reviewed_assessment
    on reviewed_assessment.id = r.assessment_id
  where reviewed_assessment.attempt_key = v_assessment.attempt_key
    and reviewed_assessment.student_id = v_assessment.student_id
    and reviewed_assessment.school_id = v_assessment.school_id
    and r.review_status = 'draft'
  order by r.created_at desc, r.id desc
  limit 1;

  select r.*
    into v_final_review
  from public.bh_writing_assessment_reviews r
  join public.bh_writing_assessments reviewed_assessment
    on reviewed_assessment.id = r.assessment_id
  where reviewed_assessment.attempt_key = v_assessment.attempt_key
    and reviewed_assessment.student_id = v_assessment.student_id
    and reviewed_assessment.school_id = v_assessment.school_id
    and r.review_status = 'final'
  order by r.created_at desc, r.id desc
  limit 1;

  return jsonb_build_object(
    'assessment_id', v_assessment.id,
    'attempt_key', v_assessment.attempt_key,
    'student_id', v_assessment.student_id,
    'assessment_status', v_assessment.assessment_status,
    'automated_total_score', v_assessment.total_score,
    'automated_scores', jsonb_build_object(
      'content', v_assessment.content_score,
      'communicative_achievement', v_assessment.communicative_achievement_score,
      'organisation', v_assessment.organisation_score,
      'language', v_assessment.language_score
    ),
    'rubric_version', v_assessment.rubric_version,
    'evaluator_version', v_assessment.evaluator_version,
    'latest_draft', case
      when v_latest_draft.id is null then null
      else jsonb_build_object(
        'review_id', v_latest_draft.id,
        'review_status', v_latest_draft.review_status,
        'criterion_scores', v_latest_draft.criterion_scores,
        'total_score', v_latest_draft.total_score,
        'rationale', v_latest_draft.rationale,
        'created_at', v_latest_draft.created_at
      )
    end,
    'final_review', case
      when v_final_review.id is null then null
      else jsonb_build_object(
        'review_id', v_final_review.id,
        'review_status', v_final_review.review_status,
        'criterion_scores', v_final_review.criterion_scores,
        'total_score', v_final_review.total_score,
        'rationale', v_final_review.rationale,
        'created_at', v_final_review.created_at
      )
    end
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_review_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_bh_writing_teacher_review_context(text)
  to authenticated;

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
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not private.actor_has_programme_access('writing', true) then
    raise exception using
      errcode = '42501',
      message = 'writing_hub_entitlement_required';
  end if;

  -- Lock the assessment row so concurrent finalization attempts serialize.
  select a.*
    into v_assessment
  from public.bh_writing_assessments a
  where a.id = p_assessment_id
  for update;

  if not found or v_assessment.school_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'writing_assessment_not_available';
  end if;
  if not private.actor_can_review_bh_writing_assessment(
    v_actor,
    v_assessment.school_id,
    v_assessment.student_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'writing_assessment_review_forbidden';
  end if;

  -- One submission can carry several append-only automated assessment versions.
  -- Serialize the human decision by logical attempt, not only assessment row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_assessment.attempt_key, 924713::bigint)
  );

  if exists (
    select 1
    from public.bh_writing_assessment_reviews r
    join public.bh_writing_assessments reviewed_assessment
      on reviewed_assessment.id = r.assessment_id
    where reviewed_assessment.attempt_key = v_assessment.attempt_key
      and r.review_status = 'final'
  ) then
    raise exception using
      errcode = '23505',
      message = 'writing_assessment_already_finalized';
  end if;
  if coalesce(p_is_final, true)
     and length(trim(coalesce(p_rationale, ''))) not between 12 and 2000 then
    raise exception using
      errcode = '22023',
      message = 'writing_final_review_rationale_must_be_12_to_2000_characters';
  end if;

  return public.rpc_bh_writing_submit_assessment_review_entitlement_internal(
    p_assessment_id,
    p_criterion_scores,
    p_rationale,
    coalesce(p_is_final, true)
  );
end;
$$;

revoke all on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
  to authenticated;

comment on function public.rpc_bh_writing_teacher_review_context(text) is
  'Returns scoped automated writing evidence plus the latest append-only teacher draft/final across every assessment version of the submission; automated evidence is never promoted by this read.';
comment on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean) is
  'Appends a scoped teacher review. A rationale-backed final is immutable and submission-wide across assessment versions, and becomes Academic Profile authority.';
