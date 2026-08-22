-- Make annual billing the standard Brains Heist school agreement.
--
-- Monthly billing is no longer offered in the public or School Admin pricing
-- flows, so annual pricing is the baseline rather than a separate 10% term
-- promotion. Multi-year term discounts and the Launch offer remain governed
-- by the active catalogue.

update public.billing_pricing_versions
set
  annual_bps = 0,
  updated_at = now()
where code = 'bh_usd_2026_launch';
