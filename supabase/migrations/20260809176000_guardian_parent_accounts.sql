-- Phase 6: verified guardian relationships and parent-safe academic progress access.
-- Guardians are not school members. Access exists only through an active verified child relationship.

create table if not exists public.guardian_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  invited_email text not null,
  relationship_label text not null default 'Parent / Guardian',
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  constraint guardian_invitation_email_check check (invited_email = lower(trim(invited_email))),
  constraint guardian_invitation_relationship_check check (char_length(trim(relationship_label)) between 2 and 60)
);

create table if not exists public.student_guardian_relationships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship_label text not null default 'Parent / Guardian',
  status text not null default 'active' check (status in ('active','revoked')),
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null,
  invitation_id uuid references public.guardian_invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  unique(student_id, guardian_user_id)
);

create index if not exists guardian_invitations_school_status_idx on public.guardian_invitations(school_id, expires_at desc);
create index if not exists guardian_relationships_guardian_idx on public.student_guardian_relationships(guardian_user_id, status, created_at desc);
create index if not exists guardian_relationships_student_idx on public.student_guardian_relationships(student_id, status, created_at desc);
create index if not exists guardian_relationships_school_idx on public.student_guardian_relationships(school_id, status, created_at desc);

alter table public.guardian_accounts enable row level security;
alter table public.guardian_invitations enable row level security;
alter table public.student_guardian_relationships enable row level security;

-- Parent and school clients use scoped RPCs. Raw relationship/invitation tables stay private.
revoke all on table public.guardian_accounts from public, anon, authenticated;
revoke all on table public.guardian_invitations from public, anon, authenticated;
revoke all on table public.student_guardian_relationships from public, anon, authenticated;
grant select, insert, update, delete on table public.guardian_accounts to service_role;
grant select, insert, update, delete on table public.guardian_invitations to service_role;
grant select, insert, update, delete on table public.student_guardian_relationships to service_role;

create or replace function public.guardian_has_child_access(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_guardian_relationships r
    where r.guardian_user_id = (select auth.uid())
      and r.student_id = p_student_id
      and r.status = 'active'
  );
$$;
revoke all on function public.guardian_has_child_access(uuid) from public, anon, authenticated;
grant execute on function public.guardian_has_child_access(uuid) to authenticated, service_role;

create or replace function public.rpc_school_guardian_management_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_caller and sm.status='active' and sm.role_in_school='school_admin'
  order by sm.is_owner desc, sm.joined_at
  limit 1;
  if v_school_id is null then raise exception 'School administration access required'; end if;

  select jsonb_build_object(
    'school_id', v_school_id,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', u.id,
        'student_name', coalesce(nullif(trim(u.full_name),''),u.username),
        'class_name', coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade', u.grade
      ) order by coalesce(c.class_code,u.batch), coalesce(u.full_name,u.username))
      from public.school_members sm
      join public.users u on u.id=sm.user_id and u.school_id=sm.school_id
      left join public.class_students cs on cs.student_id=u.id
      left join public.classes c on c.id=cs.class_id and c.school_id=v_school_id and c.is_active is true
      where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student'
    ),'[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'student_id',r.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'guardian_user_id',r.guardian_user_id,
        'guardian_email',ga.primary_email,
        'guardian_name',ga.display_name,
        'relationship_label',r.relationship_label,
        'status',r.status,'verified_at',r.verified_at,'revoked_at',r.revoked_at
      ) order by r.created_at desc)
      from public.student_guardian_relationships r
      join public.users u on u.id=r.student_id
      left join public.guardian_accounts ga on ga.user_id=r.guardian_user_id
      where r.school_id=v_school_id
    ),'[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'student_id',i.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'invited_email',i.invited_email,'relationship_label',i.relationship_label,
        'expires_at',i.expires_at,'created_at',i.created_at,
        'claimed_at',i.claimed_at,'revoked_at',i.revoked_at,
        'status',case when i.revoked_at is not null then 'revoked' when i.claimed_at is not null then 'claimed' when i.expires_at < now() then 'expired' else 'pending' end
      ) order by i.created_at desc)
      from public.guardian_invitations i
      join public.users u on u.id=i.student_id
      where i.school_id=v_school_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.rpc_school_guardian_management_snapshot() from public, anon, authenticated;
grant execute on function public.rpc_school_guardian_management_snapshot() to authenticated, service_role;

create or replace function public.rpc_school_create_guardian_invitation(
  p_student_id uuid,
  p_invited_email text,
  p_relationship_label text default 'Parent / Guardian',
  p_expires_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_email text := lower(trim(coalesce(p_invited_email,'')));
  v_token text;
  v_invitation_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid guardian email'; end if;
  if char_length(trim(coalesce(p_relationship_label,''))) < 2 then raise exception 'Relationship is required'; end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin'
  order by sm.is_owner desc,sm.joined_at limit 1;
  if v_school_id is null then raise exception 'School administration access required'; end if;

  if not exists (
    select 1 from public.school_members sm
    where sm.school_id=v_school_id and sm.user_id=p_student_id and sm.status='active' and sm.role_in_school='student'
  ) then raise exception 'Student is not an active member of your school'; end if;

  -- Avoid parallel usable invites to the same email/child.
  update public.guardian_invitations
  set revoked_at=now()
  where school_id=v_school_id and student_id=p_student_id and invited_email=v_email
    and claimed_at is null and revoked_at is null and expires_at > now();

  v_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.guardian_invitations(
    school_id,student_id,invited_email,relationship_label,token_hash,expires_at,created_by
  ) values (
    v_school_id,p_student_id,v_email,trim(p_relationship_label),
    extensions.digest(v_token,'sha256'),
    now()+make_interval(days=>greatest(1,least(coalesce(p_expires_days,7),30))),v_caller
  ) returning id into v_invitation_id;

  return jsonb_build_object(
    'success',true,'invitation_id',v_invitation_id,'token',v_token,
    'expires_at',now()+make_interval(days=>greatest(1,least(coalesce(p_expires_days,7),30))),
    'invited_email',v_email
  );
end;
$$;
revoke all on function public.rpc_school_create_guardian_invitation(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.rpc_school_create_guardian_invitation(uuid,text,text,integer) to authenticated, service_role;

create or replace function public.rpc_school_revoke_guardian_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid()); v_school_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select school_id into v_school_id from public.guardian_invitations where id=p_invitation_id;
  if v_school_id is null then return false; end if;
  if not exists(select 1 from public.school_members sm where sm.school_id=v_school_id and sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin') then
    raise exception 'School administration access required';
  end if;
  update public.guardian_invitations set revoked_at=coalesce(revoked_at,now()) where id=p_invitation_id and claimed_at is null;
  return found;
end;
$$;
revoke all on function public.rpc_school_revoke_guardian_invitation(uuid) from public, anon, authenticated;
grant execute on function public.rpc_school_revoke_guardian_invitation(uuid) to authenticated, service_role;

create or replace function public.rpc_school_revoke_guardian_relationship(p_relationship_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid()); v_school_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select school_id into v_school_id from public.student_guardian_relationships where id=p_relationship_id;
  if v_school_id is null then return false; end if;
  if not exists(select 1 from public.school_members sm where sm.school_id=v_school_id and sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin') then
    raise exception 'School administration access required';
  end if;
  update public.student_guardian_relationships
  set status='revoked',revoked_at=now(),revoked_by=v_caller
  where id=p_relationship_id and status='active';
  return found;
end;
$$;
revoke all on function public.rpc_school_revoke_guardian_relationship(uuid) from public, anon, authenticated;
grant execute on function public.rpc_school_revoke_guardian_relationship(uuid) to authenticated, service_role;

create or replace function public.rpc_guardian_claim_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_auth auth.users%rowtype;
  v_inv public.guardian_invitations%rowtype;
  v_name text;
  v_relationship_id uuid;
begin
  if v_caller is null then raise exception 'Sign in before accepting this guardian invitation'; end if;
  select * into v_auth from auth.users where id=v_caller;
  if v_auth.id is null or v_auth.email is null then raise exception 'A verified email account is required'; end if;
  if v_auth.email_confirmed_at is null then raise exception 'Confirm your email before accepting the guardian invitation'; end if;

  select * into v_inv
  from public.guardian_invitations i
  where i.token_hash=extensions.digest(trim(coalesce(p_token,'')),'sha256')
  for update;
  if v_inv.id is null then raise exception 'Guardian invitation not found'; end if;
  if v_inv.revoked_at is not null then raise exception 'Guardian invitation was revoked'; end if;
  if v_inv.claimed_at is not null then raise exception 'Guardian invitation has already been used'; end if;
  if v_inv.expires_at < now() then raise exception 'Guardian invitation has expired'; end if;
  if lower(trim(v_auth.email)) <> v_inv.invited_email then
    raise exception 'Sign in with the email address this guardian invitation was sent to';
  end if;

  select coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),split_part(v_auth.email,'@',1)) into v_name
  from public.users u where u.id=v_caller;
  v_name := coalesce(v_name,split_part(v_auth.email,'@',1));

  insert into public.guardian_accounts(user_id,primary_email,display_name,updated_at)
  values(v_caller,lower(trim(v_auth.email)),v_name,now())
  on conflict(user_id) do update set primary_email=excluded.primary_email,display_name=coalesce(public.guardian_accounts.display_name,excluded.display_name),updated_at=now();

  insert into public.student_guardian_relationships(
    school_id,student_id,guardian_user_id,relationship_label,status,verified_at,verified_by,invitation_id
  ) values(
    v_inv.school_id,v_inv.student_id,v_caller,v_inv.relationship_label,'active',now(),v_inv.created_by,v_inv.id
  )
  on conflict(student_id,guardian_user_id) do update set
    school_id=excluded.school_id,relationship_label=excluded.relationship_label,status='active',verified_at=now(),
    verified_by=excluded.verified_by,invitation_id=excluded.invitation_id,revoked_at=null,revoked_by=null
  returning id into v_relationship_id;

  update public.guardian_invitations set claimed_by=v_caller,claimed_at=now() where id=v_inv.id;

  return jsonb_build_object('success',true,'relationship_id',v_relationship_id,'student_id',v_inv.student_id,'school_id',v_inv.school_id);
end;
$$;
revoke all on function public.rpc_guardian_claim_invitation(text) from public, anon, authenticated;
grant execute on function public.rpc_guardian_claim_invitation(text) to authenticated, service_role;

create or replace function public.rpc_guardian_my_children()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid()); v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id',r.id,'student_id',u.id,
    'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
    'relationship_label',r.relationship_label,
    'grade',u.grade,
    'class_name',coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
    'school_id',s.id,'school_name',s.name,'school_logo_url',s.logo_url,
    'verified_at',r.verified_at
  ) order by s.name,coalesce(u.full_name,u.username)),'[]'::jsonb)
  into v_result
  from public.student_guardian_relationships r
  join public.users u on u.id=r.student_id
  join public.schools s on s.id=r.school_id
  left join public.class_students cs on cs.student_id=u.id
  left join public.classes c on c.id=cs.class_id and c.school_id=r.school_id and c.is_active is true
  where r.guardian_user_id=v_caller and r.status='active';
  return v_result;
end;
$$;
revoke all on function public.rpc_guardian_my_children() from public, anon, authenticated;
grant execute on function public.rpc_guardian_my_children() to authenticated, service_role;

create or replace function public.rpc_guardian_child_progress(p_student_id uuid, p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_days integer := greatest(30,least(coalesce(p_days,90),365));
  v_start timestamptz := now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365)));
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select r.school_id into v_school_id from public.student_guardian_relationships r
  where r.guardian_user_id=v_caller and r.student_id=p_student_id and r.status='active';
  if v_school_id is null then raise exception 'You are not authorised to view this student'; end if;

  with child as (
    select u.id,coalesce(nullif(trim(u.full_name),''),u.username) name,u.grade,u.batch,s.name school_name,s.logo_url
    from public.users u join public.schools s on s.id=v_school_id where u.id=p_student_id and u.school_id=v_school_id
  ),
  current_focus as (
    select f.* from public.student_learning_focus_states f where f.school_id=v_school_id and f.student_id=p_student_id
  ),
  period_results as (
    select r.assignment_id,r.accuracy,r.correct,r.incorrect,r.score,r.completed_at,
      coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') subject,
      coalesce(nullif(trim(a.title),''),nullif(trim(a.topic_name),''),'Assignment') title,
      coalesce(nullif(trim(a.topic_name),''),'General') topic
    from public.student_assignment_results r join public.assignments a on a.id=r.assignment_id and a.school_id=v_school_id
    where r.student_id=p_student_id and r.completed_at>=v_start
  ),
  period_assignments as (
    select sa.assignment_id,sa.status,sa.due_at,
      coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') subject
    from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id and a.school_id=v_school_id
    where sa.student_id=p_student_id and sa.assigned_at>=v_start
  ),
  subjects as (
    select subject from period_results union select subject from current_focus
  ),
  subject_rows as (
    select s.subject,
      (select round(avg(r.accuracy)::numeric,1) from period_results r where lower(r.subject)=lower(s.subject)) assignment_average,
      (select count(*) from period_results r where lower(r.subject)=lower(s.subject))::int completed_assignments,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='persistent')::int persistent_focus_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='improving')::int improving_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='resolved')::int resolved_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status in('emerging_strength','consistent_strength'))::int strength_count
    from subjects s
  ),
  safe_timeline as (
    select o.id,o.subject,o.topic,o.skill,o.observation_type,o.source_type,o.observed_at,o.evidence_percentage,o.evidence_quality
    from public.student_learning_observations o
    where o.school_id=v_school_id and o.student_id=p_student_id and o.observed_at>=v_start
      and o.source_type in('assignment_result','writing_attempt')
    order by o.observed_at desc,o.id desc limit 120
  )
  select jsonb_build_object(
    'child',jsonb_build_object('id',c.id,'name',c.name,'grade',c.grade,'class_name',c.batch,'school_id',v_school_id,'school_name',c.school_name,'school_logo_url',c.logo_url),
    'period',jsonb_build_object('days',v_days,'start',v_start,'end',now()),
    'summary',jsonb_build_object(
      'assignment_average',(select round(avg(accuracy)::numeric,1) from period_results),
      'completed_assignments',(select count(*) from period_results),
      'assigned_assignments',(select count(*) from period_assignments),
      'overdue_assignments',(select count(*) from period_assignments where status<>'completed' and due_at is not null and due_at<now()),
      'persistent_focus_count',(select count(*) from current_focus where current_status='persistent'),
      'recurring_focus_count',(select count(*) from current_focus where current_status in('new_focus','recurring')),
      'improving_count',(select count(*) from current_focus where current_status='improving'),
      'resolved_count',(select count(*) from current_focus where current_status='resolved'),
      'strength_count',(select count(*) from current_focus where current_status in('emerging_strength','consistent_strength'))
    ),
    'subjects',coalesce((select jsonb_agg(to_jsonb(sr) order by sr.subject) from subject_rows sr),'[]'::jsonb),
    'focus_areas',coalesce((select jsonb_agg(jsonb_build_object(
      'subject',f.subject,'topic',f.topic,'skill',f.skill,'status',f.current_status,'trend',f.trend,'priority',f.priority,
      'first_observed_at',f.first_observed_at,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items,'latest_evidence_percentage',f.latest_evidence_percentage
    ) order by case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,f.last_observed_at desc)
      from current_focus f where f.current_status in('new_focus','recurring','persistent')),'[]'::jsonb),
    'improving',coalesce((select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc) from current_focus f where f.current_status='improving'),'[]'::jsonb),
    'resolved',coalesce((select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc) from current_focus f where f.current_status='resolved'),'[]'::jsonb),
    'strengths',coalesce((select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'status',f.current_status,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc) from current_focus f where f.current_status in('emerging_strength','consistent_strength')),'[]'::jsonb),
    'recent_assignments',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',r.assignment_id,'title',r.title,'subject',r.subject,'topic',r.topic,'accuracy',r.accuracy,'correct',r.correct,'incorrect',r.incorrect,'completed_at',r.completed_at) order by r.completed_at desc) from period_results r),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'subject',t.subject,'topic',t.topic,'skill',t.skill,'observation_type',t.observation_type,'source_type',t.source_type,'observed_at',t.observed_at,'evidence_percentage',t.evidence_percentage,'evidence_quality',t.evidence_quality) order by t.observed_at desc) from safe_timeline t),'[]'::jsonb)
  ) into v_result from child c;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.rpc_guardian_child_progress(uuid,integer) from public, anon, authenticated;
grant execute on function public.rpc_guardian_child_progress(uuid,integer) to authenticated, service_role;
