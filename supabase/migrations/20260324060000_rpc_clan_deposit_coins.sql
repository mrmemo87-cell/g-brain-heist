set check_function_bodies = off;

create or replace function public.rpc_clan_deposit_coins(p_amount integer)
returns table (new_clan_vault integer, new_user_coins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_coins integer;
  v_clan_id uuid;
  v_clan_vault integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select u.coins
  into v_user_coins
  from public.users u
  where u.id = v_user_id
  for update;

  if v_user_coins is null then
    raise exception 'User profile not found';
  end if;

  if v_user_coins < p_amount then
    raise exception 'Insufficient funds';
  end if;

  select cm.clan_id
  into v_clan_id
  from public.clan_members cm
  where cm.user_id = v_user_id
  limit 1;

  if v_clan_id is null then
    raise exception 'Not in a clan';
  end if;

  select c.vault_coins
  into v_clan_vault
  from public.clans c
  where c.id = v_clan_id
  for update;

  if v_clan_vault is null then
    raise exception 'Clan not found';
  end if;

  update public.users
  set coins = coins - p_amount
  where id = v_user_id
  returning coins into new_user_coins;

  update public.clans
  set vault_coins = vault_coins + p_amount
  where id = v_clan_id
  returning vault_coins into new_clan_vault;

  return next;
end;
$$;

grant execute on function public.rpc_clan_deposit_coins(integer) to authenticated;
