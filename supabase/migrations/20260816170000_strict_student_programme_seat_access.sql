-- Require an explicit named programme-seat allocation before a school student
-- can use Cambridge, IELTS, or Writing Hub. School membership alone never
-- grants or consumes a programme seat.

create or replace function private.student_has_programme_seat(
  p_school_id uuid,
  p_module_key text,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_module_key in ('cambridge','ielts','writing')
    and exists(
      select 1
      from public.school_programme_seat_assignments assignment
      where assignment.school_id = p_school_id
        and assignment.module_key = p_module_key
        and assignment.student_user_id = p_student_id
        and assignment.released_at is null
    );
$$;

revoke all on function private.student_has_programme_seat(uuid,text,uuid)
  from public, anon, authenticated, service_role;

-- Existing active pilots promised 50 students in every programme. Give those
-- entitlements a real named-seat capacity so the School Head can explicitly
-- allocate the pilot seats instead of receiving an "unconfigured" error.
update public.school_module_entitlements entitlement
set seat_limit = 50,
    updated_at = now()
where entitlement.source = 'pilot'
  and entitlement.enabled
  and entitlement.module_key in ('core','cambridge','ielts','writing','admissions')
  and entitlement.seat_limit is null
  and (entitlement.ends_at is null or entitlement.ends_at > now());

update public.schools school
set settings = jsonb_set(coalesce(school.settings, '{}'::jsonb), '{max_students}', '50'::jsonb, true),
    updated_at = now()
where school.school_plan = 'pilot'
  and school.trial_ends_at > now()
  and not (coalesce(school.settings, '{}'::jsonb) ? 'max_students');

create or replace function public.start_school_pilot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_school public.schools%rowtype;
  v_pilot public.school_pilot_lifecycle%rowtype;
  v_ends_at timestamptz;
  v_students integer;
  v_teachers integer;
  v_module text;
begin
  if v_actor is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  select sm.school_id into v_school_id from public.school_members sm
  where sm.user_id=v_actor and sm.status='active' and sm.is_owner
  order by sm.joined_at asc nulls last,sm.school_id limit 1;
  if v_school_id is null or not public.is_school_owner(v_school_id) then
    return jsonb_build_object('success',false,'error','Only the School Head can start the school pilot.');
  end if;

  select * into v_school from public.schools s where s.id=v_school_id for update;
  insert into public.school_pilot_lifecycle(school_id) values(v_school_id) on conflict (school_id) do nothing;
  select * into v_pilot from public.school_pilot_lifecycle spl where spl.school_id=v_school_id for update;

  if v_pilot.state <> 'not_started' or v_school.trial_ends_at is not null then
    return jsonb_build_object('success',false,'error','This school has already used its one 30-day pilot.');
  end if;
  if v_school.school_plan is distinct from 'none' then
    return jsonb_build_object('success',false,'error','This school already has a plan.');
  end if;
  if exists(select 1 from public.billing_subscriptions bs where bs.school_id=v_school_id and bs.status in ('active','trialing','past_due')) then
    return jsonb_build_object('success',false,'error','This school already has an active billing agreement.');
  end if;

  select count(*)::integer into v_students from public.school_members sm
  where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student';
  select count(*)::integer into v_teachers from public.school_members sm
  where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='teacher';
  if v_students > 50 then return jsonb_build_object('success',false,'error','The pilot supports up to 50 registered students. Request a paid package for this school size.'); end if;
  if v_teachers > 10 then return jsonb_build_object('success',false,'error','The pilot supports up to 10 registered teachers. Request a paid package for this school size.'); end if;

  v_ends_at := now()+interval '30 days';
  update public.schools
  set school_plan='pilot', trial_ends_at=v_ends_at,
      settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{max_students}','50'::jsonb,true),
      updated_at=now()
  where id=v_school_id;
  update public.school_pilot_lifecycle set state='active',started_at=now(),ends_at=v_ends_at,started_by=v_actor,updated_at=now() where school_id=v_school_id;

  foreach v_module in array array['core','cambridge','ielts','writing','admissions'] loop
    insert into public.school_module_entitlements(
      school_id,module_key,enabled,source,starts_at,ends_at,configured_by,notes,seat_limit
    ) values(
      v_school_id,v_module,true,'pilot',now(),v_ends_at,v_actor,
      '30-day all-programme school pilot',50
    )
    on conflict (school_id,module_key) do update set
      enabled=true,source='pilot',starts_at=excluded.starts_at,ends_at=excluded.ends_at,
      configured_by=excluded.configured_by,notes=excluded.notes,seat_limit=50,updated_at=now();
  end loop;

  perform public.init_school_pilot_usage(v_school_id);
  return jsonb_build_object(
    'success',true,'plan','pilot','pilot_state','active','trial_ends_at',v_ends_at,
    'limits',jsonb_build_object('students',50,'teachers',10,'admission_candidates',50),
    'programmes',array['core','cambridge','ielts','writing','admissions'],
    'message','30-day all-programme pilot activated. Allocate named programme seats before students can enter a programme.'
  );
end;
$$;

revoke all on function public.start_school_pilot() from public, anon, authenticated, service_role;
grant execute on function public.start_school_pilot() to authenticated;

-- Return both commercial availability and the learner's named-seat state. The
-- UI can therefore show the complete catalogue while explaining why a card is
-- locked, without treating a hidden card as an authorization boundary.
create or replace function public.get_my_effective_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid;
  v_role text;
  v_plan text := 'free';
  v_entitlements jsonb := '{}'::jsonb;
  v_purchased boolean;
  v_allocated boolean;
  v_available boolean;
  v_programme_catalogue jsonb := '{}'::jsonb;
  v_module text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'plan', 'free', 'school_id', null,
      'modules', '{}'::jsonb, 'programme_catalogue', '{}'::jsonb, 'entitlements', '{}'::jsonb);
  end if;

  v_school_id := private.actor_school_id(v_uid);
  if v_school_id is not null then
    select sm.role_in_school into v_role
    from public.school_members sm
    where sm.school_id=v_school_id and sm.user_id=v_uid and sm.status='active'
    order by sm.joined_at asc nulls last limit 1;
  end if;
  v_plan := case
    when v_school_id is not null then private.professional_onboarding_active_plan(v_school_id)
    else coalesce(public.get_effective_tier(v_uid), 'free')
  end;

  select coalesce(jsonb_object_agg(rows.feature_key, jsonb_build_object(
    'feature_key', rows.feature_key,
    'enabled', rows.effective_enabled,
    'limit_value', case when rows.effective_enabled then rows.limit_value else 0 end,
    'module_key', rows.module_key
  )), '{}'::jsonb)
  into v_entitlements
  from (
    select be.feature_key, be.limit_value,
      private.feature_module_key(be.feature_key) as module_key,
      be.enabled and (
        v_school_id is null
        or private.actor_can_access_school_programme(
          v_school_id, private.feature_module_key(be.feature_key), false
        )
      ) as effective_enabled
    from public.billing_entitlements be
    where be.plan = v_plan
  ) rows;

  if v_school_id is not null then
    foreach v_module in array array['cambridge','ielts','writing']::text[] loop
      v_purchased := public.school_has_module_access(v_school_id,v_module);
      v_allocated := v_role <> 'student' or private.student_has_programme_seat(v_school_id,v_module,v_uid);
      v_available := v_purchased and v_allocated;
      v_programme_catalogue := v_programme_catalogue || jsonb_build_object(v_module,jsonb_build_object(
        'purchased',v_purchased,
        'seat_allocated',v_allocated,
        'available',v_available,
        'reason',case
          when not v_purchased then 'not_purchased'
          when not v_allocated then 'seat_not_allocated'
          else 'available'
        end
      ));
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'plan', v_plan,
    'school_id', v_school_id,
    'modules', jsonb_build_object(
      'core', case when v_school_id is null then true else private.actor_can_access_school_programme(v_school_id,'core',false) end,
      'cambridge', case when v_school_id is null then false else private.actor_can_access_school_programme(v_school_id,'cambridge',false) end,
      'ielts', case when v_school_id is null then false else private.actor_can_access_school_programme(v_school_id,'ielts',false) end,
      'writing', case when v_school_id is null then false else private.actor_can_access_school_programme(v_school_id,'writing',false) end,
      'admissions', case when v_school_id is null then false else private.actor_can_access_school_programme(v_school_id,'admissions',false) end
    ),
    'programme_catalogue', v_programme_catalogue,
    'entitlements', v_entitlements
  );
end;
$$;

revoke all on function public.get_my_effective_entitlements() from public, anon, authenticated, service_role;
grant execute on function public.get_my_effective_entitlements() to authenticated;

comment on function private.student_has_programme_seat(uuid,text,uuid) is
  'Fail-closed named programme-seat authority. School membership or a null legacy seat limit never grants student access.';
