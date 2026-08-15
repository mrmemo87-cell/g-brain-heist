-- Public, read-only school pricing contract.
--
-- This is an intentional anonymous API surface. It returns only the active
-- catalogue, discount rules, pilot allowance, and non-sensitive commercial
-- rules. It never returns school, user, quote, subscription, or payment data.

create or replace function public.get_public_school_pricing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with active_version as (
    select v.*
    from public.billing_pricing_versions v
    where v.is_active
    order by v.effective_at desc
    limit 1
  ), catalogue as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', i.item_key,
          'name', i.display_name,
          'unit_amount_minor', i.unit_amount_minor,
          'minimum_quantity', i.minimum_quantity,
          'quantity_label', i.quantity_label,
          'included_allowance', i.included_allowance
        ) order by i.sort_order
      ),
      '[]'::jsonb
    ) as items
    from active_version v
    join public.billing_price_items i on i.pricing_version_code = v.code
  )
  select jsonb_build_object(
    'success', true,
    'pricing_version', jsonb_build_object(
      'code', v.code,
      'name', v.display_name,
      'currency', v.currency,
      'effective_at', v.effective_at
    ),
    'catalogue', c.items,
    'discounts', jsonb_build_object(
      'combination_two_bps', v.combination_two_bps,
      'combination_three_bps', v.combination_three_bps,
      'combination_four_bps', v.combination_four_bps,
      'annual_bps', v.annual_bps,
      'two_year_bps', v.two_year_bps,
      'three_year_bps', v.three_year_bps,
      'launch_bps', v.launch_bps,
      'maximum_discount_bps', v.maximum_discount_bps
    ),
    'pilot', jsonb_build_object(
      'days', 30,
      'platform_students', 50,
      'teachers', 10,
      'admission_candidates', 50,
      'all_programmes', true,
      'card_required', false
    ),
    'rules', jsonb_build_object(
      'teachers_and_admins_free', true,
      'seat_increases', 'immediate',
      'seat_decreases', 'renewal',
      'surprise_overages', false,
      'launch_subject_to_approval', true,
      'activation', 'approved_quote_and_verified_payment'
    )
  )
  from active_version v
  cross join catalogue c;
$$;

revoke all on function public.get_public_school_pricing() from public, anon, authenticated, service_role;
grant execute on function public.get_public_school_pricing() to anon, authenticated, service_role;

comment on function public.get_public_school_pricing() is
  'Intentional anonymous read-only API returning only the active public school pricing catalogue and commercial rules.';

