-- Commander roster expansion: additive catalog metadata + four recruitable units.
-- No combat rules, reward math, wallet behavior, or existing ownership semantics change.
begin;

alter table public.commander_catalog
  add column if not exists school text not null default 'neutral',
  add column if not exists rarity text not null default 'common';

alter table public.commander_catalog
  drop constraint if exists commander_catalog_school_check,
  add constraint commander_catalog_school_check
    check (school in ('neutral','void','storm','rot','grave'));

alter table public.commander_catalog
  drop constraint if exists commander_catalog_rarity_check,
  add constraint commander_catalog_rarity_check
    check (rarity in ('common','rare','epic','legendary'));

update public.commander_catalog
set school = case id
  when 'void_saber' then 'void'
  when 'aegis_shield' then 'neutral'
  when 'neon_guard' then 'storm'
  when 'shade_archer' then 'void'
  when 'rift_blade' then 'void'
  when 'bastion_plate' then 'grave'
  when 'neon_bulwark' then 'storm'
  when 'shade_deadeye' then 'void'
  else school
end,
rarity = case id
  when 'void_saber' then 'common'
  when 'aegis_shield' then 'common'
  when 'neon_guard' then 'common'
  when 'shade_archer' then 'common'
  when 'rift_blade' then 'rare'
  when 'bastion_plate' then 'rare'
  when 'neon_bulwark' then 'rare'
  when 'shade_deadeye' then 'rare'
  else rarity
end
where id in (
  'void_saber','aegis_shield','neon_guard','shade_archer',
  'rift_blade','bastion_plate','neon_bulwark','shade_deadeye'
);

insert into public.commander_catalog
  (id,name,kind,slot,price,stats,description,active,school,rarity)
values
  (
    'grave_bastion','Grave Bastion','unit','guard',210,
    '{"hp":92,"shield":14,"attack":5}',
    'GRAVE // Fortress unit. Massive health and barrier pressure; trades damage for staying power.',
    true,'grave','epic'
  ),
  (
    'plague_scribe','Plague Scribe','unit','archer',220,
    '{"hp":58,"shield":0,"attack":9}',
    'ROT // Tactical ranged specialist. Stable damage profile built for future decay and control powers.',
    true,'rot','epic'
  ),
  (
    'rift_reaver','Rift Reaver','unit','guard',225,
    '{"hp":68,"shield":3,"attack":12}',
    'VOID // Frontline bruiser. Sacrifices protection for the hardest guard-slot attacks in the pilot roster.',
    true,'void','epic'
  ),
  (
    'volt_seer','Volt Seer','unit','archer',240,
    '{"hp":42,"shield":0,"attack":16}',
    'STORM // Glass-cannon ranged unit. Highest raw unit attack, but punishingly fragile when focused.',
    true,'storm','epic'
  )
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  slot = excluded.slot,
  price = excluded.price,
  stats = excluded.stats,
  description = excluded.description,
  active = excluded.active,
  school = excluded.school,
  rarity = excluded.rarity;

commit;
