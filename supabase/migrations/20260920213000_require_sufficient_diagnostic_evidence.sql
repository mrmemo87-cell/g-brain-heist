-- Keep item-level diagnostic observations, but do not turn a single automated
-- question miss into an Academic Profile weakness or intervention target.
--
-- The longitudinal confidence engine already requires multiple observations and
-- evidence items before a decision is eligible. A compatibility override in
-- student_learning_refresh_focus_state() was promoting low-data focus evidence
-- straight back to `new_focus`. Preserve that override for non-diagnostic legacy
-- evidence, but let diagnostic question evidence obey the governed confidence
-- policy and remain `insufficient_evidence` until the decision gate is met.

do $migration$
declare
  v_def text;
  v_old text := E'    case\n      when v_decision->>''status'' = ''insufficient_evidence''\n       and v_latest.observation_type = ''focus''\n       and coalesce(v_latest.contributes_to_focus_state, false)\n       and coalesce(v_conf.focus_observations, 0) >= 1\n      then ''new_focus''\n      else v_decision->>''status''\n    end,';
  v_new text := E'    case\n      when v_decision->>''status'' = ''insufficient_evidence''\n       and v_latest.observation_type = ''focus''\n       and coalesce(v_latest.contributes_to_focus_state, false)\n       and coalesce(v_conf.focus_observations, 0) >= 1\n       and p_skill_key not like ''diagnostic:%''\n      then ''new_focus''\n      else v_decision->>''status''\n    end,';
begin
  select pg_get_functiondef(
    'public.student_learning_refresh_focus_state(uuid,text)'::regprocedure
  ) into v_def;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected low-data focus compatibility override not found';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;

-- Recompute current diagnostic projections. Source observations remain intact;
-- only the derived focus/confidence state changes. Existing one-item diagnostic
-- labels therefore become `insufficient_evidence` rather than visible weakness
-- or intervention signals until the confidence policy is satisfied.
do $refresh$
declare
  r record;
begin
  for r in
    select distinct o.student_id, o.skill_key
    from public.student_learning_observations o
    where o.skill_key like 'diagnostic:%'
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
  end loop;
end
$refresh$;

comment on function public.student_learning_refresh_focus_state(uuid, text) is
  'Rebuilds longitudinal focus state from governed confidence evidence. Diagnostic question evidence remains insufficient until confidence gates are met; a single automated miss cannot become a weakness or intervention target.';
