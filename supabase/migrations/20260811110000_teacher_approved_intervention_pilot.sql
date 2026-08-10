-- Phase 7: teacher-approved intervention pilot with frozen baselines and
-- measurable follow-up outcomes.
--
-- This migration hardens the existing intervention feature rather than creating a
-- competing workflow. Historical observations and current focus states remain source
-- records/projections; plans can be activated and closed only through teacher-authorised,
-- evidence-aware RPCs.

alter table public.student_learning_interventions
  add column if not exists academic_year_id uuid,
  add column if not exists academic_subject_id uuid,
  add column if not exists confidence_policy_id uuid,
  add column if not exists baseline_confidence_state_id uuid,
  add column if not exists validation_shadow_result_id uuid,
  add column if not exists approval_status text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists target_status text,
  add column if not exists target_min_followup_observations integer,
  add column if not exists target_min_successful_observations integer,
  add column if not exists baseline_cutoff_at timestamptz,
  add column if not exists baseline_snapshot_hash text,
  add column if not exists baseline_confidence_score numeric(5,2),
  add column if not exists baseline_confidence_band text,
  add column if not exists baseline_assessment_state text,
  add column if not exists baseline_trend text,
  add column if not exists baseline_priority text,
  add column if not exists baseline_qualifying_observations integer,
  add column if not exists follow_up_observation_count integer not null default 0,
  add column if not exists follow_up_qualifying_observations integer not null default 0,
  add column if not exists follow_up_successful_observations integer not null default 0,
  add column if not exists system_outcome_status text,
  add column if not exists system_outcome_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists outcome_confirmed_by uuid;

update public.student_learning_interventions i
set approval_status = case when i.status in ('active','completed') then 'legacy_approved' else 'pending' end,
    approved_by = case when i.status in ('active','completed') then i.created_by else null end,
    approved_at = case when i.status in ('active','completed') then coalesce(i.started_at,i.created_at) else null end,
    target_status = coalesce(i.target_status, 'improving'),
    target_min_followup_observations = coalesce(i.target_min_followup_observations, 2),
    target_min_successful_observations = coalesce(i.target_min_successful_observations, 2),
    baseline_cutoff_at = coalesce(i.baseline_cutoff_at, i.created_at),
    baseline_snapshot_hash = coalesce(i.baseline_snapshot_hash,
      encode(extensions.digest(convert_to('legacy:' || i.id::text, 'UTF8'), 'sha256'), 'hex')),
    baseline_qualifying_observations = coalesce(i.baseline_qualifying_observations, i.baseline_evidence_items)
where i.approval_status is null
   or i.target_status is null
   or i.target_min_followup_observations is null
   or i.target_min_successful_observations is null
   or i.baseline_cutoff_at is null
   or i.baseline_snapshot_hash is null
   or i.baseline_qualifying_observations is null;

alter table public.student_learning_interventions
  alter column approval_status set default 'pending',
  alter column approval_status set not null,
  alter column target_status set default 'improving',
  alter column target_status set not null,
  alter column target_min_followup_observations set default 2,
  alter column target_min_followup_observations set not null,
  alter column target_min_successful_observations set default 2,
  alter column target_min_successful_observations set not null,
  alter column baseline_cutoff_at set not null,
  alter column baseline_snapshot_hash set not null,
  alter column baseline_qualifying_observations set default 0,
  alter column baseline_qualifying_observations set not null;

alter table public.student_learning_interventions
  drop constraint if exists student_learning_interventions_outcome_status_check;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_outcome_status_check check (
    outcome_status is null or outcome_status in (
      'improved','resolved','no_change','declined','inconclusive','needs_more_support'
    )
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_approval_status_check check (
    approval_status in ('pending','approved','rejected','legacy_approved')
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_target_status_check check (
    target_status in ('improving','resolved','emerging_strength','consistent_strength')
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_target_counts_check check (
    target_min_followup_observations between 1 and 20
    and target_min_successful_observations between 1 and target_min_followup_observations
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_baseline_hash_check check (
    baseline_snapshot_hash ~ '^[0-9a-f]{64}$'
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_system_snapshot_check check (
    jsonb_typeof(system_outcome_snapshot) = 'object'
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_followup_counts_check check (
    follow_up_observation_count >= 0
    and follow_up_qualifying_observations between 0 and follow_up_observation_count
    and follow_up_successful_observations between 0 and follow_up_qualifying_observations
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_system_outcome_check check (
    system_outcome_status is null or system_outcome_status in (
      'insufficient_follow_up','improved','resolved','no_change','declined','contradictory'
    )
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_approval_fields_check check (
    approval_status not in ('approved','legacy_approved')
    or (approved_by is not null and approved_at is not null)
  );
alter table public.student_learning_interventions
  add constraint student_learning_interventions_academic_year_fkey
    foreign key (academic_year_id) references public.school_academic_years(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_academic_subject_fkey
    foreign key (academic_subject_id) references public.academic_subjects(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_confidence_policy_fkey
    foreign key (confidence_policy_id) references public.academic_evidence_confidence_policies(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_baseline_confidence_fkey
    foreign key (baseline_confidence_state_id) references public.student_learning_confidence_states(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_validation_shadow_fkey
    foreign key (validation_shadow_result_id) references public.student_learning_shadow_results(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete restrict;
alter table public.student_learning_interventions
  add constraint student_learning_interventions_outcome_confirmed_by_fkey
    foreign key (outcome_confirmed_by) references auth.users(id) on delete restrict;

create index student_learning_interventions_year_subject_idx
  on public.student_learning_interventions(academic_year_id, academic_subject_id, status);
create index student_learning_interventions_policy_idx
  on public.student_learning_interventions(confidence_policy_id)
  where confidence_policy_id is not null;
create index student_learning_interventions_confidence_idx
  on public.student_learning_interventions(baseline_confidence_state_id)
  where baseline_confidence_state_id is not null;
create index student_learning_interventions_shadow_idx
  on public.student_learning_interventions(validation_shadow_result_id)
  where validation_shadow_result_id is not null;
create index student_learning_interventions_approved_by_idx
  on public.student_learning_interventions(approved_by)
  where approved_by is not null;
create index student_learning_interventions_outcome_by_idx
  on public.student_learning_interventions(outcome_confirmed_by)
  where outcome_confirmed_by is not null;
create index student_learning_intervention_events_actor_idx
  on public.student_learning_intervention_events(actor_user_id, created_at desc);
create index student_learning_interventions_pending_approval_idx
  on public.student_learning_interventions(school_id, created_at)
  where status = 'planned' and approval_status = 'pending';
create index student_learning_interventions_due_idx
  on public.student_learning_interventions(school_id, target_date, student_id)
  where status in ('planned','active');

create table public.student_learning_intervention_approvals (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null unique
    references public.student_learning_interventions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected')),
  plan_snapshot jsonb not null check (jsonb_typeof(plan_snapshot) = 'object'),
  baseline_snapshot_hash text not null check (baseline_snapshot_hash ~ '^[0-9a-f]{64}$'),
  rationale text not null check (length(trim(rationale)) >= 10),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create table public.student_learning_intervention_checkpoints (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null
    references public.student_learning_interventions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  checkpoint_number integer not null check (checkpoint_number > 0),
  checkpoint_type text not null check (checkpoint_type in ('interim','final')),
  status text not null default 'scheduled' check (status in ('scheduled','evaluated','waived')),
  due_at timestamptz not null,
  evaluated_as_of timestamptz,
  observation_count integer not null default 0 check (observation_count >= 0),
  qualifying_observation_count integer not null default 0 check (qualifying_observation_count >= 0),
  successful_observation_count integer not null default 0 check (successful_observation_count >= 0),
  candidate_status text check (candidate_status is null or candidate_status in (
    'insufficient_evidence','contradictory','new_focus','recurring','persistent',
    'improving','resolved','emerging_strength','consistent_strength'
  )),
  candidate_trend text check (candidate_trend is null or candidate_trend in (
    'declining','stable','improving','resolved','strong'
  )),
  system_outcome text check (system_outcome is null or system_outcome in (
    'insufficient_follow_up','improved','resolved','no_change','declined','contradictory'
  )),
  evidence_latest_at timestamptz,
  evidence_snapshot_hash text,
  comparison_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(comparison_snapshot) = 'object'),
  evaluated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  unique (intervention_id, checkpoint_number),
  check (evidence_snapshot_hash is null or evidence_snapshot_hash ~ '^[0-9a-f]{64}$'),
  check ((status = 'evaluated') = (
    evaluated_as_of is not null and evaluated_at is not null and evaluated_by is not null
    and candidate_status is not null and system_outcome is not null
    and evidence_snapshot_hash is not null
  ))
);

create table public.student_learning_intervention_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null
    references public.student_learning_interventions(id) on delete cascade,
  checkpoint_id uuid references public.student_learning_intervention_checkpoints(id) on delete cascade,
  observation_id uuid not null
    references public.student_learning_observations(id) on delete restrict,
  evidence_role text not null check (evidence_role in ('baseline','follow_up')),
  observed_at timestamptz not null,
  observation_type text not null check (observation_type in ('focus','developing','strength')),
  source_type text not null,
  source_key text not null,
  evidence_percentage numeric(6,2),
  evidence_count integer not null check (evidence_count > 0),
  evidence_quality text not null,
  qualified boolean not null,
  observation_snapshot_hash text not null
    check (observation_snapshot_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  check ((evidence_role = 'baseline' and checkpoint_id is null)
    or (evidence_role = 'follow_up' and checkpoint_id is not null))
);
create unique index student_learning_intervention_evidence_baseline_uidx
  on public.student_learning_intervention_evidence_snapshots(intervention_id, observation_id)
  where evidence_role = 'baseline';
create unique index student_learning_intervention_evidence_followup_uidx
  on public.student_learning_intervention_evidence_snapshots(checkpoint_id, observation_id)
  where evidence_role = 'follow_up';

create table public.student_learning_intervention_outcome_reviews (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null
    references public.student_learning_interventions(id) on delete cascade,
  checkpoint_id uuid not null unique
    references public.student_learning_intervention_checkpoints(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete cascade,
  decision text not null check (decision in ('confirmed','overridden','continue_collecting')),
  system_outcome text not null check (system_outcome in (
    'insufficient_follow_up','improved','resolved','no_change','declined','contradictory'
  )),
  teacher_outcome text check (teacher_outcome is null or teacher_outcome in (
    'improved','resolved','no_change','declined','inconclusive','needs_more_support'
  )),
  rationale text not null check (length(trim(rationale)) >= 10),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  check (decision = 'continue_collecting' or teacher_outcome is not null),
  check (decision <> 'overridden' or length(trim(rationale)) >= 20)
);

create index student_learning_intervention_approvals_school_idx
  on public.student_learning_intervention_approvals(school_id, decided_at desc);
create index student_learning_intervention_approvals_decided_by_idx
  on public.student_learning_intervention_approvals(decided_by, decided_at desc);
create index student_learning_intervention_checkpoints_due_idx
  on public.student_learning_intervention_checkpoints(school_id, status, due_at);
create index student_learning_intervention_checkpoints_intervention_idx
  on public.student_learning_intervention_checkpoints(intervention_id, checkpoint_number desc);
create index student_learning_intervention_checkpoints_evaluated_by_idx
  on public.student_learning_intervention_checkpoints(evaluated_by)
  where evaluated_by is not null;
create index student_learning_intervention_evidence_intervention_idx
  on public.student_learning_intervention_evidence_snapshots(intervention_id, evidence_role, observed_at);
create index student_learning_intervention_evidence_observation_idx
  on public.student_learning_intervention_evidence_snapshots(observation_id);
create index student_learning_intervention_outcomes_school_idx
  on public.student_learning_intervention_outcome_reviews(school_id, reviewed_at desc);
create index student_learning_intervention_outcomes_reviewer_idx
  on public.student_learning_intervention_outcome_reviews(reviewed_by, reviewed_at desc);

alter table public.student_learning_intervention_approvals enable row level security;
alter table public.student_learning_intervention_checkpoints enable row level security;
alter table public.student_learning_intervention_evidence_snapshots enable row level security;
alter table public.student_learning_intervention_outcome_reviews enable row level security;

revoke all on table public.student_learning_intervention_approvals
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_intervention_checkpoints
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_intervention_evidence_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_intervention_outcome_reviews
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.student_learning_intervention_approvals to service_role;
grant select, insert, update, delete on table public.student_learning_intervention_checkpoints to service_role;
grant select, insert, update, delete on table public.student_learning_intervention_evidence_snapshots to service_role;
grant select, insert, update, delete on table public.student_learning_intervention_outcome_reviews to service_role;

create or replace function private.student_learning_intervention_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'intervention_evidence_record_is_append_only';
end;
$$;
revoke all on function private.student_learning_intervention_append_only()
  from public, anon, authenticated, service_role;

create trigger trg_student_learning_intervention_approval_append_only
before update or delete on public.student_learning_intervention_approvals
for each row execute function private.student_learning_intervention_append_only();
create trigger trg_student_learning_intervention_evidence_append_only
before update or delete on public.student_learning_intervention_evidence_snapshots
for each row execute function private.student_learning_intervention_append_only();
create trigger trg_student_learning_intervention_outcome_append_only
before update or delete on public.student_learning_intervention_outcome_reviews
for each row execute function private.student_learning_intervention_append_only();
create trigger trg_student_learning_intervention_event_append_only
before update or delete on public.student_learning_intervention_events
for each row execute function private.student_learning_intervention_append_only();

create or replace function private.student_learning_intervention_checkpoint_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or old.status in ('evaluated','waived') then
    raise exception using errcode = '23514', message = 'evaluated_intervention_checkpoint_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.student_learning_intervention_checkpoint_immutable()
  from public, anon, authenticated, service_role;
create trigger trg_student_learning_intervention_checkpoint_immutable
before update or delete on public.student_learning_intervention_checkpoints
for each row execute function private.student_learning_intervention_checkpoint_immutable();

alter table public.student_learning_intervention_events
  drop constraint if exists student_learning_intervention_events_event_type_check;
alter table public.student_learning_intervention_events
  add constraint student_learning_intervention_events_event_type_check check (event_type in (
    'created','approved','rejected','started','note','checkpoint_evaluated',
    'follow_up_continued','completed','outcome_confirmed','outcome_overridden','cancelled'
  ));

create or replace function public.student_learning_can_manage_intervention(
  p_student_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_student_id and (
      public.is_school_owner(u.school_id)
      or exists (
        select 1 from public.school_members sm
        where sm.school_id = u.school_id and sm.user_id = (select auth.uid())
          and sm.status = 'active' and sm.role_in_school = 'school_admin'
      )
      or exists (
        select 1 from public.class_students cs
        join public.classes c on c.id = cs.class_id and c.school_id = u.school_id
        join public.class_teacher_assignments cta on cta.class_id = cs.class_id
          and cta.school_id = c.school_id
          and cta.teacher_user_id = (select auth.uid()) and cta.active is true
        left join public.academic_subjects a
          on a.id = public.academic_resolve_subject_id(p_subject, u.school_id)
        where cs.student_id = p_student_id and (
          public.academic_normalize_subject_key(cta.subject)
            = public.academic_normalize_subject_key(p_subject)
          or public.academic_normalize_subject_key(cta.subject) = a.code
          or public.academic_normalize_subject_key(cta.subject)
            = public.academic_normalize_subject_key(a.name)
        )
      )
    )
  );
$$;
revoke all on function public.student_learning_can_manage_intervention(uuid,text)
  from public, anon;
grant execute on function public.student_learning_can_manage_intervention(uuid,text)
  to authenticated, service_role;

create or replace function private.student_learning_intervention_snapshot_observation(
  p_intervention_id uuid,
  p_checkpoint_id uuid,
  p_observation public.student_learning_observations,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.student_learning_intervention_evidence_snapshots(
    intervention_id, checkpoint_id, observation_id, evidence_role, observed_at,
    observation_type, source_type, source_key, evidence_percentage, evidence_count,
    evidence_quality, qualified, observation_snapshot_hash
  ) values (
    p_intervention_id, p_checkpoint_id, p_observation.id, p_role,
    p_observation.observed_at, p_observation.observation_type,
    p_observation.source_type, p_observation.source_key,
    p_observation.evidence_percentage, p_observation.evidence_count,
    p_observation.evidence_quality,
    public.student_learning_observation_is_qualified(
      p_observation.source_type, p_observation.contributes_to_focus_state,
      p_observation.evidence
    ),
    encode(extensions.digest(convert_to(concat_ws('|',
      p_observation.id::text, p_observation.observed_at::text,
      p_observation.created_at::text, p_observation.observation_type,
      p_observation.source_type, p_observation.source_key,
      p_observation.evidence_count::text, p_observation.evidence_percentage::text,
      p_observation.evidence_quality,
      p_observation.contributes_to_focus_state::text
    ), 'UTF8'), 'sha256'), 'hex')
  );
end;
$$;
revoke all on function private.student_learning_intervention_snapshot_observation(
  uuid,uuid,public.student_learning_observations,text
) from public, anon, authenticated, service_role;

create or replace function public.rpc_teacher_create_learning_intervention_v2(
  p_student_id uuid,
  p_skill_key text,
  p_intervention_type text,
  p_goal text,
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
  v_caller uuid := (select auth.uid());
  v_focus public.student_learning_focus_states%rowtype;
  v_conf public.student_learning_confidence_states%rowtype;
  v_shadow public.student_learning_shadow_results%rowtype;
  v_latest_review record;
  v_id uuid;
  v_cutoff timestamptz := now();
  v_goal text := nullif(trim(p_goal), '');
  v_rationale text;
  v_hash text;
  v_observation public.student_learning_observations%rowtype;
  v_count integer := 0;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then
    raise exception 'Student and skill are required';
  end if;
  select * into v_focus from public.student_learning_focus_states f
  where f.student_id = p_student_id and f.skill_key = p_skill_key;
  if not found then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id, v_focus.subject) then
    raise exception 'Not authorised for this student and subject';
  end if;
  if v_focus.academic_year_id is null or v_focus.confidence_state_id is null then
    raise exception 'Academic year and confidence baseline are required';
  end if;
  if p_intervention_type not in (
    'targeted_question_practice','writing_practice','reassessment','teacher_support','custom'
  ) then raise exception 'Invalid intervention type'; end if;
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
  if v_goal is null or length(v_goal) < 10 then
    raise exception 'A measurable teacher goal is required';
  end if;

  select * into v_conf from public.student_learning_confidence_states c
  where c.id = v_focus.confidence_state_id;
  if not found or v_conf.academic_year_id is distinct from v_focus.academic_year_id then
    raise exception 'Current confidence baseline is unavailable';
  end if;

  select s.* into v_shadow
  from public.student_learning_shadow_results s
  join public.student_learning_shadow_runs r on r.id = s.shadow_run_id
  where r.status = 'completed' and s.school_id = v_focus.school_id
    and s.student_id = p_student_id and s.skill_key = p_skill_key
    and s.academic_year_id = v_focus.academic_year_id
  order by s.compared_at desc limit 1;
  if not found then raise exception 'Validated shadow comparison is required before intervention'; end if;
  if v_shadow.teacher_review_required then
    select x.verdict, x.reviewed_at into v_latest_review
    from public.student_learning_validation_reviews x
    where x.shadow_result_id = v_shadow.id
    order by x.review_version desc, x.reviewed_at desc limit 1;
    if not found or v_latest_review.verdict = 'needs_more_evidence' then
      raise exception 'Completed teacher validation is required before intervention';
    end if;
  end if;

  select count(*)::integer,
    encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      o.id::text, o.observed_at::text, o.created_at::text, o.observation_type,
      o.source_type, o.source_key, o.evidence_count::text,
      o.evidence_percentage::text, o.evidence_quality,
      o.contributes_to_focus_state::text
    ), ',' order by o.observed_at, o.created_at, o.id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_count, v_hash
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.academic_year_id = v_focus.academic_year_id and o.observed_at <= v_cutoff;
  if v_count = 0 then raise exception 'Baseline evidence is required'; end if;

  v_rationale := format(
    '%s is validated as %s with %s qualifying evidence items at the frozen baseline.',
    v_focus.skill, replace(v_focus.current_status, '_', ' '),
    v_conf.qualifying_observations
  );
  insert into public.student_learning_interventions(
    school_id, student_id, subject, skill_key, skill, topic, intervention_type,
    status, rationale, goal, baseline_status, baseline_evidence_items,
    baseline_last_observed_at, target_date, created_by,
    academic_year_id, academic_subject_id, confidence_policy_id,
    baseline_confidence_state_id, validation_shadow_result_id,
    approval_status, target_status, target_min_followup_observations,
    target_min_successful_observations, baseline_cutoff_at,
    baseline_snapshot_hash, baseline_confidence_score, baseline_confidence_band,
    baseline_assessment_state, baseline_trend, baseline_priority,
    baseline_qualifying_observations
  ) values (
    v_focus.school_id, p_student_id, v_focus.subject, v_focus.skill_key,
    v_focus.skill, v_focus.topic, p_intervention_type, 'planned', v_rationale,
    v_goal, v_focus.current_status, v_conf.evidence_items,
    v_focus.last_observed_at, p_target_date, v_caller,
    v_focus.academic_year_id, v_focus.academic_subject_id, v_conf.policy_id,
    v_conf.id, v_shadow.id, 'pending', p_target_status,
    p_min_followup_observations, p_min_successful_observations,
    v_cutoff, v_hash, v_conf.confidence_score, v_conf.confidence_band,
    v_conf.assessment_state, v_focus.trend, v_focus.priority,
    v_conf.qualifying_observations
  ) returning id into v_id;

  for v_observation in
    select o.* from public.student_learning_observations o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.academic_year_id = v_focus.academic_year_id and o.observed_at <= v_cutoff
    order by o.observed_at, o.created_at, o.id
  loop
    perform private.student_learning_intervention_snapshot_observation(
      v_id, null, v_observation, 'baseline'
    );
  end loop;
  insert into public.student_learning_intervention_checkpoints(
    intervention_id, school_id, checkpoint_number, checkpoint_type, due_at
  ) values (
    v_id, v_focus.school_id, 1, 'final', p_target_date::timestamptz
  );
  insert into public.student_learning_intervention_events(
    intervention_id, actor_user_id, event_type, note
  ) values (v_id, v_caller, 'created', v_rationale);

  return jsonb_build_object(
    'success', true, 'interventionId', v_id, 'approvalStatus', 'pending',
    'baselineSnapshotHash', v_hash, 'baselineObservationCount', v_count,
    'candidateConclusionApplied', false, 'focusStateMutated', false,
    'teacherApprovalRequiredBeforeStart', true
  );
exception when unique_violation then
  raise exception 'An open intervention already exists for this student and focus area';
end;
$$;
revoke all on function public.rpc_teacher_create_learning_intervention_v2(
  uuid,text,text,text,date,text,integer,integer
) from public, anon;
grant execute on function public.rpc_teacher_create_learning_intervention_v2(
  uuid,text,text,text,date,text,integer,integer
) to authenticated, service_role;

create or replace function public.rpc_teacher_create_learning_intervention(
  p_student_id uuid,
  p_skill_key text,
  p_intervention_type text,
  p_goal text default null,
  p_target_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.rpc_teacher_create_learning_intervention_v2(
    p_student_id, p_skill_key, p_intervention_type,
    coalesce(nullif(trim(p_goal), ''), 'Collect repeated successful follow-up evidence.'),
    coalesce(p_target_date, current_date + 14), 'improving', 2, 2
  );
  return (v_result->>'interventionId')::uuid;
end;
$$;
revoke all on function public.rpc_teacher_create_learning_intervention(uuid,text,text,text,date)
  from public, anon;
grant execute on function public.rpc_teacher_create_learning_intervention(uuid,text,text,text,date)
  to authenticated, service_role;

create or replace function public.rpc_teacher_review_learning_intervention_plan(
  p_intervention_id uuid,
  p_decision text,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_i public.student_learning_interventions%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_i from public.student_learning_interventions i
  where i.id = p_intervention_id for update;
  if not found then raise exception 'Intervention not found'; end if;
  if not public.student_learning_can_manage_intervention(v_i.student_id, v_i.subject) then
    raise exception 'Not authorised for this intervention';
  end if;
  if v_i.status <> 'planned' or v_i.approval_status <> 'pending' then
    raise exception 'Only a pending planned intervention can be reviewed';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid plan decision'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then
    raise exception 'A professional approval rationale is required';
  end if;
  if not exists (
    select 1 from public.student_learning_intervention_evidence_snapshots e
    where e.intervention_id = v_i.id and e.evidence_role = 'baseline'
  ) then raise exception 'Frozen baseline evidence is missing'; end if;

  insert into public.student_learning_intervention_approvals(
    intervention_id, school_id, decision, plan_snapshot,
    baseline_snapshot_hash, rationale, decided_by
  ) values (
    v_i.id, v_i.school_id, p_decision,
    jsonb_build_object(
      'interventionType', v_i.intervention_type, 'goal', v_i.goal,
      'targetStatus', v_i.target_status, 'reviewDate', v_i.target_date,
      'minimumFollowUpObservations', v_i.target_min_followup_observations,
      'minimumSuccessfulObservations', v_i.target_min_successful_observations,
      'academicYearId', v_i.academic_year_id,
      'validationShadowResultId', v_i.validation_shadow_result_id
    ), v_i.baseline_snapshot_hash, trim(p_rationale), v_caller
  );
  update public.student_learning_interventions set
    approval_status = p_decision,
    approved_by = case when p_decision = 'approved' then v_caller else null end,
    approved_at = case when p_decision = 'approved' then now() else null end,
    status = case when p_decision = 'rejected' then 'cancelled' else status end,
    cancelled_at = case when p_decision = 'rejected' then now() else cancelled_at end,
    updated_at = now()
  where id = v_i.id;
  insert into public.student_learning_intervention_events(
    intervention_id, actor_user_id, event_type, note
  ) values (
    v_i.id, v_caller, case when p_decision = 'approved' then 'approved' else 'rejected' end,
    trim(p_rationale)
  );
  return jsonb_build_object(
    'success', true, 'interventionId', v_i.id, 'approvalStatus', p_decision,
    'baselineSnapshotHash', v_i.baseline_snapshot_hash,
    'planAutomaticallyStarted', false, 'learnerRecordMutated', false
  );
end;
$$;
revoke all on function public.rpc_teacher_review_learning_intervention_plan(uuid,text,text)
  from public, anon;
grant execute on function public.rpc_teacher_review_learning_intervention_plan(uuid,text,text)
  to authenticated, service_role;

create or replace function public.rpc_teacher_evaluate_learning_intervention(
  p_intervention_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_i public.student_learning_interventions%rowtype;
  v_conf public.student_learning_confidence_states%rowtype;
  v_latest_type text;
  v_candidate jsonb;
  v_checkpoint_id uuid;
  v_checkpoint_number integer;
  v_observation public.student_learning_observations%rowtype;
  v_total integer := 0;
  v_qualified integer := 0;
  v_successful integer := 0;
  v_latest_at timestamptz;
  v_hash text;
  v_system_outcome text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_as_of is null then raise exception 'Evaluation cutoff is required'; end if;
  select * into v_i from public.student_learning_interventions i
  where i.id = p_intervention_id for update;
  if not found then raise exception 'Intervention not found'; end if;
  if not public.student_learning_can_manage_intervention(v_i.student_id, v_i.subject) then
    raise exception 'Not authorised for this intervention';
  end if;
  if v_i.status <> 'active' or v_i.approval_status not in ('approved','legacy_approved') then
    raise exception 'Only an approved active intervention can be evaluated';
  end if;
  if p_as_of <= v_i.baseline_cutoff_at then
    raise exception 'Follow-up cutoff must be after the frozen baseline';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'intervention-evaluation:' || v_i.id::text, 0
  ));
  perform public.student_learning_rebuild_confidence_state(v_i.student_id, v_i.skill_key, p_as_of);
  select * into v_conf from public.student_learning_confidence_states c
  where c.student_id = v_i.student_id and c.skill_key = v_i.skill_key;
  if not found then raise exception 'Follow-up confidence projection is unavailable'; end if;
  select o.observation_type into v_latest_type
  from public.student_learning_observations o
  where o.student_id = v_i.student_id and o.skill_key = v_i.skill_key
    and o.academic_year_id = v_i.academic_year_id and o.observed_at <= p_as_of
  order by o.observed_at desc, o.created_at desc, o.id desc limit 1;
  v_candidate := public.student_learning_classify_progress(
    public.student_learning_confidence_progress_metrics(v_conf, v_latest_type)
  );

  select count(*)::integer,
    count(*) filter (where public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    ))::integer,
    count(*) filter (where o.observation_type in ('developing','strength')
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      ))::integer,
    max(o.observed_at),
    encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      o.id::text, o.observed_at::text, o.created_at::text, o.observation_type,
      o.source_type, o.source_key, o.evidence_count::text,
      o.evidence_percentage::text, o.evidence_quality,
      o.contributes_to_focus_state::text
    ), ',' order by o.observed_at, o.created_at, o.id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_total, v_qualified, v_successful, v_latest_at, v_hash
  from public.student_learning_observations o
  where o.student_id = v_i.student_id and o.skill_key = v_i.skill_key
    and o.academic_year_id = v_i.academic_year_id
    and o.observed_at > v_i.baseline_cutoff_at and o.observed_at <= p_as_of;

  v_system_outcome := case
    when v_qualified < v_i.target_min_followup_observations
      or v_successful < v_i.target_min_successful_observations
      then 'insufficient_follow_up'
    when v_candidate->>'status' = 'contradictory' then 'contradictory'
    when v_candidate->>'status' in ('resolved','consistent_strength') then 'resolved'
    when v_candidate->>'status' in ('improving','emerging_strength') then 'improved'
    when v_candidate->>'status' in ('persistent','recurring','new_focus')
      and v_successful = 0 then 'declined'
    else 'no_change' end;

  select coalesce(max(c.checkpoint_number), 0) + 1 into v_checkpoint_number
  from public.student_learning_intervention_checkpoints c
  where c.intervention_id = v_i.id and c.status = 'evaluated';
  update public.student_learning_intervention_checkpoints c set
    checkpoint_number = v_checkpoint_number,
    checkpoint_type = 'final', status = 'evaluated', evaluated_as_of = p_as_of,
    observation_count = v_total, qualifying_observation_count = v_qualified,
    successful_observation_count = v_successful,
    candidate_status = v_candidate->>'status', candidate_trend = v_candidate->>'trend',
    system_outcome = v_system_outcome, evidence_latest_at = v_latest_at,
    evidence_snapshot_hash = v_hash,
    comparison_snapshot = jsonb_build_object(
      'baseline', jsonb_build_object(
        'status', v_i.baseline_status, 'trend', v_i.baseline_trend,
        'priority', v_i.baseline_priority,
        'confidenceScore', v_i.baseline_confidence_score,
        'qualifyingObservations', v_i.baseline_qualifying_observations,
        'snapshotHash', v_i.baseline_snapshot_hash,
        'cutoff', v_i.baseline_cutoff_at
      ),
      'followUp', jsonb_build_object(
        'decision', v_candidate, 'confidenceScore', v_conf.confidence_score,
        'confidenceBand', v_conf.confidence_band,
        'assessmentState', v_conf.assessment_state,
        'observationCount', v_total, 'qualifyingObservations', v_qualified,
        'successfulObservations', v_successful, 'snapshotHash', v_hash,
        'cutoff', p_as_of
      ),
      'targets', jsonb_build_object(
        'targetStatus', v_i.target_status,
        'minimumFollowUpObservations', v_i.target_min_followup_observations,
        'minimumSuccessfulObservations', v_i.target_min_successful_observations
      )
    ), evaluated_by = v_caller, evaluated_at = now()
  where c.id = (
    select x.id from public.student_learning_intervention_checkpoints x
    where x.intervention_id = v_i.id and x.status = 'scheduled'
    order by x.due_at, x.checkpoint_number limit 1 for update
  ) returning c.id into v_checkpoint_id;
  if v_checkpoint_id is null then
    insert into public.student_learning_intervention_checkpoints(
      intervention_id, school_id, checkpoint_number, checkpoint_type, status,
      due_at, evaluated_as_of, observation_count, qualifying_observation_count,
      successful_observation_count, candidate_status, candidate_trend,
      system_outcome, evidence_latest_at, evidence_snapshot_hash,
      comparison_snapshot, evaluated_by, evaluated_at
    ) values (
      v_i.id, v_i.school_id, v_checkpoint_number, 'final', 'evaluated',
      p_as_of, p_as_of, v_total, v_qualified, v_successful,
      v_candidate->>'status', v_candidate->>'trend', v_system_outcome,
      v_latest_at, v_hash,
      jsonb_build_object('baselineSnapshotHash', v_i.baseline_snapshot_hash,
        'followUpDecision', v_candidate, 'followUpSnapshotHash', v_hash),
      v_caller, now()
    ) returning id into v_checkpoint_id;
  end if;

  for v_observation in
    select o.* from public.student_learning_observations o
    where o.student_id = v_i.student_id and o.skill_key = v_i.skill_key
      and o.academic_year_id = v_i.academic_year_id
      and o.observed_at > v_i.baseline_cutoff_at and o.observed_at <= p_as_of
    order by o.observed_at, o.created_at, o.id
  loop
    perform private.student_learning_intervention_snapshot_observation(
      v_i.id, v_checkpoint_id, v_observation, 'follow_up'
    );
  end loop;
  update public.student_learning_interventions set
    follow_up_observation_count = v_total,
    follow_up_qualifying_observations = v_qualified,
    follow_up_successful_observations = v_successful,
    system_outcome_status = v_system_outcome,
    system_outcome_snapshot = jsonb_build_object(
      'checkpointId', v_checkpoint_id, 'decision', v_candidate,
      'evidenceSnapshotHash', v_hash, 'evaluatedAsOf', p_as_of,
      'sourceObservationsMutated', false, 'focusStateMutated', false,
      'interventionAutomaticallyClosed', false
    ), updated_at = now()
  where id = v_i.id;
  insert into public.student_learning_intervention_events(
    intervention_id, actor_user_id, event_type, note
  ) values (
    v_i.id, v_caller, 'checkpoint_evaluated',
    format('System follow-up assessment: %s (%s qualifying, %s successful).',
      replace(v_system_outcome, '_', ' '), v_qualified, v_successful)
  );
  return jsonb_build_object(
    'success', true, 'interventionId', v_i.id, 'checkpointId', v_checkpoint_id,
    'systemOutcome', v_system_outcome, 'candidateStatus', v_candidate->>'status',
    'candidateTrend', v_candidate->>'trend',
    'followUpObservationCount', v_total,
    'qualifyingFollowUpObservations', v_qualified,
    'successfulFollowUpObservations', v_successful,
    'minimumFollowUpObservations', v_i.target_min_followup_observations,
    'minimumSuccessfulObservations', v_i.target_min_successful_observations,
    'evidenceSnapshotHash', v_hash,
    'teacherConfirmationRequired', true,
    'interventionAutomaticallyClosed', false,
    'sourceObservationsMutated', false, 'focusStateMutated', false
  );
end;
$$;
revoke all on function public.rpc_teacher_evaluate_learning_intervention(uuid,timestamptz)
  from public, anon;
grant execute on function public.rpc_teacher_evaluate_learning_intervention(uuid,timestamptz)
  to authenticated, service_role;

create or replace function public.rpc_teacher_confirm_learning_intervention_outcome(
  p_checkpoint_id uuid,
  p_decision text,
  p_teacher_outcome text,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_checkpoint public.student_learning_intervention_checkpoints%rowtype;
  v_i public.student_learning_interventions%rowtype;
  v_expected text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_checkpoint from public.student_learning_intervention_checkpoints c
  where c.id = p_checkpoint_id;
  if not found or v_checkpoint.status <> 'evaluated' then
    raise exception 'Evaluated checkpoint not found';
  end if;
  select * into v_i from public.student_learning_interventions i
  where i.id = v_checkpoint.intervention_id for update;
  if not public.student_learning_can_manage_intervention(v_i.student_id, v_i.subject) then
    raise exception 'Not authorised for this intervention';
  end if;
  if v_i.status <> 'active' then raise exception 'Intervention is not active'; end if;
  if p_decision not in ('confirmed','overridden','continue_collecting') then
    raise exception 'Invalid outcome decision';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then
    raise exception 'A professional outcome rationale is required';
  end if;
  v_expected := case v_checkpoint.system_outcome
    when 'improved' then 'improved' when 'resolved' then 'resolved'
    when 'no_change' then 'no_change' when 'declined' then 'declined'
    when 'contradictory' then 'inconclusive'
    else null end;
  if p_decision = 'confirmed' and (v_expected is null or p_teacher_outcome <> v_expected) then
    raise exception 'Confirmed outcome must match the measured system outcome';
  end if;
  if p_decision = 'overridden' and (
    p_teacher_outcome not in (
      'improved','resolved','no_change','declined','inconclusive','needs_more_support'
    ) or length(trim(p_rationale)) < 20
  ) then raise exception 'A detailed professional rationale is required to override'; end if;
  if p_decision = 'continue_collecting' then
    p_teacher_outcome := null;
  end if;

  insert into public.student_learning_intervention_outcome_reviews(
    intervention_id, checkpoint_id, school_id, decision, system_outcome,
    teacher_outcome, rationale, reviewed_by
  ) values (
    v_i.id, v_checkpoint.id, v_i.school_id, p_decision,
    v_checkpoint.system_outcome, p_teacher_outcome, trim(p_rationale), v_caller
  );
  if p_decision = 'continue_collecting' then
    insert into public.student_learning_intervention_checkpoints(
      intervention_id, school_id, checkpoint_number, checkpoint_type, due_at
    ) values (
      v_i.id, v_i.school_id, v_checkpoint.checkpoint_number + 1,
      'final', greatest(now() + interval '7 days', v_checkpoint.due_at + interval '7 days')
    );
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (v_i.id, v_caller, 'follow_up_continued', trim(p_rationale));
  else
    update public.student_learning_interventions set
      status = 'completed', completed_at = now(), outcome_status = p_teacher_outcome,
      outcome_note = trim(p_rationale), outcome_confirmed_by = v_caller,
      updated_at = now()
    where id = v_i.id;
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (
      v_i.id, v_caller,
      case when p_decision = 'confirmed' then 'outcome_confirmed' else 'outcome_overridden' end,
      trim(p_rationale)
    );
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (v_i.id, v_caller, 'completed', 'Teacher-confirmed measurable outcome recorded.');
  end if;
  return jsonb_build_object(
    'success', true, 'interventionId', v_i.id, 'checkpointId', v_checkpoint.id,
    'decision', p_decision, 'teacherOutcome', p_teacher_outcome,
    'status', case when p_decision = 'continue_collecting' then 'active' else 'completed' end,
    'focusStateMutated', false, 'sourceObservationsMutated', false,
    'outcomeRequiredTeacherConfirmation', true
  );
end;
$$;
revoke all on function public.rpc_teacher_confirm_learning_intervention_outcome(uuid,text,text,text)
  from public, anon;
grant execute on function public.rpc_teacher_confirm_learning_intervention_outcome(uuid,text,text,text)
  to authenticated, service_role;

create or replace function public.rpc_teacher_update_learning_intervention(
  p_intervention_id uuid,
  p_action text,
  p_note text default null,
  p_outcome_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_i public.student_learning_interventions%rowtype;
  v_checkpoint_id uuid;
  v_evaluation jsonb;
  v_expected text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_i from public.student_learning_interventions i
  where i.id = p_intervention_id for update;
  if not found then return false; end if;
  if not public.student_learning_can_manage_intervention(v_i.student_id, v_i.subject) then
    raise exception 'Not authorised for this intervention';
  end if;

  if p_action = 'approve' then
    perform public.rpc_teacher_review_learning_intervention_plan(
      v_i.id, 'approved', coalesce(nullif(trim(p_note), ''),
        'Teacher confirms this evidence-led plan and measurable follow-up target.')
    );
  elsif p_action = 'start' then
    if v_i.status <> 'planned' then raise exception 'Only planned interventions can be started'; end if;
    if v_i.approval_status not in ('approved','legacy_approved') then
      raise exception 'Teacher approval is required before starting this intervention';
    end if;
    update public.student_learning_interventions set
      status = 'active', started_at = now(), updated_at = now()
    where id = v_i.id;
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (v_i.id, v_caller, 'started', nullif(trim(p_note), ''));
  elsif p_action = 'complete' then
    if v_i.status <> 'active' then raise exception 'Only an active intervention can be completed'; end if;
    select c.id into v_checkpoint_id
    from public.student_learning_intervention_checkpoints c
    where c.intervention_id = v_i.id and c.status = 'evaluated'
      and not exists (
        select 1 from public.student_learning_intervention_outcome_reviews r
        where r.checkpoint_id = c.id
      )
    order by c.evaluated_at desc limit 1;
    if v_checkpoint_id is null then
      v_evaluation := public.rpc_teacher_evaluate_learning_intervention(v_i.id, now());
      v_checkpoint_id := (v_evaluation->>'checkpointId')::uuid;
    end if;
    select case c.system_outcome
      when 'improved' then 'improved' when 'resolved' then 'resolved'
      when 'no_change' then 'no_change' when 'declined' then 'declined'
      when 'contradictory' then 'inconclusive' else null end
    into v_expected from public.student_learning_intervention_checkpoints c
    where c.id = v_checkpoint_id;
    if v_expected is null then
      raise exception 'More qualifying follow-up evidence is required before completion';
    end if;
    if p_outcome_status is null then p_outcome_status := v_expected; end if;
    perform public.rpc_teacher_confirm_learning_intervention_outcome(
      v_checkpoint_id,
      case when p_outcome_status = v_expected then 'confirmed' else 'overridden' end,
      p_outcome_status,
      coalesce(nullif(trim(p_note), ''),
        'Teacher confirms the measured follow-up outcome for this intervention.')
    );
  elsif p_action = 'cancel' then
    if v_i.status not in ('planned','active') then raise exception 'Intervention is not open'; end if;
    if length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Cancellation rationale is required'; end if;
    update public.student_learning_interventions set
      status = 'cancelled', cancelled_at = now(), outcome_note = trim(p_note), updated_at = now()
    where id = v_i.id;
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (v_i.id, v_caller, 'cancelled', trim(p_note));
  elsif p_action = 'note' then
    if length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Meaningful note is required'; end if;
    update public.student_learning_interventions set updated_at = now() where id = v_i.id;
    insert into public.student_learning_intervention_events(
      intervention_id, actor_user_id, event_type, note
    ) values (v_i.id, v_caller, 'note', trim(p_note));
  else raise exception 'Invalid intervention action'; end if;
  return true;
end;
$$;
revoke all on function public.rpc_teacher_update_learning_intervention(uuid,text,text,text)
  from public, anon;
grant execute on function public.rpc_teacher_update_learning_intervention(uuid,text,text,text)
  to authenticated, service_role;

create or replace function public.rpc_teacher_student_intervention_pilot(
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
  v_base jsonb;
  v_school_id uuid;
  v_interventions jsonb;
begin
  v_base := public.rpc_teacher_student_intervention_intelligence(p_student_id, p_subject);
  select u.school_id into v_school_id from public.users u where u.id = p_student_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'subject', i.subject, 'skill', i.skill, 'skill_key', i.skill_key,
    'topic', i.topic, 'intervention_type', i.intervention_type, 'status', i.status,
    'approval_status', i.approval_status, 'rationale', i.rationale, 'goal', i.goal,
    'academic_year_id', i.academic_year_id,
    'validation_shadow_result_id', i.validation_shadow_result_id,
    'baseline_status', i.baseline_status,
    'baseline_evidence_items', i.baseline_evidence_items,
    'baseline_qualifying_observations', i.baseline_qualifying_observations,
    'baseline_last_observed_at', i.baseline_last_observed_at,
    'baseline_cutoff_at', i.baseline_cutoff_at,
    'baseline_snapshot_hash', i.baseline_snapshot_hash,
    'baseline_confidence_score', i.baseline_confidence_score,
    'baseline_confidence_band', i.baseline_confidence_band,
    'target_status', i.target_status,
    'target_min_followup_observations', i.target_min_followup_observations,
    'target_min_successful_observations', i.target_min_successful_observations,
    'target_date', i.target_date, 'created_at', i.created_at,
    'approved_at', i.approved_at, 'started_at', i.started_at,
    'completed_at', i.completed_at,
    'follow_up_observation_count', i.follow_up_observation_count,
    'follow_up_qualifying_observations', i.follow_up_qualifying_observations,
    'follow_up_successful_observations', i.follow_up_successful_observations,
    'system_outcome_status', i.system_outcome_status,
    'system_outcome_snapshot', i.system_outcome_snapshot,
    'outcome_status', i.outcome_status, 'outcome_note', i.outcome_note,
    'checkpoints', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'number', c.checkpoint_number, 'type', c.checkpoint_type,
      'status', c.status, 'due_at', c.due_at, 'evaluated_as_of', c.evaluated_as_of,
      'observation_count', c.observation_count,
      'qualifying_observation_count', c.qualifying_observation_count,
      'successful_observation_count', c.successful_observation_count,
      'candidate_status', c.candidate_status, 'system_outcome', c.system_outcome,
      'evidence_snapshot_hash', c.evidence_snapshot_hash,
      'evaluated_at', c.evaluated_at
    ) order by c.checkpoint_number) from public.student_learning_intervention_checkpoints c
      where c.intervention_id = i.id), '[]'::jsonb)
  ) order by case i.status when 'active' then 1 when 'planned' then 2 else 3 end,
    i.created_at desc), '[]'::jsonb)
  into v_interventions
  from public.student_learning_interventions i
  where i.school_id = v_school_id and i.student_id = p_student_id
    and (p_subject is null
      or public.academic_normalize_subject_key(i.subject)
        = public.academic_normalize_subject_key(p_subject))
    and public.student_learning_can_manage_intervention(i.student_id, i.subject);
  return jsonb_set(v_base, '{interventions}', v_interventions, true)
    || jsonb_build_object('pilotDisclosure', jsonb_build_object(
      'teacherApprovalRequiredBeforeStart', true,
      'baselineEvidenceFrozenAndHashed', true,
      'followUpComparedToBaseline', true,
      'outcomeRequiresTeacherConfirmation', true,
      'sourceObservationsMutated', false,
      'focusStatesMutated', false,
      'automaticPrescriptionEnabled', false,
      'automaticClosureEnabled', false
    ));
end;
$$;
revoke all on function public.rpc_teacher_student_intervention_pilot(uuid,text)
  from public, anon;
grant execute on function public.rpc_teacher_student_intervention_pilot(uuid,text)
  to authenticated, service_role;

comment on table public.student_learning_intervention_approvals is
  'Immutable teacher approval or rejection of the frozen intervention plan and measurement target.';
comment on table public.student_learning_intervention_checkpoints is
  'Scheduled and evaluated follow-up checkpoints comparing post-baseline evidence to the frozen intervention baseline.';
comment on table public.student_learning_intervention_evidence_snapshots is
  'Immutable observation-level baseline and follow-up evidence snapshots with reproducible hashes.';
comment on table public.student_learning_intervention_outcome_reviews is
  'Immutable teacher confirmation, override, or continue-collecting decision after measured follow-up.';
comment on function public.rpc_teacher_evaluate_learning_intervention(uuid,timestamptz) is
  'Measures follow-up against the frozen baseline without closing the intervention or changing source/focus records.';
