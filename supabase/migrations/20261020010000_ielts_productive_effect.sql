-- Writing and Speaking change, per IELTS criterion (owner 2026-10-19: every IELTS skill covered and measured).
-- Diagnostic Bible 2.0.0 section 8A.5 (productive skills): improvement is observed when, on a fresh comparable task, the
-- teacher's rating of a criterion rises by >= 1.0 band, or the teacher confirms the problem is no longer present
-- (screener/interview status "developing" -> "observed"). Repeats of the same task are not fresh, so only the first rating
-- of each task counts. Bands and statuses are different scales and are never compared with each other.
-- Read-only and additive: teacher reviews are the only input; nothing new is stored. Policy bh-productive-effect-v1.

create or replace function private.ielts_productive_effect_v1(p_ratings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
 per_task jsonb; n int; first_r jsonb; last_r jsonb; other_scale boolean := false; i int; d numeric; verdict text;
 rank_first int; rank_last int;
begin
 -- one rating per task: the earliest (a repeated task is not fresh evidence)
 select coalesce(jsonb_agg(r order by (r->>'at')::timestamptz), '[]') into per_task from (
   select distinct on (x->>'task') x as r from jsonb_array_elements(coalesce(p_ratings, '[]')) x
   where x->>'task' is not null and x->>'at' is not null and (x->>'scale' = 'band' and (x->>'value') ~ '^[0-9.]+$' or x->>'scale' = 'status' and x->>'value' in ('developing','observed'))
   order by x->>'task', (x->>'at')::timestamptz) t;
 n := jsonb_array_length(per_task);
 if n = 0 then return jsonb_build_object('verdict','no_rating','pieces',0,'policy','bh-productive-effect-v1 (provisional)'); end if;
 first_r := per_task->0;
 for i in 1..n-1 loop
  if per_task->i->>'scale' = first_r->>'scale' then last_r := per_task->i; else other_scale := true; end if;
 end loop;
 if last_r is null then
  verdict := case when other_scale then 'different_scales' else 'waiting_for_fresh_task' end;
 elsif first_r->>'scale' = 'band' then
  d := (last_r->>'value')::numeric - (first_r->>'value')::numeric;
  verdict := case when d >= 1 then 'higher' when d <= -1 then 'lower' else 'similar' end;
 else
  rank_first := case first_r->>'value' when 'observed' then 1 else 0 end;
  rank_last := case last_r->>'value' when 'observed' then 1 else 0 end;
  verdict := case when rank_last > rank_first then 'higher' when rank_last < rank_first then 'lower' else 'similar' end;
 end if;
 return jsonb_build_object('verdict', verdict, 'pieces', n, 'first', first_r, 'last', last_r, 'policy', 'bh-productive-effect-v1 (provisional)');
end $$;
revoke all on function private.ielts_productive_effect_v1(jsonb) from public, anon, authenticated, service_role;

-- Every teacher rating of a student's Writing/Speaking, mapped to the four IELTS criteria of each skill.
create or replace function private.ielts_student_productive_ratings(p_student uuid)
returns table(skill text, criterion text, at timestamptz, task text, scale text, value text, source text)
language sql stable security definer set search_path = '' as $$
 -- assigned practice essays and recordings: finalized teacher bands
 select 'writing', m.criterion, a.submitted_at, 'writing_task:' || a.task_id::text, 'band', r.rubric->>m.rubric_key, 'practice'
 from public.ielts_productive_skill_reviews r
 join public.ielts_writing_attempts a on a.id::text = r.attempt_id and a.user_id = p_student
 cross join (values ('task_achievement','task_response'),('coherence_cohesion','coherence_cohesion'),('lexical_resource','lexical_resource'),('grammar','grammar')) m(rubric_key, criterion)
 where r.attempt_type = 'writing' and r.finalized and r.rubric ? m.rubric_key
 union all
 select 'speaking', m.criterion, a.submitted_at, 'speaking_task:' || a.task_id::text, 'band', r.rubric->>m.rubric_key, 'practice'
 from public.ielts_productive_skill_reviews r
 join public.ielts_speaking_attempts a on a.id::text = r.attempt_id and a.user_id = p_student
 cross join (values ('fluency','fluency_coherence'),('lexical_resource','lexical_resource'),('grammar','grammar'),('pronunciation','pronunciation')) m(rubric_key, criterion)
 where r.attempt_type = 'speaking' and r.finalized and r.rubric ? m.rubric_key
 union all
 -- Writing screener essays: the current (not superseded) teacher observation per criterion
 select 'writing', case e.key when 'grammar_range_accuracy' then 'grammar' else e.key end, coalesce(sub.submitted_at, ev.started_at),
        'writing_screener:' || ev.version_id::text, 'status', e.value->>'status', 'screener'
 from private.ielts_writing_screener_reviews r
 join private.ielts_diagnostic_attempt_evidence ev on ev.attempt_id = r.attempt_id and ev.student_id = p_student
 left join private.ielts_writing_screener_submissions sub on sub.attempt_id = r.attempt_id
 cross join lateral jsonb_each(r.criterion_observations) e
 where not exists (select 1 from private.ielts_writing_screener_reviews later where later.supersedes_id = r.id)
   and e.key in ('task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy')
 union all
 -- Speaking interviews: the teacher-confirmed observation per criterion
 select 'speaking', case e.key when 'grammar_range_accuracy' then 'grammar' else e.key end, coalesce(s.submitted_at, s.created_at),
        'speaking_interview:' || s.package_code, 'status', e.value->>'status', 'interview'
 from private.ielts_speaking_reviews r
 join private.ielts_speaking_sessions s on s.id = r.session_id and s.student_id = p_student
 cross join lateral jsonb_each(r.fields->'observations') e
 where r.teacher_confirmed and not exists (select 1 from private.ielts_speaking_reviews later where later.session_id = r.session_id and later.reviewed_at > r.reviewed_at)
   and e.key in ('fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation');
$$;
revoke all on function private.ielts_student_productive_ratings(uuid) from public, anon, authenticated, service_role;

create or replace function public.rpc_ielts_batch_productive_effect(p_batch uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch)),
 members as (
  select u.id, coalesce(nullif(u.full_name,''), u.username) as name
  from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
  join b on b.id = m.batch_id
  where m.left_at is null and u.school_id = b.school_id
 ), ratings as (
  select m.id as student_id, r.* from members m cross join lateral private.ielts_student_productive_ratings(m.id) r
 ), grouped as (
  select student_id, skill, criterion,
         private.ielts_productive_effect_v1(jsonb_agg(jsonb_build_object('at', at, 'task', task, 'scale', scale, 'value', value, 'source', source))) as effect
  from ratings group by 1, 2, 3
 )
 select jsonb_build_object(
  'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'revision', b.revision) from b),
  'policy', 'bh-productive-effect-v1 (provisional)',
  'rows', coalesce((select jsonb_agg(jsonb_build_object('student_id', g.student_id, 'student', m.name, 'skill', g.skill, 'criterion', g.criterion,
       'verdict', g.effect->>'verdict', 'pieces', (g.effect->>'pieces')::int, 'first', g.effect->'first', 'last', g.effect->'last')
     order by m.name, g.skill desc, array_position(array['task_response','fluency_coherence','coherence_cohesion','lexical_resource','grammar','pronunciation'], g.criterion))
   from grouped g join members m on m.id = g.student_id), '[]')
 );
$$;
revoke all on function public.rpc_ielts_batch_productive_effect(uuid) from public, anon;
grant execute on function public.rpc_ielts_batch_productive_effect(uuid) to authenticated;
