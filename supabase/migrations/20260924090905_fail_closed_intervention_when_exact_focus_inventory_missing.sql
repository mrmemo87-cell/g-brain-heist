-- Fail closed: a precise Evidence Focus with no exact verified practice cannot silently fall back to related questions.
do $patch$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_teacher_student_intervention_intelligence'
  order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  v_def := replace(v_def,
    $$        when f.skill_key like 'diagnostic:%' and f.available_exact_questions >= 1 then 'targeted_question_practice'
        when f.available_questions >= 5 then 'targeted_question_practice'
        else 'teacher_support'$$,
    $$        when f.skill_key like 'diagnostic:%' and f.available_exact_questions >= 1 then 'targeted_question_practice'
        when f.skill_key like 'diagnostic:%'
             and f.evidence_focus_code is not null
             and f.available_exact_questions = 0 then 'teacher_support'
        when f.available_questions >= 5 then 'targeted_question_practice'
        else 'teacher_support'$$
  );
  v_def := replace(v_def, $$'question_authority', 'brains_heist_verified_only'$$,
                          $$'question_authority', 'verified_global_and_school'$$);
  execute v_def;
end;
$patch$;
