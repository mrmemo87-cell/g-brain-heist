-- Longitudinal Student Learning Memory foundation.
-- Historical observations are append-only; current focus state is a rebuildable projection.

create table if not exists public.student_learning_observations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  skill_key text not null,
  observation_type text not null check (observation_type in ('focus','developing','strength')),
  source_type text not null check (source_type in ('assignment_result','writing_attempt','teacher_observation','import')),
  source_id uuid,
  source_key text not null,
  observed_at timestamptz not null,
  evidence_percentage numeric(6,2) check (evidence_percentage is null or evidence_percentage between 0 and 100),
  evidence_count integer not null default 1 check (evidence_count > 0),
  evidence jsonb not null default '{}'::jsonb,
  system_generated boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, source_key)
);

create index if not exists idx_student_learning_observations_student_time on public.student_learning_observations(student_id, observed_at desc);
create index if not exists idx_student_learning_observations_student_skill on public.student_learning_observations(student_id, skill_key, observed_at desc);
create index if not exists idx_student_learning_observations_school_subject on public.student_learning_observations(school_id, subject, observed_at desc);

create table if not exists public.student_learning_focus_states (
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  skill_key text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  focus_occurrences integer not null default 0,
  developing_occurrences integer not null default 0,
  strength_occurrences integer not null default 0,
  recent_focus_occurrences integer not null default 0,
  recent_developing_occurrences integer not null default 0,
  recent_strength_occurrences integer not null default 0,
  latest_observation_type text not null check (latest_observation_type in ('focus','developing','strength')),
  current_status text not null check (current_status in ('new_focus','recurring','persistent','improving','resolved','emerging_strength','consistent_strength')),
  trend text not null check (trend in ('declining','stable','improving','resolved','strong')),
  priority text not null check (priority in ('high','medium','low')),
  latest_evidence_percentage numeric(6,2),
  evidence_items integer not null default 0,
  evidence_occurrences integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, skill_key)
);

create index if not exists idx_student_learning_focus_states_school_status on public.student_learning_focus_states(school_id, current_status, priority);
create index if not exists idx_student_learning_focus_states_student_subject on public.student_learning_focus_states(student_id, subject, priority, updated_at desc);

alter table public.student_learning_observations enable row level security;
alter table public.student_learning_focus_states enable row level security;
revoke all on table public.student_learning_observations from public, anon, authenticated;
revoke all on table public.student_learning_focus_states from public, anon, authenticated;
grant select, insert, update, delete on table public.student_learning_observations to service_role;
grant select, insert, update, delete on table public.student_learning_focus_states to service_role;

create or replace function public.student_learning_normalize_key(p_value text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function public.student_learning_normalize_key(text) from public, anon, authenticated;
grant execute on function public.student_learning_normalize_key(text) to service_role;

create or replace function public.student_learning_build_skill_key(p_subject text, p_topic text, p_skill text, p_subskill text default null)
returns text language sql immutable set search_path = '' as $$
  select concat_ws(':',
    public.student_learning_normalize_key(p_subject),
    public.student_learning_normalize_key(coalesce(nullif(trim(p_topic),''),p_skill)),
    public.student_learning_normalize_key(p_skill),
    nullif(public.student_learning_normalize_key(p_subskill),'')
  );
$$;
revoke all on function public.student_learning_build_skill_key(text,text,text,text) from public, anon, authenticated;
grant execute on function public.student_learning_build_skill_key(text,text,text,text) to service_role;

create or replace function public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  latest public.student_learning_observations%rowtype;
  first_at timestamptz; last_at timestamptz;
  f integer:=0; d integer:=0; s integer:=0;
  rf integer:=0; rd integer:=0; rs integer:=0;
  items integer:=0; occurrences integer:=0;
  status text; trend_value text; priority_value text;
begin
  if p_student_id is null or nullif(trim(p_skill_key),'') is null then return; end if;

  select o.* into latest from public.student_learning_observations o
  where o.student_id=p_student_id and o.skill_key=p_skill_key
    and coalesce((o.evidence->>'contributes_to_focus_state')::boolean, true)
  order by o.observed_at desc,o.created_at desc,o.id desc limit 1;

  if not found then
    delete from public.student_learning_focus_states x where x.student_id=p_student_id and x.skill_key=p_skill_key;
    return;
  end if;

  select min(o.observed_at),max(o.observed_at),
    count(*) filter(where o.observation_type='focus')::int,
    count(*) filter(where o.observation_type='developing')::int,
    count(*) filter(where o.observation_type='strength')::int,
    count(*)::int,coalesce(sum(o.evidence_count),0)::int
  into first_at,last_at,f,d,s,items,occurrences
  from public.student_learning_observations o
  where o.student_id=p_student_id and o.skill_key=p_skill_key
    and coalesce((o.evidence->>'contributes_to_focus_state')::boolean, true);

  with recent as (
    select o.observation_type from public.student_learning_observations o
    where o.student_id=p_student_id and o.skill_key=p_skill_key
      and coalesce((o.evidence->>'contributes_to_focus_state')::boolean, true)
    order by o.observed_at desc,o.created_at desc,o.id desc limit 3
  ) select count(*) filter(where observation_type='focus')::int,
           count(*) filter(where observation_type='developing')::int,
           count(*) filter(where observation_type='strength')::int
    into rf,rd,rs from recent;

  if f=0 then
    status:=case when s>=2 then 'consistent_strength' else 'emerging_strength' end;
    trend_value:=case when latest.observation_type='strength' then 'strong' else 'stable' end;
  elsif latest.observation_type='strength' and rs>=2 and rf=0 then
    status:='resolved'; trend_value:='resolved';
  elsif latest.observation_type in ('strength','developing') and (rs+rd)>=2 and rf<=1 then
    status:='improving'; trend_value:='improving';
  elsif f>=3 and rf>=2 then
    status:='persistent'; trend_value:=case when latest.observation_type='focus' then 'stable' else 'improving' end;
  elsif f>=2 then
    status:='recurring'; trend_value:=case when latest.observation_type='focus' and rf>=2 then 'declining' when latest.observation_type<>'focus' then 'improving' else 'stable' end;
  else
    status:='new_focus'; trend_value:=case when latest.observation_type='focus' then 'stable' else 'improving' end;
  end if;
  priority_value:=case when status='persistent' then 'high' when status in ('recurring','new_focus') then 'medium' else 'low' end;

  insert into public.student_learning_focus_states(
    school_id,student_id,subject,topic,skill,subskill,skill_key,first_observed_at,last_observed_at,
    focus_occurrences,developing_occurrences,strength_occurrences,recent_focus_occurrences,recent_developing_occurrences,recent_strength_occurrences,
    latest_observation_type,current_status,trend,priority,latest_evidence_percentage,evidence_items,evidence_occurrences,updated_at
  ) values(
    latest.school_id,latest.student_id,latest.subject,latest.topic,latest.skill,latest.subskill,latest.skill_key,first_at,last_at,
    f,d,s,rf,rd,rs,latest.observation_type,status,trend_value,priority_value,latest.evidence_percentage,items,occurrences,now()
  ) on conflict(student_id,skill_key) do update set
    school_id=excluded.school_id,subject=excluded.subject,topic=excluded.topic,skill=excluded.skill,subskill=excluded.subskill,
    first_observed_at=excluded.first_observed_at,last_observed_at=excluded.last_observed_at,focus_occurrences=excluded.focus_occurrences,
    developing_occurrences=excluded.developing_occurrences,strength_occurrences=excluded.strength_occurrences,
    recent_focus_occurrences=excluded.recent_focus_occurrences,recent_developing_occurrences=excluded.recent_developing_occurrences,
    recent_strength_occurrences=excluded.recent_strength_occurrences,latest_observation_type=excluded.latest_observation_type,
    current_status=excluded.current_status,trend=excluded.trend,priority=excluded.priority,
    latest_evidence_percentage=excluded.latest_evidence_percentage,evidence_items=excluded.evidence_items,
    evidence_occurrences=excluded.evidence_occurrences,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.student_learning_refresh_focus_state(uuid,text) from public, anon, authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid,text) to service_role;

create or replace function public.student_learning_after_observation_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.student_learning_refresh_focus_state(new.student_id,new.skill_key);
  return new;
end;
$$;
revoke all on function public.student_learning_after_observation_insert() from public, anon, authenticated;

drop trigger if exists trg_student_learning_refresh_focus_state on public.student_learning_observations;
create trigger trg_student_learning_refresh_focus_state after insert on public.student_learning_observations
for each row execute function public.student_learning_after_observation_insert();
