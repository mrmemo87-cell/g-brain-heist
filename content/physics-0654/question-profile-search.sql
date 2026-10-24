CREATE OR REPLACE FUNCTION private.question_browse_matches_search(p_question public.questions, p_search text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select nullif(pg_catalog.btrim(p_search),'') is null
    or pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',p_question.question_text,
      p_question.correct_answer,p_question.subject,p_question.topic,p_question.topic_name,p_question.difficulty,
      pg_catalog.array_to_string(p_question.tags,' '),p_question.curriculum_strand,p_question.curriculum_skill,
      p_question.curriculum_subskill,p_question.curriculum_objective)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    or exists (
      select 1 from public.verified_question_registry_taxonomy tx
      join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
        and private.academic_registry_subject_matches(rv.id,p_question.subject)
      join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.status='active' and skill.registry_version_id=rv.id and skill.node_type='skill'
      join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id and subskill.status='active' and subskill.registry_version_id=rv.id
        and subskill.parent_id=skill.id and subskill.node_type='subskill'
      left join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id
      join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active' and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
      where tx.question_id=p_question.id and tx.question_content_hash=p_question.current_content_hash
        and tx.review_status='approved' and not tx.human_review_required
        and p_question.is_active and p_question.analytics_eligible and p_question.verification_status='verified'
        and p_question.current_content_hash=p_question.verified_content_hash
        and pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',strand.name,skill.name,subskill.name,
          focus.name,tx.evidence_statement)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    )
    or exists (
      select 1 from public.verified_question_assessment_profiles ap
      where ap.question_id=p_question.id and ap.question_content_hash=p_question.current_content_hash
        and ap.status='active' and p_question.is_active and p_question.analytics_eligible
        and p_question.verification_status='verified' and p_question.current_content_hash=p_question.verified_content_hash
        and pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',ap.programme_code,ap.source_version,
          ap.syllabus_tier,ap.syllabus_reference,ap.primary_assessment_objective,
          pg_catalog.array_to_string(ap.assessment_objectives,' '))),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    )
$function$
;
revoke all on function private.question_browse_matches_search(public.questions,text) from public,anon,authenticated;

