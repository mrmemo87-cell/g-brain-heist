-- Proving Grounds arena: on by default for every school.
-- Owner decision 2026-11-06. A school with no arena_settings row now counts as open with the
-- defaults (cap 5, weekdays 15:00-23:59, weekends all day). School admins can still switch it
-- off, and teachers can still switch it off for a class or require assignments first.

alter table public.arena_settings alter column enabled set default true;

create or replace function private.arena_rules(p_uid uuid)
returns table (school_id uuid, class_id uuid, enabled boolean, daily_cap integer, window_start time, window_end time,
               weekend_all_day boolean, require_assignment boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text; v_school uuid; v_banned boolean; v_class uuid;
  v_school_row public.arena_settings%rowtype; v_class_row public.arena_settings%rowtype;
  v_enabled boolean; v_cap integer; v_start time; v_end time; v_weekend boolean;
begin
  select u.role, u.school_id, coalesce(u.is_banned, false) into v_role, v_school, v_banned from public.users u where u.id = p_uid;
  if not found or v_banned then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_user'; return; end if;
  if v_role <> 'student' then return query select v_school, null::uuid, false, 0, null::time, null::time, false, false, 'not_student'; return; end if;
  if v_school is null then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_school'; return; end if;

  select c.id into v_class
  from public.class_students cs join public.classes c on c.id = cs.class_id
  where cs.student_id = p_uid and coalesce(c.is_active, true)
  order by cs.joined_at desc nulls last limit 1;

  -- No school row means the defaults apply: open.
  select * into v_school_row from public.arena_settings s where s.school_id = v_school and s.class_id is null;
  v_enabled := coalesce(v_school_row.enabled, true);
  v_cap := coalesce(v_school_row.daily_cap, 5);
  v_start := coalesce(v_school_row.window_start, '15:00'::time);
  v_end := coalesce(v_school_row.window_end, '23:59'::time);
  v_weekend := coalesce(v_school_row.weekend_all_day, true);
  if not v_enabled then
    return query select v_school, v_class, false, v_cap, v_start, v_end, v_weekend, false, 'school_off'; return;
  end if;
  if v_class is not null then
    select * into v_class_row from public.arena_settings s where s.school_id = v_school and s.class_id = v_class;
    if found and not v_class_row.enabled then
      return query select v_school, v_class, false, v_cap, v_start, v_end, v_weekend, v_class_row.require_assignment, 'class_off'; return;
    end if;
  end if;
  return query select v_school, v_class, true, v_cap, v_start, v_end, v_weekend, coalesce(v_class_row.require_assignment, false), null::text;
end $$;
revoke all on function private.arena_rules(uuid) from public, anon, authenticated;

create or replace function public.rpc_arena_admin_settings(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); s public.arena_settings%rowtype; v_classes jsonb; v_week date := private.arena_week_start(private.arena_today());
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_school(v_uid, p_school_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select * into s from public.arena_settings where school_id = p_school_id and class_id is null;
  select coalesce(jsonb_agg(jsonb_build_object('class_id', c.id, 'class_name', c.class_name, 'enabled', coalesce(cs.enabled, true),
           'require_assignment', coalesce(cs.require_assignment, false)) order by c.class_name), '[]'::jsonb)
    into v_classes
  from public.classes c left join public.arena_settings cs on cs.class_id = c.id
  where c.school_id = p_school_id and coalesce(c.is_active, true);
  return jsonb_build_object('enabled', coalesce(s.enabled, true), 'daily_cap', coalesce(s.daily_cap, 5),
    'window_start', to_char(coalesce(s.window_start, '15:00'::time), 'HH24:MI'), 'window_end', to_char(coalesce(s.window_end, '23:59'::time), 'HH24:MI'),
    'weekend_all_day', coalesce(s.weekend_all_day, true), 'classes', v_classes,
    'matches_this_week', (select count(*) from public.arena_matches m where m.school_id = p_school_id and m.finished_at is not null and m.result <> 'abandoned' and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week));
end $$;
revoke all on function public.rpc_arena_admin_settings(uuid) from public, anon;
grant execute on function public.rpc_arena_admin_settings(uuid) to authenticated;

create or replace function public.rpc_arena_teacher_summary(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_school uuid; s public.arena_settings%rowtype; cs public.arena_settings%rowtype; v_week date := private.arena_week_start(private.arena_today());
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_class(v_uid, p_class_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select c.school_id into v_school from public.classes c where c.id = p_class_id;
  select * into s from public.arena_settings where school_id = v_school and class_id is null;
  select * into cs from public.arena_settings where class_id = p_class_id;
  return jsonb_build_object(
    'school_enabled', coalesce(s.enabled, true), 'class_enabled', coalesce(cs.enabled, true), 'require_assignment', coalesce(cs.require_assignment, false),
    'daily_cap', coalesce(s.daily_cap, 5),
    'matches_this_week', (select count(*) from public.arena_matches m where m.class_id = p_class_id and m.finished_at is not null and m.result <> 'abandoned' and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'respawn_questions_this_week', (select coalesce(sum(m.respawn_questions), 0) from public.arena_matches m where m.class_id = p_class_id and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'respawn_correct_this_week', (select coalesce(sum(m.respawn_correct), 0) from public.arena_matches m where m.class_id = p_class_id and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'tickets_earned_this_week', (select coalesce(sum(l.amount), 0) from private.arena_ticket_ledger l join public.class_students st on st.student_id = l.user_id where st.class_id = p_class_id and (l.created_at at time zone 'Asia/Bishkek')::date >= v_week),
    'students', (select count(*) from public.class_students st where st.class_id = p_class_id));
end $$;
revoke all on function public.rpc_arena_teacher_summary(uuid) from public, anon;
grant execute on function public.rpc_arena_teacher_summary(uuid) to authenticated;
