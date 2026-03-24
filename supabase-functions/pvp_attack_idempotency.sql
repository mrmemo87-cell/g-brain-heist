-- Idempotency tracking for PvP attacks

create table if not exists public.pvp_attack_attempts (
  request_id uuid primary key,
  attacker_id uuid not null references public.users(id) on delete cascade,
  defender_id uuid not null references public.users(id) on delete cascade,
  response jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_pvp_attack_attempts_attacker on public.pvp_attack_attempts(attacker_id, created_at desc);

alter table public.pvp_attack_attempts enable row level security;

drop policy if exists pvp_attack_attempts_owner_select on public.pvp_attack_attempts;
create policy pvp_attack_attempts_owner_select
  on public.pvp_attack_attempts for select to authenticated
  using (attacker_id = auth.uid() or defender_id = auth.uid());

drop policy if exists pvp_attack_attempts_owner_insert on public.pvp_attack_attempts;
create policy pvp_attack_attempts_owner_insert
  on public.pvp_attack_attempts for insert to authenticated
  with check (attacker_id = auth.uid());
