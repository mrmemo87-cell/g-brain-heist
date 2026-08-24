-- Quarantine eight immutable legacy questions with objective scoring or
-- accessibility defects, and supersede fifteen erroneous Grade 4 mappings.
--
-- Source content remains untouched. Every mutation is bound to the reviewed
-- question identity/hash or the exact governed curriculum locator. Any drift
-- aborts the migration so a different production record cannot be changed.

create table public.verified_question_governance_events (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_content_hash text not null,
  event_type text not null check (event_type in ('retired', 'reverified')),
  reason_code text not null check (reason_code in (
    'answer_explanation_contradiction',
    'visual_missing_alt_text'
  )),
  reason text not null check (length(trim(reason)) between 10 and 2000),
  authority text not null check (length(trim(authority)) between 3 and 200),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  check (question_content_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.verified_question_governance_events is
  'Append-only, hash-bound governance history for retiring or re-verifying immutable Brain Heist questions.';

create index verified_question_governance_events_question_time_idx
  on public.verified_question_governance_events(question_id, occurred_at desc);

alter table public.verified_question_governance_events enable row level security;
revoke all on table public.verified_question_governance_events
  from public, anon, authenticated, service_role;
revoke all on sequence public.verified_question_governance_events_id_seq
  from public, anon, authenticated, service_role;
grant select on table public.verified_question_governance_events to service_role;

create or replace function private.verified_question_governance_event_is_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'verified_question_governance_events_are_append_only';
end;
$$;

revoke all on function private.verified_question_governance_event_is_append_only()
  from public, anon, authenticated, service_role;

create trigger trg_verified_question_governance_events_append_only
before update or delete on public.verified_question_governance_events
for each row execute function private.verified_question_governance_event_is_append_only();

create temporary table _verified_question_quarantine (
  question_id uuid primary key,
  expected_hash text not null,
  reason_code text not null,
  reason text not null
) on commit drop;

insert into _verified_question_quarantine(question_id, expected_hash, reason_code, reason)
values
  ('0c929e4c-e42d-4269-b765-b3a3a23985c8', 'b11d2d503bb6353703fc321de54178881736bee292938eddd22e0e67c00a1a03',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('192d0c7f-c45c-4f52-a282-483fdc9f471d', 'be84dac7f0279caee7d95acf07b5cbf6d5b7b3ea34e45fbfcaf63f6c7bb0e800',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('3a5dfe43-f7e9-4408-92b9-72461d74a4eb', '3f08ce62dde4d19455b5765c0e6a0acb9ae0ad9d836d9a93422adcd0778e7e4b',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('3d12f655-9994-4653-a21a-e6b74401adac', 'dc2d3c1ce0ead059c54443f5a18eca5c48f166f3fe0b9e11d44ec7335b12c1e4',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('673a8165-b022-46d0-8211-f8adc6159ff0', 'ec890c44240e7be25e9fcc5e4075915736faf873d7c3fe83bb0c352ea94a930e',
    'answer_explanation_contradiction', 'Stored correct answer contradicts the worked solution, so any resulting student score would be unreliable.'),
  ('a17a81e3-f94f-4b94-a066-5c91dcdf4ccb', 'a59baf5f4218a2f0bf6eaece67751b6c22f74cc2401e47beb5dce24b71c7380b',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('e15cbaba-047a-43cb-ab15-8edf967aacc3', '10fdaccd41c9a5293f7b824d480f4b385a8b9bbeb36d64e0e8a2382ecb55f88d',
    'visual_missing_alt_text', 'Visual mathematics item has no reviewed alternative text, so it cannot provide equitable assessive evidence.'),
  ('fb24d0f9-71fa-4173-b3f9-cb25c6d84a8c', 'd6f89ba67d5c435037be523e72fcce487973b26345aa261bde051aafd22b5e3f',
    'answer_explanation_contradiction', 'Stored correct answer contradicts the worked solution, so any resulting student score would be unreliable.');

do $$
declare
  v_exact_count integer;
begin
  select count(*) into v_exact_count
  from _verified_question_quarantine c
  join public.questions q
    on q.id = c.question_id
   and q.verified_content_hash = c.expected_hash
   and q.current_content_hash = c.expected_hash
  where q.content_origin = 'brain_heist'
    and q.verification_status = 'verified'
    and q.analytics_eligible
    and q.is_public
    and q.is_active;

  if v_exact_count <> 8 then
    raise exception using
      errcode = '23514',
      message = 'verified_question_quarantine_preflight_failed',
      detail = format('Expected 8 exact active hash-bound questions; found %s.', v_exact_count);
  end if;
end;
$$;

insert into public.verified_question_governance_events(
  question_id,
  question_content_hash,
  event_type,
  reason_code,
  reason,
  authority,
  details
)
select
  c.question_id,
  c.expected_hash,
  'retired',
  c.reason_code,
  c.reason,
  'Brains Heist verified-question governance audit 2026-08-24',
  jsonb_build_object(
    'contentPreserved', true,
    'analyticsEligibilityRemoved', true,
    'requiresReviewedReplacement', true
  )
from _verified_question_quarantine c;

update public.questions q
set verification_status = 'retired',
    analytics_eligible = false,
    is_public = false,
    is_active = false,
    updated_at = now()
from _verified_question_quarantine c
where q.id = c.question_id
  and q.verified_content_hash = c.expected_hash
  and q.current_content_hash = c.expected_hash;

do $$
declare
  v_retired_count integer;
begin
  select count(*) into v_retired_count
  from _verified_question_quarantine c
  join public.questions q
    on q.id = c.question_id
   and q.verified_content_hash = c.expected_hash
   and q.current_content_hash = c.expected_hash
  where q.content_origin = 'brain_heist'
    and q.verification_status = 'retired'
    and not q.analytics_eligible
    and not q.is_public
    and not q.is_active;

  if v_retired_count <> 8 then
    raise exception using
      errcode = '23514',
      message = 'verified_question_quarantine_postcondition_failed',
      detail = format('Expected 8 retired questions; found %s.', v_retired_count);
  end if;
end;
$$;

create temporary table _wrong_grade_four_future_tense_mappings (
  question_id uuid primary key,
  mapping_id uuid unique
) on commit drop;

insert into _wrong_grade_four_future_tense_mappings(question_id, mapping_id)
select target.question_id, m.id
from (values
  ('35ce05e2-275e-4f74-9967-d86564f3fe57'::uuid),
  ('56b12a3b-cbc4-4c74-bdb1-ebdd7d485e14'::uuid),
  ('575a365e-260d-44bf-84bd-4524017de1c6'::uuid),
  ('6f6dafcf-ec60-4398-89e4-65e43bc07c9c'::uuid),
  ('7b183f3c-d9b9-4948-9467-09b993f64f29'::uuid),
  ('7c1e779d-58d8-44ac-a525-b6dcffa04af8'::uuid),
  ('8b980012-c745-42ca-9a8a-9286f4d285f2'::uuid),
  ('9164bbd7-d44e-48a6-ad7a-c32e6645370f'::uuid),
  ('9ffbf10e-4e2e-43cf-943f-4020f737d124'::uuid),
  ('adeb580d-7625-4118-ae6f-e4068ba495ec'::uuid),
  ('c716beb9-7882-409f-b93e-29cbe14a94c0'::uuid),
  ('ccbfb6a9-bc5c-40f3-b28f-8d5846b29eaf'::uuid),
  ('f4ce431f-31e8-4bce-9982-4896b35b9091'::uuid),
  ('f55df678-3a7c-4e0b-a441-ef58c3173967'::uuid),
  ('f60561e3-5d2f-4704-86d2-50b3f47fd5c1'::uuid)
) as target(question_id)
join public.questions q on q.id = target.question_id
join public.curriculum_assessment_items i
  on i.source_type = 'question_bank'
 and i.source_record_id = q.id::text
 and i.source_item_key = 'question'
 and i.is_active
 and i.content_hash = q.current_content_hash
join public.curriculum_item_objective_mappings m
  on m.assessment_item_id = i.id
 and m.status = 'approved'
join public.curriculum_framework_versions v
  on v.id = m.framework_version_id
 and v.version_code = '2026-11'
join public.curriculum_scopes s
  on s.id = m.curriculum_scope_id
 and s.code = 'english-grade-4'
join public.curriculum_objectives o
  on o.id = m.curriculum_objective_id
 and o.code = 'eng4-grammar-punctuation';

do $$
declare
  v_mapping_count integer;
begin
  select count(*) into v_mapping_count
  from _wrong_grade_four_future_tense_mappings;

  if v_mapping_count <> 15 then
    raise exception using
      errcode = '23514',
      message = 'wrong_grade_four_mapping_preflight_failed',
      detail = format('Expected 15 exact approved mappings; found %s.', v_mapping_count);
  end if;
end;
$$;

update public.curriculum_item_objective_mappings m
set status = 'superseded',
    superseded_at = now()
from _wrong_grade_four_future_tense_mappings target
where m.id = target.mapping_id
  and m.status = 'approved';

insert into public.curriculum_mapping_decisions(
  mapping_id,
  decision,
  actor_id,
  reason,
  mapping_snapshot
)
select
  m.id,
  'superseded',
  null,
  'Governance audit: legacy Future Tense items are governed for Grades 6 to 9 and were incorrectly cross-mapped to the Grade 4 grammar-and-punctuation objective.',
  private.curriculum_mapping_snapshot(m)
from _wrong_grade_four_future_tense_mappings target
join public.curriculum_item_objective_mappings m on m.id = target.mapping_id;

do $$
declare
  v_superseded_count integer;
  v_decision_count integer;
begin
  select count(*) into v_superseded_count
  from _wrong_grade_four_future_tense_mappings target
  join public.curriculum_item_objective_mappings m on m.id = target.mapping_id
  where m.status = 'superseded' and m.superseded_at is not null;

  select count(*) into v_decision_count
  from _wrong_grade_four_future_tense_mappings target
  join public.curriculum_mapping_decisions d
    on d.mapping_id = target.mapping_id
   and d.decision = 'superseded';

  if v_superseded_count <> 15 or v_decision_count < 15 then
    raise exception using
      errcode = '23514',
      message = 'wrong_grade_four_mapping_postcondition_failed',
      detail = format(
        'Expected 15 superseded mappings and decisions; found %s mappings and %s decisions.',
        v_superseded_count,
        v_decision_count
      );
  end if;
end;
$$;
