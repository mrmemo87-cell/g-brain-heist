-- Phase 4 of the Academic Intelligence roadmap: traceable Cambridge evidence.
--
-- The adapter never infers question-level attainment from an overall score. It accepts
-- only itemised outcome facts, resolves them through current approved Phase 3 mappings,
-- snapshots every mapping used, and discloses anything it could not safely materialise.
-- Phase 5 owns confidence qualification, so all Phase 4 observations remain provisional
-- and do not yet change current focus-state projections.

alter table public.student_learning_observations
  drop constraint if exists student_learning_observations_source_type_check;
alter table public.student_learning_observations
  add constraint student_learning_observations_source_type_check
  check (source_type in ('assignment_result','writing_attempt','teacher_observation','import','cambridge_attempt'));

create table public.cambridge_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  quiz_score_id uuid not null references public.quiz_scores(id) on delete restrict,
  student_id uuid not null references public.users(id) on delete restrict,
  test_id text not null,
  quiz_version text not null,
  attempt_number integer not null,
  adapter_version text not null,
  scoring_authority text not null
    check (scoring_authority in ('stored_client_result','teacher_verified','server_verified')),
  source_evidence_hash text not null,
  status text not null default 'processing'
    check (status in ('processing','materialized','partial','blocked')),
  source_item_count integer not null default 0 check (source_item_count >= 0),
  registered_item_count integer not null default 0 check (registered_item_count >= 0),
  resolved_item_count integer not null default 0 check (resolved_item_count >= 0),
  unregistered_item_count integer not null default 0 check (unregistered_item_count >= 0),
  unmapped_item_count integer not null default 0 check (unmapped_item_count >= 0),
  stale_item_count integer not null default 0 check (stale_item_count >= 0),
  invalid_item_count integer not null default 0 check (invalid_item_count >= 0),
  unanswered_item_count integer not null default 0 check (unanswered_item_count >= 0),
  observation_count integer not null default 0 check (observation_count >= 0),
  mapping_coverage_percent numeric(5,2) not null default 0
    check (mapping_coverage_percent between 0 and 100),
  disclosure jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (quiz_score_id, adapter_version, scoring_authority, source_evidence_hash),
  check (length(trim(test_id)) between 1 and 500),
  check (length(trim(quiz_version)) between 1 and 200),
  check (length(trim(adapter_version)) between 3 and 100),
  check (attempt_number > 0),
  check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(disclosure) = 'object'),
  check ((status = 'processing' and completed_at is null) or
         (status <> 'processing' and completed_at is not null))
);

create index cambridge_evidence_runs_school_time_idx
  on public.cambridge_evidence_runs(school_id, started_at desc);
create index cambridge_evidence_runs_student_time_idx
  on public.cambridge_evidence_runs(student_id, started_at desc);
create index cambridge_evidence_runs_school_status_idx
  on public.cambridge_evidence_runs(school_id, status, started_at desc);

create table public.cambridge_evidence_item_snapshots (
  id uuid primary key default gen_random_uuid(),
  evidence_run_id uuid not null references public.cambridge_evidence_runs(id) on delete restrict,
  quiz_score_id uuid not null references public.quiz_scores(id) on delete restrict,
  assessment_item_id uuid references public.curriculum_assessment_items(id) on delete restrict,
  source_item_key text not null,
  response_state text not null
    check (response_state in ('correct','partial','incorrect','unanswered','unscored','invalid')),
  marks_awarded numeric(10,3),
  marks_possible numeric(10,3),
  response_hash text,
  mapping_status text not null
    check (mapping_status in ('resolved','unregistered','unmapped','stale','invalid')),
  curriculum_mapping_id uuid references public.curriculum_item_objective_mappings(id) on delete restrict,
  curriculum_objective_id uuid references public.curriculum_objectives(id) on delete restrict,
  curriculum_scope_id uuid references public.curriculum_scopes(id) on delete restrict,
  framework_version_id uuid references public.curriculum_framework_versions(id) on delete restrict,
  mapping_role text,
  mapping_confidence numeric(5,4),
  item_content_hash text,
  curriculum_version_content_hash text,
  mapping_snapshot jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  check (length(trim(source_item_key)) between 1 and 500),
  check (marks_awarded is null or marks_awarded >= 0),
  check (marks_possible is null or marks_possible > 0),
  check (marks_awarded is null or marks_possible is null or marks_awarded <= marks_possible),
  check (response_hash is null or response_hash ~ '^[0-9a-f]{64}$'),
  check (mapping_confidence is null or mapping_confidence between 0 and 1),
  check (item_content_hash is null or item_content_hash ~ '^[0-9a-f]{64}$'),
  check (curriculum_version_content_hash is null or curriculum_version_content_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(mapping_snapshot) = 'object'),
  check ((mapping_status = 'resolved') =
    (curriculum_mapping_id is not null and curriculum_objective_id is not null and
     curriculum_scope_id is not null and framework_version_id is not null and
     mapping_role is not null and mapping_confidence is not null and
     item_content_hash is not null and curriculum_version_content_hash is not null))
);

create unique index cambridge_evidence_item_snapshots_resolved_uidx
  on public.cambridge_evidence_item_snapshots(evidence_run_id, source_item_key, curriculum_mapping_id)
  where mapping_status = 'resolved';
create unique index cambridge_evidence_item_snapshots_unresolved_uidx
  on public.cambridge_evidence_item_snapshots(evidence_run_id, source_item_key)
  where mapping_status <> 'resolved';
create index cambridge_evidence_item_snapshots_run_status_idx
  on public.cambridge_evidence_item_snapshots(evidence_run_id, mapping_status, source_item_key);
create index cambridge_evidence_item_snapshots_objective_idx
  on public.cambridge_evidence_item_snapshots(curriculum_objective_id, evidence_run_id)
  where curriculum_objective_id is not null;
create index cambridge_evidence_item_snapshots_assessment_item_idx
  on public.cambridge_evidence_item_snapshots(assessment_item_id, evidence_run_id)
  where assessment_item_id is not null;

create table public.cambridge_evidence_observations (
  evidence_run_id uuid not null references public.cambridge_evidence_runs(id) on delete restrict,
  observation_id uuid not null references public.student_learning_observations(id) on delete restrict,
  curriculum_objective_id uuid not null references public.curriculum_objectives(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (evidence_run_id, curriculum_objective_id),
  unique (observation_id)
);

create index cambridge_evidence_observations_objective_idx
  on public.cambridge_evidence_observations(curriculum_objective_id, evidence_run_id);

alter table public.cambridge_evidence_runs enable row level security;
alter table public.cambridge_evidence_item_snapshots enable row level security;
alter table public.cambridge_evidence_observations enable row level security;

revoke all on table public.cambridge_evidence_runs from public, anon, authenticated, service_role;
revoke all on table public.cambridge_evidence_item_snapshots from public, anon, authenticated, service_role;
revoke all on table public.cambridge_evidence_observations from public, anon, authenticated, service_role;
grant select, insert, update on table public.cambridge_evidence_runs to service_role;
grant select, insert on table public.cambridge_evidence_item_snapshots to service_role;
grant select, insert on table public.cambridge_evidence_observations to service_role;

create or replace function private.cambridge_evidence_protect_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'cambridge_evidence_runs_are_append_only';
  end if;
  if old.status <> 'processing' then
    raise exception 'completed_cambridge_evidence_run_is_immutable';
  end if;
  if new.status = 'processing'
    or row(new.school_id, new.quiz_score_id, new.student_id, new.test_id, new.quiz_version,
           new.attempt_number, new.adapter_version, new.scoring_authority, new.source_evidence_hash,
           new.started_at)
       is distinct from
       row(old.school_id, old.quiz_score_id, old.student_id, old.test_id, old.quiz_version,
           old.attempt_number, old.adapter_version, old.scoring_authority, old.source_evidence_hash,
           old.started_at) then
    raise exception 'cambridge_evidence_run_identity_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.cambridge_evidence_protect_run() from public, anon, authenticated, service_role;

create trigger trg_cambridge_evidence_protect_run
before update or delete on public.cambridge_evidence_runs
for each row execute function private.cambridge_evidence_protect_run();

create or replace function private.cambridge_evidence_reject_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cambridge_evidence_snapshots_are_append_only';
end;
$$;
revoke all on function private.cambridge_evidence_reject_snapshot_mutation() from public, anon, authenticated, service_role;

create trigger trg_cambridge_evidence_item_snapshots_append_only
before update or delete on public.cambridge_evidence_item_snapshots
for each row execute function private.cambridge_evidence_reject_snapshot_mutation();
create trigger trg_cambridge_evidence_observations_append_only
before update or delete on public.cambridge_evidence_observations
for each row execute function private.cambridge_evidence_reject_snapshot_mutation();

create or replace function private.cambridge_materialize_evidence(
  p_quiz_score_id uuid,
  p_item_results jsonb,
  p_scoring_authority text,
  p_adapter_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score public.quiz_scores%rowtype;
  v_run public.cambridge_evidence_runs%rowtype;
  v_hash text;
  v_result jsonb;
  v_item public.curriculum_assessment_items%rowtype;
  v_key text;
  v_state text;
  v_awarded numeric;
  v_possible numeric;
  v_response_hash text;
  v_invalid boolean;
  v_registered integer := 0;
  v_resolved integer := 0;
  v_unregistered integer := 0;
  v_unmapped integer := 0;
  v_stale integer := 0;
  v_invalid_count integer := 0;
  v_unanswered integer := 0;
  v_observations integer := 0;
  v_source_count integer := 0;
  v_sum_awarded numeric := 0;
  v_sum_possible numeric := 0;
  v_duplicate_count integer := 0;
  v_status text;
  v_reason text;
  v_mapping record;
  v_group record;
  v_observation_id uuid;
  v_percentage numeric;
  v_kind text;
  v_coverage numeric := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('cambridge-evidence:' || p_quiz_score_id::text, 0));

  select * into v_score from public.quiz_scores where id = p_quiz_score_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'cambridge_attempt_not_found');
  end if;
  if v_score.school_id is null or v_score.student_id is null or nullif(trim(v_score.test_id), '') is null
    or nullif(trim(v_score.quiz_version), '') is null then
    return jsonb_build_object('success', false, 'code', 'cambridge_attempt_identity_incomplete');
  end if;
  if p_scoring_authority not in ('stored_client_result','teacher_verified','server_verified') then
    return jsonb_build_object('success', false, 'code', 'invalid_cambridge_scoring_authority');
  end if;
  if nullif(trim(p_adapter_version), '') is null or length(trim(p_adapter_version)) > 100 then
    return jsonb_build_object('success', false, 'code', 'invalid_cambridge_adapter_version');
  end if;

  v_hash := encode(extensions.digest(convert_to(
    concat_ws('|', v_score.id::text, v_score.test_id, v_score.quiz_version,
      v_score.attempt_number::text, p_scoring_authority, coalesce(p_item_results, 'null'::jsonb)::text),
    'UTF8'), 'sha256'), 'hex');

  select * into v_run from public.cambridge_evidence_runs
  where quiz_score_id = p_quiz_score_id and adapter_version = trim(p_adapter_version)
    and scoring_authority = p_scoring_authority and source_evidence_hash = v_hash;
  if found then
    return jsonb_build_object('success', true, 'idempotent', true, 'runId', v_run.id,
      'status', v_run.status, 'disclosure', v_run.disclosure);
  end if;

  insert into public.cambridge_evidence_runs(
    school_id, quiz_score_id, student_id, test_id, quiz_version, attempt_number,
    adapter_version, scoring_authority, source_evidence_hash
  ) values (
    v_score.school_id, v_score.id, v_score.student_id, trim(v_score.test_id), trim(v_score.quiz_version),
    v_score.attempt_number, trim(p_adapter_version), p_scoring_authority, v_hash
  ) returning * into v_run;

  if jsonb_typeof(p_item_results) is distinct from 'array' then
    v_status := 'blocked';
    v_reason := 'item_results_missing';
  else
    v_source_count := jsonb_array_length(p_item_results);
    if v_source_count = 0 then
      v_status := 'blocked'; v_reason := 'item_results_empty';
    elsif v_source_count > 500 then
      v_status := 'blocked'; v_reason := 'item_results_limit_exceeded';
    end if;
  end if;

  if v_status is null then
    select count(*) - count(distinct trim(value->>'item_key')) into v_duplicate_count
    from jsonb_array_elements(p_item_results);
    if v_duplicate_count > 0 then
      v_status := 'blocked'; v_reason := 'duplicate_item_keys';
    end if;
  end if;

  if v_status is null then
    for v_result in select value from jsonb_array_elements(p_item_results) loop
      v_key := nullif(trim(v_result->>'item_key'), '');
      v_state := lower(trim(coalesce(v_result->>'response_state', '')));
      v_invalid := jsonb_typeof(v_result) <> 'object'
        or v_key is null or length(v_key) > 500
        or v_state not in ('correct','partial','incorrect','unanswered','unscored')
        or coalesce(v_result->>'marks_possible', '') !~ '^\d+(\.\d{1,3})?$'
        or coalesce(v_result->>'marks_awarded', '') !~ '^\d+(\.\d{1,3})?$';

      if not v_invalid then
        v_awarded := (v_result->>'marks_awarded')::numeric;
        v_possible := (v_result->>'marks_possible')::numeric;
        v_invalid := v_possible <= 0 or v_awarded < 0 or v_awarded > v_possible
          or (v_state = 'correct' and v_awarded <> v_possible)
          or (v_state = 'incorrect' and v_awarded <> 0)
          or (v_state in ('unanswered','unscored') and v_awarded <> 0);
      else
        v_awarded := null; v_possible := null;
      end if;

      if v_invalid then
        v_invalid_count := v_invalid_count + 1;
        insert into public.cambridge_evidence_item_snapshots(
          evidence_run_id, quiz_score_id, source_item_key, response_state, mapping_status,
          mapping_snapshot
        ) values (
          v_run.id, v_score.id, coalesce(v_key, 'invalid-' || v_invalid_count::text), 'invalid', 'invalid',
          jsonb_build_object('adapterVersion', trim(p_adapter_version), 'reason', 'invalid_item_result')
        );
        continue;
      end if;

      v_sum_awarded := v_sum_awarded + v_awarded;
      v_sum_possible := v_sum_possible + v_possible;
      if v_state = 'unanswered' then v_unanswered := v_unanswered + 1; end if;
      v_response_hash := null;
      if v_result ? 'response_hash' and coalesce(v_result->>'response_hash', '') ~ '^[0-9a-f]{64}$' then
        v_response_hash := v_result->>'response_hash';
      end if;

      select i.* into v_item
      from public.curriculum_assessment_items i
      where i.source_type = 'cambridge_test' and i.source_record_id = v_score.test_id
        and i.source_item_key = v_key and i.is_active
        and (i.school_id = v_score.school_id or i.school_id is null)
        and (i.source_version is null or i.source_version = v_score.quiz_version)
      order by case when i.school_id = v_score.school_id then 0 else 1 end
      limit 1;

      if not found then
        v_unregistered := v_unregistered + 1;
        insert into public.cambridge_evidence_item_snapshots(
          evidence_run_id, quiz_score_id, source_item_key, response_state, marks_awarded,
          marks_possible, response_hash, mapping_status, mapping_snapshot
        ) values (
          v_run.id, v_score.id, v_key, v_state, v_awarded, v_possible, v_response_hash,
          'unregistered', jsonb_build_object('adapterVersion', trim(p_adapter_version),
            'sourceType', 'cambridge_test', 'testId', v_score.test_id,
            'quizVersion', v_score.quiz_version, 'itemKey', v_key)
        );
        continue;
      end if;

      v_registered := v_registered + 1;
      if exists (
        select 1 from public.curriculum_item_objective_mappings m
        where m.assessment_item_id = v_item.id and m.status = 'approved'
      ) and not exists (
        select 1 from public.curriculum_item_objective_mappings m
        join public.curriculum_framework_versions fv on fv.id = m.framework_version_id
        where m.assessment_item_id = v_item.id and m.status = 'approved'
          and m.item_content_hash = v_item.content_hash
          and m.curriculum_version_content_hash = fv.content_hash
          and fv.status in ('published','retired')
      ) then
        v_stale := v_stale + 1;
        insert into public.cambridge_evidence_item_snapshots(
          evidence_run_id, quiz_score_id, assessment_item_id, source_item_key, response_state,
          marks_awarded, marks_possible, response_hash, mapping_status, mapping_snapshot
        ) values (
          v_run.id, v_score.id, v_item.id, v_key, v_state, v_awarded, v_possible,
          v_response_hash, 'stale', jsonb_build_object('adapterVersion', trim(p_adapter_version),
            'assessmentItemId', v_item.id, 'itemContentHash', v_item.content_hash,
            'reason', 'approved_mapping_hash_mismatch')
        );
        continue;
      end if;

      if not exists (
        select 1 from public.curriculum_item_objective_mappings m
        join public.curriculum_framework_versions fv on fv.id = m.framework_version_id
        where m.assessment_item_id = v_item.id and m.status = 'approved'
          and m.item_content_hash = v_item.content_hash
          and m.curriculum_version_content_hash = fv.content_hash
          and fv.status in ('published','retired')
      ) then
        v_unmapped := v_unmapped + 1;
        insert into public.cambridge_evidence_item_snapshots(
          evidence_run_id, quiz_score_id, assessment_item_id, source_item_key, response_state,
          marks_awarded, marks_possible, response_hash, mapping_status, mapping_snapshot
        ) values (
          v_run.id, v_score.id, v_item.id, v_key, v_state, v_awarded, v_possible,
          v_response_hash, 'unmapped', jsonb_build_object('adapterVersion', trim(p_adapter_version),
            'assessmentItemId', v_item.id, 'itemContentHash', v_item.content_hash,
            'reason', 'current_approved_mapping_missing')
        );
        continue;
      end if;

      v_resolved := v_resolved + 1;
      for v_mapping in
        select m.id as mapping_id, m.curriculum_objective_id, m.curriculum_scope_id,
          m.framework_version_id, m.mapping_role, m.confidence_score,
          m.item_content_hash, m.curriculum_version_content_hash, m.approved_at
        from public.curriculum_item_objective_mappings m
        join public.curriculum_framework_versions fv on fv.id = m.framework_version_id
        where m.assessment_item_id = v_item.id and m.status = 'approved'
          and m.item_content_hash = v_item.content_hash
          and m.curriculum_version_content_hash = fv.content_hash
          and fv.status in ('published','retired')
        order by case m.mapping_role when 'primary' then 1 when 'secondary' then 2
          when 'prerequisite' then 3 else 4 end, m.confidence_score desc, m.id
      loop
        insert into public.cambridge_evidence_item_snapshots(
          evidence_run_id, quiz_score_id, assessment_item_id, source_item_key, response_state,
          marks_awarded, marks_possible, response_hash, mapping_status, curriculum_mapping_id,
          curriculum_objective_id, curriculum_scope_id, framework_version_id, mapping_role,
          mapping_confidence, item_content_hash, curriculum_version_content_hash, mapping_snapshot
        ) values (
          v_run.id, v_score.id, v_item.id, v_key, v_state, v_awarded, v_possible,
          v_response_hash, 'resolved', v_mapping.mapping_id, v_mapping.curriculum_objective_id,
          v_mapping.curriculum_scope_id, v_mapping.framework_version_id, v_mapping.mapping_role,
          v_mapping.confidence_score, v_mapping.item_content_hash,
          v_mapping.curriculum_version_content_hash,
          jsonb_build_object(
            'mappingId', v_mapping.mapping_id, 'assessmentItemId', v_item.id,
            'curriculumObjectiveId', v_mapping.curriculum_objective_id,
            'curriculumScopeId', v_mapping.curriculum_scope_id,
            'frameworkVersionId', v_mapping.framework_version_id,
            'mappingRole', v_mapping.mapping_role,
            'mappingConfidence', v_mapping.confidence_score,
            'itemContentHash', v_mapping.item_content_hash,
            'curriculumVersionContentHash', v_mapping.curriculum_version_content_hash,
            'mappingApprovedAt', v_mapping.approved_at,
            'capturedByAdapterVersion', trim(p_adapter_version)
          )
        );
      end loop;
    end loop;

    if v_invalid_count > 0 then
      v_status := 'blocked'; v_reason := 'invalid_item_results';
    elsif v_sum_awarded is distinct from v_score.score::numeric
      or v_sum_possible is distinct from v_score.total_questions::numeric then
      v_status := 'blocked'; v_reason := 'item_result_score_mismatch';
    end if;
  end if;

  if v_status is null then
    v_coverage := case when v_source_count = 0 then 0
      else round(v_resolved::numeric * 100 / v_source_count, 2) end;

    for v_group in
      select s.curriculum_objective_id, s.curriculum_scope_id, s.framework_version_id,
        o.code as objective_code, o.statement as objective_statement,
        n.name as node_name, a.name as subject_name,
        count(distinct s.source_item_key) filter (where s.response_state not in ('unanswered','unscored'))::integer as attempted_count,
        sum(s.marks_awarded) filter (where s.response_state not in ('unanswered','unscored')) as awarded,
        sum(s.marks_possible) filter (where s.response_state not in ('unanswered','unscored')) as possible,
        jsonb_agg(s.mapping_snapshot order by s.source_item_key, s.curriculum_mapping_id) as mapping_snapshots
      from public.cambridge_evidence_item_snapshots s
      join public.curriculum_objectives o on o.id = s.curriculum_objective_id
      join public.curriculum_nodes n on n.id = o.curriculum_node_id
      join public.curriculum_scopes cs on cs.id = s.curriculum_scope_id
      join public.academic_subjects a on a.id = cs.academic_subject_id
      where s.evidence_run_id = v_run.id and s.mapping_status = 'resolved'
        and s.mapping_role in ('primary','secondary')
      group by s.curriculum_objective_id, s.curriculum_scope_id, s.framework_version_id,
        o.code, o.statement, n.name, a.name
      having count(distinct s.source_item_key) filter (where s.response_state not in ('unanswered','unscored')) > 0
    loop
      v_percentage := round(v_group.awarded * 100 / v_group.possible, 2);
      v_kind := case when v_percentage < 60 then 'focus'
        when v_percentage >= 80 then 'strength' else 'developing' end;
      insert into public.student_learning_observations(
        school_id, student_id, subject, topic, skill, subskill, skill_key,
        observation_type, source_type, source_id, source_key, observed_at,
        evidence_percentage, evidence_count, evidence_quality, contributes_to_focus_state,
        evidence, system_generated
      ) values (
        v_score.school_id, v_score.student_id, v_group.subject_name, v_group.node_name,
        v_group.objective_statement, v_group.objective_code,
        'curriculum:' || v_group.framework_version_id::text || ':' || v_group.curriculum_objective_id::text,
        v_kind, 'cambridge_attempt', v_score.id,
        concat_ws(':', 'cambridge', v_score.id::text, v_run.id::text, v_group.curriculum_objective_id::text),
        coalesce(v_score.submitted_at, v_run.started_at), v_percentage, v_group.attempted_count,
        'provisional', false,
        jsonb_build_object(
          'evidence_run_id', v_run.id, 'quiz_score_id', v_score.id, 'test_id', v_score.test_id,
          'quiz_version', v_score.quiz_version, 'attempt_number', v_score.attempt_number,
          'adapter_version', trim(p_adapter_version), 'scoring_authority', p_scoring_authority,
          'source_evidence_hash', v_hash, 'curriculum_objective_id', v_group.curriculum_objective_id,
          'curriculum_scope_id', v_group.curriculum_scope_id,
          'framework_version_id', v_group.framework_version_id,
          'objective_code', v_group.objective_code, 'attempted_items', v_group.attempted_count,
          'marks_awarded', v_group.awarded, 'marks_possible', v_group.possible,
          'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
          'mapping_snapshots', v_group.mapping_snapshots,
          'evidence_quality', 'provisional', 'contributes_to_focus_state', false,
          'qualification_reason', 'phase_5_confidence_gate_pending'
        ), true
      ) returning id into v_observation_id;

      insert into public.cambridge_evidence_observations(
        evidence_run_id, observation_id, curriculum_objective_id
      ) values (v_run.id, v_observation_id, v_group.curriculum_objective_id);
      v_observations := v_observations + 1;
    end loop;

    v_status := case
      when v_unregistered + v_unmapped + v_stale > 0 then 'partial'
      else 'materialized' end;
    v_reason := case when v_status = 'partial' then 'mapping_coverage_incomplete'
      else 'all_item_mappings_resolved' end;
  end if;

  v_coverage := case when v_source_count = 0 then 0
    else round(v_resolved::numeric * 100 / v_source_count, 2) end;
  update public.cambridge_evidence_runs set
    status = v_status, source_item_count = v_source_count, registered_item_count = v_registered,
    resolved_item_count = v_resolved, unregistered_item_count = v_unregistered,
    unmapped_item_count = v_unmapped, stale_item_count = v_stale,
    invalid_item_count = v_invalid_count, unanswered_item_count = v_unanswered,
    observation_count = v_observations, mapping_coverage_percent = v_coverage,
    disclosure = jsonb_build_object(
      'readiness', v_status, 'reason', v_reason, 'sourceItemCount', v_source_count,
      'registeredItemCount', v_registered, 'resolvedItemCount', v_resolved,
      'unregisteredItemCount', v_unregistered, 'unmappedItemCount', v_unmapped,
      'staleItemCount', v_stale, 'invalidItemCount', v_invalid_count,
      'unansweredItemCount', v_unanswered, 'observationCount', v_observations,
      'mappingCoveragePercent', v_coverage,
      'observationsAreProvisional', true, 'contributesToFocusState', false,
      'rawQuestionContentCopied', false, 'rawResponseContentCopied', false
    ), completed_at = now()
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object('success', true, 'idempotent', false, 'runId', v_run.id,
    'status', v_run.status, 'disclosure', v_run.disclosure);
exception
  when unique_violation then
    select * into v_run from public.cambridge_evidence_runs
    where quiz_score_id = p_quiz_score_id and adapter_version = trim(p_adapter_version)
      and scoring_authority = p_scoring_authority and source_evidence_hash = v_hash;
    return jsonb_build_object('success', true, 'idempotent', true, 'runId', v_run.id,
      'status', v_run.status, 'disclosure', v_run.disclosure);
end;
$$;
revoke all on function private.cambridge_materialize_evidence(uuid,jsonb,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_materialize_cambridge_evidence(
  p_quiz_score_id uuid,
  p_item_results jsonb,
  p_scoring_authority text default 'server_verified',
  p_adapter_version text default 'cambridge-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_scoring_authority = 'stored_client_result' then
    return jsonb_build_object('success', false, 'code', 'service_ingest_requires_verified_authority');
  end if;
  return private.cambridge_materialize_evidence(
    p_quiz_score_id, p_item_results, p_scoring_authority, p_adapter_version
  );
end;
$$;
revoke all on function public.rpc_materialize_cambridge_evidence(uuid,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.rpc_materialize_cambridge_evidence(uuid,jsonb,text,text) to service_role;

create or replace function private.cambridge_capture_stored_item_results()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cambridge_materialize_evidence(
    new.id,
    case when jsonb_typeof(new.answers->'item_results') = 'array'
      then new.answers->'item_results' else null end,
    'stored_client_result',
    coalesce(nullif(new.answers->>'evidence_adapter_version', ''), 'cambridge-v1')
  );
  return new;
end;
$$;
revoke all on function private.cambridge_capture_stored_item_results()
  from public, anon, authenticated, service_role;

create trigger trg_cambridge_capture_stored_item_results
after insert on public.quiz_scores
for each row execute function private.cambridge_capture_stored_item_results();

create or replace function public.rpc_school_cambridge_evidence_readiness(
  p_school_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_processed integer;
  v_materialized integer;
  v_partial integer;
  v_blocked integer;
  v_observations integer;
  v_unregistered integer;
  v_unmapped integer;
  v_stale integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.school_memberships sm
    where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'active_school_membership_required');
  end if;
  if p_from is not null and p_to is not null and p_to <= p_from then
    return jsonb_build_object('success', false, 'code', 'invalid_evidence_readiness_window');
  end if;

  select count(*) into v_attempts from public.quiz_scores q
  where q.school_id = p_school_id
    and (p_from is null or q.submitted_at >= p_from)
    and (p_to is null or q.submitted_at < p_to);
  select count(distinct r.quiz_score_id),
    count(*) filter (where r.status = 'materialized'),
    count(*) filter (where r.status = 'partial'),
    count(*) filter (where r.status = 'blocked'),
    coalesce(sum(r.observation_count), 0), coalesce(sum(r.unregistered_item_count), 0),
    coalesce(sum(r.unmapped_item_count), 0), coalesce(sum(r.stale_item_count), 0)
  into v_processed, v_materialized, v_partial, v_blocked, v_observations,
    v_unregistered, v_unmapped, v_stale
  from public.cambridge_evidence_runs r
  join public.quiz_scores q on q.id = r.quiz_score_id
  where r.school_id = p_school_id
    and (p_from is null or q.submitted_at >= p_from)
    and (p_to is null or q.submitted_at < p_to);

  return jsonb_build_object(
    'success', true,
    'readiness', case when v_attempts = 0 then 'no_attempts'
      when coalesce(v_processed, 0) = 0 then 'not_processed'
      when coalesce(v_blocked, 0) + coalesce(v_partial, 0) > 0
        or v_processed < v_attempts then 'partial' else 'ready' end,
    'attempts', v_attempts, 'processedAttempts', coalesce(v_processed, 0),
    'unprocessedAttempts', greatest(v_attempts - coalesce(v_processed, 0), 0),
    'materializedRuns', coalesce(v_materialized, 0),
    'partialRuns', coalesce(v_partial, 0), 'blockedRuns', coalesce(v_blocked, 0),
    'provisionalObservations', coalesce(v_observations, 0),
    'unregisteredItems', coalesce(v_unregistered, 0),
    'unmappedItems', coalesce(v_unmapped, 0), 'staleItems', coalesce(v_stale, 0),
    'observationsContributeToFocusState', false,
    'nextGate', 'phase_5_confidence_and_coverage'
  );
end;
$$;
revoke all on function public.rpc_school_cambridge_evidence_readiness(uuid,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.rpc_school_cambridge_evidence_readiness(uuid,timestamptz,timestamptz)
  to authenticated;

comment on table public.cambridge_evidence_runs is
  'Immutable adapter executions with explicit blocked/partial/materialized disclosure.';
comment on table public.cambridge_evidence_item_snapshots is
  'Content-free item outcomes and the exact current approved curriculum mappings resolved at evidence time.';
comment on table public.cambridge_evidence_observations is
  'Immutable provenance links from Cambridge adapter runs to provisional longitudinal observations.';
comment on function public.rpc_materialize_cambridge_evidence(uuid,jsonb,text,text) is
  'Service-only verified item-outcome adapter. Never derives item attainment from an overall score.';
