alter table public.school_members
  drop constraint if exists school_members_status_check;

alter table public.school_members
  add constraint school_members_status_check
  check (status = any (array['active'::text,'pending'::text,'suspended'::text,'inactive'::text]));

alter table public.adm_candidates
  add column if not exists enrolled_user_id uuid references public.users(id) on delete set null;

alter table public.adm_candidates
  add column if not exists enrolled_at timestamptz;

create index if not exists idx_adm_candidates_enrolled_user
  on public.adm_candidates(enrolled_user_id)
  where enrolled_user_id is not null;

create table if not exists private.school_year_cambridge_class_visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.school_year_rollover_plans(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  test_id text not null,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  is_visible boolean not null,
  captured_at timestamptz not null default now(),
  unique(plan_id,class_id,test_id)
);

create table if not exists private.school_year_cambridge_grade_visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.school_year_rollover_plans(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete cascade,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  test_id text not null,
  subject text,
  grade_level integer,
  is_visible boolean not null,
  captured_at timestamptz not null default now(),
  unique(plan_id,teacher_user_id,test_id,grade_level)
);

create table if not exists private.school_year_rollover_policy_runs (
  plan_id uuid primary key references public.school_year_rollover_plans(id) on delete cascade,
  policy_version text not null,
  result jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now()
);

create or replace function private.sync_admission_candidate_for_active_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_verified boolean := false;
begin
  if new.role_in_school <> 'student' or new.status <> 'active' then return new; end if;
  select lower(trim(u.email)), (au.email_confirmed_at is not null)
  into v_email, v_verified
  from public.users u left join auth.users au on au.id=u.id
  where u.id=new.user_id;
  if nullif(v_email,'') is null or not coalesce(v_verified,false) then return new; end if;
  update public.adm_candidates c
  set status='placed', enrolled_user_id=new.user_id,
      enrolled_at=coalesce(c.enrolled_at,now()), updated_at=now()
  where c.school_id=new.school_id
    and lower(trim(c.email))=v_email
    and (c.enrolled_user_id is null or c.enrolled_user_id=new.user_id);
  return new;
end;
$$;
revoke all on function private.sync_admission_candidate_for_active_student() from public;

drop trigger if exists trg_sync_admission_candidate_for_active_student on public.school_members;
create trigger trg_sync_admission_candidate_for_active_student
after insert or update of school_id,user_id,role_in_school,status on public.school_members
for each row execute function private.sync_admission_candidate_for_active_student();

update public.adm_candidates c
set status='placed', enrolled_user_id=sm.user_id,
    enrolled_at=coalesce(c.enrolled_at,now()), updated_at=now()
from public.school_members sm
join public.users u on u.id=sm.user_id
join auth.users au on au.id=sm.user_id and au.email_confirmed_at is not null
join public.schools s on s.id=sm.school_id and s.name='Silk Road International School'
where sm.school_id=c.school_id and sm.status='active' and sm.role_in_school='student'
  and nullif(trim(c.email),'') is not null
  and lower(trim(c.email))=lower(trim(u.email))
  and (c.enrolled_user_id is null or c.enrolled_user_id=sm.user_id);

create or replace function private.year_rollover_terminal_grade_default()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.review_state <> 'applied'
     and not coalesce(new.is_overridden,false)
     and new.outcome='graduate'
     and private.year_rollover_grade_number(new.source_grade)>=12 then
    new.review_state:='auto_ready';
    if nullif(trim(coalesce(new.rationale,'')),'') is null then
      new.rationale:='Grade 12 is the terminal grade and defaults to graduation.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.year_rollover_terminal_grade_default() from public;

drop trigger if exists trg_year_rollover_terminal_grade_default on public.school_year_rollover_student_decisions;
create trigger trg_year_rollover_terminal_grade_default
before insert or update of outcome,source_grade,is_overridden,review_state
on public.school_year_rollover_student_decisions
for each row execute function private.year_rollover_terminal_grade_default();

do $patch_seed$
declare v_oid oid; v_def text;
  v_needle text:='  where coalesce(c.is_active, true)';
  v_replacement text:='  where coalesce(c.is_active, true)'||E'\n'||
    '    and not exists ('||E'\n'||
    '      select 1'||E'\n'||
    '      from public.school_year_rollover_plans rp'||E'\n'||
    '      join public.school_year_rollover_student_decisions rd'||E'\n'||
    '        on rd.plan_id = rp.id and rd.student_id = cs.student_id'||E'\n'||
    '      where rp.school_id = p_school_id'||E'\n'||
    '        and rp.target_academic_year_id = v_year.id'||E'\n'||
    '        and rp.status = ''completed'''||E'\n'||
    '        and rd.outcome in (''graduate'',''leave'')'||E'\n'||
    '    )';
begin
  select p.oid,pg_get_functiondef(p.oid) into v_oid,v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_school_admin_seed_academic_enrolments'
    and pg_get_function_identity_arguments(p.oid)='p_school_id uuid, p_academic_year_id uuid';
  if v_oid is null or position(v_needle in v_def)=0 then raise exception 'seed_enrolment_patch_anchor_not_found'; end if;
  execute replace(v_def,v_needle,v_replacement);
end;
$patch_seed$;

do $patch_roster$
declare v_oid oid; v_def text;
  v_needle text:='      and sm.role_in_school = ''student'''||E'\n'||'  ),';
  v_replacement text:='      and sm.role_in_school = ''student'''||E'\n'||
    '    union'||E'\n'||
    '    select e.student_id,'||E'\n'||
    '      coalesce(nullif(trim(u2.full_name), ''''), nullif(trim(u2.username), ''''),'||E'\n'||
    '        nullif(trim(u2.email), ''''), ''Student'') as student_name,'||E'\n'||
    '      u2.batch'||E'\n'||
    '    from public.student_academic_enrolments e'||E'\n'||
    '    join public.users u2 on u2.id = e.student_id'||E'\n'||
    '    where e.school_id = p_school_id'||E'\n'||
    '      and e.academic_year_id = p_source_year_id'||E'\n'||
    '      and exists ('||E'\n'||
    '        select 1 from public.class_students rcs'||E'\n'||
    '        join public.classes rc on rc.id = rcs.class_id and rc.school_id = p_school_id'||E'\n'||
    '        where rcs.student_id = e.student_id and coalesce(rc.is_active,true)'||E'\n'||
    '      )'||E'\n'||
    '  ),';
begin
  select p.oid,pg_get_functiondef(p.oid) into v_oid,v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='year_rollover_source_roster'
    and pg_get_function_identity_arguments(p.oid)='p_school_id uuid, p_source_year_id uuid';
  if v_oid is null or position(v_needle in v_def)=0 then raise exception 'rollover_roster_patch_anchor_not_found'; end if;
  execute replace(v_def,v_needle,v_replacement);
end;
$patch_roster$;

create or replace function private.apply_school_year_rollover_post_commit_policies(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_plan public.school_year_rollover_plans%rowtype; v_actor uuid;
  v_exit_count integer:=0; v_memberships_inactivated integer:=0; v_guardians_revoked integer:=0;
  v_seats_released integer:=0; v_cambridge_class_snapshots integer:=0; v_cambridge_grade_snapshots integer:=0;
  v_teacher_assignments_deactivated integer:=0; v_teacher_allocations_deactivated integer:=0;
  v_teacher_assignments_carried integer:=0; v_teacher_empty_flags jsonb:='[]'::jsonb; v_result jsonb;
begin
  select * into v_plan from public.school_year_rollover_plans p
  where p.id=p_plan_id and p.status='completed' for update;
  if not found then return jsonb_build_object('success',false,'code','completed_rollover_plan_required'); end if;
  select r.result into v_result from private.school_year_rollover_policy_runs r where r.plan_id=v_plan.id;
  if found then return v_result||jsonb_build_object('reused',true); end if;
  v_actor:=v_plan.completed_by;
  select count(*)::integer into v_exit_count from public.school_year_rollover_student_decisions d
  where d.plan_id=v_plan.id and d.outcome in ('graduate','leave');

  insert into private.school_year_cambridge_class_visibility_snapshots(
    plan_id,school_id,academic_year_id,class_id,test_id,teacher_user_id,is_visible,captured_at)
  select v_plan.id,v_plan.school_id,v_plan.source_academic_year_id,t.class_id,t.test_id,t.teacher_user_id,t.is_visible,coalesce(v_plan.completed_at,now())
  from public.teacher_cambridge_class_visibility t join public.classes c on c.id=t.class_id and c.school_id=v_plan.school_id
  on conflict(plan_id,class_id,test_id) do nothing;
  get diagnostics v_cambridge_class_snapshots=row_count;

  insert into private.school_year_cambridge_grade_visibility_snapshots(
    plan_id,school_id,academic_year_id,teacher_user_id,test_id,subject,grade_level,is_visible,captured_at)
  select v_plan.id,v_plan.school_id,v_plan.source_academic_year_id,t.teacher_user_id,t.test_id,t.subject,t.grade_level,t.is_visible,coalesce(v_plan.completed_at,now())
  from public.cambridge_test_visibility t where t.school_id=v_plan.school_id
  on conflict(plan_id,teacher_user_id,test_id,grade_level) do nothing;
  get diagnostics v_cambridge_grade_snapshots=row_count;

  delete from public.teacher_cambridge_class_visibility t using public.classes c
  where c.id=t.class_id and c.school_id=v_plan.school_id;
  delete from public.cambridge_test_visibility t where t.school_id=v_plan.school_id;

  delete from public.class_students cs using public.classes c,public.school_year_rollover_student_decisions d
  where c.id=cs.class_id and c.school_id=v_plan.school_id and d.plan_id=v_plan.id
    and d.student_id=cs.student_id and d.outcome in ('graduate','leave');
  delete from public.student_academic_enrolments e using public.school_year_rollover_student_decisions d
  where d.plan_id=v_plan.id and d.student_id=e.student_id and d.outcome in ('graduate','leave')
    and e.school_id=v_plan.school_id and e.academic_year_id=v_plan.target_academic_year_id;

  update public.student_guardian_relationships r
  set status='revoked',revoked_at=coalesce(r.revoked_at,now()),revoked_by=coalesce(r.revoked_by,v_actor)
  from public.school_year_rollover_student_decisions d
  where d.plan_id=v_plan.id and d.student_id=r.student_id and d.outcome in ('graduate','leave')
    and r.school_id=v_plan.school_id and r.status='active';
  get diagnostics v_guardians_revoked=row_count;

  with released as (
    update public.school_programme_seat_assignments a
    set released_at=coalesce(a.released_at,now()),released_by=coalesce(a.released_by,v_actor),
        release_reason=coalesce(a.release_reason,'left_school'),
        release_note=coalesce(a.release_note,'Released automatically by academic-year rollover exit policy.'),
        cooldown_until=now(),correction=false,updated_at=now()
    from public.school_year_rollover_student_decisions d
    where d.plan_id=v_plan.id and d.student_id=a.student_user_id and d.outcome in ('graduate','leave')
      and a.school_id=v_plan.school_id and a.released_at is null
    returning a.id,a.school_id,a.module_key,a.student_user_id)
  insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type,reason,metadata)
  select id,school_id,module_key,student_user_id,v_actor,'released','left_school',jsonb_build_object('source','year_rollover','plan_id',v_plan.id,'automatic',true)
  from released;
  get diagnostics v_seats_released=row_count;

  update public.school_members sm set status='inactive',updated_at=now()
  from public.school_year_rollover_student_decisions d
  where d.plan_id=v_plan.id and d.student_id=sm.user_id and d.outcome in ('graduate','leave')
    and sm.school_id=v_plan.school_id and sm.role_in_school='student' and sm.status<>'inactive';
  get diagnostics v_memberships_inactivated=row_count;

  update public.school_year_rollover_student_decisions d
  set apply_result=coalesce(d.apply_result,'{}'::jsonb)||jsonb_build_object('schoolAccessReviewRequired',false,'automaticExitCleanupApplied',true),updated_at=now()
  where d.plan_id=v_plan.id and d.outcome in ('graduate','leave');

  update public.class_teacher_assignments cta set active=false
  where cta.school_id=v_plan.school_id and cta.active and (
    not exists(select 1 from public.school_members sm where sm.school_id=v_plan.school_id and sm.user_id=cta.teacher_user_id
      and sm.status='active' and (sm.role_in_school='teacher' or sm.can_teach))
    or not exists(select 1 from public.classes c where c.id=cta.class_id and c.school_id=v_plan.school_id and coalesce(c.is_active,true)));
  get diagnostics v_teacher_assignments_deactivated=row_count;

  update public.class_teacher_allocations cta set active=false
  where cta.school_id=v_plan.school_id and cta.active and (
    not exists(select 1 from public.school_members sm where sm.school_id=v_plan.school_id and sm.user_id=cta.teacher_user_id
      and sm.status='active' and (sm.role_in_school='teacher' or sm.can_teach))
    or not exists(select 1 from public.classes c where c.id=cta.class_id and c.school_id=v_plan.school_id and coalesce(c.is_active,true)));
  get diagnostics v_teacher_allocations_deactivated=row_count;

  select count(*)::integer into v_teacher_assignments_carried from public.class_teacher_assignments cta
  where cta.school_id=v_plan.school_id and cta.active;
  select coalesce(jsonb_agg(jsonb_build_object('classId',cta.class_id,'subject',cta.subject,'teacherUserId',cta.teacher_user_id,'reason','class_has_no_current_students') order by cta.class_id,cta.subject),'[]'::jsonb)
  into v_teacher_empty_flags from public.class_teacher_assignments cta
  where cta.school_id=v_plan.school_id and cta.active and not exists(select 1 from public.class_students cs where cs.class_id=cta.class_id);

  v_result:=jsonb_build_object('success',true,'policyVersion','rollover-hardening-v1','planId',v_plan.id,
    'exitStudents',v_exit_count,'membershipsInactivated',v_memberships_inactivated,'guardianLinksRevoked',v_guardians_revoked,
    'programmeSeatsReleased',v_seats_released,'cambridgeClassOverridesSnapshotted',v_cambridge_class_snapshots,
    'cambridgeGradeOverridesSnapshotted',v_cambridge_grade_snapshots,'cambridgeTeacherOverridesReset',true,
    'schoolCambridgeVisibilityPreserved',true,'teacherAssignmentsCarried',v_teacher_assignments_carried,
    'teacherAssignmentsDeactivated',v_teacher_assignments_deactivated,'teacherAllocationsDeactivated',v_teacher_allocations_deactivated,
    'teacherReviewFlags',v_teacher_empty_flags,'historicalAcademicEvidenceRewritten',false);

  update public.school_year_rollover_plans p
  set completion_summary=coalesce(p.completion_summary,'{}'::jsonb)||jsonb_build_object('schoolAccessReviewsRequired',0,'postCommitPoliciesApplied',true,'postCommitPolicyVersion','rollover-hardening-v1'),updated_at=now()
  where p.id=v_plan.id;
  insert into public.school_year_rollover_events(plan_id,school_id,actor_user_id,event_type,event_data)
  values(v_plan.id,v_plan.school_id,v_actor,'post_commit_policies_applied',v_result);
  insert into private.school_year_rollover_policy_runs(plan_id,policy_version,result)
  values(v_plan.id,'rollover-hardening-v1',v_result);
  return v_result;
end;
$$;
revoke all on function private.apply_school_year_rollover_post_commit_policies(uuid) from public;

create or replace function private.capture_school_year_rollover_snapshots_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.capture_school_year_rollover_snapshots_for_plan(new.id);
    perform private.apply_school_year_rollover_post_commit_policies(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.capture_school_year_rollover_snapshots_trigger() from public;

-- Silk Road current roster: activate only canonical UUIDs that already have verified auth accounts.
insert into public.school_members(school_id,user_id,role_in_school,status,is_owner,can_teach)
select distinct e.school_id,e.student_id,'student','active',false,false
from public.student_academic_enrolments e
join public.school_academic_years y on y.id=e.academic_year_id and y.status='current'
join public.schools s on s.id=e.school_id and s.name='Silk Road International School'
join public.users u on u.id=e.student_id
join auth.users au on au.id=e.student_id and au.email_confirmed_at is not null
where not exists(select 1 from public.school_members sm where sm.school_id=e.school_id and sm.user_id=e.student_id)
  and exists(select 1 from public.class_students cs join public.classes c on c.id=cs.class_id and c.school_id=e.school_id
    where cs.student_id=e.student_id and coalesce(c.is_active,true))
on conflict(user_id,school_id) do update
set status='active',role_in_school='student',can_teach=false,updated_at=now();
