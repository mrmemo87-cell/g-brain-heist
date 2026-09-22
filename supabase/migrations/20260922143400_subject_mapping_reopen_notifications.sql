-- Re-alert platform operations only when a previously resolved/dismissed academic
-- mapping request genuinely becomes pending again. Normal edits while already
-- pending remain silent; the initial insert is already queued by the save RPC.

create or replace function private.queue_reopened_school_subject_mapping_request()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school_name text;
  v_subject_name text;
begin
  if old.status in ('resolved','dismissed') and new.status='pending' then
    select s.name into v_school_name
    from public.schools s
    where s.id=new.school_id;

    select ss.name into v_subject_name
    from public.school_subjects ss
    where ss.id=new.school_subject_id and ss.school_id=new.school_id;

    insert into public.transactional_email_outbox(
      event_type,category,audience,recipient_user_id,recipient_email,school_id,
      school_name_override,template_key,template_version,payload,idempotency_key,
      available_at,status
    ) values (
      'school_subject_mapping_requested','platform_operations','platform_owner',null,null,new.school_id,
      v_school_name,'owner_school_request','professional-v1',
      jsonb_build_object(
        'school_name',v_school_name,
        'school_id',new.school_id,
        'subject',v_subject_name,
        'status','Academic mapping needed: '||coalesce(v_subject_name,'School subject'),
        'request_id',new.id,
        'school_subject_id',new.school_subject_id,
        'mapping_request_id',new.id
      ),
      'school-subject-mapping-reopened:'||new.id::text||':'||extract(epoch from new.requested_at)::bigint::text,
      now(),'pending'
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.queue_reopened_school_subject_mapping_request()
  from public,anon,authenticated,service_role;

drop trigger if exists trg_queue_reopened_school_subject_mapping_request
  on public.school_subject_mapping_requests;
create trigger trg_queue_reopened_school_subject_mapping_request
after update of status on public.school_subject_mapping_requests
for each row
execute function private.queue_reopened_school_subject_mapping_request();
