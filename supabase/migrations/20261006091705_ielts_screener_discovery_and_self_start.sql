-- Bible v1.2.0: discovery and self-assignment into the EXISTING Exam Mode.
-- No content, keys, transcript, scoring formula or publication bypass.
set lock_timeout = '5s';

create table private.ielts_screener_releases (
  version_id uuid primary key references private.ielts_diagnostic_versions(id) on delete restrict,
  exam_event_id uuid not null unique references public.ielts_exam_events(id) on delete restrict,
  scope text not null check(scope in ('pilot','public')),
  pilot_users uuid[] not null default '{}',
  enabled boolean not null default false,
  published_content_hash text not null,
  audio_sha256 text not null,
  validation_record jsonb not null default '{}',
  authorized_by uuid not null references public.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  check(scope <> 'pilot' or cardinality(pilot_users)>0)
);
alter table private.ielts_screener_releases enable row level security;
revoke all on private.ielts_screener_releases from public,anon,authenticated,service_role;
grant select,insert,update on private.ielts_screener_releases to service_role;

-- A missing school is valid ONLY for an explicitly governed self-service sitting.
alter table public.ielts_exam_assignments add column delivery_kind text not null default 'school'
  check(delivery_kind in ('school','self_service'));
alter table public.ielts_exam_assignments alter column school_id drop not null;
alter table public.ielts_exam_assignments add constraint ielts_assignment_school_context
  check(delivery_kind='self_service' or school_id is not null);
alter table private.ielts_diagnostic_attempt_evidence alter column school_id drop not null;
-- All lifecycle writes are RPC-owned, including legacy school delivery.
revoke all on public.ielts_exam_assignments,public.ielts_exam_attempts,public.ielts_exam_drafts,
  public.ielts_exam_submissions,public.ielts_exam_incidents from anon,authenticated;
grant select on public.ielts_exam_assignments,public.ielts_exam_attempts,public.ielts_exam_drafts,
  public.ielts_exam_submissions,public.ielts_exam_incidents to authenticated;

create function private.guard_ielts_screener_release() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; k text;
begin
  select * into v from private.ielts_diagnostic_versions where id=new.version_id for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id;
  if v.state is distinct from 'published' or v.mode<>'screener' or v.skills<>array['listening']::text[]
     or f.exam_event_id is distinct from new.exam_event_id
     or v.content_hash is distinct from new.published_content_hash
     or v.audio_provenance->>'sha256' is distinct from new.audio_sha256
     or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
     or v.audio_provenance->>'rights_holder' is distinct from 'Brains Heist LLC' then
    raise exception 'screener_release_version_mismatch';
  end if;
  if not exists(select 1 from public.ielts_exam_events where id=new.exam_event_id and school_id is null) then
    raise exception 'self_service_event_required';
  end if;
  if tg_op='UPDATE' and (new.version_id,new.exam_event_id,new.published_content_hash,new.audio_sha256)
    is distinct from (old.version_id,old.exam_event_id,old.published_content_hash,old.audio_sha256) then
    raise exception 'screener_release_identity_immutable';
  end if;
  -- A controlled pilot is allowed to establish delivery evidence. Broad release
  -- is impossible until the exact published content/audio has a recorded pass.
  if new.enabled and new.scope='public' then
    if new.validation_record->>'content_hash' is distinct from new.published_content_hash
       or new.validation_record->>'audio_sha256' is distinct from new.audio_sha256
       or nullif(new.validation_record->>'tested_at','') is null
       or nullif(new.validation_record->>'evidence_reference','') is null then
      raise exception 'screener_controlled_validation_required';
    end if;
    foreach k in array array['authenticated_entitlement','start_resume','audio_loading','reading_intervals',
      'response_intervals','pause_replay','autosave','refresh_resume','network_interruption',
      'background_interruption','submission','idempotency','server_scoring','protected_content',
      'result_safety','completed_persistence','mobile_browser','desktop_browser','automated_checks'] loop
      if new.validation_record->k is distinct from 'true'::jsonb then
        raise exception 'screener_validation_failed:%',k;
      end if;
    end loop;
  end if;
  return new;
end; $$;
revoke all on function private.guard_ielts_screener_release() from public,anon,authenticated,service_role;
create trigger guard_ielts_screener_release before insert or update on private.ielts_screener_releases
for each row execute function private.guard_ielts_screener_release();

create function private.ielts_screener_release_eligible(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from private.ielts_screener_releases r
    join private.ielts_diagnostic_versions v on v.id=r.version_id
    join public.ielts_exam_forms f on f.id=v.exam_form_id
    join public.users u on u.id=auth.uid()
    where r.exam_event_id=p_event and r.enabled and v.state='published' and f.is_active
      and not coalesce(u.is_banned,false)
      and (r.scope='public' or auth.uid()=any(r.pilot_users))
      and v.content_hash=r.published_content_hash and v.audio_provenance->>'sha256'=r.audio_sha256
  );
$$;
revoke all on function private.ielts_screener_release_eligible(uuid) from public,anon,authenticated,service_role;

create function private.ielts_self_screener_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.ielts_exam_assignments a
    join private.ielts_screener_releases r on r.exam_event_id=a.exam_event_id
    join private.ielts_diagnostic_versions v on v.id=r.version_id and v.exam_form_id=a.form_id
    join public.users u on u.id=a.student_id
    where a.id=p_assignment and a.delivery_kind='self_service' and a.student_id=auth.uid()
      and not coalesce(u.is_banned,false) and v.state='published'
      and v.content_hash=r.published_content_hash
  );
$$;
revoke all on function private.ielts_self_screener_assignment(uuid) from public,anon,authenticated,service_role;

create function private.guard_ielts_self_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.delivery_kind='self_service' and
    (new.id,new.exam_event_id,new.student_id,new.school_id,new.class_id,new.form_id,new.delivery_kind)
    is distinct from (old.id,old.exam_event_id,old.student_id,old.school_id,old.class_id,old.form_id,old.delivery_kind) then
    raise exception 'screener_assignment_identity_immutable';
  end if;
  if (tg_op='INSERT' or old.delivery_kind is distinct from new.delivery_kind) and new.delivery_kind='self_service' then
    if not private.ielts_screener_release_eligible(new.exam_event_id)
      or new.student_id is distinct from auth.uid() or new.class_id is not null
      or new.school_id is distinct from (select school_id from public.users where id=auth.uid())
      or not exists(select 1 from private.ielts_screener_releases r
        join private.ielts_diagnostic_versions v on v.id=r.version_id
        where r.exam_event_id=new.exam_event_id and v.exam_form_id=new.form_id) then
      raise exception using errcode='42501',message='screener_assignment_not_authorized';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.guard_ielts_self_assignment() from public,anon,authenticated,service_role;
create trigger guard_ielts_self_assignment before insert or update on public.ielts_exam_assignments
for each row execute function private.guard_ielts_self_assignment();

-- Free screener access is scoped to the exact released form. Other school
-- programme writes continue through their existing entitlement boundary.
create or replace function private.enforce_ielts_module_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_school_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'anon' then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if tg_table_name='ielts_exam_assignments' and tg_op<>'DELETE' then
    v_row:=to_jsonb(new);
    if v_row->>'delivery_kind'='self_service' and (
      private.ielts_self_screener_assignment((v_row->>'id')::uuid)
      or (tg_op='INSERT' and private.ielts_screener_release_eligible((v_row->>'exam_event_id')::uuid)
        and (v_row->>'student_id')::uuid=auth.uid())
    ) then return new; end if;
  end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id:=nullif(v_row->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts') then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
revoke all on function private.enforce_ielts_module_row() from public,anon,authenticated,service_role;

-- Metadata only: no form content, private review records, keys or transcript.
create function public.rpc_ielts_screener_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and not coalesce(is_banned,false)) then
    raise exception using errcode='42501',message='not_authenticated';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'title',d.title,'code',d.code,'exam_event_id',e.id,'assignment_id',a.id,'attempt_id',t.id,
    'status',case when t.status in ('submitted','auto_submitted') then 'completed'
      when t.status='void' or a.status='void' then 'unavailable'
      when t.status='in_progress' then case when now()>=t.ends_at then 'expired' else 'in_progress' end
      when e.status='paused' then 'paused'
      when e.status='scheduled' or now()<e.starts_at then 'scheduled'
      when e.status='live' and now()<e.ends_at then 'ready' else 'unavailable' end,
    'duration_minutes',e.duration_minutes,'starts_at',e.starts_at
  ) order by r.authorized_at desc)
    from private.ielts_screener_releases r
    join private.ielts_diagnostic_versions v on v.id=r.version_id
    join private.ielts_diagnostic_definitions d on d.id=v.definition_id
    join public.ielts_exam_events e on e.id=r.exam_event_id
    left join public.ielts_exam_assignments a on a.exam_event_id=e.id and a.student_id=auth.uid()
    left join public.ielts_exam_attempts t on t.assignment_id=a.id
    where private.ielts_screener_release_eligible(e.id)
      or (a.delivery_kind='self_service' and private.ielts_self_screener_assignment(a.id))),'[]'::jsonb);
end; $$;
revoke all on function public.rpc_ielts_screener_catalog() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_screener_catalog() to authenticated;

create function public.rpc_ielts_screener_self_assign(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.ielts_screener_releases%rowtype; v private.ielts_diagnostic_versions%rowtype;
  e public.ielts_exam_events%rowtype; a public.ielts_exam_assignments%rowtype; t public.ielts_exam_attempts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
  select release.* into r from private.ielts_screener_releases release
    join private.ielts_diagnostic_versions version on version.id=release.version_id
    join private.ielts_diagnostic_definitions d on d.id=version.definition_id
    where d.code=p_code and private.ielts_screener_release_eligible(release.exam_event_id)
    order by release.authorized_at desc limit 1 for share of release;
  if r.version_id is null then raise exception using errcode='42501',message='screener_unavailable'; end if;
  select * into v from private.ielts_diagnostic_versions where id=r.version_id;
  select * into e from public.ielts_exam_events where id=r.exam_event_id for share;
  select * into a from public.ielts_exam_assignments where exam_event_id=e.id and student_id=auth.uid();
  if a.id is null then
    if e.status<>'live' or now()<e.starts_at or now()>=e.ends_at then raise exception 'screener_unavailable'; end if;
    insert into public.ielts_exam_assignments(exam_event_id,student_id,school_id,form_id,delivery_kind)
    select e.id,u.id,u.school_id,v.exam_form_id,'self_service' from public.users u
    where u.id=auth.uid() and not coalesce(u.is_banned,false)
    on conflict(exam_event_id,student_id) do nothing;
    select * into a from public.ielts_exam_assignments where exam_event_id=e.id and student_id=auth.uid();
  end if;
  if not private.ielts_self_screener_assignment(a.id) or a.status='void' then raise exception 'screener_unavailable'; end if;
  select * into t from public.ielts_exam_attempts where assignment_id=a.id;
  return jsonb_build_object('exam_event_id',e.id,'assignment_id',a.id,'attempt_id',t.id);
end; $$;
revoke all on function public.rpc_ielts_screener_self_assign(text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_screener_self_assign(text) to authenticated;

create or replace function public.rpc_ielts_exam_whoami_entitlement_internal(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_assignment public.ielts_exam_assignments%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_form public.ielts_exam_forms%rowtype;
  v_student_school_id uuid;
  v_remaining int := 0;
  v_drafts jsonb := '[]'::jsonb;
  v_content_available boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'server_now', v_now
    );
  end if;

  select u.school_id
  into v_student_school_id
  from public.users u
  where u.id = auth.uid();

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id;

  if v_event.id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'exam_not_found',
      'server_now', v_now
    );
  end if;

  select a.*
  into v_assignment
  from public.ielts_exam_assignments a
  where a.exam_event_id = p_exam_event_id
    and a.student_id = auth.uid()
  limit 1;

  if v_assignment.id is null or (not private.ielts_self_screener_assignment(v_assignment.id) and (
     v_event.school_id is null
     or v_assignment.school_id is distinct from v_event.school_id
     or v_student_school_id is distinct from v_event.school_id)) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_assigned',
      'server_now', v_now
    );
  end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.assignment_id = v_assignment.id;

  select f.*
  into v_form
  from public.ielts_exam_forms f
  where f.id = v_assignment.form_id
    and f.exam_event_id = v_event.id
    and f.is_active = true;

  -- A scheduled event never exposes content merely because its clock reached
  -- starts_at. New/not-started attempts require the confirmed live state and
  -- the event window. An already-running attempt may continue past the shared
  -- event end only when its own (manager-extended) timer is still active.
  -- Terminal assignment/attempt states and expired attempts always fail closed.
  v_content_available := (v_assignment.delivery_kind<>'self_service' or private.ielts_screener_release_eligible(v_event.id))
    and v_form.id is not null
    and v_assignment.status in ('assigned', 'started')
    and (
      (
        v_event.status = 'live'
        and v_now >= v_event.starts_at
        and v_now < v_event.ends_at
        and (
          v_attempt.id is null
          or v_attempt.status = 'not_started'
        )
      )
      or (
        v_event.status in ('live', 'paused')
        and v_attempt.status = 'in_progress'
        and v_attempt.ends_at is not null
        and v_now < v_attempt.ends_at
      )
    );

  if v_attempt.id is not null and v_attempt.ends_at is not null then
    v_remaining := greatest(
      0,
      floor(extract(epoch from (v_attempt.ends_at - v_now)))::int
    );

    if v_content_available then
      select coalesce(jsonb_agg(jsonb_build_object(
        'section', d.section,
        'payload', d.payload,
        'draft_version', d.draft_version,
        'server_saved_at', d.server_saved_at,
        'client_saved_at', d.client_saved_at
      ) order by d.section), '[]'::jsonb)
      into v_drafts
      from public.ielts_exam_drafts d
      where d.attempt_id = v_attempt.id;
    end if;
  else
    v_remaining := greatest(
      0,
      floor(extract(epoch from (v_event.ends_at - v_now)))::int
    );
  end if;

  return jsonb_build_object(
    'allowed', v_content_available,
    'reason', case
      when v_assignment.status = 'void' then 'assignment_void'
      when v_event.status not in ('live', 'paused') then 'exam_not_available'
      when v_form.id is null then 'form_unavailable'
      when not v_content_available then 'exam_not_available'
      else 'ok'
    end,
    'exam_event_id', v_event.id,
    'assignment_id', v_assignment.id,
    'attempt_id', v_attempt.id,
    'status', coalesce(v_attempt.status, v_assignment.status),
    'attempt_status', coalesce(v_attempt.status, v_assignment.status),
    'event_status', v_event.status,
    'server_now', v_now,
    'starts_at', v_event.starts_at,
    'ends_at', coalesce(v_attempt.ends_at, v_event.ends_at),
    'remaining_seconds', v_remaining,
    'form_public_payload', case
      when not v_content_available then null
      else jsonb_build_object(
        'id', v_form.id,
        'form_code', v_form.form_code,
        'reading_payload', v_form.reading_payload,
        'listening_payload', v_form.listening_payload,
        'writing_payload', v_form.writing_payload,
        'speaking_payload', v_form.speaking_payload
      )
    end,
    'drafts', v_drafts
  );
end;
$$;
revoke all on function public.rpc_ielts_exam_whoami_entitlement_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_ielts_start_attempt_entitlement_internal(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_assignment public.ielts_exam_assignments%rowtype;
  v_event public.ielts_exam_events%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_student_school_id uuid;
  v_lock_token text;
  v_ends_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select u.school_id
  into v_student_school_id
  from public.users u
  where u.id = auth.uid();

  select a.*
  into v_assignment
  from public.ielts_exam_assignments a
  where a.id = p_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'assignment_not_found';
  end if;
  if v_assignment.student_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_assignment.status = 'void' then
    raise exception 'assignment_void';
  end if;
  if v_assignment.status not in ('assigned', 'started') then
    raise exception 'assignment_not_startable';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = v_assignment.exam_event_id;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if not private.ielts_self_screener_assignment(v_assignment.id) and (
     v_event.school_id is null
     or v_assignment.school_id is distinct from v_event.school_id
     or v_student_school_id is distinct from v_event.school_id) then
    raise exception 'forbidden';
  end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.assignment_id = p_assignment_id
  for update;

  if v_assignment.delivery_kind='self_service' and not private.ielts_screener_release_eligible(v_event.id) then raise exception 'screener_unavailable'; end if;

  if v_event.status <> 'live' then
    raise exception 'exam_not_startable';
  end if;

  if v_attempt.id is null or v_attempt.status = 'not_started' then
    if v_now < v_event.starts_at or v_now >= v_event.ends_at then
      raise exception 'outside_exam_window';
    end if;
  elsif v_attempt.status = 'in_progress' then
    if v_attempt.ends_at is null or v_now >= v_attempt.ends_at then
      raise exception 'attempt_expired';
    end if;
  else
    raise exception 'attempt_not_startable';
  end if;

  if not exists (
    select 1
    from public.ielts_exam_forms f
    where f.id = v_assignment.form_id
      and f.exam_event_id = v_event.id
      and f.is_active = true
  ) then
    raise exception 'form_unavailable';
  end if;

  if v_attempt.id is null then
    v_lock_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_ends_at := least(
      v_now + make_interval(mins => v_event.duration_minutes),
      v_event.ends_at
    );

    insert into public.ielts_exam_attempts (
      assignment_id,
      exam_event_id,
      student_id,
      form_id,
      status,
      started_at,
      ends_at,
      last_heartbeat_at,
      lock_token
    ) values (
      v_assignment.id,
      v_assignment.exam_event_id,
      v_assignment.student_id,
      v_assignment.form_id,
      'in_progress',
      v_now,
      v_ends_at,
      v_now,
      v_lock_token
    )
    returning * into v_attempt;

    update public.ielts_exam_assignments a
    set status = 'started'
    where a.id = v_assignment.id;
  elsif v_attempt.status = 'not_started' then
    v_lock_token := coalesce(
      v_attempt.lock_token,
      encode(extensions.gen_random_bytes(32), 'hex')
    );
    v_ends_at := least(
      v_now + make_interval(mins => v_event.duration_minutes),
      v_event.ends_at
    );

    update public.ielts_exam_attempts a
    set status = 'in_progress',
        started_at = coalesce(a.started_at, v_now),
        ends_at = coalesce(a.ends_at, v_ends_at),
        last_heartbeat_at = v_now,
        lock_token = v_lock_token,
        updated_at = v_now
    where a.id = v_attempt.id
    returning * into v_attempt;

    update public.ielts_exam_assignments a
    set status = 'started'
    where a.id = v_assignment.id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assignment_id', v_attempt.assignment_id,
    'exam_event_id', v_attempt.exam_event_id,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'ends_at', v_attempt.ends_at,
    'server_now', v_now,
    'remaining_seconds', greatest(
      0,
      floor(extract(epoch from (v_attempt.ends_at - v_now)))::int
    ),
    'lock_token', v_attempt.lock_token
  );
end;
$$;
revoke all on function public.rpc_ielts_start_attempt_entitlement_internal(uuid) from public,anon,authenticated,service_role;

-- Expiry uses only the last SERVER-SAVED answers; late browser claims cannot
-- extend time or change an expired self-service score. The existing submission
-- path still owns locking, idempotency, persistence and governed scoring.
create function private.finalize_expired_ielts_screener(p_event uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t public.ielts_exam_attempts%rowtype; payload jsonb;
begin
  select attempt.* into t from public.ielts_exam_attempts attempt
    join public.ielts_exam_assignments a on a.id=attempt.assignment_id
    where a.exam_event_id=p_event and private.ielts_self_screener_assignment(a.id)
      and attempt.status='in_progress' and now()>=attempt.ends_at for update of attempt;
  if t.id is null then return; end if;
  select coalesce(jsonb_object_agg(d.section,d.payload),'{}') into payload
    from public.ielts_exam_drafts d where d.attempt_id=t.id;
  perform public.rpc_ielts_submit_attempt_entitlement_internal(t.id,t.lock_token,payload,'ielts-expiry-'||t.id::text);
end; $$;
revoke all on function private.finalize_expired_ielts_screener(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_ielts_exam_whoami(p_exam_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ielts_exam_assignments a where a.exam_event_id=p_exam_event_id and private.ielts_self_screener_assignment(a.id))
    and not private.actor_can_access_school_programme(private.ielts_exam_event_school(p_exam_event_id),'ielts',false) then
    return jsonb_build_object('allowed',false,'reason','ielts_not_in_school_agreement','server_now',now());
  end if;
  perform private.finalize_expired_ielts_screener(p_exam_event_id);
  return public.rpc_ielts_exam_whoami_entitlement_internal(p_exam_event_id);
end; $$;

create or replace function public.rpc_ielts_start_attempt(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.ielts_self_screener_assignment(p_assignment_id)
    and not private.actor_can_access_school_programme(private.ielts_exam_assignment_school(p_assignment_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_start_attempt_entitlement_internal(p_assignment_id);
end; $$;

create or replace function public.rpc_ielts_autosave_attempt(
  p_attempt_id uuid,p_lock_token text,p_section text,p_payload jsonb,
  p_draft_version integer,p_client_saved_at timestamptz
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ielts_exam_attempts a where a.id=p_attempt_id and private.ielts_self_screener_assignment(a.assignment_id))
    and not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  if exists(select 1 from public.ielts_exam_attempts a join public.ielts_exam_events e on e.id=a.exam_event_id where a.id=p_attempt_id and e.status<>'live') then raise exception 'exam_paused'; end if;
  return public.rpc_ielts_autosave_attempt_entitlement_internal(
    p_attempt_id,p_lock_token,p_section,p_payload,p_draft_version,p_client_saved_at);
end; $$;

create or replace function public.rpc_ielts_submit_attempt(
  p_attempt_id uuid,p_lock_token text,p_payload jsonb,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ielts_exam_attempts%rowtype; safe_payload jsonb:=p_payload;
begin
  if not exists(select 1 from public.ielts_exam_attempts a where a.id=p_attempt_id and private.ielts_self_screener_assignment(a.assignment_id))
    and not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  select * into t from public.ielts_exam_attempts where id=p_attempt_id for update;
  if private.ielts_self_screener_assignment(t.assignment_id) and now()>=t.ends_at then
    select coalesce(jsonb_object_agg(d.section,d.payload),'{}') into safe_payload
      from public.ielts_exam_drafts d where d.attempt_id=t.id;
  end if;
  return public.rpc_ielts_submit_attempt_entitlement_internal(
    p_attempt_id,p_lock_token,safe_payload,p_idempotency_key);
end; $$;

create or replace function public.rpc_ielts_log_incident(
  p_attempt_id uuid,p_lock_token text,p_incident_type text,p_severity text,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ielts_exam_attempts a where a.id=p_attempt_id and private.ielts_self_screener_assignment(a.assignment_id))
    and not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_log_incident_entitlement_internal(
    p_attempt_id,p_lock_token,p_incident_type,p_severity,p_payload);
end; $$;

create or replace function public.rpc_ielts_diagnostic_result(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; a public.ielts_exam_attempts%rowtype; r private.ielts_diagnostic_scoring_runs%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
  select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
  select * into a from public.ielts_exam_attempts where id=p_attempt_id;
  if e.attempt_id is null then return null; end if;
  if not private.ielts_self_screener_assignment(a.assignment_id) and not private.actor_can_access_school_programme(e.school_id,'ielts',false) then raise exception using errcode='42501',message='not_authorized'; end if;
  if e.school_id is null and e.student_id<>auth.uid() then raise exception using errcode='42501',message='not_authorized'; end if;
  if e.student_id<>auth.uid() and not public.can_manage_ielts_exam(a.exam_event_id) and not exists(
    select 1 from public.class_teacher_assignments cta where cta.class_id=e.class_id and cta.school_id=e.school_id
      and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  select * into r from private.ielts_diagnostic_scoring_runs where attempt_id=p_attempt_id order by run_version desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('label','Screener result','mode',e.form_snapshot#>>'{version,mode}',
    'raw_score',r.raw_score,'marks_possible',r.marks_possible,'confidence',r.confidence,'warnings',r.warnings,
    'integrity_state',case when a.status='void' or exists(select 1 from public.ielts_exam_incidents where attempt_id=p_attempt_id)
      then 'review_required' else r.integrity_state end,
    'outcomes',r.outcomes,'next_step','Review the sampled items with your teacher, then gather evidence in the remaining skills.',
    'readiness_available',false,'persistent_weakness_available',false);
end; $$;

-- Publication is an explicit server maintenance action; the existing real
-- publication trigger builds and freezes the reviewed snapshot. No disabled
-- triggers, forced state or directly authored published snapshots.
create function private.publish_ielts_screener(p_version uuid,p_reviewed_hash text,p_audio_sha256 text) returns text
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; candidate text;
begin
  select * into v from private.ielts_diagnostic_versions where id=p_version for update;
  if v.id is null or v.mode<>'screener' or v.skills<>array['listening']::text[] then raise exception 'screener_required'; end if;
  if v.state='published' then
    if v.review_record->>'reviewed_content_hash' is distinct from p_reviewed_hash
      or v.audio_provenance->>'sha256' is distinct from p_audio_sha256 then raise exception 'reviewed_version_mismatch'; end if;
    return v.content_hash;
  end if;
  candidate:=encode(sha256(convert_to((private.ielts_diagnostic_snapshot(v.id)-'version')::text,'UTF8')),'hex');
  if candidate is distinct from p_reviewed_hash or v.review_record->>'reviewed_content_hash' is distinct from p_reviewed_hash
    or v.audio_provenance->>'sha256' is distinct from p_audio_sha256
    or v.review_record->>'reviewed_audio_sha256' is distinct from p_audio_sha256
    or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
    or v.audio_provenance->>'rights_holder' is distinct from 'Brains Heist LLC' then raise exception 'reviewed_version_mismatch'; end if;
  update private.ielts_diagnostic_versions set state='published' where id=v.id returning content_hash into candidate;
  return candidate;
end; $$;
revoke all on function private.publish_ielts_screener(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.publish_ielts_screener(uuid,text,text) to service_role;

create function private.activate_ielts_screener_release(p_version uuid,p_scope text,p_pilot_users uuid[],
  p_authorized_by uuid,p_validation_record jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; e public.ielts_exam_events%rowtype;
begin
  select * into v from private.ielts_diagnostic_versions where id=p_version for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id for update;
  select * into e from public.ielts_exam_events where id=f.exam_event_id for update;
  if v.state is distinct from 'published' or e.school_id is not null then raise exception 'published_self_service_screener_required'; end if;
  if e.status not in ('draft','scheduled','live','paused') then raise exception 'screener_event_not_startable'; end if;
  insert into private.ielts_screener_releases(version_id,exam_event_id,scope,pilot_users,enabled,
    published_content_hash,audio_sha256,validation_record,authorized_by)
  values(v.id,e.id,p_scope,coalesce(p_pilot_users,'{}'),true,v.content_hash,v.audio_provenance->>'sha256',
    coalesce(p_validation_record,'{}'),p_authorized_by)
  on conflict(version_id) do update set scope=excluded.scope,pilot_users=excluded.pilot_users,
    enabled=true,validation_record=excluded.validation_record,authorized_by=excluded.authorized_by,authorized_at=now();
  update public.ielts_exam_forms set is_active=true where id=f.id;
  if e.status='draft' then update public.ielts_exam_events set status='scheduled' where id=e.id; e.status:='scheduled'; end if;
  if e.status in ('scheduled','paused') then
    perform set_config('brainsheist.ielts_live_transition_exam_id',e.id::text,true);
    perform set_config('brainsheist.ielts_live_transition_actor_id',coalesce(auth.uid()::text,''),true);
    perform set_config('brainsheist.ielts_live_transition_action',case when e.status='paused' then 'resume' else 'launch' end,true);
    update public.ielts_exam_events set status='live',starts_at=least(starts_at,now()),
      ends_at=greatest(ends_at,now()+interval '1 year'),updated_at=now() where id=e.id;
    perform set_config('brainsheist.ielts_live_transition_exam_id','',true);
    perform set_config('brainsheist.ielts_live_transition_actor_id','',true);
    perform set_config('brainsheist.ielts_live_transition_action','',true);
  end if;
  insert into public.ielts_exam_audit_log(actor_id,exam_event_id,action,payload)
  values(p_authorized_by,e.id,'governed_screener_release',jsonb_build_object('version_id',v.id,
    'scope',p_scope,'content_hash',v.content_hash,'audio_sha256',v.audio_provenance->>'sha256',
    'validation_record',p_validation_record));
  return e.id;
end; $$;
revoke all on function private.activate_ielts_screener_release(uuid,text,uuid[],uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.activate_ielts_screener_release(uuid,text,uuid[],uuid,jsonb) to service_role;
reset lock_timeout;

revoke all on function public.rpc_ielts_exam_whoami(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_attempt(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_autosave_attempt(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_log_incident(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_diagnostic_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_exam_whoami(uuid) to authenticated;
grant execute on function public.rpc_ielts_start_attempt(uuid) to authenticated;
grant execute on function public.rpc_ielts_autosave_attempt(uuid,text,text,jsonb,integer,timestamptz) to authenticated;
grant execute on function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text) to authenticated;
grant execute on function public.rpc_ielts_log_incident(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.rpc_ielts_diagnostic_result(uuid) to authenticated;

create or replace function public.rpc_ielts_autosave_attempt_entitlement_internal(
  p_attempt_id uuid,
  p_lock_token text,
  p_section text,
  p_payload jsonb,
  p_draft_version int,
  p_client_saved_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_attempt public.ielts_exam_attempts%rowtype;
  v_event_status text;
  v_draft public.ielts_exam_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_section, '')), '') is null then raise exception 'section_required'; end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.id = p_attempt_id
  for update;

  if v_attempt.id is not null then
    select e.status into v_event_status
    from public.ielts_exam_events e
    where e.id = v_attempt.exam_event_id;
  end if;

  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if v_attempt.student_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'attempt_not_in_progress'; end if;
  if v_attempt.lock_token is null or v_attempt.lock_token <> p_lock_token then raise exception 'invalid_lock_token'; end if;
  if v_now > v_attempt.ends_at and v_event_status <> 'paused' then raise exception 'attempt_time_expired'; end if;

  insert into public.ielts_exam_drafts (attempt_id, student_id, section, payload, draft_version, client_saved_at, server_saved_at)
  values (v_attempt.id, v_attempt.student_id, p_section, coalesce(p_payload, '{}'::jsonb), p_draft_version, p_client_saved_at, v_now)
  on conflict (attempt_id, section) do update
    set payload = excluded.payload,
        draft_version = greatest(public.ielts_exam_drafts.draft_version, excluded.draft_version),
        client_saved_at = excluded.client_saved_at,
        server_saved_at = excluded.server_saved_at
    where excluded.draft_version > public.ielts_exam_drafts.draft_version
  returning * into v_draft;

  if v_draft.id is null then
    select * into v_draft from public.ielts_exam_drafts where attempt_id=p_attempt_id and section=p_section;
  end if;

  update public.ielts_exam_attempts
  set last_heartbeat_at = v_now, updated_at = v_now
  where id = v_attempt.id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'section', v_draft.section,
    'draft_version', v_draft.draft_version,
    'server_saved_at', v_draft.server_saved_at,
    'server_now', v_now
  );
end;
$$;
revoke all on function public.rpc_ielts_autosave_attempt_entitlement_internal(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated,service_role;
