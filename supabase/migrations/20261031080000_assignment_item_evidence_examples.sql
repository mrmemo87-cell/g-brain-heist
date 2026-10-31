-- Evidence examples for assignment-sourced needs.
--
-- rpc_teacher_student_intervention_workspace_v2 attached `evidence_examples` only from Writing-hub
-- rich feedback (grammar_fixes / punctuation_fixes). Needs that come from verified assignments —
-- the registry lane, i.e. almost every Use of English / Reading need — therefore showed "No
-- sentence-level example is attached", while the student's actual wrong answers were sitting in
-- student_learning_registry_item_evidence + student_assignment_answers.
--
-- When a recommendation has no writing examples and its focus key is a registry key, the RPC now
-- builds up to 6 examples from the student's incorrect answers on that atomic sub-skill in the
-- focus state's academic year: independent assessments first, newest first. Shape matches the
-- writing examples so the card and the review modal render them unchanged:
--   original       = question text — answered “<student answer>”
--   better_version = correct answer
--   issue          = evidence-focus statement · assignment · date (· "targeted practice" if not independent)
--   weakness_tag   = evidence-focus statement (becomes a selectable diagnostic target in the review modal)
-- Read-only; no evidence is created or changed.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rpc_teacher_student_intervention_workspace_v2';

  v_new := replace(v_def,
$anchor$    else
      v_examples := '[]'::jsonb;
    end if;
$anchor$,
$patched$    else
      v_examples := '[]'::jsonb;
    end if;
    -- Assignment-sourced needs (registry lane): show the student's own wrong answers.
    if jsonb_array_length(coalesce(v_examples, '[]'::jsonb)) = 0 and v_focus.skill_key like 'registry:%' then
      select coalesce(jsonb_agg(jsonb_build_object(
          'source', 'assignment_item',
          'original', left(coalesce(ans.question_text, ''), 240) || ' — answered “' || coalesce(nullif(trim(ans.student_answer), ''), '(no answer)') || '”',
          'better_version', left(coalesce(ans.correct_answer, ''), 160),
          'issue', concat_ws(' · ', nullif(trim(f.name), ''), a.title, to_char(e.answered_at, 'DD Mon YYYY'),
                              case when not e.is_independent_assessment then 'targeted practice' end),
          'weakness_tag', nullif(trim(f.name), '')
        ) order by e.is_independent_assessment desc, e.answered_at desc, e.id desc), '[]'::jsonb)
      into v_examples
      from (
        select ie.*
        from public.student_learning_registry_item_evidence ie
        join public.academic_skill_registry_versions rv
          on rv.id = ie.registry_version_id and rv.code = split_part(v_focus.skill_key, ':', 2)
        join public.academic_skill_registry_nodes sub
          on sub.id = ie.atomic_subskill_node_id and sub.code = split_part(v_focus.skill_key, ':', 3)
        where ie.student_id = p_student_id
          and not ie.is_correct
          and (v_focus.academic_year_id is null or ie.academic_year_id = v_focus.academic_year_id)
        order by ie.is_independent_assessment desc, ie.answered_at desc, ie.id desc
        limit 6
      ) e
      join public.student_assignment_answers ans on ans.id = e.answer_id
      join public.assignments a on a.id = e.assignment_id
      left join public.academic_skill_evidence_focuses f on f.id = e.evidence_focus_id;
    end if;
$patched$);

  if v_new = v_def then
    raise exception 'workspace_v2: evidence-examples anchor not found; function unchanged';
  end if;
  execute v_new;
end $$;

revoke all on function public.rpc_teacher_student_intervention_workspace_v2(uuid,text)
from public,anon;
grant execute on function public.rpc_teacher_student_intervention_workspace_v2(uuid,text)
to authenticated,service_role;

-- Evidence-focus statements are sentences; keep them as written instead of title-casing them.
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rpc_teacher_student_intervention_workspace_v2';
  v_new := replace(v_def,
    $a$select distinct initcap(replace(e.value->>'weakness_tag', '_', ' ')) label$a$,
    $b$select distinct case when e.value->>'weakness_tag' ~ '\s' then e.value->>'weakness_tag'
                           else initcap(replace(e.value->>'weakness_tag', '_', ' ')) end label$b$);
  if v_new = v_def then raise exception 'workspace_v2: weakness_tag label anchor not found; function unchanged'; end if;
  execute v_new;
end $$;
