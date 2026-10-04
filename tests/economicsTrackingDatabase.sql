-- Run against a migrated Brains Heist database. Every change is rolled back.
begin;
do $test$
declare
 v_teacher uuid; v_actor uuid; v_school uuid; v_student uuid; v_question uuid;
 v_assignment uuid; v_skill_key text; v_focus text; v_result jsonb; v_before integer;
 v_profile jsonb; v_workspace jsonb;
begin
 select gt.teacher_user_id,t.id,gt.school_id into v_actor,v_teacher,v_school
 from public.school_subject_group_teachers gt
 join public.teachers t on t.user_id=gt.teacher_user_id
 join public.school_subject_groups g on g.id=gt.group_id and g.status='active'
 join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.status='active'
 join public.school_subjects ss on ss.id=o.school_subject_id
 where public.academic_normalize_subject_key(ss.name)='economics' and gt.active
 order by gt.teacher_user_id limit 1;
 if v_actor is null then raise exception 'fixture_requires_allocated_economics_teacher'; end if;
 select student_id into v_student from private.teacher_assignment_authorized_students(
   v_actor,v_school,'Economics',null,null) limit 1;
 if v_student is null then raise exception 'fixture_requires_authorized_student'; end if;
 select q.id,'registry:'||rv.code||':'||n.code,f.code
 into v_question,v_skill_key,v_focus
 from public.questions q
 join public.verified_question_registry_taxonomy tx on tx.question_id=q.id
 join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id
 join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id
 join public.academic_skill_evidence_focuses f on f.id=tx.evidence_focus_id
 where q.verified_external_id='bh-econ-0455-p1-v1-008' and n.name='Demand shifts and movements';
 if v_question is null then raise exception 'fixture_requires_economics_bank'; end if;
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 if not exists(select 1 from public.get_all_active_questions('Economics') q where q.id=v_question) then
   raise exception 'teacher_catalogue_missing_registry_question';
 end if;
 v_result:=public.rpc_question_curriculum_metadata(array[v_question]);
 if not exists(select 1 from public.rpc_teacher_questions_by_ids(array[v_question]) q where q.id=v_question) then
   raise exception 'bounded_candidate_loading_missing_question'; end if;
 if jsonb_array_length(v_result->0->'registryMappings')<1 then raise exception 'teacher_metadata_missing'; end if;
 v_result:=private.verified_questions_for_learning_focus(v_student,'Economics',v_skill_key,null,'Demand','Demand shifts and movements',v_focus);
 if not (v_result->'recommended_question_ids' @> to_jsonb(array[v_question])) then
   raise exception 'exact_focus_question_not_recommended'; end if;
 v_result:=private.verified_questions_for_learning_focus(v_student,'Economics',v_skill_key,null,'Demand','Demand shifts and movements','does-not-exist');
 if (v_result->>'available_exact_question_count')::integer<>0 then
   raise exception 'wrong_evidence_focus_treated_as_exact'; end if;
 v_result:=private.verified_questions_for_learning_focus(v_student,'English',v_skill_key,null,'Demand',null,v_focus);
 if (v_result->>'available_question_count')::integer<>0 then raise exception 'cross_subject_leak'; end if;
 select a.id into v_assignment from public.rpc_create_assignment(
 v_teacher,'economics','Economics','Demand',null,array[v_question],now(),now()+interval '1 day',
 'Rollback tracking regression','Verification','easy','classwork','UTC','custom',
 array[v_student],null,'draft',false,false) a;
 perform set_config('request.jwt.claim.sub',v_student::text,true);
 perform public.rpc_submit_assignment_answer_v2(v_assignment,v_question,null,null,'Incorrect regression answer',false,1000);
 perform public.rpc_submit_assignment_result_v2(v_assignment,0,1,0,0,1);
 select count(*) into v_before from public.student_learning_registry_item_evidence where assignment_id=v_assignment;
 if v_before<1 then raise exception 'answer_missing_registry_evidence'; end if;
 perform public.rpc_submit_assignment_result_v2(v_assignment,0,1,0,0,1);
 perform private.ingest_verified_assignment_registry_evidence(v_assignment,v_student);
 if (select count(*) from public.student_learning_registry_item_evidence where assignment_id=v_assignment)<>v_before
 then raise exception 'duplicate_evidence_on_retry'; end if;
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 v_profile:=public.rpc_student_academic_profile(v_student,'Economics',null,null);
 if not exists(select 1 from jsonb_array_elements(v_profile->'timeline') o
   where o->>'source_id'=v_assignment::text and o->>'subskill'='Demand shifts and movements')
 then raise exception 'academic_profile_missing_subskill'; end if;
 v_workspace:=public.rpc_teacher_student_intervention_workspace_v2(v_student,'Economics');
 if not exists(select 1 from jsonb_array_elements(v_workspace->'recommendations') r
   where r->>'skill_key'=v_skill_key and r->'exact_question_ids' @> to_jsonb(array[v_question]))
 then raise exception 'intervention_workspace_missing_exact_questions'; end if;
 -- Late linking must remove attainment contributions while preserving append-only item history.
 perform public.rpc_teacher_register_intervention_practice(v_assignment,v_student,v_skill_key,'[]',null);
 perform private.ingest_verified_assignment_registry_evidence(v_assignment,v_student);
 if exists(select 1 from public.student_learning_observations
   where source_id=v_assignment and contributes_to_focus_state)
 then raise exception 'practice_contaminates_mastery_evidence'; end if;
 if (select count(*) from public.student_learning_registry_item_evidence where assignment_id=v_assignment)<>v_before
 then raise exception 'practice_rewrites_item_history'; end if;
 -- A fresh practice assignment is marked before answers arrive.
 select a.id into v_assignment from public.rpc_create_intervention_practice_assignment(
 v_teacher,'economics','Economics','Demand',array[v_question],now(),now()+interval '1 day',
 'Rollback practice regression','Verification','easy',v_student,v_skill_key,'[]',
 'classwork','UTC',null,'draft',false,false) a;
 perform set_config('request.jwt.claim.sub',v_student::text,true);
 perform public.rpc_submit_assignment_answer_v2(v_assignment,v_question,null,null,
   (select correct_answer from public.questions where id=v_question),true,1000);
 perform public.rpc_submit_assignment_result_v2(v_assignment,1,0,100,1,1);
 if exists(select 1 from public.student_learning_registry_item_evidence where assignment_id=v_assignment and is_independent_assessment)
   or exists(select 1 from public.student_learning_observations where source_id=v_assignment and contributes_to_focus_state)
 then raise exception 'fresh_practice_counts_as_mastery'; end if;
end;
$test$;
select 'Economics tracking and intervention regression passed' result;
rollback;
