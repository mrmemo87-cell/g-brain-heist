-- Professional school application workflow.
-- One active application per requester, applicant replies only when requested,
-- and platform-owner email notifications resolve to verified superadmin accounts.

create unique index if not exists school_requests_one_active_per_requester_uidx
  on public.school_requests(requested_by)
  where status in ('pending', 'needs_more_info');

create or replace function public.request_school_v3(
  p_requested_name text,
  p_requester_role text,
  p_city text,
  p_country text,
  p_website text default null,
  p_contact_email text default null,
  p_notes text default null,
  p_decision_maker_name text default null,
  p_decision_maker_title text default null,
  p_decision_maker_phone text default null,
  p_applicant_authority_confirmed boolean default false,
  p_estimated_students integer default null,
  p_estimated_teachers integer default null,
  p_requested_modules text[] default array['core']::text[],
  p_preferred_payment_method text default null,
  p_billing_contact_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_norm text;
  v_request_id uuid;
  v_existing_request_id uuid;
  v_existing_status text;
  v_suggestions jsonb;
  v_modules text[];
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from auth.users au where au.id=v_user_id and au.email_confirmed_at is not null) then
    raise exception 'Verify your email before submitting a school application';
  end if;
  if exists (select 1 from public.users u where u.id=v_user_id and coalesce(u.is_banned,false)) then raise exception 'Account is suspended'; end if;

  -- A school owner/principal should never accidentally create parallel applications.
  select r.id, r.status
  into v_existing_request_id, v_existing_status
  from public.school_requests r
  where r.requested_by = v_user_id
    and r.status in ('pending','needs_more_info')
  order by r.created_at desc
  limit 1;

  if v_existing_request_id is not null then
    return jsonb_build_object(
      'status', v_existing_status,
      'request_id', v_existing_request_id,
      'message', 'Your existing school application is still under review.',
      'suggestions', '[]'::jsonb
    );
  end if;

  if length(trim(coalesce(p_requested_name,''))) not between 3 and 100 then raise exception 'Invalid school name length'; end if;
  if length(trim(coalesce(p_city,''))) < 2 then raise exception 'City required'; end if;
  if length(trim(coalesce(p_country,''))) < 2 then raise exception 'Country required'; end if;
  if length(trim(coalesce(p_decision_maker_name,''))) < 3 then raise exception 'Decision-maker name required'; end if;
  if length(trim(coalesce(p_decision_maker_title,''))) < 2 then raise exception 'Decision-maker title required'; end if;
  if not coalesce(p_applicant_authority_confirmed,false) then raise exception 'Only an authorised school decision-maker can register a new school'; end if;
  if p_requester_role not in ('student','teacher') then raise exception 'Choose student or teacher as the operational role'; end if;
  if p_estimated_students is not null and p_estimated_students < 1 then raise exception 'Estimated students must be positive'; end if;
  if p_estimated_teachers is not null and p_estimated_teachers < 1 then raise exception 'Estimated teachers must be positive'; end if;
  if p_preferred_payment_method is not null and p_preferred_payment_method not in ('card','cash','bank_transfer','invoice','undecided') then raise exception 'Invalid payment preference'; end if;

  select array_agg(distinct module_key order by module_key) into v_modules
  from unnest(array_append(coalesce(p_requested_modules,'{}'::text[]),'core')) module_key
  where module_key in ('core','cambridge','ielts','writing','admissions');

  v_norm := public.normalize_school_name(trim(p_requested_name));
  select lower(trim(au.email)) into v_email from auth.users au where au.id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug)),'[]'::jsonb)
  into v_suggestions
  from public.schools s
  where s.status='active'
    and (public.normalize_school_name(s.name) like '%'||v_norm||'%' or lower(s.name) like '%'||lower(trim(p_requested_name))||'%');

  if exists(select 1 from public.schools s where public.normalize_school_name(s.name)=v_norm) then
    return jsonb_build_object('status','exists','message','School already exists. Please use the existing school access route.','suggestions',v_suggestions);
  end if;

  if exists(select 1 from public.school_requests r where r.normalized_name=v_norm and r.status in ('pending','needs_more_info')) then
    return jsonb_build_object('status','duplicate_pending','message','A request for this school is already pending review.','suggestions',v_suggestions);
  end if;

  insert into public.school_requests (
    requested_name,normalized_name,requested_by,requester_email,requester_role,status,
    city,country,website,contact_email,notes,decision_maker_name,decision_maker_title,
    decision_maker_phone,applicant_authority_confirmed,estimated_students,estimated_teachers,requested_modules,
    preferred_payment_method,billing_contact_email,created_at,updated_at
  ) values (
    trim(p_requested_name),v_norm,v_user_id,v_email,coalesce(nullif(trim(p_requester_role),''),'teacher'),'pending',
    trim(p_city),trim(p_country),nullif(trim(p_website),''),coalesce(nullif(trim(p_contact_email),''),v_email),
    nullif(trim(p_notes),''),trim(p_decision_maker_name),trim(p_decision_maker_title),nullif(trim(p_decision_maker_phone),''),true,
    p_estimated_students,p_estimated_teachers,v_modules,coalesce(p_preferred_payment_method,'undecided'),
    coalesce(nullif(trim(p_billing_contact_email),''),nullif(trim(p_contact_email),''),v_email),now(),now()
  ) returning id into v_request_id;

  return jsonb_build_object('status','pending','request_id',v_request_id,'suggestions',v_suggestions);
exception
  when unique_violation then
    select r.id, r.status into v_existing_request_id, v_existing_status
    from public.school_requests r
    where r.requested_by = v_user_id and r.status in ('pending','needs_more_info')
    order by r.created_at desc limit 1;
    if v_existing_request_id is not null then
      return jsonb_build_object(
        'status', v_existing_status,
        'request_id', v_existing_request_id,
        'message', 'Your existing school application is still under review.',
        'suggestions', '[]'::jsonb
      );
    end if;
    raise;
end;
$$;

create or replace function public.school_request_reply(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select r.status into v_status
  from public.school_requests r
  where r.id = p_request_id
    and r.requested_by = auth.uid();

  if v_status is null then
    raise exception 'Forbidden';
  end if;
  if v_status <> 'needs_more_info' then
    raise exception 'No reply is needed while your application is under review.';
  end if;
  if char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then
    raise exception 'Reply must be between 1 and 4000 characters.';
  end if;

  insert into public.school_request_messages(request_id, sender_user_id, sender_role, message)
  values (p_request_id, auth.uid(), 'applicant', trim(p_message));

  update public.school_requests
  set status = 'pending', updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.school_request_reply(uuid,text) from public, anon;
grant execute on function public.school_request_reply(uuid,text) to authenticated;

drop policy if exists srm_insert_applicant on public.school_request_messages;
create policy srm_insert_applicant
  on public.school_request_messages for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and sender_role = 'applicant'
    and exists (
      select 1
      from public.school_requests r
      where r.id = school_request_messages.request_id
        and r.requested_by = auth.uid()
        and r.status = 'needs_more_info'
    )
  );

create or replace function public.admin_school_request_need_more_info(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin(auth.uid()) then
    raise exception 'Forbidden';
  end if;
  if char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;
  if not exists (
    select 1 from public.school_requests r
    where r.id = p_request_id and r.status in ('pending','needs_more_info')
  ) then
    raise exception 'This application is no longer awaiting review.';
  end if;

  update public.school_requests
  set status = 'needs_more_info',
      admin_notes = trim(p_message),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  insert into public.school_request_messages(request_id, sender_user_id, sender_role, message)
  values (p_request_id, auth.uid(), 'admin', trim(p_message));
end;
$$;

-- Applicant status emails are sent on submission/status change. Platform-owner alerts
-- are sent once when the application is created and are addressed to each verified
-- superadmin account, so they do not depend on an optional environment email.
create or replace function private.trg_email_school_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.enqueue_transactional_email(
      'school_request_' || new.status,
      'school_operations',
      'applicant',
      'school_request_status',
      'school-request-' || new.id::text || '-' || new.status,
      jsonb_build_object('request_id',new.id,'school_name',new.requested_name,'status',new.status),
      new.requested_by,null,new.approved_school_id,new.requested_name,now()
    );
  end if;

  if tg_op = 'INSERT' then
    for v_owner in
      select au.id
      from auth.users au
      where au.email_confirmed_at is not null
        and public.is_superadmin(au.id)
    loop
      perform private.enqueue_transactional_email(
        'school_request_received',
        'platform_operations',
        'platform_owner',
        'owner_school_request',
        'owner-school-request-' || new.id::text || '-' || v_owner.id::text,
        jsonb_build_object('request_id',new.id,'school_name',new.requested_name,'status',new.status),
        v_owner.id,null,new.approved_school_id,new.requested_name,now()
      );
    end loop;
  end if;

  return new;
end;
$$;
