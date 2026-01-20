-- Idempotency tracking for PvP attacks

create table if not exists public.pvp_attack_attempts (
  request_id uuid primary key,
  attacker_id uuid not null references public.users(id) on delete cascade,
  defender_id uuid not null references public.users(id) on delete cascade,
  response jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_pvp_attack_attempts_attacker on public.pvp_attack_attempts(attacker_id, created_at desc);
