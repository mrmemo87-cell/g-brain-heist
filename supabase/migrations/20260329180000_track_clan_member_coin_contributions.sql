set check_function_bodies = off;

create table if not exists public.clan_member_coin_contributions (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  total_deposited integer not null default 0,
  last_deposit_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clan_id, user_id),
  constraint clan_member_coin_contributions_nonnegative check (total_deposited >= 0)
);

create index if not exists idx_clan_member_coin_contributions_user
  on public.clan_member_coin_contributions (user_id, clan_id);

alter table public.clan_member_coin_contributions enable row level security;

drop policy if exists "Clan members can view deposit totals" on public.clan_member_coin_contributions;
create policy "Clan members can view deposit totals"
  on public.clan_member_coin_contributions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clan_members cm
      where cm.clan_id = clan_member_coin_contributions.clan_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Service role manages deposit totals" on public.clan_member_coin_contributions;
create policy "Service role manages deposit totals"
  on public.clan_member_coin_contributions
  for all
  to service_role
  using (true)
  with check (true);

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

  insert into public.clan_member_coin_contributions (clan_id, user_id, total_deposited, last_deposit_at, updated_at)
  values (v_clan_id, v_user_id, p_amount, now(), now())
  on conflict (clan_id, user_id)
  do update
    set total_deposited = clan_member_coin_contributions.total_deposited + excluded.total_deposited,
        last_deposit_at = now(),
        updated_at = now();

  return next;
end;
$$;

grant execute on function public.rpc_clan_deposit_coins(integer) to authenticated;
