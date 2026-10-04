-- Real reward RPCs, with all balances, caps, attempts and runs rolled back.
begin;
do $test$
declare
 u uuid; teacher_actor uuid; q record; q2 record; q3 record; q4 record;
 r jsonb; mission uuid; run uuid; before_xp integer; before_coins integer;
 coin_cap integer; checksum_before text;
begin
 select id into u from public.users usr where role='student'
   and not coalesce(is_admin,false) and not coalesce(is_banned,false)
   and coalesce(brains_master_until,now()-interval '1 day')<=now()
   and not exists(select 1 from public.quest_runs where user_id=usr.id and status='active')
 order by id limit 1;
 if u is null then raise exception 'fixture_requires_student'; end if;
 select * into q from public.questions x where x.subject='Economics' and x.is_active and x.difficulty='easy'
   and not exists(select 1 from public.question_attempts a where a.student_id=u and a.question_id=x.id and a.is_correct and a.attempted_at>now()-interval '24 hours') order by x.id limit 1;
 select * into q2 from public.questions x where x.subject='Economics' and x.is_active and x.difficulty='medium'
   and not exists(select 1 from public.question_attempts a where a.student_id=u and a.question_id=x.id and a.is_correct and a.attempted_at>now()-interval '24 hours') order by x.id limit 1;
 select * into q3 from public.questions x where x.subject='Economics' and x.is_active and x.id not in(q.id,q2.id)
   and not exists(select 1 from public.question_attempts a where a.student_id=u and a.question_id=x.id and a.is_correct and a.attempted_at>now()-interval '24 hours') order by x.id limit 1;
 select * into q4 from public.questions x where x.subject='Economics' and x.is_active and x.id not in(q.id,q2.id,q3.id)
   and not exists(select 1 from public.question_attempts a where a.student_id=u and a.question_id=x.id and a.is_correct and a.attempted_at>now()-interval '24 hours') order by x.id limit 1;
 select md5(string_agg(id::text||current_content_hash||points::text,',' order by id)) into checksum_before from public.questions where subject='Economics';
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.caps(user_id) values(u) on conflict do nothing;
 update public.caps set xp_daily_earned=0,coins_daily_earned=0,xp_weekly_earned=0,coins_weekly_earned=0,
   daily_reset_at=(now() at time zone 'UTC')::date,weekly_reset_at=date_trunc('week',now() at time zone 'UTC')::date where user_id=u;
 select xp,coins into before_xp,before_coins from public.users where id=u;
 r:=public.rpc_submit_mcq_answer(q.id,q.correct_answer);
 if (r#>>'{deltas,xp}')::integer<>15 or (r#>>'{deltas,coins}')::integer<>22
 then raise exception 'easy_game_reward_wrong: %',r; end if;
 if not exists(select 1 from public.users where id=u and xp=before_xp+15 and coins=before_coins+22)
 then raise exception 'payout_not_persisted'; end if;
 r:=public.record_question_attempt(q.id,q.correct_answer,1000,null);
 if not (r->>'duplicate_reward')::boolean or (r->>'points_earned')::integer<>0 or (r->>'coins_earned')::integer<>0
 then raise exception 'cross_mode_duplicate_paid'; end if;

 select id into mission from public.quest_missions order by id limit 1;
 if mission is null then raise exception 'fixture_requires_mission'; end if;
 insert into public.quest_runs(user_id,mission_id,route) values(u,mission,jsonb_build_array(jsonb_build_object(
   'index',0,'type','question','state','active','question_id',q.id,'correct_option',q.correct_answer,'points',1,'difficulty',q.difficulty))) returning id into run;
 r:=public.rpc_quest_answer_node(run,0,q.correct_answer);
 if not (r->>'duplicate_reward')::boolean or (r#>>'{deltas,xp}')::integer<>0 or (r#>>'{deltas,coins}')::integer<>0
 then raise exception 'quest_cross_mode_duplicate_paid'; end if;
 insert into public.quest_runs(user_id,mission_id,route) values(u,mission,jsonb_build_array(jsonb_build_object(
   'index',0,'type','question','state','active','question_id',q2.id,'correct_option',q2.correct_answer,'points',1,'difficulty',q2.difficulty))) returning id into run;
 r:=public.rpc_quest_answer_node(run,0,q2.correct_answer);
 if (r#>>'{deltas,xp}')::integer<>20 or (r#>>'{deltas,coins}')::integer<>30
 then raise exception 'medium_quest_reward_wrong'; end if;
 r:=public.record_question_attempt(q3.id,q3.correct_answer,1000,null);
 if (r->>'points_earned')::integer<>private.question_game_reward_xp(q3.id,1)
   or (r->>'coins_earned')::integer<>floor(private.question_game_reward_xp(q3.id,1)*1.5)::integer
 then raise exception 'question_attempt_reward_wrong'; end if;

 -- Verify a partial cap, including actual XP in the saved attempt.
 select 2000+greatest(level-1,0)*200 into coin_cap from public.users where id=u;
 update public.caps set xp_daily_earned=995,coins_daily_earned=coin_cap-7 where user_id=u;
 r:=public.rpc_submit_mcq_answer(q4.id,q4.correct_answer);
 if (r#>>'{deltas,xp}')::integer<>5 or (r#>>'{deltas,coins}')::integer<>7 or not (r->>'reward_capped')::boolean
 then raise exception 'partial_cap_not_honored'; end if;
 if not exists(select 1 from public.question_attempts where student_id=u and question_id=q4.id and points_earned=5)
 then raise exception 'attempt_records_uncapped_xp'; end if;
 select * into q4 from public.questions x where x.subject='Economics' and x.is_active
   and not exists(select 1 from public.question_attempts a where a.student_id=u and a.question_id=x.id and a.is_correct and a.attempted_at>now()-interval '24 hours') order by x.id limit 1;
 update public.caps set xp_daily_earned=1000000,coins_daily_earned=1000000 where user_id=u;
 select xp,coins into before_xp,before_coins from public.users where id=u;
 r:=public.record_question_attempt(q4.id,q4.correct_answer,1000,null);
 if (r->>'points_earned')::integer<>0 or (r->>'coins_earned')::integer<>0 or not (r->>'reward_capped')::boolean
 then raise exception 'question_attempt_bypasses_cap'; end if;
 if not exists(select 1 from public.users where id=u and xp=before_xp and coins=before_coins)
 then raise exception 'capped_balance_changed'; end if;
 if checksum_before is distinct from (select md5(string_agg(id::text||current_content_hash||points::text,',' order by id)) from public.questions where subject='Economics')
 then raise exception 'academic_content_or_marks_changed'; end if;
 select id into teacher_actor from public.users where role='teacher' limit 1;
 perform set_config('request.jwt.claim.sub',teacher_actor::text,true);
 begin
   perform public.rpc_submit_mcq_answer(q.id,q.correct_answer);
   raise exception 'teacher_gameplay_not_rejected';
 exception when others then
   if sqlerrm<>'student_gameplay_only' then raise; end if;
 end;
end;
$test$;
rollback;
select 'PASS: standard payouts, shared wallet, cross-mode duplicate protection, partial/full caps, actual attempt XP, unchanged marks and teacher rejection' as verification;
