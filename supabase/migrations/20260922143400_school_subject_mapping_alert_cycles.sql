-- School Subjects v2 / mapping-attention notification cycles.
--
-- An unmapped subject should notify platform operations once per genuine
-- transition into "needs mapping". Ordinary edits while it remains unmapped
-- must not create duplicate emails, while a later mapped -> unmapped transition
-- must create a fresh alert.

alter table public.school_subject_mapping_requests
  add column if not exists alert_cycle uuid not null default gen_random_uuid();

comment on column public.school_subject_mapping_requests.alert_cycle is
  'Stable idempotency token for the current needs-mapping episode. Rotates only when a non-pending request becomes pending again.';

create or replace function private.rotate_school_subject_mapping_alert_cycle()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='pending' and old.status is distinct from 'pending' then
    new.alert_cycle:=gen_random_uuid();
  end if;
  return new;
end;
$$;
revoke all on function private.rotate_school_subject_mapping_alert_cycle()
  from public,anon,authenticated,service_role;

drop trigger if exists trg_rotate_school_subject_mapping_alert_cycle
  on public.school_subject_mapping_requests;
create trigger trg_rotate_school_subject_mapping_alert_cycle
before update of status on public.school_subject_mapping_requests
for each row execute function private.rotate_school_subject_mapping_alert_cycle();

create or replace function private.normalize_school_subject_mapping_outbox_key()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_request_id uuid;
  v_alert_cycle uuid;
begin
  if new.event_type is distinct from 'school_subject_mapping_requested' then
    return new;
  end if;

  begin
    v_request_id:=nullif(new.payload->>'mapping_request_id','')::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  if v_request_id is null then
    return new;
  end if;

  select request.alert_cycle
  into v_alert_cycle
  from public.school_subject_mapping_requests request
  where request.id=v_request_id;

  if v_alert_cycle is not null then
    new.idempotency_key:='school-subject-mapping-request:'||v_alert_cycle::text;
  end if;

  return new;
end;
$$;
revoke all on function private.normalize_school_subject_mapping_outbox_key()
  from public,anon,authenticated,service_role;

drop trigger if exists trg_normalize_school_subject_mapping_outbox_key
  on public.transactional_email_outbox;
create trigger trg_normalize_school_subject_mapping_outbox_key
before insert on public.transactional_email_outbox
for each row execute function private.normalize_school_subject_mapping_outbox_key();
