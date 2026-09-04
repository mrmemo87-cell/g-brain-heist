create table if not exists private.roster_identity_claims (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  canonical_student_id uuid not null,
  auth_user_id uuid,
  email text not null,
  status text not null default 'roster_only',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint roster_identity_claims_status_check check (status in ('roster_only','claimable','claimed','blocked','resolved')),
  constraint roster_identity_claims_school_student_key unique (school_id, canonical_student_id)
);

create unique index if not exists roster_identity_claims_auth_user_uq
  on private.roster_identity_claims(auth_user_id)
  where auth_user_id is not null;

create or replace function private.refresh_school_roster_identity_states(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roster_only integer := 0;
  v_claimable integer := 0;
begin
  insert into private.roster_identity_claims(
    school_id, canonical_student_id, auth_user_id, email, status, details, updated_at
  )
  select distinct
    p_school_id,
    u.id,
    case when au.id is not null and au.email_confirmed_at is not null then au.id else null end,
    lower(trim(u.email)),
    case when au.id is not null and au.email_confirmed_at is not null then 'claimable' else 'roster_only' end,
    jsonb_build_object('source','current_roster','last_seen_at',now()),
    now()
  from public.class_students cs
  join public.classes c on c.id = cs.class_id and c.school_id = p_school_id
  join public.users u on u.id = cs.student_id
  left join auth.users au on au.id = u.id
  where not exists (
    select 1 from public.school_members sm
    where sm.school_id = p_school_id
      and sm.user_id = u.id
      and sm.role_in_school = 'student'
      and sm.status = 'active'
  )
  on conflict (school_id, canonical_student_id) do update
  set email = excluded.email,
      auth_user_id = coalesce(private.roster_identity_claims.auth_user_id, excluded.auth_user_id),
      status = case
        when private.roster_identity_claims.status = 'claimed' then 'claimed'
        when excluded.auth_user_id is not null then 'claimable'
        else 'roster_only'
      end,
      details = private.roster_identity_claims.details || excluded.details,
      updated_at = now();

  select count(*)::integer into v_roster_only
  from private.roster_identity_claims r
  where r.school_id = p_school_id and r.status = 'roster_only';

  select count(*)::integer into v_claimable
  from private.roster_identity_claims r
  where r.school_id = p_school_id and r.status = 'claimable';

  return jsonb_build_object('success',true,'roster_only',v_roster_only,'claimable',v_claimable);
end;
$$;

create or replace function private.phase3_immutable_placement_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.identity_rekey', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode='55000', message='placement_history_is_immutable';
end;
$$;

create or replace function private.claim_roster_identity_for_auth_user(p_auth_user_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
  v_old public.users%rowtype;
  v_school_id uuid;
  v_school_count integer;
  v_class_code text;
  v_grade text;
  v_archive_email text;
  v_archive_username text;
  v_key text;
  v_count bigint;
  v_unexpected jsonb := '{}'::jsonb;
  v_refs jsonb := '{}'::jsonb;
  v_allowed text[] := array[
    'public.class_students.student_id',
    'public.student_academic_enrolments.student_id',
    'public.student_assignments.student_id',
    'public.student_subject_enrolments.student_id',
    'public.school_student_placement_history.student_user_id',
    'public.school_student_placement_audit.student_user_id',
    'public.school_student_placement_exceptions.student_user_id',
    'public.school_year_rollover_student_decisions.student_id',
    'private.school_year_student_academic_snapshots.student_id',
    'public.school_members.user_id'
  ];
  r record;
begin
  select lower(trim(au.email))
  into v_auth_email
  from auth.users au
  where au.id = p_auth_user_id
    and au.email_confirmed_at is not null;

  if v_auth_email is null or v_auth_email <> lower(trim(coalesce(p_email,''))) then
    return jsonb_build_object('success',false,'code','auth_email_not_verified');
  end if;

  if exists (select 1 from public.users u where u.id = p_auth_user_id) then
    return jsonb_build_object('success',true,'code','profile_already_present','reused',true);
  end if;

  select u.* into v_old
  from public.users u
  where lower(trim(u.email)) = v_auth_email
    and u.id <> p_auth_user_id
    and not exists (select 1 from auth.users au where au.id = u.id)
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1
  for update;

  if v_old.id is null then
    return jsonb_build_object('success',false,'code','no_roster_profile_match');
  end if;

  select count(distinct c.school_id)::integer, min(c.school_id)
  into v_school_count, v_school_id
  from public.class_students cs
  join public.classes c on c.id = cs.class_id
  where cs.student_id = v_old.id;

  if v_school_count <> 1 or v_school_id is null then
    insert into private.roster_identity_claims(school_id,canonical_student_id,auth_user_id,email,status,details,updated_at)
    values(coalesce(v_school_id,'00000000-0000-0000-0000-000000000000'::uuid),v_old.id,p_auth_user_id,v_auth_email,'blocked',
      jsonb_build_object('reason','roster_school_is_not_unique'),now())
    on conflict (school_id,canonical_student_id) do update
      set auth_user_id=excluded.auth_user_id,status='blocked',details=excluded.details,updated_at=now();
    return jsonb_build_object('success',false,'code','roster_school_is_not_unique');
  end if;

  if exists (
    select 1 from public.school_members sm
    where sm.user_id = v_old.id and sm.status = 'active'
  ) then
    return jsonb_build_object('success',false,'code','canonical_profile_already_active');
  end if;

  for r in
    select ns.nspname as schema_name, cl.relname as table_name, a.attname as column_name
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class cl on cl.oid = fk.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
    where fk.contype = 'f'
      and fk.confrelid = 'public.users'::regclass
      and cardinality(fk.conkey) = 1
      and cardinality(fk.confkey) = 1
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.schema_name, r.table_name, r.column_name)
      into v_count using v_old.id;
    if v_count > 0 then
      v_key := r.schema_name || '.' || r.table_name || '.' || r.column_name;
      v_refs := v_refs || jsonb_build_object(v_key, v_count);
      if not (v_key = any(v_allowed)) then
        v_unexpected := v_unexpected || jsonb_build_object(v_key, v_count);
      end if;
    end if;
  end loop;

  if v_unexpected <> '{}'::jsonb then
    insert into private.roster_identity_claims(school_id,canonical_student_id,auth_user_id,email,status,details,updated_at)
    values(v_school_id,v_old.id,p_auth_user_id,v_auth_email,'blocked',
      jsonb_build_object('reason','unexpected_identity_references','references',v_unexpected),now())
    on conflict (school_id,canonical_student_id) do update
      set auth_user_id=excluded.auth_user_id,status='blocked',details=excluded.details,updated_at=now();
    return jsonb_build_object('success',false,'code','unexpected_identity_references','references',v_unexpected);
  end if;

  perform set_config('app.identity_rekey','1',true);

  v_archive_email := 'rekeyed+' || replace(v_old.id::text,'-','') || '@invalid.brainheist.local';
  v_archive_username := 'rekeyed_' || replace(v_old.id::text,'-','');

  update public.users
  set email = v_archive_email,
      username = v_archive_username,
      updated_at = now()
  where id = v_old.id;

  insert into public.users
  select (jsonb_populate_record(
    null::public.users,
    to_jsonb(v_old) || jsonb_build_object(
      'id',p_auth_user_id,
      'email',v_auth_email,
      'username',v_old.username,
      'updated_at',now()
    )
  )).*;

  for r in
    select ns.nspname as schema_name, cl.relname as table_name, a.attname as column_name,
           case (ns.nspname || '.' || cl.relname || '.' || a.attname)
             when 'public.class_students.student_id' then 10
             when 'public.student_academic_enrolments.student_id' then 20
             when 'public.student_subject_enrolments.student_id' then 30
             when 'public.student_assignments.student_id' then 40
             when 'public.school_student_placement_audit.student_user_id' then 50
             when 'public.school_student_placement_exceptions.student_user_id' then 60
             when 'public.school_year_rollover_student_decisions.student_id' then 70
             when 'private.school_year_student_academic_snapshots.student_id' then 80
             when 'public.school_student_placement_history.student_user_id' then 90
             when 'public.school_members.user_id' then 100
             else 999
           end as sort_order
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class cl on cl.oid = fk.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
    where fk.contype = 'f'
      and fk.confrelid = 'public.users'::regclass
      and cardinality(fk.conkey) = 1
      and cardinality(fk.confkey) = 1
      and (ns.nspname || '.' || cl.relname || '.' || a.attname) = any(v_allowed)
    order by sort_order
  loop
    execute format('update %I.%I set %I = $1 where %I = $2', r.schema_name, r.table_name, r.column_name, r.column_name)
      using p_auth_user_id, v_old.id;
  end loop;

  delete from public.users where id = v_old.id;

  insert into public.school_members(school_id,user_id,role_in_school,status,is_owner,can_teach)
  values(v_school_id,p_auth_user_id,'student','active',false,false)
  on conflict (user_id,school_id) do update
  set role_in_school='student',status='active',is_owner=false,can_teach=false,updated_at=now();

  select c.class_code,c.grade_level
  into v_class_code,v_grade
  from public.class_students cs
  join public.classes c on c.id=cs.class_id and c.school_id=v_school_id
  where cs.student_id=p_auth_user_id
  order by cs.joined_at desc nulls last,c.created_at desc,c.id
  limit 1;

  update public.users
  set batch = coalesce(nullif(v_class_code,''),batch),
      grade = coalesce(nullif(v_grade,''),grade),
      needs_setup = false,
      updated_at = now()
  where id = p_auth_user_id;

  insert into private.roster_identity_claims(school_id,canonical_student_id,auth_user_id,email,status,details,claimed_at,updated_at)
  values(v_school_id,v_old.id,p_auth_user_id,v_auth_email,'claimed',
    jsonb_build_object('references_moved',v_refs,'method','exact_verified_email_rekey'),now(),now())
  on conflict (school_id,canonical_student_id) do update
  set auth_user_id=excluded.auth_user_id,status='claimed',details=excluded.details,claimed_at=now(),updated_at=now();

  return jsonb_build_object('success',true,'code','roster_identity_claimed','school_id',v_school_id,'canonical_student_id',v_old.id,'auth_user_id',p_auth_user_id,'references_moved',v_refs);
exception when others then
  if v_old.id is not null and v_school_id is not null then
    insert into private.roster_identity_claims(school_id,canonical_student_id,auth_user_id,email,status,details,updated_at)
    values(v_school_id,v_old.id,p_auth_user_id,coalesce(v_auth_email,lower(trim(coalesce(p_email,'')))),'blocked',
      jsonb_build_object('reason','claim_transaction_failed','sqlstate',sqlstate,'message',sqlerrm),now())
    on conflict (school_id,canonical_student_id) do update
      set auth_user_id=excluded.auth_user_id,status='blocked',details=excluded.details,updated_at=now();
  end if;
  return jsonb_build_object('success',false,'code','claim_transaction_failed','sqlstate',sqlstate,'error',sqlerrm);
end;
$$;

create or replace function private.trg_claim_roster_identity_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.users u where u.id = new.id) then
    return new;
  end if;
  perform private.claim_roster_identity_for_auth_user(new.id,new.email);
  return new;
end;
$$;

drop trigger if exists a_roster_identity_claim_on_auth_insert on auth.users;
create trigger a_roster_identity_claim_on_auth_insert
after insert on auth.users
for each row execute function private.trg_claim_roster_identity_auth();

drop trigger if exists a_roster_identity_claim_on_auth_verified on auth.users;
create trigger a_roster_identity_claim_on_auth_verified
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is distinct from new.email_confirmed_at)
execute function private.trg_claim_roster_identity_auth();

do $$
declare v_school_id uuid;
begin
  select id into v_school_id from public.schools where name='Silk Road International School' order by created_at asc limit 1;
  if v_school_id is not null then
    perform private.refresh_school_roster_identity_states(v_school_id);
  end if;
end;
$$;
