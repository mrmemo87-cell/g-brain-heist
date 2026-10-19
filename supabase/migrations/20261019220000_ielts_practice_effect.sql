-- "Did it work?" for targeted practice (owner request 2026-10-19: judge targeted practice before building mocks).
-- For each batch student and skill that has been practised, compare the student's independent evidence BEFORE their
-- first practice with independent evidence AFTER it. Practice itself never counts (Diagnostic Bible 2.0.0 8A.4A);
-- only fresh, unexposed checks, first screener attempts and mocks do. The thresholds match bh-learning-policy-v1:
-- a gain needs >= 3 fresh questions, >= 70% after and >= 25 points above before. Read-only; additive; no new data.

create or replace function private.ielts_practice_effect_v1(p_sources jsonb, p_practice_at timestamptz)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
 bo int := 0; bc int := 0; ao int := 0; ac int := 0; b_at timestamptz; a_at timestamptz; x jsonb;
 b_acc numeric; a_acc numeric; verdict text;
begin
 for x in select * from jsonb_array_elements(coalesce(p_sources, '[]')) loop
  continue when not coalesce((x->>'independent')::boolean, false) or coalesce((x->>'opps')::int, 0) <= 0;
  if (x->>'at')::timestamptz < p_practice_at then
   bo := bo + (x->>'opps')::int; bc := bc + (x->>'correct')::int; b_at := greatest(b_at, (x->>'at')::timestamptz);
  else
   ao := ao + (x->>'opps')::int; ac := ac + (x->>'correct')::int; a_at := greatest(a_at, (x->>'at')::timestamptz);
  end if;
 end loop;
 if bo > 0 then b_acc := bc::numeric / bo; end if;
 if ao > 0 then a_acc := ac::numeric / ao; end if;
 verdict := case
  when p_practice_at is null then 'not_practised'
  when ao = 0 then 'waiting_for_check'
  when bo = 0 then 'no_starting_point'
  when bo < 2 or ao < 3 then 'too_few_questions'
  when a_acc >= 0.7 and a_acc >= b_acc + 0.25 then 'higher'
  when a_acc >= b_acc + 0.25 then 'higher_not_secure'
  when a_acc <= b_acc - 0.25 then 'lower'
  else 'similar' end;
 return jsonb_build_object('verdict', verdict, 'policy', 'bh-practice-effect-v1 (provisional)',
  'before', jsonb_build_object('opportunities', bo, 'correct', bc, 'at', b_at),
  'after', jsonb_build_object('opportunities', ao, 'correct', ac, 'at', a_at));
end $$;
revoke all on function private.ielts_practice_effect_v1(jsonb, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.rpc_ielts_batch_practice_effect(p_batch uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch)),
 members as (
  select u.id, coalesce(nullif(u.full_name,''), u.username) as name
  from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
  join b on b.id = m.batch_id
  where m.left_at is null and u.school_id = b.school_id
 ), practice as (
  -- the same practice signals as the weekly loop: guided targeted tasks and completed mapped practice materials
  select al.student_id, (q->>'taxonomy_node_id')::uuid as node_id, s.submitted_at as done_at,
         private.ielts_material_code('targeted', t.code) || ' · ' || t.title as label
  from private.ielts_learning_allocations al
  join private.ielts_learning_submissions s on s.allocation_id = al.id
  join private.ielts_learning_tasks t on t.code = al.task_code
  cross join lateral jsonb_array_elements(t.questions) q
  where al.student_id in (select id from members) and t.purpose = 'guided_practice' and q ? 'taxonomy_node_id'
  union
  select x.student_id, m.node_id, x.done_at,
         coalesce(private.ielts_material_code(x.material_type, x.material_id) || ' · ', '') || coalesce(x.title, 'Practice')
  from (
   select a.user_id as student_id, 'ielts_reading_set'::text as material_type, a.set_id::text as material_id, a.completed_at as done_at, rs.title
     from public.ielts_reading_attempts a left join public.ielts_reading_sets rs on rs.id = a.set_id
     where a.completed_at is not null and a.user_id in (select id from members)
   union all
   select a.user_id, 'ielts_listening_set', a.set_id::text, a.completed_at, ls.title
     from public.ielts_listening_attempts a left join public.ielts_listening_sets ls on ls.id = a.set_id
     where a.completed_at is not null and a.user_id in (select id from members)
   union all
   select a.user_id, 'ielts_writing_task', a.task_id::text, a.submitted_at, wt.title
     from public.ielts_writing_attempts a left join public.ielts_writing_tasks wt on wt.id = a.task_id
     where a.submitted_at is not null and a.user_id in (select id from members)
  ) x
  join private.ielts_material_construct_maps m on m.material_type = x.material_type and m.material_id = x.material_id
   and m.status = 'approved' and m.role = 'primary'
 ), practised as (
  select student_id, node_id, min(done_at) as first_at, max(done_at) as last_at, count(*)::int as times,
         (array_agg(label order by done_at desc))[1:3] as labels
  from practice group by 1, 2
 ), src as (
  select p.student_id, p.node_id, jsonb_agg(jsonb_build_object('at', s.at, 'opps', s.opps, 'correct', s.correct, 'independent', s.independent)) as sources
  from practised p cross join lateral private.ielts_student_construct_sources(p.student_id) s
  where s.node_id = p.node_id
  group by 1, 2
 ), checks as (
  -- fresh checks this student has never been given (released, or this student's own pilot task)
  select p.student_id, p.node_id, t.code, private.ielts_material_code('targeted', t.code) as display_code, t.title
  from practised p
  join private.ielts_learning_tasks t on t.purpose = 'independent_check'
   and exists (select 1 from jsonb_array_elements(t.questions) q where (q->>'taxonomy_node_id')::uuid = p.node_id)
  where (private.ielts_learning_publicly_released(t.code) or t.pilot_student = p.student_id)
    and private.ielts_practice_material_allowed('targeted', t.code)
    and not exists (select 1 from private.ielts_learning_allocations al where al.student_id = p.student_id and al.task_code = t.code)
 ), rows_ as (
  select p.student_id, p.node_id, n.code, n.name, p.first_at, p.last_at, p.times, p.labels,
         private.ielts_practice_effect_v1(coalesce(s.sources, '[]'), p.first_at) as effect,
         (select jsonb_agg(jsonb_build_object('code', c.code, 'display_code', c.display_code, 'title', c.title) order by c.code)
            from checks c where c.student_id = p.student_id and c.node_id = p.node_id) as fresh_checks
  from practised p
  join public.academic_skill_registry_nodes n on n.id = p.node_id
  left join src s on s.student_id = p.student_id and s.node_id = p.node_id
 )
 select jsonb_build_object(
  'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'revision', b.revision) from b),
  'policy', 'bh-practice-effect-v1 (provisional)',
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
     'student_id', r.student_id, 'student', m.name, 'node_id', r.node_id, 'code', r.code, 'skill_name', r.name,
     'first_practice_at', r.first_at, 'last_practice_at', r.last_at, 'practice_count', r.times, 'practice', to_jsonb(r.labels),
     'verdict', r.effect->>'verdict', 'before', r.effect->'before', 'after', r.effect->'after',
     'fresh_checks', coalesce(r.fresh_checks, '[]'))
   order by m.name, r.name) from rows_ r join members m on m.id = r.student_id), '[]'),
  'members', (select count(*) from members)
 );
$$;
revoke all on function public.rpc_ielts_batch_practice_effect(uuid) from public, anon;
grant execute on function public.rpc_ielts_batch_practice_effect(uuid) to authenticated;
