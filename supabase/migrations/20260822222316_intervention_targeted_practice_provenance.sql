-- Brains Heist targeted intervention practice provenance.
--
-- Targeted practice is deliberately kept distinct from independent assessed evidence:
-- students should be able to rehearse a weak area without a coached practice score
-- automatically resolving the weakness in Student Learning Memory.

create table if not exists public.student_learning_intervention_practice_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  intervention_id uuid references public.student_learning_interventions(id) on delete set null,
  skill_key text not null,
  diagnostic_targets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(diagnostic_targets) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  unique (assignment_id, student_id)
);

create index if not exists student_learning_intervention_practice_student_idx
  on public.student_learning_intervention_practice_assignments(student_id, created_at desc);
create index if not exists student_learning_intervention_practice_intervention_idx
  on public.student_learning_intervention_practice_assignments(intervention_id)
  where intervention_id is not null;
create index if not exists student_learning_intervention_practice_school_idx
  on public.student_learning_intervention_practice_assignments(school_id, created_at desc);

alter table public.student_learning_intervention_practice_assignments enable row level security;
revoke all on table public.student_learning_intervention_practice_assignments
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.student_learning_intervention_practice_assignments
  to service_role;

create or replace function private.student_learning_mark_intervention_practice_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'assignment_result'
     and new.source_id is not null
     and exists (
       select 1
       from public.student_learning_intervention_practice_assignments p
       where p.assignment_id = new.source_id
         and p.student_id = new.student_id
     ) then
    new.contributes_to_focus_state := false;
    new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
      'evidence_purpose', 'intervention_practice',
      'intervention_practice', true,
      'independent_mastery_evidence', false,
      'source_label', 'Brains Heist targeted practice'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.student_learning_mark_intervention_practice_observation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_student_learning_mark_intervention_practice_observation
  on public.student_learning_observations;
create trigger trg_student_learning_mark_intervention_practice_observation
before insert or update on public.student_learning_observations
for each row execute function private.student_learning_mark_intervention_practice_observation();

create or replace function public.rpc_teacher_register_intervention_practice(
  p_assignment_id uuid,
  p_student_id uuid,
  p_skill_key text,
  p_diagnostic_targets jsonb default '[]'::jsonb,
  p_intervention_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_assignment public.assignments%rowtype;
  v_focus public.student_learning_focus_states%rowtype;
  v_intervention public.student_learning_interventions%rowtype;
  v_school_id uuid;
  v_id uuid;
  v_existing public.student_learning_intervention_practice_assignments%rowtype;
  v_observation record;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_assignment_id is null or p_student_id is null or nullif(trim(p_skill_key), '') is null then
    raise exception 'Assignment, student and skill are required';
  end if;
  if jsonb_typeof(coalesce(p_diagnostic_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'Diagnostic targets must be a list';
  end if;
  if jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) > 12 then
    raise exception 'Choose no more than 12 diagnostic targets';
  end if;

  select * into v_focus
  from public.student_learning_focus_states f
  where f.student_id = p_student_id and f.skill_key = p_skill_key;
  if not found then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id, v_focus.subject) then
    raise exception 'Not authorised for this student and subject';
  end if;

  select * into v_assignment from public.assignments a where a.id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  v_school_id := coalesce(v_assignment.school_id, v_focus.school_id);
  if v_school_id is distinct from v_focus.school_id then
    raise exception 'Assignment and learning focus must belong to the same school';
  end if;
  if not exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id and sa.student_id = p_student_id
  ) then raise exception 'Target student is not assigned to this practice'; end if;
  if exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id and sa.student_id <> p_student_id
  ) then raise exception 'Intervention practice must target one student only'; end if;

  if p_intervention_id is not null then
    select * into v_intervention
    from public.student_learning_interventions i
    where i.id = p_intervention_id;
    if not found then raise exception 'Intervention not found'; end if;
    if v_intervention.student_id <> p_student_id
       or v_intervention.skill_key <> p_skill_key
       or v_intervention.school_id <> v_school_id then
      raise exception 'Intervention does not match this student, school and focus area';
    end if;
    if not public.student_learning_can_manage_intervention(v_intervention.student_id, v_intervention.subject) then
      raise exception 'Not authorised for this intervention';
    end if;
  end if;

  select * into v_existing
  from public.student_learning_intervention_practice_assignments p
  where p.assignment_id = p_assignment_id and p.student_id = p_student_id
  for update;

  if found then
    if v_existing.school_id <> v_school_id or v_existing.skill_key <> p_skill_key then
      raise exception 'Existing targeted-practice provenance does not match this focus area';
    end if;
    if v_existing.intervention_id is not null
       and p_intervention_id is not null
       and v_existing.intervention_id <> p_intervention_id then
      raise exception 'Targeted practice is already linked to another intervention';
    end if;
    update public.student_learning_intervention_practice_assignments set
      intervention_id = coalesce(intervention_id, p_intervention_id),
      diagnostic_targets = case
        when jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) > 0
          then p_diagnostic_targets
        else diagnostic_targets
      end,
      linked_at = case
        when coalesce(intervention_id, p_intervention_id) is not null then coalesce(linked_at, now())
        else linked_at
      end
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.student_learning_intervention_practice_assignments(
      school_id, assignment_id, student_id, intervention_id, skill_key,
      diagnostic_targets, created_by, linked_at
    ) values (
      v_school_id, p_assignment_id, p_student_id, p_intervention_id, p_skill_key,
      coalesce(p_diagnostic_targets, '[]'::jsonb), v_actor,
      case when p_intervention_id is null then null else now() end
    ) returning id into v_id;
  end if;

  -- Defensive backstop for an unusually fast completion/retry: if assignment-derived
  -- observations already exist, preserve them as practice history but remove them from
  -- longitudinal focus/confidence decisions.
  for v_observation in
    select distinct o.student_id, o.skill_key
    from public.student_learning_observations o
    where o.student_id = p_student_id
      and o.source_type = 'assignment_result'
      and o.source_id = p_assignment_id
  loop
    update public.student_learning_observations o set
      contributes_to_focus_state = false,
      evidence = coalesce(o.evidence, '{}'::jsonb) || jsonb_build_object(
        'evidence_purpose', 'intervention_practice',
        'intervention_practice', true,
        'independent_mastery_evidence', false,
        'source_label', 'Brains Heist targeted practice'
      )
    where o.student_id = v_observation.student_id
      and o.skill_key = v_observation.skill_key
      and o.source_type = 'assignment_result'
      and o.source_id = p_assignment_id;
    perform public.student_learning_refresh_focus_state(v_observation.student_id, v_observation.skill_key);
  end loop;

  return jsonb_build_object(
    'success', true,
    'practiceId', v_id,
    'assignmentId', p_assignment_id,
    'studentId', p_student_id,
    'interventionId', p_intervention_id,
    'evidencePurpose', 'intervention_practice',
    'countsAsIndependentMasteryEvidence', false
  );
end;
$$;
revoke all on function public.rpc_teacher_register_intervention_practice(uuid,uuid,text,jsonb,uuid)
  from public, anon;
grant execute on function public.rpc_teacher_register_intervention_practice(uuid,uuid,text,jsonb,uuid)
  to authenticated, service_role;

comment on table public.student_learning_intervention_practice_assignments is
  'Provenance for one-student targeted intervention practice. Practice outcomes remain visible history but do not independently resolve longitudinal learning needs.';
comment on function public.rpc_teacher_register_intervention_practice(uuid,uuid,text,jsonb,uuid) is
  'Registers an assignment as Brains Heist intervention practice and prevents its assignment-result observations from counting as independent mastery evidence.';
