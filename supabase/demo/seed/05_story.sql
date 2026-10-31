-- Demo seed 05: run the term.
--   Weeks 1-3  weekly checks -> five students show a repeated focus in perfect forms.
--   Friday of week 3: the teacher reviews the evidence, creates, approves and starts a
--                     support plan for each (real RPCs), and sets targeted practice.
--   Weeks 4-8  weekly checks continue (the follow-up evidence).
--   This week: four plans are evaluated against their frozen baselines; the teacher
--              confirms three recoveries; one "no change" waits for her decision; one plan
--              is still collecting evidence with its review date next week.
-- Real RPCs stamp "now"; each event is then moved to its story time. Baseline hashes only
-- cover observations before the cutoff, so moving the cutoff earlier (still after the last
-- baseline observation and before any follow-up) keeps every hash valid.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

call private.demo_run_week(1);
call private.demo_run_week(2);
call private.demo_run_week(3);

do $$
declare
  v_skill constant text := 'registry:bh-english-core-v1:eng.use-of-english.verb-tense-time.perfect';
  v_cut timestamptz := private.demo_week_start(3) + interval '4 days' + interval '6 hours'; -- Friday 15:00
  v_teacher_profile uuid := (select t.id from public.teachers t join private.demo_people p on p.user_id = t.user_id and p.key = 'teacher');
  p record; r jsonb; v_iid uuid; v_targets jsonb; v_practice public.assignments; q record; v_n integer; v_i integer;
begin
  for p in select key, user_id, full_name from private.demo_people where key in ('s01','s02','s03','s04','s05') order by key loop
    perform private.demo_as('teacher');

    -- Diagnostic targets exactly as the teacher workspace recommends them.
    select coalesce(rec->'diagnostic_targets', '[]'::jsonb) into v_targets
    from jsonb_array_elements(to_jsonb(public.rpc_teacher_student_intervention_workspace_v2(p.user_id, 'English'))->'recommendations') rec
    where rec->>'skill_key' = v_skill limit 1;
    if v_targets is null or jsonb_array_length(v_targets) = 0 then
      select jsonb_agg(distinct o.evidence->>'evidence_focus_name') into v_targets
      from public.student_learning_observations o
      where o.student_id = p.user_id and o.skill_key = v_skill and o.observation_type = 'focus';
    end if;

    perform public.rpc_teacher_review_learning_focus_evidence(p.user_id, v_skill, 'confirmed', v_targets,
      'Three weekly checks in a row show the same gap: choosing the present perfect over the past simple.');

    r := public.rpc_teacher_create_learning_intervention_v3(
      p.user_id, v_skill, 'targeted_question_practice',
      'Choose and form the present perfect correctly in at least 2 of 3 questions on two later weekly checks.',
      'Ten-minute small-group mini-lesson on have/has + past participle and time markers (ever, already, since, for), then guided practice.',
      'Targeted practice set on perfect forms, then the next weekly checks as independent follow-up evidence.',
      current_date + 14, 'improving', 3, 2);
    v_iid := (r->>'interventionId')::uuid;
    perform public.rpc_teacher_review_learning_intervention_plan(v_iid, 'approved',
      'Evidence is consistent across three independent checks; the plan and follow-up target are proportionate.');
    perform public.rpc_teacher_update_learning_intervention(v_iid, 'start', 'Mini-lesson planned for Monday period 3.');

    insert into private.demo_state(key, value) values ('intervention_' || p.key, to_jsonb(v_iid))
    on conflict (key) do update set value = excluded.value;

    -- Targeted practice for this student (separate from the independent weekly checks).
    select * into v_practice from public.rpc_create_intervention_practice_assignment(
      v_teacher_profile, 'english', 'English', 'Perfect forms practice',
      (select question_ids from private.demo_question_sets where skill = 'P' and set_no = 9),
      v_cut + interval '3 days' + interval '1 hour', v_cut + interval '6 days',
      'Targeted practice: present perfect', 'Read each sentence and choose the best verb form.', 'easy',
      p.user_id, v_skill, v_targets, 'homework',
      'Europe/London', 'Short practice set chosen for you after our mini-lesson.', 'published', false, false);
    -- Creating practice records it without a plan; the workspace then links it to the plan.
    perform public.rpc_teacher_register_intervention_practice(v_practice.id, p.user_id, v_skill, v_targets, v_iid);

    perform private.demo_as(p.key);
    v_n := case when p.key in ('s01','s02','s03') then 3 when p.key = 's04' then 2 else 1 end;
    v_i := 0;
    for q in select aq.question_id, aq.question_snapshot from public.assignment_questions aq
             where aq.assignment_id = v_practice.id order by aq.question_id loop
      v_i := v_i + 1;
      perform public.rpc_submit_assignment_answer_v2(v_practice.id, q.question_id, q.question_snapshot->>'question_text', null,
        case when v_i <= v_n then q.question_snapshot->>'correct_answer' else private.demo_wrong_option(q.question_snapshot) end,
        null, 30000);
    end loop;
    perform public.rpc_submit_assignment_result_v2(v_practice.id, v_n, 3 - v_n, round(100.0 * v_n / 3)::integer, v_n * 10, 240);

    -- Move this plan and its practice to the story timeline.
    set local session_replication_role = replica;
    update public.student_learning_professional_reviews set reviewed_at = v_cut - interval '20 minutes', evidence_cutoff_at = v_cut - interval '20 minutes'
      where student_id = p.user_id and skill_key = v_skill;
    update public.student_learning_interventions set baseline_cutoff_at = v_cut, created_at = v_cut,
      approved_at = v_cut + interval '5 minutes', started_at = v_cut + interval '3 days', updated_at = v_cut + interval '3 days'
      where id = v_iid;
    update public.student_learning_intervention_approvals set decided_at = v_cut + interval '5 minutes' where intervention_id = v_iid;
    update public.student_learning_intervention_events set created_at = case event_type
        when 'created' then v_cut when 'approved' then v_cut + interval '5 minutes' else v_cut + interval '3 days' end
      where intervention_id = v_iid;
    update public.student_learning_intervention_checkpoints set created_at = v_cut where intervention_id = v_iid;
    update public.student_learning_intervention_evidence_snapshots set captured_at = v_cut where intervention_id = v_iid;
    update public.student_learning_intervention_practice_assignments set created_at = v_cut + interval '3 days', linked_at = v_cut + interval '3 days'
      where intervention_id = v_iid;
    update public.assignments set created_at = v_cut + interval '3 days', updated_at = v_cut + interval '3 days' + interval '1 hour',
      assigned_at = v_cut + interval '3 days' + interval '1 hour', published_at = v_cut + interval '3 days' + interval '1 hour',
      due_at = v_cut + interval '6 days' where id = v_practice.id;
    update public.assignment_students set added_at = v_cut + interval '3 days' + interval '1 hour' where assignment_id = v_practice.id;
    update public.student_assignment_answers set answered_at = v_cut + interval '4 days' + interval '2 hours', reviewed_at = v_cut + interval '4 days' + interval '2 hours'
      where assignment_id = v_practice.id;
    update public.student_assignment_results set completed_at = v_cut + interval '4 days' + interval '2 hours' where assignment_id = v_practice.id;
    update public.student_assignments set assigned_at = v_cut + interval '3 days' + interval '1 hour', due_at = v_cut + interval '6 days',
      completed_at = v_cut + interval '4 days' + interval '2 hours' where assignment_id = v_practice.id;
    set local session_replication_role = origin;
    perform private.ingest_verified_assignment_registry_evidence(v_practice.id, p.user_id);
  end loop;
end $$;

call private.demo_run_week(4);
call private.demo_run_week(5);
call private.demo_run_week(6);
call private.demo_run_week(7);
call private.demo_run_week(8);

-- This week: evaluate four plans against their baselines; confirm the three recoveries.
do $$
declare
  -- Evaluated Thursday 16:00 after week 8's check; outcomes confirmed Friday 10:00.
  v_as_of timestamptz := least(private.demo_week_start(8) + interval '3 days 7 hours', now() - interval '2 hours');
  v_eval_at timestamptz;
  v_confirm_at timestamptz := least(private.demo_week_start(8) + interval '4 days 1 hour', now() - interval '30 minutes');
  k text; v_iid uuid; r jsonb; v_checkpoint uuid; v_outcome text;
begin
  perform private.demo_as('teacher');
  foreach k in array array['s01','s02','s03','s05'] loop
    v_iid := private.demo_state_uuid('intervention_' || k);
    r := public.rpc_teacher_evaluate_learning_intervention(v_iid, v_as_of);
    v_checkpoint := (r->>'checkpointId')::uuid;
    v_outcome := r->>'systemOutcome';
    insert into private.demo_state(key, value) values ('evaluation_' || k, r)
    on conflict (key) do update set value = excluded.value;

    v_eval_at := v_as_of + interval '10 minutes';
    if k <> 's05' and v_outcome in ('improved','resolved') then
      perform public.rpc_teacher_confirm_learning_intervention_outcome(v_checkpoint, 'confirmed', v_outcome,
        'Five independent weekly checks since the mini-lesson show secure use of the present perfect.');
    end if;

    set local session_replication_role = replica;
    update public.student_learning_interventions set target_date = (v_as_of at time zone 'Europe/London')::date,
      updated_at = v_eval_at where id = v_iid;
    update public.student_learning_intervention_checkpoints set due_at = (v_as_of at time zone 'Europe/London')::date::timestamptz,
      evaluated_at = v_eval_at where intervention_id = v_iid;
    update public.student_learning_intervention_outcome_reviews set reviewed_at = v_confirm_at where intervention_id = v_iid;
    update public.student_learning_interventions set completed_at = v_confirm_at where id = v_iid and completed_at is not null;
    update public.student_learning_intervention_events set created_at = case
        when event_type = 'checkpoint_evaluated' then v_eval_at else v_confirm_at end
      where intervention_id = v_iid and created_at > v_as_of;
    update public.student_learning_intervention_evidence_snapshots set captured_at = v_eval_at
      where intervention_id = v_iid and captured_at > v_as_of;
    set local session_replication_role = origin;
  end loop;

  -- Aruuke's plan is still collecting evidence: review due next week.
  set local session_replication_role = replica;
  update public.student_learning_interventions set target_date = (private.demo_today() at time zone 'Europe/London')::date + 6
    where id = private.demo_state_uuid('intervention_s04');
  update public.student_learning_intervention_checkpoints set due_at = ((private.demo_today() at time zone 'Europe/London')::date + 6)::timestamptz
    where intervention_id = private.demo_state_uuid('intervention_s04') and status = 'scheduled';
  set local session_replication_role = origin;
end $$;
