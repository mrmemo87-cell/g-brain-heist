-- Creates a shared, subject-specific DRAFT. Does not publish, adopt, approve
-- mappings, supersede previous content, or recalculate any student evidence.
-- Bank-derived coverage is PARTIAL: it is not a complete external syllabus.
do $draft$
declare
 v_framework uuid:=md5('bh-english-objectives:framework')::uuid;
 v_version uuid:=md5('bh-english-objectives:2026-precision-1')::uuid;
 v_subject uuid; v_framework_subject uuid:=md5('bh-english-objectives:2026-precision-1:english')::uuid;
 g integer; v_scope uuid; v_stage uuid;
begin
 select id into strict v_subject from public.academic_subjects where code='english' and is_active;
 if exists(select 1 from public.curriculum_framework_versions where id=v_version) then
  raise notice 'English precision draft already exists; no content overwritten';return;
 end if;
 insert into public.curriculum_frameworks(id,code,name,provider_name,programme_name,authority_type,visibility)
 values(v_framework,'bh-english-learning-objectives','Brains Heist English Learning Objectives','Brains Heist','Shared English learning objectives','brain_heist_original','global')
 on conflict(id) do nothing;
 insert into public.curriculum_framework_versions(id,framework_id,version_code,display_name,source_version,source_uri,source_license,status,release_notes)
 values(v_version,v_framework,'2026-precision-1','English learning objectives — precision review draft','bh-english-core-v1',
 'repository:content/english-curriculum-repair','Brains Heist original educational content','draft',
 'Partial bank-derived Grade 7/8 review draft. Exact evidence-focus candidates require editorial review, including overlaps and grade suitability. No school has been migrated. Not an official or complete external syllabus.');
 insert into public.curriculum_framework_subjects(id,framework_version_id,academic_subject_id,code,name)
 values(v_framework_subject,v_version,v_subject,'english','English');
 create temporary table english_precision_candidates on commit drop as
 select distinct g.grade_value,ef.id focus_id,ef.code focus_code,ef.name focus_name,skill.id skill_id,skill.name skill_name,sub.name subskill_name,strand.id strand_id,strand.name strand_name
 from public.questions q
 join public.verified_question_registry_taxonomy tx on tx.question_id=q.id and tx.question_content_hash=q.current_content_hash and tx.review_status='approved' and not tx.human_review_required
 join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published' and rv.code='bh-english-core-v1'
 join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id and skill.node_type='skill' and skill.status='active'
 join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id and strand.registry_version_id=rv.id and strand.node_type='strand' and strand.status='active'
 join public.academic_skill_registry_nodes sub on sub.id=tx.atomic_subskill_node_id and sub.registry_version_id=rv.id and sub.node_type='subskill' and sub.parent_id=skill.id and sub.status='active'
 join public.academic_skill_evidence_focuses ef on ef.id=tx.evidence_focus_id and ef.registry_version_id=rv.id and ef.atomic_subskill_node_id=sub.id and ef.status='active'
 cross join lateral unnest(q.eligible_grade_levels) g(grade_value)
 where q.academic_subject_id=v_subject and q.is_active and q.verification_status='verified' and q.analytics_eligible
  and q.current_content_hash=q.verified_content_hash and q.pool_scope='global' and q.content_origin='brain_heist'
  and q.owner_school_id is null and q.is_public and g.grade_value in (7,8);
 foreach g in array array[7,8] loop
  v_stage:=md5(v_version::text||':grade:'||g)::uuid;
  v_scope:=md5(v_version::text||':scope:'||g)::uuid;
  insert into public.curriculum_stages(id,framework_version_id,code,name,sequence_number)
  values(v_stage,v_version,'grade-'||g,'Grade '||g,g);
  insert into public.curriculum_scopes(id,framework_version_id,framework_subject_id,stage_id,academic_subject_id,code,name,sequence_number,coverage_status)
  values(v_scope,v_version,v_framework_subject,v_stage,v_subject,'english-grade-'||g,'English · Grade '||g||' · Partial review draft',g,'partial');
  insert into public.curriculum_nodes(id,framework_version_id,curriculum_scope_id,node_type,code,name,depth,sequence_number)
  select md5(v_scope::text||':strand:'||c.strand_id)::uuid,v_version,v_scope,'strand','strand-'||md5(c.strand_id::text),c.strand_name,0,row_number() over(order by c.strand_name)
  from (select distinct strand_id,strand_name from english_precision_candidates where grade_value=g)c;
  insert into public.curriculum_nodes(id,framework_version_id,curriculum_scope_id,parent_node_id,node_type,code,name,depth,sequence_number)
  select md5(v_scope::text||':topic:'||c.skill_id)::uuid,v_version,v_scope,md5(v_scope::text||':strand:'||c.strand_id)::uuid,'topic','topic-'||md5(c.skill_id::text),c.skill_name,1,row_number() over(order by c.skill_name)
  from (select distinct skill_id,skill_name,strand_id from english_precision_candidates where grade_value=g)c;
  insert into public.curriculum_objectives(id,framework_version_id,curriculum_scope_id,curriculum_node_id,code,statement,objective_type,is_assessable,sequence_number,source_reference,assessment_boundary,registry_evidence_focus_id)
  select md5(v_scope::text||':objective:'||c.focus_id)::uuid,v_version,v_scope,md5(v_scope::text||':topic:'||c.skill_id)::uuid,
   'focus-'||md5(c.focus_id::text),c.focus_name,'skill',true,row_number() over(order by c.skill_name,c.focus_name,c.focus_code),c.focus_code,
   'Assess only: '||c.focus_name||'. Evidence does not establish the other outcomes within '||c.subskill_name||'.',c.focus_id
  from english_precision_candidates c where c.grade_value=g;
 end loop;
end;
$draft$;
