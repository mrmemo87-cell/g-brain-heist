-- A first strong, qualified focus observation should be visible as a current
-- area needing support even while longitudinal confidence is still low.
-- This changes the presentation/state label only: confidence and
-- decision_eligible remain governed by the existing confidence policy, and
-- persistent/improving/resolved still require repeated evidence.

do $migration$
declare
  v_def text;
  v_old text := '    v_latest.observation_type, v_decision->>''status'', v_decision->>''trend'',';
  v_new text := E'    v_latest.observation_type,\n    case\n      when v_decision->>''status'' = ''insufficient_evidence''\n       and v_latest.observation_type = ''focus''\n       and coalesce(v_latest.contributes_to_focus_state, false)\n       and v_latest.evidence_quality = ''strong''\n       and coalesce(v_conf.focus_observations, 0) >= 1\n      then ''new_focus''\n      else v_decision->>''status''\n    end,\n    v_decision->>''trend'',';
begin
  select pg_get_functiondef('public.student_learning_refresh_focus_state(uuid,text)'::regprocedure) into v_def;
  if position(v_old in v_def) = 0 then
    raise exception 'Expected student_learning_refresh_focus_state status expression not found';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;

do $refresh$
declare
  r record;
begin
  for r in
    select distinct s.student_id, s.skill_key
    from public.student_learning_focus_states s
    join lateral (
      select o.observation_type, o.evidence_quality, o.contributes_to_focus_state
      from public.student_learning_observations o
      where o.student_id = s.student_id and o.skill_key = s.skill_key
      order by o.observed_at desc, o.created_at desc, o.id desc
      limit 1
    ) latest on true
    where s.current_status = 'insufficient_evidence'
      and latest.observation_type = 'focus'
      and latest.evidence_quality = 'strong'
      and coalesce(latest.contributes_to_focus_state,false)
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
  end loop;
end
$refresh$;
