-- Universal governed diagnostic composer + deterministic MCQ presentation balance.
-- Historical assignment snapshots are intentionally untouched.
-- The composer prepares question IDs only; the existing Assignment Wizard remains
-- the single teacher review and assignment publication workflow.

-- ---------------------------------------------------------------------------
-- 1. Deterministic option balance for newly materialized assignment snapshots
-- ---------------------------------------------------------------------------
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

  -- Preserve rare legacy explanations that explicitly name an answer letter.
  if coalesce(v_snapshot->>'explanation','') ~* '\m(option|answer)\s+[A-D]\M' then
    return new;
  end if;

  v_options := v_snapshot->'options';
  if jsonb_typeof(v_options) <> 'array' then return new; end if;

  v_option_count := jsonb_array_length(v_options);
  if v_option_count < 2 or v_option_count > 6 then return new; end if;

  v_correct := trim(coalesce(v_snapshot->>'correct_answer',''));
  if v_correct = '' then return new; end if;

  select count(*)::integer, min((entry.ordinality - 1)::integer)
  into v_match_count, v_current_index
  from jsonb_array_elements_text(v_options) with ordinality entry(value, ordinality)
  where lower(trim(entry.value)) = lower(v_correct);

  if v_match_count <> 1 or v_current_index is null then return new; end if;

  -- Each complete block uses every position exactly once. A partial final block
  -- therefore keeps the full assignment spread at <= 1, and block boundaries
  -- can create at most two identical positions consecutively.
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

  if v_target_index is null or v_target_index = v_current_index then return new; end if;

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

  new.question_snapshot := jsonb_set(v_snapshot,'{options}',v_balanced_options,false);
  return new;
end;
$$;

revoke all on function private.balance_assignment_question_options()
from public,anon,authenticated,service_role;

drop trigger if exists trg_zzz_assignment_question_option_balance
  on public.assignment_questions;
create trigger trg_zzz_assignment_question_option_balance
before insert on public.assignment_questions
for each row execute function private.balance_assignment_question_options();

-- ---------------------------------------------------------------------------
-- 2. Shared governed diagnostic pool
-- ---------------------------------------------------------------------------
create or replace function private.teacher_diagnostic_candidate_pool(
  p_actor uuid,
  p_school_id uuid,
  p_group_id uuid
)
returns table(
  question_id uuid,
  difficulty text,
  skill_key text,
  recently_used boolean
)
language sql
stable
security definer
set search_path=''
as $$
  with group_context as (
    select *
    from private.teacher_current_teaching_groups(p_actor,p_school_id) group_row
    where group_row.group_id=p_group_id
      and group_row.can_create
    limit 1
  )
  select
    q.id,
    q.difficulty,
    coalesce(
      nullif(trim(q.curriculum_subskill),''),
      nullif(trim(q.curriculum_skill),''),
      nullif(trim(q.curriculum_strand),''),
      nullif(trim(q.topic_name),''),
      nullif(trim(q.topic),''),
      q.id::text
    ) as skill_key,
    exists(
      select 1
      from public.assignments previous_assignment
      join public.assignment_questions previous_question
        on previous_question.assignment_id=previous_assignment.id
       and previous_question.question_id=q.id
      where previous_assignment.subject_group_id=gc.group_id
        and previous_assignment.created_at >= now()-interval '90 days'
    ) as recently_used
  from group_context gc
  join public.questions q
    on q.academic_subject_id=gc.academic_subject_id
  where gc.grade_level~'^[0-9]+$'
    and gc.academic_year_id is not null
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
    and gc.grade_level::smallint=any(q.eligible_grade_levels)
    and coalesce(q.explanation,'') !~* '\m(option|answer)\s+[A-D]\M'
    and (
      select count(*)
      from jsonb_array_elements_text(q.options) option_value(value)
      where lower(trim(option_value.value))=lower(trim(q.correct_answer))
    )=1
    and private.verified_question_has_curriculum_mapping(
      q.id,
      p_school_id,
      gc.academic_year_id,
      gc.grade_level,
      gc.academic_subject_id
    );
$$;

revoke all on function private.teacher_diagnostic_candidate_pool(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

create or replace function private.select_teacher_diagnostic_questions(
  p_actor uuid,
  p_school_id uuid,
  p_group_id uuid,
  p_question_count integer,
  p_seed text
)
returns uuid[]
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_selected uuid[];
  v_selected_count integer;
begin
  if p_question_count not in (10,20,30,40) then
    raise exception using errcode='22023',message='unsupported_diagnostic_question_count';
  end if;

  with candidates as (
    select *
    from private.teacher_diagnostic_candidate_pool(p_actor,p_school_id,p_group_id)
  ),
  skill_rounds as (
    select
      candidate.*,
      row_number() over(
        partition by candidate.skill_key
        order by candidate.recently_used,
          md5(p_seed||':skill:'||candidate.question_id::text)
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
          md5(p_seed||':difficulty:'||skill_rounds.question_id::text)
      ) as difficulty_rank,
      case skill_rounds.difficulty
        when 'medium' then 0.60
        when 'easy' then 0.20
        when 'hard' then 0.20
        else 0.10
      end as difficulty_weight
    from skill_rounds
  ),
  chosen as (
    select ranked.question_id
    from difficulty_ranked ranked
    order by
      ranked.recently_used,
      ranked.skill_round,
      ranked.difficulty_rank / greatest(ranked.difficulty_weight,0.01),
      md5(p_seed||':pick:'||ranked.question_id::text)
    limit p_question_count
  )
  select
    coalesce(array_agg(question_id order by md5(p_seed||':order:'||question_id::text)),'{}'::uuid[]),
    count(*)::integer
  into v_selected,v_selected_count
  from chosen;

  if v_selected_count<>p_question_count then
    raise exception using errcode='23514',
      message='diagnostic_pool_insufficient',
      detail='requested='||p_question_count::text||'; available='||v_selected_count::text;
  end if;

  return v_selected;
end;
$$;

revoke all on function private.select_teacher_diagnostic_questions(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Universal composer capability preview
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_diagnostic_composer(
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
  v_pool_size integer:=0;
  v_recent_available integer:=0;
  v_skill_count integer:=0;
  v_difficulty jsonb:='[]'::jsonb;
  v_depths jsonb:='[]'::jsonb;
  v_recommended integer:=0;
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

  if v_group.academic_subject_id is null
     or v_group.academic_year_id is null
     or v_group.grade_level !~ '^[0-9]+$' then
    return jsonb_build_object(
      'success',true,
      'ready',false,
      'reason','academic_context_incomplete',
      'group',jsonb_build_object(
        'id',v_group.group_id,'name',v_group.group_name,
        'gradeLevel',v_group.grade_level,
        'schoolSubjectName',v_group.school_subject_name,
        'academicSubjectName',v_group.academic_subject_name,
        'academicSubjectCode',v_group.academic_subject_code,
        'studentCount',v_group.student_count
      ),
      'depths','[]'::jsonb
    );
  end if;

  with pool as (
    select * from private.teacher_diagnostic_candidate_pool(v_actor,p_school_id,p_group_id)
  )
  select
    count(*)::integer,
    count(*) filter(where not recently_used)::integer,
    count(distinct skill_key)::integer,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('level',difficulty,'count',question_count)
        order by case difficulty when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end,difficulty
      )
      from (
        select difficulty,count(*)::integer question_count
        from pool
        group by difficulty
      ) d
    ),'[]'::jsonb)
  into v_pool_size,v_recent_available,v_skill_count,v_difficulty
  from pool;

  v_recommended:=case
    when v_pool_size>=30 then 30
    when v_pool_size>=20 then 20
    when v_pool_size>=10 then 10
    else 0
  end;

  with depths(question_count,short_name,name,estimated_minutes,description,sort_order) as (values
    (10,'Quick Check','Quick Diagnostic',10,'A compact baseline when you need a fast check before planning.',10),
    (20,'Focused','Focused Diagnostic',20,'A broader snapshot with stronger skill coverage while staying classroom-friendly.',20),
    (30,'Recommended','Diagnostic',30,'The recommended balance of breadth, depth and completion time for most classes.',30),
    (40,'Deep','Deep Diagnostic',40,'Maximum evidence depth when the governed bank is large enough for the group.',40)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'questionCount',depth.question_count,
      'shortName',depth.short_name,
      'name',depth.name,
      'estimatedMinutes',depth.estimated_minutes,
      'description',depth.description,
      'recommended',depth.question_count=v_recommended,
      'available',v_pool_size>=depth.question_count
    )
    order by depth.sort_order
  ),'[]'::jsonb)
  into v_depths
  from depths depth
  where v_pool_size>=depth.question_count;

  return jsonb_build_object(
    'success',true,
    'ready',v_pool_size>=10,
    'reason',case when v_pool_size>=10 then null else 'governed_pool_too_small' end,
    'group',jsonb_build_object(
      'id',v_group.group_id,
      'name',v_group.group_name,
      'gradeLevel',v_group.grade_level,
      'studentCount',v_group.student_count,
      'schoolSubjectId',v_group.school_subject_id,
      'schoolSubjectName',v_group.school_subject_name,
      'academicSubjectId',v_group.academic_subject_id,
      'academicSubjectCode',v_group.academic_subject_code,
      'academicSubjectName',v_group.academic_subject_name,
      'academicYearId',v_group.academic_year_id
    ),
    'pool',jsonb_build_object(
      'eligibleQuestions',v_pool_size,
      'notRecentlyUsed',v_recent_available,
      'distinctSkills',v_skill_count,
      'difficultyBreakdown',v_difficulty,
      'recentLookbackDays',90
    ),
    'depths',v_depths,
    'qualityContract',jsonb_build_object(
      'brainsHeistVerifiedOnly',true,
      'gradeEligibleOnly',true,
      'curriculumMappedOnly',true,
      'fourOptionMcqOnly',true,
      'recentQuestionsDeprioritized',true,
      'skillDiversityPrioritized',true,
      'balancedAnswerPositionsOnAssignmentSnapshot',true,
      'canonicalQuestionContentUnchanged',true
    )
  );
end;
$$;

revoke all on function public.rpc_teacher_diagnostic_composer(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_diagnostic_composer(uuid,uuid)
to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4. Prepare a fresh form for the existing Assignment Wizard
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_compose_diagnostic(
  p_school_id uuid,
  p_group_id uuid,
  p_question_count integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_group record;
  v_question_ids uuid[];
  v_seed text;
  v_count integer;
  v_recent_repeats integer;
  v_skill_count integer;
  v_difficulty jsonb;
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

  if p_question_count not in (10,20,30,40) then
    raise exception using errcode='22023',message='unsupported_diagnostic_question_count';
  end if;

  v_seed:=extensions.gen_random_uuid()::text;
  v_question_ids:=private.select_teacher_diagnostic_questions(
    v_actor,p_school_id,p_group_id,p_question_count,v_seed
  );
  v_count:=cardinality(v_question_ids);

  with selected as (
    select pool.*
    from private.teacher_diagnostic_candidate_pool(v_actor,p_school_id,p_group_id) pool
    where pool.question_id=any(v_question_ids)
  )
  select
    count(*) filter(where recently_used)::integer,
    count(distinct skill_key)::integer,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('level',difficulty,'count',question_count)
        order by case difficulty when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end,difficulty
      )
      from (
        select difficulty,count(*)::integer question_count
        from selected
        group by difficulty
      ) d
    ),'[]'::jsonb)
  into v_recent_repeats,v_skill_count,v_difficulty
  from selected;

  return jsonb_build_object(
    'success',true,
    'groupId',v_group.group_id,
    'groupName',v_group.group_name,
    'gradeLevel',v_group.grade_level,
    'studentCount',v_group.student_count,
    'schoolSubjectId',v_group.school_subject_id,
    'schoolSubjectName',v_group.school_subject_name,
    'academicSubjectId',v_group.academic_subject_id,
    'academicSubjectCode',v_group.academic_subject_code,
    'academicSubjectName',v_group.academic_subject_name,
    'questionIds',to_jsonb(v_question_ids),
    'questionCount',v_count,
    'distinctSkills',v_skill_count,
    'recentRepeatCount',v_recent_repeats,
    'difficultyBreakdown',v_difficulty,
    'defaultTitle',v_group.school_subject_name||' Diagnostic · '||v_group.group_name,
    'defaultDescription','Independent diagnostic prepared from the Brains Heist Verified question bank for this exact teaching group.',
    'defaultInstructions','Complete this independently. Read every option carefully and answer every question. Your teacher will use the results alongside other evidence to plan what to teach next.',
    'assignmentCategory','quiz',
    'topicName','Quick diagnostic',
    'quality',jsonb_build_object(
      'freshForm',true,
      'recentLookbackDays',90,
      'verifiedOnly',true,
      'curriculumMappedOnly',true,
      'balancedAnswerPositionsOnSave',true,
      'canonicalContentUnchanged',true
    )
  );
end;
$$;

revoke all on function public.rpc_teacher_compose_diagnostic(uuid,uuid,integer)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_compose_diagnostic(uuid,uuid,integer)
to authenticated,service_role;

comment on function public.rpc_teacher_diagnostic_composer(uuid,uuid) is
  'Teacher-authorized capability preview for a universal governed diagnostic composer; returns no answer keys.';

comment on function public.rpc_teacher_compose_diagnostic(uuid,uuid,integer) is
  'Teacher-authorized fresh diagnostic form preparation for the existing Assignment Wizard; returns governed question IDs and quality metadata but does not create an assignment.';

comment on function private.balance_assignment_question_options() is
  'Deterministically reorders MCQ options only inside newly materialized immutable assignment snapshots; canonical verified question content and hashes are unchanged.';
