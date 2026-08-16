-- Publish the complete Brains Heist International 2026.8 snapshot.
--
-- The immutable 2026.7 snapshot is cloned, legacy auto-classified Grade 7
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
    and fv.version_code = '2026-7' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_7_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-8'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_8_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-8', 'Brains Heist International 2026.8',
    '2026.8', 'repository:content/verified-question-packages/2026-8-0',
    'Brains Heist original educational content', 'draft', date '2026-08-16',
    'Full 2026.7 snapshot plus curated Grade 7 Mathematics, English, Integrated Science and Geography objectives for the visual pilot.'
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
    and s.code in ('mathematics-grade-7','english-grade-7','science-grade-7','geography-grade-7')
    and o.source_reference = 'bh-question-bank-classification-v1';

  create temporary table tmp_new_objectives(
    scope_code text, node_code text, node_name text, objective_code text,
    statement text, objective_type text, cognitive_level text,
    command_terms text[], tags text[], sequence_number integer
  ) on commit drop;

  insert into tmp_new_objectives values
    ('mathematics-grade-7','ratio-proportion','Ratio, proportion and percentages','math7-ratio-proportion','Apply proportional reasoning, percentages and rational numbers in mathematical and everyday contexts.','application','apply',array['apply','calculate','reason'],array['ratio','proportion','percentages'],1),
    ('mathematics-grade-7','algebra-sequences','Algebra, equations and sequences','math7-algebra-sequences','Form and simplify expressions, solve linear equations and generalise arithmetic sequences.','application','analyse',array['form','simplify','solve'],array['algebra','equations','sequences'],2),
    ('mathematics-grade-7','geometry-measure','Geometry and measurement','math7-geometry-measure','Use angle relationships, transformations and circle measures to solve geometric problems.','application','apply',array['use','transform','solve'],array['geometry','measurement','angles'],3),
    ('mathematics-grade-7','data-probability','Data and probability','math7-data-probability','Interpret distributions and calculate measures and probabilities to support conclusions.','application','analyse',array['interpret','calculate','conclude'],array['data','probability','distribution'],4),
    ('mathematics-grade-7','rates-scale','Rates, scale and multi-step problems','math7-rates-scale','Model multi-step rate, scale and unit-conversion problems and check the reasonableness of solutions.','application','apply',array['model','convert','check'],array['rates','scale','units'],5),
    ('english-grade-7','reading-inference','Reading evidence and inference','eng7-reading-inference','Select and connect explicit and implicit evidence to explain inference, viewpoint and theme.','skill','analyse',array['select','connect','explain'],array['reading','inference','evidence'],1),
    ('english-grade-7','language-effect','Language and literary effect','eng7-language-effect','Analyse how figurative language, imagery and precise vocabulary shape meaning and reader response.','skill','analyse',array['analyse','explain'],array['language','imagery','effect'],2),
    ('english-grade-7','grammar-cohesion','Grammar, punctuation and cohesion','eng7-grammar-cohesion','Control clauses, punctuation, reference and tense to create accurate, cohesive sentences.','skill','apply',array['control','punctuate','edit'],array['grammar','punctuation','cohesion'],3),
    ('english-grade-7','writing-structure','Writing structure and evidence','eng7-writing-structure','Organise claims, evidence and explanations into coherent texts with purposeful transitions and conclusions.','skill','create',array['organise','support','conclude'],array['writing','evidence','structure'],4),
    ('english-grade-7','purpose-audience','Purpose, audience and media','eng7-purpose-audience','Evaluate how tone, design and persuasive choices suit audience, purpose and communication medium.','skill','evaluate',array['evaluate','adapt','justify'],array['audience','purpose','media'],5),
    ('science-grade-7','cells-systems','Cells and living systems','sci7-cells-systems','Relate specialised cell structures to functions and explain organisation in living systems.','application','understand',array['relate','explain'],array['cells','systems','specialisation'],1),
    ('science-grade-7','particles-reactions','Particles, mixtures and reactions','sci7-particles-reactions','Use particle models and conservation to explain diffusion, reactions and separation processes.','application','apply',array['use','explain','separate'],array['particles','reactions','mixtures'],2),
    ('science-grade-7','forces-motion','Forces, motion and pressure','sci7-forces-motion','Interpret motion graphs and apply resultant force and pressure relationships.','application','analyse',array['interpret','calculate','apply'],array['forces','motion','pressure'],3),
    ('science-grade-7','energy-electricity','Energy and electricity','sci7-energy-electricity','Analyse circuit behaviour and quantify useful and dissipated energy transfers.','application','analyse',array['analyse','calculate','compare'],array['energy','electricity','circuits'],4),
    ('science-grade-7','scientific-enquiry','Scientific enquiry and evidence','sci7-scientific-enquiry','Design fair investigations, analyse patterns and evaluate reliability, validity and conclusions.','enquiry','evaluate',array['design','analyse','evaluate'],array['enquiry','evidence','reliability'],5),
    ('geography-grade-7','map-fieldwork','Map skills and fieldwork','geo7-map-fieldwork','Use scale, contours and sampling methods to interpret places and collect representative evidence.','skill','apply',array['use','interpret','sample'],array['maps','fieldwork','sampling'],1),
    ('geography-grade-7','weather-climate','Weather, climate and water','geo7-weather-climate','Interpret climate evidence and explain atmospheric and water-cycle processes across places.','application','analyse',array['interpret','explain'],array['weather','climate','water cycle'],2),
    ('geography-grade-7','rivers-coasts','River and coastal processes','geo7-rivers-coasts','Explain how erosion, transport and deposition shape river and coastal landscapes and hazards.','application','understand',array['explain','compare'],array['rivers','coasts','processes'],3),
    ('geography-grade-7','population-urban','Population, migration and urbanisation','geo7-population-urban','Analyse migration, population distribution and urban change using spatial and demographic evidence.','application','analyse',array['analyse','calculate','explain'],array['population','migration','urbanisation'],4),
    ('geography-grade-7','resources-sustainability','Resources and sustainability','geo7-resources-sustainability','Evaluate resource and development decisions using environmental, social and economic evidence.','application','evaluate',array['evaluate','justify'],array['resources','development','sustainability'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Curated Grade 7 strand for the 2026.8 visual question pilot.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-8'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-8',
    'repository:content/verified-question-packages/2026-8-0'
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
