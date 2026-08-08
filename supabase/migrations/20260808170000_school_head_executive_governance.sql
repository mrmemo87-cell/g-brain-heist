-- School Head executive governance layer.
--
-- Compatibility note:
--   The protected owner keeps role_in_school = 'school_admin' so every existing
--   school-scoped policy and module remains fail-closed and compatible. The
--   canonical account persona is exposed as account_type = 'school_head' when
--   school_members.is_owner is true.

create table if not exists public.school_governance_audit_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  category text not null check (category in ('people', 'school', 'academic', 'admissions', 'billing', 'security', 'ownership')),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  summary text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint school_governance_audit_event_type_check check (event_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint school_governance_audit_summary_check check (char_length(summary) between 3 and 300),
  constraint school_governance_audit_reason_check check (reason is null or char_length(reason) <= 1000)
);

create index if not exists school_governance_audit_school_created_idx
  on public.school_governance_audit_log (school_id, created_at desc);
create index if not exists school_governance_audit_actor_created_idx
  on public.school_governance_audit_log (actor_user_id, created_at desc)
  where actor_user_id is not null;
create index if not exists school_governance_audit_target_created_idx
  on public.school_governance_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.school_governance_audit_log enable row level security;
revoke all on public.school_governance_audit_log from public, anon, authenticated;
grant select on public.school_governance_audit_log to authenticated;

drop policy if exists school_heads_read_governance_audit on public.school_governance_audit_log;
create policy school_heads_read_governance_audit
  on public.school_governance_audit_log
  for select
  to authenticated
  using ((select public.is_school_owner(school_id)));

comment on table public.school_governance_audit_log is
  'Private, append-only executive governance history. School users receive SELECT-only access through the School Head RLS policy.';

-- Extend the canonical capability response with a stable account persona. The
-- membership role remains unchanged for compatibility with existing RLS/RPCs.
create or replace function public.school_admin_get_my_capabilities(p_school_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member public.school_members%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select sm.*
  into v_member
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and (p_school_id is null or sm.school_id = p_school_id)
  order by sm.is_owner desc, sm.joined_at, sm.id
  limit 1;

  if v_member.id is null then
    return jsonb_build_object('success', false, 'error', 'No active school membership');
  end if;

  return jsonb_build_object(
    'success', true,
    'school_id', v_member.school_id,
    'role', v_member.role_in_school,
    'account_type', case when v_member.is_owner then 'school_head' else v_member.role_in_school end,
    'is_owner', v_member.is_owner,
    'can_administer', v_member.role_in_school = 'school_admin',
    'can_teach', v_member.can_teach,
    'can_manage_billing', v_member.is_owner,
    'can_manage_admins', v_member.is_owner,
    'can_transfer_ownership', v_member.is_owner,
    'can_view_governance', v_member.is_owner
  );
end;
$$;

revoke all on function public.school_admin_get_my_capabilities(uuid) from public, anon, authenticated;
grant execute on function public.school_admin_get_my_capabilities(uuid) to authenticated;

create or replace function public.school_head_record_role_governance_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.school_governance_audit_log (
    school_id, actor_user_id, target_user_id, event_type, category, severity, summary, reason, metadata
  ) values (
    new.school_id,
    new.actor_user_id,
    new.member_user_id,
    'member_role_changed',
    'people',
    case when new.previous_role = 'school_admin' or new.new_role = 'school_admin' then 'warning' else 'notice' end,
    format('School access changed from %s to %s', new.previous_role, new.new_role),
    new.reason,
    jsonb_build_object(
      'previous_role', new.previous_role,
      'new_role', new.new_role,
      'previous_can_teach', new.previous_can_teach,
      'new_can_teach', new.new_can_teach,
      'assignment_count', new.assignment_count,
      'source_audit_id', new.id
    )
  );
  return new;
end;
$$;

revoke all on function public.school_head_record_role_governance_event() from public, anon, authenticated;

drop trigger if exists school_member_role_governance_audit on public.school_member_role_audit;
create trigger school_member_role_governance_audit
after insert on public.school_member_role_audit
for each row execute function public.school_head_record_role_governance_event();

create or replace function public.school_head_record_school_governance_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.name is distinct from old.name then v_changes := v_changes || jsonb_build_object('name_changed', true); end if;
  if new.logo_url is distinct from old.logo_url then v_changes := v_changes || jsonb_build_object('logo_changed', true); end if;
  if new.invite_code is distinct from old.invite_code then v_changes := v_changes || jsonb_build_object('invite_code_rotated', true); end if;
  if new.settings is distinct from old.settings then v_changes := v_changes || jsonb_build_object('settings_changed', true); end if;
  if new.status is distinct from old.status then v_changes := v_changes || jsonb_build_object('status_from', old.status, 'status_to', new.status); end if;

  if v_changes <> '{}'::jsonb then
    insert into public.school_governance_audit_log (
      school_id, actor_user_id, event_type, category, severity, summary, metadata
    ) values (
      new.id,
      auth.uid(),
      'school_configuration_changed',
      'school',
      case when new.status is distinct from old.status then 'warning' else 'notice' end,
      'School configuration was updated',
      v_changes
    );
  end if;
  return new;
end;
$$;

revoke all on function public.school_head_record_school_governance_event() from public, anon, authenticated;

drop trigger if exists school_configuration_governance_audit on public.schools;
create trigger school_configuration_governance_audit
after update of name, logo_url, invite_code, settings, status on public.schools
for each row execute function public.school_head_record_school_governance_event();

create or replace function public.school_head_record_billing_governance_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.school_governance_audit_log (
      school_id, actor_user_id, event_type, category, severity, summary, metadata
    ) values (
      new.school_id,
      coalesce(auth.uid(), new.purchased_by),
      'subscription_created',
      'billing',
      'notice',
      'A school subscription was created',
      jsonb_build_object('plan', new.plan, 'status', new.status, 'provider', new.provider, 'billing_interval', new.billing_interval)
    );
  elsif new.plan is distinct from old.plan
     or new.status is distinct from old.status
     or new.cancel_at_period_end is distinct from old.cancel_at_period_end
     or new.current_period_end is distinct from old.current_period_end then
    insert into public.school_governance_audit_log (
      school_id, actor_user_id, event_type, category, severity, summary, metadata
    ) values (
      new.school_id,
      auth.uid(),
      'subscription_changed',
      'billing',
      case when new.status in ('canceled', 'past_due', 'paused') or new.cancel_at_period_end then 'warning' else 'notice' end,
      'The school subscription changed',
      jsonb_build_object(
        'previous_plan', old.plan, 'new_plan', new.plan,
        'previous_status', old.status, 'new_status', new.status,
        'cancel_at_period_end', new.cancel_at_period_end,
        'current_period_end', new.current_period_end
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.school_head_record_billing_governance_event() from public, anon, authenticated;

drop trigger if exists billing_subscription_governance_audit on public.billing_subscriptions;
create trigger billing_subscription_governance_audit
after insert or update on public.billing_subscriptions
for each row execute function public.school_head_record_billing_governance_event();

create or replace function public.school_head_get_executive_snapshot(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_period_start timestamptz;
  v_previous_start timestamptz;
  v_school public.schools%rowtype;
  v_students integer := 0;
  v_teachers integer := 0;
  v_admins integer := 0;
  v_classes integer := 0;
  v_subjects integer := 0;
  v_active_students_7d integer := 0;
  v_active_students_30d integer := 0;
  v_inactive_students_14d integer := 0;
  v_active_teachers_7d integer := 0;
  v_placed_students integer := 0;
  v_covered_classes integer := 0;
  v_assigned_teachers integer := 0;
  v_assignment_total integer := 0;
  v_assignment_completed integer := 0;
  v_assignment_rate numeric := null;
  v_academic_average numeric := null;
  v_previous_average numeric := null;
  v_pending_admissions integer := 0;
  v_admission_total integer := 0;
  v_admission_completed integer := 0;
  v_admission_average numeric := null;
  v_cambridge_attempts integer := 0;
  v_writing_students integer := 0;
  v_ielts_students integer := 0;
  v_decisions jsonb := '[]'::jsonb;
  v_grade_performance jsonb := '[]'::jsonb;
  v_subscription jsonb := null;
  v_head jsonb := null;
  v_unplaced integer;
  v_uncovered integer;
  v_unassigned_teachers integer;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  select * into v_school from public.schools where id = p_school_id;
  if v_school.id is null then raise exception 'School not found'; end if;

  v_period_start := now() - make_interval(days => v_days);
  v_previous_start := v_period_start - make_interval(days => v_days);

  select
    count(*) filter (where sm.role_in_school = 'student'),
    count(*) filter (where sm.can_teach),
    count(*) filter (where sm.role_in_school = 'school_admin')
  into v_students, v_teachers, v_admins
  from public.school_members sm
  where sm.school_id = p_school_id and sm.status = 'active';

  select count(*) into v_classes from public.classes c
  where c.school_id = p_school_id and c.is_active is distinct from false;
  select count(*) into v_subjects from public.school_subjects ss
  where ss.school_id = p_school_id and ss.is_active is distinct from false;

  select
    count(*) filter (where u.last_seen >= now() - interval '7 days'),
    count(*) filter (where u.last_seen >= now() - interval '30 days'),
    count(*) filter (where u.last_seen is null or u.last_seen < now() - interval '14 days')
  into v_active_students_7d, v_active_students_30d, v_inactive_students_14d
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id and sm.status = 'active' and sm.role_in_school = 'student';

  select count(*) into v_active_teachers_7d
  from public.school_members sm join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id and sm.status = 'active' and sm.can_teach
    and u.last_seen >= now() - interval '7 days';

  select count(distinct sm.user_id) into v_placed_students
  from public.school_members sm
  join public.class_students cs on cs.student_id = sm.user_id
  join public.classes c on c.id = cs.class_id and c.school_id = sm.school_id and c.is_active is distinct from false
  where sm.school_id = p_school_id and sm.status = 'active' and sm.role_in_school = 'student';

  select count(distinct c.id) into v_covered_classes
  from public.classes c
  join public.class_teacher_assignments cta on cta.class_id = c.id and cta.school_id = c.school_id and cta.active is distinct from false
  where c.school_id = p_school_id and c.is_active is distinct from false;

  select count(distinct sm.user_id) into v_assigned_teachers
  from public.school_members sm
  join public.class_teacher_assignments cta on cta.teacher_user_id = sm.user_id and cta.school_id = sm.school_id and cta.active is distinct from false
  where sm.school_id = p_school_id and sm.status = 'active' and sm.can_teach;

  select
    count(*),
    count(*) filter (where sa.completed_at is not null or lower(coalesce(sa.status, '')) in ('completed', 'submitted', 'graded'))
  into v_assignment_total, v_assignment_completed
  from public.student_assignments sa
  join public.assignments a on a.id = sa.assignment_id
  where a.school_id = p_school_id and sa.assigned_at >= v_period_start;
  if v_assignment_total > 0 then
    v_assignment_rate := round((v_assignment_completed::numeric * 100) / v_assignment_total, 1);
  end if;

  select round(avg(qs.percentage)::numeric, 1) into v_academic_average
  from public.quiz_scores qs
  where qs.school_id = p_school_id and qs.submitted_at >= v_period_start
    and coalesce(qs.attempt_status, 'completed') <> 'deleted';
  select round(avg(qs.percentage)::numeric, 1) into v_previous_average
  from public.quiz_scores qs
  where qs.school_id = p_school_id and qs.submitted_at >= v_previous_start and qs.submitted_at < v_period_start
    and coalesce(qs.attempt_status, 'completed') <> 'deleted';

  select count(*), count(*) filter (where lower(coalesce(ac.status, '')) in ('pending', 'invited', 'in_progress', 'testing', 'under_review'))
  into v_admission_total, v_pending_admissions
  from public.adm_candidates ac where ac.school_id = p_school_id;
  select count(*), round(avg(aa.percentage)::numeric, 1)
  into v_admission_completed, v_admission_average
  from public.adm_attempts aa
  where aa.school_id = p_school_id and aa.submitted_at is not null;

  select count(*) into v_cambridge_attempts from public.quiz_scores qs
  where qs.school_id = p_school_id and qs.submitted_at >= v_period_start
    and coalesce(qs.attempt_status, 'completed') <> 'deleted';
  select count(distinct wsp.student_id) into v_writing_students
  from public.bh_writing_student_profiles wsp
  join public.school_members sm on sm.user_id = wsp.student_id
  where sm.school_id = p_school_id and sm.status = 'active';
  select count(distinct iu.id) into v_ielts_students
  from public.ielts_users iu
  join public.school_members sm on sm.user_id = iu.id
  where sm.school_id = p_school_id and sm.status = 'active';

  select coalesce(jsonb_agg(row_data order by grade_sort), '[]'::jsonb)
  into v_grade_performance
  from (
    select
      jsonb_build_object(
        'grade', coalesce(c.grade_level, 'Unassigned'),
        'students', count(distinct cs.student_id),
        'assessments', count(distinct qs.id),
        'average', round(avg(qs.percentage)::numeric, 1)
      ) as row_data,
      case when c.grade_level ~ '^[0-9]+$' then c.grade_level::integer else 999 end as grade_sort
    from public.classes c
    left join public.class_students cs on cs.class_id = c.id
    left join public.quiz_scores qs on qs.student_id = cs.student_id
      and qs.school_id = c.school_id and qs.submitted_at >= v_period_start
      and coalesce(qs.attempt_status, 'completed') <> 'deleted'
    where c.school_id = p_school_id and c.is_active is distinct from false
    group by c.grade_level
  ) grade_rows;

  select jsonb_build_object(
    'plan', bs.plan,
    'status', bs.status,
    'billing_interval', bs.billing_interval,
    'current_period_end', bs.current_period_end,
    'cancel_at_period_end', bs.cancel_at_period_end,
    'is_comp', bs.is_comp,
    'comp_expires_at', bs.comp_expires_at,
    'seat_limit', case
      when coalesce(v_school.settings->>'max_students', '') ~ '^[0-9]+$'
        then (v_school.settings->>'max_students')::integer
      else null
    end,
    'seats_used', v_students
  ) into v_subscription
  from public.billing_subscriptions bs
  where bs.school_id = p_school_id
  order by bs.updated_at desc, bs.created_at desc
  limit 1;

  if v_subscription is null then
    v_subscription := jsonb_build_object(
      'plan', v_school.school_plan,
      'status', case when v_school.trial_ends_at > now() then 'trialing' else 'none' end,
      'billing_interval', null,
      'current_period_end', v_school.trial_ends_at,
      'cancel_at_period_end', false,
      'is_comp', false,
      'comp_expires_at', null,
      'seat_limit', case
        when coalesce(v_school.settings->>'max_students', '') ~ '^[0-9]+$'
          then (v_school.settings->>'max_students')::integer
        else null
      end,
      'seats_used', v_students
    );
  end if;

  select jsonb_build_object('user_id', u.id, 'name', coalesce(nullif(u.full_name, ''), u.username), 'email', u.email)
  into v_head
  from public.school_members sm join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id and sm.is_owner and sm.status = 'active'
  limit 1;

  v_unplaced := greatest(v_students - v_placed_students, 0);
  v_uncovered := greatest(v_classes - v_covered_classes, 0);
  v_unassigned_teachers := greatest(v_teachers - v_assigned_teachers, 0);

  if v_unplaced > 0 then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'unplaced_students', 'severity', 'critical', 'count', v_unplaced,
    'title', 'Students need class placement', 'description', format('%s active student(s) are not connected to an active class.', v_unplaced),
    'action', 'Open people & structure', 'destination', 'people'
  )); end if;
  if v_uncovered > 0 then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'uncovered_classes', 'severity', 'warning', 'count', v_uncovered,
    'title', 'Classes need teaching coverage', 'description', format('%s active class(es) have no active teacher assignment.', v_uncovered),
    'action', 'Review staffing coverage', 'destination', 'people'
  )); end if;
  if v_unassigned_teachers > 0 then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'unassigned_teachers', 'severity', 'warning', 'count', v_unassigned_teachers,
    'title', 'Teaching staff need assignments', 'description', format('%s teaching account(s) have no active class-subject assignment.', v_unassigned_teachers),
    'action', 'Review teacher assignments', 'destination', 'people'
  )); end if;
  if v_inactive_students_14d > 0 then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'inactive_students', 'severity', 'warning', 'count', v_inactive_students_14d,
    'title', 'Student engagement needs attention', 'description', format('%s student(s) have been inactive for at least 14 days.', v_inactive_students_14d),
    'action', 'Review engagement', 'destination', 'academic'
  )); end if;
  if v_pending_admissions > 0 then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'pending_admissions', 'severity', 'notice', 'count', v_pending_admissions,
    'title', 'Admissions require review', 'description', format('%s candidate record(s) are still in an active review stage.', v_pending_admissions),
    'action', 'Open Admissions', 'destination', 'programs'
  )); end if;
  if coalesce((v_subscription->>'cancel_at_period_end')::boolean, false) then v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
    'id', 'subscription_cancellation', 'severity', 'critical', 'count', 1,
    'title', 'Subscription is set to end', 'description', 'The current school subscription is scheduled to stop at the end of the billing period.',
    'action', 'Review subscription', 'destination', 'subscription'
  )); end if;

  return jsonb_build_object(
    'success', true,
    'account_type', 'school_head',
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'logo_url', v_school.logo_url, 'status', v_school.status),
    'head', v_head,
    'period', jsonb_build_object('days', v_days, 'start', v_period_start, 'end', now()),
    'totals', jsonb_build_object('students', v_students, 'teachers', v_teachers, 'admins', v_admins, 'classes', v_classes, 'subjects', v_subjects),
    'engagement', jsonb_build_object(
      'active_students_7d', v_active_students_7d, 'active_students_30d', v_active_students_30d,
      'inactive_students_14d', v_inactive_students_14d, 'active_teachers_7d', v_active_teachers_7d
    ),
    'structure', jsonb_build_object(
      'placed_students', v_placed_students, 'covered_classes', v_covered_classes,
      'assigned_teachers', v_assigned_teachers
    ),
    'academics', jsonb_build_object(
      'average', v_academic_average, 'previous_average', v_previous_average,
      'assignment_total', v_assignment_total, 'assignment_completed', v_assignment_completed,
      'completion_rate', v_assignment_rate, 'grade_performance', v_grade_performance
    ),
    'admissions', jsonb_build_object(
      'total_candidates', v_admission_total, 'pending_candidates', v_pending_admissions,
      'completed_attempts', v_admission_completed, 'average', v_admission_average
    ),
    'programs', jsonb_build_object(
      'cambridge_attempts', v_cambridge_attempts, 'writing_students', v_writing_students,
      'ielts_students', v_ielts_students, 'admission_candidates', v_admission_total
    ),
    'subscription', v_subscription,
    'decisions', v_decisions,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.school_head_get_executive_snapshot(uuid, integer) from public, anon, authenticated;
grant execute on function public.school_head_get_executive_snapshot(uuid, integer) to authenticated;

create or replace function public.school_head_list_governance_audit(
  p_school_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', audit.id,
      'event_type', audit.event_type,
      'category', audit.category,
      'severity', audit.severity,
      'summary', audit.summary,
      'reason', audit.reason,
      'metadata', audit.metadata,
      'created_at', audit.created_at,
      'actor', case when actor.id is null then null else jsonb_build_object('user_id', actor.id, 'name', coalesce(nullif(actor.full_name, ''), actor.username)) end,
      'target', case when target.id is null then null else jsonb_build_object('user_id', target.id, 'name', coalesce(nullif(target.full_name, ''), target.username)) end
    ) order by audit.created_at desc, audit.id desc)
    from (
      select * from public.school_governance_audit_log log
      where log.school_id = p_school_id and (p_before is null or log.created_at < p_before)
      order by log.created_at desc, log.id desc
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) audit
    left join public.users actor on actor.id = audit.actor_user_id
    left join public.users target on target.id = audit.target_user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.school_head_list_governance_audit(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.school_head_list_governance_audit(uuid, integer, timestamptz) to authenticated;

create or replace function public.school_head_transfer_ownership(
  p_school_id uuid,
  p_new_head_user_id uuid,
  p_confirmation_text text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_school_name text;
  v_current public.school_members%rowtype;
  v_target public.school_members%rowtype;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  if not public.is_school_owner(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'Only the current School Head can transfer ownership.');
  end if;
  if p_new_head_user_id is null or p_new_head_user_id = v_actor then
    return jsonb_build_object('success', false, 'error', 'Choose another active school administrator.');
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a clear reason of at least 12 characters.');
  end if;

  select name into v_school_name from public.schools where id = p_school_id for update;
  if v_school_name is null then return jsonb_build_object('success', false, 'error', 'School not found.'); end if;
  if trim(coalesce(p_confirmation_text, '')) <> v_school_name then
    return jsonb_build_object('success', false, 'error', 'Type the exact school name to confirm ownership transfer.');
  end if;

  select * into v_current from public.school_members
  where school_id = p_school_id and user_id = v_actor and status = 'active' and is_owner
  for update;
  if v_current.id is null then
    return jsonb_build_object('success', false, 'error', 'Your School Head authority could not be verified.');
  end if;

  select * into v_target from public.school_members
  where school_id = p_school_id and user_id = p_new_head_user_id and status = 'active'
  for update;
  if v_target.id is null or v_target.role_in_school <> 'school_admin' or v_target.is_owner then
    return jsonb_build_object('success', false, 'error', 'The new School Head must be an active delegated school administrator.');
  end if;

  update public.school_members set is_owner = false, updated_at = now() where id = v_current.id;
  update public.school_members set is_owner = true, updated_at = now() where id = v_target.id;

  insert into public.school_governance_audit_log (
    school_id, actor_user_id, target_user_id, event_type, category, severity, summary, reason, metadata
  ) values (
    p_school_id,
    v_actor,
    p_new_head_user_id,
    'school_head_transferred',
    'ownership',
    'critical',
    'School Head ownership was transferred',
    trim(p_reason),
    jsonb_build_object('previous_head_user_id', v_actor, 'new_head_user_id', p_new_head_user_id)
  );

  return jsonb_build_object(
    'success', true,
    'message', 'School Head ownership transferred. Your account remains a delegated school administrator.',
    'new_head_user_id', p_new_head_user_id
  );
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'Ownership changed during this request. Refresh and try again.');
end;
$$;

revoke all on function public.school_head_transfer_ownership(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.school_head_transfer_ownership(uuid, uuid, text, text) to authenticated;

-- Establish a visible starting point without duplicating one on reruns.
insert into public.school_governance_audit_log (
  school_id, actor_user_id, target_user_id, event_type, category, severity, summary, metadata
)
select sm.school_id, sm.user_id, sm.user_id, 'school_head_established', 'ownership', 'notice',
       'Protected School Head account established', jsonb_build_object('source', 'school_members.is_owner')
from public.school_members sm
where sm.is_owner and sm.status = 'active'
  and not exists (
    select 1 from public.school_governance_audit_log audit
    where audit.school_id = sm.school_id and audit.event_type = 'school_head_established'
  );

comment on function public.school_head_get_executive_snapshot(uuid, integer) is
  'Fail-closed School Head executive snapshot. Returns only aggregated, school-scoped governance data.';
comment on function public.school_head_transfer_ownership(uuid, uuid, text, text) is
  'Protected ownership transfer requiring the current owner, exact school-name confirmation, an active delegated administrator, and an audit reason.';
