-- Publish the complete Brain Heist International 2026.2 snapshot.
--
-- 2026.1 remains immutable for historical evidence. This version clones that
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
    and fv.version_code = '2026-1' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_1_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-2'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_2_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-2', 'Brain Heist International 2026.2',
    '2026.2', 'repository:content/verified-question-packages/2026-2-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.1 snapshot plus Grade 11 Chemistry, English and Biology, and Grade 12 Travel & Tourism assessable objectives.'
  );

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name,
    sequence_number, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-2:subject:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-2:stage:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-2:scope:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-2:subject:' || old.framework_subject_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.framework_subject_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.framework_subject_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.framework_subject_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:subject:' || old.framework_subject_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-2:stage:' || old.stage_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.stage_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.stage_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.stage_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:stage:' || old.stage_id::text),21,12)
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
        substr(md5('bh-curriculum-2026-2:node:' || old.id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.id::text),21,12)
      )::uuid,
      v_new_version_id,
      (
        substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),21,12)
      )::uuid,
      case when old.parent_node_id is null then null else (
        substr(md5('bh-curriculum-2026-2:node:' || old.parent_node_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.parent_node_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.parent_node_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.parent_node_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-2:node:' || old.parent_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-2:objective:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:scope:' || old.curriculum_scope_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-2:node:' || old.curriculum_node_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:node:' || old.curriculum_node_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:node:' || old.curriculum_node_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:node:' || old.curriculum_node_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:node:' || old.curriculum_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-2:objective:' || old.objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.objective_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-2:objective:' || old.prerequisite_objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.prerequisite_objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.prerequisite_objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.prerequisite_objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-2:objective:' || old.prerequisite_objective_id::text),21,12)
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
    ('chemistry-grade-11','amount-and-atomic-structure','Amount and atomic structure','chem11-amount-atomic','Calculate amounts of substance and interpret atomic or mass-spectrometric data using appropriate chemical relationships.','application','apply',array['calculate','interpret'],array['stoichiometry','atomic structure'],1),
    ('chemistry-grade-11','bonding-and-structure','Bonding and structure','chem11-bonding-structure','Explain and predict properties of substances from bonding, intermolecular forces and three-dimensional structure.','understanding','analyse',array['explain','predict'],array['bonding','structure'],2),
    ('chemistry-grade-11','physical-chemistry','Energetics, kinetics and equilibria','chem11-physical-chemistry','Apply energetic, kinetic and equilibrium principles to explain observations and predict the effect of changing conditions.','application','analyse',array['apply','predict'],array['energetics','kinetics','equilibrium'],3),
    ('chemistry-grade-11','redox-and-inorganic','Redox and inorganic chemistry','chem11-redox-inorganic','Determine oxidation changes and use periodic or inorganic trends to interpret reactions and properties.','application','analyse',array['determine','interpret'],array['redox','periodicity','inorganic'],4),
    ('chemistry-grade-11','organic-and-analysis','Organic chemistry and analysis','chem11-organic-analysis','Identify organic structures and use reaction evidence or analytical data to predict products and distinguish compounds.','application','analyse',array['identify','predict','deduce'],array['organic chemistry','analysis'],5),
    ('biology-grade-11','cells-and-membranes','Cells and membranes','bio11-cells-membranes','Interpret cell structures and membrane transport processes to explain movement, compartmentalisation and cellular function.','understanding','analyse',array['interpret','explain'],array['cells','membranes','transport'],1),
    ('biology-grade-11','molecules-and-enzymes','Biological molecules and enzymes','bio11-molecules-enzymes','Relate molecular structure to biological function and analyse factors that affect enzyme-controlled reactions.','application','analyse',array['relate','analyse'],array['biological molecules','enzymes'],2),
    ('biology-grade-11','genetics-and-division','Genetics and cell division','bio11-genetics-division','Use genetic information and cell-division principles to predict inheritance, variation and chromosome behaviour.','application','analyse',array['predict','explain'],array['genetics','mitosis','meiosis'],3),
    ('biology-grade-11','exchange-and-transport','Exchange and transport','bio11-exchange-transport','Explain how specialised exchange surfaces and transport systems maintain efficient movement of substances in organisms.','understanding','analyse',array['explain','compare'],array['gas exchange','transport'],4),
    ('biology-grade-11','ecology-and-evolution','Ecology and evolution','bio11-ecology-evolution','Analyse ecological evidence and selection pressures to explain population change, biodiversity and evolutionary outcomes.','application','analyse',array['analyse','evaluate'],array['ecology','evolution'],5),
    ('english-grade-11','inference-and-evidence','Inference and evidence','eng11-inference-evidence','Develop defensible interpretations of complex texts by selecting precise evidence and distinguishing inference from explicit meaning.','skill','analyse',array['infer','support'],array['reading','evidence'],1),
    ('english-grade-11','language-and-structure','Language and structure','eng11-language-structure','Analyse how diction, imagery, syntax and structural choices shape meaning, tone and reader response.','skill','analyse',array['analyse','explain'],array['language','structure'],2),
    ('english-grade-11','argument-and-sources','Argument and source evaluation','eng11-argument-evaluation','Evaluate claims, evidence, assumptions and source reliability in informational and argumentative texts.','skill','evaluate',array['evaluate','compare'],array['argument','sources'],3),
    ('english-grade-11','grammar-and-cohesion','Grammar and cohesion','eng11-grammar-cohesion','Apply accurate grammar, punctuation and cohesive devices to create controlled, unambiguous extended writing.','application','apply',array['apply','edit'],array['grammar','cohesion'],4),
    ('english-grade-11','purpose-and-audience','Purpose and audience','eng11-purpose-audience','Adapt register, organisation and rhetorical choices to communicate effectively for a specified purpose, audience and form.','skill','create',array['adapt','compose'],array['writing','audience','register'],5),
    ('travel-tourism-grade-12','industry-and-destinations','Industry and destinations','tt12-industry-destinations','Analyse relationships among tourism sectors, destination appeal, accessibility and visitor motivation.','application','analyse',array['analyse','explain'],array['industry','destinations'],1),
    ('travel-tourism-grade-12','impacts-and-sustainability','Impacts and sustainability','tt12-impacts-sustainability','Evaluate economic, environmental and sociocultural tourism impacts and recommend responsible management responses.','application','evaluate',array['evaluate','recommend'],array['impacts','sustainability'],2),
    ('travel-tourism-grade-12','customer-service','Customer service','tt12-customer-service','Apply customer-service principles to diverse visitor needs, service recovery and quality management situations.','application','apply',array['apply','justify'],array['customer service','quality'],3),
    ('travel-tourism-grade-12','marketing-and-product','Marketing and product development','tt12-marketing-product','Use market research, segmentation and the marketing mix to develop and evaluate tourism products.','application','analyse',array['analyse','develop'],array['marketing','product'],4),
    ('travel-tourism-grade-12','operations-and-risk','Operations and risk','tt12-operations-risk','Plan feasible tourism operations by integrating itineraries, capacity, seasonality, risk and contingency decisions.','application','evaluate',array['plan','evaluate'],array['operations','risk'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Original Brains Heist strand for the 2026.2 verified question release.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-2'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-2',
    'repository:content/verified-question-packages/2026-2-0'
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
