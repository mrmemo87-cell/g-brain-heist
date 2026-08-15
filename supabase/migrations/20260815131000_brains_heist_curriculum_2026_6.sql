-- Publish the complete Brains Heist International 2026.6 snapshot.
--
-- 2026.5 remains immutable for historical evidence. This version clones that
-- snapshot and adds original, assessable objectives for the four new verified
-- question-bank scopes.

do $curriculum$
declare
  v_framework_id uuid;
  v_old_version_id uuid;
  v_new_version_id uuid := gen_random_uuid();
  v_hash text;
  v_depth integer;
begin
  select f.id, fv.id into v_framework_id, v_old_version_id
  from public.curriculum_frameworks f
  join public.curriculum_framework_versions fv on fv.framework_id = f.id
  where f.code = 'brain-heist-international'
    and fv.version_code = '2026-5' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_5_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-6'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_6_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-6', 'Brains Heist International 2026.6',
    '2026.6', 'repository:content/verified-question-packages/2026-6-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.5 snapshot plus first Grade 11 and Grade 12 Geography and Global Perspectives assessable objectives.'
  );

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name,
    sequence_number, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-6:subject:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id, old.academic_subject_id, old.code, old.name,
    old.sequence_number, old.source_reference
  from public.curriculum_framework_subjects old
  where old.framework_version_id = v_old_version_id;

  insert into public.curriculum_stages(
    id, framework_version_id, code, name, sequence_number,
    typical_age_min, typical_age_max, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-6:stage:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id, old.code, old.name, old.sequence_number,
    old.typical_age_min, old.typical_age_max, old.source_reference
  from public.curriculum_stages old
  where old.framework_version_id = v_old_version_id;

  insert into public.curriculum_scopes(
    id, framework_version_id, framework_subject_id, stage_id,
    academic_subject_id, code, name, sequence_number
  )
  select (
      substr(md5('bh-curriculum-2026-6:scope:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-6:subject:' || old.framework_subject_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.framework_subject_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.framework_subject_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.framework_subject_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:subject:' || old.framework_subject_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-6:stage:' || old.stage_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.stage_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.stage_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.stage_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:stage:' || old.stage_id::text),21,12)
    )::uuid,
    old.academic_subject_id, old.code, old.name, old.sequence_number
  from public.curriculum_scopes old
  where old.framework_version_id = v_old_version_id;

  -- Parent nodes must exist before their children, so clone by depth.
  for v_depth in 0..8 loop
    insert into public.curriculum_nodes(
      id, framework_version_id, curriculum_scope_id, parent_node_id,
      node_type, code, name, description, depth, sequence_number,
      source_reference
    )
    select (
        substr(md5('bh-curriculum-2026-6:node:' || old.id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.id::text),21,12)
      )::uuid,
      v_new_version_id,
      (
        substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),21,12)
      )::uuid,
      case when old.parent_node_id is null then null else (
        substr(md5('bh-curriculum-2026-6:node:' || old.parent_node_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.parent_node_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.parent_node_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.parent_node_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-6:node:' || old.parent_node_id::text),21,12)
      )::uuid end,
      old.node_type, old.code, old.name, old.description, old.depth,
      old.sequence_number, old.source_reference
    from public.curriculum_nodes old
    where old.framework_version_id = v_old_version_id and old.depth = v_depth;
  end loop;

  insert into public.curriculum_objectives(
    id, framework_version_id, curriculum_scope_id, curriculum_node_id,
    code, statement, objective_type, cognitive_level, is_assessable,
    command_terms, tags, sequence_number, source_reference, source_uri
  )
  select (
      substr(md5('bh-curriculum-2026-6:objective:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:scope:' || old.curriculum_scope_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-6:node:' || old.curriculum_node_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:node:' || old.curriculum_node_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:node:' || old.curriculum_node_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:node:' || old.curriculum_node_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:node:' || old.curriculum_node_id::text),21,12)
    )::uuid,
    old.code, old.statement, old.objective_type, old.cognitive_level,
    old.is_assessable, old.command_terms, old.tags, old.sequence_number,
    old.source_reference, old.source_uri
  from public.curriculum_objectives old
  where old.framework_version_id = v_old_version_id;

  insert into public.curriculum_objective_prerequisites(
    framework_version_id, objective_id, prerequisite_objective_id,
    relationship_type
  )
  select v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-6:objective:' || old.objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.objective_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-6:objective:' || old.prerequisite_objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.prerequisite_objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.prerequisite_objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.prerequisite_objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-6:objective:' || old.prerequisite_objective_id::text),21,12)
    )::uuid,
    old.relationship_type
  from public.curriculum_objective_prerequisites old
  where old.framework_version_id = v_old_version_id;

  -- Original objectives for the four newly populated scopes.
  create temporary table tmp_new_objectives(
    scope_code text, node_code text, node_name text, objective_code text,
    statement text, objective_type text, cognitive_level text,
    command_terms text[], tags text[], sequence_number integer
  ) on commit drop;

  insert into tmp_new_objectives values
    ('geography-grade-11','physical-processes','Physical landscapes and processes','geo11-physical-processes','Explain how tectonic, fluvial, coastal and weathering processes create and change physical landscapes.','application','analyse',array['explain','analyse'],array['physical geography','landscapes'],1),
    ('geography-grade-11','population-settlement','Population and settlement','geo11-population-settlement','Interpret population and settlement patterns using demographic change, migration, service provision and site factors.','application','analyse',array['interpret','explain'],array['population','settlement','migration'],2),
    ('geography-grade-11','development-resources','Development and resources','geo11-development-resources','Use indicators and resource evidence to explain development differences and evaluate sustainable resource decisions.','application','evaluate',array['use','evaluate'],array['development','resources','sustainability'],3),
    ('geography-grade-11','weather-climate','Weather and climate','geo11-weather-climate','Interpret atmospheric data and explain weather and climate patterns using energy, pressure, moisture and circulation processes.','application','analyse',array['interpret','explain'],array['weather','climate','atmosphere'],4),
    ('geography-grade-11','fieldwork-data','Geographical fieldwork and data','geo11-fieldwork-data','Design, present and evaluate geographical investigations using sampling, mapping, data analysis and risk control.','enquiry','evaluate',array['design','present','evaluate'],array['fieldwork','data','sampling'],5),
    ('geography-grade-12','hazards-resilience','Hazards and resilience','geo12-hazards-resilience','Analyse hazard risk as an interaction of physical processes, exposure, vulnerability, preparedness and recovery capacity.','application','analyse',array['analyse','evaluate'],array['hazards','risk','resilience'],1),
    ('geography-grade-12','globalisation-development','Globalisation and uneven development','geo12-globalisation-development','Evaluate how trade, investment, migration and global production networks shape places and uneven development.','application','evaluate',array['evaluate','explain'],array['globalisation','development','trade'],2),
    ('geography-grade-12','urban-systems','Urban systems and change','geo12-urban-systems','Analyse urban growth, land use, inequality, mobility and regeneration as interconnected spatial systems.','application','analyse',array['analyse','assess'],array['urban systems','inequality','mobility'],3),
    ('geography-grade-12','environmental-management','Environmental systems and management','geo12-environmental-management','Evaluate environmental change and management strategies using systems, feedbacks, stakeholders and sustainability criteria.','application','evaluate',array['evaluate','justify'],array['environment','management','systems'],4),
    ('geography-grade-12','geospatial-research','Geospatial research and evaluation','geo12-geospatial-research','Use GIS, remote sensing, spatial statistics and research evaluation to investigate geographical patterns and decisions.','enquiry','evaluate',array['use','investigate','evaluate'],array['GIS','remote sensing','research'],5),
    ('global-perspectives-grade-11','source-evaluation','Source evaluation','gp11-source-evaluation','Evaluate the credibility, relevance and limitations of sources using authorship, evidence, context and corroboration.','skill','evaluate',array['evaluate','corroborate'],array['sources','credibility','evidence'],1),
    ('global-perspectives-grade-11','perspectives-context','Perspectives and context','gp11-perspectives-culture','Compare how cultural, social, economic and political contexts shape perspectives on global issues.','application','analyse',array['compare','analyse'],array['perspectives','culture','context'],2),
    ('global-perspectives-grade-11','research-methods','Research methods','gp11-research-methods','Select and apply ethical quantitative and qualitative research methods using valid sampling, questions and data handling.','enquiry','apply',array['select','apply'],array['research','methods','ethics'],3),
    ('global-perspectives-grade-11','argument-reasoning','Argument and reasoning','gp11-argument-reasoning','Construct and assess arguments by distinguishing claims, evidence, assumptions, counterarguments and reasoning errors.','skill','evaluate',array['construct','assess'],array['argument','reasoning','evidence'],4),
    ('global-perspectives-grade-11','collaboration-action','Collaboration and action','gp11-collaboration-action','Collaborate to plan, implement and evaluate responsible action using roles, stakeholders, evidence and reflection.','skill','evaluate',array['collaborate','plan','evaluate'],array['collaboration','action','reflection'],5),
    ('global-perspectives-grade-12','evidence-synthesis','Evidence synthesis','gp12-evidence-synthesis','Synthesize diverse evidence by evaluating quality, reconciling disagreement and producing appropriately qualified conclusions.','skill','evaluate',array['synthesize','evaluate'],array['evidence','synthesis','conclusions'],1),
    ('global-perspectives-grade-12','global-systems','Global systems and interdependence','gp12-global-systems','Analyse global issues as interconnected systems involving feedbacks, trade-offs, power and cross-border effects.','application','analyse',array['analyse','explain'],array['systems','interdependence','trade-offs'],2),
    ('global-perspectives-grade-12','ethics-policy','Ethics and policy evaluation','gp12-ethics-policy','Evaluate policy options using rights, consequences, justice, feasibility, stakeholder power and uncertainty.','application','evaluate',array['evaluate','justify'],array['ethics','policy','justice'],3),
    ('global-perspectives-grade-12','research-evaluation','Advanced research evaluation','gp12-research-evaluation','Evaluate research validity, reliability, causality, ethics and uncertainty using design and statistical reasoning.','enquiry','evaluate',array['evaluate','interpret'],array['research','validity','causality'],4),
    ('global-perspectives-grade-12','communication-reflection','Communication and reflection','gp12-communication-reflection','Communicate complex conclusions for audiences and critically reflect on limitations, positionality and future improvement.','skill','create',array['communicate','reflect'],array['communication','reflection','positionality'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Original Brains Heist strand for the 2026.6 verified question release.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-6'
  from tmp_new_objectives o
  join public.curriculum_scopes s
    on s.framework_version_id = v_new_version_id and s.code = o.scope_code;

  insert into public.curriculum_objectives(
    framework_version_id, curriculum_scope_id, curriculum_node_id,
    code, statement, objective_type, cognitive_level, is_assessable,
    command_terms, tags, sequence_number, source_reference, source_uri
  )
  select v_new_version_id, s.id, n.id, o.objective_code, o.statement,
    o.objective_type, o.cognitive_level, true, o.command_terms, o.tags,
    o.sequence_number, 'bh-verified-question-curriculum-2026-6',
    'repository:content/verified-question-packages/2026-6-0'
  from tmp_new_objectives o
  join public.curriculum_scopes s
    on s.framework_version_id = v_new_version_id and s.code = o.scope_code
  join public.curriculum_nodes n
    on n.curriculum_scope_id = s.id and n.code = o.node_code;

  select encode(extensions.digest(coalesce(string_agg(value, E'\n' order by value), ''), 'sha256'), 'hex')
  into v_hash
  from (
    select concat_ws('|', 'subject', fs.code, fs.name) value
      from public.curriculum_framework_subjects fs where fs.framework_version_id = v_new_version_id
    union all
    select concat_ws('|', 'stage', st.code, st.name, st.sequence_number::text)
      from public.curriculum_stages st where st.framework_version_id = v_new_version_id
    union all
    select concat_ws('|', 'scope', cs.code, cs.name)
      from public.curriculum_scopes cs where cs.framework_version_id = v_new_version_id
    union all
    select concat_ws('|', 'node', cs.code, n.code, n.node_type, n.name)
      from public.curriculum_nodes n
      join public.curriculum_scopes cs on cs.id = n.curriculum_scope_id
      where n.framework_version_id = v_new_version_id
    union all
    select concat_ws('|', 'objective', cs.code, o.code, o.statement)
      from public.curriculum_objectives o
      join public.curriculum_scopes cs on cs.id = o.curriculum_scope_id
      where o.framework_version_id = v_new_version_id
  ) content_rows;

  update public.curriculum_framework_versions
  set reviewed_by_authority = 'Brains Heist Content Quality',
      approved_by_authority = 'Brains Heist Academic Governance',
      content_hash = v_hash, status = 'in_review'
  where id = v_new_version_id;
  update public.curriculum_framework_versions set status = 'approved' where id = v_new_version_id;
  update public.curriculum_framework_versions set status = 'published' where id = v_new_version_id;
end;
$curriculum$;


