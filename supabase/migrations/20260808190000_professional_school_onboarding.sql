-- Professional new-school onboarding, optional programme access, manual billing,
-- approved-class self-enrolment and pending-account lifecycle.
--
-- Compatibility rules:
--   * Existing schools without explicit module rows retain their plan access.
--   * Newly approved schools receive Core only until modules are activated.
--   * The legacy setup enrolment RPC remains available but can no longer create classes.

create schema if not exists private;

alter table public.school_requests
  add column if not exists decision_maker_name text,
  add column if not exists decision_maker_title text,
  add column if not exists decision_maker_phone text,
  add column if not exists applicant_authority_confirmed boolean not null default false,
  add column if not exists estimated_students integer,
  add column if not exists estimated_teachers integer,
  add column if not exists requested_modules text[] not null default array['core']::text[],
  add column if not exists preferred_payment_method text,
  add column if not exists billing_contact_email text;

alter table public.school_requests drop constraint if exists school_requests_estimated_students_positive;
alter table public.school_requests add constraint school_requests_estimated_students_positive
  check (estimated_students is null or estimated_students > 0) not valid;
alter table public.school_requests drop constraint if exists school_requests_estimated_teachers_positive;
alter table public.school_requests add constraint school_requests_estimated_teachers_positive
  check (estimated_teachers is null or estimated_teachers > 0) not valid;
alter table public.school_requests drop constraint if exists school_requests_payment_preference_check;
alter table public.school_requests add constraint school_requests_payment_preference_check
  check (preferred_payment_method is null or preferred_payment_method in ('card','cash','bank_transfer','invoice','undecided')) not valid;

alter table public.billing_subscriptions
  add column if not exists payment_method text,
  add column if not exists amount_minor bigint,
  add column if not exists currency text,
  add column if not exists payment_reference text,
  add column if not exists invoice_number text,
  add column if not exists paid_at timestamptz,
  add column if not exists verified_by uuid references public.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists receipt_url text,
  add column if not exists module_keys text[] not null default array['core']::text[],
  add column if not exists internal_notes text;

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_plan_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_check
  check (plan in ('pilot','core','standard','pro','enterprise')) not valid;
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_status_check
  check (status in ('pending','active','trialing','past_due','paused','cancelled','expired')) not valid;
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_billing_interval_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_billing_interval_check
  check (billing_interval in ('monthly','yearly','manual')) not valid;

create table if not exists public.school_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  module_key text not null check (module_key in ('core','cambridge','ielts','writing','admissions')),
  enabled boolean not null default false,
  source text not null default 'platform_admin' check (source in ('school_approval','manual_payment','paddle','pilot','complimentary','platform_admin')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  configured_by uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, module_key),
  check (ends_at is null or ends_at > starts_at),
  check (module_key <> 'core' or enabled)
);

create index if not exists school_module_entitlements_active_idx
  on public.school_module_entitlements (school_id, module_key, enabled, ends_at);

alter table public.school_module_entitlements enable row level security;
revoke all on public.school_module_entitlements from public, anon, authenticated;
grant select on public.school_module_entitlements to authenticated;
grant all on public.school_module_entitlements to service_role;

drop policy if exists school_members_read_module_entitlements on public.school_module_entitlements;
create policy school_members_read_module_entitlements
  on public.school_module_entitlements for select to authenticated
  using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_module_entitlements.school_id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
    )
    or public.is_superadmin((select auth.uid()))
  );

create table if not exists public.school_head_onboarding (
  school_id uuid primary key references public.schools(id) on delete cascade,
  identity_confirmed_at timestamptz,
  identity_confirmed_by uuid references public.users(id) on delete set null,
  requested_modules text[] not null default array['core']::text[],
  modules_confirmed_at timestamptz,
  modules_confirmed_by uuid references public.users(id) on delete set null,
  launch_test_confirmed_at timestamptz,
  launch_test_confirmed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_head_onboarding enable row level security;
revoke all on public.school_head_onboarding from public, anon, authenticated;
grant select on public.school_head_onboarding to authenticated;
grant all on public.school_head_onboarding to service_role;

drop policy if exists school_head_reads_onboarding on public.school_head_onboarding;
create policy school_head_reads_onboarding
  on public.school_head_onboarding for select to authenticated
  using (public.is_school_owner(school_id));

-- Preserve the existing tier priority while ensuring a manual agreement stops
-- granting access at its explicit expiry even before the daily housekeeping job.
create or replace function public.get_effective_tier(p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid:=coalesce(p_user_id,auth.uid()); v_user record; v_plan text;
begin
  if v_uid is null then return 'free'; end if;
  select u.account_tier,u.school_id into v_user from public.users u where u.id=v_uid;
  if not found then return 'free'; end if;
  if v_user.account_tier='pro' then return 'pro'; end if;
  if v_user.school_id is not null then
    select bs.plan into v_plan from public.billing_subscriptions bs
    where bs.school_id=v_user.school_id
      and (
        (bs.status in ('active','trialing','past_due') and (bs.provider<>'manual' or bs.current_period_end>now()))
        or (bs.status='cancelled' and bs.current_period_end>now())
      )
      and (not bs.is_comp or bs.comp_expires_at is null or bs.comp_expires_at>now())
    order by bs.created_at desc limit 1;
    if v_plan is not null then return v_plan; end if;
    select case
      when s.school_plan in ('core','standard','pro','enterprise') then s.school_plan
      when s.school_plan='pilot' and s.trial_ends_at>now() then 'pilot'
      else 'free'
    end into v_plan from public.schools s where s.id=v_user.school_id;
  end if;
  return coalesce(v_plan,'free');
end;
$$;

revoke all on function public.get_effective_tier(uuid) from public, anon;
grant execute on function public.get_effective_tier(uuid) to authenticated;

create or replace function private.professional_onboarding_active_plan(p_school_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select bs.plan
      from public.billing_subscriptions bs
      where bs.school_id = p_school_id
        and (
          (bs.status in ('active','trialing','past_due') and (bs.provider <> 'manual' or bs.current_period_end > now()))
          or (bs.status = 'cancelled' and bs.current_period_end > now())
        )
        and (not bs.is_comp or bs.comp_expires_at is null or bs.comp_expires_at > now())
      order by bs.updated_at desc, bs.created_at desc
      limit 1
    ),
    (
      select case
        when s.school_plan = 'pilot' and s.trial_ends_at > now() then 'pilot'
        when s.school_plan in ('core','standard','pro','enterprise') then s.school_plan
        else 'free'
      end
      from public.schools s where s.id = p_school_id
    ),
    'free'
  );
$$;

revoke all on function private.professional_onboarding_active_plan(uuid) from public, anon, authenticated, service_role;

create or replace function public.school_has_module_access(p_school_id uuid, p_module_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_module text := lower(trim(coalesce(p_module_key, '')));
  v_has_explicit boolean;
  v_plan text;
begin
  if p_school_id is null or v_module not in ('core','cambridge','ielts','writing','admissions') then
    return false;
  end if;
  if auth.uid() is not null and not (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
    ) or public.is_superadmin(auth.uid())
  ) then
    return false;
  end if;
  if v_module = 'core' then return true; end if;

  select exists (
    select 1 from public.school_module_entitlements sme where sme.school_id = p_school_id
  ) into v_has_explicit;

  if v_has_explicit then
    return exists (
      select 1 from public.school_module_entitlements sme
      where sme.school_id = p_school_id
        and sme.module_key = v_module
        and sme.enabled
        and sme.starts_at <= now()
        and (sme.ends_at is null or sme.ends_at > now())
    );
  end if;

  -- Legacy schools did not have module rows. Preserve their existing paid/pilot access.
  v_plan := private.professional_onboarding_active_plan(p_school_id);
  return v_plan in ('pilot','core','standard','pro','enterprise');
end;
$$;

revoke all on function public.school_has_module_access(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.school_has_module_access(uuid, text) to authenticated;

create or replace function public.rpc_adm_check_entitlement(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan text; v_trial_ends_at timestamptz; v_used integer; v_limit integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.school_has_module_access(p_school_id,'admissions') then
    return jsonb_build_object('allowed',false,'reason','Admission Hub is not included in this school agreement');
  end if;
  select s.school_plan,s.trial_ends_at into v_plan,v_trial_ends_at from public.schools s where s.id=p_school_id;
  if not found then return jsonb_build_object('allowed',false,'reason','School not found'); end if;
  if v_plan in ('core','standard','pro','enterprise') then return jsonb_build_object('allowed',true,'reason','paid_plan','remaining',-1); end if;
  if v_plan='pilot' then
    if v_trial_ends_at is not null and v_trial_ends_at<now() then return jsonb_build_object('allowed',false,'reason','Pilot trial has expired'); end if;
    v_limit:=coalesce((public.get_pilot_quota_limits()->>'admission_tests')::integer,30);
    select spu.used_count into v_used from public.school_pilot_usage spu where spu.school_id=p_school_id and spu.feature_id='admission_tests';
    if not found then
      insert into public.school_pilot_usage(school_id,feature_id,used_count) values(p_school_id,'admission_tests',0);
      return jsonb_build_object('allowed',true,'reason','pilot','remaining',v_limit);
    end if;
    if v_used>=v_limit then return jsonb_build_object('allowed',false,'reason','Pilot quota exhausted','used',v_used,'limit',v_limit); end if;
    return jsonb_build_object('allowed',true,'reason','pilot','remaining',v_limit-v_used);
  end if;
  return jsonb_build_object('allowed',false,'reason','Admission tests require an active school plan');
end;
$$;

revoke all on function public.rpc_adm_check_entitlement(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_adm_check_entitlement(uuid) to authenticated;

create or replace function public.can_create_ielts_exam(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_superadmin(auth.uid()) or (
    public.school_has_module_access(p_school_id,'ielts') and (
      exists(select 1 from public.users u where u.id=auth.uid() and (coalesce(u.is_admin,false) or coalesce(u.role,'') in ('admin','superadmin') or (u.role='school_admin' and u.school_id=p_school_id)))
      or exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active' and sm.role_in_school in ('school_admin','admin','superadmin'))
    )
  );
$$;

create or replace function public.can_manage_ielts_exam(p_exam_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_superadmin(auth.uid()) or exists(
    select 1 from public.ielts_exam_events e
    where e.id=p_exam_event_id and e.school_id is not null
      and public.school_has_module_access(e.school_id,'ielts')
      and (
        exists(select 1 from public.users u where u.id=auth.uid() and (coalesce(u.is_admin,false) or u.role in ('admin','superadmin') or (u.role='school_admin' and u.school_id=e.school_id)))
        or exists(select 1 from public.school_members sm where sm.school_id=e.school_id and sm.user_id=auth.uid() and sm.status='active' and sm.role_in_school in ('school_admin','admin','superadmin'))
      )
  );
$$;

create or replace function public.can_manage_cambridge_score(p_score_id uuid,p_require_grade boolean default true)
returns boolean language sql stable security definer set search_path = '' as $$
  with actor as (
    select u.id,u.school_id,u.role,coalesce(u.is_admin,false) is_admin from public.users u where u.id=auth.uid()
  ), score as (select qs.* from public.quiz_scores qs where qs.id=p_score_id)
  select exists(
    select 1 from actor a join score s on s.school_id=a.school_id
    where (public.is_superadmin(a.id) or public.school_has_module_access(s.school_id,'cambridge'))
      and (a.is_admin or a.role in ('admin','school_admin') or (
        a.role='teacher' and exists(
          select 1 from public.class_teacher_assignments cta join public.classes c on c.id=cta.class_id and c.school_id=s.school_id
          where cta.teacher_user_id=a.id and cta.school_id=s.school_id and cta.active
            and (not p_require_grade or cta.can_grade)
            and (exists(select 1 from public.class_students cs where cs.class_id=cta.class_id and cs.student_id=s.student_id)
              or (s.student_id is null and (c.class_code=s.student_class or c.class_name=s.student_class)))
            and public.cambridge_assignment_matches_test(cta.subject,s.test_id,s.quiz_name)
        )
      ))
  );
$$;

revoke all on function public.can_create_ielts_exam(uuid) from public, anon;
revoke all on function public.can_manage_ielts_exam(uuid) from public, anon;
revoke all on function public.can_manage_cambridge_score(uuid,boolean) from public, anon;
grant execute on function public.can_create_ielts_exam(uuid) to authenticated;
grant execute on function public.can_manage_ielts_exam(uuid) to authenticated;
grant execute on function public.can_manage_cambridge_score(uuid,boolean) to authenticated;

create or replace function public.get_my_effective_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid;
  v_plan text := 'free';
  v_entitlements jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'plan', 'free', 'school_id', null, 'entitlements', '{}'::jsonb);
  end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_uid and sm.status = 'active'
  order by sm.is_owner desc, sm.joined_at, sm.id
  limit 1;

  if v_school_id is not null then
    v_plan := private.professional_onboarding_active_plan(v_school_id);
  else
    v_plan := coalesce(public.get_effective_tier(v_uid), 'free');
  end if;

  select coalesce(jsonb_object_agg(rows.feature_key, jsonb_build_object(
    'feature_key', rows.feature_key,
    'enabled', rows.effective_enabled,
    'limit_value', case when rows.effective_enabled then rows.limit_value else 0 end,
    'module_key', rows.module_key
  )), '{}'::jsonb)
  into v_entitlements
  from (
    select be.feature_key, be.limit_value,
      case
        when be.feature_key = 'cambridge_tests' then 'cambridge'
        when be.feature_key = 'ielts_tests' then 'ielts'
        when be.feature_key = 'admission_tests' then 'admissions'
        when be.feature_key = 'writing_hub' then 'writing'
        else 'core'
      end as module_key,
      be.enabled and (
        v_school_id is null
        or public.school_has_module_access(v_school_id, case
          when be.feature_key = 'cambridge_tests' then 'cambridge'
          when be.feature_key = 'ielts_tests' then 'ielts'
          when be.feature_key = 'admission_tests' then 'admissions'
          when be.feature_key = 'writing_hub' then 'writing'
          else 'core'
        end)
      ) as effective_enabled
    from public.billing_entitlements be
    where be.plan = v_plan
  ) rows;

  return jsonb_build_object(
    'success', true,
    'plan', v_plan,
    'school_id', v_school_id,
    'modules', jsonb_build_object(
      'core', true,
      'cambridge', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'cambridge') end,
      'ielts', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'ielts') end,
      'writing', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'writing') end,
      'admissions', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'admissions') end
    ),
    'entitlements', v_entitlements
  );
end;
$$;

revoke all on function public.get_my_effective_entitlements() from public, anon, authenticated, service_role;
grant execute on function public.get_my_effective_entitlements() to authenticated;

insert into public.billing_entitlements (plan, feature_key, enabled, limit_value)
select plan_name, 'writing_hub', plan_name <> 'free', null
from unnest(array['free','pilot','core','standard','pro','enterprise']) plan_name
on conflict (plan, feature_key) do update set enabled = excluded.enabled;

create or replace function public.admin_record_manual_school_subscription(
  p_school_id uuid,
  p_plan text,
  p_payment_method text,
  p_status text,
  p_amount_minor bigint,
  p_currency text,
  p_reference text,
  p_period_end timestamptz,
  p_modules text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_subscription_id uuid;
  v_modules text[];
  v_module text;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    return jsonb_build_object('success', false, 'error', 'Platform administrator access required.');
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id and s.status = 'active') then
    return jsonb_build_object('success', false, 'error', 'Choose an active school.');
  end if;
  if p_plan not in ('pilot','core','standard','pro','enterprise') then
    return jsonb_build_object('success', false, 'error', 'Choose a valid plan.');
  end if;
  if p_payment_method not in ('cash','bank_transfer','invoice','complimentary') then
    return jsonb_build_object('success', false, 'error', 'Choose cash, bank transfer, invoice, or complimentary access.');
  end if;
  if p_status not in ('pending','active') then
    return jsonb_build_object('success', false, 'error', 'Manual subscriptions must be pending or active.');
  end if;
  if p_period_end is null or p_period_end <= now() then
    return jsonb_build_object('success', false, 'error', 'Enter a future access expiry date.');
  end if;
  if p_payment_method <> 'complimentary' and (p_amount_minor is null or p_amount_minor <= 0) then
    return jsonb_build_object('success', false, 'error', 'Enter the verified payment amount.');
  end if;

  select array_agg(distinct module_key order by module_key) into v_modules
  from unnest(array_append(coalesce(p_modules, '{}'::text[]), 'core')) module_key
  where module_key in ('core','cambridge','ielts','writing','admissions');

  if p_status = 'active' and exists (
    select 1 from public.billing_subscriptions bs
    where bs.school_id = p_school_id and bs.provider <> 'manual'
      and bs.status in ('active','trialing','past_due')
  ) then
    return jsonb_build_object('success', false, 'error', 'This school already has an active online subscription. Resolve it before recording manual access.');
  end if;

  if p_status = 'active' then
    update public.billing_subscriptions bs
    set status = 'expired', updated_at = now()
    where bs.school_id = p_school_id and bs.provider = 'manual'
      and bs.status in ('active','trialing','past_due');
  end if;

  insert into public.billing_subscriptions (
    school_id, purchased_by, provider, status, plan, billing_interval,
    current_period_start, current_period_end, is_comp, comp_expires_at,
    comp_granted_by, comp_reason, payment_method, amount_minor, currency,
    payment_reference, paid_at, verified_by, verified_at, module_keys, internal_notes
  ) values (
    p_school_id, null, 'manual', p_status, p_plan, 'manual',
    case when p_status = 'active' then now() else null end, p_period_end,
    p_payment_method = 'complimentary', case when p_payment_method = 'complimentary' then p_period_end else null end,
    case when p_payment_method = 'complimentary' then v_actor else null end,
    case when p_payment_method = 'complimentary' then nullif(trim(p_notes), '') else null end,
    p_payment_method, coalesce(p_amount_minor, 0), upper(coalesce(nullif(trim(p_currency), ''), 'USD')),
    nullif(trim(p_reference), ''), case when p_status = 'active' and p_payment_method <> 'complimentary' then now() else null end,
    case when p_status = 'active' then v_actor else null end, case when p_status = 'active' then now() else null end,
    v_modules, nullif(trim(p_notes), '')
  ) returning id into v_subscription_id;

  if p_status = 'active' then
    foreach v_module in array array['core','cambridge','ielts','writing','admissions'] loop
      insert into public.school_module_entitlements (
        school_id, module_key, enabled, source, starts_at, ends_at, configured_by, notes
      ) values (
        p_school_id, v_module, v_module = any(v_modules),
        case when p_payment_method = 'complimentary' then 'complimentary' else 'manual_payment' end,
        now(), p_period_end, v_actor, nullif(trim(p_notes), '')
      )
      on conflict (school_id, module_key) do update set
        enabled = excluded.enabled, source = excluded.source, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, configured_by = excluded.configured_by,
        notes = excluded.notes, updated_at = now();
    end loop;
  end if;

  return jsonb_build_object('success', true, 'subscription_id', v_subscription_id, 'modules', v_modules, 'status', p_status);
end;
$$;

revoke all on function public.admin_record_manual_school_subscription(uuid,text,text,text,bigint,text,text,timestamptz,text[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_record_manual_school_subscription(uuid,text,text,text,bigint,text,text,timestamptz,text[],text)
  to authenticated;

create or replace function public.admin_list_school_billing_overview(p_school_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using errcode = '42501', message = 'platform_administrator_access_required';
  end if;
  return jsonb_build_object(
    'success', true,
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'school_id', s.id, 'school_name', s.name, 'school_plan', s.school_plan,
        'subscription', case when bs.id is null then null else jsonb_build_object(
          'id', bs.id, 'provider', bs.provider, 'payment_method', bs.payment_method,
          'status', bs.status, 'plan', bs.plan, 'amount_minor', bs.amount_minor,
          'currency', bs.currency, 'payment_reference', bs.payment_reference,
          'current_period_end', bs.current_period_end, 'module_keys', bs.module_keys,
          'verified_at', bs.verified_at, 'created_at', bs.created_at
        ) end,
        'modules', coalesce(mods.modules, '{}'::jsonb)
      ) order by s.name)
      from public.schools s
      left join lateral (
        select latest.* from public.billing_subscriptions latest
        where latest.school_id = s.id order by latest.updated_at desc, latest.created_at desc limit 1
      ) bs on true
      left join lateral (
        select jsonb_object_agg(sme.module_key, sme.enabled) modules
        from public.school_module_entitlements sme where sme.school_id = s.id
      ) mods on true
      where (p_school_id is null or s.id = p_school_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_school_billing_overview(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_school_billing_overview(uuid) to authenticated;

create or replace function public.school_head_get_setup_checklist(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.school_head_onboarding%rowtype;
begin
  if auth.uid() is null or not public.is_school_owner(p_school_id) then
    raise exception using errcode = '42501', message = 'school_head_access_required';
  end if;
  insert into public.school_head_onboarding (school_id) values (p_school_id)
  on conflict (school_id) do nothing;
  select * into v_state from public.school_head_onboarding where school_id = p_school_id;

  return jsonb_build_object(
    'success', true,
    'requested_modules', v_state.requested_modules,
    'steps', jsonb_build_array(
      jsonb_build_object('id','identity','label','Confirm school identity','completed',v_state.identity_confirmed_at is not null,'action_tab','settings'),
      jsonb_build_object('id','branding','label','Add school logo','completed',exists(select 1 from public.schools s where s.id=p_school_id and nullif(trim(s.logo_url),'') is not null),'action_tab','settings'),
      jsonb_build_object('id','modules','label','Choose required programmes','completed',v_state.modules_confirmed_at is not null,'action_tab','billing'),
      jsonb_build_object('id','plan','label','Activate plan or verified manual payment','completed',private.professional_onboarding_active_plan(p_school_id) <> 'free','action_tab','billing'),
      jsonb_build_object('id','admin','label','Appoint a delegated administrator','completed',exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='school_admin' and not sm.is_owner),'action_tab','members'),
      jsonb_build_object('id','subjects','label','Add school subjects','completed',exists(select 1 from public.school_subjects ss where ss.school_id=p_school_id and ss.is_active is distinct from false),'action_tab','subjects'),
      jsonb_build_object('id','classes','label','Create approved classes','completed',exists(select 1 from public.classes c where c.school_id=p_school_id and c.is_active is distinct from false),'action_tab','classes'),
      jsonb_build_object('id','teachers','label','Assign teachers to classes and subjects','completed',exists(select 1 from public.class_teacher_assignments cta where cta.school_id=p_school_id and cta.active is distinct from false),'action_tab','teachers'),
      jsonb_build_object('id','students','label','Invite students to self-register','completed',exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'),'action_tab','members'),
      jsonb_build_object('id','launch','label','Complete and confirm launch smoke test','completed',v_state.launch_test_confirmed_at is not null,'action_tab','dashboard')
    )
  );
end;
$$;

revoke all on function public.school_head_get_setup_checklist(uuid) from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_setup_checklist(uuid) to authenticated;

create or replace function public.school_head_update_setup(
  p_school_id uuid,
  p_step text,
  p_completed boolean default true,
  p_requested_modules text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_modules text[];
begin
  if auth.uid() is null or not public.is_school_owner(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'School Head access required.');
  end if;
  insert into public.school_head_onboarding (school_id) values (p_school_id)
  on conflict (school_id) do nothing;

  if p_step = 'identity' then
    update public.school_head_onboarding set
      identity_confirmed_at = case when p_completed then now() else null end,
      identity_confirmed_by = case when p_completed then auth.uid() else null end,
      updated_at = now()
    where school_id = p_school_id;
  elsif p_step = 'launch' then
    update public.school_head_onboarding set
      launch_test_confirmed_at = case when p_completed then now() else null end,
      launch_test_confirmed_by = case when p_completed then auth.uid() else null end,
      updated_at = now()
    where school_id = p_school_id;
  elsif p_step = 'modules' then
    select array_agg(distinct module_key order by module_key) into v_modules
    from unnest(array_append(coalesce(p_requested_modules, '{}'::text[]), 'core')) module_key
    where module_key in ('core','cambridge','ielts','writing','admissions');
    update public.school_head_onboarding set requested_modules=v_modules,modules_confirmed_at=now(),modules_confirmed_by=auth.uid(),updated_at=now()
    where school_id=p_school_id;
  else
    return jsonb_build_object('success', false, 'error', 'This checklist step is updated automatically.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.school_head_update_setup(uuid,text,boolean,text[]) from public, anon, authenticated, service_role;
grant execute on function public.school_head_update_setup(uuid,text,boolean,text[]) to authenticated;

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
  v_suggestions jsonb;
  v_modules text[];
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from auth.users au where au.id=v_user_id and au.email_confirmed_at is not null) then
    raise exception 'Verify your email before submitting a school application';
  end if;
  if exists (select 1 from public.users u where u.id=v_user_id and coalesce(u.is_banned,false)) then raise exception 'Account is suspended'; end if;
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
  into v_suggestions from public.schools s
  where s.status='active' and (public.normalize_school_name(s.name) like '%'||v_norm||'%' or lower(s.name) like '%'||lower(trim(p_requested_name))||'%');

  if exists(select 1 from public.schools s where public.normalize_school_name(s.name)=v_norm) then
    return jsonb_build_object('status','exists','message','School already exists. Please join using its invite code.','suggestions',v_suggestions);
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
end;
$$;

revoke all on function public.request_school_v3(text,text,text,text,text,text,text,text,text,text,boolean,integer,integer,text[],text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_school_v3(text,text,text,text,text,text,text,text,text,text,boolean,integer,integer,text[],text,text)
  to authenticated;

create or replace function public.admin_list_school_requests(
  p_status text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    return jsonb_build_object('success',false,'error','Superadmin access required','requests','[]'::jsonb);
  end if;
  return jsonb_build_object(
    'success',true,
    'requests',coalesce((
      select jsonb_agg(to_jsonb(sr) order by sr.created_at desc)
      from (
        select r.*
        from public.school_requests r
        where p_status is null or p_status = 'all' or r.status = p_status
        order by r.created_at desc
        limit least(greatest(coalesce(p_limit,50),1),200)
      ) sr
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_school_requests(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_school_requests(text,integer) to authenticated;

create or replace function public.admin_review_school_request(
  p_request_id uuid,
  p_action text,
  p_notes text default null,
  p_existing_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.school_requests%rowtype;
  v_school_id uuid;
  v_invite_code text;
  v_slug text;
begin
  if v_user_id is null or not public.is_superadmin(v_user_id) then
    return jsonb_build_object('success',false,'error','Superadmin access required');
  end if;
  select * into v_request from public.school_requests where id=p_request_id for update;
  if v_request.id is null then return jsonb_build_object('success',false,'error','Request not found'); end if;
  if v_request.status not in ('pending','needs_more_info') then return jsonb_build_object('success',false,'error','Request already processed'); end if;

  if p_action in ('approve','mark_duplicate') and exists(
    select 1 from public.school_members sm
    where sm.user_id=v_request.requested_by and sm.status='active'
  ) then
    return jsonb_build_object('success',false,'error','The applicant already belongs to a school. Resolve that membership before processing this application.');
  end if;

  if p_action='approve' then
    if not coalesce(v_request.applicant_authority_confirmed,false) then
      return jsonb_build_object('success',false,'error','Confirm the applicant is the authorised school decision-maker before approval.');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_request.normalized_name, 0));
    if exists(select 1 from public.schools s where public.normalize_school_name(s.name)=v_request.normalized_name) then
      return jsonb_build_object('success',false,'error','A matching school was created while this request was pending. Mark it as a duplicate instead.');
    end if;
    loop
      v_invite_code := upper(substring(replace(replace(encode(extensions.gen_random_bytes(8),'base64'),'+',''),'/','') from 1 for 10));
      exit when not exists(select 1 from public.schools s where s.invite_code=v_invite_code);
    end loop;
    v_slug := regexp_replace(lower(v_request.normalized_name),'[^a-z0-9]+','-','g')||'-'||substr(p_request_id::text,1,8);
    insert into public.schools(name,slug,invite_code,status,created_by)
    values(v_request.requested_name,v_slug,v_invite_code,'active',v_request.requested_by)
    returning id into v_school_id;

    insert into public.school_members(school_id,user_id,role_in_school,status,is_owner,can_teach,invited_by)
    values(v_school_id,v_request.requested_by,'school_admin','active',true,v_request.requester_role='teacher',v_user_id)
    on conflict (school_id,user_id) do update set role_in_school='school_admin',status='active',is_owner=true,
      can_teach=excluded.can_teach,invited_by=v_user_id,updated_at=now();

    update public.users u set school_id=v_school_id,role='school_admin',needs_setup=false,updated_at=now()
    where u.id=v_request.requested_by;

    insert into public.school_head_onboarding(school_id,requested_modules)
    values(v_school_id,coalesce(v_request.requested_modules,array['core']::text[]))
    on conflict (school_id) do nothing;

    insert into public.school_module_entitlements(school_id,module_key,enabled,source,configured_by,notes)
    select v_school_id,module_key,module_key='core','school_approval',v_user_id,'Initial access created during school approval'
    from unnest(array['core','cambridge','ielts','writing','admissions']) module_key
    on conflict (school_id,module_key) do nothing;

    insert into public.school_governance_audit_log(
      school_id,actor_user_id,target_user_id,event_type,category,severity,summary,reason,metadata
    ) values (
      v_school_id,v_user_id,v_request.requested_by,'school_head_provisioned','ownership','critical',
      'The first School Head was provisioned',nullif(trim(p_notes),''),
      jsonb_build_object('school_request_id',p_request_id,'requested_modules',v_request.requested_modules)
    );

    update public.school_requests set status='approved',approved_school_id=v_school_id,admin_notes=p_notes,
      reviewed_by=v_user_id,reviewed_at=now(),updated_at=now() where id=p_request_id;
    return jsonb_build_object('success',true,'school_id',v_school_id,'invite_code',v_invite_code,'school_head_user_id',v_request.requested_by);
  elsif p_action='reject' then
    update public.school_requests set status='rejected',admin_notes=p_notes,reviewed_by=v_user_id,reviewed_at=now(),updated_at=now() where id=p_request_id;
    return jsonb_build_object('success',true);
  elsif p_action='mark_duplicate' then
    if p_existing_school_id is null then return jsonb_build_object('success',false,'error','Must provide existing school ID'); end if;
    update public.school_requests set status='duplicate',approved_school_id=p_existing_school_id,admin_notes=p_notes,
      reviewed_by=v_user_id,reviewed_at=now(),updated_at=now() where id=p_request_id;
    -- Duplicate requests join as the requested operational role; ownership is never changed.
    insert into public.school_members(school_id,user_id,role_in_school,status,is_owner,can_teach,invited_by)
    values(p_existing_school_id,v_request.requested_by,case when v_request.requester_role='teacher' then 'teacher' else 'student' end,
      'active',false,v_request.requester_role='teacher',v_user_id)
    on conflict (school_id,user_id) do nothing;
    update public.users u set school_id=p_existing_school_id,
      role=case when v_request.requester_role='teacher' then 'teacher' else 'student' end,
      needs_setup=false,updated_at=now()
    where u.id=v_request.requested_by;
    return jsonb_build_object('success',true);
  end if;
  return jsonb_build_object('success',false,'error','Invalid action');
exception when unique_violation then
  return jsonb_build_object('success',false,'error','School ownership or identity changed during approval. Refresh and review again.');
end;
$$;

revoke all on function public.admin_review_school_request(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_school_request(uuid,text,text,uuid) to authenticated;

create or replace function public.list_school_signup_classes(p_invite_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_school public.schools%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  if not exists(select 1 from auth.users au where au.id=auth.uid() and au.email_confirmed_at is not null) then
    return jsonb_build_object('success',false,'error','Verify your email before viewing school classes.');
  end if;
  select * into v_school from public.schools s
  where upper(regexp_replace(coalesce(s.invite_code,''),'\s','','g'))=upper(regexp_replace(coalesce(p_invite_code,''),'\s','','g'))
    and s.status='active';
  if v_school.id is null then return jsonb_build_object('success',false,'error','Invalid or expired invite code.'); end if;
  return jsonb_build_object('success',true,'school_id',v_school.id,'classes',coalesce((
    select jsonb_agg(jsonb_build_object('id',c.id,'class_code',c.class_code,'class_name',c.class_name,'grade_level',c.grade_level)
      order by case when c.grade_level ~ '^[0-9]+$' then c.grade_level::integer else 999 end,c.class_code)
    from public.classes c where c.school_id=v_school.id and c.is_active is distinct from false
  ),'[]'::jsonb));
end;
$$;

revoke all on function public.list_school_signup_classes(text) from public, anon, authenticated, service_role;
grant execute on function public.list_school_signup_classes(text) to authenticated;

create or replace function public.rpc_setup_approved_class_enrollment(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.school_members%rowtype;
  v_class public.classes%rowtype;
  v_current_class_id uuid;
begin
  if v_uid is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  select * into v_member from public.school_members sm
  where sm.user_id=v_uid and sm.status='active' and sm.role_in_school='student' for update;
  if v_member.id is null then return jsonb_build_object('success',false,'error','Active student membership required.'); end if;
  select * into v_class from public.classes c
  where c.id=p_class_id and c.school_id=v_member.school_id and c.is_active is distinct from false for share;
  if v_class.id is null then return jsonb_build_object('success',false,'status','awaiting_placement','error','Choose an approved active class from your school.'); end if;

  select cs.class_id into v_current_class_id
  from public.class_students cs join public.classes current_class on current_class.id=cs.class_id
  where cs.student_id=v_uid and current_class.school_id=v_member.school_id
  order by cs.joined_at,cs.class_id limit 1;
  if v_current_class_id is not null and v_current_class_id<>v_class.id then
    return jsonb_build_object('success',false,'error','You are already placed in a class. Ask a school administrator to move you.');
  end if;

  insert into public.class_students(class_id,student_id) values(v_class.id,v_uid)
  on conflict (class_id,student_id) do nothing;
  update public.users set grade=v_class.grade_level,batch=v_class.class_code,updated_at=now() where id=v_uid;

  insert into public.school_student_placement_history(
    school_id,student_user_id,actor_user_id,event_type,to_class_id,to_class_code,to_grade,reason,effective_date,metadata
  ) select v_member.school_id,v_uid,v_uid,'assigned',v_class.id,v_class.class_code,v_class.grade_level,
      'Student selected an approved class during verified onboarding',current_date,jsonb_build_object('source','verified_self_registration')
    where not exists(select 1 from public.school_student_placement_history h where h.school_id=v_member.school_id and h.student_user_id=v_uid and h.to_class_id=v_class.id and h.metadata->>'source'='verified_self_registration');

  return jsonb_build_object('success',true,'status','enrolled','class_id',v_class.id,'class_code',v_class.class_code,'created_class',false,'enrolled',true);
end;
$$;

revoke all on function public.rpc_setup_approved_class_enrollment(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_setup_approved_class_enrollment(uuid) to authenticated;

create or replace function public.rpc_request_school_class_placement(p_grade_level text, p_requested_class text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_school_id uuid;
begin
  select sm.school_id into v_school_id from public.school_members sm
  where sm.user_id=v_uid and sm.status='active' and sm.role_in_school='student';
  if v_school_id is null then return jsonb_build_object('success',false,'error','Active student membership required.'); end if;
  if exists(
    select 1 from public.class_students cs join public.classes c on c.id=cs.class_id
    where cs.student_id=v_uid and c.school_id=v_school_id
  ) then return jsonb_build_object('success',false,'error','You are already placed in a class. Ask a school administrator to move you.'); end if;
  insert into public.school_student_placement_exceptions(
    school_id,student_user_id,issue_code,severity,evidence
  ) values (
    v_school_id,v_uid,'student_self_reported_missing_class','medium',
    jsonb_build_object('requested_grade',nullif(trim(p_grade_level),''),'requested_class',nullif(trim(p_requested_class),''),'source','verified_self_registration')
  ) on conflict (school_id,student_user_id,issue_code) where status='open'
    do update set evidence=excluded.evidence,opened_at=now();
  update public.users set grade=nullif(trim(p_grade_level),''),batch='N/A',updated_at=now() where id=v_uid;
  return jsonb_build_object('success',true,'status','awaiting_placement');
end;
$$;

revoke all on function public.rpc_request_school_class_placement(text,text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_request_school_class_placement(text,text) to authenticated;

-- Legacy endpoint: match approved classes only. It no longer manufactures classes.
create or replace function public.rpc_setup_school_class_enrollment(p_grade_level text, p_batch text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_school_id uuid; v_class_id uuid; v_code text;
begin
  select sm.school_id into v_school_id from public.school_members sm
  where sm.user_id=v_uid and sm.status='active' and sm.role_in_school='student';
  if v_school_id is null then return jsonb_build_object('success',true,'status','no_school','enrolled',false); end if;
  v_code:=public.normalize_setup_class_code(p_grade_level,p_batch);
  select c.id into v_class_id from public.classes c
  where c.school_id=v_school_id and c.is_active is distinct from false
    and (upper(trim(c.class_code))=v_code or upper(trim(c.class_name))=v_code)
  order by c.created_at,c.id limit 1;
  if v_class_id is null then
    perform public.rpc_request_school_class_placement(p_grade_level,p_batch);
    return jsonb_build_object('success',true,'status','awaiting_placement','class_id',null,'class_code',v_code,'created_class',false,'enrolled',false);
  end if;
  return public.rpc_setup_approved_class_enrollment(v_class_id);
end;
$$;

revoke all on function public.rpc_setup_school_class_enrollment(text,text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_setup_school_class_enrollment(text,text) to authenticated;

create table if not exists private.pending_account_cleanup_log (
  user_id uuid primary key,
  email text,
  outcome text not null,
  detail text,
  processed_at timestamptz not null default now()
);
revoke all on private.pending_account_cleanup_log from public, anon, authenticated, service_role;

-- Existing unconfirmed accounts pre-date the communicated seven-day policy and
-- must be reviewed separately. Only accounts created after this rollout enter
-- automatic cleanup.
create table if not exists private.pending_account_cleanup_policy (
  singleton boolean primary key default true check (singleton),
  eligible_created_after timestamptz not null,
  created_at timestamptz not null default now()
);
insert into private.pending_account_cleanup_policy(singleton,eligible_created_after)
values(true,now()) on conflict(singleton) do nothing;
revoke all on private.pending_account_cleanup_policy from public, anon, authenticated, service_role;

create or replace function private.cleanup_unconfirmed_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_candidate record; v_deleted integer:=0;
begin
  for v_candidate in
    select au.id,au.email from auth.users au
    where au.email_confirmed_at is null and au.created_at < now()-interval '7 days'
      and au.created_at >= (select p.eligible_created_after from private.pending_account_cleanup_policy p where p.singleton)
      and not exists(select 1 from public.school_members sm where sm.user_id=au.id)
      and not exists(select 1 from public.school_requests sr where sr.requested_by=au.id)
    order by au.created_at
    limit 500
  loop
    begin
      delete from public.users u where u.id=v_candidate.id;
      delete from auth.users au where au.id=v_candidate.id and au.email_confirmed_at is null;
      if found then
        v_deleted:=v_deleted+1;
        insert into private.pending_account_cleanup_log(user_id,email,outcome,detail)
        values(v_candidate.id,v_candidate.email,'deleted','Unconfirmed for more than seven days')
        on conflict(user_id) do update set outcome=excluded.outcome,detail=excluded.detail,processed_at=now();
      end if;
    exception when others then
      insert into private.pending_account_cleanup_log(user_id,email,outcome,detail)
      values(v_candidate.id,v_candidate.email,'skipped',left(sqlerrm,500))
      on conflict(user_id) do update set outcome=excluded.outcome,detail=excluded.detail,processed_at=now();
    end;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_unconfirmed_accounts() from public, anon, authenticated, service_role;

do $$
begin
  create extension if not exists pg_cron;
exception when insufficient_privilege then
  raise notice 'pg_cron is unavailable; schedule private.cleanup_unconfirmed_accounts() with the platform scheduler.';
end $$;

do $$
declare v_job_id bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute 'select jobid from cron.job where jobname=$1'
      into v_job_id using 'cleanup-unconfirmed-brain-heist-accounts';
    if v_job_id is not null then execute 'select cron.unschedule($1)' using v_job_id; end if;
    execute 'select cron.schedule($1,$2,$3)'
      using 'cleanup-unconfirmed-brain-heist-accounts','17 3 * * *','select private.cleanup_unconfirmed_accounts();';
  end if;
end $$;

notify pgrst, 'reload schema';
