-- Balanced MCQ presentation + reusable English diagnostic forms.
-- Historical assignment snapshots are intentionally untouched.

alter table public.registry_diagnostic_presets
  add column if not exists selection_mode text not null default 'fixed',
  add column if not exists selection_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'registry_diagnostic_presets_selection_mode_check'
      and conrelid = 'public.registry_diagnostic_presets'::regclass
  ) then
    alter table public.registry_diagnostic_presets
      add constraint registry_diagnostic_presets_selection_mode_check
      check (selection_mode in ('fixed','dynamic'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Deterministic assignment-level option balancing
-- ---------------------------------------------------------------------------
-- The canonical verified question remains unchanged. Only the immutable
-- assignment snapshot gets a presentation-order transform.
create or replace function private.balance_assignment_question_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb := new.question_snapshot;
  v_options jsonb;
  v_balanced_options jsonb;
  v_option_count integer;
  v_correct text;
  v_match_count integer;
  v_current_index integer;
  v_block integer;
  v_slot integer;
  v_target_index integer;
begin
  if v_snapshot is null
     or lower(coalesce(v_snapshot->>'question_type','')) <> 'multiple_choice' then
    return new;
  end if;

  v_options := v_snapshot->'options';
  if jsonb_typeof(v_options) <> 'array' then
    return new;
  end if;

  v_option_count := jsonb_array_length(v_options);
  if v_option_count < 2 or v_option_count > 6 then
    return new;
  end if;

  v_correct := trim(coalesce(v_snapshot->>'correct_answer',''));
  if v_correct = '' then
    return new;
  end if;

  select count(*)::integer, min((entry.ordinality - 1)::integer)
  into v_match_count, v_current_index
  from jsonb_array_elements_text(v_options) with ordinality entry(value, ordinality)
  where lower(trim(entry.value)) = lower(v_correct);

  -- Ambiguous/malformed MCQs are left untouched. Governed diagnostics reject
  -- them separately instead of guessing which option is authoritative.
  if v_match_count <> 1 or v_current_index is null then
    return new;
  end if;

  -- Every consecutive block of N questions uses every one of the N answer
  -- positions exactly once. The permutation changes per assignment and block,
  -- avoiding visible A/B/C/D cycles while guaranteeing a spread <= 1.
  v_block := (greatest(coalesce(new.order_index,1),1) - 1) / v_option_count;
  v_slot := mod(greatest(coalesce(new.order_index,1),1) - 1, v_option_count);

  select position_index
  into v_target_index
  from generate_series(0, v_option_count - 1) position_index
  order by md5(
    new.assignment_id::text || ':' ||
    v_block::text || ':' ||
    position_index::text
  )
  offset v_slot
  limit 1;

  if v_target_index is null or v_target_index = v_current_index then
    return new;
  end if;

  select jsonb_agg(
    case
      when index_value = v_current_index then v_options->v_target_index
      when index_value = v_target_index then v_options->v_current_index
      else v_options->index_value
    end
    order by index_value
  )
  into v_balanced_options
  from generate_series(0, v_option_count - 1) index_value;

  new.question_snapshot := jsonb_set(
    v_snapshot,
    '{options}',
    v_balanced_options,
    false
  );

  return new;
end;
$$;

revoke all on function private.balance_assignment_question_options()
from public, anon, authenticated, service_role;

drop trigger if exists trg_zzz_assignment_question_option_balance
  on public.assignment_questions;
create trigger trg_zzz_assignment_question_option_balance
before insert on public.assignment_questions
for each row execute function private.balance_assignment_question_options();

create or replace function private.assert_assignment_mcq_answer_balance(
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalid integer := 0;
  v_max_spread integer := 0;
  v_has_triple boolean := false;
begin
  with mcq as (
    select
      aq.order_index,
      jsonb_array_length(aq.question_snapshot->'options') as option_count,
      (
        select min((entry.ordinality - 1)::integer)
        from jsonb_array_elements_text(aq.question_snapshot->'options')
          with ordinality entry(value, ordinality)
        where lower(trim(entry.value)) =
          lower(trim(aq.question_snapshot->>'correct_answer'))
      ) as correct_index,
      (
        select count(*)::integer
        from jsonb_array_elements_text(aq.question_snapshot->'options')
          with ordinality entry(value, ordinality)
        where lower(trim(entry.value)) =
          lower(trim(aq.question_snapshot->>'correct_answer'))
      ) as correct_matches
    from public.assignment_questions aq
    where aq.assignment_id = p_assignment_id
      and lower(coalesce(aq.question_snapshot->>'question_type','')) = 'multiple_choice'
      and jsonb_typeof(aq.question_snapshot->'options') = 'array'
  )
  select count(*)::integer
  into v_invalid
  from mcq
  where option_count < 2
     or option_count > 6
     or correct_matches <> 1
     or correct_index is null;

  if v_invalid > 0 then
    raise exception using errcode='23514',
      message='diagnostic_mcq_answer_key_invalid',
      detail='assignment_id='||p_assignment_id::text;
  end if;

  with mcq as (
    select
      jsonb_array_length(aq.question_snapshot->'options') as option_count,
      (
        select min((entry.ordinality - 1)::integer)
        from jsonb_array_elements_text(aq.question_snapshot->'options')
          with ordinality entry(value, ordinality)
        where lower(trim(entry.value)) =
          lower(trim(aq.question_snapshot->>'correct_answer'))
      ) as correct_index
    from public.assignment_questions aq
    where aq.assignment_id = p_assignment_id
      and lower(coalesce(aq.question_snapshot->>'question_type','')) = 'multiple_choice'
      and jsonb_typeof(aq.question_snapshot->'options') = 'array'
  ),
  option_counts as (
    select distinct option_count from mcq
  ),
  counts as (
    select
      oc.option_count,
      position_index,
      count(mcq.correct_index)::integer as answer_count
    from option_counts oc
    cross join lateral generate_series(0, oc.option_count - 1) position_index
    left join mcq
      on mcq.option_count = oc.option_count
     and mcq.correct_index = position_index
    group by oc.option_count, position_index
  ),
  spreads as (
    select option_count, max(answer_count) - min(answer_count) as spread
    from counts
    group by option_count
  )
  select coalesce(max(spread),0)::integer
  into v_max_spread
  from spreads;

  if v_max_spread > 1 then
    raise exception using errcode='23514',
      message='diagnostic_answer_positions_not_balanced',
      detail='assignment_id='||p_assignment_id::text||'; spread='||v_max_spread::text;
  end if;

  with positions as (
    select
      aq.order_index,
      (
        select min((entry.ordinality - 1)::integer)
        from jsonb_array_elements_text(aq.question_snapshot->'options')
          with ordinality entry(value, ordinality)
        where lower(trim(entry.value)) =
          lower(trim(aq.question_snapshot->>'correct_answer'))
      ) as correct_index
    from public.assignment_questions aq
    where aq.assignment_id = p_assignment_id
      and lower(coalesce(aq.question_snapshot->>'question_type','')) = 'multiple_choice'
      and jsonb_typeof(aq.question_snapshot->'options') = 'array'
  ),
  sequenced as (
    select
      correct_index,
      lag(correct_index,1) over(order by order_index) as previous_one,
      lag(correct_index,2) over(order by order_index) as previous_two
    from positions
  )
  select exists(
    select 1
    from sequenced
    where correct_index = previous_one
      and correct_index = previous_two
  )
  into v_has_triple;

  if v_has_triple then
    raise exception using errcode='23514',
      message='diagnostic_answer_position_run_too_long',
      detail='assignment_id='||p_assignment_id::text;
  end if;
end;
$$;

revoke all on function private.assert_assignment_mcq_answer_balance(uuid)
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Dynamic English diagnostic blueprints
-- ---------------------------------------------------------------------------
with context as (
  select
    registry.id as registry_version_id,
    subject.id as academic_subject_id
  from public.academic_skill_registry_versions registry
  join public.academic_subjects subject
    on subject.code=registry.subject_key and subject.is_active
  where registry.code='bh-english-core-v1'
    and registry.status='published'
),
seed(
  preset_key,name,short_name,description,question_count,estimated_minutes,
  recommended,sort_order,selection_config
) as (values
  (
    'english-core-quick-20',
    'English Quick Diagnostic',
    'Quick Diagnostic',
    'A fresh 20-question independent English language-use baseline. It samples grammar, vocabulary, sentence control and applied language understanding without claiming to directly assess speaking, listening or extended writing.',
    20,20,false,110,
    jsonb_build_object(
      'difficultyTargets',jsonb_build_object('easy',4,'medium',12,'hard',4),
      'recentLookbackDays',90,
      'coverageNote','Language knowledge and applied English use. Speaking, listening and extended writing require separate direct evidence.',
      'notDirectlyAssessed',jsonb_build_array('Speaking','Listening','Extended writing')
    )
  ),
  (
    'english-core-diagnostic-30',
    'English Diagnostic',
    'Recommended Diagnostic',
    'A fresh 30-question independent English diagnostic with broader skill sampling and stronger evidence depth for Curriculum Intelligence.',
    30,30,true,120,
    jsonb_build_object(
      'difficultyTargets',jsonb_build_object('easy',6,'medium',18,'hard',6),
      'recentLookbackDays',90,
      'coverageNote','Language knowledge and applied English use with broad skill sampling. Speaking, listening and extended writing require separate direct evidence.',
      'notDirectlyAssessed',jsonb_build_array('Speaking','Listening','Extended writing')
    )
  ),
  (
    'english-core-deep-40',
    'English Deep Diagnostic',
    'Deep Diagnostic',
    'A fresh 40-question independent English language-use diagnostic for stronger cross-skill evidence before intervention planning.',
    40,40,false,130,
    jsonb_build_object(
      'difficultyTargets',jsonb_build_object('easy',8,'medium',24,'hard',8),
      'recentLookbackDays',90,
      'coverageNote','Deeper language knowledge and applied English-use sampling. Speaking, listening and extended writing remain separate direct-assessment domains.',
      'notDirectlyAssessed',jsonb_build_array('Speaking','Listening','Extended writing')
    )
  )
)
insert into public.registry_diagnostic_presets(
  preset_key,registry_version_id,academic_subject_id,
  name,short_name,description,question_count,estimated_minutes,
  assignment_category,eligible_grade_levels,
  programme_code,paper_component,source_version,
  recommended,sort_order,status,selection_mode,selection_config
)
select
  seed.preset_key,context.registry_version_id,context.academic_subject_id,
  seed.name,seed.short_name,seed.description,seed.question_count,seed.estimated_minutes,
  'quiz',array[6,7,8,9]::smallint[],
  null,null,'bh-english-core-v1',
  seed.recommended,seed.sort_order,'active','dynamic',seed.selection_config
from context cross join seed
on conflict(preset_key) do update set
  registry_version_id=excluded.registry_version_id,
  academic_subject_id=excluded.academic_subject_id,
  name=excluded.name,
  short_name=excluded.short_name,
  description=excluded.description,
  question_count=excluded.question_count,
  estimated_minutes=excluded.estimated_minutes,
  assignment_category=excluded.assignment_category,
  eligible_grade_levels=excluded.eligible_grade_levels,
  programme_code=excluded.programme_code,
  paper_component=excluded.paper_component,
  source_version=excluded.source_version,
  recommended=excluded.recommended,
  sort_order=excluded.sort_order,
  status='active',
  selection_mode='dynamic',
  selection_config=excluded.selection_config,
  updated_at=now();

create or replace function private.select_dynamic_registry_diagnostic_questions(
  p_preset_id uuid,
  p_school_id uuid,
  p_group_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid,
  p_seed text
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preset public.registry_diagnostic_presets%rowtype;
  v_lookback_days integer;
  v_expected integer;
  v_selected uuid[] := '{}'::uuid[];
  v_selected_count integer := 0;
begin
  select *
  into v_preset
  from public.registry_diagnostic_presets
  where id=p_preset_id
    and status='active'
    and selection_mode='dynamic';

  if not found then
    raise exception using errcode='22023',message='dynamic_diagnostic_preset_required';
  end if;

  if p_grade_level !~ '^[0-9]+$'
     or not (p_grade_level::smallint = any(v_preset.eligible_grade_levels)) then
    raise exception using errcode='22023',message='dynamic_diagnostic_grade_not_eligible';
  end if;

  v_lookback_days := greatest(
    0,
    least(
      coalesce((v_preset.selection_config->>'recentLookbackDays')::integer,90),
      365
    )
  );

  select coalesce(sum(value::integer),0)::integer
  into v_expected
  from jsonb_each_text(v_preset.selection_config->'difficultyTargets');

  if v_expected <> v_preset.question_count then
    raise exception using errcode='23514',
      message='dynamic_diagnostic_difficulty_targets_mismatch';
  end if;

  with targets as (
    select key as difficulty, value::integer as target_count
    from jsonb_each_text(v_preset.selection_config->'difficultyTargets')
  ),
  candidates as (
    select
      q.id,
      q.difficulty,
      coalesce(nullif(trim(q.curriculum_skill),''),q.id::text) as skill_key,
      exists(
        select 1
        from public.assignments previous_assignment
        join public.assignment_questions previous_question
          on previous_question.assignment_id=previous_assignment.id
         and previous_question.question_id=q.id
        where previous_assignment.subject_group_id=p_group_id
          and previous_assignment.created_at >=
            now() - make_interval(days=>v_lookback_days)
      ) as recently_used
    from public.questions q
    join targets target on target.difficulty=q.difficulty
    where q.academic_subject_id=p_academic_subject_id
      and p_grade_level::smallint=any(q.eligible_grade_levels)
      and q.question_type='multiple_choice'
      and jsonb_typeof(q.options)='array'
      and jsonb_array_length(q.options)=4
      and q.is_active
      and q.pool_scope='global'
      and q.content_origin='brain_heist'
      and q.verification_status='verified'
      and q.analytics_eligible
      and q.is_public
      and q.owner_school_id is null
      and q.current_content_hash=q.verified_content_hash
      and (
        select count(*)
        from jsonb_array_elements_text(q.options) option_value(value)
        where lower(trim(option_value.value))=lower(trim(q.correct_answer))
      )=1
      and private.verified_question_has_curriculum_mapping(
        q.id,p_school_id,p_academic_year_id,p_grade_level,p_academic_subject_id
      )
  ),
  skill_rounds as (
    select
      candidate.*,
      row_number() over(
        partition by candidate.difficulty,candidate.skill_key
        order by candidate.recently_used,
          md5(p_seed||':skill:'||candidate.id::text)
      ) as skill_round
    from candidates candidate
  ),
  difficulty_ranked as (
    select
      skill_rounds.*,
      row_number() over(
        partition by skill_rounds.difficulty
        order by skill_rounds.recently_used,
          skill_rounds.skill_round,
          md5(p_seed||':pick:'||skill_rounds.id::text)
      ) as difficulty_rank
    from skill_rounds
  ),
  selected as (
    select ranked.id
    from difficulty_ranked ranked
    join targets target on target.difficulty=ranked.difficulty
    where ranked.difficulty_rank <= target.target_count
  )
  select
    coalesce(
      array_agg(selected.id order by md5(p_seed||':order:'||selected.id::text)),
      '{}'::uuid[]
    ),
    count(*)::integer
  into v_selected,v_selected_count
  from selected;

  if v_selected_count <> v_preset.question_count then
    raise exception using errcode='23514',
      message='dynamic_diagnostic_pool_insufficient',
      detail='preset='||v_preset.preset_key||
        '; expected='||v_preset.question_count::text||
        '; selected='||v_selected_count::text;
  end if;

  return v_selected;
end;
$$;

revoke all on function private.select_dynamic_registry_diagnostic_questions(
  uuid,uuid,uuid,uuid,text,uuid,text
) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Teacher preview for English/ESL dynamic diagnostics
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_english_diagnostic_launcher(
  p_school_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_group record;
  v_registry public.academic_skill_registry_versions%rowtype;
  v_student_count integer:=0;
  v_presets jsonb:='[]'::jsonb;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select *
  into v_group
  from private.teacher_current_teaching_groups(v_actor,p_school_id) group_row
  where group_row.group_id=p_group_id
    and group_row.can_create
  limit 1;

  if not found then
    raise exception using errcode='42501',message='teaching_group_create_access_required';
  end if;

  if lower(coalesce(v_group.academic_subject_code,'')) <> 'english' then
    raise exception using errcode='22023',message='english_teaching_group_required';
  end if;

  select registry.*
  into v_registry
  from public.academic_skill_registry_versions registry
  where registry.code='bh-english-core-v1'
    and registry.subject_key='english'
    and registry.status='published'
  order by registry.effective_from desc nulls last,registry.created_at desc
  limit 1;

  if not found then
    raise exception using errcode='22023',message='published_english_registry_required';
  end if;

  select count(*)::integer
  into v_student_count
  from private.subject_group_roster(p_group_id);

  with available_presets as (
    select preset.*
    from public.registry_diagnostic_presets preset
    where preset.registry_version_id=v_registry.id
      and preset.academic_subject_id=v_group.academic_subject_id
      and preset.status='active'
      and preset.selection_mode='dynamic'
      and preset.preset_key like 'english-core-%'
      and v_group.grade_level~'^[0-9]+$'
      and v_group.grade_level::smallint=any(preset.eligible_grade_levels)
  ),
  payloads as (
    select
      preset.sort_order,
      jsonb_build_object(
        'key',preset.preset_key,
        'name',preset.name,
        'shortName',preset.short_name,
        'description',preset.description,
        'questionCount',preset.question_count,
        'estimatedMinutes',preset.estimated_minutes,
        'assignmentCategory',preset.assignment_category,
        'recommended',preset.recommended,
        'freshForm',true,
        'coverageNote',preset.selection_config->>'coverageNote',
        'notDirectlyAssessed',coalesce(
          preset.selection_config->'notDirectlyAssessed','[]'::jsonb
        ),
        'difficultyBreakdown',coalesce((
          select jsonb_agg(
            jsonb_build_object('level',difficulty,'count',target_count)
            order by case difficulty when 'easy' then 1 when 'medium' then 2 else 3 end
          )
          from (
            select key as difficulty,value::integer as target_count
            from jsonb_each_text(preset.selection_config->'difficultyTargets')
          ) difficulty_targets
        ),'[]'::jsonb),
        'answerBalance',jsonb_build_object(
          'enabled',true,
          'maxPositionSpread',1,
          'maxConsecutiveSamePosition',2
        )
      ) as payload
    from available_presets preset
  )
  select coalesce(jsonb_agg(payload order by sort_order),'[]'::jsonb)
  into v_presets
  from payloads;

  return jsonb_build_object(
    'success',true,
    'group',jsonb_build_object(
      'id',v_group.group_id,
      'name',v_group.group_name,
      'gradeLevel',v_group.grade_level,
      'studentCount',v_student_count,
      'schoolSubjectId',v_group.school_subject_id,
      'schoolSubjectName',v_group.school_subject_name,
      'academicSubjectId',v_group.academic_subject_id,
      'academicSubjectCode',v_group.academic_subject_code,
      'academicSubjectName',v_group.academic_subject_name,
      'academicYearId',v_group.academic_year_id
    ),
    'registry',jsonb_build_object(
      'id',v_registry.id,
      'code',v_registry.code,
      'subjectKey',v_registry.subject_key,
      'title',v_registry.title
    ),
    'presets',v_presets,
    'evidenceContract',jsonb_build_object(
      'brainsHeistVerifiedOnly',true,
      'independentAssessment',true,
      'targetedPractice',false,
      'completionCreatesGovernedLongitudinalEvidence',true,
      'languageUseDiagnostic',true,
      'speakingDirectlyAssessed',false,
      'listeningDirectlyAssessed',false,
      'extendedWritingDirectlyAssessed',false
    )
  );
end;
$$;

revoke all on function public.rpc_teacher_english_diagnostic_launcher(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_english_diagnostic_launcher(uuid,uuid)
to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4. Shared diagnostic creation: fixed presets + dynamic fresh forms
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_create_registry_diagnostic(
  p_school_id uuid,
  p_group_id uuid,
  p_preset_key text,
  p_title text default null,
  p_publish_status text default 'published',
  p_assigned_at timestamptz default null,
  p_due_at timestamptz default null,
  p_notify_students_by_email boolean default false,
  p_close_submissions_after_due boolean default true,
  p_client_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_group record;
  v_registry public.academic_skill_registry_versions%rowtype;
  v_preset public.registry_diagnostic_presets%rowtype;
  v_teacher_id uuid;
  v_student_ids uuid[];
  v_question_ids uuid[];
  v_student_count integer:=0;
  v_question_count integer:=0;
  v_assignment public.assignments%rowtype;
  v_title text;
  v_assigned_at timestamptz;
  v_question_id uuid;
  v_form_seed text;
  v_topic_name text;
  v_instructions text;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  if p_publish_status not in ('draft','scheduled','published') then
    raise exception using errcode='22023',message='invalid_diagnostic_publish_status';
  end if;

  select *
  into v_group
  from private.teacher_current_teaching_groups(v_actor,p_school_id) group_row
  where group_row.group_id=p_group_id
    and group_row.can_create
  limit 1;

  if not found then
    raise exception using errcode='42501',message='teaching_group_create_access_required';
  end if;

  if v_group.academic_subject_id is null
     or nullif(trim(coalesce(v_group.academic_subject_code,'')),'') is null then
    raise exception using errcode='22023',message='teaching_group_academic_subject_required';
  end if;

  select registry.*
  into v_registry
  from public.academic_skill_registry_versions registry
  where registry.subject_key=v_group.academic_subject_code
    and registry.status='published'
  order by registry.effective_from desc nulls last,registry.created_at desc
  limit 1;

  if not found then
    raise exception using errcode='22023',message='published_registry_required_for_diagnostic';
  end if;

  select *
  into v_preset
  from public.registry_diagnostic_presets preset
  where preset.preset_key=trim(coalesce(p_preset_key,''))
    and preset.registry_version_id=v_registry.id
    and preset.academic_subject_id=v_group.academic_subject_id
    and preset.status='active'
    and v_group.grade_level~'^[0-9]+$'
    and v_group.grade_level::smallint=any(preset.eligible_grade_levels)
  limit 1;

  if not found then
    raise exception using errcode='22023',message='diagnostic_preset_not_available_for_group';
  end if;

  select teacher.id
  into v_teacher_id
  from public.teachers teacher
  where teacher.user_id=v_actor
  limit 1;

  if v_teacher_id is null then
    raise exception using errcode='42501',message='teacher_profile_required';
  end if;

  select
    coalesce(array_agg(roster.student_id order by roster.student_id),'{}'::uuid[]),
    count(*)::integer
  into v_student_ids,v_student_count
  from private.teacher_group_authorized_students(v_actor,p_group_id,null) roster;

  if v_student_count=0 then
    raise exception using errcode='22023',message='teaching_group_has_no_assignable_students';
  end if;

  if v_preset.selection_mode='dynamic' then
    v_form_seed:=extensions.gen_random_uuid()::text;
    v_question_ids:=private.select_dynamic_registry_diagnostic_questions(
      v_preset.id,
      p_school_id,
      p_group_id,
      v_group.academic_year_id,
      v_group.grade_level,
      v_group.academic_subject_id,
      v_form_seed
    );
    v_question_count:=cardinality(v_question_ids);
  else
    select
      coalesce(array_agg(item.question_id order by item.order_index),'{}'::uuid[]),
      count(*)::integer
    into v_question_ids,v_question_count
    from public.registry_diagnostic_preset_items item
    where item.preset_id=v_preset.id;
  end if;

  if v_question_count<>v_preset.question_count then
    raise exception using errcode='23514',message='diagnostic_preset_question_count_mismatch';
  end if;

  foreach v_question_id in array v_question_ids loop
    if not private.verified_question_has_curriculum_mapping(
      v_question_id,
      p_school_id,
      v_group.academic_year_id,
      v_group.grade_level,
      v_group.academic_subject_id
    ) then
      raise exception using errcode='23514',
        message='diagnostic_question_is_not_current_governed_evidence',
        detail='question_id='||v_question_id::text;
    end if;

    if v_preset.programme_code is not null and not exists(
      select 1
      from public.questions question
      join public.verified_question_assessment_profiles profile
        on profile.question_id=question.id
       and profile.question_content_hash=question.verified_content_hash
       and profile.status='active'
      where question.id=v_question_id
        and profile.programme_code=v_preset.programme_code
        and (v_preset.paper_component is null or profile.paper_component=v_preset.paper_component)
        and (v_preset.source_version is null or profile.source_version=v_preset.source_version)
    ) then
      raise exception using errcode='23514',
        message='diagnostic_question_assessment_profile_missing',
        detail='question_id='||v_question_id::text;
    end if;
  end loop;

  v_title:=coalesce(
    nullif(trim(coalesce(p_title,'')),''),
    v_preset.name||' · '||v_group.group_name
  );
  v_assigned_at:=coalesce(p_assigned_at,now());

  if lower(v_group.academic_subject_code)='economics' then
    v_topic_name:='Cambridge IGCSE Economics 0455 · Paper 1';
    v_instructions:='Complete this independently. Your responses create governed evidence for Curriculum Intelligence and Paper Readiness; they are not a predicted exam grade.';
  elsif lower(v_group.academic_subject_code)='english' then
    v_topic_name:='English independent diagnostic';
    v_instructions:='Complete this independently. Your responses create governed evidence for Curriculum Intelligence. This language-use diagnostic does not by itself directly assess speaking, listening or extended writing.';
  else
    v_topic_name:=v_group.school_subject_name||' independent diagnostic';
    v_instructions:='Complete this independently. Your responses create governed evidence for Curriculum Intelligence.';
  end if;

  select *
  into v_assignment
  from public.rpc_create_assignment(
    v_teacher_id,
    v_group.academic_subject_code,
    v_group.school_subject_name,
    v_topic_name,
    null,
    v_question_ids,
    v_assigned_at,
    p_due_at,
    v_title,
    v_instructions,
    null,
    v_preset.assignment_category,
    coalesce(nullif(trim(p_client_timezone),''),'UTC'),
    'custom',
    v_student_ids,
    'Brains Heist Verified independent diagnostic · '||v_preset.name,
    p_publish_status,
    coalesce(p_close_submissions_after_due,true),
    coalesce(p_notify_students_by_email,false)
  );

  perform public.rpc_teacher_attach_assignment_group(
    v_assignment.id,p_school_id,p_group_id
  );

  perform private.assert_assignment_mcq_answer_balance(v_assignment.id);

  -- Force the deferred verified-evidence guards inside this atomic RPC so a
  -- stale question, grade mismatch or missing mapping cannot escape to commit.
  set constraints all immediate;

  if exists(
    select 1
    from public.student_learning_intervention_practice_assignments practice
    where practice.assignment_id=v_assignment.id
  ) then
    raise exception using errcode='23514',
      message='independent_diagnostic_cannot_be_intervention_practice';
  end if;

  return jsonb_build_object(
    'success',true,
    'assignmentId',v_assignment.id,
    'title',v_title,
    'publishStatus',p_publish_status,
    'presetKey',v_preset.preset_key,
    'presetName',v_preset.name,
    'questionCount',v_question_count,
    'studentCount',v_student_count,
    'groupId',p_group_id,
    'evidencePurpose','independent_assessment',
    'targetedPractice',false,
    'freshForm',v_preset.selection_mode='dynamic',
    'answerPositionBalanced',true
  );
end;
$function$;

revoke all on function public.rpc_teacher_create_registry_diagnostic(
  uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,boolean,text
) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_create_registry_diagnostic(
  uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,boolean,text
) to authenticated,service_role;

comment on function private.balance_assignment_question_options() is
  'Deterministically reorders MCQ options only inside a newly inserted immutable assignment snapshot so answer positions stay balanced without changing canonical verified question content.';

comment on function public.rpc_teacher_english_diagnostic_launcher(uuid,uuid) is
  'Teacher-authorized preview of fresh-form English language-use diagnostics for an English/ESL teaching group.';

-- ---------------------------------------------------------------------------
-- 5. Migration invariants
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_english_id uuid;
  v_registry_id uuid;
  v_preset record;
  v_targets integer;
begin
  select id into v_english_id
  from public.academic_subjects
  where code='english' and is_active;

  select id into v_registry_id
  from public.academic_skill_registry_versions
  where code='bh-english-core-v1' and status='published';

  if v_english_id is null or v_registry_id is null then
    raise exception 'english_registry_context_missing';
  end if;

  if (
    select count(*)
    from public.registry_diagnostic_presets
    where status='active'
      and selection_mode='dynamic'
      and preset_key in (
        'english-core-quick-20',
        'english-core-diagnostic-30',
        'english-core-deep-40'
      )
  )<>3 then
    raise exception 'english_dynamic_diagnostic_presets_incomplete';
  end if;

  for v_preset in
    select *
    from public.registry_diagnostic_presets
    where preset_key in (
      'english-core-quick-20',
      'english-core-diagnostic-30',
      'english-core-deep-40'
    )
  loop
    select coalesce(sum(value::integer),0)::integer
    into v_targets
    from jsonb_each_text(v_preset.selection_config->'difficultyTargets');

    if v_targets<>v_preset.question_count then
      raise exception 'english_dynamic_diagnostic_target_mismatch:%',v_preset.preset_key;
    end if;
  end loop;

  if not exists(
    select 1
    from public.questions q
    where q.academic_subject_id=v_english_id
      and 8=any(q.eligible_grade_levels)
      and q.question_type='multiple_choice'
      and jsonb_typeof(q.options)='array'
      and jsonb_array_length(q.options)=4
      and q.is_active
      and q.pool_scope='global'
      and q.content_origin='brain_heist'
      and q.verification_status='verified'
      and q.analytics_eligible
      and q.current_content_hash=q.verified_content_hash
  ) then
    raise exception 'english_verified_mcq_pool_missing';
  end if;
end;
$migration$;
