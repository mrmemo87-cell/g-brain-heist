-- Diagnostic Bible 2.0.0 section 15B.5: weekly batch learning-loop view (read-only).
-- Weekly batch view (section 15B.5): per-student construct states, matched practice and batch-level groups.
create or replace function public.rpc_ielts_batch_learning_loop(p_batch uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch)),
 members as (
  select u.id, coalesce(nullif(u.full_name,''),u.username) as name
  from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
  join b on b.id = m.batch_id
  where m.left_at is null and u.school_id = b.school_id
 ), src as (
  select m.id as student_id, s.* from members m cross join lateral private.ielts_student_construct_sources(m.id) s
 ), practice as (
  -- latest completed guided practice per student and construct (targeted submissions)
  select al.student_id, (q->>'taxonomy_node_id')::uuid as node_id, max(s.submitted_at) as practice_at
  from private.ielts_learning_allocations al
  join private.ielts_learning_submissions s on s.allocation_id = al.id
  join private.ielts_learning_tasks t on t.code = al.task_code
  cross join lateral jsonb_array_elements(t.questions) q
  where al.student_id in (select id from members) and t.purpose = 'guided_practice' and q ? 'taxonomy_node_id'
  group by 1, 2
 ), states as (
  select src.student_id, src.node_id, min(src.skill) as skill,
         private.ielts_policy_v1_state(jsonb_agg(jsonb_build_object('at',src.at,'opps',src.opps,'correct',src.correct,'independent',src.independent)),
                                       (select p.practice_at from practice p where p.student_id = src.student_id and p.node_id = src.node_id)) as st
  from src group by src.student_id, src.node_id
 ), materials as (
  select 'targeted'::text as material_type, t.code as material_id, private.ielts_material_code('targeted', t.code) as display_code, t.title, t.skill, t.purpose,
         (q->>'taxonomy_node_id')::uuid as node_id
  from private.ielts_learning_tasks t cross join lateral jsonb_array_elements(t.questions) q
  where q ? 'taxonomy_node_id' and private.ielts_learning_publicly_released(t.code) and private.ielts_practice_material_allowed('targeted', t.code)
  union
  select m.material_type, m.material_id, private.ielts_material_code(m.material_type, m.material_id), coalesce(r.content->>'title', m.material_id),
         replace(replace(m.material_type,'ielts_',''),'_set','') , 'guided_practice', m.node_id
  from private.ielts_material_construct_maps m
  left join private.ielts_reviewed_practice r on r.material_type = m.material_type and r.material_id = m.material_id
  where m.status = 'approved' and m.role = 'primary' and coalesce(r.release_ready, true)
    and private.ielts_practice_material_allowed(m.material_type, m.material_id)
 ), targets as (
  select st.*, n.code, n.name,
   case st.st->>'state' when 'persistent_candidate' then 1 when 'repeated_difficulty' then 2 when 'difficulty_observed_again' then 3
        when 'possible_difficulty' then 4 when 'mixed' then 5 else 9 end as priority
  from states st join public.academic_skill_registry_nodes n on n.id = st.node_id
 )
 select jsonb_build_object(
  'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'revision', b.revision) from b),
  'policy', 'bh-learning-policy-v1 (provisional)',
  'students', coalesce((select jsonb_agg(jsonb_build_object(
     'id', m.id, 'name', m.name,
     'constructs', coalesce((select jsonb_agg(jsonb_build_object(
         'node_id', t.node_id, 'code', t.code, 'name', t.name, 'skill', t.skill, 'state', t.st->>'state', 'stale', (t.st->>'stale')::boolean,
         'sources', (t.st->>'sources')::int, 'opportunities', (t.st->>'opportunities')::int, 'correct', (t.st->>'correct')::int,
         'newest_at', t.st->>'newest_at',
         'practice', coalesce((select jsonb_agg(distinct jsonb_build_object('material_type', x.material_type, 'material_id', x.material_id,
             'display_code', x.display_code, 'title', x.title, 'purpose', x.purpose)) from materials x where x.node_id = t.node_id), '[]'),
         'extension', private.ielts_extension_for_construct(t.code))
       order by t.priority, t.code) from targets t where t.student_id = m.id and t.st->>'state' <> 'not_enough_evidence'), '[]'),
     'has_evidence', exists(select 1 from src where src.student_id = m.id and src.independent))
   order by m.name) from members m), '[]'),
  'gaps', coalesce((select jsonb_agg(distinct jsonb_build_object('node_id', t.node_id, 'code', t.code, 'name', t.name))
     from targets t where t.priority <= 5 and not exists(select 1 from materials x where x.node_id = t.node_id)), '[]')
 );
$$;

revoke all on function public.rpc_ielts_batch_learning_loop(uuid) from public, anon;
grant execute on function public.rpc_ielts_batch_learning_loop(uuid) to authenticated;
