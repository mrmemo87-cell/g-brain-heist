-- Brains Heist Billing Studio v1.
--
-- This migration is deliberately additive. It introduces a versioned catalogue,
-- an authoritative quote calculator, and a governed quote review workflow. It
-- does not alter any existing subscription, plan, pilot, or programme access.

create table if not exists public.billing_pricing_versions (
  code text primary key,
  display_name text not null,
  currency text not null default 'USD' check (currency = upper(currency) and length(currency) = 3),
  is_active boolean not null default false,
  effective_at timestamptz not null default now(),
  combination_two_bps integer not null check (combination_two_bps between 0 and 10000),
  combination_three_bps integer not null check (combination_three_bps between 0 and 10000),
  combination_four_bps integer not null check (combination_four_bps between 0 and 10000),
  annual_bps integer not null check (annual_bps between 0 and 10000),
  two_year_bps integer not null check (two_year_bps between 0 and 10000),
  three_year_bps integer not null check (three_year_bps between 0 and 10000),
  launch_bps integer not null check (launch_bps between 0 and 10000),
  maximum_discount_bps integer not null check (maximum_discount_bps between 0 and 10000),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_pricing_versions_one_active_idx
  on public.billing_pricing_versions (is_active) where is_active;

create table if not exists public.billing_price_items (
  pricing_version_code text not null references public.billing_pricing_versions(code) on delete restrict,
  item_key text not null check (item_key in ('platform','cambridge','ielts','writing','admissions')),
  display_name text not null,
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  minimum_quantity integer not null check (minimum_quantity > 0),
  quantity_label text not null,
  included_allowance jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  primary key (pricing_version_code, item_key)
);

create table if not exists public.school_billing_quotes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  pricing_version_code text not null references public.billing_pricing_versions(code) on delete restrict,
  created_by uuid not null references public.users(id) on delete restrict,
  title text not null default 'School plan scenario' check (char_length(title) between 1 and 80),
  status text not null default 'draft' check (status in ('draft','submitted','revision_requested','approved','accepted','rejected','expired','cancelled')),
  contract_term text not null check (contract_term in ('monthly','annual','two_year','three_year')),
  platform_seats integer not null check (platform_seats > 0),
  cambridge_seats integer not null default 0 check (cambridge_seats >= 0),
  ielts_seats integer not null default 0 check (ielts_seats >= 0),
  writing_seats integer not null default 0 check (writing_seats >= 0),
  admissions_candidates integer not null default 0 check (admissions_candidates >= 0),
  launch_discount_requested boolean not null default false,
  calculation jsonb not null,
  school_note text,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_billing_quotes_school_status_idx
  on public.school_billing_quotes (school_id, status, updated_at desc);
create index if not exists school_billing_quotes_review_queue_idx
  on public.school_billing_quotes (status, submitted_at asc) where status in ('submitted','revision_requested','approved');

create table if not exists public.school_billing_quote_events (
  id bigint generated always as identity primary key,
  quote_id uuid not null references public.school_billing_quotes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('created','saved','submitted','revision_requested','approved','accepted','rejected','expired','cancelled')),
  from_status text,
  to_status text not null,
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists school_billing_quote_events_quote_idx
  on public.school_billing_quote_events (quote_id, created_at desc);

alter table public.billing_pricing_versions enable row level security;
alter table public.billing_price_items enable row level security;
alter table public.school_billing_quotes enable row level security;
alter table public.school_billing_quote_events enable row level security;

revoke all on public.billing_pricing_versions from public, anon, authenticated;
revoke all on public.billing_price_items from public, anon, authenticated;
revoke all on public.school_billing_quotes from public, anon, authenticated;
revoke all on public.school_billing_quote_events from public, anon, authenticated;

grant select on public.billing_pricing_versions to authenticated;
grant select on public.billing_price_items to authenticated;
grant select on public.school_billing_quotes to authenticated;
grant select on public.school_billing_quote_events to authenticated;
grant all on public.billing_pricing_versions, public.billing_price_items, public.school_billing_quotes, public.school_billing_quote_events to service_role;
grant usage, select on sequence public.school_billing_quote_events_id_seq to service_role;

drop policy if exists authenticated_reads_active_billing_catalogue on public.billing_pricing_versions;
create policy authenticated_reads_active_billing_catalogue
  on public.billing_pricing_versions for select to authenticated
  using (is_active or public.is_superadmin((select auth.uid())));

drop policy if exists authenticated_reads_active_billing_prices on public.billing_price_items;
create policy authenticated_reads_active_billing_prices
  on public.billing_price_items for select to authenticated
  using (
    exists (
      select 1 from public.billing_pricing_versions bpv
      where bpv.code = billing_price_items.pricing_version_code
        and (bpv.is_active or public.is_superadmin((select auth.uid())))
    )
  );

drop policy if exists school_heads_read_their_billing_quotes on public.school_billing_quotes;
create policy school_heads_read_their_billing_quotes
  on public.school_billing_quotes for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

drop policy if exists school_heads_read_their_billing_quote_events on public.school_billing_quote_events;
create policy school_heads_read_their_billing_quote_events
  on public.school_billing_quote_events for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

insert into public.billing_pricing_versions (
  code, display_name, currency, is_active, effective_at,
  combination_two_bps, combination_three_bps, combination_four_bps,
  annual_bps, two_year_bps, three_year_bps, launch_bps, maximum_discount_bps
) values (
  'bh_usd_2026_launch', 'Brains Heist School Pricing 2026', 'USD', true, '2026-08-12T00:00:00Z',
  500, 1000, 1500, 1000, 1500, 2000, 1500, 3500
)
on conflict (code) do update set
  display_name = excluded.display_name,
  combination_two_bps = excluded.combination_two_bps,
  combination_three_bps = excluded.combination_three_bps,
  combination_four_bps = excluded.combination_four_bps,
  annual_bps = excluded.annual_bps,
  two_year_bps = excluded.two_year_bps,
  three_year_bps = excluded.three_year_bps,
  launch_bps = excluded.launch_bps,
  maximum_discount_bps = excluded.maximum_discount_bps,
  updated_at = now();

insert into public.billing_price_items (
  pricing_version_code, item_key, display_name, unit_amount_minor,
  minimum_quantity, quantity_label, included_allowance, sort_order
) values
  ('bh_usd_2026_launch','platform','Brains Heist Platform',175,50,'students','{"teachers_and_admins":"unlimited"}'::jsonb,10),
  ('bh_usd_2026_launch','cambridge','Cambridge',125,25,'programme students','{}'::jsonb,20),
  ('bh_usd_2026_launch','ielts','IELTS',150,25,'programme students','{}'::jsonb,30),
  ('bh_usd_2026_launch','writing','Writing Hub',100,25,'programme students','{"ai_reviews_per_student_month":10,"rollover":false,"extra_review_pack":{"reviews":500,"amount_minor":5000}}'::jsonb,40),
  ('bh_usd_2026_launch','admissions','Admission Hub',75,50,'candidates','{}'::jsonb,50)
on conflict (pricing_version_code, item_key) do update set
  display_name = excluded.display_name,
  unit_amount_minor = excluded.unit_amount_minor,
  minimum_quantity = excluded.minimum_quantity,
  quantity_label = excluded.quantity_label,
  included_allowance = excluded.included_allowance,
  sort_order = excluded.sort_order;

create or replace function public.calculate_school_quote(
  p_school_id uuid,
  p_contract_term text,
  p_platform_seats integer,
  p_cambridge_seats integer default 0,
  p_ielts_seats integer default 0,
  p_writing_seats integer default 0,
  p_admissions_candidates integer default 0,
  p_launch_discount_requested boolean default false,
  p_pricing_version_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.billing_pricing_versions%rowtype;
  v_platform public.billing_price_items%rowtype;
  v_cambridge public.billing_price_items%rowtype;
  v_ielts public.billing_price_items%rowtype;
  v_writing public.billing_price_items%rowtype;
  v_admissions public.billing_price_items%rowtype;
  v_optional_count integer;
  v_combo_bps integer := 0;
  v_term_bps integer := 0;
  v_months integer := 1;
  v_platform_monthly bigint;
  v_cambridge_monthly bigint;
  v_ielts_monthly bigint;
  v_writing_monthly bigint;
  v_admissions_monthly bigint;
  v_addons_monthly bigint;
  v_combo_discount_monthly bigint;
  v_monthly_after_combo bigint;
  v_contract_list bigint;
  v_term_discount bigint;
  v_launch_discount bigint := 0;
  v_existing_discount bigint;
  v_max_discount bigint;
  v_contract_total bigint;
  v_first_year_total bigint;
  v_renewal_total bigint;
  v_current_students integer;
  v_estimated_students integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_school_id is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode = '42501', message = 'school_head_or_platform_administrator_required';
  end if;
  if p_contract_term not in ('monthly','annual','two_year','three_year') then
    return jsonb_build_object('success',false,'error','Choose monthly, annual, two-year, or three-year billing.');
  end if;

  select * into v_version from public.billing_pricing_versions bpv
  where bpv.code = coalesce(p_pricing_version_code, (select active.code from public.billing_pricing_versions active where active.is_active order by active.effective_at desc limit 1));
  if v_version.code is null or (not v_version.is_active and not public.is_superadmin(v_actor)) then
    return jsonb_build_object('success',false,'error','The selected pricing catalogue is unavailable.');
  end if;

  select * into v_platform from public.billing_price_items where pricing_version_code=v_version.code and item_key='platform';
  select * into v_cambridge from public.billing_price_items where pricing_version_code=v_version.code and item_key='cambridge';
  select * into v_ielts from public.billing_price_items where pricing_version_code=v_version.code and item_key='ielts';
  select * into v_writing from public.billing_price_items where pricing_version_code=v_version.code and item_key='writing';
  select * into v_admissions from public.billing_price_items where pricing_version_code=v_version.code and item_key='admissions';
  if v_platform.item_key is null or v_cambridge.item_key is null or v_ielts.item_key is null or v_writing.item_key is null or v_admissions.item_key is null then
    return jsonb_build_object('success',false,'error','The pricing catalogue is incomplete.');
  end if;

  if coalesce(p_platform_seats,0) < v_platform.minimum_quantity then
    return jsonb_build_object('success',false,'error',format('Platform seats have a %s-student minimum.',v_platform.minimum_quantity));
  end if;
  if coalesce(p_cambridge_seats,0) not between 0 and p_platform_seats or (p_cambridge_seats > 0 and p_cambridge_seats < v_cambridge.minimum_quantity) then
    return jsonb_build_object('success',false,'error',format('Cambridge must be 0 or at least %s students, and cannot exceed platform seats.',v_cambridge.minimum_quantity));
  end if;
  if coalesce(p_ielts_seats,0) not between 0 and p_platform_seats or (p_ielts_seats > 0 and p_ielts_seats < v_ielts.minimum_quantity) then
    return jsonb_build_object('success',false,'error',format('IELTS must be 0 or at least %s students, and cannot exceed platform seats.',v_ielts.minimum_quantity));
  end if;
  if coalesce(p_writing_seats,0) not between 0 and p_platform_seats or (p_writing_seats > 0 and p_writing_seats < v_writing.minimum_quantity) then
    return jsonb_build_object('success',false,'error',format('Writing Hub must be 0 or at least %s students, and cannot exceed platform seats.',v_writing.minimum_quantity));
  end if;
  if coalesce(p_admissions_candidates,0) < 0 or (p_admissions_candidates > 0 and p_admissions_candidates < v_admissions.minimum_quantity) then
    return jsonb_build_object('success',false,'error',format('Admission Hub must be 0 or at least %s candidates.',v_admissions.minimum_quantity));
  end if;

  v_optional_count := (p_cambridge_seats > 0)::integer + (p_ielts_seats > 0)::integer + (p_writing_seats > 0)::integer + (p_admissions_candidates > 0)::integer;
  v_combo_bps := case v_optional_count when 2 then v_version.combination_two_bps when 3 then v_version.combination_three_bps when 4 then v_version.combination_four_bps else 0 end;
  if p_contract_term='annual' then v_months:=12; v_term_bps:=v_version.annual_bps;
  elsif p_contract_term='two_year' then v_months:=24; v_term_bps:=v_version.two_year_bps;
  elsif p_contract_term='three_year' then v_months:=36; v_term_bps:=v_version.three_year_bps;
  end if;

  v_platform_monthly := p_platform_seats * v_platform.unit_amount_minor;
  v_cambridge_monthly := p_cambridge_seats * v_cambridge.unit_amount_minor;
  v_ielts_monthly := p_ielts_seats * v_ielts.unit_amount_minor;
  v_writing_monthly := p_writing_seats * v_writing.unit_amount_minor;
  v_admissions_monthly := p_admissions_candidates * v_admissions.unit_amount_minor;
  v_addons_monthly := v_cambridge_monthly + v_ielts_monthly + v_writing_monthly + v_admissions_monthly;
  v_combo_discount_monthly := round(v_addons_monthly::numeric * v_combo_bps / 10000)::bigint;
  v_monthly_after_combo := v_platform_monthly + v_addons_monthly - v_combo_discount_monthly;
  v_contract_list := (v_platform_monthly + v_addons_monthly) * v_months;
  v_term_discount := round((v_monthly_after_combo * v_months)::numeric * v_term_bps / 10000)::bigint;
  v_existing_discount := (v_combo_discount_monthly * v_months) + v_term_discount;
  v_max_discount := round(v_contract_list::numeric * v_version.maximum_discount_bps / 10000)::bigint;

  if p_launch_discount_requested then
    if p_contract_term='monthly' then
      v_launch_discount := round(v_monthly_after_combo::numeric * v_version.launch_bps / 10000)::bigint;
    else
      v_launch_discount := round((v_monthly_after_combo * 12 - round((v_monthly_after_combo * 12)::numeric * v_term_bps / 10000)::bigint)::numeric * v_version.launch_bps / 10000)::bigint;
    end if;
    v_launch_discount := greatest(0,least(v_launch_discount,v_max_discount-v_existing_discount));
  end if;

  v_contract_total := (v_monthly_after_combo * v_months) - v_term_discount - v_launch_discount;
  if p_contract_term='monthly' then
    v_first_year_total := v_contract_total * 12;
    v_renewal_total := v_monthly_after_combo;
  else
    v_first_year_total := (v_monthly_after_combo * 12) - round((v_monthly_after_combo * 12)::numeric * v_term_bps / 10000)::bigint - v_launch_discount;
    v_renewal_total := (v_monthly_after_combo * v_months) - v_term_discount;
  end if;

  select count(*)::integer into v_current_students from public.school_members sm
  where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student';
  select sr.estimated_students into v_estimated_students from public.school_requests sr
  where sr.approved_school_id=p_school_id order by sr.reviewed_at desc nulls last, sr.created_at desc limit 1;

  return jsonb_build_object(
    'success',true,
    'pricing_version',jsonb_build_object('code',v_version.code,'name',v_version.display_name,'currency',v_version.currency),
    'usage',jsonb_build_object('current_students',coalesce(v_current_students,0),'application_estimate',v_estimated_students),
    'inputs',jsonb_build_object('contract_term',p_contract_term,'platform_seats',p_platform_seats,'cambridge_seats',p_cambridge_seats,'ielts_seats',p_ielts_seats,'writing_seats',p_writing_seats,'admissions_candidates',p_admissions_candidates,'launch_discount_requested',p_launch_discount_requested),
    'catalogue',jsonb_build_array(
      jsonb_build_object('key','platform','name',v_platform.display_name,'unit_amount_minor',v_platform.unit_amount_minor,'minimum_quantity',v_platform.minimum_quantity,'quantity_label',v_platform.quantity_label,'included_allowance',v_platform.included_allowance),
      jsonb_build_object('key','cambridge','name',v_cambridge.display_name,'unit_amount_minor',v_cambridge.unit_amount_minor,'minimum_quantity',v_cambridge.minimum_quantity,'quantity_label',v_cambridge.quantity_label,'included_allowance',v_cambridge.included_allowance),
      jsonb_build_object('key','ielts','name',v_ielts.display_name,'unit_amount_minor',v_ielts.unit_amount_minor,'minimum_quantity',v_ielts.minimum_quantity,'quantity_label',v_ielts.quantity_label,'included_allowance',v_ielts.included_allowance),
      jsonb_build_object('key','writing','name',v_writing.display_name,'unit_amount_minor',v_writing.unit_amount_minor,'minimum_quantity',v_writing.minimum_quantity,'quantity_label',v_writing.quantity_label,'included_allowance',v_writing.included_allowance),
      jsonb_build_object('key','admissions','name',v_admissions.display_name,'unit_amount_minor',v_admissions.unit_amount_minor,'minimum_quantity',v_admissions.minimum_quantity,'quantity_label',v_admissions.quantity_label,'included_allowance',v_admissions.included_allowance)
    ),
    'line_items',jsonb_build_array(
      jsonb_build_object('key','platform','name',v_platform.display_name,'quantity',p_platform_seats,'unit_amount_minor',v_platform.unit_amount_minor,'monthly_amount_minor',v_platform_monthly),
      jsonb_build_object('key','cambridge','name',v_cambridge.display_name,'quantity',p_cambridge_seats,'unit_amount_minor',v_cambridge.unit_amount_minor,'monthly_amount_minor',v_cambridge_monthly),
      jsonb_build_object('key','ielts','name',v_ielts.display_name,'quantity',p_ielts_seats,'unit_amount_minor',v_ielts.unit_amount_minor,'monthly_amount_minor',v_ielts_monthly),
      jsonb_build_object('key','writing','name',v_writing.display_name,'quantity',p_writing_seats,'unit_amount_minor',v_writing.unit_amount_minor,'monthly_amount_minor',v_writing_monthly),
      jsonb_build_object('key','admissions','name',v_admissions.display_name,'quantity',p_admissions_candidates,'unit_amount_minor',v_admissions.unit_amount_minor,'monthly_amount_minor',v_admissions_monthly)
    ),
    'discounts',jsonb_build_object('combination_bps',v_combo_bps,'combination_monthly_minor',v_combo_discount_monthly,'term_bps',v_term_bps,'term_minor',v_term_discount,'launch_bps',case when p_launch_discount_requested then v_version.launch_bps else 0 end,'launch_minor',v_launch_discount,'maximum_bps',v_version.maximum_discount_bps),
    'totals',jsonb_build_object('months',v_months,'monthly_list_minor',v_platform_monthly+v_addons_monthly,'monthly_after_combination_minor',v_monthly_after_combo,'contract_total_minor',v_contract_total,'first_year_total_minor',v_first_year_total,'renewal_total_minor',v_renewal_total,'effective_monthly_minor',round(v_contract_total::numeric/v_months)::bigint,'effective_platform_student_month_minor',round(v_contract_total::numeric/v_months/p_platform_seats)::bigint),
    'rules',jsonb_build_object('teachers_and_admins_free',true,'seat_increases','immediate','seat_decreases','renewal','surprise_overages',false,'launch_subject_to_approval',p_launch_discount_requested)
  );
end;
$$;

create or replace function public.school_head_save_billing_quote(
  p_school_id uuid,
  p_quote_id uuid default null,
  p_title text default 'School plan scenario',
  p_contract_term text default 'annual',
  p_platform_seats integer default 50,
  p_cambridge_seats integer default 0,
  p_ielts_seats integer default 0,
  p_writing_seats integer default 0,
  p_admissions_candidates integer default 0,
  p_launch_discount_requested boolean default false,
  p_school_note text default null,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_quote public.school_billing_quotes%rowtype;
  v_previous_status text;
  v_calculation jsonb;
  v_pricing_version text;
  v_target_status text := case when p_submit then 'submitted' else 'draft' end;
begin
  if v_actor is null or p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception using errcode = '42501', message = 'school_head_access_required';
  end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 80 then
    return jsonb_build_object('success',false,'error','Give this scenario a name between 1 and 80 characters.');
  end if;

  v_calculation := public.calculate_school_quote(p_school_id,p_contract_term,p_platform_seats,p_cambridge_seats,p_ielts_seats,p_writing_seats,p_admissions_candidates,p_launch_discount_requested,null);
  if not coalesce((v_calculation->>'success')::boolean,false) then return v_calculation; end if;
  v_pricing_version := v_calculation#>>'{pricing_version,code}';

  if p_quote_id is null then
    if not p_submit and (select count(*) from public.school_billing_quotes q where q.school_id=p_school_id and q.status in ('draft','revision_requested')) >= 3 then
      return jsonb_build_object('success',false,'error','You can keep up to three editable scenarios. Submit, cancel, or reuse one before adding another.');
    end if;
    insert into public.school_billing_quotes (
      school_id,pricing_version_code,created_by,title,status,contract_term,platform_seats,
      cambridge_seats,ielts_seats,writing_seats,admissions_candidates,
      launch_discount_requested,calculation,school_note,submitted_at
    ) values (
      p_school_id,v_pricing_version,v_actor,trim(p_title),v_target_status,p_contract_term,p_platform_seats,
      p_cambridge_seats,p_ielts_seats,p_writing_seats,p_admissions_candidates,
      p_launch_discount_requested,v_calculation,nullif(trim(coalesce(p_school_note,'')),''),case when p_submit then now() else null end
    ) returning * into v_quote;
    v_previous_status := null;
  else
    select * into v_quote from public.school_billing_quotes q where q.id=p_quote_id and q.school_id=p_school_id for update;
    if v_quote.id is null then return jsonb_build_object('success',false,'error','Scenario not found.'); end if;
    if v_quote.status not in ('draft','revision_requested') then return jsonb_build_object('success',false,'error','Only draft or revision-requested scenarios can be changed.'); end if;
    v_previous_status := v_quote.status;
    update public.school_billing_quotes set
      pricing_version_code=v_pricing_version,title=trim(p_title),status=v_target_status,contract_term=p_contract_term,
      platform_seats=p_platform_seats,cambridge_seats=p_cambridge_seats,ielts_seats=p_ielts_seats,
      writing_seats=p_writing_seats,admissions_candidates=p_admissions_candidates,
      launch_discount_requested=p_launch_discount_requested,calculation=v_calculation,
      school_note=nullif(trim(coalesce(p_school_note,'')),''),submitted_at=case when p_submit then now() else submitted_at end,
      reviewed_by=null,reviewed_at=null,review_note=null,updated_at=now()
    where id=p_quote_id returning * into v_quote;
  end if;

  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,p_school_id,v_actor,case when v_previous_status is null and not p_submit then 'created' when p_submit then 'submitted' else 'saved' end,v_previous_status,v_target_status,v_quote.school_note,v_calculation);
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote));
end;
$$;

create or replace function public.school_head_list_billing_quotes(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_school_owner(p_school_id) then
    raise exception using errcode = '42501', message = 'school_head_access_required';
  end if;
  return jsonb_build_object('success',true,'quotes',coalesce((
    select jsonb_agg(to_jsonb(q) order by q.updated_at desc) from (
      select * from public.school_billing_quotes where school_id=p_school_id order by updated_at desc limit 20
    ) q
  ),'[]'::jsonb));
end;
$$;

create or replace function public.admin_list_school_billing_quotes(p_status text default null)
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
  return jsonb_build_object('success',true,'quotes',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',q.id,'school_id',q.school_id,'school_name',s.name,'title',q.title,'status',q.status,
      'contract_term',q.contract_term,'platform_seats',q.platform_seats,'cambridge_seats',q.cambridge_seats,
      'ielts_seats',q.ielts_seats,'writing_seats',q.writing_seats,'admissions_candidates',q.admissions_candidates,
      'launch_discount_requested',q.launch_discount_requested,'calculation',q.calculation,'school_note',q.school_note,
      'submitted_at',q.submitted_at,'reviewed_at',q.reviewed_at,'review_note',q.review_note,
      'created_at',q.created_at,'updated_at',q.updated_at,
      'school_head',case when u.id is null then null else jsonb_build_object('name',coalesce(u.full_name,u.username,'School Head'),'email',u.email) end
    ) order by case q.status when 'submitted' then 0 when 'revision_requested' then 1 when 'approved' then 2 else 3 end,q.submitted_at asc nulls last,q.updated_at desc)
    from public.school_billing_quotes q
    join public.schools s on s.id=q.school_id
    left join public.school_members sm on sm.school_id=q.school_id and sm.is_owner and sm.status='active'
    left join public.users u on u.id=sm.user_id
    where p_status is null or q.status=p_status
  ),'[]'::jsonb));
end;
$$;

create or replace function public.admin_review_school_billing_quote(
  p_quote_id uuid,
  p_action text,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_quote public.school_billing_quotes%rowtype;
  v_status text;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'platform_administrator_access_required';
  end if;
  if p_action not in ('approve','request_revision','reject') then
    return jsonb_build_object('success',false,'error','Choose approve, request revision, or reject.');
  end if;
  select * into v_quote from public.school_billing_quotes q where q.id=p_quote_id for update;
  if v_quote.id is null then return jsonb_build_object('success',false,'error','Quote not found.'); end if;
  if v_quote.status <> 'submitted' then return jsonb_build_object('success',false,'error','Only submitted quotes can be reviewed.'); end if;
  if p_action in ('request_revision','reject') and nullif(trim(coalesce(p_note,'')),'') is null then
    return jsonb_build_object('success',false,'error','Add a clear note for the School Head.');
  end if;
  v_status := case p_action when 'approve' then 'approved' when 'request_revision' then 'revision_requested' else 'rejected' end;
  update public.school_billing_quotes set status=v_status,reviewed_by=v_actor,reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),''),
    expires_at=case when p_action='approve' then coalesce(p_expires_at,now()+interval '30 days') else null end,updated_at=now()
  where id=p_quote_id returning * into v_quote;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,v_actor,v_status,'submitted',v_status,v_quote.review_note,v_quote.calculation);
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote));
end;
$$;

revoke all on function public.calculate_school_quote(uuid,text,integer,integer,integer,integer,integer,boolean,text) from public, anon, authenticated, service_role;
grant execute on function public.calculate_school_quote(uuid,text,integer,integer,integer,integer,integer,boolean,text) to authenticated;
revoke all on function public.school_head_save_billing_quote(uuid,uuid,text,text,integer,integer,integer,integer,integer,boolean,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.school_head_save_billing_quote(uuid,uuid,text,text,integer,integer,integer,integer,integer,boolean,text,boolean) to authenticated;
revoke all on function public.school_head_list_billing_quotes(uuid) from public, anon, authenticated, service_role;
grant execute on function public.school_head_list_billing_quotes(uuid) to authenticated;
revoke all on function public.admin_list_school_billing_quotes(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_school_billing_quotes(text) to authenticated;
revoke all on function public.admin_review_school_billing_quote(uuid,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_school_billing_quote(uuid,text,text,timestamptz) to authenticated;

comment on table public.billing_pricing_versions is 'Immutable, versioned commercial rules used by the authoritative Brains Heist quote calculator.';
comment on table public.school_billing_quotes is 'School plan scenarios and governed commercial requests. Quotes do not grant programme access.';
comment on function public.calculate_school_quote(uuid,text,integer,integer,integer,integer,integer,boolean,text) is 'Authoritative server-side pricing. Client calculations are display-only and never activate access.';
