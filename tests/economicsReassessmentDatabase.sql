-- Live RPC regression. No assignments, answers or student changes survive rollback.
begin;
do $test$
declare
 v_actor uuid; v_teacher uuid; v_school uuid; v_student uuid;
 v_question uuid; v_fresh uuid; v_assignment uuid; v_first uuid;
 v_skill_key text; v_focus text; v_result jsonb; v_answer text; v_items integer;
begin
 select gt.teacher_user_id,t.id,gt.school_id into v_actor,v_teacher,v_school
 from public.school_subject_group_teachers gt
 join public.teachers t on t.user_id=gt.teacher_user_id
 join public.school_subject_groups g on g.id=gt.group_id and g.status='active'
 join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.status='active'
 join public.school_subjects ss on ss.id=o.school_subject_id
 where public.academic_normalize_subject_key(ss.name)='economics' and gt.active
 order by gt.teacher_user_id limit 1;
 select student_id into v_student from private.teacher_assignment_authorized_students(
   v_actor,v_school,'Economics',null,null) limit 1;
 if v_student is null then raise exception 'fixture_requires_allocated_student'; end if;
 select q.id into v_question from public.questions q
 where q.verified_external_id='bh-econ-0455-expand-v1-08-4';
 select q.id into v_fresh from public.questions q
 where q.verified_external_id='bh-econ-0455-expand-v1-08-5';
 if v_question is null or v_fresh is null then raise exception 'expanded_bank_missing'; end if;
 if exists(select 1 from public.student_assignment_answers where student_id=v_student
   and question_id in (v_question,v_fresh)) then raise exception 'fixture_requires_unseen_reserve_items'; end if;
 select 'registry:'||rv.code||':'||n.code,f.code into v_skill_key,v_focus
 from public.verified_question_registry_taxonomy tx
 join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id
 join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id
 join public.academic_skill_evidence_focuses f on f.id=tx.evidence_focus_id
 where tx.question_id=v_question and n.code='econ.markets.demand.shift-movement';
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 if (select count(*) from public.get_all_active_questions('Economics'))<>240
 then raise exception 'authorized_teacher_expansion_not_visible'; end if;
 v_result:=private.verified_questions_for_learning_focus(v_student,'Economics',v_skill_key,null,null,null,v_focus);
 if (v_result->>'available_exact_question_count')::integer<>6
 then raise exception 'exact_focus_does_not_have_six_items'; end if;
 if (v_result->>'available_fresh_reassessment_question_count')::integer<>2
 then raise exception 'two_fresh_reserve_items_required'; end if;
 if exists(select 1 from jsonb_array_elements_text(v_result->'recommended_question_ids') id
   join public.questions q on q.id=id.value::uuid where 'purpose:reassessment'=any(q.tags))
 then raise exception 'reserve_used_in_automatic_practice'; end if;

 select a.id into v_assignment from public.rpc_create_assignment(
 v_teacher,'economics','Economics','Demand',null,array[v_question],now(),now()+interval '1 day',
 'Rollback fresh checkpoint','Verification','medium','quiz','UTC','custom',
 array[v_student],null,'draft',false,false) a;
 v_first:=v_assignment;
 select correct_answer into v_answer from public.questions where id=v_question;
 perform set_config('request.jwt.claim.sub',v_student::text,true);
 perform public.rpc_submit_assignment_answer_v2(v_assignment,v_question,null,null,v_answer,true,1000);
 perform public.rpc_submit_assignment_result_v2(v_assignment,1,1,100,0,1);
 if not exists(select 1 from public.student_learning_observations where source_id=v_assignment
   and skill_key=v_skill_key and contributes_to_focus_state
   and (evidence->>'independent_mastery_evidence')::boolean)
 then raise exception 'fresh_checkpoint_does_not_contribute'; end if;
 select count(*) into v_items from public.student_learning_registry_item_evidence where assignment_id=v_first;

 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 select a.id into v_assignment from public.rpc_create_assignment(
 v_teacher,'economics','Economics','Demand',null,array[v_question],now(),now()+interval '1 day',
 'Rollback repeated checkpoint','Verification','medium','quiz','UTC','custom',
 array[v_student],null,'draft',false,false) a;
 perform set_config('request.jwt.claim.sub',v_student::text,true);
 perform public.rpc_submit_assignment_answer_v2(v_assignment,v_question,null,null,v_answer,true,1000);
 perform public.rpc_submit_assignment_result_v2(v_assignment,1,1,100,0,1);
 perform public.rpc_submit_assignment_result_v2(v_assignment,1,1,100,0,1);
 if exists(select 1 from public.student_learning_observations where source_id=v_assignment and contributes_to_focus_state)
 then raise exception 'repeated_correct_answer_inflates_mastery'; end if;
 if not exists(select 1 from public.student_learning_observations where source_id=v_assignment
   and (evidence->>'repeated_question_evidence')::boolean
   and not (evidence->>'intervention_practice')::boolean)
 then raise exception 'repetition_reason_missing_or_mislabelled'; end if;
 if (select count(*) from public.student_learning_registry_item_evidence where assignment_id=v_first)<>v_items
 then raise exception 'freshness_rewrites_immutable_history'; end if;
 v_result:=private.verified_questions_for_learning_focus(v_student,'Economics',v_skill_key,null,null,null,v_focus);
 if (v_result->>'available_fresh_reassessment_question_count')::integer<>1
   or v_result->'fresh_reassessment_question_ids' @> to_jsonb(array[v_question])
 then raise exception 'used_reserve_still_recommended_as_fresh'; end if;

 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 select a.id into v_assignment from public.rpc_create_assignment(
 v_teacher,'economics','Economics','Demand',null,array[v_fresh],now(),now()+interval '1 day',
 'Rollback fresh followup','Verification','medium','quiz','UTC','custom',
 array[v_student],null,'draft',false,false) a;
 select correct_answer into v_answer from public.questions where id=v_fresh;
 perform set_config('request.jwt.claim.sub',v_student::text,true);
 perform public.rpc_submit_assignment_answer_v2(v_assignment,v_fresh,null,null,v_answer,true,1000);
 perform public.rpc_submit_assignment_result_v2(v_assignment,1,1,100,0,1);
 if not exists(select 1 from public.student_learning_observations where source_id=v_assignment
   and skill_key=v_skill_key and contributes_to_focus_state)
 then raise exception 'distinct_fresh_followup_wrongly_excluded'; end if;
end;
$test$;
rollback;
select 'PASS: 240 authorized items; exact focus has six items; reserve holdout; fresh and repeated outcomes; immutable history and retry' as verification;
