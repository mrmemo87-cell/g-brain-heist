-- Governed registry diagnostic launcher.
-- Generic preset/read APIs with Economics 0455 as the first production implementation.

-- ---------------------------------------------------------------------------
-- 1. Complete Economics academic-subject resolution
-- ---------------------------------------------------------------------------
with economics as (
  select id
  from public.academic_subjects
  where code='economics' and is_active
)
insert into public.academic_subject_aliases(
  academic_subject_id,school_id,alias,alias_key
)
select economics.id,null,seed.alias,seed.alias_key
from economics
cross join (values
  ('Economics','economics'),
  ('Economic Studies','economic-studies'),
  ('IGCSE Economics','igcse-economics')
) as seed(alias,alias_key)
on conflict(alias_key) where school_id is null
do update set
  academic_subject_id=excluded.academic_subject_id,
  alias=excluded.alias;

-- ---------------------------------------------------------------------------
-- 2. Registry-native questions are valid governed curriculum evidence
--    alongside the existing framework-objective mapping lane.
-- ---------------------------------------------------------------------------
create or replace function private.verified_question_has_curriculum_mapping(
  p_question_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    exists (
      select 1
      from public.questions q
      join public.curriculum_assessment_items i
        on i.source_type='question_bank'
       and i.source_record_id=q.id::text
       and i.source_item_key='question'
       and i.is_active
       and i.content_hash=q.verified_content_hash
       and (
         (q.pool_scope='global' and i.school_id is null)
         or (q.pool_scope='school' and i.school_id=q.owner_school_id)
       )
      join public.school_curriculum_scope_mappings scm
        on scm.school_id=p_school_id
       and (p_academic_year_id is null or scm.academic_year_id=p_academic_year_id)
       and scm.grade_level=p_grade_level
       and scm.academic_subject_id=p_academic_subject_id
       and scm.status='active'
      join public.curriculum_item_objective_mappings im
        on im.assessment_item_id=i.id
       and im.curriculum_scope_id=scm.curriculum_scope_id
       and im.academic_subject_id=p_academic_subject_id
       and im.status='approved'
       and im.mapping_role='primary'
       and im.superseded_at is null
       and im.item_content_hash=i.content_hash
      join public.curriculum_framework_versions fv
        on fv.id=im.framework_version_id
       and fv.status in ('published','retired')
       and fv.content_hash=im.curriculum_version_content_hash
      where q.id=p_question_id
        and q.verification_status='verified'
        and q.analytics_eligible
        and q.is_active
        and q.current_content_hash=q.verified_content_hash
        and q.academic_subject_id=p_academic_subject_id
        and p_grade_level~'^[0-9]+$'
        and p_grade_level::smallint=any(q.eligible_grade_levels)
        and (
          (q.pool_scope='global'
            and q.content_origin='brain_heist'
            and q.owner_school_id is null
            and q.is_public)
          or (q.pool_scope='school'
            and q.content_origin='teacher'
            and q.owner_school_id=p_school_id
            and not q.is_public)
        )
    )
    or
    exists (
      select 1
      from public.questions q
      join public.academic_subjects subject
        on subject.id=p_academic_subject_id
       and subject.is_active
      join public.verified_question_registry_taxonomy taxonomy
        on taxonomy.question_id=q.id
       and taxonomy.question_content_hash=q.verified_content_hash
       and taxonomy.review_status='approved'
       and not taxonomy.human_review_required
      join public.academic_skill_registry_versions registry
        on registry.id=taxonomy.registry_version_id
       and registry.status='published'
       and registry.subject_key=subject.code
      join public.academic_skill_registry_nodes skill
        on skill.id=taxonomy.primary_skill_node_id
       and skill.registry_version_id=registry.id
       and skill.node_type='skill'
       and skill.status='active'
      join public.academic_skill_registry_nodes subskill
        on subskill.id=taxonomy.atomic_subskill_node_id
       and subskill.registry_version_id=registry.id
       and subskill.parent_id=skill.id
       and subskill.node_type='subskill'
       and subskill.status='active'
      join public.academic_skill_evidence_focuses focus
        on focus.id=taxonomy.evidence_focus_id
       and focus.registry_version_id=registry.id
       and focus.atomic_subskill_node_id=subskill.id
       and focus.status='active'
      where q.id=p_question_id
        and q.verification_status='verified'
        and q.analytics_eligible
        and q.is_active
        and q.current_content_hash=q.verified_content_hash
        and q.academic_subject_id=p_academic_subject_id
        and p_grade_level~'^[0-9]+$'
        and p_grade_level::smallint=any(q.eligible_grade_levels)
        and (
          case
            when p_grade_level::integer between 1 and 6 then 'primary'
            when p_grade_level::integer between 7 and 9 then 'lower_secondary'
            when p_grade_level::integer between 10 and 12 then 'upper_secondary'
            else null
          end
        )=any(subskill.applicable_phases)
        and (
          (q.pool_scope='global'
            and q.content_origin='brain_heist'
            and q.owner_school_id is null
            and q.is_public)
          or (q.pool_scope='school'
            and q.content_origin='teacher'
            and q.owner_school_id=p_school_id
            and not q.is_public)
        )
    );
$function$;

revoke all on function private.verified_question_has_curriculum_mapping(
  uuid,uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Generic governed diagnostic preset model
-- ---------------------------------------------------------------------------
create table if not exists public.registry_diagnostic_presets(
  id uuid primary key default gen_random_uuid(),
  preset_key text not null unique,
  registry_version_id uuid not null
    references public.academic_skill_registry_versions(id) on delete restrict,
  academic_subject_id uuid not null
    references public.academic_subjects(id) on delete restrict,
  name text not null,
  short_name text not null,
  description text not null,
  question_count integer not null,
  estimated_minutes integer not null,
  assignment_category text not null default 'quiz',
  eligible_grade_levels smallint[] not null,
  programme_code text,
  paper_component text,
  source_version text,
  recommended boolean not null default false,
  sort_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registry_diagnostic_presets_key_check
    check(preset_key~'^[a-z0-9][a-z0-9._-]{2,119}$'),
  constraint registry_diagnostic_presets_name_check
    check(length(trim(name)) between 3 and 160),
  constraint registry_diagnostic_presets_short_name_check
    check(length(trim(short_name)) between 2 and 80),
  constraint registry_diagnostic_presets_description_check
    check(length(trim(description)) between 12 and 1000),
  constraint registry_diagnostic_presets_count_check
    check(question_count between 1 and 100),
  constraint registry_diagnostic_presets_minutes_check
    check(estimated_minutes between 1 and 240),
  constraint registry_diagnostic_presets_category_check
    check(assignment_category in ('classwork','homework','quiz')),
  constraint registry_diagnostic_presets_grades_check
    check(cardinality(eligible_grade_levels)>0),
  constraint registry_diagnostic_presets_status_check
    check(status in ('active','retired'))
);

create index if not exists idx_registry_diagnostic_presets_registry
  on public.registry_diagnostic_presets(
    registry_version_id,academic_subject_id,status,sort_order
  );

alter table public.registry_diagnostic_presets enable row level security;
revoke all on table public.registry_diagnostic_presets
from public,anon,authenticated;
grant select,insert,update on table public.registry_diagnostic_presets
to service_role;

create table if not exists public.registry_diagnostic_preset_items(
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null
    references public.registry_diagnostic_presets(id) on delete cascade,
  question_id uuid not null
    references public.questions(id) on delete restrict,
  order_index integer not null,
  created_at timestamptz not null default now(),
  constraint registry_diagnostic_preset_items_order_check
    check(order_index between 1 and 100),
  unique(preset_id,question_id),
  unique(preset_id,order_index)
);

create index if not exists idx_registry_diagnostic_preset_items_question
  on public.registry_diagnostic_preset_items(question_id);

alter table public.registry_diagnostic_preset_items enable row level security;
revoke all on table public.registry_diagnostic_preset_items
from public,anon,authenticated;
grant select,insert,update,delete on table public.registry_diagnostic_preset_items
to service_role;

-- ---------------------------------------------------------------------------
-- 4. Economics 0455 Paper 1 presets
-- ---------------------------------------------------------------------------
with context as (
  select
    registry.id as registry_version_id,
    subject.id as academic_subject_id
  from public.academic_skill_registry_versions registry
  join public.academic_subjects subject
    on subject.code=registry.subject_key and subject.is_active
  where registry.code='bh-economics-core-v1'
    and registry.status='published'
),
seed(
  preset_key,name,short_name,description,question_count,estimated_minutes,
  recommended,sort_order
) as (values
  (
    'economics-0455-p1-quick-10',
    'Paper 1 Quick Check',
    'Quick Check',
    'A fast 10-question independent baseline across the full Economics syllabus, balanced equally between Cambridge AO1 and AO2.',
    10,12,false,10
  ),
  (
    'economics-0455-p1-diagnostic-20',
    'Paper 1 Diagnostic',
    '20-question Diagnostic',
    'A balanced 20-question independent diagnostic designed to expose both content gaps and transferable Economics reasoning needs before reteaching.',
    20,25,true,20
  ),
  (
    'economics-0455-p1-full-40',
    'Full Paper 1 Readiness Check',
    'Full 40-question Check',
    'The complete 40-question Brains Heist Verified Paper 1 readiness check, covering all six Economics content areas with balanced AO1 and AO2 evidence.',
    40,55,false,30
  )
)
insert into public.registry_diagnostic_presets(
  preset_key,registry_version_id,academic_subject_id,
  name,short_name,description,question_count,estimated_minutes,
  assignment_category,eligible_grade_levels,
  programme_code,paper_component,source_version,
  recommended,sort_order,status
)
select
  seed.preset_key,context.registry_version_id,context.academic_subject_id,
  seed.name,seed.short_name,seed.description,seed.question_count,seed.estimated_minutes,
  'quiz',array[10,11]::smallint[],
  '0455','paper_1','2027-2029',
  seed.recommended,seed.sort_order,'active'
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
  updated_at=now();

delete from public.registry_diagnostic_preset_items item
using public.registry_diagnostic_presets preset
where item.preset_id=preset.id
  and preset.preset_key in (
    'economics-0455-p1-quick-10',
    'economics-0455-p1-diagnostic-20',
    'economics-0455-p1-full-40'
  );

with seed(preset_key,external_id,order_index) as (
  values
    -- Quick Check: 5 AO1 + 5 AO2, all six content areas.
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-001',1),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-003',2),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-006',3),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-013',4),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-018',5),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-021',6),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-025',7),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-027',8),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-032',9),
    ('economics-0455-p1-quick-10','bh-econ-0455-p1-v1-039',10),

    -- 20-question Diagnostic: Quick Check plus 10 additional balanced items.
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-001',1),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-003',2),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-006',3),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-013',4),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-018',5),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-021',6),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-025',7),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-027',8),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-032',9),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-039',10),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-002',11),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-008',12),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-014',13),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-017',14),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-022',15),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-024',16),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-029',17),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-034',18),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-037',19),
    ('economics-0455-p1-diagnostic-20','bh-econ-0455-p1-v1-040',20)
),
resolved as (
  select
    preset.id as preset_id,
    question.id as question_id,
    seed.order_index
  from seed
  join public.registry_diagnostic_presets preset
    on preset.preset_key=seed.preset_key
  join public.questions question
    on question.verified_external_id=seed.external_id
)
insert into public.registry_diagnostic_preset_items(
  preset_id,question_id,order_index
)
select preset_id,question_id,order_index
from resolved;

with full_preset as (
  select id
  from public.registry_diagnostic_presets
  where preset_key='economics-0455-p1-full-40'
)
insert into public.registry_diagnostic_preset_items(
  preset_id,question_id,order_index
)
select
  full_preset.id,
  question.id,
  row_number() over(order by question.verified_external_id)::integer
from full_preset
join public.questions question
  on question.verified_external_id like 'bh-econ-0455-p1-v1-%'
order by question.verified_external_id;

-- ---------------------------------------------------------------------------
-- 5. Teacher launcher blueprint
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_registry_diagnostic_launcher(
  p_school_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
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

  select count(*)::integer
  into v_student_count
  from private.subject_group_roster(p_group_id);

  with available_presets as (
    select preset.*
    from public.registry_diagnostic_presets preset
    where preset.registry_version_id=v_registry.id
      and preset.academic_subject_id=v_group.academic_subject_id
      and preset.status='active'
      and v_group.grade_level~'^[0-9]+$'
      and v_group.grade_level::smallint=any(preset.eligible_grade_levels)
  ),
  preset_payload as (
    select
      preset.id,
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
        'programmeCode',preset.programme_code,
        'paperComponent',preset.paper_component,
        'sourceVersion',preset.source_version,
        'aoBreakdown',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'code',profile.primary_assessment_objective,
              'count',profile_count
            )
            order by profile.primary_assessment_objective
          )
          from (
            select
              profile.primary_assessment_objective,
              count(distinct item.question_id)::integer as profile_count
            from public.registry_diagnostic_preset_items item
            join public.questions question on question.id=item.question_id
            join public.verified_question_assessment_profiles profile
              on profile.question_id=question.id
             and profile.question_content_hash=question.verified_content_hash
             and profile.status='active'
             and (preset.programme_code is null or profile.programme_code=preset.programme_code)
             and (preset.paper_component is null or profile.paper_component=preset.paper_component)
             and (preset.source_version is null or profile.source_version=preset.source_version)
            where item.preset_id=preset.id
            group by profile.primary_assessment_objective
          ) profile
        ),'[]'::jsonb),
        'contentCoverage',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'strandCode',coverage.strand_code,
              'strandName',coverage.strand_name,
              'externalLabel',coverage.external_label,
              'questionCount',coverage.question_count
            )
            order by coverage.external_reference_code,coverage.strand_code
          )
          from (
            select
              strand.code as strand_code,
              strand.name as strand_name,
              min(crosswalk.external_strand) as external_label,
              min(crosswalk.external_reference_code) as external_reference_code,
              count(distinct item.question_id)::integer as question_count
            from public.registry_diagnostic_preset_items item
            join public.questions question on question.id=item.question_id
            join public.verified_question_registry_taxonomy taxonomy
              on taxonomy.question_id=question.id
             and taxonomy.question_content_hash=question.verified_content_hash
             and taxonomy.registry_version_id=preset.registry_version_id
             and taxonomy.review_status='approved'
             and not taxonomy.human_review_required
            join public.academic_skill_registry_nodes skill
              on skill.id=taxonomy.primary_skill_node_id
             and skill.registry_version_id=preset.registry_version_id
             and skill.node_type='skill'
             and skill.status='active'
            join public.academic_skill_registry_nodes strand
              on strand.id=skill.parent_id
             and strand.registry_version_id=preset.registry_version_id
             and strand.node_type='strand'
             and strand.status='active'
            join public.academic_skill_framework_crosswalks crosswalk
              on crosswalk.node_id=strand.id
             and crosswalk.registry_version_id=preset.registry_version_id
             and crosswalk.status='active'
             and crosswalk.alignment_level='subject_content'
             and (preset.programme_code is null or crosswalk.programme_code=preset.programme_code)
             and (preset.source_version is null or crosswalk.source_version=preset.source_version)
            where item.preset_id=preset.id
            group by strand.code,strand.name
          ) coverage
        ),'[]'::jsonb),
        'difficultyBreakdown',coalesce((
          select jsonb_agg(
            jsonb_build_object('level',difficulty,'count',difficulty_count)
            order by case difficulty when 'easy' then 1 when 'medium' then 2 else 3 end
          )
          from (
            select
              question.difficulty,
              count(*)::integer as difficulty_count
            from public.registry_diagnostic_preset_items item
            join public.questions question on question.id=item.question_id
            where item.preset_id=preset.id
            group by question.difficulty
          ) difficulty
        ),'[]'::jsonb)
      ) as payload
    from available_presets preset
  )
  select coalesce(jsonb_agg(payload order by sort_order),'[]'::jsonb)
  into v_presets
  from preset_payload;

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
    'programme',jsonb_build_object(
      'providerName','Cambridge International Education',
      'programmeCode','0455',
      'sourceVersion','2027-2029',
      'paperComponent','paper_1'
    ),
    'presets',v_presets,
    'evidenceContract',jsonb_build_object(
      'brainsHeistVerifiedOnly',true,
      'independentAssessment',true,
      'targetedPractice',false,
      'completionCreatesGovernedLongitudinalEvidence',true,
      'gradePrediction',false
    )
  );
end;
$function$;

revoke all on function public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid)
to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 6. Atomic diagnostic creation through the established assignment authority
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

  select
    coalesce(array_agg(item.question_id order by item.order_index),'{}'::uuid[]),
    count(*)::integer
  into v_question_ids,v_question_count
  from public.registry_diagnostic_preset_items item
  where item.preset_id=v_preset.id;

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

  select *
  into v_assignment
  from public.rpc_create_assignment(
    v_teacher_id,
    v_group.academic_subject_code,
    v_group.school_subject_name,
    'Cambridge IGCSE Economics 0455 · Paper 1',
    null,
    v_question_ids,
    v_assigned_at,
    p_due_at,
    v_title,
    'Complete this independently. Your responses create governed evidence for Curriculum Intelligence and Paper Readiness; they are not a predicted exam grade.',
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
    'targetedPractice',false
  );
end;
$function$;

revoke all on function public.rpc_teacher_create_registry_diagnostic(
  uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,boolean,text
) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_create_registry_diagnostic(
  uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,boolean,text
) to authenticated,service_role;

comment on table public.registry_diagnostic_presets is
  'Governed teacher-launchable diagnostic blueprints backed by a published Academic Skill Registry and immutable verified question content.';

comment on table public.registry_diagnostic_preset_items is
  'Ordered immutable-question membership for governed registry diagnostic presets.';

comment on function public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid) is
  'Teacher-authorized preview of governed diagnostic presets with AO, curriculum-content and difficulty coverage; returns no answer keys.';

comment on function public.rpc_teacher_create_registry_diagnostic(
  uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,boolean,text
) is
  'Atomically publishes or saves a governed independent diagnostic to one authorized teaching group using the established assignment authority.';

-- ---------------------------------------------------------------------------
-- 7. Migration invariants
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_economics_id uuid;
  v_preset record;
  v_ao1 integer;
  v_ao2 integer;
  v_strands integer;
begin
  select id into v_economics_id
  from public.academic_subjects
  where code='economics' and is_active;

  if v_economics_id is null
     or public.academic_resolve_subject_id('Economics',null) is distinct from v_economics_id
     or public.academic_resolve_subject_id('Economic Studies',null) is distinct from v_economics_id
     or public.academic_resolve_subject_id('IGCSE Economics',null) is distinct from v_economics_id then
    raise exception 'economics_academic_alias_resolution_incomplete';
  end if;

  if (
    select count(*)
    from public.registry_diagnostic_presets
    where status='active'
      and preset_key in (
        'economics-0455-p1-quick-10',
        'economics-0455-p1-diagnostic-20',
        'economics-0455-p1-full-40'
      )
  )<>3 then
    raise exception 'economics_diagnostic_presets_incomplete';
  end if;

  for v_preset in
    select *
    from public.registry_diagnostic_presets
    where preset_key in (
      'economics-0455-p1-quick-10',
      'economics-0455-p1-diagnostic-20',
      'economics-0455-p1-full-40'
    )
  loop
    if (
      select count(*)
      from public.registry_diagnostic_preset_items item
      where item.preset_id=v_preset.id
    )<>v_preset.question_count then
      raise exception 'economics_diagnostic_preset_count_invalid preset=%',v_preset.preset_key;
    end if;

    select
      count(*) filter(where profile.primary_assessment_objective='AO1'),
      count(*) filter(where profile.primary_assessment_objective='AO2')
    into v_ao1,v_ao2
    from public.registry_diagnostic_preset_items item
    join public.questions question on question.id=item.question_id
    join public.verified_question_assessment_profiles profile
      on profile.question_id=question.id
     and profile.question_content_hash=question.verified_content_hash
     and profile.status='active'
     and profile.programme_code='0455'
     and profile.paper_component='paper_1'
     and profile.source_version='2027-2029'
    where item.preset_id=v_preset.id;

    if v_ao1<>v_preset.question_count/2
       or v_ao2<>v_preset.question_count/2 then
      raise exception 'economics_diagnostic_ao_balance_invalid preset=% ao1=% ao2=%',
        v_preset.preset_key,v_ao1,v_ao2;
    end if;

    select count(distinct strand.id)
    into v_strands
    from public.registry_diagnostic_preset_items item
    join public.questions question on question.id=item.question_id
    join public.verified_question_registry_taxonomy taxonomy
      on taxonomy.question_id=question.id
     and taxonomy.question_content_hash=question.verified_content_hash
     and taxonomy.review_status='approved'
     and not taxonomy.human_review_required
    join public.academic_skill_registry_nodes skill
      on skill.id=taxonomy.primary_skill_node_id and skill.status='active'
    join public.academic_skill_registry_nodes strand
      on strand.id=skill.parent_id
     and strand.node_type='strand'
     and strand.status='active'
    join public.academic_skill_framework_crosswalks crosswalk
      on crosswalk.node_id=strand.id
     and crosswalk.status='active'
     and crosswalk.alignment_level='subject_content'
     and crosswalk.programme_code='0455'
     and crosswalk.source_version='2027-2029'
    where item.preset_id=v_preset.id;

    if v_strands<>6 then
      raise exception 'economics_diagnostic_content_coverage_invalid preset=% strands=%',
        v_preset.preset_key,v_strands;
    end if;

    if exists(
      select 1
      from public.registry_diagnostic_preset_items item
      join public.questions question on question.id=item.question_id
      where item.preset_id=v_preset.id
        and (
          question.academic_subject_id is distinct from v_economics_id
          or question.verification_status<>'verified'
          or not question.analytics_eligible
          or not question.is_active
          or not question.is_public
          or question.pool_scope<>'global'
          or question.content_origin<>'brain_heist'
          or question.current_content_hash<>question.verified_content_hash
          or not (10::smallint=any(question.eligible_grade_levels))
        )
    ) then
      raise exception 'economics_diagnostic_question_authority_invalid preset=%',
        v_preset.preset_key;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.registry_diagnostic_presets','SELECT')
     or has_table_privilege('authenticated','public.registry_diagnostic_preset_items','SELECT') then
    raise exception 'registry_diagnostic_tables_exposed_to_authenticated';
  end if;

  if has_function_privilege(
       'public',
       'public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.rpc_teacher_registry_diagnostic_launcher(uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'registry_diagnostic_launcher_permissions_invalid';
  end if;
end;
$migration$;
