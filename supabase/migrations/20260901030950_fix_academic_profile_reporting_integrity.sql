-- Academic Profile reporting integrity.
--
-- A recovery/developing observation that has not yet met the governed gates for
-- "improving" or "resolved" must never fall through to a fresh support label.
-- Keep the conclusion withheld as insufficient evidence unless the latest
-- qualified observation itself is a focus signal.

do $migration$
declare
  v_def text;
  v_old text := E'  else\n    v_status := ''new_focus''; v_trend := ''stable'';\n  end if;';
  v_new text := E'  else\n    if v_latest = ''focus'' then\n      v_status := ''new_focus''; v_trend := ''stable'';\n    else\n      v_status := ''insufficient_evidence'';\n      v_trend := case when v_latest in (''strength'', ''developing'') then ''improving'' else ''stable'' end;\n    end if;\n  end if;';
begin
  select pg_get_functiondef('public.student_learning_classify_progress(jsonb)'::regprocedure)
  into v_def;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected student_learning_classify_progress fallback not found';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;

-- Re-evaluate only states that could have been mislabeled by the old fallback.
do $refresh$
declare
  r record;
begin
  for r in
    select distinct s.student_id, s.skill_key
    from public.student_learning_focus_states s
    join lateral (
      select o.observation_type
      from public.student_learning_observations o
      where o.student_id = s.student_id
        and o.skill_key = s.skill_key
        and public.student_learning_observation_is_qualified(
          o.source_type,
          o.contributes_to_focus_state,
          o.evidence
        )
      order by o.observed_at desc, o.created_at desc, o.id desc
      limit 1
    ) latest on true
    where s.current_status = 'new_focus'
      and latest.observation_type in ('strength', 'developing')
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
  end loop;
end
$refresh$;

comment on function public.student_learning_classify_progress(jsonb) is
  'Deterministic progress classifier. Recovery evidence that is not yet improvement/resolution eligible is withheld as insufficient evidence instead of being relabeled as a new focus.';
