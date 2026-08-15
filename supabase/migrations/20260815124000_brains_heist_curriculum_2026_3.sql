-- Publish the complete Brains Heist International 2026.3 snapshot.
--
-- 2026.2 remains immutable for historical evidence. This version clones that
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
    and fv.version_code = '2026-2' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_2_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-3'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_3_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-3', 'Brains Heist International 2026.3',
    '2026.3', 'repository:content/verified-question-packages/2026-3-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.2 snapshot plus Grade 12 Chemistry, Biology, English and Physics assessable objectives.'
  );

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name,
    sequence_number, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-3:subject:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-3:stage:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-3:scope:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-3:subject:' || old.framework_subject_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.framework_subject_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.framework_subject_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.framework_subject_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:subject:' || old.framework_subject_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-3:stage:' || old.stage_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.stage_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.stage_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.stage_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:stage:' || old.stage_id::text),21,12)
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
        substr(md5('bh-curriculum-2026-3:node:' || old.id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.id::text),21,12)
      )::uuid,
      v_new_version_id,
      (
        substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),21,12)
      )::uuid,
      case when old.parent_node_id is null then null else (
        substr(md5('bh-curriculum-2026-3:node:' || old.parent_node_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.parent_node_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.parent_node_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.parent_node_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-3:node:' || old.parent_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-3:objective:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:scope:' || old.curriculum_scope_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-3:node:' || old.curriculum_node_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:node:' || old.curriculum_node_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:node:' || old.curriculum_node_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:node:' || old.curriculum_node_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:node:' || old.curriculum_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-3:objective:' || old.objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.objective_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-3:objective:' || old.prerequisite_objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.prerequisite_objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.prerequisite_objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.prerequisite_objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-3:objective:' || old.prerequisite_objective_id::text),21,12)
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
    ('chemistry-grade-12','quantitative-equilibria','Quantitative chemistry and equilibria','chem12-quantitative-equilibria','Perform quantitative chemical calculations and interpret acid-base, buffer and equilibrium systems using appropriate relationships.','application','analyse',array['calculate','interpret'],array['stoichiometry','acid-base','equilibrium'],1),
    ('chemistry-grade-12','energetics-and-kinetics','Energetics and kinetics','chem12-energetics-kinetics','Analyse thermodynamic and kinetic evidence to predict feasibility, rate behaviour and the effects of changing conditions.','application','analyse',array['analyse','predict'],array['thermodynamics','kinetics'],2),
    ('chemistry-grade-12','redox-and-electrochemistry','Redox and electrochemistry','chem12-redox-electrochem','Use oxidation, cell-potential and electrolysis principles to explain electron transfer and calculate electrochemical outcomes.','application','analyse',array['explain','calculate'],array['redox','electrochemistry'],3),
    ('chemistry-grade-12','organic-synthesis','Organic synthesis','chem12-organic-synthesis','Select reagents, mechanisms and structural evidence to plan organic transformations and evaluate products or polymers.','application','evaluate',array['select','deduce','evaluate'],array['organic chemistry','synthesis'],4),
    ('chemistry-grade-12','analysis-and-practical','Chemical analysis and practical skills','chem12-analysis-practical','Interpret spectroscopic, chromatographic and experimental data while evaluating uncertainty, validity and practical method quality.','skill','evaluate',array['interpret','evaluate'],array['analysis','practical skills'],5),
    ('biology-grade-12','molecular-genetics','Molecular genetics and gene expression','bio12-molecular-genetics','Explain and interpret DNA replication, gene expression, mutation and regulation using molecular evidence.','application','analyse',array['explain','interpret'],array['DNA','gene expression','mutation'],1),
    ('biology-grade-12','inheritance-and-biotechnology','Inheritance and biotechnology','bio12-inheritance-biotech','Apply inheritance models and biotechnology techniques to predict outcomes and evaluate genetic evidence.','application','evaluate',array['predict','evaluate'],array['inheritance','biotechnology'],2),
    ('biology-grade-12','homeostasis-and-coordination','Homeostasis and coordination','bio12-homeostasis-coordination','Analyse nervous, hormonal and excretory control systems to explain coordinated responses and homeostatic regulation.','application','analyse',array['analyse','explain'],array['homeostasis','coordination'],3),
    ('biology-grade-12','ecology-and-evolution','Ecology and evolution','bio12-ecology-evolution','Use population, ecological and evolutionary evidence to explain change and evaluate conservation or management decisions.','application','evaluate',array['explain','evaluate'],array['ecology','evolution','conservation'],4),
    ('biology-grade-12','experimental-biology','Experimental biology and data','bio12-experimental-data','Design, interpret and evaluate biological investigations using controls, sampling, statistics and uncertainty.','skill','evaluate',array['design','interpret','evaluate'],array['investigation','statistics','data'],5),
    ('english-grade-12','close-reading','Close reading and interpretation','eng12-close-reading','Develop precise interpretations of complex texts through close analysis of language, structure, pattern and evidence.','skill','analyse',array['interpret','analyse'],array['reading','language','structure'],1),
    ('english-grade-12','comparative-evaluation','Comparative and source evaluation','eng12-comparative-evaluation','Compare perspectives and evaluate the reliability, assumptions and evidence of complex literary and informational sources.','skill','evaluate',array['compare','evaluate'],array['comparison','sources'],2),
    ('english-grade-12','argument-and-rhetoric','Argument and rhetoric','eng12-argument-rhetoric','Analyse and construct arguments by evaluating reasoning, evidence, counterclaims and rhetorical choices.','skill','evaluate',array['analyse','construct','evaluate'],array['argument','rhetoric'],3),
    ('english-grade-12','writing-craft','Writing craft and control','eng12-writing-craft','Create controlled, coherent writing by shaping thesis, organisation, syntax, register and editing choices for purpose and audience.','skill','create',array['create','edit'],array['writing','craft','accuracy'],4),
    ('english-grade-12','research-and-synthesis','Research and synthesis','eng12-research-synthesis','Synthesize ideas and data from multiple sources using accurate attribution, paraphrase and evidence integration.','skill','create',array['synthesize','integrate'],array['research','synthesis','citation'],5),
    ('physics-grade-12','advanced-mechanics','Advanced mechanics','phys12-mechanics','Apply force, momentum, energy and circular-motion models to solve and interpret multi-step mechanics problems.','application','analyse',array['apply','calculate'],array['mechanics','momentum','energy'],1),
    ('physics-grade-12','fields-and-electricity','Fields and electricity','phys12-fields-electricity','Analyse electric circuits, fields and capacitive systems using quantitative models and conservation principles.','application','analyse',array['analyse','calculate'],array['electricity','fields','capacitance'],2),
    ('physics-grade-12','waves-and-quantum','Waves and quantum physics','phys12-waves-quantum','Interpret wave, interference and quantum evidence to explain behaviour and calculate measurable outcomes.','application','analyse',array['interpret','calculate'],array['waves','quantum physics'],3),
    ('physics-grade-12','thermal-and-nuclear','Thermal and nuclear physics','phys12-thermal-nuclear','Apply thermal, gas and nuclear models to explain energy transfer, decay and particle-level behaviour.','application','analyse',array['apply','explain'],array['thermal physics','nuclear physics'],4),
    ('physics-grade-12','experimental-physics','Experimental physics and data','phys12-experimental-data','Design and evaluate physical investigations using graphs, uncertainty, dimensional reasoning and valid control of variables.','skill','evaluate',array['design','evaluate'],array['experiments','uncertainty','data'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Original Brains Heist strand for the 2026.3 verified question release.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-3'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-3',
    'repository:content/verified-question-packages/2026-3-0'
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
