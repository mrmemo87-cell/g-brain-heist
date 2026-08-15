-- Publish the complete Brains Heist International 2026.5 snapshot.
--
-- 2026.4 remains immutable for historical evidence. This version clones that
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
    and fv.version_code = '2026-4' and fv.status = 'published';
  if v_framework_id is null or v_old_version_id is null then
    raise exception using errcode = '23503', message = 'brain_heist_curriculum_2026_4_not_found';
  end if;
  if exists (
    select 1 from public.curriculum_framework_versions
    where framework_id = v_framework_id and version_code = '2026-5'
  ) then
    raise exception using errcode = '23505', message = 'brain_heist_curriculum_2026_5_already_exists';
  end if;

  insert into public.curriculum_framework_versions(
    id, framework_id, version_code, display_name, source_version, source_uri,
    source_license, status, effective_from, release_notes
  ) values (
    v_new_version_id, v_framework_id, '2026-5', 'Brains Heist International 2026.5',
    '2026.5', 'repository:content/verified-question-packages/2026-5-0',
    'Brains Heist original educational content', 'draft', date '2026-08-15',
    'Full 2026.4 snapshot plus first Grade 11 and Grade 12 Mathematics and ICT assessable objectives.'
  );

  insert into public.curriculum_framework_subjects(
    id, framework_version_id, academic_subject_id, code, name,
    sequence_number, source_reference
  )
  select (
      substr(md5('bh-curriculum-2026-5:subject:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-5:stage:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.id::text),21,12)
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
      substr(md5('bh-curriculum-2026-5:scope:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-5:subject:' || old.framework_subject_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.framework_subject_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.framework_subject_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.framework_subject_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:subject:' || old.framework_subject_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-5:stage:' || old.stage_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.stage_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.stage_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.stage_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:stage:' || old.stage_id::text),21,12)
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
        substr(md5('bh-curriculum-2026-5:node:' || old.id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.id::text),21,12)
      )::uuid,
      v_new_version_id,
      (
        substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),21,12)
      )::uuid,
      case when old.parent_node_id is null then null else (
        substr(md5('bh-curriculum-2026-5:node:' || old.parent_node_id::text),1,8)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.parent_node_id::text),9,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.parent_node_id::text),13,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.parent_node_id::text),17,4)||'-'||
        substr(md5('bh-curriculum-2026-5:node:' || old.parent_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-5:objective:' || old.id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.id::text),21,12)
    )::uuid,
    v_new_version_id,
    (
      substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:scope:' || old.curriculum_scope_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-5:node:' || old.curriculum_node_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:node:' || old.curriculum_node_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:node:' || old.curriculum_node_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:node:' || old.curriculum_node_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:node:' || old.curriculum_node_id::text),21,12)
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
      substr(md5('bh-curriculum-2026-5:objective:' || old.objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.objective_id::text),21,12)
    )::uuid,
    (
      substr(md5('bh-curriculum-2026-5:objective:' || old.prerequisite_objective_id::text),1,8)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.prerequisite_objective_id::text),9,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.prerequisite_objective_id::text),13,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.prerequisite_objective_id::text),17,4)||'-'||
      substr(md5('bh-curriculum-2026-5:objective:' || old.prerequisite_objective_id::text),21,12)
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
    ('mathematics-grade-11','number-algebra','Number and algebra','math11-number-algebra','Apply number properties, algebraic manipulation, equations and sequences to solve multi-step problems.','application','analyse',array['apply','solve'],array['number','algebra','sequences'],1),
    ('mathematics-grade-11','functions-graphs','Functions and graphs','math11-functions-graphs','Interpret, construct and transform linear, quadratic and other functions using algebraic and graphical representations.','application','analyse',array['interpret','construct'],array['functions','graphs'],2),
    ('mathematics-grade-11','geometry-trigonometry','Geometry and trigonometry','math11-geometry-trigonometry','Use geometric reasoning, similarity and trigonometric relationships to calculate lengths, angles and areas.','application','apply',array['calculate','reason'],array['geometry','trigonometry'],3),
    ('mathematics-grade-11','statistics-probability','Statistics and probability','math11-statistics-probability','Summarize data and calculate probabilities using appropriate representations, measures and conditional reasoning.','application','analyse',array['summarize','calculate'],array['statistics','probability'],4),
    ('mathematics-grade-11','modelling-proof','Mathematical modelling and proof','math11-modelling-proof','Construct, test and evaluate mathematical models, bounds and arguments in contextual and abstract problems.','skill','evaluate',array['construct','evaluate'],array['modelling','proof','bounds'],5),
    ('mathematics-grade-12','advanced-algebra','Advanced algebra and functions','math12-advanced-algebra','Manipulate advanced algebraic expressions and solve polynomial, exponential, logarithmic and functional equations.','application','analyse',array['manipulate','solve'],array['algebra','functions','logarithms'],1),
    ('mathematics-grade-12','calculus','Calculus and change','math12-calculus','Differentiate and integrate functions to analyse rates, accumulation, stationary points and motion.','application','analyse',array['differentiate','integrate'],array['calculus','rates','motion'],2),
    ('mathematics-grade-12','vectors-geometry','Vectors and coordinate geometry','math12-vectors-geometry','Use vector, coordinate and trigonometric methods to reason about lines, circles, angles and geometric relationships.','application','analyse',array['use','reason'],array['vectors','coordinate geometry'],3),
    ('mathematics-grade-12','probability-statistics','Probability and statistics','math12-probability-statistics','Apply discrete and continuous probability models and statistical inference to interpret data and uncertainty.','application','evaluate',array['apply','interpret'],array['probability','statistics','inference'],4),
    ('mathematics-grade-12','modelling-numerical','Modelling and numerical methods','math12-modelling-numerical','Use iteration, numerical approximation and differential models while evaluating accuracy, assumptions and limitations.','skill','evaluate',array['approximate','evaluate'],array['numerical methods','modelling'],5),
    ('ict-grade-11','hardware-systems','Hardware and computer systems','ict11-hardware-systems','Explain how hardware components, operating systems and input-output devices work together to meet user requirements.','knowledge','analyse',array['explain','select'],array['hardware','systems'],1),
    ('ict-grade-11','data-representation','Data representation','ict11-data-representation','Represent and convert text, number, image and sound data while explaining how resolution and encoding affect quality and size.','application','apply',array['represent','convert'],array['binary','encoding','media'],2),
    ('ict-grade-11','networks-security','Networks and cybersecurity','ict11-networks-security','Explain network components, protocols and security controls and apply them to common connectivity and threat scenarios.','application','analyse',array['explain','apply'],array['networks','cybersecurity'],3),
    ('ict-grade-11','data-management','Data management and databases','ict11-data-management','Design and query simple data structures and databases while applying validation, integrity and backup principles.','skill','apply',array['design','query'],array['data','databases'],4),
    ('ict-grade-11','digital-solutions-ethics','Digital solutions and responsible use','ict11-digital-solutions-ethics','Plan, test and evaluate digital solutions while considering accessibility, privacy, intellectual property and social impact.','skill','evaluate',array['plan','test','evaluate'],array['solutions','ethics','accessibility'],5),
    ('ict-grade-12','system-architecture','System architecture and performance','ict12-system-architecture','Analyse computer architecture, virtualization, cloud services and performance trade-offs for organizational requirements.','application','analyse',array['analyse','evaluate'],array['architecture','cloud','performance'],1),
    ('ict-grade-12','networks-cybersecurity','Advanced networks and cybersecurity','ict12-networks-cybersecurity','Evaluate network designs, cryptographic controls, authentication and incident responses against advanced threats and operational needs.','application','evaluate',array['evaluate','respond'],array['networks','cryptography','security'],2),
    ('ict-grade-12','databases-analytics','Databases and data analytics','ict12-databases-analytics','Design relational databases, use queries and transactions, and evaluate data quality and analytical conclusions.','skill','evaluate',array['design','query','evaluate'],array['databases','analytics'],3),
    ('ict-grade-12','software-development','Software development and testing','ict12-software-development','Apply decomposition, algorithms, version control and systematic testing to develop maintainable software solutions.','skill','apply',array['apply','test'],array['software development','algorithms'],4),
    ('ict-grade-12','information-systems-ethics','Information systems and digital ethics','ict12-information-systems-ethics','Evaluate information systems using governance, usability, privacy, reliability, sustainability and ethical decision-making criteria.','application','evaluate',array['evaluate','justify'],array['information systems','governance','ethics'],5);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, depth, sequence_number, source_reference
  )
  select v_new_version_id, s.id, null, 'strand', o.node_code, o.node_name,
    'Original Brains Heist strand for the 2026.5 verified question release.',
    0, o.sequence_number, 'bh-verified-question-curriculum-2026-5'
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
    o.sequence_number, 'bh-verified-question-curriculum-2026-5',
    'repository:content/verified-question-packages/2026-5-0'
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

