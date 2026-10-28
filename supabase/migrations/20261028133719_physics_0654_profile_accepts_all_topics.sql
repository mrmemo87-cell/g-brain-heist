-- 0654 Physics assessment profiles: accept syllabus references for every
-- topic, P1-P6. The original validator allowed only P1, P2, P5 and P6
-- because the first bank covered those topics; P3 (Waves) and P4
-- (Electricity and magnetism) are part of the same 2025-2027 syllabus.
do $migration$
declare
  v_def text;
  v_marker constant text := $m$!~ '^P[1256]([.][0-9]+){1,4}$'$m$;
  v_count integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='validate_external_question_assessment_profile';
  if v_def is null then raise exception 'validate_external_question_assessment_profile_not_found'; end if;
  v_count := (length(v_def)-length(replace(v_def,v_marker,'')))/length(v_marker);
  if v_count<>1 then raise exception 'physics_reference_marker found % times', v_count; end if;
  execute replace(v_def, v_marker, $r$!~ '^P[1-6]([.][0-9]+){1,4}$'$r$);
end
$migration$;
