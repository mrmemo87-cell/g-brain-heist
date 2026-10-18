-- Diagnostic Bible 2.0.0 section 8A.4A: provisional default policy bh-learning-policy-v1 for objective skills,
-- computed on read from qualified evidence (screener outcomes and targeted-practice submissions), and the
-- weekly batch view of section 15B.5. Read-only: no scores, attempts or reviews are written.

-- Pure state function: p_sources is a JSON array of {at, opps, correct, independent}.
create or replace function private.ielts_policy_v1_state(p_sources jsonb, p_practice_at timestamptz, p_now timestamptz default now())
returns jsonb language plpgsql immutable set search_path to '' as $$
declare
 s jsonb := coalesce((select jsonb_agg(x order by (x->>'at')::timestamptz)
   from jsonb_array_elements(coalesce(p_sources,'[]')) x where (x->>'independent')::boolean and (x->>'opps')::int>0),'[]');
 n int := jsonb_array_length(s);
 o int := 0; c int := 0; i int; j int; k int; acc numeric; ref_acc numeric;
 newest jsonb; prev jsonb; state text := 'not_enough_evidence'; ref_at timestamptz; imp_at timestamptz;
 a_new numeric; a_prev numeric; low_after_practice boolean := false; later_high boolean := false; first_low int := -1;
begin
 for i in 0..n-1 loop o := o + (s->i->>'opps')::int; c := c + (s->i->>'correct')::int; end loop;
 if n = 0 then
  return jsonb_build_object('state',state,'sources',0,'opportunities',0,'correct',0,'policy','bh-learning-policy-v1');
 end if;
 newest := s->(n-1);
 a_new := (newest->>'correct')::numeric/(newest->>'opps')::numeric;
 if n >= 2 then prev := s->(n-2); a_prev := (prev->>'correct')::numeric/(prev->>'opps')::numeric; end if;
 for i in 0..n-1 loop
  acc := (s->i->>'correct')::numeric/(s->i->>'opps')::numeric;
  if first_low < 0 and (s->i->>'opps')::int >= 2 and acc <= 0.5 then first_low := i; end if;
  if first_low >= 0 and i > first_low and acc > 0.75 then later_high := true; end if;
  if p_practice_at is not null and (s->i->>'at')::timestamptz > p_practice_at and acc <= 0.5 then low_after_practice := true; end if;
 end loop;

 -- Improvement: a later fresh source with >= 3 opportunities, >= 70% and >= 25 points above the low reference.
 if first_low >= 0 then
  ref_acc := (s->first_low->>'correct')::numeric/(s->first_low->>'opps')::numeric;
  ref_at := (s->first_low->>'at')::timestamptz;
  for j in first_low+1..n-1 loop
   acc := (s->j->>'correct')::numeric/(s->j->>'opps')::numeric;
   if (s->j->>'opps')::int >= 3 and acc >= 0.7 and acc >= ref_acc + 0.25 then
    imp_at := (s->j->>'at')::timestamptz; state := 'improvement_observed';
    for k in j+1..n-1 loop
     acc := (s->k->>'correct')::numeric/(s->k->>'opps')::numeric;
     if acc <= 0.5 then state := 'difficulty_observed_again';
     elsif state = 'improvement_observed' and acc >= 0.7 and (s->k->>'at')::timestamptz >= imp_at + interval '14 days' then state := 'improvement_sustained';
     end if;
    end loop;
    exit;
   end if;
  end loop;
 end if;

 if state = 'not_enough_evidence' then
  if n >= 2 and o >= 4 and c::numeric/o <= 0.5 and not later_high then
   state := case when p_practice_at is not null and low_after_practice
                      and (newest->>'at')::timestamptz - (s->0->>'at')::timestamptz >= interval '21 days'
                 then 'persistent_candidate' else 'repeated_difficulty' end;
  elsif n >= 2 and o >= 4 and c::numeric/o >= 0.8 then state := 'repeated_strength';
  elsif n >= 2 and ((a_new <= 0.5 and a_prev >= 0.75) or (a_new >= 0.75 and a_prev <= 0.5)) then state := 'mixed';
  elsif first_low >= 0 and not later_high then state := 'possible_difficulty';
  elsif (newest->>'opps')::int >= 2 and a_new = 1 then state := 'possible_strength';
  elsif o < 2 then state := 'not_enough_evidence';
  else state := 'no_concern';
  end if;
 end if;

 return jsonb_build_object('state',state,
  'stale',(newest->>'at')::timestamptz < p_now - interval '90 days',
  'sources',n,'opportunities',o,'correct',c,'pooled',round(c::numeric/o,2),
  'newest_at',newest->>'at','policy','bh-learning-policy-v1');
end $$;

-- Qualified objective evidence per student and construct.
-- Screeners: the first scored attempt of each form version is independent; later retakes of the same form are exposed.
-- Targeted practice: independent checks on first exposure are independent; guided practice is participation only.
create or replace function private.ielts_student_construct_sources(p_student uuid)
returns table(node_id uuid, skill text, kind text, source_key text, at timestamptz, opps int, correct int, independent boolean)
language sql stable security definer set search_path to '' as $$
 with attempts as (
  select e.attempt_id, e.version_id, e.started_at,
         row_number() over (partition by e.version_id order by e.started_at, e.attempt_id) as nth
  from private.ielts_diagnostic_attempt_evidence e
  where e.student_id = p_student and exists(select 1 from private.ielts_diagnostic_scoring_runs r where r.attempt_id = e.attempt_id)
 ), runs as (
  select distinct on (r.attempt_id) r.attempt_id, r.outcomes, r.created_at
  from private.ielts_diagnostic_scoring_runs r join attempts a on a.attempt_id = r.attempt_id
  where r.server_verified
  order by r.attempt_id, r.run_version desc, r.created_at desc
 ), screener as (
  select n.id as node_id, o->>'skill' as skill, 'screener'::text as kind, a.attempt_id::text as source_key,
         coalesce(a.started_at, r.created_at) as at,
         sum((o->>'marks_possible')::int)::int as opps, sum((o->>'marks_awarded')::int)::int as correct, a.nth = 1 as independent
  from runs r join attempts a using (attempt_id)
  cross join lateral jsonb_array_elements(r.outcomes) o
  join public.academic_skill_registry_nodes n on n.code = o->>'construct'
  where o->>'response_state' = 'answered'
  group by n.id, o->>'skill', a.attempt_id, a.started_at, r.created_at, a.nth
 ), targeted as (
  select (o->>'taxonomy_node_id')::uuid as node_id, t.skill, 'targeted'::text as kind, al.id::text as source_key, s.submitted_at as at,
         count(*)::int as opps, count(*) filter (where (o->>'correct')::boolean)::int as correct,
         t.purpose = 'independent_check' and not exists(
           select 1 from private.ielts_learning_allocations p where p.student_id = al.student_id and p.task_code = al.task_code and p.created_at < al.created_at) as independent
  from private.ielts_learning_allocations al
  join private.ielts_learning_submissions s on s.allocation_id = al.id
  join private.ielts_learning_tasks t on t.code = al.task_code
  cross join lateral jsonb_array_elements(s.outcomes) o
  where al.student_id = p_student and t.skill in ('listening','reading') and o ? 'taxonomy_node_id' and o->>'response_state' = 'answered'
  group by 1, t.skill, al.id, al.student_id, al.task_code, al.created_at, s.submitted_at, t.purpose
 )
 select * from screener union all select * from targeted;
$$;

-- Static teaching suggestions: which optional extension lesson addresses a construct (Lessons Bible LB-10).
create or replace function private.ielts_extension_for_construct(p_code text) returns text
language sql immutable set search_path to '' as $$
 select case
  when p_code in ('bh-ielts-core-v1-task1-process') then 'IELTS-X5'
  when p_code in ('bh-ielts-core-v1-task1-map-change') then 'IELTS-X6'
  when p_code in ('bh-ielts-core-v1-task1-overview','bh-ielts-core-v1-task1-key-features') then 'IELTS-X7'
  when p_code like 'eng.writing.argumentation.%' then 'IELTS-X8'
  when p_code in ('bh-ielts-core-v1-choose-multiple','bh-ielts-listening-v1-sequencing') then 'IELTS-X4'
  when p_code in ('eng.reading.main-ideas.summary') then 'IELTS-X1'
  when p_code in ('eng.reading.explicit-information.locate-detail','eng.reading.strategy-selection.scan') then 'IELTS-X2'
  when p_code in ('eng.reading.multimodal.integrate-modes','eng.reading.explicit-information.sequence') then 'IELTS-X3'
 end;
$$;

revoke all on function private.ielts_policy_v1_state(jsonb,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function private.ielts_student_construct_sources(uuid) from public, anon, authenticated;
revoke all on function private.ielts_extension_for_construct(text) from public, anon, authenticated;
