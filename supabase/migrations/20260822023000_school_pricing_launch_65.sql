-- Update the active Brains Heist school launch offer.
--
-- The public pricing calculator and Billing Studio both read these values from
-- the active pricing catalogue, so keep the launch percentage and total
-- discount ceiling aligned. The 65% ceiling prevents term/combination
-- discounts from stacking beyond the advertised launch offer.

update public.billing_pricing_versions
set
  launch_bps = 6500,
  maximum_discount_bps = 6500,
  updated_at = now()
where code = 'bh_usd_2026_launch';
