-- Publish the complete Brains Heist International 2026.7 snapshot.
--
-- The immutable 2026.6 snapshot is cloned, legacy auto-classified Grade 6
-- objectives remain visible as history but are no longer assessable in the
-- four pilot scopes, and 20 curated objectives become the governed targets.

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
    and fv.version_code = '2026-6' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_6_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-7'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_7_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-7', 'Brains Heist International 2026.7',
    '2026.7', 'repository:content/verified-question-packages/2026-7-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.6 snapshot plus curated Grade 6 Mathematics, English, Integrated Science and Geography objectives for the visual pilot.'
  );

  create temporary table tmp_subject_map(old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_stage_map(old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_scope_map(old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_node_map(old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_objective_map(old_id uuid primary key, new_id uuid not null) on commit drop;

  insert into tmp_subject_map select id, gen_random_uuid() from public.curriculum_framework_subjects where framework_version_id = v_old_version_id;
  insert into tmp_stage_map select id, gen_random_uuid() from public.curriculum_stages where framework_version_id = v_old_version_id;
  insert into tmp_scope_map select id, gen_random_uuid() from public.curriculum_scopes where framework_version_id = v_old_version_id;
  insert into tmp_node_map select id, gen_random_uuid() from public.curriculum_nodes where framework_version_id = v_old_version_id;
  insert into tmp_objective_map select id, gen_random_uuid() from public.curriculum_objectives where framework_version_id = v_old_version_id;

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name, sequence_number, source_reference
  )
  select m.new_id, v_new_version_id, old.academic_subject_id, old.code, old.name,
    old.sequence_number, old.source_reference
  from public.curriculum_framework_subjects old join tmp_subject_map m on m.old_id = old.id;

  insert into public.curriculum_stages(
    id, framework_version_id, code, name, sequence_number,
    typical_age_min, typical_age_max, source_reference
  )
  select m.new_id, v_new_version_id, old.code, old.name, old.sequence_number,
    old.typical_age_min, old.typical_age_max, old.source_reference
  from public.curriculum_stages old join tmp_stage_map m on m.old_id = old.id;

  insert into public.curriculum_scopes(
    id, framework_version_id, framework_subject_id, stage_id,
    academic_subject_id, code, name, sequence_number
  )
  select sm.new_id, v_new_version_id, fm.new_id, stm.new_id,
    old.academic_subject_id, old.code, old.name, old.sequence_number
  from public.curriculum_scopes old
  join tmp_scope_map sm on sm.old_id = old.id
  join tmp_subject_map fm on fm.old_id = old.framework_subject_id
  join tmp_stage_map stm on stm.old_id = old.stage_id;

  for v_depth in 0..8 loop
    insert into public.curriculum_nodes(
      id, framework_version_id, curriculum_scope_id, parent_node_id,
      node_type, code, name, description, depth, sequence_number, source_reference
    )
    select nm.new_id, v_new_version_id, sm.new_id, pnm.new_id,
      old.node_type, old.code, old.name, old.description, old.depth,
      old.sequence_number, old.source_reference
    from public.curriculum_nodes old
    join tmp_node_map nm on nm.old_id = old.id
    join tmp_scope_map sm on sm.old_id = old.curriculum_scope_id
    left join tmp_node_map pnm on pnm.old_id = old.parent_node_id
    where old.framework_version_id = v_old_version_id and old.depth = v_depth;
  end loop;

  insert into public.curriculum_objectives(
    id, framework_version_id, curriculum_scope_id, curriculum_node_id,
    code, statement, objective_type, cognitive_level, is_assessable,
    command_terms, tags, sequence_number, source_reference, source_uri
  )
  select om.new_id, v_new_version_id, sm.new_id, nm.new_id,
    old.code, old.statement, old.objective_type, old.cognitive_level,
    old.is_assessable, old.command_terms, old.tags, old.sequence_number,
    old.source_reference, old.source_uri
  from public.curriculum_objectives old
  join tmp_objective_map om on om.old_id = old.id
  join tmp_scope_map sm on sm.old_id = old.curriculum_scope_id
  join tmp_node_map nm on nm.old_id = old.curriculum_node_id;

  insert into public.curriculum_objective_prerequisites(
    framework_version_id, objective_id, prerequisite_objective_id, relationship_type
  )
  select v_new_version_id, om.new_id, pm.new_id, old.relationship_type
  from public.curriculum_objective_prerequisites old
  join tmp_objective_map om on om.old_id = old.objective_id
  join tmp_objective_map pm on pm.old_id = old.prerequisite_objective_id
  where old.framework_version_id = v_old_version_id;

  update public.curriculum_objectives o
  set is_assessable = false,
      tags = array(select distinct value from unnest(coalesce(o.tags, '{}'::text[]) || array['legacy-classification']) value)
  from public.curriculum_scopes s
  where o.framework_version_id = v_new_version_id
    and o.curriculum_scope_id = s.id
    and s.code in ('mathematics-grade-6','english-grade-6','science-grade-6','geography-grade-6')
    and o.source_reference = 'bh-question-bank-classification-v1';

  create temporary table tmp_new_objectives(
    scope_code text, node_code text, node_name text, objective_code text,
    statement text, objective_type text, cognitive_level text,
    command_terms text[], tags text[], sequence_number integer
  ) on commit drop;

  insert into tmp_new_objectives values
    ('mathematics-grade-6','number-operations','Number and operations','math6-number-operations','Use place value, estimation and the order of operations to solve and check whole-number problems.','application','apply',array['calculate','estimate','check'],array['number','operations','place value'],1),
    ('mathematics-grade-6','fractions-ratio','Fractions, decimals and ratio','math6-fractions-ratio','Represent, compare and calculate with fractions, decimals, percentages and simple ratios.','application','apply',array['represent','compare','calculate'],array['fractions','decimals','ratio'],2),
    ('mathematics-grade-6','algebra-patterns','Algebra and patterns','math6-algebra-patterns','Generalise numerical patterns, form expressions and solve simple equations in context.','application','analyse',array['generalise','form','solve'],array['algebra','patterns','equations'],3),
    ('mathematics-grade-6','geometry-measurement','Geometry and measurement','math6-geometry-measurement','Apply angle, coordinate, area and volume relationships to solve geometric problems.','application','apply',array['apply','solve'],array['geometry','measurement','coordinates'],4),
    ('mathematics-grade-6','data-probability','Data and probability','math6-data-probability','Interpret data displays and use averages, range and probability to draw justified conclusions.','application','analyse',array['interpret','calculate','justify'],array['data','probability','averages'],5),
    ('english-grade-6','reading-inference','Reading and inference','eng6-reading-inference','Retrieve evidence, infer meaning and identify purpose and main ideas across age-appropriate texts.','skill','analyse',array['retrieve','infer','identify'],array['reading','inference','evidence'],1),
    ('english-grade-6','vocabulary-context','Vocabulary in context','eng6-vocabulary-context','Use context, word parts and figurative language to determine precise meanings and effects.','skill','analyse',array['determine','explain'],array['vocabulary','context','figurative language'],2),
    ('english-grade-6','grammar-sentences','Grammar and sentence control','eng6-grammar-sentences','Control agreement, pronouns, punctuation and clause structures to create accurate sentences.','skill','apply',array['control','combine','edit'],array['grammar','sentences','punctuation'],3),
    ('english-grade-6','writing-organisation','Writing organisation','eng6-writing-organisation','Organise ideas into coherent paragraphs using evidence, explanation, transitions and purposeful editing.','skill','create',array['organise','develop','edit'],array['writing','organisation','cohesion'],4),
    ('english-grade-6','language-choices','Audience and language choices','eng6-language-choices','Select tone, voice and persuasive techniques that suit purpose, audience and communication context.','skill','evaluate',array['select','explain','evaluate'],array['audience','purpose','tone'],5),
    ('science-grade-6','living-systems','Living systems','sci6-living-systems','Explain how cells, organs, food chains and adaptations support living organisms and ecosystems.','application','understand',array['identify','explain'],array['cells','organ systems','ecosystems'],1),
    ('science-grade-6','matter-materials','Matter and materials','sci6-matter-materials','Use particle ideas and material properties to explain changes and select separation methods.','application','apply',array['explain','select'],array['matter','particles','materials'],2),
    ('science-grade-6','forces-energy','Forces and energy','sci6-forces-energy','Analyse simple force, energy and electrical systems and plan fair tests of their behaviour.','enquiry','analyse',array['analyse','plan'],array['forces','energy','electricity'],3),
    ('science-grade-6','earth-space','Earth and space','sci6-earth-space','Use models to explain rotation, orbit, lunar light, seasons and the water cycle.','application','understand',array['use','explain'],array['earth','space','water cycle'],4),
    ('science-grade-6','scientific-enquiry','Scientific enquiry','sci6-scientific-enquiry','Identify variables, interpret data and evaluate reliability and limits in scientific investigations.','enquiry','evaluate',array['identify','interpret','evaluate'],array['enquiry','variables','reliability'],5),
    ('geography-grade-6','map-skills','Map and spatial skills','geo6-map-skills','Use direction, grid references, scale and contour patterns to locate and interpret places.','skill','apply',array['use','locate','interpret'],array['maps','scale','coordinates'],1),
    ('geography-grade-6','weather-climate','Weather and climate','geo6-weather-climate','Interpret weather data and explain basic differences and controls affecting weather and climate.','application','analyse',array['interpret','explain'],array['weather','climate','data'],2),
    ('geography-grade-6','rivers-landforms','Rivers and landforms','geo6-rivers-landforms','Explain basic river processes, landforms and human factors that influence flood risk.','application','understand',array['identify','explain'],array['rivers','landforms','flooding'],3),
    ('geography-grade-6','population-settlement','Population and settlement','geo6-population-settlement','Interpret population structure, density, urbanisation and settlement site factors.','application','analyse',array['interpret','calculate','explain'],array['population','settlement','urbanisation'],4),
    ('geography-grade-6','environments-sustainability','Environments and sustainability','geo6-environments-sustainability','Evaluate simple environmental decisions using systems, evidence, stakeholders and sustainability criteria.','application','evaluate',array['evaluate','justify'],array['environment','sustainability','decisions'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Curated Grade 6 strand for the 2026.7 visual question pilot.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-7'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-7',
    'repository:content/verified-question-packages/2026-7-0'
  from tmp_new_objectives o
  join public.curriculum_scopes s
    on s.framework_version_id = v_new_version_id and s.code = o.scope_code
  join public.curriculum_nodes n
    on n.framework_version_id = v_new_version_id
    and n.curriculum_scope_id = s.id and n.code = o.node_code;

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
      from public.curriculum_nodes n join public.curriculum_scopes cs on cs.id = n.curriculum_scope_id
      where n.framework_version_id = v_new_version_id
    union all
    select concat_ws('|', 'objective', cs.code, o.code, o.statement, o.is_assessable::text)
      from public.curriculum_objectives o join public.curriculum_scopes cs on cs.id = o.curriculum_scope_id
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
