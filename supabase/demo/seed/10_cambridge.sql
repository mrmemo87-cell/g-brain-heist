-- Demo seed 10: Cambridge. Both Grade 7 classes sat Cambridge Listening Test 1 (30 questions,
-- auto-marked) on the Wednesday of week 6, and Ms. Mitchell released the scores on the Friday.
-- Each answer sheet is built from the real answer key (components/cambridgeListeningReview.ts),
-- so the question-by-question review matches the score. Omar (low_data) did not sit it.
-- Submissions go through the normal student path (all Cambridge triggers run); only timestamps
-- are moved afterwards. DEMO PROJECT ONLY.

do $$
declare
  v_school uuid := private.demo_state_uuid('school_id');
  v_key constant jsonb := '{"1":"C","2":"C","3":"B","4":"A","5":"C","6":"C","7":"C","8":"C","9":"A","10":"B","11":"A","12":"B","13":"C","14":"B","15":"C","16":"C","17":"B","18":"C","19":"A","20":"C","21":"6:30","22":"museum","23":"garden","24":"painting","25":"drink","26":"A","27":"B","28":"C","29":"A","30":"B"}';
  v_wrong constant jsonb := '{"21":"7:30","22":"gallery","23":"castle","24":"poster","25":"snack"}';
  v_submitted timestamptz;
  v_released timestamptz := private.demo_week_start(6) + interval '4 days 6 hours 40 minutes';
  p record; q integer; v_resp jsonb; v_correct integer; v_ans text; v_id uuid;
begin
  if v_school is null then raise exception 'demo seed 10: school missing'; end if;

  for p in select key, user_id, class_code from private.demo_people
           where role = 'student' and coalesce(story, '') <> 'low_data' order by key loop
    v_resp := '{}'::jsonb; v_correct := 0;
    for q in 1..30 loop
      if private.demo_rand(p.key || 'cam-l1-' || q) < least(0.97, private.demo_accuracy(p.key) + 0.04) then
        v_ans := v_key->>q::text; v_correct := v_correct + 1;
      elsif q between 21 and 25 then
        v_ans := v_wrong->>q::text;
      else
        v_ans := (array['A','B','C'])[1 + (position(v_key->>q::text in 'ABC') + (private.demo_rand(p.key || 'cam-w-' || q) * 2)::int) % 3];
        if v_ans = v_key->>q::text then v_ans := case v_ans when 'A' then 'B' when 'B' then 'C' else 'A' end; end if;
      end if;
      v_resp := v_resp || jsonb_build_object(q::text, v_ans);
    end loop;

    v_submitted := private.demo_week_start(6) + interval '2 days 1 hour 10 minutes'
      + make_interval(mins => floor(private.demo_rand(p.key || 'cam-t') * 35)::int);

    perform private.demo_as(p.key);
    insert into public.quiz_scores (school_id, student_name, student_class, quiz_name, test_id, quiz_version, score,
      total_questions, percentage, answers, submitted_at, time_taken_seconds)
    values (v_school, '', p.class_code, 'Cambridge Listening Test 1', 'cambridge-listening-1', 'listening-1-stage9-v3', v_correct,
      30, 0, jsonb_build_object('responses', v_resp, 'quiz_version', 'listening-1-stage9-v3'), v_submitted,
      1500 + floor(private.demo_rand(p.key || 'cam-d') * 420)::int)
    returning id into v_id;

    perform private.demo_as('teacher');
    update public.quiz_scores set scores_released = true where id = v_id;

    set local session_replication_role = replica;
    update public.quiz_scores set released_at = v_released where id = v_id;
    set local session_replication_role = origin;
  end loop;
end $$;
