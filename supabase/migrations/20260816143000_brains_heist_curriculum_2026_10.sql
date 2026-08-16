-- Publish the complete Brains Heist International 2026.10 snapshot.
--
-- The immutable 2026.8 snapshot is cloned, legacy auto-classified Grade 5
-- objectives remain visible as history but are no longer assessable in the
-- four release scopes, and 20 curated objectives become governed targets.

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
    and fv.version_code = '2026-8' and fv.status = 'published';

  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_8_not_found';
  end if;

  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-10'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_10_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-10', 'Brains Heist International 2026.10',
    '2026.10', 'repository:content/verified-question-packages/2026-10-0',
    'Brains Heist original educational content', 'draft', date '2026-08-16',
    'Full 2026.8 snapshot plus curated Grade 5 Mathematics, English, Integrated Science and Geography objectives for the visual pilot.'
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
    and s.code in ('mathematics-grade-5','english-grade-5','science-grade-5','geography-grade-5')
    and o.source_reference = 'bh-question-bank-classification-v1';

  create temporary table tmp_new_objectives(
    scope_code text, node_code text, node_name text, objective_code text,
    statement text, objective_type text, cognitive_level text,
    command_terms text[], tags text[], sequence_number integer
  ) on commit drop;

  insert into tmp_new_objectives values
    ('mathematics-grade-5','number-operations','Number, place value and operations','math5-number-operations','Read, compare and calculate with whole numbers, using estimation and inverse operations to check solutions.','application','apply',array['read','calculate','check'],array['number','place value','operations'],1),
    ('mathematics-grade-5','fractions-decimals','Fractions and decimals','math5-fractions-decimals','Represent, compare and calculate with common fractions and decimals in practical contexts.','application','apply',array['represent','compare','calculate'],array['fractions','decimals'],2),
    ('mathematics-grade-5','patterns-rules','Patterns, rules and unknowns','math5-patterns-rules','Recognise numerical and visual patterns, describe rules and solve simple problems containing unknown values.','application','analyse',array['recognise','describe','solve'],array['patterns','rules','unknowns'],3),
    ('mathematics-grade-5','geometry-measure','Geometry and measurement','math5-geometry-measure','Classify shapes and angles and solve perimeter, area, time and unit-conversion problems.','application','apply',array['classify','measure','solve'],array['geometry','measurement'],4),
    ('mathematics-grade-5','data-chance','Data and chance','math5-data-chance','Read and compare data displays, calculate simple averages and describe likelihood using fractions.','application','analyse',array['read','compare','calculate'],array['data','chance'],5),
    ('english-grade-5','reading-inference','Reading evidence and inference','eng5-reading-inference','Retrieve information and combine textual or visual clues to make and justify age-appropriate inferences.','skill','analyse',array['retrieve','combine','justify'],array['reading','inference','evidence'],1),
    ('english-grade-5','vocabulary-effect','Vocabulary and language effect','eng5-vocabulary-effect','Use context, word relationships and figurative language to explain meaning and effect.','skill','analyse',array['use','explain'],array['vocabulary','language','effect'],2),
    ('english-grade-5','grammar-punctuation','Grammar, punctuation and sentence control','eng5-grammar-punctuation','Construct and edit sentences using accurate tense, agreement, clauses and punctuation.','skill','apply',array['construct','edit','punctuate'],array['grammar','punctuation','sentences'],3),
    ('english-grade-5','writing-structure','Writing structure and cohesion','eng5-writing-structure','Organise ideas into coherent paragraphs and select openings, supporting details and conclusions for a clear purpose.','skill','create',array['organise','select','support'],array['writing','structure','cohesion'],4),
    ('english-grade-5','purpose-audience','Purpose, audience and information','eng5-purpose-audience','Identify purpose and audience and evaluate how layout, tone and evidence help communicate information.','skill','evaluate',array['identify','evaluate','communicate'],array['purpose','audience','information'],5),
    ('science-grade-5','living-things','Living things and life cycles','sci5-living-things','Describe life cycles, food relationships and how structures or behaviours support survival.','application','understand',array['describe','explain'],array['living things','life cycles','food chains'],1),
    ('science-grade-5','materials-changes','Materials and changes','sci5-materials-changes','Compare material properties and distinguish reversible changes, irreversible changes and changes of state.','application','analyse',array['compare','distinguish'],array['materials','changes','states'],2),
    ('science-grade-5','forces-space','Forces, Earth and space','sci5-forces-space','Explain simple effects of forces and use models to describe Earth, Moon and Sun patterns.','application','apply',array['explain','use','describe'],array['forces','Earth','space'],3),
    ('science-grade-5','energy-waves','Electricity, light and sound','sci5-energy-waves','Build and interpret simple circuits and explain basic behaviour of light and sound.','application','analyse',array['build','interpret','explain'],array['electricity','light','sound'],4),
    ('science-grade-5','enquiry-evidence','Scientific enquiry and evidence','sci5-enquiry-evidence','Plan fair tests, read tables and graphs, identify patterns and evaluate the reliability of conclusions.','enquiry','evaluate',array['plan','read','evaluate'],array['enquiry','evidence','reliability'],5),
    ('geography-grade-5','maps-directions','Maps, direction and scale','geo5-maps-directions','Use compass directions, grid references, keys and simple scale to locate and describe places.','skill','apply',array['use','locate','describe'],array['maps','direction','scale'],1),
    ('geography-grade-5','weather-water','Weather, climate and water','geo5-weather-water','Read weather evidence and describe key processes and stores in the water cycle.','application','understand',array['read','describe'],array['weather','climate','water cycle'],2),
    ('geography-grade-5','landforms-environments','Landforms and environments','geo5-landforms-environments','Recognise physical features and explain simple processes that shape rivers, coasts and environments.','application','understand',array['recognise','explain'],array['landforms','rivers','coasts'],3),
    ('geography-grade-5','people-settlements','People, settlements and connections','geo5-people-settlements','Describe settlement patterns, population movement and how transport and services connect places.','application','analyse',array['describe','analyse','connect'],array['settlements','population','transport'],4),
    ('geography-grade-5','sustainability-fieldwork','Resources, sustainability and fieldwork','geo5-sustainability-fieldwork','Use field evidence to compare places and make sustainable decisions about resources and environments.','skill','evaluate',array['use','compare','decide'],array['resources','sustainability','fieldwork'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Curated Grade 5 strand for the 2026.10 visual question pilot.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-10'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-10',
    'repository:content/verified-question-packages/2026-10-0'
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
