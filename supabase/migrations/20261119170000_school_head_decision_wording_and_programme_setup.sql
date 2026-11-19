-- School Head Decision Center: accurate programme-setup signal and natural wording.
--
-- Why
-- 1. "Enabled programmes need setup or adoption" only looked at the legacy
--    school_curriculum_scope_mappings table for Cambridge. Schools that set up a
--    subject through the current School Subjects flow get an active
--    school_subject_offerings row with a curriculum scope instead, so they were told
--    Cambridge had no setup when it did. IELTS and Writing Hub ignored the Head's own
--    setup action (assigning programme seats to students), so a school that had just
--    assigned every student a seat was still told the programme had no setup.
-- 2. Labels were built with initcap(module_key), which renders "Ielts".
-- 3. Descriptions read "46 student(s) ... have" and "1 teacher(s) are"; they now read
--    naturally for both one and many.
--
-- How (minimal and reversible)
-- The existing rule builder is kept unchanged under a new name and the public name
-- becomes a thin wrapper that post-processes its output. Every caller resolves the
-- function by name at run time, so all of them (executive snapshot, authoritative
-- operational decisions, refresh worker) get the same corrected decisions.
-- Rollback: drop the wrapper and rename the _core function back.

do $$
begin
  if to_regprocedure('private.school_head_build_operational_decisions_core_20261119(uuid,integer)') is null then
    execute 'alter function private.school_head_build_operational_decisions(uuid, integer) '
      || 'rename to school_head_build_operational_decisions_core_20261119';
  end if;
end;
$$;

revoke all on function private.school_head_build_operational_decisions_core_20261119(uuid, integer)
  from public, anon, authenticated, service_role;

-- "46 student(s) ... have" -> "46 students ... have"; "1 student(s) ... have" -> "1 student ... has".
-- Only touches text that uses the "(s)" / "(es)" placeholder, so other copy is left alone.
create or replace function private.school_head_decision_count_text(p_text text, p_count integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_text;
begin
  if v_text is null or v_text !~ '\((e?s)\)' then
    return v_text;
  end if;

  if coalesce(p_count, 0) = 1 then
    v_text := replace(replace(v_text, '(es)', ''), '(s)', '');
    -- Verb agreement for the first verb after the counted noun.
    v_text := regexp_replace(v_text, ' have ', ' has ');
    v_text := regexp_replace(v_text, ' are ', ' is ');
    v_text := regexp_replace(v_text, ' belong ', ' belongs ');
  else
    v_text := replace(replace(v_text, '(es)', 'es'), '(s)', 's');
  end if;
  return v_text;
end;
$$;

revoke all on function private.school_head_decision_count_text(text, integer)
  from public, anon, authenticated, service_role;

create or replace function private.school_head_programme_label(p_module_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_module_key, ''))
    when 'cambridge' then 'Cambridge'
    when 'ielts' then 'IELTS'
    when 'writing' then 'Writing Hub'
    when 'admissions' then 'Admissions'
    when 'core' then 'Core platform'
    else initcap(replace(coalesce(p_module_key, ''), '_', ' '))
  end
$$;

revoke all on function private.school_head_programme_label(text)
  from public, anon, authenticated, service_role;

create or replace function private.school_head_build_operational_decisions(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_core jsonb;
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_count integer;
  v_oldest timestamptz;
  v_affected jsonb;
begin
  v_core := coalesce(
    private.school_head_build_operational_decisions_core_20261119(p_school_id, p_days),
    '[]'::jsonb
  );

  for v_item in select value from jsonb_array_elements(v_core) loop
    if v_item->>'id' = 'enabled_programs_unconfigured' then
      -- Recompute with the setup signals the current product actually records.
      with enabled as materialized (
        select sme.module_key, coalesce(sme.starts_at, sme.created_at) issue_at
        from public.school_module_entitlements sme
        where sme.school_id = p_school_id and sme.enabled
          and (sme.starts_at is null or sme.starts_at <= now())
          and (sme.ends_at is null or sme.ends_at > now())
          and coalesce(sme.starts_at, sme.created_at) < now() - interval '7 days'
      ), seated as materialized (
        select distinct spa.module_key
        from public.school_programme_seat_assignments spa
        join public.school_members sm on sm.school_id = spa.school_id
          and sm.user_id = spa.student_user_id and sm.status = 'active'
        where spa.school_id = p_school_id and spa.released_at is null
      ), issues as materialized (
        select e.module_key, e.issue_at from enabled e
        where (e.module_key = 'cambridge'
                and not exists (select 1 from public.school_curriculum_scope_mappings m
                                where m.school_id = p_school_id and m.status = 'active')
                and not exists (select 1 from public.school_subject_offerings o
                                where o.school_id = p_school_id and o.status = 'active'
                                  and o.curriculum_scope_id is not null))
           or (e.module_key = 'ielts'
                and not exists (select 1 from seated s where s.module_key = 'ielts')
                and not exists (select 1 from public.ielts_users iu
                                join public.school_members sm on sm.user_id = iu.id
                                where sm.school_id = p_school_id and sm.status = 'active'))
           or (e.module_key = 'writing'
                and not exists (select 1 from seated s where s.module_key = 'writing')
                and not exists (select 1 from public.bh_writing_student_profiles wp
                                join public.school_members sm on sm.user_id = wp.student_id
                                where sm.school_id = p_school_id and sm.status = 'active'))
           or (e.module_key = 'admissions'
                and not exists (select 1 from public.adm_candidates ac where ac.school_id = p_school_id))
      )
      select count(*), min(issue_at),
        coalesce(jsonb_agg(jsonb_build_object(
          'label', private.school_head_programme_label(module_key),
          'detail', 'Enabled, but no setup or adoption is recorded yet'
        ) order by module_key), '[]'::jsonb)
      into v_count, v_oldest, v_affected
      from issues;

      if v_count > 0 then
        v_result := v_result || jsonb_build_array(
          private.school_head_make_decision(
            'enabled_programs_unconfigured', 'notice', v_count,
            case when v_count = 1 then 'An enabled programme needs setup' else 'Enabled programmes need setup' end,
            case when v_count = 1
              then '1 enabled programme has no setup or participation recorded after seven days.'
              else format('%s enabled programmes have no setup or participation recorded after seven days.', v_count) end,
            'Review programme setup', 'programs', 'Programme adoption', 'Programme leadership',
            'Each enabled programme should have its curriculum or seats set up and learners using it.',
            v_oldest, v_affected
          )
        );
      end if;
      continue;
    end if;

    v_count := coalesce((v_item->>'count')::integer, 0);
    if v_item->>'id' = 'missing_guardian_links' then
      v_item := v_item
        || jsonb_build_object('title', case when v_count = 1
              then 'A younger student is missing guardian access'
              else 'Younger students are missing guardian access' end);
    end if;
    v_result := v_result || jsonb_build_array(
      v_item || jsonb_build_object(
        'description', private.school_head_decision_count_text(v_item->>'description', v_count)
      )
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function private.school_head_build_operational_decisions(uuid, integer)
  from public, anon, authenticated, service_role;
