-- Phase 3: reviewed, effective-dated student placement history.
--
-- This migration is additive. It never rewrites a current placement during
-- backfill or scanning. Existing migration reconciliations are surfaced as
-- open exceptions for a human decision.

create table if not exists public.school_student_placement_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_user_id uuid not null references public.users(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete restrict,
  event_type text not null,
  from_class_id uuid references public.classes(id) on delete set null,
  from_class_code text,
  from_grade text,
  to_class_id uuid references public.classes(id) on delete set null,
  to_class_code text,
  to_grade text,
  reason text not null,
  effective_date date not null,
  recorded_at timestamptz not null default now(),
  source_audit_id uuid unique references public.school_student_placement_audit(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.school_student_placement_history
  drop constraint if exists school_student_placement_history_event_check;
alter table public.school_student_placement_history
  add constraint school_student_placement_history_event_check
  check (event_type in ('baseline','assigned','transferred','unassigned','confirmed','legacy_reconciliation')) not valid;
alter table public.school_student_placement_history
  drop constraint if exists school_student_placement_history_reason_check;
alter table public.school_student_placement_history
  add constraint school_student_placement_history_reason_check
  check (length(trim(reason)) >= 3) not valid;

create index if not exists school_student_placement_history_school_student_idx
  on public.school_student_placement_history(school_id, student_user_id, effective_date desc, recorded_at desc);

create table if not exists public.school_student_placement_exceptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_user_id uuid not null references public.users(id) on delete restrict,
  issue_code text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  observed_class_id uuid references public.classes(id) on delete set null,
  expected_class_id uuid references public.classes(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  source_audit_id uuid references public.school_student_placement_audit(id) on delete restrict,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete restrict,
  resolution_action text,
  resolution_note text,
  resolution_effective_date date
);

alter table public.school_student_placement_exceptions
  drop constraint if exists school_student_placement_exceptions_status_check;
alter table public.school_student_placement_exceptions
  add constraint school_student_placement_exceptions_status_check
  check (status in ('open','resolved')) not valid;
alter table public.school_student_placement_exceptions
  drop constraint if exists school_student_placement_exceptions_severity_check;
alter table public.school_student_placement_exceptions
  add constraint school_student_placement_exceptions_severity_check
  check (severity in ('low','medium','high','critical')) not valid;

create unique index if not exists school_student_placement_one_open_exception_idx
  on public.school_student_placement_exceptions(school_id, student_user_id, issue_code)
  where status = 'open';
create index if not exists school_student_placement_exception_queue_idx
  on public.school_student_placement_exceptions(school_id, status, severity, opened_at desc);

alter table public.school_student_placement_history enable row level security;
alter table public.school_student_placement_exceptions enable row level security;
revoke all on public.school_student_placement_history from public, anon, authenticated, service_role;
revoke all on public.school_student_placement_exceptions from public, anon, authenticated, service_role;
grant select on public.school_student_placement_history to authenticated;
grant select on public.school_student_placement_exceptions to authenticated;
grant all on public.school_student_placement_history to service_role;
grant all on public.school_student_placement_exceptions to service_role;

drop policy if exists phase3_school_admin_history_select on public.school_student_placement_history;
create policy phase3_school_admin_history_select on public.school_student_placement_history
for select to authenticated using (public.can_administer_school(school_id));
drop policy if exists phase3_school_admin_exceptions_select on public.school_student_placement_exceptions;
create policy phase3_school_admin_exceptions_select on public.school_student_placement_exceptions
for select to authenticated using (public.can_administer_school(school_id));

create or replace function private.phase3_immutable_placement_record()
returns trigger language plpgsql security definer set search_path=''
as $$ begin raise exception using errcode='55000', message='placement_history_is_immutable'; end $$;
revoke all on function private.phase3_immutable_placement_record() from public, anon, authenticated, service_role;
drop trigger if exists trg_phase3_history_immutable on public.school_student_placement_history;
create trigger trg_phase3_history_immutable before update or delete on public.school_student_placement_history
for each row execute function private.phase3_immutable_placement_record();

-- Preserve the current state as a baseline, but do not infer a move that was
-- never recorded. The unique metadata key makes the backfill idempotent.
insert into public.school_student_placement_history (
  school_id, student_user_id, actor_user_id, event_type,
  to_class_id, to_class_code, to_grade, reason, effective_date, metadata
)
select c.school_id, cs.student_id, null, 'baseline', c.id, c.class_code,
       c.grade_level::text, 'Phase 3 current-placement baseline', current_date,
       jsonb_build_object('baseline_key','phase3_20260808')
from public.class_students cs
join public.classes c on c.id=cs.class_id
join public.school_members sm on sm.user_id=cs.student_id and sm.school_id=c.school_id
  and sm.status='active' and sm.role_in_school='student'
where not exists (
  select 1 from public.school_student_placement_history h
  where h.student_user_id=cs.student_id and h.metadata->>'baseline_key'='phase3_20260808'
);

-- Import the earlier migration's append-only evidence. Those five known live
-- rows become explicit open review items rather than being silently reversed.
insert into public.school_student_placement_history (
  school_id, student_user_id, actor_user_id, event_type,
  from_class_id, from_class_code, from_grade,
  to_class_id, to_class_code, to_grade,
  reason, effective_date, recorded_at, source_audit_id, metadata
)
select a.school_id, a.student_user_id, a.actor_user_id, 'legacy_reconciliation',
       case when cardinality(a.from_class_ids)=1 then a.from_class_ids[1] end,
       a.previous_batch, a.previous_grade, a.to_class_id, a.new_batch, a.new_grade,
       'Legacy migration reconciliation pending administrator review',
       a.created_at::date, a.created_at, a.id,
       jsonb_build_object('original_reason',a.reason,'from_class_ids',a.from_class_ids)
from public.school_student_placement_audit a
where a.reason='migration_reconciliation'
on conflict (source_audit_id) do nothing;

insert into public.school_student_placement_exceptions (
  school_id, student_user_id, issue_code, severity, observed_class_id,
  evidence, source_audit_id
)
select a.school_id, a.student_user_id,
       case when cardinality(a.from_class_ids)>1 then 'legacy_multiple_class_reconciliation' else 'legacy_profile_reconciliation' end,
       case when cardinality(a.from_class_ids)>1 then 'high' else 'medium' end,
       a.to_class_id,
       jsonb_build_object(
         'previous_grade',a.previous_grade,'new_grade',a.new_grade,
         'previous_batch',a.previous_batch,'new_batch',a.new_batch,
         'from_class_ids',a.from_class_ids
       ), a.id
from public.school_student_placement_audit a
where a.reason='migration_reconciliation'
  and not exists (
    select 1 from public.school_student_placement_exceptions e
    where e.source_audit_id=a.id
  );

create or replace function private.phase3_open_placement_exception(
  p_school_id uuid, p_student_id uuid, p_code text, p_severity text,
  p_observed_class_id uuid, p_expected_class_id uuid, p_evidence jsonb
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  insert into public.school_student_placement_exceptions(
    school_id,student_user_id,issue_code,severity,observed_class_id,expected_class_id,evidence
  ) values (
    p_school_id,p_student_id,p_code,p_severity,p_observed_class_id,p_expected_class_id,coalesce(p_evidence,'{}'::jsonb)
  ) on conflict (school_id,student_user_id,issue_code) where status='open'
    do update set severity=excluded.severity, observed_class_id=excluded.observed_class_id,
      expected_class_id=excluded.expected_class_id, evidence=excluded.evidence;
end;
$$;
revoke all on function private.phase3_open_placement_exception(uuid,uuid,text,text,uuid,uuid,jsonb)
from public, anon, authenticated, service_role;

create or replace function public.rpc_school_admin_refresh_placement_exceptions(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_count integer := 0; v_row record;
begin
  if auth.uid() is null or not public.can_administer_school(p_school_id) then
    raise exception using errcode='42501', message='school_administrator_access_required';
  end if;

  for v_row in
    select u.id student_id, cs.class_id, c.class_code, c.grade_level::text class_grade,
           u.batch profile_batch, u.grade::text profile_grade,
           c.is_active,
           count(sm.id) filter(where sm.status='active' and sm.role_in_school='student') active_memberships
    from public.users u
    join public.class_students cs on cs.student_id=u.id
    join public.classes c on c.id=cs.class_id and c.school_id=p_school_id
    left join public.school_members sm on sm.user_id=u.id and sm.school_id=p_school_id
    group by u.id,cs.class_id,c.class_code,c.grade_level,u.batch,u.grade,c.is_active
  loop
    if v_row.active_memberships <> 1 then
      perform private.phase3_open_placement_exception(p_school_id,v_row.student_id,'inactive_or_ambiguous_student_membership','high',v_row.class_id,null,
        jsonb_build_object('active_student_memberships',v_row.active_memberships)); v_count:=v_count+1;
    end if;
    if not coalesce(v_row.is_active,false) then
      perform private.phase3_open_placement_exception(p_school_id,v_row.student_id,'inactive_class_placement','high',v_row.class_id,null,'{}'); v_count:=v_count+1;
    end if;
    if trim(coalesce(v_row.profile_batch,''))<>trim(coalesce(v_row.class_code,''))
       or trim(coalesce(v_row.profile_grade,''))<>trim(coalesce(v_row.class_grade,'')) then
      perform private.phase3_open_placement_exception(p_school_id,v_row.student_id,'profile_class_mismatch','medium',v_row.class_id,v_row.class_id,
        jsonb_build_object('profile_batch',v_row.profile_batch,'class_code',v_row.class_code,'profile_grade',v_row.profile_grade,'class_grade',v_row.class_grade)); v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'issues_observed',v_count);
end;
$$;

create or replace function public.rpc_school_admin_list_placement_exceptions(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select case when public.can_administer_school(p_school_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',e.id,'studentUserId',e.student_user_id,'issueCode',e.issue_code,
      'severity',e.severity,'status',e.status,'observedClassId',e.observed_class_id,
      'expectedClassId',e.expected_class_id,'evidence',e.evidence,'openedAt',e.opened_at
    ) order by case e.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,e.opened_at)
    from public.school_student_placement_exceptions e where e.school_id=p_school_id and e.status='open'
  ),'[]'::jsonb) else '[]'::jsonb end;
$$;

create or replace function public.rpc_school_admin_get_student_placement_review(p_school_id uuid,p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not public.can_administer_school(p_school_id) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  select jsonb_build_object(
    'studentUserId',u.id,'displayName',coalesce(nullif(trim(u.username),''),'Student'),
    'currentClassId',c.id,'currentClassCode',c.class_code,'currentGrade',c.grade_level,
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'fromClassCode',h.from_class_code,
      'toClassCode',h.to_class_code,'reason',h.reason,'effectiveDate',h.effective_date,
      'recordedAt',h.recorded_at) order by h.effective_date desc,h.recorded_at desc)
      from public.school_student_placement_history h where h.school_id=p_school_id and h.student_user_id=u.id),'[]'::jsonb)
  ) into v_result
  from public.users u
  join public.school_members sm on sm.user_id=u.id and sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
  left join public.class_students cs on cs.student_id=u.id
  left join public.classes c on c.id=cs.class_id and c.school_id=p_school_id
  where u.id=p_student_id;
  return coalesce(v_result,jsonb_build_object('error','student_not_found'));
end;
$$;

create or replace function public.rpc_school_admin_transfer_student_placement(
  p_school_id uuid,
  p_student_id uuid,
  p_expected_from_class_id uuid,
  p_to_class_id uuid,
  p_reason text,
  p_effective_date date,
  p_exception_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid(); v_current uuid; v_to public.classes%rowtype; v_from public.classes%rowtype;
  v_memberships integer; v_history uuid;
begin
  if v_actor is null or not public.can_administer_school(p_school_id) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then return jsonb_build_object('success',false,'code','reason_required','error','Enter a clear placement reason.'); end if;
  if p_effective_date is null then return jsonb_build_object('success',false,'code','effective_date_required','error','Choose an effective date.'); end if;

  -- Global lock order is classes, student, memberships, exception.
  perform 1 from public.classes c where c.id=any(array_remove(array[p_expected_from_class_id,p_to_class_id],null)) order by c.id for update;
  select c.* into v_to from public.classes c where c.id=p_to_class_id and c.school_id=p_school_id and coalesce(c.is_active,false);
  if v_to.id is null then return jsonb_build_object('success',false,'code','destination_not_found','error','Choose an active class in this school.'); end if;
  select c.* into v_from from public.classes c where c.id=p_expected_from_class_id and c.school_id=p_school_id;

  perform 1 from public.users u where u.id=p_student_id for update;
  if not found then return jsonb_build_object('success',false,'code','student_not_found','error','Student not found.'); end if;
  perform 1 from public.school_members sm where sm.user_id=p_student_id order by sm.school_id,sm.id for update;
  select count(*) into v_memberships from public.school_members sm
  where sm.user_id=p_student_id and sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student';
  if v_memberships<>1 then return jsonb_build_object('success',false,'code','student_membership_review','error','Student membership requires review.'); end if;

  select cs.class_id into v_current from public.class_students cs where cs.student_id=p_student_id for update;
  if v_current is distinct from p_expected_from_class_id then
    return jsonb_build_object('success',false,'code','placement_conflict','error','Placement changed. Refresh and review again.','currentClassId',v_current);
  end if;

  if v_current is distinct from p_to_class_id then
    delete from public.class_students where student_id=p_student_id;
    insert into public.class_students(class_id,student_id) values(p_to_class_id,p_student_id);
  end if;
  update public.users set school_id=p_school_id,grade=v_to.grade_level,batch=v_to.class_code,updated_at=now() where id=p_student_id;
  insert into public.school_student_placement_history(
    school_id,student_user_id,actor_user_id,event_type,from_class_id,from_class_code,from_grade,
    to_class_id,to_class_code,to_grade,reason,effective_date
  ) values (
    p_school_id,p_student_id,v_actor,case when v_current is null then 'assigned' when v_current=p_to_class_id then 'confirmed' else 'transferred' end,
    v_current,v_from.class_code,v_from.grade_level::text,v_to.id,v_to.class_code,v_to.grade_level::text,trim(p_reason),p_effective_date
  ) returning id into v_history;

  if p_exception_id is not null then
    update public.school_student_placement_exceptions set status='resolved',resolved_at=now(),resolved_by=v_actor,
      resolution_action=case when v_current=p_to_class_id then 'confirmed' else 'transferred' end,
      resolution_note=trim(p_reason),resolution_effective_date=p_effective_date
    where id=p_exception_id and school_id=p_school_id and student_user_id=p_student_id and status='open';
  end if;
  return jsonb_build_object('success',true,'historyId',v_history,'classId',v_to.id,'classCode',v_to.class_code,'grade',v_to.grade_level);
end;
$$;

create or replace function public.rpc_school_admin_unassign_student_placement(
  p_school_id uuid,p_student_id uuid,p_expected_from_class_id uuid,
  p_reason text,p_effective_date date,p_exception_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_current uuid; v_from public.classes%rowtype; v_history uuid;
begin
  if v_actor is null or not public.can_administer_school(p_school_id) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or p_effective_date is null then return jsonb_build_object('success',false,'code','review_details_required','error','Reason and effective date are required.'); end if;
  perform 1 from public.classes c where c.id=p_expected_from_class_id order by c.id for update;
  select c.* into v_from from public.classes c where c.id=p_expected_from_class_id and c.school_id=p_school_id;
  perform 1 from public.users u where u.id=p_student_id for update;
  perform 1 from public.school_members sm where sm.user_id=p_student_id order by sm.school_id,sm.id for update;
  select cs.class_id into v_current from public.class_students cs where cs.student_id=p_student_id for update;
  if v_current is distinct from p_expected_from_class_id then return jsonb_build_object('success',false,'code','placement_conflict','error','Placement changed. Refresh and review again.'); end if;
  delete from public.class_students where student_id=p_student_id;
  update public.users set batch=null,updated_at=now() where id=p_student_id;
  insert into public.school_student_placement_history(school_id,student_user_id,actor_user_id,event_type,from_class_id,from_class_code,from_grade,reason,effective_date)
  values(p_school_id,p_student_id,v_actor,'unassigned',v_current,v_from.class_code,v_from.grade_level::text,trim(p_reason),p_effective_date) returning id into v_history;
  if p_exception_id is not null then update public.school_student_placement_exceptions set status='resolved',resolved_at=now(),resolved_by=v_actor,resolution_action='unassigned',resolution_note=trim(p_reason),resolution_effective_date=p_effective_date where id=p_exception_id and school_id=p_school_id and student_user_id=p_student_id and status='open'; end if;
  return jsonb_build_object('success',true,'historyId',v_history);
end;
$$;

create or replace function public.rpc_school_admin_bulk_transfer_student_placements(
  p_school_id uuid,p_student_ids uuid[],p_to_class_id uuid,p_reason text,p_effective_date date
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_student uuid; v_current uuid; v_result jsonb; v_changed integer:=0; v_skipped integer:=0;
begin
  if auth.uid() is null or not public.can_administer_school(p_school_id) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or p_effective_date is null then return jsonb_build_object('success',false,'code','review_details_required','error','Reason and effective date are required.'); end if;
  foreach v_student in array coalesce(p_student_ids,array[]::uuid[]) loop
    select cs.class_id into v_current from public.class_students cs where cs.student_id=v_student;
    v_result:=public.rpc_school_admin_transfer_student_placement(p_school_id,v_student,v_current,p_to_class_id,p_reason,p_effective_date,null);
    if coalesce((v_result->>'success')::boolean,false) then v_changed:=v_changed+1; else v_skipped:=v_skipped+1; end if;
  end loop;
  return jsonb_build_object('success',true,'changed',v_changed,'skipped',v_skipped,'message',format('Reviewed placement saved for %s students; %s require individual review.',v_changed,v_skipped));
end;
$$;

-- Retire unreviewed compatibility writers. All current application callers are
-- moved to the effective-dated APIs in this release.
create or replace function public.move_student_between_classes(p_student_id uuid,p_from_class_id uuid,p_to_class_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Use the reviewed placement workflow with a reason and effective date.'); $$;
create or replace function public.add_student_to_class(p_class_id uuid,p_student_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Use the reviewed placement workflow with a reason and effective date.'); $$;
create or replace function public.remove_student_from_class(p_class_id uuid,p_student_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Use the reviewed placement workflow with a reason and effective date.'); $$;
create or replace function public.bulk_add_students_to_class(p_class_id uuid,p_student_ids uuid[])
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Use the reviewed placement workflow with a reason and effective date.'); $$;
create or replace function public.bulk_remove_students_from_class(p_class_id uuid,p_student_ids uuid[])
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Use the reviewed placement workflow with a reason and effective date.'); $$;
create or replace function public.auto_enroll_students_by_grade(p_class_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('success',false,'code','reviewed_placement_workflow_required','error','Auto-enrolment requires the reviewed bulk placement workflow.'); $$;
revoke all on function public.move_student_between_classes(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.add_student_to_class(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.remove_student_from_class(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.bulk_add_students_to_class(uuid,uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.bulk_remove_students_from_class(uuid,uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.auto_enroll_students_by_grade(uuid) from public,anon,authenticated,service_role;

-- Direct browser writes bypassed placement mirrors and audit. Current roster
-- reads remain available; every mutation now goes through reviewed RPCs.
revoke all on public.class_students from public, anon, authenticated;
grant select on public.class_students to authenticated;
grant select,insert,update,delete on public.class_students to service_role;
revoke insert,update,delete,truncate on public.student_assignments from public, anon, authenticated;
grant select on public.student_assignments to authenticated;

revoke all on function public.rpc_school_admin_refresh_placement_exceptions(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_school_admin_list_placement_exceptions(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_school_admin_get_student_placement_review(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_school_admin_transfer_student_placement(uuid,uuid,uuid,uuid,text,date,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_school_admin_unassign_student_placement(uuid,uuid,uuid,text,date,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_school_admin_bulk_transfer_student_placements(uuid,uuid[],uuid,text,date) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_refresh_placement_exceptions(uuid) to authenticated;
grant execute on function public.rpc_school_admin_list_placement_exceptions(uuid) to authenticated;
grant execute on function public.rpc_school_admin_get_student_placement_review(uuid,uuid) to authenticated;
grant execute on function public.rpc_school_admin_transfer_student_placement(uuid,uuid,uuid,uuid,text,date,uuid) to authenticated;
grant execute on function public.rpc_school_admin_unassign_student_placement(uuid,uuid,uuid,text,date,uuid) to authenticated;
grant execute on function public.rpc_school_admin_bulk_transfer_student_placements(uuid,uuid[],uuid,text,date) to authenticated;

notify pgrst, 'reload schema';
