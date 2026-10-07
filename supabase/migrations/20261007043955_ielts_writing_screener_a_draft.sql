-- Original AI-assisted draft 0.1.0 / BH-WS-A-1, under IELTS Bible v1.2.0.
-- No human approval, publication, release, student assignment or scoring is asserted.
set lock_timeout='5s';
do $draft$
declare registry uuid; node uuid; event uuid; form uuid; definition uuid;
begin
 if exists(select 1 from private.ielts_diagnostic_definitions where code='bh-writing-screener-a') then raise exception 'writing_draft_already_exists'; end if;
 select id into registry from public.academic_skill_registry_versions where code='bh-english-core-v1' and status='published';
 select id into node from public.academic_skill_registry_nodes where registry_version_id=registry and code='eng.writing.content-development.task-relevance' and status='active';
 if registry is null or node is null then raise exception 'writing_canonical_registry_required'; end if;
 insert into public.ielts_exam_events(title,description,status,starts_at,ends_at,duration_minutes)
 values('Academic Writing Screener A','Unpublished original Task 2 draft; human content review and controlled delivery acceptance required.','draft',now(),now()+interval '1 year',40) returning id into event;
 insert into public.ielts_exam_forms(exam_event_id,form_code,writing_payload,is_active)
 values(event,'BH-WS-A-1','{"assessment_mode":"screener","title":"Academic Writing Screener A","instructions":"Write an essay in response to the task below. Explain your ideas and support them with relevant reasons and examples. Write at least 250 words. You have 40 minutes, including time to plan and check your work.","task_type":"academic_task2","minimum_words":250,"rubric_version":"bh-ielts-task2-observations-v1","questions":[{"id":"ws_a_task2","prompt":"Some people believe that schools should give students more time to explore subjects they choose themselves. Others believe that schools should spend that time teaching a common set of subjects to every student.\n\nDiscuss both views and give your own opinion.","type":"essay"}]}'::jsonb,false) returning id into form;
 insert into private.ielts_diagnostic_definitions(code,title) values('bh-writing-screener-a','Academic Writing Screener A') returning id into definition;
 insert into private.ielts_diagnostic_versions(definition_id,version,exam_form_id,mode,test_type,skills,state,taxonomy_version_id,scoring_policy_version,provenance,review_record)
 values(definition,1,form,'screener','academic',array['writing'],'draft',registry,'ielts-writing-task2-snapshot-v1','{"author":"Brains Heist / AI-assisted original draft","rights_holder":"Brains Heist LLC","rights_basis":"Original Brains Heist task; no third-party sample task reproduced.","content_version":"0.1.0 / BH-WS-A-1","criterion_mappings":{"task_response":["eng.writing.content-development.task-relevance","eng.writing.content-development.develop-ideas","eng.writing.content-development.support-examples"],"coherence_cohesion":["eng.writing.organization-cohesion.logical-order","eng.writing.organization-cohesion.paragraphing","eng.writing.organization-cohesion.reference"],"lexical_resource":["eng.writing.vocabulary-control.precision","eng.writing.vocabulary-control.range","eng.writing.vocabulary-control.collocation"],"grammar_range_accuracy":["eng.writing.sentence-control.variety","eng.writing.grammar-control.accuracy","eng.writing.mechanics.punctuation"]}}'::jsonb,
 '{"draft":true,"requires_human_review":true,"academic_review":"pending","delivery_acceptance":"pending"}');
 insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,taxonomy_node_id)
 select id,'ws_a_task2','academic-task2','writing',1,'writing','Some people believe that schools should give students more time to explore subjects they choose themselves. Others believe that schools should spend that time teaching a common set of subjects to every student.

Discuss both views and give your own opinion.',node from private.ielts_diagnostic_versions where definition_id=definition and version=1;
end $draft$;
