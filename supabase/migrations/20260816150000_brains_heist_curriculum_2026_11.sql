-- Publish the complete Brains Heist International 2026.11 snapshot.
--
-- The immutable 2026.10 snapshot is cloned. Broad legacy auto-classified
-- Grade 4 objectives remain visible as history but become non-assessable, and
-- twenty reviewed Grade 4 objectives become the governed package targets.
do $curriculum$
declare
  v_framework_id uuid;
  v_old_version_id uuid;
  v_new_version_id uuid := gen_random_uuid();
  v_hash text;
  v_depth integer;
begin
  select id into v_framework_id
  from public.curriculum_frameworks
  where code = 'brain-heist-international';

  if v_framework_id is null then
    raise exception 'brain_heist_international_framework_missing';
  end if;

  select id into v_old_version_id
  from public.curriculum_framework_versions
  where framework_id = v_framework_id and version_code = '2026-10';

  if v_old_version_id is null then
    raise exception 'brain_heist_curriculum_2026_10_missing';
  end if;

  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-11'
  ) then
    raise exception 'brain_heist_curriculum_2026_11_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-11', 'Brains Heist International 2026.11',
    '2026.11', 'repository:content/verified-question-packages/2026-11-0',
    'Brains Heist original educational content', 'draft', date '2026-08-16',
    'Full 2026.10 snapshot plus curated Grade 4 Mathematics, English, Integrated Science and Geography objectives for the visual package.'
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
    and s.code in ('mathematics-grade-4','english-grade-4','science-grade-4','geography-grade-4')
    and o.source_reference = 'bh-question-bank-classification-v1';

  create temporary table tmp_new_objectives(
    scope_code text, node_code text, node_name text, objective_code text,
    statement text, objective_type text, cognitive_level text,
    command_terms text[], tags text[], sequence_number integer
  ) on commit drop;

  insert into tmp_new_objectives values
    ('mathematics-grade-4','number-place-value','Number and place value','math4-number-place-value','Read, compare and calculate with whole numbers to 10,000 using place value and efficient written or mental strategies.','application','apply',array['read','compare','calculate'],array['number','place value','operations'],1),
    ('mathematics-grade-4','multiplication-division','Multiplication and division','math4-multiplication-division','Use multiplication facts, arrays, grouping and remainders to solve one-step and two-step problems.','application','apply',array['use','group','solve'],array['multiplication','division','remainders'],2),
    ('mathematics-grade-4','fractions-decimals','Fractions and decimals','math4-fractions-decimals','Recognise, compare and combine simple fractions and connect tenths and hundredths to decimal notation and money.','application','apply',array['recognise','compare','combine'],array['fractions','decimals','money'],3),
    ('mathematics-grade-4','geometry-measure','Geometry and measurement','math4-geometry-measure','Identify symmetry and angle types and solve practical problems involving perimeter, length and time.','application','apply',array['identify','measure','solve'],array['geometry','measurement','time'],4),
    ('mathematics-grade-4','data-patterns','Data, patterns and chance','math4-data-patterns','Read tables and pictograms, continue number patterns and describe simple likelihood from equally likely outcomes.','application','analyse',array['read','continue','describe'],array['data','patterns','chance'],5),
    ('english-grade-4','reading-retrieval-inference','Reading retrieval and inference','eng4-reading-retrieval-inference','Retrieve explicit details and combine short textual or visual clues to make supported inferences.','skill','analyse',array['retrieve','combine','infer'],array['reading','retrieval','inference'],1),
    ('english-grade-4','vocabulary-language','Vocabulary and language','eng4-vocabulary-language','Use context, synonyms, precise verbs and simple figurative language to explain word meaning and effect.','skill','understand',array['use','select','explain'],array['vocabulary','synonyms','figurative language'],2),
    ('english-grade-4','grammar-punctuation','Grammar and punctuation','eng4-grammar-punctuation','Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech.','skill','apply',array['build','edit','punctuate'],array['grammar','punctuation','sentences'],3),
    ('english-grade-4','writing-sequence','Writing and sequence','eng4-writing-sequence','Order ideas and select openings, supporting details and endings that make short texts clear and coherent.','skill','create',array['order','select','write'],array['writing','sequence','cohesion'],4),
    ('english-grade-4','purpose-information','Purpose and information','eng4-purpose-information','Identify audience and purpose and use headings, layout, tone and evidence to navigate or judge simple texts.','skill','evaluate',array['identify','use','judge'],array['purpose','audience','information'],5),
    ('science-grade-4','living-things-habitats','Living things and habitats','sci4-living-things-habitats','Classify familiar living things and explain simple food relationships, life cycles and habitat adaptations.','application','understand',array['classify','describe','explain'],array['living things','habitats','life cycles'],1),
    ('science-grade-4','materials-states','Materials and states','sci4-materials-states','Group materials by observable properties and describe simple reversible changes between solids, liquids and gases.','application','understand',array['group','observe','describe'],array['materials','properties','states'],2),
    ('science-grade-4','forces-magnets','Forces and magnets','sci4-forces-magnets','Describe how pushes, pulls, gravity, friction and magnets affect the movement of objects.','application','apply',array['describe','compare','predict'],array['forces','friction','magnets'],3),
    ('science-grade-4','light-sound-electricity','Light, sound and electricity','sci4-light-sound-electricity','Use simple models to explain complete circuits, shadows, reflection and how vibrations produce sound.','application','analyse',array['use','explain','predict'],array['light','sound','electricity'],4),
    ('science-grade-4','enquiry-evidence','Scientific enquiry and evidence','sci4-enquiry-evidence','Plan simple fair comparisons, read results, distinguish observations from conclusions and improve reliability.','enquiry','evaluate',array['plan','read','distinguish'],array['enquiry','evidence','reliability'],5),
    ('geography-grade-4','maps-place','Maps and place','geo4-maps-place','Use compass directions, keys, grid references and simple scale to locate and describe familiar places.','skill','apply',array['use','locate','describe'],array['maps','direction','place'],1),
    ('geography-grade-4','weather-water','Weather and water','geo4-weather-water','Identify weather instruments, read simple seasonal data and describe evaporation and water-cycle stores.','application','understand',array['identify','read','describe'],array['weather','seasons','water cycle'],2),
    ('geography-grade-4','landforms-environments','Landforms and environments','geo4-landforms-environments','Recognise common landforms and describe simple differences between rivers, coasts, mountains and dry environments.','application','understand',array['recognise','compare','describe'],array['landforms','rivers','coasts'],3),
    ('geography-grade-4','settlements-connections','Settlements and connections','geo4-settlements-connections','Compare settlements and explain how services, roads and transport connect people and goods.','application','analyse',array['compare','explain','connect'],array['settlements','services','transport'],4),
    ('geography-grade-4','resources-fieldwork','Resources and fieldwork','geo4-resources-fieldwork','Read simple fieldwork evidence and choose responsible ways to use resources and care for local environments.','skill','evaluate',array['read','choose','care'],array['resources','fieldwork','environment'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Curated Grade 4 strand for the 2026.11 visual question package.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-11'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-11',
    'repository:content/verified-question-packages/2026-11-0'
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
