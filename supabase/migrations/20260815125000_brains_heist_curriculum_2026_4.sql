-- Publish the complete Brains Heist International 2026.4 snapshot.
--
-- 2026.3 remains immutable for historical evidence. This version clones that
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
    and fv.version_code = '2026-3' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_3_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-4'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_4_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-4', 'Brains Heist International 2026.4',
    '2026.4', 'repository:content/verified-question-packages/2026-4-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.3 snapshot plus deeper Grade 11 Chemistry and Biology, and first Grade 11 Physics and Travel & Tourism assessable objectives.'
  );

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name,
    sequence_number, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-4:subject:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-4:stage:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-4:scope:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-4:subject:' || old.framework_subject_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.framework_subject_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.framework_subject_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.framework_subject_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:subject:' || old.framework_subject_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-4:stage:' || old.stage_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.stage_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.stage_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.stage_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:stage:' || old.stage_id::text),21,12)
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
        substr(md5('bh-curriculum-2026-4:node:' || old.id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.id::text),21,12)
      )::uuid,
      v_new_version_id,
      (
        substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),21,12)
      )::uuid,
      case when old.parent_node_id is null then null else (
        substr(md5('bh-curriculum-2026-4:node:' || old.parent_node_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.parent_node_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.parent_node_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.parent_node_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-4:node:' || old.parent_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-4:objective:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:scope:' || old.curriculum_scope_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-4:node:' || old.curriculum_node_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:node:' || old.curriculum_node_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:node:' || old.curriculum_node_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:node:' || old.curriculum_node_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:node:' || old.curriculum_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-4:objective:' || old.objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.objective_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-4:objective:' || old.prerequisite_objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.prerequisite_objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.prerequisite_objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.prerequisite_objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-4:objective:' || old.prerequisite_objective_id::text),21,12)
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
    ('chemistry-grade-11','depth-quantitative','Quantitative chemistry and data','chem11-depth-quantitative','Solve multi-step stoichiometric, composition and measurement problems using chemically valid assumptions and units.','application','analyse',array['calculate','interpret'],array['stoichiometry','composition','data'],1),
    ('chemistry-grade-11','depth-materials','Bonding and material properties','chem11-depth-materials','Use bonding, structure and intermolecular-force models to explain and predict material properties.','application','analyse',array['explain','predict'],array['bonding','materials'],2),
    ('chemistry-grade-11','depth-physical','Energetics, rates and equilibrium','chem11-depth-physical','Interpret energetic, kinetic and equilibrium evidence to calculate outcomes and explain changes in chemical systems.','application','analyse',array['interpret','calculate'],array['energetics','kinetics','equilibrium'],3),
    ('chemistry-grade-11','depth-inorganic-redox','Inorganic chemistry and redox','chem11-depth-inorganic-redox','Apply periodic, inorganic and electron-transfer principles to predict reactions and balance redox processes.','application','analyse',array['apply','balance'],array['inorganic','redox'],4),
    ('chemistry-grade-11','depth-organic','Organic pathways and identification','chem11-depth-organic','Predict organic products and select reaction or analytical evidence to distinguish structures and pathways.','application','evaluate',array['predict','select'],array['organic chemistry','analysis'],5),
    ('biology-grade-11','depth-cell-processes','Cell processes and membranes','bio11-depth-cell-processes','Apply membrane, organelle and transport models to explain cell responses and energy-dependent processes.','application','analyse',array['apply','explain'],array['cells','membranes','transport'],1),
    ('biology-grade-11','depth-biochemistry','Biochemistry and enzymes','bio11-depth-biochemistry','Relate molecular structure and enzyme evidence to biological function, inhibition and reaction conditions.','application','analyse',array['relate','interpret'],array['biochemistry','enzymes'],2),
    ('biology-grade-11','depth-genetics','Genetics and variation','bio11-depth-genetics','Use cell division, inheritance and chromosome evidence to predict genetic outcomes and sources of variation.','application','analyse',array['predict','explain'],array['genetics','variation'],3),
    ('biology-grade-11','depth-physiology','Exchange and physiology','bio11-depth-physiology','Analyse exchange, transport and excretory adaptations that maintain efficient organism function.','application','analyse',array['analyse','explain'],array['exchange','physiology'],4),
    ('biology-grade-11','depth-ecology-data','Ecology and investigation','bio11-depth-ecology-data','Interpret ecological patterns and design valid biological investigations using sampling, controls and quantitative evidence.','skill','evaluate',array['interpret','design'],array['ecology','investigation'],5),
    ('physics-grade-11','measurement-motion','Measurement and motion','phys11-measurement-motion','Use scalar, vector, graphical and kinematic relationships to describe and calculate motion.','application','apply',array['describe','calculate'],array['measurement','motion'],1),
    ('physics-grade-11','forces-energy','Forces, energy and power','phys11-forces-energy','Apply force, work, energy and power principles to balanced and accelerating mechanical systems.','application','analyse',array['apply','calculate'],array['forces','energy','power'],2),
    ('physics-grade-11','waves-thermal','Waves and thermal physics','phys11-waves-thermal','Explain and calculate wave and thermal behaviour using particle, energy-transfer and refraction models.','application','analyse',array['explain','calculate'],array['waves','thermal physics'],3),
    ('physics-grade-11','electricity-fields','Electricity and fields','phys11-electricity-fields','Analyse charge, current, resistance, power and potential-divider behaviour in electric circuits.','application','analyse',array['analyse','calculate'],array['electricity','circuits'],4),
    ('physics-grade-11','practical-data','Practical physics and data','phys11-practical-data','Interpret graphs and evaluate physical measurements using uncertainty, calibration and valid variable control.','skill','evaluate',array['interpret','evaluate'],array['practical skills','data'],5),
    ('travel-tourism-grade-11','industry-motivation','Industry structure and motivation','tt11-industry-motivation','Explain tourism-sector relationships and use visitor motivation to interpret demand and product choices.','application','analyse',array['explain','interpret'],array['industry','motivation'],1),
    ('travel-tourism-grade-11','destination-impacts','Destination development and impacts','tt11-destination-impacts','Analyse carrying capacity, seasonality, lifecycle position and tourism impacts when evaluating destination decisions.','application','evaluate',array['analyse','evaluate'],array['destinations','impacts'],2),
    ('travel-tourism-grade-11','customer-communication','Customer care and communication','tt11-customer-communication','Apply inclusive communication and service-recovery principles to meet visitor needs and resolve service failures.','application','apply',array['apply','resolve'],array['customer care','communication'],3),
    ('travel-tourism-grade-11','marketing-research','Marketing and research','tt11-marketing-research','Use segmentation, primary research, product lifecycle and the marketing mix to support tourism decisions.','application','analyse',array['use','analyse'],array['marketing','research'],4),
    ('travel-tourism-grade-11','operations-itinerary','Operations and itinerary planning','tt11-operations-itinerary','Calculate and plan feasible tourism operations using itineraries, capacity, contingency and commercial information.','application','evaluate',array['calculate','plan'],array['operations','itinerary'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Original Brains Heist strand for the 2026.4 verified question release.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-4'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-4',
    'repository:content/verified-question-packages/2026-4-0'
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
