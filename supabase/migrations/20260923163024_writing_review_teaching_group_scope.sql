CREATE OR REPLACE FUNCTION public.rpc_bh_writing_canonical_assessment_entitlement_internal(p_attempt_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or (
      v_row.school_id is not null
      and private.actor_can_review_bh_writing_assessment(
        v_actor,
        v_row.school_id,
        v_row.student_id
      )
    );
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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bh_writing_submit_assessment_review_entitlement_internal(p_assessment_id uuid, p_criterion_scores jsonb, p_rationale text DEFAULT NULL::text, p_is_final boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_authorized := private.actor_can_review_bh_writing_assessment(
    v_actor,
    v_assessment.school_id,
    v_assessment.student_id
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
$function$
;

revoke all on function public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)
to authenticated,service_role;

revoke all on function public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)
to authenticated,service_role;
