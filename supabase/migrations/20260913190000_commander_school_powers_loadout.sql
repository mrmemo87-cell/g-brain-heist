-- Cursed Commander school powers: carry trusted catalog identity into the owned practice loadout.
-- Combat remains server-authoritative; the browser never supplies school/power metadata.
begin;

create or replace function commander_private.loadout(p_user uuid,p_campaign text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.commander_profiles;
  w jsonb;
  s jsonb;
  g public.commander_catalog;
  a public.commander_catalog;
begin
  select * into strict p from public.commander_profiles where user_id=p_user and campaign_id=p_campaign;
  select stats into strict w from public.commander_catalog where id=p.weapon;
  select stats into strict s from public.commander_catalog where id=p.shield;
  select * into strict g from public.commander_catalog where id=p.guard;
  select * into strict a from public.commander_catalog where id=p.archer;

  return jsonb_build_object(
    'version',1,
    'profileVersion',p.version,
    'hp',100+6*(p.stamina_rank-1)+coalesce((w->>'hp')::integer,0)+coalesce((s->>'hp')::integer,0),
    'shield',(s->>'shield')::integer+2*(p.defense_rank-1),
    'bolt',26+2*(p.force_rank-1)+coalesce((w->>'bolt')::integer,0),
    'focus',7+(p.force_rank-1)+coalesce((w->>'focus')::integer,0),
    'guard',18+2*(p.defense_rank-1)+coalesce((s->>'guard')::integer,0),
    'shieldCap',30+2*(p.defense_rank-1)+greatest(0,(s->>'shield')::integer-12),
    'weaponName',(select name from public.commander_catalog where id=p.weapon),
    'shieldName',(select name from public.commander_catalog where id=p.shield),
    'units',jsonb_build_array(
      jsonb_build_object(
        'id','player_guard',
        'catalogId',g.id,
        'school',g.school,
        'name',g.name,
        'hp',(g.stats->>'hp')::integer,
        'shield',(g.stats->>'shield')::integer,
        'attack',(g.stats->>'attack')::integer+(p.dexterity_rank-1)
      ),
      jsonb_build_object(
        'id','player_archer',
        'catalogId',a.id,
        'school',a.school,
        'name',a.name,
        'hp',(a.stats->>'hp')::integer,
        'shield',(a.stats->>'shield')::integer,
        'attack',(a.stats->>'attack')::integer+(p.dexterity_rank-1)
      )
    )
  );
end $$;

commit;