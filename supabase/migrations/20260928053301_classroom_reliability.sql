-- Classroom answers are authoritative. Serialize only within one student's assignment.
-- No shared question counters, profile rewards, or practice writes on this path.
set lock_timeout = '3s';


CREATE OR REPLACE FUNCTION public.rpc_submit_assignment_answer_v2(p_assignment_id uuid, p_question_id uuid, p_question_text text, p_correct_answer text, p_student_answer text, p_is_correct boolean, p_time_taken_ms integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_existing public.student_assignment_answers%rowtype; v_student uuid:=auth.uid();v_snapshot jsonb;v_status text;v_due_at timestamptz;v_close boolean;v_question_type text;v_grading_mode text;v_is_correct boolean;v_grading_status text:='graded';v_normalized_student text;v_normalized_answer text;v_accepted_answers jsonb;v_answer text;
begin
 if v_student is null then raise exception 'NOT_AUTHENTICATED'; end if;
 -- The same row lock is used by finalization, preventing answers racing completion.
 perform 1 from public.student_assignments
 where assignment_id=p_assignment_id and student_id=v_student for update;
 if not found then raise exception 'QUESTION_NOT_IN_ASSIGNED_ASSIGNMENT'; end if;
 select aq.question_snapshot,sa.status,a.due_at,a.close_submissions_after_due into v_snapshot,v_status,v_due_at,v_close from public.assignment_questions aq join public.assignments a on a.id=aq.assignment_id join public.student_assignments sa on sa.assignment_id=a.id and sa.student_id=v_student where aq.assignment_id=p_assignment_id and aq.question_id=p_question_id;
 if not found then raise exception 'QUESTION_NOT_IN_ASSIGNED_ASSIGNMENT'; end if;
 select * into v_existing from public.student_assignment_answers
 where assignment_id=p_assignment_id and student_id=v_student and question_id=p_question_id;
 if found then
   if v_existing.student_answer is distinct from coalesce(p_student_answer,'') then
     raise exception 'ANSWER_ALREADY_SAVED';
   end if;
   return jsonb_build_object('success',true,'is_correct',v_existing.is_correct,
     'grading_status',v_existing.grading_status,'pending_review',v_existing.grading_status in ('under_review','reviewing'),
     'points_earned',case when v_existing.is_correct is true then coalesce((v_snapshot->>'points')::integer,0) else 0 end);
 end if;
 if v_status not in ('pending','in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
 if v_close and v_due_at is not null and now()>v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
 if nullif(trim(v_snapshot->>'correct_answer'),'') is null then raise exception 'ASSIGNMENT_ANSWER_KEY_MISSING'; end if;
 v_question_type:=coalesce(nullif(trim(v_snapshot->>'question_type'),''),'multiple_choice');
 v_grading_mode:=coalesce(nullif(trim(v_snapshot->>'grading_mode'),''),case when v_question_type='short_answer' then 'accepted_answers' else 'exact' end);
 v_normalized_student:=private.normalize_assignment_answer(coalesce(p_student_answer,''));
 if v_normalized_student='' then v_is_correct:=false;
 elsif v_question_type='short_answer' then
   v_accepted_answers:=case when jsonb_typeof(v_snapshot->'accepted_answers')='array' and jsonb_array_length(v_snapshot->'accepted_answers')>0 then v_snapshot->'accepted_answers' else jsonb_build_array(v_snapshot->>'correct_answer') end;
   v_is_correct:=false;
   for v_answer in select value from jsonb_array_elements_text(v_accepted_answers) x(value) union select v_snapshot->>'correct_answer' loop
     v_normalized_answer:=private.normalize_assignment_answer(coalesce(v_answer,''));
     if v_normalized_answer<>'' and v_normalized_student=v_normalized_answer then v_is_correct:=true;exit;end if;
   end loop;
   if not v_is_correct then v_is_correct:=null;v_grading_status:='under_review';end if;
 else v_normalized_answer:=private.normalize_assignment_answer(v_snapshot->>'correct_answer');v_is_correct:=v_normalized_student=v_normalized_answer;end if;
 insert into public.student_assignment_answers(assignment_id,student_id,question_id,question_text,correct_answer,student_answer,is_correct,time_taken_ms,answered_at,grading_status,grading_source,grading_confidence,review_started_at,reviewed_at,ai_review_model,ai_review_rationale,review_error)
 values(p_assignment_id,v_student,p_question_id,v_snapshot->>'question_text',v_snapshot->>'correct_answer',coalesce(p_student_answer,''),v_is_correct,greatest(0,least(coalesce(p_time_taken_ms,0),3600000)),now(),v_grading_status,'deterministic',case when v_grading_status='graded' then 1 else null end,null,case when v_grading_status='graded' then now() else null end,null,null,null)
 on conflict(assignment_id,student_id,question_id) do update set question_text=excluded.question_text,correct_answer=excluded.correct_answer,student_answer=excluded.student_answer,is_correct=excluded.is_correct,time_taken_ms=excluded.time_taken_ms,answered_at=excluded.answered_at,grading_status=excluded.grading_status,grading_source=excluded.grading_source,grading_confidence=excluded.grading_confidence,review_started_at=null,reviewed_at=excluded.reviewed_at,ai_review_model=null,ai_review_rationale=null,review_error=null;
 update public.student_assignments set status='in_progress' where assignment_id=p_assignment_id and student_id=v_student and status='pending';
 return jsonb_build_object('success',true,'is_correct',v_is_correct,'grading_status',v_grading_status,'pending_review',v_grading_status='under_review','points_earned',case when v_is_correct is true then coalesce((v_snapshot->>'points')::integer,0) else 0 end,'question_type',v_question_type,'grading_mode',v_grading_mode);
end $function$
;

CREATE OR REPLACE FUNCTION public.rpc_submit_assignment_result_v2(p_assignment_id uuid, p_correct integer, p_incorrect integer, p_accuracy integer, p_score integer, p_time_taken integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_existing public.student_assignment_results%rowtype; v_student_id uuid:=auth.uid();v_assignment_status text;v_question_count integer;v_answered_count integer;v_server_correct integer;v_server_incorrect integer;v_pending integer;v_server_accuracy integer;v_server_score integer;v_updated_assignment_id uuid;v_due_at timestamptz;v_close boolean;
begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED';end if;
 perform 1 from public.student_assignments
 where assignment_id=p_assignment_id and student_id=v_student_id for update;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED'; end if;
 -- A committed response may be lost in transit. Return it before deadline/status checks.
 select * into v_existing from public.student_assignment_results
 where assignment_id=p_assignment_id and student_id=v_student_id;
 if found then
   return jsonb_build_object('success',true,'already_submitted',true,
     'correct',v_existing.correct,'incorrect',v_existing.incorrect,
     'pending_review_count',v_existing.pending_review_count,
     'confirmed_question_count',v_existing.correct+v_existing.incorrect,
     'accuracy',v_existing.accuracy,'score',v_existing.score,'grading_status',v_existing.grading_status);
 end if;
 select sa.status,count(aq.question_id)::integer,a.due_at,a.close_submissions_after_due into v_assignment_status,v_question_count,v_due_at,v_close from public.assignments a join public.student_assignments sa on sa.assignment_id=a.id and sa.student_id=v_student_id left join public.assignment_questions aq on aq.assignment_id=a.id where a.id=p_assignment_id group by sa.status,a.due_at,a.close_submissions_after_due;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED';end if;if v_close and v_due_at is not null and now()>v_due_at then raise exception 'ASSIGNMENT_CLOSED';end if;if v_question_count<=0 then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS';end if;if v_assignment_status not in ('pending','in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE';end if;if exists(select 1 from public.student_assignment_results r where r.assignment_id=p_assignment_id and r.student_id=v_student_id) then raise exception 'ASSIGNMENT_ALREADY_SUBMITTED';end if;if p_time_taken<0 then raise exception 'INVALID_VALUES';end if;
 select count(saa.question_id)::integer,count(*) filter(where saa.grading_status='graded' and saa.is_correct is true)::integer,count(*) filter(where saa.grading_status='graded' and saa.is_correct is false)::integer,count(*) filter(where saa.grading_status in ('under_review','reviewing'))::integer,coalesce(sum(case when saa.grading_status='graded' and saa.is_correct is true then coalesce((aq.question_snapshot->>'points')::integer,0) else 0 end),0)::integer into v_answered_count,v_server_correct,v_server_incorrect,v_pending,v_server_score from public.assignment_questions aq left join public.student_assignment_answers saa on saa.assignment_id=aq.assignment_id and saa.question_id=aq.question_id and saa.student_id=v_student_id where aq.assignment_id=p_assignment_id;
 if v_answered_count<>v_question_count then raise exception 'MISMATCHED_QUESTION_TOTAL';end if;if v_server_correct+v_server_incorrect+v_pending<>v_question_count then raise exception 'INVALID_GRADING_STATE';end if;
 v_server_accuracy:=case when v_server_correct+v_server_incorrect=0 then 0 else round((v_server_correct::numeric*100.0)/(v_server_correct+v_server_incorrect))::integer end;
 update public.student_assignments set status='completed',completed_at=now() where assignment_id=p_assignment_id and student_id=v_student_id and status in ('pending','in_progress') returning assignment_id into v_updated_assignment_id;if v_updated_assignment_id is null then raise exception 'ASSIGNMENT_STATE_TRANSITION_FAILED';end if;
 insert into public.student_assignment_results(assignment_id,student_id,correct,incorrect,accuracy,score,time_taken_seconds,completed_at,submitted_late,pending_review_count,grading_status) values(p_assignment_id,v_student_id,v_server_correct,v_server_incorrect,v_server_accuracy,v_server_score,greatest(p_time_taken,0),now(),v_due_at is not null and now()>v_due_at,v_pending,case when v_pending>0 then 'pending_review' else 'final' end);
 return jsonb_build_object('success',true,'correct',v_server_correct,'incorrect',v_server_incorrect,'pending_review_count',v_pending,'confirmed_question_count',v_server_correct+v_server_incorrect,'accuracy',v_server_accuracy,'score',v_server_score,'grading_status',case when v_pending>0 then 'pending_review' else 'final' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_student_pending_assignments_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student_id uuid:=auth.uid();
begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED';end if;
 return(select coalesce(jsonb_agg(payload order by status_priority,assigned_at),'[]'::jsonb) from(
 select jsonb_build_object(
 'assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()),'student_status',sa.status,
 'answered_question_ids',answer_state.ids,
 'resume_answered_count',answer_state.answered_count,
 'resume_correct_count',answer_state.correct_count,
 'resume_pending_review_count',answer_state.pending_count,
 'resume_score',answer_state.score,
 'resume_time_taken_ms',answer_state.time_ms,
 'questions',(select coalesce(jsonb_agg(case when aq.question_snapshot->>'question_type'='short_answer' then aq.question_snapshot-'correct_answer'-'accepted_answers'-'grading_config'-'explanation' else aq.question_snapshot end order by aq.order_index),'[]'::jsonb) from public.assignment_questions aq where aq.assignment_id=a.id)
 ) as payload,case when sa.status='in_progress' then 0 else 1 end as status_priority,sa.assigned_at
 from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id
 cross join lateral (
   select coalesce(jsonb_agg(saa.question_id order by aq.order_index),'[]'::jsonb) ids,
     count(*)::integer answered_count,
     count(*) filter(where saa.is_correct is true)::integer correct_count,
     count(*) filter(where saa.grading_status in ('under_review','reviewing'))::integer pending_count,
     coalesce(sum(case when saa.is_correct is true then coalesce((aq.question_snapshot->>'points')::integer,0) else 0 end),0)::integer score,
     coalesce(sum(saa.time_taken_ms),0)::bigint time_ms
   from public.student_assignment_answers saa
   join public.assignment_questions aq on aq.assignment_id=saa.assignment_id and aq.question_id=saa.question_id
   where saa.assignment_id=a.id and saa.student_id=v_student_id
 ) answer_state

 where sa.student_id=v_student_id and sa.status in('pending','in_progress') and a.publish_status in('published','scheduled') and a.assigned_at<=now() and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id)
 ) active_assignments);
end $function$
;

CREATE OR REPLACE FUNCTION public.rpc_teacher_assignment_success_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with current_teacher as (
    select t.id teacher_id,t.user_id teacher_user_id
    from public.teachers t
    where t.user_id=auth.uid()
    limit 1
  ),
  current_scope_assignments as (
    select a.id
    from public.assignments a
    join current_teacher t on t.teacher_id=a.teacher_id
    join public.school_academic_years y
      on y.id=a.academic_year_id
     and y.school_id=a.school_id
     and y.status='current'
    where (
      a.subject_group_id is not null
      and exists(
        select 1
        from public.school_subject_group_teachers gt
        join public.school_subject_groups g
          on g.id=gt.group_id
         and g.school_id=gt.school_id
         and g.status='active'
        join public.school_subject_offerings o
          on o.id=g.school_subject_offering_id
         and o.school_id=g.school_id
         and o.status='active'
        where gt.group_id=a.subject_group_id
          and gt.teacher_user_id=t.teacher_user_id
          and gt.school_id=a.school_id
          and gt.active
          and o.academic_year_id=a.academic_year_id
      )
    )
    or (
      a.subject_group_id is null
      and (
        (
          coalesce(a.assignment_mode,'batch')='batch'
          and a.class_id is not null
          and exists(
            select 1
            from public.class_teacher_assignments cta
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where cta.teacher_user_id=t.teacher_user_id
              and cta.school_id=a.school_id
              and cta.class_id=a.class_id
              and cta.active
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
        or (
          (
            coalesce(a.assignment_mode,'batch')='custom'
            or a.class_id is null
            or upper(trim(coalesce(a.batch,'')))='ALL'
          )
          and exists(
            select 1
            from public.student_assignments sa
            join public.class_students cs on cs.student_id=sa.student_id
            join public.class_teacher_assignments cta
              on cta.class_id=cs.class_id
             and cta.teacher_user_id=t.teacher_user_id
             and cta.school_id=a.school_id
             and cta.active
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where sa.assignment_id=a.id
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
      )
    )
  ),
  assignment_progress as (
    select
      csa.id,
      count(sa.student_id)::int student_count,
      count(sa.student_id) filter(where sa.status='completed')::int completed_count
    from current_scope_assignments csa
    left join public.student_assignments sa on sa.assignment_id=csa.id
    group by csa.id
  ),
  assignment_totals as (
    select
      count(*)::int assignment_count,
      count(*) filter(where completed_count<student_count)::int active_assignment_count
    from assignment_progress
  ),
  valid_results as (
    select coalesce(r.correct,0) correct,coalesce(r.incorrect,0) incorrect
    from public.student_assignment_results r
    join current_scope_assignments csa on csa.id=r.assignment_id
    where not exists(
      select 1
      from public.legacy_quarantined_assignment_students q
      where q.assignment_id=r.assignment_id and q.student_id=r.student_id
    )
  ),
  result_totals as (
    select
      count(*)::int submission_count,
      coalesce(sum(correct+incorrect),0)::int answered_question_count,
      coalesce(sum(correct),0)::int correct_answer_count
    from valid_results
  )
  , followups as (
    select sa.student_id, a.id assignment_id,
      coalesce(nullif(trim(u.full_name),''),u.username,'Student') student_name,
      coalesce(a.title,a.topic_name,'Untitled assignment') assignment_title,
      case when r.student_id is null then 'missing' else 'low_accuracy' end kind,
      r.accuracy, a.assigned_at
    from current_scope_assignments scope
    join public.assignments a on a.id=scope.id
    join public.student_assignments sa on sa.assignment_id=a.id
    join public.users u on u.id=sa.student_id
    left join public.student_assignment_results r on r.assignment_id=sa.assignment_id and r.student_id=sa.student_id
    where a.publish_status in ('published','scheduled') and a.assigned_at<=now()
      and ((r.student_id is null and sa.status in ('pending','in_progress')) or r.accuracy<65)
      and not exists(select 1 from public.legacy_quarantined_assignment_students q
        where q.assignment_id=sa.assignment_id and q.student_id=sa.student_id)
  )
  select jsonb_build_object(
    'followup_count',(select count(*) from followups),
    'followups',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from (
      select student_id,assignment_id,student_name,assignment_title,kind,accuracy
      from followups order by assigned_at desc,assignment_id,student_id limit 8
    ) f),
    'assignment_count',a.assignment_count,
    'active_assignment_count',a.active_assignment_count,
    'submission_count',r.submission_count,
    'answered_question_count',r.answered_question_count,
    'correct_answer_count',r.correct_answer_count,
    'success_rate',case
      when r.answered_question_count>0
      then round(r.correct_answer_count::numeric*100/r.answered_question_count)::int
      else 0
    end
  )
  from assignment_totals a
  cross join result_totals r;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_request_entitlement()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_path text := split_part(coalesce(current_setting('request.path', true), ''), '?', 1);
  v_feature text;
  v_allow_individual boolean := false;
begin

  if v_path = any(array[
    '/rpc/rpc_get_student_active_assignment_v2',
    '/rpc/rpc_get_student_pending_assignments_v2',
    '/rpc/rpc_get_student_completed_assignments_v2',
    '/rpc/rpc_get_student_active_assignment',
    '/rpc/rpc_get_student_pending_assignments',
    '/rpc/rpc_get_student_completed_assignments',
    '/rpc/rpc_get_my_assignment_answers'
  ]) then
    return;
  end if;

  if v_path = any(array[
    '/rpc/school_admin_list_teacher_assignments',
    '/rpc/school_admin_delete_teacher_assignment'
  ]) then
    return;
  end if;

  if v_path = any(array[
    '/assignments','/assignment_questions','/assignment_students','/student_assignments',
    '/student_assignment_answers','/student_assignment_results','/student_assignment_analyses',
    '/assignment_question_details','/rpc/rpc_create_assignment','/rpc/rpc_update_teacher_assignment',
    '/rpc/rpc_delete_teacher_assignment','/rpc/rpc_get_assignments_for_teacher',
    '/rpc/rpc_submit_assignment_answer','/rpc/rpc_submit_assignment_result',
    '/rpc/check_assignment_achievements'
  ]) then
    v_feature := 'assignments';
  elsif v_path = any(array[
    '/rpc/rpc_teacher_assignment_report','/rpc/rpc_teacher_assignment_success_summary',
    '/rpc/rpc_get_assignment_question_analysis','/rpc/rpc_get_assignment_student_answers'
  ]) then
    v_feature := 'reports';
  elsif v_path = any(array['/teacher_questions','/rpc/get_unlocked_teacher_questions']) then
    v_feature := 'question_bank';
  elsif v_path = any(array[
    '/clans','/clan_members','/clan_join_requests','/clan_chat','/clan_buff_templates',
    '/clan_buffs','/clan_active_buffs','/clan_member_coin_contributions','/clan_member_scores',
    '/clan_scores','/leaderboard_clan_stats','/rivalry_wars','/rivalry_war_actions',
    '/rivalry_war_effects','/rivalry_war_member_state','/rivalry_war_pair_cooldowns',
    '/rivalry_war_rewards','/rivalry_war_rosters','/rivalry_war_scores',
    '/rivalry_war_stakes','/rivalry_war_structures','/rpc/get_school_clan_leaderboard',
    '/rpc/rpc_clan_deposit_coins','/rpc/rpc_clan_join_request_decide','/rpc/rpc_clan_join_requests',
    '/rpc/rpc_clan_territory_my_context','/rpc/rpc_claim_clan_territory_reward',
    '/rpc/claim_clan_territory_rewards','/rpc/rpc_create_clan','/rpc/rpc_get_clan_leaderboard',
    '/rpc/rpc_get_clan_members','/rpc/rpc_join_clan','/rpc/rpc_leave_clan',
    '/rpc/rpc_purchase_clan_buff','/rpc/rpc_purchase_clan_member_slot',
    '/rpc/rpc_transfer_clan_leadership','/rpc/rpc_update_clan_member_role',
    '/rpc/rpc_rivalry_claim_reward','/rpc/rpc_rivalry_declare_war',
    '/rpc/rpc_rivalry_get_public_wars','/rpc/rpc_rivalry_get_war_logs',
    '/rpc/rpc_rivalry_get_war_state','/rpc/rpc_rivalry_lock_roster',
    '/rpc/rpc_rivalry_respond_war','/rpc/rpc_rivalry_set_doctrine',
    '/rpc/rpc_rivalry_settle_war','/rpc/rpc_rivalry_submit_action',
    '/rpc/rpc_rivalry_update_roster_member'
  ]) then
    v_feature := 'clans';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/pvp_attack_attempts','/competition_pvp_wins','/rpc/get_attack_targets',
    '/rpc/get_bot_pvp_targets','/rpc/rpc_hack_attempt','/rpc/rpc_update_pvp_score'
  ]) then
    v_feature := 'pvp_battles';
    v_allow_individual := true;
  elsif v_path = any(array['/inventory','/shop_purchases','/rpc/inventory_activate']) then
    v_feature := 'shop';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/raids','/raid_events','/raid_participants','/raid_waves','/brains_heist_raids',
    '/brains_heist_raid_attacks','/brains_heist_raid_participants','/rpc/create_raid',
    '/rpc/finalize_raid','/rpc/get_raid_status','/rpc/join_raid','/rpc/submit_raid_answer',
    '/rpc/brains_heist_attack_raid'
  ]) then
    v_feature := 'raids';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/tournament_matches','/tournament_school_signups','/tournament_seasons',
    '/tournament_public_bracket','/rpc/approve_tournament_signup'
  ]) then
    v_feature := 'tournaments';
    v_allow_individual := true;
  end if;

  if v_feature is null then return; end if;
  if auth.uid() is null or public.is_superadmin(auth.uid()) then return; end if;

  if not private.actor_has_feature_entitlement(v_feature, v_allow_individual) then
    raise sqlstate 'PGRST'
      using message = jsonb_build_object(
        'code', 'FEATURE_NOT_INCLUDED',
        'message', 'This feature is not included in the effective school plan',
        'details', format('Required feature: %s', v_feature),
        'hint', 'Ask your school administrator to review the current plan.'
      )::text,
      detail = jsonb_build_object(
        'status', 403,
        'headers', jsonb_build_object('X-Entitlement-Decision', 'denied')
      )::text;
  end if;
end;
$function$
;


-- Existing single-column indexes do not cover per-student assignment serialization.
create index if not exists student_assignments_assignment_student_idx
  on public.student_assignments(assignment_id, student_id);

revoke all on function public.rpc_submit_assignment_answer_v2(uuid,uuid,text,text,text,boolean,integer) from public,anon;
grant execute on function public.rpc_submit_assignment_answer_v2(uuid,uuid,text,text,text,boolean,integer) to authenticated,service_role;
revoke all on function public.rpc_submit_assignment_result_v2(uuid,integer,integer,integer,integer,integer) from public,anon;
grant execute on function public.rpc_submit_assignment_result_v2(uuid,integer,integer,integer,integer,integer) to authenticated,service_role;
revoke all on function public.rpc_get_student_pending_assignments_v2() from public,anon;
grant execute on function public.rpc_get_student_pending_assignments_v2() to authenticated,service_role;
revoke all on function public.rpc_teacher_assignment_success_summary() from public,anon;
grant execute on function public.rpc_teacher_assignment_success_summary() to authenticated,service_role;
revoke all on function private.enforce_request_entitlement() from public;
grant execute on function private.enforce_request_entitlement() to anon,authenticated,service_role;
notify pgrst,'reload schema';
