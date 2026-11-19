-- Demo seed 08: IELTS practice. The demo student (s01, Lucas, the public student login)
-- completes one practice task in each IELTS skill, set by Ms. Mitchell as an IELTS practice
-- assignment, through the same RPCs and attempt rows the app writes:
--   Listening  BH-LB01 "Joining a weekend swimming course" (auto-scored on the server)
--   Reading    R-008   "A café changes its coffee routine"  (auto-scored on the server)
--   Writing    W-010   "Homework in primary schools" (Task 2)
--   Speaking   S-014   "Describe a place in your town or city" (Part 2)
-- All practice content is original Brains Heist material (originality reviewed). The essay and
-- the spoken answer are fictional and were written for the demo. Practice only: no screener,
-- mock, readiness estimate or overall band is created (Diagnostic Bible 2.5.1, 10.5, 10.9).
-- DEMO PROJECT ONLY.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

-- Practice tasks the demo uses (production copies; reset empties these tables every night).
do $$ begin
  set local session_replication_role = replica;
  insert into public.ielts_writing_tasks select * from jsonb_populate_record(null::public.ielts_writing_tasks, $j${"id":23,"slug":"practice-bank-01-wb01","title":"Homework in primary schools","prompt":"Some people believe that children in primary school should not be given homework. To what extent do you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.","is_active":true,"task_type":"task2","created_at":"2026-10-19T00:40:14.515245+00:00","created_by":null,"bands_target":null,"display_code":"W-010","required_tier":"free","sample_answer":null,"originality_label":"Originality reviewed"}$j$::jsonb) on conflict do nothing;
  insert into public.ielts_speaking_tasks select * from jsonb_populate_record(null::public.ielts_speaking_tasks, $j${"id":28,"part":2,"slug":"practice-bank-01-sb05","prompt":"Describe a place in your town or city where you like to spend time.\n\nYou should say:\n- where it is\n- what it looks like\n- what you do there\n- and explain why you like spending time there.","is_active":true,"created_at":"2026-10-19T00:40:14.515245+00:00","created_by":null,"follow_ups":{"prep_time":60,"questions":["Do young people and older people like the same kinds of places?","How could public places in your town be improved?"],"speaking_time":120},"display_code":"S-014","required_tier":"free","originality_label":"Originality reviewed"}$j$::jsonb) on conflict do nothing;
  -- Their production material codes and originality records: the app only assigns material
  -- that passed the originality gate (copied as recorded in production, provenance unchanged).
  insert into private.ielts_material_codes select * from jsonb_populate_record(null::private.ielts_material_codes, $j${"skill": "writing", "created_at": "2026-10-19T00:40:14.515245+00:00", "material_id": "23", "display_code": "W-010", "material_type": "ielts_writing_task"}$j$::jsonb) on conflict do nothing;
  insert into private.ielts_material_codes select * from jsonb_populate_record(null::private.ielts_material_codes, $j${"skill": "speaking", "created_at": "2026-10-19T00:40:14.515245+00:00", "material_id": "28", "display_code": "S-014", "material_type": "ielts_speaking_task"}$j$::jsonb) on conflict do nothing;
  insert into private.ielts_material_fingerprints select * from jsonb_populate_record(null::private.ielts_material_fingerprints, $j${"skill": "writing", "tokens": ["250", "agree", "answer", "any", "believe", "children", "disagree", "examples", "experience", "extent", "give", "given", "homework", "include", "knowledge", "least", "own", "people", "primary", "reasons", "relevant", "school", "should", "some", "what", "words", "write"], "complete": true, "snapshot": {"questions": [], "audio_preview_url": null, "passage_or_prompt": "Some people believe that children in primary school should not be given homework. To what extent do you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.", "recording_reference": null}, "audio_key": null, "script_key": null, "legacy_hash": null, "material_id": "23", "recorded_at": "2026-10-19T00:40:14.949418+00:00", "content_hash": "043ef2f6afead17e00afac7a840f7225e99c969862f8bdd15956fb6add98c1fe", "primary_hash": "3a064f9739e7094f70a6a451e5cfaf2d05ac6ac4045a657bcf3e32432a554b93", "material_type": "ielts_writing_task", "policy_version": "ielts-originality-v1", "questions_hash": null, "fingerprint_hash": "ececff871d88f77baad291eaf3eaa2dfbf6a7adbe0573e0694b5bf9ed96d26ee"}$j$::jsonb) on conflict do nothing;
  insert into private.ielts_material_fingerprints select * from jsonb_populate_record(null::private.ielts_material_fingerprints, $j${"skill": "speaking", "tokens": ["120", "city", "could", "describe", "explain", "how", "improved", "kinds", "like", "looks", "older", "people", "place", "places", "prep", "public", "questions", "same", "say", "should", "speaking", "spend", "spending", "there", "time", "town", "what", "where", "why", "young"], "complete": true, "snapshot": {"questions": {"prep_time": 60, "questions": ["Do young people and older people like the same kinds of places?", "How could public places in your town be improved?"], "speaking_time": 120}, "audio_preview_url": null, "passage_or_prompt": "Describe a place in your town or city where you like to spend time.\n\nYou should say:\n- where it is\n- what it looks like\n- what you do there\n- and explain why you like spending time there.", "recording_reference": null}, "audio_key": null, "script_key": null, "legacy_hash": null, "material_id": "28", "recorded_at": "2026-10-19T00:40:15.051038+00:00", "content_hash": "ba083e2d8f1a7402ec43c8f07bb9e7d0ff5702ec5b3c3d2a5415c0019df7e1b5", "primary_hash": "dfa09dd05c3f86daea7ffe4dccaaf5b3016d549435ce85c1d4c3211682f9d6a4", "material_type": "ielts_speaking_task", "policy_version": "ielts-originality-v1", "questions_hash": "5722a1b96097d5189ea9f2e82fe5e48d2f23ac8968242c8da711ecb6a4060297", "fingerprint_hash": "1ffe3788070d9617b1b1524e1a975fb9a4308b90d81f890a3bc5dd4a74e730c7"}$j$::jsonb) on conflict do nothing;
  insert into private.ielts_material_originality_reviews select * from jsonb_populate_record(null::private.ielts_material_originality_reviews, $j${"id": "8f5ec76f-e20c-45c3-b27f-500915e646ae", "decision": "fresh", "parent_id": null, "rationale": "Batch sample review 63cd38dc-6463-49ab-82ee-cd5c5135f3ec (not sampled; automated checks passed): Owner instruction 2026-10-19 06:57 (Asia/Bishkek): \"approve and release the materials that you told me about\". Recorded under the owner's account on that instruction. Sample check performed by Claude (AI assistant), not by the owner in person: Reading rb01 and rb04 read in full (every key, TRUE/FALSE/NOT GIVEN judgement and quoted evidence checked against the passage), Writing wb03 and Speaking sb04, sb08 checked for task fit and skill tags; automated contract passed for all 21; no originality flags.", "match_hash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945", "material_id": "28", "parent_hash": null, "parent_type": null, "reviewed_at": "2026-10-19T00:58:18.756826+00:00", "reviewed_by": "d0000000-0000-4000-8000-000000000002", "content_hash": "ba083e2d8f1a7402ec43c8f07bb9e7d0ff5702ec5b3c3d2a5415c0019df7e1b5", "material_type": "ielts_speaking_task", "policy_version": "ielts-originality-v1", "content_checked": true, "recording_checked": false}$j$::jsonb) on conflict do nothing;
  insert into private.ielts_material_originality_reviews select * from jsonb_populate_record(null::private.ielts_material_originality_reviews, $j${"id": "842708cf-55ae-446a-8f57-18925cbe5bd3", "decision": "fresh", "parent_id": null, "rationale": "Batch sample review 63cd38dc-6463-49ab-82ee-cd5c5135f3ec (not sampled; automated checks passed): Owner instruction 2026-10-19 06:57 (Asia/Bishkek): \"approve and release the materials that you told me about\". Recorded under the owner's account on that instruction. Sample check performed by Claude (AI assistant), not by the owner in person: Reading rb01 and rb04 read in full (every key, TRUE/FALSE/NOT GIVEN judgement and quoted evidence checked against the passage), Writing wb03 and Speaking sb04, sb08 checked for task fit and skill tags; automated contract passed for all 21; no originality flags.", "match_hash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945", "material_id": "23", "parent_hash": null, "parent_type": null, "reviewed_at": "2026-10-19T00:58:18.756826+00:00", "reviewed_by": "d0000000-0000-4000-8000-000000000002", "content_hash": "043ef2f6afead17e00afac7a840f7225e99c969862f8bdd15956fb6add98c1fe", "material_type": "ielts_writing_task", "policy_version": "ielts-originality-v1", "content_checked": true, "recording_checked": false}$j$::jsonb) on conflict do nothing;
  set local session_replication_role = origin;
end $$;

do $$
declare
  v_school uuid := private.demo_state_uuid('school_id');
  v_class uuid := private.demo_state_uuid('class_id');
  v_student uuid := (select user_id from private.demo_people where key = 's01');
  v_today timestamptz := private.demo_today();
  v_set_at timestamptz := private.demo_today() - interval '6 days' + interval '9 hours 10 minutes';
  v_assignment uuid; r jsonb; it record; v_attempt uuid; v_at timestamptz;
  v_essay constant text := $essay$Nowadays many parents and teachers are discussing if young children in primary school should get homework or not. Some people think that homework is not necessary at this age, but I partly disagree with this idea, because I believe a small amount of homework can be useful for children.

On the one hand, there are good reasons to stop giving homework to young pupils. Children already spend six or seven hours in school every day, so when they come home they are often tired and they need time to play, do sports and relax with their family. Also, some parents work late and they can not help their children, so the homework become stressful for everyone. For example, my younger brother is in grade three and sometimes he is crying because he does not understand his maths exercises and nobody at home can explain it.

On the other hand, I think homework has some important advantages. Firstly, it helps students to remember what they learned in the lesson. If a child practice reading or times tables for fifteen minutes at home, he will understand the next lesson much better. Secondly, homework teaches children to be responsible and to organise their time, which are skills they will need in secondary school and later in their life. When I was in primary school, our teacher gave us one short reading task every evening, and this habit helped me to love books.

In conclusion, although too much homework can make young children tired and stressed, I believe that short and simple homework, like reading or practising basic maths, is beneficial. Teachers should give homework that children can do without help from adults and it should not take more than twenty or thirty minutes.$essay$;
begin
  if v_school is null or v_student is null then raise exception 'demo seed 08: school or student missing'; end if;

  -- The student's IELTS profile (ensureIeltsProfile in the app).
  insert into public.ielts_users(id, username, full_name, email)
  select p.user_id, private.demo_username(p.key, p.full_name, p.role), p.full_name, p.email
  from private.demo_people p where p.key = 's01'
  on conflict (id) do nothing;

  -- Ms. Mitchell sets a four-skill practice assignment for Lucas.
  perform private.demo_as('teacher');
  r := public.rpc_ielts_practice_create_assignment(v_school, v_class,
    'IELTS practice: one task in each skill',
    'Listening and Reading are marked automatically. Write the essay in one sitting, then record your Part 2 answer.',
    v_today + interval '1 day' + interval '17 hours',
    $j$[
      {"skill":"listening","content_type":"ielts_listening_set","content_id":"31","title":"Joining a weekend swimming course","required":true,"order_index":0},
      {"skill":"reading","content_type":"ielts_reading_set","content_id":"30","title":"A café changes its coffee routine","required":true,"order_index":1},
      {"skill":"writing","content_type":"ielts_writing_task","content_id":"23","title":"Homework in primary schools","required":true,"order_index":2},
      {"skill":"speaking","content_type":"ielts_speaking_task","content_id":"28","title":"A place where you like to spend time","required":true,"order_index":3}
    ]$j$::jsonb);
  select id into v_assignment from public.ielts_practice_assignments
   where school_id = v_school and assigned_by = (select user_id from private.demo_people where key = 'teacher')
   order by created_at desc limit 1;
  if v_assignment is null then raise exception 'demo seed 08: assignment not created: %', r; end if;
  r := public.rpc_ielts_practice_assign_to_students(v_assignment, array[v_student]);

  insert into private.demo_state(key, value) values ('ielts_assignment_id', to_jsonb(v_assignment))
  on conflict (key) do update set value = excluded.value;

  -- Lucas works through it over the next few days.
  perform private.demo_as('s01');
  r := public.rpc_ielts_practice_mark_started(v_assignment);
  for it in select id, skill from public.ielts_practice_assignment_items where assignment_id = v_assignment order by order_index loop
    r := public.rpc_ielts_practice_mark_item_started(v_assignment, it.id);
    if it.skill = 'listening' then
      -- 5/6: the classic Part 1 trap on Q4 (he wrote the members' price, not the full price).
      insert into public.ielts_listening_attempts(user_id, set_id, answers, time_spent_seconds, completed_at)
      values (v_student, 31, $j${"68":"Hartley","69":"Sunday","70":"10","71":"70","72":"padlock","73":"cafe"}$j$::jsonb, 312, now())
      returning id into v_attempt;
    elsif it.skill = 'reading' then
      -- 5/6: Not Given chosen where the passage contradicts the statement (False).
      insert into public.ielts_reading_attempts(user_id, set_id, answers, time_spent_seconds, completed_at)
      values (v_student, 30, jsonb_build_object(
        '41','To reduce waste without increasing delays','42','The number of cups sold each half hour','43','Not Given',
        '44','nine','45','The new routine might need adjustment as demand changed','46','Using local records to improve a routine'), 1046, now())
      returning id into v_attempt;
    elsif it.skill = 'writing' then
      insert into public.ielts_writing_attempts(user_id, task_id, answer_text, word_count, submitted_at, review_status)
      values (v_student, 23, v_essay, array_length(regexp_split_to_array(trim(v_essay), '\s+'), 1), now(), 'pending')
      returning id into v_attempt;
    else
      insert into public.ielts_speaking_attempts(user_id, task_id, audio_url, duration_seconds, submitted_at)
      values (v_student, 28, 'speaking/' || v_student || '/28_demo_practice.mp3', 84, now())
      returning id into v_attempt;
    end if;
    r := public.rpc_ielts_practice_mark_item_submitted(v_assignment, it.id, it.skill, v_attempt);
    r := public.rpc_ielts_practice_mark_item_completed(v_assignment, it.id, it.skill, v_attempt);
    insert into private.demo_state(key, value) values ('ielts_attempt_' || it.skill, to_jsonb(v_attempt))
    on conflict (key) do update set value = excluded.value;
  end loop;

  -- Story time: set six days ago, Listening and Reading the next afternoon, the essay the
  -- evening after, the recording the day after that.
  set local session_replication_role = replica;
  update public.ielts_practice_assignments set created_at = v_set_at, updated_at = v_set_at where id = v_assignment;
  update public.ielts_practice_assignment_items set created_at = v_set_at where assignment_id = v_assignment;
  update public.ielts_practice_assignment_students set created_at = v_set_at, updated_at = v_today - interval '3 days' + interval '18 hours 40 minutes',
    completed_at = case when completed_at is not null then v_today - interval '3 days' + interval '18 hours 40 minutes' end
    where assignment_id = v_assignment;
  for it in select s.id, i.skill from public.ielts_practice_assignment_item_students s
            join public.ielts_practice_assignment_items i on i.id = s.assignment_item_id where s.assignment_id = v_assignment loop
    v_at := v_today + case it.skill when 'listening' then interval '-5 days 16 hours 20 minutes' when 'reading' then interval '-5 days 16 hours 45 minutes'
                                    when 'writing' then interval '-4 days 19 hours 5 minutes' else interval '-3 days 18 hours 35 minutes' end;
    update public.ielts_practice_assignment_item_students set started_at = v_at - interval '20 minutes', submitted_at = v_at,
      completed_at = case when completed_at is not null then v_at end, meaningful_completed_at = case when meaningful_completed_at is not null then v_at end,
      updated_at = v_at where id = it.id;
  end loop;
  update public.ielts_listening_attempts set started_at = v_today + interval '-5 days 16 hours 15 minutes', completed_at = v_today + interval '-5 days 16 hours 20 minutes' where user_id = v_student;
  update public.ielts_reading_attempts set started_at = v_today + interval '-5 days 16 hours 27 minutes', completed_at = v_today + interval '-5 days 16 hours 45 minutes' where user_id = v_student;
  update public.ielts_writing_attempts set submitted_at = v_today + interval '-4 days 19 hours 5 minutes' where user_id = v_student;
  update public.ielts_speaking_attempts set submitted_at = v_today + interval '-3 days 18 hours 35 minutes' where user_id = v_student;
  set local session_replication_role = origin;
end $$;

-- Feedback on the essay and the recording. These are GENUINE outputs of the production feedback
-- services, run once (19 Nov 2026) on the demo project on this exact essay and on the recording
-- (a computer voice, gpt-4o-mini-tts "ash", reading the fictional answer). They are replayed
-- unchanged every night; only the timestamps follow the story. Model, prompt version and the
-- provider's response id are the real ones. The demo project has no AI key: nothing is generated live.
--   Writing:  openai/gpt-4.1-2025-04-14, bh-ielts-practice-feedback-v4, generated 2026-11-19 16:17:55 UTC
--   Speaking: openai/gpt-audio-1.5 (+ gpt-4o-transcribe transcript, pronunciation pass
--             bh-ielts-speaking-pronunciation-words-v2), bh-ielts-speaking-practice-feedback-v4,
--             generated 2026-11-19 16:20:30 UTC
-- Ms. Mitchell then checks both (Bible 10.5, 10.9; Part bands are teacher-only, 10.7): she
-- confirms the AI feedback and records her own bands, lowering the essay from the AI's 6.5 to 6.0.
do $$
declare
  v_student uuid := (select user_id from private.demo_people where key = 's01');
  v_teacher uuid := (select user_id from private.demo_people where key = 'teacher');
  v_today timestamptz := private.demo_today();
  v_writing uuid := private.demo_state_uuid('ielts_attempt_writing');
  v_speaking uuid := private.demo_state_uuid('ielts_attempt_speaking');
  v_wfb uuid; v_sfb uuid; r jsonb;
  v_w_at constant timestamptz := private.demo_today() + interval '-4 days 19 hours 6 minutes';
  v_s_at constant timestamptz := private.demo_today() + interval '-3 days 18 hours 37 minutes';
  v_w_ok constant timestamptz := private.demo_today() + interval '-2 days 8 hours 40 minutes';
  v_s_ok constant timestamptz := private.demo_today() + interval '-2 days 8 hours 55 minutes';
begin
  if v_writing is null or v_speaking is null then raise exception 'demo seed 08: practice attempts missing'; end if;

  insert into private.ielts_practice_ai_feedback(attempt_id, student_id, status, model, prompt_version, fields, provider_id, created_at, updated_at)
  values (v_writing, v_student, 'ready', 'gpt-4.1-2025-04-14', 'bh-ielts-practice-feedback-v4',
    $fx${"essay": "Nowadays many parents and teachers are discussing if young children in primary school should get homework or not. Some people think that homework is not necessary at this age, but I partly disagree with this idea, because I believe a small amount of homework can be useful for children.\n\nOn the one hand, there are good reasons to stop giving homework to young pupils. Children already spend six or seven hours in school every day, so when they come home they are often tired and they need time to play, do sports and relax with their family. Also, some parents work late and they can not help their children, so the homework become stressful for everyone. For example, my younger brother is in grade three and sometimes he is crying because he does not understand his maths exercises and nobody at home can explain it.\n\nOn the other hand, I think homework has some important advantages. Firstly, it helps students to remember what they learned in the lesson. If a child practice reading or times tables for fifteen minutes at home, he will understand the next lesson much better. Secondly, homework teaches children to be responsible and to organise their time, which are skills they will need in secondary school and later in their life. When I was in primary school, our teacher gave us one short reading task every evening, and this habit helped me to love books.\n\nIn conclusion, although too much homework can make young children tired and stressed, I believe that short and simple homework, like reading or practising basic maths, is beneficial. Teachers should give homework that children can do without help from adults and it should not take more than twenty or thirty minutes.", "criteria": {"task_response": {"action": "Make your opinion very direct in the introduction and conclusion. For example, use 'I agree that...' or 'I believe that...' to start your final paragraph.", "comment": "You discuss both sides well and give reasons for your opinion. You clearly answer the question and give examples. However, your position could be stated more strongly and directly.", "evidence": [{"quote": "I partly disagree with this idea, because I believe a small amount of homework can be useful", "end_char": 272, "start_char": 180}, {"quote": "In conclusion, although too much homework can make young children tired and stressed, I believe that short and simple homework, like reading or practising basic maths, is beneficial.", "end_char": 1551, "start_char": 1369}], "indication": {"low": 6, "high": 7}}, "lexical_resource": {"action": "Try to use synonyms or phrases like 'assignments', 'tasks', or 'schoolwork' instead of repeating 'homework'. Check collocations (words that go together) in model essays.", "comment": "You use a range of words for the topic, such as 'responsible', 'relax', and 'advantage'. Most of your vocabulary is natural and clear. Some words are repeated often, like 'homework', and there are some small mistakes in collocation.", "evidence": [{"quote": "the homework become stressful", "end_char": 642, "start_char": 613}, {"quote": "homework teaches children to be responsible", "end_char": 1134, "start_char": 1091}], "indication": {"low": 6, "high": 7}}, "coherence_cohesion": {"action": "Use referencing phrases like 'this', 'such tasks', or 'these assignments' to avoid repeating the word 'homework'. Also, split very long sentences for easier reading.", "comment": "Your ideas are organised into clear paragraphs. Linking words like 'On the one hand', 'For example' and 'In conclusion' are used well, making your points easy to follow. Some sentences are a little long, and you could use more referencing words to avoid repetition.", "evidence": [{"quote": "homework can be useful for children.", "end_char": 286, "start_char": 250}, {"quote": "the homework become stressful for everyone.", "end_char": 656, "start_char": 613}], "indication": {"low": 6, "high": 7}}, "grammar_range_accuracy": {"action": "Review subject-verb agreement and use articles correctly (a, an, the). Check your sentences for small grammar errors before finishing.", "comment": "You use many complex sentences with correct word order, and most tenses are accurate. There are a few mistakes, such as 'the homework become stressful' and missing articles or singular/plural forms. Some minor punctuation problems are present.", "evidence": [{"quote": "the homework become stressful for everyone.", "end_char": 656, "start_char": 613}, {"quote": "If a child practice reading", "end_char": 987, "start_char": 960}], "indication": {"low": 6, "high": 7}}}, "estimate": {"low": 6, "band": 6.5, "high": 7}, "next_step": "Make your position even stronger in the introduction and conclusion by stating clearly if you agree or disagree. Also, replace repeated words like 'homework' with other phrases. After writing, check if all verbs match their subjects and if you need 'a', 'an', or 'the' anywhere in your sentences.", "highlights": [{"kind": "fix", "note": "State your opinion more directly and completely in the introduction. Use 'I believe that a small amount of homework is useful for children in primary school' or 'I agree that...'.", "quote": "I partly disagree with this idea, because I believe a small amount of homework can be useful for children.", "end_char": 286, "criterion": "task_response", "correction": "I believe that a small amount of homework is useful for children in primary school.", "start_char": 180}, {"kind": "fix", "note": "'Homework' is uncountable and the verb must agree.", "quote": "the homework become stressful for everyone.", "end_char": 656, "criterion": "grammar_range_accuracy", "correction": "homework becomes stressful for everyone.", "start_char": 613}, {"kind": "strength", "note": "Good logical linking at the start of the paragraph.", "quote": "On the other hand, I think homework has some important advantages.", "end_char": 887, "criterion": "coherence_cohesion", "correction": null, "start_char": 821}, {"kind": "fix", "note": "'Practice' needs an 's' to agree with 'child'.", "quote": "If a child practice reading or times tables for fifteen minutes at home, he will understand the next lesson much better.", "end_char": 1080, "criterion": "grammar_range_accuracy", "correction": "If a child practises reading or times tables for fifteen minutes at home, he will understand the next lesson much better.", "start_char": 960}, {"kind": "fix", "note": "Consider using 'doing homework' or 'completing assignments' to show the action.", "quote": "homework teaches children to be responsible", "end_char": 1134, "criterion": "lexical_resource", "correction": "completing homework teaches children to be responsible", "start_char": 1091}, {"kind": "strength", "note": "You clearly summarise your view and link back to the question in the conclusion.", "quote": "In conclusion, although too much homework can make young children tired and stressed, I believe that short and simple homework, like reading or practising basic maths, is beneficial.", "end_char": 1551, "criterion": "task_response", "correction": null, "start_char": 1369}], "task_number": 2, "prompt_version": "bh-ielts-practice-feedback-v4"}$fx$::jsonb,
    'openai/gpt-4.1-2025-04-14/chatcmpl-Elz7ducByPjWbqXuMRUgS2R5dGIwo', v_w_at, v_w_at)
  returning id into v_wfb;

  insert into private.ielts_practice_speaking_feedback(attempt_id, student_id, status, model, prompt_version, fields, provider_id, created_at, updated_at)
  values (v_speaking, v_student, 'ready', 'gpt-audio-1.5', 'bh-ielts-speaking-practice-feedback-v4',
    $fx${"part": 2, "criteria": {"pronunciation": {"action": "Practice pronouncing word endings clearly, especially the -s and -ed sounds.", "comment": "Your speech was clear and easy to follow, and your rhythm matched natural English well. The main issue was a few endings and vowel sounds that weren't fully pronounced, making them slightly less clear.", "evidence": [{"quote": "Sometimes, when the weather is good"}, {"quote": "all the leaves become orange and yellow"}], "indication": {"low": 6, "high": 7}}, "lexical_resource": {"action": "Try adding more variety, for example 'serene atmosphere' instead of just 'peaceful'.", "comment": "You used suitable words like 'peaceful', 'noisy', 'busy', and 'calm'. Your vocabulary was varied and you described the park well. There is room to add more descriptive phrases.", "evidence": [{"quote": "It's quite large"}, {"quote": "it's very peaceful"}], "indication": {"low": 7, "high": 8}}, "fluency_coherence": {"action": "Practice longer answers without filler words, for example say, 'It is important for students like me' without 'um'.", "comment": "You spoke smoothly and gave a clear description of the park. Your ideas were well linked and you answered all parts of the question. There were only small pauses, like when you said 'um', but overall it was coherent.", "evidence": [{"quote": "I'd like to talk about a place where I really like to spend my free time"}, {"quote": "which is, um, important for students like me"}], "indication": {"low": 7, "high": 8}}, "grammar_range_accuracy": {"action": "Practice using articles and correct forms, for example say 'It's a ten-minute walk from my home.'", "comment": "Your grammar was mostly accurate with correct complex verbs such as 'when I am stressed' and 'after half an hour I feel'. One small issue was a missing article in 'ten minutes walking'; it could be 'a ten-minute walk'.", "evidence": [{"quote": "When I am stressed because of exams"}, {"quote": "It's maybe ten minutes walking from my home"}], "indication": {"low": 6, "high": 7}}}, "next_step": "Next time, practise describing another favourite place in your town. Record yourself and check if you include all parts of the question: where it is, what it looks like, what you do, and why you enjoy it. Listen for any filler words and try to speak smoothly without them.", "highlights": [{"kind": "fix", "note": "Try to remove filler words like 'um' for smoother speech.", "quote": "which is, um, important for students like me", "criterion": "fluency_coherence"}, {"kind": "fix", "note": "Say 'a ten-minute walk from my home' to use the correct form.", "quote": "ten minutes walking from my home", "criterion": "grammar_range_accuracy"}, {"kind": "strength", "note": "This opening clearly introduces your topic.", "quote": "I'd like to talk about a place where I really like to spend my free time", "criterion": "fluency_coherence"}, {"kind": "strength", "note": "This is a natural and clear description.", "quote": "it's very peaceful", "criterion": "lexical_resource"}], "transcript": "OK. So I'd like to talk about a place where I really like to spend my free time, and it's a big park near my house. It's called Riverside Park, and it's maybe ten minutes walking from my home, next to the river, as you can guess from the name. So, what does it look like? It's quite large, there is a long path along the water, a lot of old trees, and in the middle there is a football pitch and a small café. In autumn, it looks really beautiful because all the leaves become orange and yellow. What do I do there? Usually I go there on Saturday mornings with my friends and we play football for one or two hours. Sometimes, when the weather is good, I just sit on a bench and I read a book or I listen to music. My parents also like to walk there in the evening, so sometimes we go together and we buy hot chocolate in the café. And why do I like spending time there? I think the main reason is that it's very peaceful, even if the city around it is noisy and busy. When I am stressed because of exams or a lot of homework, I go to the park and after half an hour I feel much more calm. Also, it's a place where I can meet my friends without spending a lot of money, which is, um, important for students like me. So yes, I would say it's my favorite place in the town.", "prompt_version": "bh-ielts-speaking-practice-feedback-v4", "pronunciation_words": [], "pronunciation_assessed": true, "pronunciation_prompt_version": "bh-ielts-speaking-pronunciation-words-v2"}$fx$::jsonb,
    'openai/gpt-audio-1.5/chatcmpl-ElzAFx7a8G0QCGXP43QU78ysstzir', v_s_at, v_s_at)
  returning id into v_sfb;

  perform private.demo_as('teacher');
  r := public.rpc_ielts_practice_feedback_confirm(v_wfb,
    'I agree with most of this. Your two sides are clear and well linked. I have given 6.0, not 6.5: fix the verb agreement (homework becomes, a child practises) and state your opinion in one clear sentence.');
  r := public.rpc_ielts_submit_review('writing', v_writing::text,
    '{"task_achievement":6,"coherence_cohesion":6.5,"lexical_resource":6,"grammar":6}'::jsonb, 6.0,
    'Balanced answer with relevant personal examples; clear paragraphs and good linking words.',
    'Subject-verb agreement (homework becomes, a child practises). Your position starts as "partly disagree" but the conclusion supports homework: make it one clear opinion.',
    'Rewrite the introduction with one clear opinion sentence, then check every verb against its subject before you finish.',
    'Good progress, Lucas. Band 6.0 for this essay. Use the AI notes for the grammar, and see me on Thursday about your introduction.',
    null, true);

  r := public.rpc_ielts_practice_speaking_feedback_confirm(v_sfb,
    'Good, well-organised answer that covers every point on the card. I agree with the notes: drop the "um" and say "a ten-minute walk".');
  r := public.rpc_ielts_submit_review('speaking', v_speaking::text,
    '{"fluency":7,"lexical_resource":7,"grammar":6,"pronunciation":6}'::jsonb, 6.5,
    'Covers every point on the card in a clear order; natural linking and topic vocabulary.',
    'Small grammar slips ("ten minutes walking"); a few word endings are not clear.',
    'Record a second Part 2 answer on a different place and check it for the same two points.',
    'Part 2 band 6.5 from me for this practice answer. A strong, well-organised talk.',
    null, true);

  -- Story time: Ms. Mitchell checked both two days ago.
  set local session_replication_role = replica;
  update private.ielts_practice_ai_feedback set confirmed_at = v_w_ok, updated_at = v_w_ok where id = v_wfb;
  update private.ielts_practice_speaking_feedback set confirmed_at = v_s_ok, updated_at = v_s_ok where id = v_sfb;
  update public.ielts_productive_skill_reviews set reviewed_at = case attempt_type when 'writing' then v_w_ok else v_s_ok end,
    created_at = case attempt_type when 'writing' then v_w_ok else v_s_ok end - interval '10 minutes',
    updated_at = case attempt_type when 'writing' then v_w_ok else v_s_ok end
   where attempt_id in (v_writing::text, v_speaking::text);
  update public.ielts_productive_skill_review_events e set created_at = r2.reviewed_at
    from public.ielts_productive_skill_reviews r2 where r2.id = e.review_id and r2.attempt_id in (v_writing::text, v_speaking::text);
  update public.ielts_writing_attempts set reviewed_at = v_w_ok where id = v_writing;
  update public.ielts_speaking_attempts set reviewed_at = v_s_ok where id = v_speaking;
  set local session_replication_role = origin;
end $$;
