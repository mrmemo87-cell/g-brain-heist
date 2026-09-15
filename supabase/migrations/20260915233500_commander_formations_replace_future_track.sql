-- Formation Command replaces the earlier placeholder post-Level-40 roadmap.
-- None of the removed keys are consumed by shipped gameplay; keeping them would advertise
-- progression systems that are no longer the active product contract.
begin;

update public.commander_campaigns
set rules = (
  rules
  - 'skillTreeUnlockLevel'
  - 'synergyUnlockLevel'
  - 'eliteUnlockLevel'
  - 'advancedPowerUnlockLevel'
  - 'legendaryUnlockLevel'
) || '{
  "progressionVersion":3,
  "formationTrackEndLevel":100
}'::jsonb
where active;

comment on column public.commander_campaigns.rules is
  'Commander campaign rules. Progression v3 uses Formation Command as the continuous Level 41-100 tactical track.';

notify pgrst, 'reload schema';
commit;
