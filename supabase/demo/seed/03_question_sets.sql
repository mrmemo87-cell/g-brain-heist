-- Demo seed 03: choose fresh verified Grade 7 English questions for the story.
-- Each "set" is 3 questions sharing one evidence focus + assessment process, so every
-- weekly check produces a standard-quality observation per skill.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

create table if not exists private.demo_question_sets (
  skill text not null,          -- P perfect, A agreement, C comparison, Q questions
  set_no integer not null,      -- 1..8 weekly checks, 9+ targeted practice
  question_ids uuid[] not null,
  primary key (skill, set_no)
);
revoke all on private.demo_question_sets from public, anon, authenticated;
truncate private.demo_question_sets;

with skills(skill, code) as (values
  ('P', 'eng.use-of-english.verb-tense-time.perfect'),
  ('A', 'eng.use-of-english.agreement-reference.subject-verb'),
  ('C', 'eng.use-of-english.adjectives-adverbs.comparison'),
  ('Q', 'eng.use-of-english.questions-negation.questions')
), eligible as (
  select distinct on (q.id) s.skill, q.id, rt.evidence_focus_id, rt.assessment_process_code ao
  from public.questions q
  join public.verified_question_registry_taxonomy rt
    on rt.question_id = q.id and rt.question_content_hash = q.current_content_hash
   and rt.review_status = 'approved' and not rt.human_review_required
  join public.academic_skill_registry_versions rv
    on rv.id = rt.registry_version_id and rv.status = 'published'
   and private.academic_registry_subject_matches(rv.id, q.subject)
  join public.academic_skill_registry_nodes sub
    on sub.id = rt.atomic_subskill_node_id and sub.status = 'active' and sub.node_type = 'subskill'
  join skills s on s.code = sub.code
  where q.verification_status = 'verified' and q.analytics_eligible and q.is_active
    and q.recheck_status <> 'pending' and q.current_content_hash = q.verified_content_hash
    and 7 = any(q.eligible_grade_levels) and q.question_type = 'multiple_choice'
    and q.pool_scope = 'global' and q.content_origin = 'brain_heist'
    and q.owner_school_id is null and q.is_public
    -- only questions mapped to exactly one registry subskill, so each set is one skill
    and (select count(*) from public.verified_question_registry_taxonomy x
         where x.question_id = q.id and x.question_content_hash = q.current_content_hash
           and x.review_status = 'approved') = 1
  order by q.id
), numbered as (
  select skill, id, evidence_focus_id, ao,
         row_number() over (partition by skill, evidence_focus_id, ao order by md5(id::text)) rn
  from eligible
), triples as (
  select skill, evidence_focus_id, ao, (rn - 1) / 3 as t, array_agg(id order by rn) ids
  from numbered group by 1, 2, 3, 4 having count(*) = 3
)
insert into private.demo_question_sets(skill, set_no, question_ids)
select skill, row_number() over (partition by skill order by md5(evidence_focus_id::text || ao || t)), ids
from triples;

do $$
declare r record;
begin
  for r in select s.skill, count(*) n from (values ('P'),('A'),('C'),('Q')) s(skill)
           left join private.demo_question_sets q using (skill) group by 1 loop
    if r.n < 8 or (r.skill = 'P' and r.n < 9) then
      raise exception 'Not enough fresh question sets for skill % (have %)', r.skill, r.n;
    end if;
  end loop;
end $$;
