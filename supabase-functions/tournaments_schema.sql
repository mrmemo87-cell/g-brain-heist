-- Tournament scaffolding tables and helper RPCs
-- This script can be run via Supabase SQL editor or psql.
-- It creates seasons, school signups, brackets, and match scheduling tables.

create table if not exists public.tournament_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text generated always as (lower(replace(name, ' ', '-'))) stored,
  name text not null,
  description text,
  registration_opens timestamptz,
  registration_closes timestamptz,
  start_date timestamptz,
  end_date timestamptz,
  status text not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create trigger _tournament_seasons_updated_at
  before update on public.tournament_seasons
  for each row
  execute function public.set_current_timestamp_updated_at();

create table if not exists public.tournament_school_signups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.tournament_seasons(id) on delete cascade,
  school_name text not null,
  school_code text not null,
  contact_name text,
  contact_email text,
  notes text,
  status text not null default 'pending',
  roster jsonb default '[]'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  unique (season_id, school_code)
);

create index if not exists idx_tournament_school_signups_season
  on public.tournament_school_signups (season_id);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.tournament_seasons(id) on delete cascade,
  round_number integer not null,
  match_number integer not null,
  team_a_id uuid references public.tournament_school_signups(id) on delete set null,
  team_b_id uuid references public.tournament_school_signups(id) on delete set null,
  scheduled_at timestamptz,
  location text,
  stream_url text,
  status text not null default 'pending',
  winner_id uuid references public.tournament_school_signups(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  unique (season_id, round_number, match_number)
);

create index if not exists idx_tournament_matches_season_round
  on public.tournament_matches (season_id, round_number);

create or replace view public.tournament_public_bracket as
  select
    m.id as match_id,
    m.season_id,
    s.name as season_name,
    m.round_number,
    m.match_number,
    m.scheduled_at,
    m.location,
    m.stream_url,
    m.status,
    m.winner_id,
    m.metadata,
    team_a.school_name as team_a_name,
    team_a.school_code as team_a_code,
    team_b.school_name as team_b_name,
    team_b.school_code as team_b_code
  from public.tournament_matches m
  left join public.tournament_school_signups team_a on team_a.id = m.team_a_id
  left join public.tournament_school_signups team_b on team_b.id = m.team_b_id
  left join public.tournament_seasons s on s.id = m.season_id;

-- RPC helper to approve a school signup
create or replace function public.approve_tournament_signup(signup_id uuid)
returns public.tournament_school_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.tournament_school_signups;
begin
  update public.tournament_school_signups
    set status = 'approved'
  where id = signup_id
  returning * into updated;

  return updated;
end;
$$;

drop function if exists public.generate_season_bracket(uuid);
create or replace function public.generate_season_bracket(season_id uuid)
returns setof public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  approved_signups uuid[];
  index integer := 1;
  match_record public.tournament_matches;
begin
  select array_agg(id order by random())
  into approved_signups
  from public.tournament_school_signups
  where season_id = generate_season_bracket.season_id
    and status = 'approved';

  if approved_signups is null or array_length(approved_signups, 1) < 2 then
    raise exception 'Need at least two approved signups to generate bracket';
  end if;

  delete from public.tournament_matches where season_id = generate_season_bracket.season_id;

  while index <= array_length(approved_signups, 1) loop
    insert into public.tournament_matches (
      season_id,
      round_number,
      match_number,
      team_a_id,
      team_b_id,
      status
    ) values (
      generate_season_bracket.season_id,
      1,
      (index + 1) / 2,
      approved_signups[index],
      approved_signups[index + 1],
      'scheduled'
    )
    returning * into match_record;

    return next match_record;
    index := index + 2;
  end loop;

  return;
end;
$$;

-- Simple RPC to upsert match scheduling details
create or replace function public.update_match_schedule(
  match_id uuid,
  scheduled_at timestamptz,
  location text,
  stream_url text,
  metadata jsonb default null
)
returns public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.tournament_matches;
begin
  update public.tournament_matches
  set
    scheduled_at = update_match_schedule.scheduled_at,
    location = update_match_schedule.location,
    stream_url = update_match_schedule.stream_url,
    metadata = coalesce(update_match_schedule.metadata, metadata)
  where id = match_id
  returning * into updated;

  return updated;
end;
$$;

-- RPC to record match winner
create or replace function public.record_match_winner(
  match_id uuid,
  winner uuid,
  status text default 'completed'
)
returns public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.tournament_matches;
begin
  update public.tournament_matches
  set
    winner_id = winner,
    status = coalesce(status, 'completed')
  where id = match_id
  returning * into updated;

  return updated;
end;
$$;

-- Basic RLS policies (disabled by default, enable if needed)
-- alter table public.tournament_seasons enable row level security;
-- alter table public.tournament_school_signups enable row level security;
-- alter table public.tournament_matches enable row level security;

-- Example policy stubs (customize to your needs)
-- create policy "Admins can manage tournament data" on public.tournament_seasons
--   for all using (auth.role() = 'authenticated')
--   with check (auth.uid() = created_by);

