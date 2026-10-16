-- Include goal skill labels in the same narrow consistency check; no data rewrites.
do $patch$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('private.check_ielts_plan_evidence(jsonb,jsonb)'::regprocedure);
 anchor:=$old$string_agg(g->>'action',E'\n')$old$;
 if position(anchor in definition)=0 then raise exception 'ielts_goal_scope_anchor_missing'; end if;
 execute replace(definition,anchor,$new$string_agg(coalesce(g->>'skill','')||': '||coalesce(g->>'action',''),E'\n')$new$);
end $patch$;
