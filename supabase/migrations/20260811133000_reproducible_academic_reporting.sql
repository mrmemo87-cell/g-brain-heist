-- Phase 8: reproducible term and annual academic reporting.
--
-- Reports are immutable evidence snapshots. They never infer weakness from missing data,
-- mutate source observations, or expose professional notes through a family/student output.

create table public.academic_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_type text not null check (report_type in ('student','class','grade','subject','school')),
  audience text not null check (audience in ('student','family','teacher','school_head','internal')),
  status text not null default 'draft' check (status in ('draft','final')),
  report_version integer not null check (report_version > 0),
  supersedes_report_id uuid references public.academic_report_snapshots(id) on delete restrict,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  academic_term_id uuid references public.school_academic_terms(id) on delete restrict,
  student_id uuid references public.users(id) on delete restrict,
  class_id uuid references public.classes(id) on delete restrict,
  grade_level text,
  academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  scope_key text not null,
  period_start date not null,
  period_end date not null,
  evidence_cutoff_at timestamptz not null,
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  report_payload jsonb not null check (jsonb_typeof(report_payload) = 'object'),
  generated_by uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  finalized_by uuid references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  unique (school_id, scope_key, audience, report_version),
  check (period_end >= period_start),
  check (evidence_cutoff_at >= period_start::timestamptz),
  check ((status = 'final') = (finalized_by is not null and finalized_at is not null)),
  check (
    (report_type = 'student' and student_id is not null and class_id is null and grade_level is null)
    or (report_type = 'class' and student_id is null and class_id is not null and grade_level is null)
    or (report_type = 'grade' and student_id is null and class_id is null and nullif(trim(grade_level), '') is not null)
    or (report_type = 'subject' and student_id is null and class_id is null and grade_level is null and academic_subject_id is not null)
    or (report_type = 'school' and student_id is null and class_id is null and grade_level is null)
  ),
  check (audience not in ('student','family') or report_type = 'student')
);

create table public.academic_report_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.academic_report_snapshots(id) on delete cascade,
  source_type text not null check (source_type in (
    'observation','confidence_projection','coverage_projection','intervention'
  )),
  source_id uuid not null,
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  unique (report_id, source_type, source_id)
);

create table public.academic_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.academic_report_snapshots(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('generated','reused','finalized')),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now()
);

create index academic_report_snapshots_school_period_idx
  on public.academic_report_snapshots(school_id, academic_year_id, academic_term_id, generated_at desc);
create index academic_report_snapshots_student_idx
  on public.academic_report_snapshots(student_id, academic_year_id, generated_at desc)
  where student_id is not null;
create index academic_report_snapshots_class_idx
  on public.academic_report_snapshots(class_id, academic_year_id, generated_at desc)
  where class_id is not null;
create index academic_report_snapshots_subject_idx
  on public.academic_report_snapshots(academic_subject_id, academic_year_id, generated_at desc)
  where academic_subject_id is not null;
create index academic_report_snapshots_final_idx
  on public.academic_report_snapshots(school_id, audience, finalized_at desc)
  where status = 'final';
create index academic_report_snapshots_supersedes_idx
  on public.academic_report_snapshots(supersedes_report_id)
  where supersedes_report_id is not null;
create index academic_report_snapshots_generated_by_idx
  on public.academic_report_snapshots(generated_by, generated_at desc);
create index academic_report_snapshots_finalized_by_idx
  on public.academic_report_snapshots(finalized_by)
  where finalized_by is not null;
create index academic_report_sources_report_idx
  on public.academic_report_source_snapshots(report_id, source_type, captured_at);
create index academic_report_events_report_idx
  on public.academic_report_events(report_id, created_at);
create index academic_report_events_actor_idx
  on public.academic_report_events(actor_user_id, created_at desc);

alter table public.academic_report_snapshots enable row level security;
alter table public.academic_report_source_snapshots enable row level security;
alter table public.academic_report_events enable row level security;
revoke all on table public.academic_report_snapshots from public, anon, authenticated, service_role;
revoke all on table public.academic_report_source_snapshots from public, anon, authenticated, service_role;
revoke all on table public.academic_report_events from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.academic_report_snapshots to service_role;
grant select, insert, update, delete on table public.academic_report_source_snapshots to service_role;
grant select, insert, update, delete on table public.academic_report_events to service_role;

create or replace function private.academic_report_records_are_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'academic_report_record_is_append_only';
end;
$$;
revoke all on function private.academic_report_records_are_append_only()
  from public, anon, authenticated, service_role;

create trigger trg_academic_report_sources_append_only
before update or delete on public.academic_report_source_snapshots
for each row execute function private.academic_report_records_are_append_only();
create trigger trg_academic_report_events_append_only
before update or delete on public.academic_report_events
for each row execute function private.academic_report_records_are_append_only();

create or replace function private.academic_report_snapshot_is_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514', message = 'academic_report_snapshot_is_immutable';
  end if;
  if old.status = 'draft' and new.status = 'final'
    and new.finalized_by is not null and new.finalized_at is not null
    and (to_jsonb(new) - array['status','finalized_by','finalized_at'])
      = (to_jsonb(old) - array['status','finalized_by','finalized_at']) then
    return new;
  end if;
  raise exception using errcode = '23514', message = 'academic_report_snapshot_is_immutable';
end;
$$;
revoke all on function private.academic_report_snapshot_is_immutable()
  from public, anon, authenticated, service_role;
create trigger trg_academic_report_snapshot_immutable
before update or delete on public.academic_report_snapshots
for each row execute function private.academic_report_snapshot_is_immutable();

create or replace function private.academic_report_scope_students(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_period_start date,
  p_period_end date,
  p_report_type text,
  p_student_id uuid,
  p_class_id uuid,
  p_grade_level text
)
returns table(student_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct candidate.student_id
  from (
    select p_student_id as student_id
    where p_report_type = 'student' and p_student_id is not null
    union all
    select e.student_id
    from public.student_academic_enrolments e
    where p_report_type <> 'student'
      and e.school_id = p_school_id and e.academic_year_id = p_academic_year_id
      and e.starts_on <= p_period_end and coalesce(e.ends_on, p_period_end) >= p_period_start
      and (p_report_type <> 'class' or e.class_id = p_class_id)
      and (p_report_type <> 'grade' or e.grade_level = p_grade_level)
  ) candidate
  join public.users u on u.id = candidate.student_id and u.school_id = p_school_id;
$$;
revoke all on function private.academic_report_scope_students(uuid,uuid,date,date,text,uuid,uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public.academic_reporting_can_generate(
  p_school_id uuid,
  p_report_type text,
  p_student_id uuid,
  p_class_id uuid,
  p_academic_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.is_school_owner(p_school_id)
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = (select auth.uid())
        and sm.status = 'active' and sm.role_in_school = 'school_admin'
    )
    or (
      p_report_type = 'student' and p_student_id is not null and exists (
        select 1
        from public.class_students cs
        join public.classes c on c.id = cs.class_id and c.school_id = p_school_id
        join public.class_teacher_assignments cta on cta.class_id = c.id
          and cta.school_id = c.school_id
          and cta.teacher_user_id = (select auth.uid()) and cta.active is true
        left join public.academic_subjects s on s.id = p_academic_subject_id
        where cs.student_id = p_student_id and (
          p_academic_subject_id is null
          or public.academic_normalize_subject_key(cta.subject) = s.code
          or public.academic_resolve_subject_id(cta.subject, p_school_id) = p_academic_subject_id
        )
      )
    )
    or (
      p_report_type = 'class' and p_class_id is not null and p_academic_subject_id is not null
      and exists (
        select 1
        from public.class_teacher_assignments cta
        join public.academic_subjects s on s.id = p_academic_subject_id
        where cta.school_id = p_school_id and cta.class_id = p_class_id
          and cta.teacher_user_id = (select auth.uid()) and cta.active is true
          and (public.academic_normalize_subject_key(cta.subject) = s.code
            or public.academic_resolve_subject_id(cta.subject, p_school_id) = p_academic_subject_id)
      )
    )
  );
$$;
revoke all on function public.academic_reporting_can_generate(uuid,text,uuid,uuid,uuid)
  from public, anon;
grant execute on function public.academic_reporting_can_generate(uuid,text,uuid,uuid,uuid)
  to authenticated, service_role;

create or replace function public.rpc_academic_reporting_context(p_student_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_role text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select u.school_id into v_school_id from public.users u
  where u.id = coalesce(p_student_id, v_caller);
  if v_school_id is null then raise exception 'School context is required'; end if;
  if public.is_school_owner(v_school_id) then v_role := 'school_head';
  elsif exists (select 1 from public.school_members sm where sm.school_id = v_school_id
    and sm.user_id = v_caller and sm.status = 'active' and sm.role_in_school = 'school_admin')
    then v_role := 'school_admin';
  elsif p_student_id is not null and exists (
    select 1 from public.class_students cs
    join public.class_teacher_assignments cta on cta.class_id = cs.class_id
      and cta.school_id = v_school_id and cta.teacher_user_id = v_caller and cta.active is true
    where cs.student_id = p_student_id
  ) then v_role := 'teacher';
  elsif p_student_id is null or p_student_id = v_caller then v_role := 'student';
  else raise exception 'Not authorised for academic reporting context'; end if;

  return jsonb_build_object(
    'success', true,
    'viewer', jsonb_build_object('id', v_caller, 'role', v_role),
    'schoolId', v_school_id,
    'years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id, 'name', y.name, 'startsOn', y.starts_on,
        'endsOn', y.ends_on, 'status', y.status
      ) order by y.starts_on desc, y.id)
      from public.school_academic_years y where y.school_id = v_school_id
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'academicYearId', t.academic_year_id, 'name', t.name,
        'sequenceNumber', t.sequence_number, 'startsOn', t.starts_on, 'endsOn', t.ends_on
      ) order by t.academic_year_id, t.sequence_number, t.id)
      from public.school_academic_terms t where t.school_id = v_school_id
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
        order by s.name, s.id)
      from public.academic_subjects s where s.is_active and (
        v_role in ('school_head','school_admin','student')
        or exists (
          select 1 from public.class_teacher_assignments cta
          where cta.school_id = v_school_id and cta.teacher_user_id = v_caller
            and cta.active is true and (
              public.academic_normalize_subject_key(cta.subject) = s.code
              or public.academic_resolve_subject_id(cta.subject, v_school_id) = s.id
            )
        )
      )
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.class_name, 'code', c.class_code, 'gradeLevel', c.grade_level
      ) order by c.grade_level, c.class_name, c.id)
      from public.classes c where c.school_id = v_school_id and (
        v_role in ('school_head','school_admin')
        or exists (select 1 from public.class_teacher_assignments cta
          where cta.class_id = c.id and cta.teacher_user_id = v_caller and cta.active is true)
      )
    ), '[]'::jsonb),
    'grades', coalesce((
      select jsonb_agg(g.grade_level order by g.grade_level)
      from (select distinct e.grade_level from public.student_academic_enrolments e
        where e.school_id = v_school_id and e.grade_level is not null) g
    ), '[]'::jsonb),
    'recentReports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reportType', r.report_type, 'audience', r.audience,
        'status', r.status, 'version', r.report_version,
        'academicYearId', r.academic_year_id, 'academicTermId', r.academic_term_id,
        'payloadHash', r.payload_hash, 'generatedAt', r.generated_at, 'finalizedAt', r.finalized_at
      ) order by r.generated_at desc)
      from (select x.* from public.academic_report_snapshots x
        where x.school_id = v_school_id and (
          (v_role = 'student' and x.student_id = v_caller and x.status = 'final'
            and x.audience = 'student')
          or (v_role <> 'student' and (x.generated_by = v_caller
            or v_role in ('school_head','school_admin')))
        ) order by x.generated_at desc limit 20) r
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canGenerateStudent', v_role in ('teacher','school_admin','school_head'),
      'canGenerateClass', v_role in ('teacher','school_admin','school_head'),
      'canGenerateGrade', v_role in ('school_admin','school_head'),
      'canGenerateSubject', v_role in ('school_admin','school_head'),
      'canGenerateSchool', v_role in ('school_admin','school_head')
    ),
    'disclosure', jsonb_build_object(
      'reportSnapshotsAreImmutable', true,
      'draftRequiresFinalApprovalBeforeExport', true,
      'privateTeacherNotesExcluded', true
    )
  );
end;
$$;
revoke all on function public.rpc_academic_reporting_context(uuid) from public, anon;
grant execute on function public.rpc_academic_reporting_context(uuid)
  to authenticated, service_role;

create or replace function public.rpc_generate_academic_report_snapshot(
  p_report_type text,
  p_academic_year_id uuid,
  p_academic_term_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_grade_level text default null,
  p_academic_subject_id uuid default null,
  p_audience text default 'teacher',
  p_evidence_cutoff_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_year public.school_academic_years%rowtype;
  v_term public.school_academic_terms%rowtype;
  v_period_start date;
  v_period_end date;
  v_cutoff timestamptz;
  v_scope_key text;
  v_subjects jsonb := '[]'::jsonb;
  v_interventions jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_source_hash text;
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.academic_report_snapshots%rowtype;
  v_previous_id uuid;
  v_version integer;
  v_report_id uuid;
  v_reporter_role text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_report_type not in ('student','class','grade','subject','school') then
    raise exception 'Invalid academic report type';
  end if;
  if p_audience not in ('student','family','teacher','school_head','internal') then
    raise exception 'Invalid report audience';
  end if;
  if p_audience in ('student','family') and p_report_type <> 'student' then
    raise exception 'Student and family reports must be scoped to one student';
  end if;
  select * into v_year from public.school_academic_years y where y.id = p_academic_year_id;
  if not found then raise exception 'Academic year not found'; end if;
  if p_academic_term_id is not null then
    select * into v_term from public.school_academic_terms t
    where t.id = p_academic_term_id and t.academic_year_id = v_year.id
      and t.school_id = v_year.school_id;
    if not found then raise exception 'Academic term does not belong to the selected year'; end if;
  end if;
  if (p_report_type = 'student') <> (p_student_id is not null)
    or (p_report_type = 'class') <> (p_class_id is not null)
    or (p_report_type = 'grade') <> (nullif(trim(coalesce(p_grade_level, '')), '') is not null)
    or (p_report_type = 'subject' and p_academic_subject_id is null) then
    raise exception 'Report target does not match report type';
  end if;
  if p_report_type in ('subject','school') and (p_student_id is not null or p_class_id is not null or p_grade_level is not null) then
    raise exception 'School and subject reports cannot include a student, class, or grade target';
  end if;
  if p_report_type = 'student' and not exists (
    select 1 from public.users u where u.id = p_student_id and u.school_id = v_year.school_id
  ) then raise exception 'Student is outside the selected school'; end if;
  if p_report_type = 'class' and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.school_id = v_year.school_id
  ) then raise exception 'Class is outside the selected school'; end if;
  if not public.academic_reporting_can_generate(
    v_year.school_id, p_report_type, p_student_id, p_class_id, p_academic_subject_id
  ) then raise exception 'Not authorised to generate this academic report'; end if;

  if public.is_school_owner(v_year.school_id) then v_reporter_role := 'school_head';
  elsif exists (select 1 from public.school_members sm where sm.school_id = v_year.school_id
    and sm.user_id = v_caller and sm.status = 'active' and sm.role_in_school = 'school_admin')
    then v_reporter_role := 'school_admin';
  else v_reporter_role := 'teacher'; end if;
  if v_reporter_role = 'teacher' and p_audience in ('school_head','internal') then
    raise exception 'Teacher reports must use teacher, student, or family audience';
  end if;

  v_period_start := coalesce(v_term.starts_on, v_year.starts_on);
  v_period_end := coalesce(v_term.ends_on, v_year.ends_on);
  v_cutoff := coalesce(p_evidence_cutoff_at,
    least((v_period_end + 1)::timestamptz, transaction_timestamp()));
  if v_cutoff < v_period_start::timestamptz
    or v_cutoff > least((v_period_end + 1)::timestamptz, transaction_timestamp()) then
    raise exception 'Evidence cutoff must be inside the reporting period and not in the future';
  end if;
  v_scope_key := concat_ws(':', p_report_type, p_academic_year_id,
    coalesce(p_academic_term_id::text, 'annual'),
    coalesce(p_student_id::text, '-'), coalesce(p_class_id::text, '-'),
    coalesce(nullif(trim(p_grade_level), ''), '-'),
    coalesce(p_academic_subject_id::text, 'all'));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academic-report:' || v_year.school_id::text || ':' || v_scope_key || ':' || p_audience, 0)
  );

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), scoped_observations as materialized (
    select o.*, public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    ) as is_qualified
    from public.student_learning_observations o
    join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
  ), scope_subjects as materialized (
    select distinct x.academic_subject_id
    from (
      select o.academic_subject_id from scoped_observations o where o.academic_subject_id is not null
      union
      select m.academic_subject_id
      from public.school_curriculum_scope_mappings m
      where m.school_id = v_year.school_id and m.academic_year_id = v_year.id
        and m.status in ('active','planned')
        and (p_academic_subject_id is null or m.academic_subject_id = p_academic_subject_id)
        and (v_reporter_role <> 'teacher' or exists (
          select 1
          from public.academic_subjects mapped_subject
          join scope_students mapped_student on true
          where mapped_subject.id = m.academic_subject_id
            and public.student_learning_can_manage_intervention(
              mapped_student.student_id, mapped_subject.name
            )
        ))
        and (p_report_type not in ('student','class','grade') or exists (
          select 1 from public.student_academic_enrolments e join scope_students ss on ss.student_id = e.student_id
          where e.academic_year_id = v_year.id and e.grade_level = m.grade_level
        ))
      union
      select p_academic_subject_id where p_academic_subject_id is not null
    ) x where x.academic_subject_id is not null
  ), subject_rows as (
    select ss.academic_subject_id, s.code, s.name,
      count(distinct o.student_id)::integer as students_with_evidence,
      count(o.id)::integer as observation_count,
      count(o.id) filter (where o.is_qualified)::integer as qualifying_count,
      coalesce(sum(o.evidence_count) filter (where o.is_qualified), 0)::integer as evidence_items,
      round(avg(o.evidence_percentage) filter (where o.is_qualified and o.evidence_percentage is not null), 2) as attainment_average,
      count(o.id) filter (where o.observation_type = 'focus' and o.is_qualified)::integer as focus_evidence,
      count(o.id) filter (where o.observation_type = 'developing' and o.is_qualified)::integer as developing_evidence,
      count(o.id) filter (where o.observation_type = 'strength' and o.is_qualified)::integer as strength_evidence,
      min(o.observed_at) as first_evidence_at, max(o.observed_at) as latest_evidence_at
    from scope_subjects ss
    join public.academic_subjects s on s.id = ss.academic_subject_id
    left join scoped_observations o on o.academic_subject_id = ss.academic_subject_id
    group by ss.academic_subject_id, s.code, s.name
  ), eligible_states as materialized (
    select f.*
    from public.student_learning_focus_states f
    join scope_students x on x.student_id = f.student_id
    where f.academic_year_id = v_year.id
      and f.last_observed_at < v_cutoff
      and exists (
        select 1 from scoped_observations o
        where o.student_id = f.student_id and o.skill_key = f.skill_key
      )
      and not exists (
        select 1 from public.student_learning_observations later
        where later.student_id = f.student_id and later.skill_key = f.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'academicSubjectId', q.academic_subject_id, 'code', q.code, 'subject', q.name,
    'studentsWithEvidence', q.students_with_evidence,
    'observationCount', q.observation_count,
    'qualifyingObservations', q.qualifying_count,
    'evidenceItems', q.evidence_items,
    'attainmentAverage', q.attainment_average,
    'expectedStandard', null,
    'expectationStatus', 'not_configured',
    'evidenceStatus', case when q.observation_count = 0 then 'not_assessed'
      when q.qualifying_count = 0 then 'low_data' else 'assessed' end,
    'focusEvidence', q.focus_evidence, 'developingEvidence', q.developing_evidence,
    'strengthEvidence', q.strength_evidence,
    'firstEvidenceAt', q.first_evidence_at, 'latestEvidenceAt', q.latest_evidence_at,
    'progressStates', jsonb_build_object(
      'newFocus', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'new_focus'),
      'recurring', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'recurring'),
      'persistent', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'persistent'),
      'improving', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'improving'),
      'resolved', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'resolved'),
      'emergingStrength', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'emerging_strength'),
      'consistentStrength', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'consistent_strength')
    ),
    'confidence', coalesce((select jsonb_build_object(
      'averageScore', round(avg(c.confidence_score), 2),
      'high', count(*) filter (where c.confidence_band = 'high'),
      'medium', count(*) filter (where c.confidence_band = 'medium'),
      'low', count(*) filter (where c.confidence_band = 'low'),
      'notAssessed', count(*) filter (where c.assessment_state = 'not_assessed'),
      'lowData', count(*) filter (where c.assessment_state = 'low_data'),
      'stale', count(*) filter (where c.assessment_state = 'stale'),
      'contradictory', count(*) filter (where c.assessment_state = 'contradictory'),
      'policyIds', coalesce(jsonb_agg(distinct c.policy_id), '[]'::jsonb),
      'asOf', max(c.as_of_at)
    ) from public.student_learning_confidence_states c join scope_students x on x.student_id = c.student_id
      where c.academic_year_id = v_year.id and c.academic_subject_id = q.academic_subject_id
        and c.as_of_at <= v_cutoff
        and exists (select 1 from scoped_observations o
          where o.student_id = c.student_id and o.skill_key = c.skill_key)
        and not exists (select 1 from public.student_learning_observations later
          where later.student_id = c.student_id and later.skill_key = c.skill_key
            and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff)), jsonb_build_object(
          'averageScore', null, 'high', 0, 'medium', 0, 'low', 0,
          'notAssessed', 0, 'lowData', 0, 'stale', 0, 'contradictory', 0,
          'policyIds', '[]'::jsonb, 'asOf', null
    )),
    'coverage', coalesce((select jsonb_build_object(
      'students', count(*),
      'averageQualifiedPercent', round(avg(c.qualified_coverage_percent), 2),
      'unassessedObjectives', coalesce(sum(c.unassessed_objectives), 0),
      'lowDataObjectives', coalesce(sum(c.low_data_objectives), 0),
      'readiness', jsonb_build_object(
        'curriculumNotConfigured', count(*) filter (where c.reporting_readiness = 'curriculum_not_configured'),
        'noEvidence', count(*) filter (where c.reporting_readiness = 'no_evidence'),
        'lowCoverage', count(*) filter (where c.reporting_readiness = 'low_coverage'),
        'partialCoverage', count(*) filter (where c.reporting_readiness = 'partial_coverage'),
        'broadCoverage', count(*) filter (where c.reporting_readiness = 'broad_coverage')
      ), 'scope', 'academic_year_to_cutoff', 'asOf', max(c.as_of_at)
    ) from public.student_curriculum_coverage_states c join scope_students x on x.student_id = c.student_id
      where c.academic_year_id = v_year.id and c.academic_subject_id = q.academic_subject_id
        and c.as_of_at <= v_cutoff), jsonb_build_object(
          'students', 0, 'averageQualifiedPercent', null,
          'unassessedObjectives', 0, 'lowDataObjectives', 0,
          'readiness', jsonb_build_object('curriculumNotConfigured', 0, 'noEvidence', 0,
            'lowCoverage', 0, 'partialCoverage', 0, 'broadCoverage', 0),
          'scope', 'academic_year_to_cutoff', 'asOf', null
    )),
    'historicalProjectionUnavailable', (select count(distinct (o.student_id, o.skill_key))
      from scoped_observations o where o.academic_subject_id = q.academic_subject_id
        and exists (select 1 from public.student_learning_observations later
          where later.student_id = o.student_id and later.skill_key = o.skill_key
            and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff)
    )
  ) order by q.name, q.academic_subject_id), '[]'::jsonb)
  into v_subjects from subject_rows q;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), scoped_observations as materialized (
    select o.*, public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    ) as is_qualified
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
  )
  select jsonb_build_object(
    'studentsInScope', (select count(*) from scope_students),
    'studentsWithEvidence', count(distinct o.student_id),
    'studentsWithoutEvidence', greatest((select count(*) from scope_students) - count(distinct o.student_id), 0),
    'subjectsInReport', jsonb_array_length(v_subjects),
    'observationCount', count(o.id),
    'qualifyingObservations', count(o.id) filter (where o.is_qualified),
    'evidenceItems', coalesce(sum(o.evidence_count) filter (where o.is_qualified), 0),
    'attainmentAverage', round(avg(o.evidence_percentage) filter (
      where o.is_qualified and o.evidence_percentage is not null
    ), 2),
    'sourceTypes', jsonb_build_object(
      'assignment', count(*) filter (where o.source_type = 'assignment_result'),
      'writing', count(*) filter (where o.source_type = 'writing_attempt'),
      'teacher', count(*) filter (where o.source_type = 'teacher_observation'),
      'import', count(*) filter (where o.source_type = 'import'),
      'cambridge', count(*) filter (where o.source_type = 'cambridge_attempt')
    )
  ) into v_summary from scoped_observations o;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'studentId', i.student_id, 'subject', i.subject,
    'skill', i.skill, 'interventionType', i.intervention_type,
    'status', i.status, 'approvalStatus', i.approval_status,
    'targetStatus', i.target_status, 'createdAt', i.created_at,
    'targetDate', i.target_date, 'completedAt', i.completed_at,
    'outcomeStatus', i.outcome_status, 'systemOutcomeStatus', i.system_outcome_status,
    'baselineSnapshotHash', i.baseline_snapshot_hash,
    'qualifyingFollowUp', i.follow_up_qualifying_observations,
    'successfulFollowUp', i.follow_up_successful_observations
  ) order by i.created_at, i.id), '[]'::jsonb)
  into v_interventions
  from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
  where i.school_id = v_year.school_id and i.academic_year_id = v_year.id
    and i.created_at < v_cutoff
    and coalesce(i.completed_at, i.cancelled_at, v_cutoff) >= v_period_start::timestamptz
    and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
    and public.student_learning_can_manage_intervention(i.student_id, i.subject);

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), source_rows as (
    select 'observation:' || o.id::text || ':' || o.observed_at::text || ':' || o.created_at::text
      || ':' || o.observation_type || ':' || o.source_type || ':' || o.source_key
      || ':' || o.evidence_count::text || ':' || coalesce(o.evidence_percentage::text, '')
      || ':' || o.evidence_quality || ':' || o.contributes_to_focus_state::text as fingerprint
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
    union all
    select 'confidence:' || c.id::text || ':' || c.as_of_at::text || ':' || c.computed_at::text
      || ':' || c.confidence_score::text || ':' || c.assessment_state || ':' || c.gate_results::text
    from public.student_learning_confidence_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (select 1 from public.student_learning_observations o
        where o.student_id = c.student_id and o.skill_key = c.skill_key
          and o.academic_year_id = v_year.id
          and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
          and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id))
      and not exists (select 1 from public.student_learning_observations later
        where later.student_id = c.student_id and later.skill_key = c.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff)
    union all
    select 'coverage:' || c.id::text || ':' || c.as_of_at::text || ':' || c.computed_at::text
      || ':' || c.reporting_readiness || ':' || c.qualified_coverage_percent::text
    from public.student_curriculum_coverage_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
    union all
    select 'intervention:' || i.id::text || ':' || i.updated_at::text || ':' || i.status
      || ':' || i.approval_status || ':' || coalesce(i.outcome_status, '')
      || ':' || coalesce(i.system_outcome_status, '') || ':' || i.baseline_snapshot_hash
    from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
    where i.school_id = v_year.school_id and i.academic_year_id = v_year.id and i.created_at < v_cutoff
      and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
  )
  select encode(extensions.digest(convert_to(
    v_scope_key || ':' || p_audience || ':' || coalesce(string_agg(fingerprint, ',' order by fingerprint), ''),
    'UTF8'), 'sha256'), 'hex') into v_source_hash from source_rows;

  v_payload := jsonb_build_object(
    'schemaVersion', 'academic-report-v1',
    'reportType', p_report_type, 'audience', p_audience,
    'reportingPeriod', jsonb_build_object(
      'kind', case when p_academic_term_id is null then 'annual' else 'term' end,
      'academicYearId', v_year.id, 'academicYearName', v_year.name,
      'academicTermId', v_term.id, 'academicTermName', v_term.name,
      'startsOn', v_period_start, 'endsOn', v_period_end, 'evidenceCutoffAt', v_cutoff
    ),
    'scope', jsonb_build_object(
      'schoolId', v_year.school_id, 'studentId', p_student_id,
      'classId', p_class_id, 'gradeLevel', nullif(trim(p_grade_level), ''),
      'academicSubjectId', p_academic_subject_id
    ),
    'summary', v_summary, 'subjects', v_subjects, 'interventions', v_interventions,
    'disclosures', jsonb_build_object(
      'confidenceIsNotAttainment', true,
      'coverageIsNotMastery', true,
      'coverageScope', 'academic_year_to_cutoff',
      'unassessedObjectivesAreNotWeaknesses', true,
      'missingWorkIsNotZero', true,
      'expectedStandardNotInferredWhenUnconfigured', true,
      'historicalProjectionWithheldAfterLaterEvidence', true,
      'activityVolumeIsNotAnInterventionOutcome', true,
      'privateTeacherNotesExcluded', true,
      'rawEvidenceJsonExcluded', true,
      'sourceObservationsMutated', false,
      'focusStatesMutated', false,
      'reportAutomaticallyFinalized', false
    )
  );
  v_payload_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing from public.academic_report_snapshots r
  where r.school_id = v_year.school_id and r.scope_key = v_scope_key
    and r.audience = p_audience and r.source_snapshot_hash = v_source_hash
    and r.payload_hash = v_payload_hash
  order by r.report_version desc limit 1;
  if found then
    insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
    values (v_existing.id, v_caller, 'reused', jsonb_build_object('payloadHash', v_existing.payload_hash));
    return jsonb_build_object(
      'success', true, 'reportId', v_existing.id, 'status', v_existing.status,
      'version', v_existing.report_version, 'payloadHash', v_existing.payload_hash,
      'sourceSnapshotHash', v_existing.source_snapshot_hash, 'reused', true,
      'reportAutomaticallyFinalized', false
    );
  end if;

  select r.id, r.report_version into v_previous_id, v_version
  from public.academic_report_snapshots r
  where r.school_id = v_year.school_id and r.scope_key = v_scope_key and r.audience = p_audience
  order by r.report_version desc limit 1;
  v_version := coalesce(v_version, 0) + 1;
  insert into public.academic_report_snapshots(
    school_id, report_type, audience, status, report_version, supersedes_report_id,
    academic_year_id, academic_term_id, student_id, class_id, grade_level,
    academic_subject_id, scope_key, period_start, period_end, evidence_cutoff_at,
    source_snapshot_hash, payload_hash, report_payload, generated_by
  ) values (
    v_year.school_id, p_report_type, p_audience, 'draft', v_version, v_previous_id,
    v_year.id, p_academic_term_id, p_student_id, p_class_id,
    nullif(trim(p_grade_level), ''), p_academic_subject_id, v_scope_key,
    v_period_start, v_period_end, v_cutoff, v_source_hash, v_payload_hash,
    v_payload, v_caller
  ) returning id into v_report_id;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  )
  insert into public.academic_report_source_snapshots(
    report_id, source_type, source_id, source_snapshot_hash
  )
  select v_report_id, src.source_type, src.source_id,
    encode(extensions.digest(convert_to(src.snapshot::text, 'UTF8'), 'sha256'), 'hex')
  from (
    select 'observation'::text as source_type, o.id as source_id,
      jsonb_build_object('id', o.id, 'observedAt', o.observed_at, 'createdAt', o.created_at,
        'observationType', o.observation_type, 'sourceType', o.source_type,
        'sourceKey', o.source_key, 'evidenceCount', o.evidence_count,
        'evidencePercentage', o.evidence_percentage, 'evidenceQuality', o.evidence_quality,
        'contributes', o.contributes_to_focus_state, 'academicYearId', o.academic_year_id,
        'academicTermId', o.academic_term_id, 'academicSubjectId', o.academic_subject_id) as snapshot
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
    union all
    select 'confidence_projection', c.id,
      jsonb_build_object('id', c.id, 'policyId', c.policy_id, 'asOf', c.as_of_at,
        'computedAt', c.computed_at, 'confidenceScore', c.confidence_score,
        'confidenceBand', c.confidence_band, 'assessmentState', c.assessment_state,
        'gateResults', c.gate_results)
    from public.student_learning_confidence_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (select 1 from public.student_learning_observations o
        where o.student_id = c.student_id and o.skill_key = c.skill_key
          and o.academic_year_id = v_year.id
          and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
          and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id))
      and not exists (select 1 from public.student_learning_observations later
        where later.student_id = c.student_id and later.skill_key = c.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff)
    union all
    select 'coverage_projection', c.id,
      jsonb_build_object('id', c.id, 'asOf', c.as_of_at, 'computedAt', c.computed_at,
        'readiness', c.reporting_readiness, 'qualifiedCoverage', c.qualified_coverage_percent,
        'unassessedObjectives', c.unassessed_objectives, 'disclosure', c.disclosure)
    from public.student_curriculum_coverage_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
    union all
    select 'intervention', i.id,
      jsonb_build_object('id', i.id, 'updatedAt', i.updated_at, 'status', i.status,
        'approvalStatus', i.approval_status, 'outcomeStatus', i.outcome_status,
        'systemOutcomeStatus', i.system_outcome_status,
        'baselineSnapshotHash', i.baseline_snapshot_hash)
    from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
    where i.school_id = v_year.school_id and i.academic_year_id = v_year.id and i.created_at < v_cutoff
      and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(i.student_id, i.subject)
  ) src;
  insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
  values (v_report_id, v_caller, 'generated', jsonb_build_object(
    'version', v_version, 'payloadHash', v_payload_hash, 'sourceSnapshotHash', v_source_hash
  ));
  return jsonb_build_object(
    'success', true, 'reportId', v_report_id, 'status', 'draft',
    'version', v_version, 'payloadHash', v_payload_hash,
    'sourceSnapshotHash', v_source_hash, 'reused', false,
    'reportAutomaticallyFinalized', false
  );
end;
$$;
revoke all on function public.rpc_generate_academic_report_snapshot(
  text,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz
) from public, anon;
grant execute on function public.rpc_generate_academic_report_snapshot(
  text,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz
) to authenticated, service_role;

create or replace function public.rpc_finalize_academic_report_snapshot(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_report public.academic_report_snapshots%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_report from public.academic_report_snapshots r where r.id = p_report_id for update;
  if not found then raise exception 'Academic report not found'; end if;
  if not public.academic_reporting_can_generate(
    v_report.school_id, v_report.report_type, v_report.student_id,
    v_report.class_id, v_report.academic_subject_id
  ) then raise exception 'Not authorised to finalize this academic report'; end if;
  if v_report.status = 'final' then
    return jsonb_build_object('success', true, 'reportId', v_report.id,
      'status', 'final', 'payloadHash', v_report.payload_hash, 'alreadyFinal', true);
  end if;
  update public.academic_report_snapshots set status = 'final',
    finalized_by = v_caller, finalized_at = now() where id = v_report.id;
  insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
  values (v_report.id, v_caller, 'finalized', jsonb_build_object(
    'payloadHash', v_report.payload_hash, 'sourceSnapshotHash', v_report.source_snapshot_hash
  ));
  return jsonb_build_object('success', true, 'reportId', v_report.id,
    'status', 'final', 'payloadHash', v_report.payload_hash, 'alreadyFinal', false);
end;
$$;
revoke all on function public.rpc_finalize_academic_report_snapshot(uuid) from public, anon;
grant execute on function public.rpc_finalize_academic_report_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.rpc_get_academic_report_snapshot(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_report public.academic_report_snapshots%rowtype;
  v_staff boolean := false;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_report from public.academic_report_snapshots r where r.id = p_report_id;
  if not found then raise exception 'Academic report not found'; end if;
  v_staff := public.academic_reporting_can_generate(
    v_report.school_id, v_report.report_type, v_report.student_id,
    v_report.class_id, v_report.academic_subject_id
  );
  if not v_staff and not (
    v_report.status = 'final' and v_report.report_type = 'student'
    and v_report.audience = 'student' and v_report.student_id = v_caller
  ) then raise exception 'Not authorised to view this academic report'; end if;
  return jsonb_build_object(
    'success', true,
    'report', jsonb_build_object(
      'id', v_report.id, 'reportType', v_report.report_type,
      'audience', v_report.audience, 'status', v_report.status,
      'version', v_report.report_version, 'supersedesReportId', v_report.supersedes_report_id,
      'academicYearId', v_report.academic_year_id, 'academicTermId', v_report.academic_term_id,
      'periodStart', v_report.period_start, 'periodEnd', v_report.period_end,
      'evidenceCutoffAt', v_report.evidence_cutoff_at,
      'sourceSnapshotHash', v_report.source_snapshot_hash,
      'payloadHash', v_report.payload_hash, 'payload', v_report.report_payload,
      'generatedAt', v_report.generated_at, 'finalizedAt', v_report.finalized_at,
      'sourceReferences', case when v_staff then coalesce((
        select jsonb_agg(jsonb_build_object(
          'sourceType', s.source_type, 'sourceId', s.source_id,
          'snapshotHash', s.source_snapshot_hash
        ) order by s.source_type, s.source_id)
        from public.academic_report_source_snapshots s where s.report_id = v_report.id
      ), '[]'::jsonb) else '[]'::jsonb end
    ),
    'disclosure', jsonb_build_object(
      'privateTeacherNotesExcluded', true,
      'studentAccessRequiresFinalStudentAudience', true,
      'sourceReferencesVisibleToAuthorisedStaffOnly', true
    )
  );
end;
$$;
revoke all on function public.rpc_get_academic_report_snapshot(uuid) from public, anon;
grant execute on function public.rpc_get_academic_report_snapshot(uuid)
  to authenticated, service_role;

comment on table public.academic_report_snapshots is
  'Immutable, versioned term and annual academic report payloads with exact source and payload hashes.';
comment on function public.rpc_generate_academic_report_snapshot(
  text,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz
) is 'Generates or reuses a deterministic draft report snapshot; never finalizes automatically or mutates learner evidence.';
