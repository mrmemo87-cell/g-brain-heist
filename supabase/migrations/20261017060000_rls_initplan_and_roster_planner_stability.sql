-- 2026-10-17 classroom runtime overhead reduction (part 1 of 2).
--
-- Never queue an ACCESS EXCLUSIVE request behind live classroom reads.
set local lock_timeout = '3s';
--
-- Scope: performance only. No table data, grants, policy roles, policy commands,
-- function bodies or authorization rules change.
--
-- A) private.teacher_current_teaching_roster: the planner reordered its joins
--    so that every school member was joined to every subject offering before
--    the teacher's groups were applied (~145k intermediate rows, ~550 ms per
--    call). The query is written in the efficient order (teacher groups ->
--    group -> offering -> enrolment -> member -> user -> class), so we only ask
--    the planner to keep the written join order. A planner GUC cannot change a
--    query's result. Verified on production data in a rolled-back transaction:
--    36 teacher/school cases, 266 rows, 0 differences, 4095 ms -> 164 ms total.
--    This function backs the teacher roster, Writing Hub, IELTS review and
--    academic-profile access checks (20+ callers).
alter function private.teacher_current_teaching_roster(uuid, uuid)
  set join_collapse_limit = 1;

-- B) RLS initPlan normalization (Supabase advisor lint 0003 auth_rls_initplan).
--    Policies called auth.uid()/auth.role()/auth.jwt() and argument-free (or
--    constant-argument) STABLE scalar permission helpers once PER ROW, e.g. the
--    restrictive feature guard can_use_feature('assignments', false) ran once
--    for each of 1,626 student_assignments rows on a teacher's assignment list.
--    Wrapping a STABLE scalar expression E as (SELECT E) yields the identical
--    value (STABLE guarantees one result per statement) but evaluates it once.
--
--    Safety rails enforced below; any failure aborts the whole migration:
--      * only an explicit allow-list of STABLE, non-set-returning, RAISE-free
--        helpers is wrapped, and only when every argument is a constant or
--        auth.uid() (calls with column arguments are left per-row);
--      * after ALTER POLICY, the deparsed policy is "unwrapped" again and must
--        equal the unwrapped original exactly, and all string literals must be
--        identical, proving the wrapper is the only change;
--      * roles, command, permissive/restrictive mode are never touched.
-- Session-only helper used by the proof step below (lives in pg_temp, not persisted).
create function pg_temp._rls_unwrap(p_text text, p_pat text)
returns text language plpgsql immutable as $fn$
declare v_prev text; v_cur text := p_text; i integer := 0;
begin
  loop
    v_prev := v_cur;
    v_cur := regexp_replace(v_cur, p_pat, '\1(\2)', 'g');
    i := i + 1;
    exit when v_cur = v_prev or i >= 6;
  end loop;
  return v_cur;
end;
$fn$;

do $rls$
declare
  r record;
  v_names constant text :=
    '(?:auth\.(?:uid|role|jwt))'
    '|(?:private\.(?:actor_has_programme_access|ielts_extra_practice_access_context))'
    '|(?:is_bh_admin_or_teacher|is_bh_admin|is_bh_teacher|is_bh_member|is_superadmin'
    '|can_use_feature|is_ielts_admin|is_tournament_admin|rivalry_is_service_or_admin'
    '|adm_is_platform_admin|get_caller_school_id|current_user_school_id'
    '|get_my_active_school_id)';
  v_wrap_pat text;
  v_unwrap_pat text;
  v_new_qual text;
  v_new_check text;
  v_after record;
  v_changed integer := 0;
  v_fn record;
begin
  perform pg_catalog.set_config('search_path', 'public', true);

  -- Guard: every allow-listed helper must still be STABLE/IMMUTABLE, scalar and RAISE-free.
  for v_fn in
    select n.nspname, p.proname, p.provolatile, p.proretset,
           pg_catalog.pg_get_functiondef(p.oid) ~* '\mraise\M' as has_raise
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'auth' and p.proname in ('uid','role','jwt'))
       or (n.nspname = 'private' and p.proname in ('actor_has_programme_access','ielts_extra_practice_access_context'))
       or (n.nspname = 'public' and p.proname in (
            'is_bh_admin_or_teacher','is_bh_admin','is_bh_teacher','is_bh_member','is_superadmin',
            'can_use_feature','is_ielts_admin','is_tournament_admin','rivalry_is_service_or_admin',
            'adm_is_platform_admin','get_caller_school_id','current_user_school_id','get_my_active_school_id'))
  loop
    if v_fn.provolatile = 'v' or v_fn.proretset or v_fn.has_raise then
      raise exception 'rls_initplan_guard: %.% is not a safe STABLE scalar helper', v_fn.nspname, v_fn.proname;
    end if;
  end loop;

  v_wrap_pat := '(?<![A-Za-z0-9_."])(?<!SELECT )(' || v_names || ')\(((?:''[^'']*''::text|true|false|auth\.uid\(\)|, )*)\)';
  v_unwrap_pat := '\( SELECT (' || v_names || ')\(((?:[^()]|\([^()]*\)|\(([^()]|\([^()]*\))*\))*)\) AS [a-z_]+\)';

  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') ~ v_wrap_pat or coalesce(with_check,'') ~ v_wrap_pat)
    order by tablename, policyname
  loop
    v_new_qual := case when r.qual is null then null
                       else regexp_replace(r.qual, v_wrap_pat, '(SELECT \1(\2))', 'g') end;
    v_new_check := case when r.with_check is null then null
                        else regexp_replace(r.with_check, v_wrap_pat, '(SELECT \1(\2))', 'g') end;

    if v_new_qual is not null and v_new_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_qual, v_new_check);
    elsif v_new_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_qual);
    else
      execute format('alter policy %I on %I.%I with check (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_check);
    end if;

    select qual, with_check into v_after
    from pg_catalog.pg_policies
    where schemaname = r.schemaname and tablename = r.tablename and policyname = r.policyname;

    -- Proof 1: unwrapping both sides gives the identical expression text.
    if pg_temp._rls_unwrap(coalesce(v_after.qual,''), v_unwrap_pat)
         is distinct from pg_temp._rls_unwrap(coalesce(r.qual,''), v_unwrap_pat)
       or pg_temp._rls_unwrap(coalesce(v_after.with_check,''), v_unwrap_pat)
         is distinct from pg_temp._rls_unwrap(coalesce(r.with_check,''), v_unwrap_pat) then
      raise exception 'rls_initplan_guard: % on %.% changed beyond initPlan wrapping. before=% / % after=% / %',
        r.policyname, r.schemaname, r.tablename, r.qual, r.with_check, v_after.qual, v_after.with_check;
    end if;

    -- Proof 2: every string literal is unchanged and in the same order.
    if array(select m[1] from regexp_matches(coalesce(v_after.qual,'')||' '||coalesce(v_after.with_check,''), '(''[^'']*'')', 'g') m)
       is distinct from
       array(select m[1] from regexp_matches(coalesce(r.qual,'')||' '||coalesce(r.with_check,''), '(''[^'']*'')', 'g') m) then
      raise exception 'rls_initplan_guard: literals changed in % on %.%', r.policyname, r.schemaname, r.tablename;
    end if;

    -- Proof 3: the expression actually reached initPlan form (no bare allowed call remains).
    if regexp_replace(coalesce(v_after.qual,''), v_unwrap_pat, '__initplan__', 'g') ~ v_wrap_pat
       or regexp_replace(coalesce(v_after.with_check,''), v_unwrap_pat, '__initplan__', 'g') ~ v_wrap_pat then
      raise exception 'rls_initplan_guard: % on %.% still has a per-row helper call: % / %',
        r.policyname, r.schemaname, r.tablename, v_after.qual, v_after.with_check;
    end if;

    v_changed := v_changed + 1;
  end loop;

  raise notice 'rls_initplan: % policies normalized to initPlan form', v_changed;
end;
$rls$;

-- pg_temp._rls_unwrap is session-scoped and disappears when this session ends.
