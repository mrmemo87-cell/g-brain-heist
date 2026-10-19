-- Skill coverage (owner 2026-10-19: "We need all the skills in IELTS to be covered and measured").
-- One row per IELTS skill the programme diagnoses: 8 Listening constructs, the Reading constructs used by the screener
-- and targeted practice, and the 4 Writing and 4 Speaking criteria. For each: what practice exists, whether a fresh
-- (independent) check exists, where the starting point comes from, and how many students in this batch already have
-- measurement. Availability respects the existing gates: pilot-only tasks are counted separately from released ones.
-- Read-only and additive. Policy bh-ielts-skill-coverage-v1.

create or replace function public.rpc_ielts_batch_skill_coverage(p_batch uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch)),
 members as (
  select u.id
  from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
  join b on b.id = m.batch_id
  where m.left_at is null and u.school_id = b.school_id
 ), skill_map(skill, ord, code) as (values
  ('listening', 1, 'bh-ielts-listening-v1-explicit-detail'), ('listening', 2, 'bh-ielts-listening-v1-numerical-information'),
  ('listening', 3, 'bh-ielts-listening-v1-dates-times'), ('listening', 4, 'bh-ielts-listening-v1-distractor-resistance'),
  ('listening', 5, 'bh-ielts-listening-v1-paraphrase-recognition'), ('listening', 6, 'bh-ielts-listening-v1-sequencing'),
  ('listening', 7, 'bh-ielts-listening-v1-speaker-attitude'), ('listening', 8, 'bh-ielts-listening-v1-speaker-purpose'),
  ('reading', 1, 'eng.reading.explicit-information.locate-detail'), ('reading', 2, 'eng.reading.main-ideas.gist'),
  ('reading', 3, 'eng.reading.main-ideas.main-supporting'), ('reading', 4, 'eng.reading.main-ideas.summary'),
  ('reading', 5, 'eng.reading.argument-evaluation.claims-evidence'), ('reading', 6, 'eng.reading.purpose-viewpoint.viewpoint'),
  ('reading', 7, 'eng.reading.purpose-viewpoint.purpose-audience'), ('reading', 8, 'eng.reading.inference.purpose-intention'),
  ('reading', 9, 'eng.reading.inference.unstated-meaning'), ('reading', 10, 'eng.reading.connections.logical-relations'),
  ('reading', 11, 'eng.reading.connections.reference'), ('reading', 12, 'eng.reading.connections.structure'),
  ('reading', 13, 'eng.reading.vocabulary-context.context-clues')
 ), nodes as (
  select s.skill, s.ord, n.id, n.code, n.name
  from skill_map s join public.academic_skill_registry_nodes n on n.code = s.code and n.status = 'active'
 ), tasks as (
  select distinct t.code, t.purpose, (q->>'taxonomy_node_id')::uuid as node_id,
         private.ielts_learning_publicly_released(t.code) as released, t.pilot_student is not null as pilot
  from private.ielts_learning_tasks t cross join lateral jsonb_array_elements(t.questions) q
  where t.skill in ('listening', 'reading') and q ? 'taxonomy_node_id' and private.ielts_practice_material_allowed('targeted', t.code)
 ), screener as (
  select distinct o->>'construct' as code
  from private.ielts_diagnostic_scoring_runs r cross join lateral jsonb_array_elements(r.outcomes) o
 ), evidence as (
  select distinct m.id as student_id, s.node_id
  from members m cross join lateral private.ielts_student_construct_sources(m.id) s
  where s.independent and s.opps > 0
 ), lr as (
  select n.skill, n.ord, n.code, n.name,
   jsonb_build_object('released', count(distinct t.code) filter (where t.purpose = 'guided_practice' and t.released),
                      'pilot', count(distinct t.code) filter (where t.purpose = 'guided_practice' and not t.released and t.pilot)) as practice,
   jsonb_build_object('released', count(distinct t.code) filter (where t.purpose = 'independent_check' and t.released),
                      'pilot', count(distinct t.code) filter (where t.purpose = 'independent_check' and not t.released and t.pilot)) as checks,
   (select count(distinct mm.material_type || ':' || mm.material_id) from private.ielts_material_construct_maps mm
     where mm.node_id = n.id and mm.status = 'approved' and mm.role = 'primary' and mm.material_type <> 'mock') as materials,
   jsonb_build_object('screener', exists(select 1 from screener s where s.code = n.code),
                      'mock', exists(select 1 from private.ielts_material_construct_maps mm where mm.node_id = n.id and mm.material_type = 'mock' and mm.status = 'approved' and mm.role = 'primary')) as baseline,
   (select count(*) from evidence e where e.node_id = n.id) as students_measured
  from nodes n left join tasks t on t.node_id = n.id
  group by n.skill, n.ord, n.code, n.name, n.id
 ), crit(skill, ord, criterion) as (values
  ('writing', 1, 'task_response'), ('writing', 2, 'coherence_cohesion'), ('writing', 3, 'lexical_resource'), ('writing', 4, 'grammar'),
  ('speaking', 1, 'fluency_coherence'), ('speaking', 2, 'lexical_resource'), ('speaking', 3, 'grammar'), ('speaking', 4, 'pronunciation')
 ), effects as (
  select m.id as student_id, r.skill, r.criterion,
         private.ielts_productive_effect_v1(jsonb_agg(jsonb_build_object('at', r.at, 'task', r.task, 'scale', r.scale, 'value', r.value, 'source', r.source)))->>'verdict' as verdict
  from members m cross join lateral private.ielts_student_productive_ratings(m.id) r
  group by 1, 2, 3
 ), productive_tasks as (
  select 'writing' as skill,
   (select count(*) from public.ielts_writing_tasks w where w.is_active and private.ielts_practice_material_allowed('ielts_writing_task', w.id::text)) as materials
  union all
  select 'speaking',
   (select count(*) from public.ielts_speaking_tasks s where s.is_active and private.ielts_practice_material_allowed('ielts_speaking_task', s.id::text))
 ), targeted_productive as (
  select t.skill,
   count(*) filter (where t.purpose = 'guided_practice' and private.ielts_learning_publicly_released(t.code)) as pr,
   count(*) filter (where t.purpose = 'guided_practice' and not private.ielts_learning_publicly_released(t.code) and t.pilot_student is not null) as pp,
   count(*) filter (where t.purpose = 'independent_check' and private.ielts_learning_publicly_released(t.code)) as cr,
   count(*) filter (where t.purpose = 'independent_check' and not private.ielts_learning_publicly_released(t.code) and t.pilot_student is not null) as cp
  from private.ielts_learning_tasks t
  where t.skill in ('writing', 'speaking') and private.ielts_practice_material_allowed('targeted', t.code)
  group by t.skill
 ), ws as (
  select c.skill, c.ord, c.criterion as code, c.criterion as name,
   jsonb_build_object('released', coalesce(tp.pr, 0), 'pilot', coalesce(tp.pp, 0)) as practice,
   jsonb_build_object('released', coalesce(tp.cr, 0), 'pilot', coalesce(tp.cp, 0)) as checks,
   coalesce(p.materials, 0) as materials,
   jsonb_build_object('screener', c.skill = 'writing', 'interview', c.skill = 'speaking') as baseline,
   (select count(*) from effects e where e.skill = c.skill and e.criterion = c.criterion and e.verdict in ('higher', 'similar', 'lower')) as students_measured,
   (select count(*) from effects e where e.skill = c.skill and e.criterion = c.criterion and e.verdict <> 'no_rating') as students_rated
  from crit c left join productive_tasks p on p.skill = c.skill left join targeted_productive tp on tp.skill = c.skill
 )
 select jsonb_build_object(
  'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'revision', b.revision) from b),
  'policy', 'bh-ielts-skill-coverage-v1 (provisional)',
  'members', (select count(*) from members),
  'rows', coalesce((select jsonb_agg(r order by array_position(array['listening','reading','writing','speaking'], r->>'skill'), (r->>'ord')::int) from (
     select jsonb_build_object('skill', skill, 'ord', ord, 'code', code, 'name', name, 'method', 'fresh_questions', 'practice', practice, 'checks', checks,
                               'materials', materials, 'baseline', baseline, 'students_measured', students_measured) as r from lr
     union all
     select jsonb_build_object('skill', skill, 'ord', ord, 'code', code, 'name', name, 'method', 'teacher_ratings', 'practice', practice, 'checks', checks,
                               'materials', materials, 'baseline', baseline, 'students_measured', students_measured, 'students_rated', students_rated) from ws
   ) x), '[]')
 );
$$;
revoke all on function public.rpc_ielts_batch_skill_coverage(uuid) from public, anon;
grant execute on function public.rpc_ielts_batch_skill_coverage(uuid) to authenticated;
