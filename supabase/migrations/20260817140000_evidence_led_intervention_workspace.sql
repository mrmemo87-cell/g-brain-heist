-- Evidence-led intervention workspace.
-- Teachers see the exact diagnostic evidence, explicitly validate it, then
-- create a measurable plan. Writing Hub evidence is promoted prospectively
-- only after a final teacher review.

create table if not exists public.student_learning_professional_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid references public.school_academic_years(id) on delete restrict,
  skill_key text not null,
  decision text not null check (decision in ('confirmed','needs_more_evidence','rejected')),
  diagnostic_targets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(diagnostic_targets) = 'array'),
  rationale text not null,
  evidence_cutoff_at timestamptz not null,
  evidence_snapshot_hash text not null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create index if not exists student_learning_professional_reviews_student_skill_idx
  on public.student_learning_professional_reviews(student_id, skill_key, reviewed_at desc);
create index if not exists student_learning_professional_reviews_school_idx
  on public.student_learning_professional_reviews(school_id, reviewed_at desc);
create index if not exists student_learning_professional_reviews_academic_year_idx
  on public.student_learning_professional_reviews(academic_year_id)
  where academic_year_id is not null;
create index if not exists student_learning_professional_reviews_reviewer_idx
  on public.student_learning_professional_reviews(reviewed_by, reviewed_at desc);

alter table public.student_learning_professional_reviews enable row level security;
revoke all on table public.student_learning_professional_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.student_learning_professional_reviews to service_role;

create or replace function private.reject_student_learning_professional_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'professional_evidence_review_is_append_only';
end;
$$;
revoke all on function private.reject_student_learning_professional_review_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_student_learning_professional_review_immutable
  on public.student_learning_professional_reviews;
create trigger trg_student_learning_professional_review_immutable
before update or delete on public.student_learning_professional_reviews
for each row execute function private.reject_student_learning_professional_review_mutation();

alter table public.student_learning_interventions
  add column if not exists professional_review_id uuid
    references public.student_learning_professional_reviews(id) on delete restrict,
  add column if not exists teaching_action text,
  add column if not exists evidence_task text;

create index if not exists student_learning_interventions_professional_review_idx
  on public.student_learning_interventions(professional_review_id)
  where professional_review_id is not null;

create or replace function private.student_learning_current_evidence_hash(
  p_student_id uuid,
  p_skill_key text,
  p_academic_year_id uuid default null,
  p_cutoff_at timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
    o.id::text, o.observed_at::text, o.created_at::text, o.observation_type,
    o.source_type, o.source_key, o.evidence_count::text,
    o.evidence_percentage::text, o.evidence_quality,
    o.contributes_to_focus_state::text
  ), ',' order by o.observed_at, o.created_at, o.id), ''), 'UTF8'), 'sha256'), 'hex')
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and (p_academic_year_id is null or o.academic_year_id = p_academic_year_id)
    and o.observed_at <= p_cutoff_at;
$$;
revoke all on function private.student_learning_current_evidence_hash(uuid,text,uuid,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_teacher_review_learning_focus_evidence(
  p_student_id uuid,
  p_skill_key text,
  p_decision text,
  p_diagnostic_targets jsonb default '[]'::jsonb,
  p_rationale text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_focus public.student_learning_focus_states%rowtype;
  v_cutoff timestamptz := now();
  v_hash text;
  v_id uuid;
  v_rationale text := nullif(trim(coalesce(p_rationale, '')), '');
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_decision not in ('confirmed','needs_more_evidence','rejected') then
    raise exception 'Choose confirmed, needs more evidence, or rejected';
  end if;
  if jsonb_typeof(coalesce(p_diagnostic_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'Diagnostic targets must be a list';
  end if;
  if jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) > 12 then
    raise exception 'Choose no more than 12 diagnostic targets';
  end if;
  if v_rationale is null or length(v_rationale) < 10 then
    raise exception 'A short professional rationale is required';
  end if;
  if p_decision = 'confirmed' and jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) = 0 then
    raise exception 'Confirm at least one specific diagnostic target';
  end if;

  select * into v_focus from public.student_learning_focus_states f
  where f.student_id = p_student_id and f.skill_key = p_skill_key;
  if not found then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id, v_focus.subject) then
    raise exception 'Not authorised for this student and subject';
  end if;

  v_hash := private.student_learning_current_evidence_hash(
    p_student_id, p_skill_key, v_focus.academic_year_id, v_cutoff
  );
  if v_hash is null then raise exception 'Evidence snapshot could not be created'; end if;

  insert into public.student_learning_professional_reviews(
    school_id, student_id, academic_year_id, skill_key, decision,
    diagnostic_targets, rationale, evidence_cutoff_at,
    evidence_snapshot_hash, reviewed_by
  ) values (
    v_focus.school_id, p_student_id, v_focus.academic_year_id, p_skill_key,
    p_decision, coalesce(p_diagnostic_targets, '[]'::jsonb), v_rationale,
    v_cutoff, v_hash, v_actor
  ) returning id into v_id;

  return jsonb_build_object(
    'success', true, 'reviewId', v_id, 'decision', p_decision,
    'evidenceSnapshotHash', v_hash, 'evidenceCutoffAt', v_cutoff,
    'focusStateMutated', false, 'sourceObservationsMutated', false
  );
end;
$$;
revoke all on function public.rpc_teacher_review_learning_focus_evidence(uuid,text,text,jsonb,text)
  from public, anon;
grant execute on function public.rpc_teacher_review_learning_focus_evidence(uuid,text,text,jsonb,text)
  to authenticated, service_role;

-- Automated Writing Hub analysis remains available in the Writing Hub review
-- queue, but no longer enters the academic profile by itself.
drop trigger if exists trg_student_learning_capture_writing_attempt on public.bh_writing_attempts;

create or replace function private.capture_teacher_validated_writing_focus_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.bh_writing_assessments%rowtype;
  v_group record;
  v_skill text;
  v_skill_key text;
  v_source_key text;
begin
  if new.review_status <> 'final' then return new; end if;
  select * into v_assessment from public.bh_writing_assessments a
  where a.id = new.assessment_id;
  if not found then return new; end if;

  for v_group in
    with raw_tags as (
      select lower(trim(t.value)) raw_tag
      from jsonb_array_elements_text(coalesce(v_assessment.feedback_payload->'weakness_tags', '[]'::jsonb)) t(value)
      where nullif(trim(t.value), '') is not null
    )
    select public.student_learning_canonical_writing_skill(raw_tag) skill,
      public.student_learning_writing_dimension(raw_tag) dimension,
      count(*)::integer occurrence_count,
      jsonb_agg(distinct raw_tag order by raw_tag) raw_tags
    from raw_tags group by 1, 2
  loop
    v_skill := v_group.skill;
    v_skill_key := public.student_learning_build_skill_key('English', 'Writing', v_skill, null);
    v_source_key := concat_ws(':', 'writing-review', new.id::text, 'weakness', md5(v_skill_key));
    insert into public.student_learning_observations(
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence, system_generated,
      created_by, evidence_quality, contributes_to_focus_state
    ) values (
      new.school_id, new.student_id, 'English', 'Writing', v_skill,
      coalesce(v_assessment.assessment_payload->>'genre', 'writing'), v_skill_key,
      'focus', 'writing_assessment_review', new.id, v_source_key, new.created_at,
      greatest(0, least(100, new.total_score * 5)), v_group.occurrence_count,
      jsonb_build_object(
        'writing_signal', 'teacher_validated_weakness',
        'evidence_authority', 'teacher_validated',
        'assessment_id', new.assessment_id,
        'review_id', new.id,
        'attempt_key', v_assessment.attempt_key,
        'raw_tags', v_group.raw_tags,
        'rubric_dimension', v_group.dimension,
        'rich_feedback', v_assessment.feedback_payload,
        'rationale', new.rationale
      ),
      false, new.reviewer_id, 'strong', true
    ) on conflict (student_id, source_key) do nothing;
    perform public.student_learning_refresh_focus_state(new.student_id, v_skill_key);
  end loop;
  return new;
end;
$$;
revoke all on function private.capture_teacher_validated_writing_focus_evidence()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_capture_teacher_validated_writing_focus_evidence
  on public.bh_writing_assessment_reviews;
create trigger trg_capture_teacher_validated_writing_focus_evidence
after insert on public.bh_writing_assessment_reviews
for each row when (new.review_status = 'final')
execute function private.capture_teacher_validated_writing_focus_evidence();

create or replace function public.rpc_teacher_student_intervention_workspace_v2(
  p_student_id uuid,
  p_subject text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_interventions jsonb := '[]'::jsonb;
  v_item jsonb;
  v_focus public.student_learning_focus_states%rowtype;
  v_conf public.student_learning_confidence_states%rowtype;
  v_review public.student_learning_professional_reviews%rowtype;
  v_hash text;
  v_payload jsonb;
  v_feedback jsonb;
  v_examples jsonb;
  v_targets jsonb;
  v_readiness text;
  v_blocker text;
  v_authority text;
  v_can_create boolean;
begin
  v_result := public.rpc_teacher_student_intervention_pilot(p_student_id, p_subject);

  for v_item in select value from jsonb_array_elements(coalesce(v_result->'recommendations', '[]'::jsonb))
  loop
    select * into v_focus from public.student_learning_focus_states f
    where f.student_id = p_student_id and f.skill_key = v_item->>'skill_key';
    select * into v_conf from public.student_learning_confidence_states c
    where c.id = v_focus.confidence_state_id;
    v_hash := private.student_learning_current_evidence_hash(
      p_student_id, v_focus.skill_key, v_focus.academic_year_id, now()
    );
    select * into v_review from public.student_learning_professional_reviews r
    where r.student_id = p_student_id and r.skill_key = v_focus.skill_key
      and r.evidence_snapshot_hash = v_hash
    order by r.reviewed_at desc, r.id desc limit 1;

    v_payload := null;
    select a.payload into v_payload
    from public.student_learning_observations o
    join public.bh_writing_attempts a on a.id = o.source_id
    where o.student_id = p_student_id and o.skill_key = v_focus.skill_key
      and o.source_type = 'writing_attempt'
    order by o.observed_at desc, o.created_at desc limit 1;
    v_feedback := coalesce(v_payload->'rich_feedback', '{}'::jsonb);
    if v_feedback = '{}'::jsonb then
      select coalesce(o.evidence->'rich_feedback', '{}'::jsonb) into v_feedback
      from public.student_learning_observations o
      where o.student_id = p_student_id and o.skill_key = v_focus.skill_key
        and o.source_type = 'writing_assessment_review'
      order by o.observed_at desc, o.created_at desc limit 1;
    end if;

    if lower(v_focus.skill) = 'grammar accuracy' then
      select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb) into v_examples
      from (select value, ordinality from jsonb_array_elements(coalesce(v_feedback->'grammar_fixes', '[]'::jsonb))
        with ordinality limit 4) x;
    elsif lower(v_focus.skill) = 'punctuation' then
      select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb) into v_examples
      from (select value, ordinality from jsonb_array_elements(coalesce(v_feedback->'punctuation_fixes', '[]'::jsonb))
        with ordinality limit 4) x;
    else
      v_examples := '[]'::jsonb;
    end if;

    select coalesce(jsonb_agg(to_jsonb(label) order by label), '[]'::jsonb) into v_targets
    from (
      select distinct initcap(replace(t.value, '_', ' ')) label
      from public.student_learning_observations o
      cross join lateral jsonb_array_elements_text(coalesce(o.evidence->'raw_tags', '[]'::jsonb)) t(value)
      where o.student_id = p_student_id and o.skill_key = v_focus.skill_key
      union
      select distinct initcap(replace(e.value->>'weakness_tag', '_', ' ')) label
      from jsonb_array_elements(coalesce(v_examples, '[]'::jsonb)) e(value)
      where nullif(e.value->>'weakness_tag', '') is not null
    ) targets where nullif(label, '') is not null;
    if v_review.id is not null and jsonb_array_length(v_review.diagnostic_targets) > 0 then
      v_targets := v_review.diagnostic_targets;
    end if;

    v_authority := case
      when exists (
        select 1 from public.student_learning_observations o
        where o.student_id = p_student_id and o.skill_key = v_focus.skill_key
          and (o.system_generated is false or o.evidence->>'evidence_authority' = 'teacher_validated')
      ) then 'teacher_validated'
      else 'automated_history'
    end;

    if coalesce((v_item->>'has_open_intervention')::boolean, false) then
      v_readiness := 'open_plan'; v_blocker := null; v_can_create := false;
    elsif v_focus.academic_year_id is null or v_focus.confidence_state_id is null then
      v_readiness := 'collect_evidence';
      v_blocker := 'Academic-year context and a confidence baseline are still being established.';
      v_can_create := false;
    elsif v_conf.id is null or not v_conf.decision_eligible then
      v_readiness := 'collect_evidence';
      v_blocker := case coalesce(v_conf.assessment_state, 'not_assessed')
        when 'low_data' then 'More qualifying assessed work is needed before a support plan can be measured fairly.'
        when 'stale' then 'Fresh assessed evidence is required before planning support.'
        when 'contradictory' then 'The current evidence is contradictory and needs professional review.'
        else 'A decision-ready confidence baseline has not been reached yet.' end;
      v_can_create := false;
    elsif v_review.id is null or v_review.decision <> 'confirmed' then
      v_readiness := 'review_evidence';
      v_blocker := 'A teacher must confirm the exact diagnostic targets in the current evidence snapshot.';
      v_can_create := false;
    else
      v_readiness := 'ready'; v_blocker := null; v_can_create := true;
    end if;

    v_recommendations := v_recommendations || jsonb_build_array(v_item || jsonb_build_object(
      'diagnostic_targets', coalesce(v_targets, '[]'::jsonb),
      'evidence_examples', coalesce(v_examples, '[]'::jsonb),
      'evidence_authority', v_authority,
      'readiness', v_readiness,
      'readiness_blocker', v_blocker,
      'can_create_plan', v_can_create,
      'confidence', jsonb_build_object(
        'score', v_conf.confidence_score, 'band', v_conf.confidence_band,
        'assessment_state', v_conf.assessment_state,
        'decision_eligible', coalesce(v_conf.decision_eligible, false)
      ),
      'professional_review', case when v_review.id is null then null else jsonb_build_object(
        'id', v_review.id, 'decision', v_review.decision,
        'rationale', v_review.rationale, 'reviewed_at', v_review.reviewed_at,
        'diagnostic_targets', v_review.diagnostic_targets
      ) end
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_result->'interventions', '[]'::jsonb))
  loop
    select v_item || jsonb_build_object(
      'professional_review_id', i.professional_review_id,
      'teaching_action', i.teaching_action,
      'evidence_task', i.evidence_task
    ) into v_item
    from public.student_learning_interventions i where i.id = (v_item->>'id')::uuid;
    v_interventions := v_interventions || jsonb_build_array(v_item);
  end loop;

  return jsonb_set(
    jsonb_set(v_result, '{recommendations}', v_recommendations, true),
    '{interventions}', v_interventions, true
  ) || jsonb_build_object('workspacePolicy', jsonb_build_object(
    'writingProfileRequiresFinalTeacherReview', true,
    'professionalEvidenceReviewRequired', true,
    'planCreationRequiresDecisionReadyConfidence', true,
    'automaticPrescriptionEnabled', false,
    'automaticClosureEnabled', false
  ));
end;
$$;
revoke all on function public.rpc_teacher_student_intervention_workspace_v2(uuid,text)
  from public, anon;
grant execute on function public.rpc_teacher_student_intervention_workspace_v2(uuid,text)
  to authenticated, service_role;

create or replace function public.rpc_teacher_create_learning_intervention_v3(
  p_student_id uuid,
  p_skill_key text,
  p_intervention_type text,
  p_goal text,
  p_teaching_action text,
  p_evidence_task text,
  p_target_date date,
  p_target_status text default 'improving',
  p_min_followup_observations integer default 2,
  p_min_successful_observations integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_focus public.student_learning_focus_states%rowtype;
  v_conf public.student_learning_confidence_states%rowtype;
  v_review public.student_learning_professional_reviews%rowtype;
  v_shadow public.student_learning_shadow_results%rowtype;
  v_shadow_review record;
  v_id uuid;
  v_cutoff timestamptz := now();
  v_hash text;
  v_observation public.student_learning_observations%rowtype;
  v_count integer := 0;
  v_goal text := nullif(trim(p_goal), '');
  v_teaching text := nullif(trim(p_teaching_action), '');
  v_task text := nullif(trim(p_evidence_task), '');
  v_shadow_valid boolean := false;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into v_focus from public.student_learning_focus_states f
  where f.student_id = p_student_id and f.skill_key = p_skill_key;
  if not found then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id, v_focus.subject) then
    raise exception 'Not authorised for this student and subject';
  end if;
  if v_focus.academic_year_id is null or v_focus.confidence_state_id is null then
    raise exception 'Academic year and confidence baseline are required';
  end if;
  select * into v_conf from public.student_learning_confidence_states c
  where c.id = v_focus.confidence_state_id and c.academic_year_id = v_focus.academic_year_id;
  if not found or not v_conf.decision_eligible then
    raise exception 'More decision-ready assessed evidence is required before a plan can be created';
  end if;
  if p_intervention_type not in ('targeted_question_practice','writing_practice','reassessment','teacher_support','custom') then
    raise exception 'Invalid intervention type';
  end if;
  if p_target_status not in ('improving','resolved','emerging_strength','consistent_strength') then
    raise exception 'Invalid measurable target status';
  end if;
  if p_min_followup_observations not between 1 and 20
    or p_min_successful_observations not between 1 and p_min_followup_observations then
    raise exception 'Invalid follow-up evidence target';
  end if;
  if p_target_date is null or p_target_date < current_date then
    raise exception 'A current or future review date is required';
  end if;
  if v_goal is null or length(v_goal) < 10 then raise exception 'A measurable teacher goal is required'; end if;
  if v_teaching is null or length(v_teaching) < 10 then raise exception 'A specific teaching action is required'; end if;
  if v_task is null or length(v_task) < 10 then raise exception 'A specific follow-up evidence task is required'; end if;

  v_hash := private.student_learning_current_evidence_hash(
    p_student_id, p_skill_key, v_focus.academic_year_id, v_cutoff
  );
  select * into v_review from public.student_learning_professional_reviews r
  where r.student_id = p_student_id and r.skill_key = p_skill_key
    and r.academic_year_id = v_focus.academic_year_id
    and r.evidence_snapshot_hash = v_hash and r.decision = 'confirmed'
  order by r.reviewed_at desc, r.id desc limit 1;

  select s.* into v_shadow
  from public.student_learning_shadow_results s
  join public.student_learning_shadow_runs r on r.id = s.shadow_run_id
  where r.status = 'completed' and s.school_id = v_focus.school_id
    and s.student_id = p_student_id and s.skill_key = p_skill_key
    and s.academic_year_id = v_focus.academic_year_id
  order by s.compared_at desc limit 1;
  if found then
    v_shadow_valid := not v_shadow.teacher_review_required;
    if v_shadow.teacher_review_required then
      select x.verdict into v_shadow_review
      from public.student_learning_validation_reviews x
      where x.shadow_result_id = v_shadow.id
      order by x.review_version desc, x.reviewed_at desc limit 1;
      v_shadow_valid := found and v_shadow_review.verdict <> 'needs_more_evidence';
    end if;
  end if;
  if v_review.id is null and not v_shadow_valid then
    raise exception 'Teacher-confirmed evidence or a validated shadow comparison is required before intervention';
  end if;

  select count(*)::integer into v_count
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.academic_year_id = v_focus.academic_year_id and o.observed_at <= v_cutoff;
  if v_count = 0 then raise exception 'Baseline evidence is required'; end if;

  insert into public.student_learning_interventions(
    school_id, student_id, subject, skill_key, skill, topic, intervention_type,
    status, rationale, goal, baseline_status, baseline_evidence_items,
    baseline_last_observed_at, target_date, created_by,
    academic_year_id, academic_subject_id, confidence_policy_id,
    baseline_confidence_state_id, validation_shadow_result_id,
    professional_review_id, teaching_action, evidence_task,
    approval_status, target_status, target_min_followup_observations,
    target_min_successful_observations, baseline_cutoff_at,
    baseline_snapshot_hash, baseline_confidence_score, baseline_confidence_band,
    baseline_assessment_state, baseline_trend, baseline_priority,
    baseline_qualifying_observations
  ) values (
    v_focus.school_id, p_student_id, v_focus.subject, p_skill_key, v_focus.skill,
    v_focus.topic, p_intervention_type, 'planned',
    format('%s is teacher-validated as %s at the frozen evidence baseline.', v_focus.skill, replace(v_focus.current_status, '_', ' ')),
    v_goal, v_focus.current_status, v_conf.evidence_items, v_focus.last_observed_at,
    p_target_date, v_actor, v_focus.academic_year_id, v_focus.academic_subject_id,
    v_conf.policy_id, v_conf.id, case when v_shadow_valid then v_shadow.id else null end,
    v_review.id, v_teaching, v_task, 'pending', p_target_status,
    p_min_followup_observations, p_min_successful_observations, v_cutoff, v_hash,
    v_conf.confidence_score, v_conf.confidence_band, v_conf.assessment_state,
    v_focus.trend, v_focus.priority, v_conf.qualifying_observations
  ) returning id into v_id;

  for v_observation in
    select o.* from public.student_learning_observations o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.academic_year_id = v_focus.academic_year_id and o.observed_at <= v_cutoff
    order by o.observed_at, o.created_at, o.id
  loop
    perform private.student_learning_intervention_snapshot_observation(v_id, null, v_observation, 'baseline');
  end loop;
  insert into public.student_learning_intervention_checkpoints(
    intervention_id, school_id, checkpoint_number, checkpoint_type, due_at
  ) values (v_id, v_focus.school_id, 1, 'final', p_target_date::timestamptz);
  insert into public.student_learning_intervention_events(
    intervention_id, actor_user_id, event_type, note
  ) values (v_id, v_actor, 'created', concat('Teaching action: ', v_teaching, ' Evidence task: ', v_task));

  return jsonb_build_object(
    'success', true, 'interventionId', v_id, 'approvalStatus', 'pending',
    'baselineSnapshotHash', v_hash, 'baselineObservationCount', v_count,
    'professionalReviewId', v_review.id,
    'planAutomaticallyStarted', false, 'focusStateMutated', false,
    'teacherApprovalRequiredBeforeStart', true
  );
exception when unique_violation then
  raise exception 'An open intervention already exists for this student and focus area';
end;
$$;
revoke all on function public.rpc_teacher_create_learning_intervention_v3(
  uuid,text,text,text,text,text,date,text,integer,integer
) from public, anon;
grant execute on function public.rpc_teacher_create_learning_intervention_v3(
  uuid,text,text,text,text,text,date,text,integer,integer
) to authenticated, service_role;

comment on table public.student_learning_professional_reviews is
  'Append-only professional validation of the exact evidence snapshot and diagnostic targets used for an intervention decision.';
comment on column public.student_learning_interventions.teaching_action is
  'The concrete instructional action the teacher will deliver.';
comment on column public.student_learning_interventions.evidence_task is
  'The assessed task or observation that will provide comparable follow-up evidence.';
