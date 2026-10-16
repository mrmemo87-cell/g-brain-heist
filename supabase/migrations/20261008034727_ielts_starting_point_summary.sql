-- Bible 1.4.0: self-only, bounded starting-point projection. No scoring or answer writes.
create function public.rpc_ielts_starting_point_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid := auth.uid(); catalog jsonb; entry jsonb; item jsonb; results jsonb := '{}';
 speaking jsonb; session_id uuid; speaking_result jsonb; skill text;
begin
 if actor is null or not private.ielts_speaking_student_eligible(actor) then
   raise exception using errcode='42501',message='not_authorized';
 end if;
 -- Existing release/entitlement predicates remain authoritative for discovery.
 catalog := public.rpc_ielts_screener_catalog();
 for entry in select value from jsonb_array_elements(catalog) loop
   skill := case entry->>'code' when 'bh-listening-screener-a' then 'listening'
     when 'bh-reading-screener-a' then 'reading' when 'bh-writing-screener-a' then 'writing' end;
   if skill is null or entry->>'status'<>'completed' then continue; end if;
   item := null;
   if skill in ('listening','reading') then
     select jsonb_build_object('attempt_id',e.attempt_id,'raw_score',r.raw_score,'total',r.marks_possible,
       'occurred_at',r.created_at,'conditions_need_review',private.ielts_screener_integrity_incident(e.attempt_id))
     into item from private.ielts_diagnostic_attempt_evidence e
     join private.ielts_diagnostic_scoring_runs r on r.attempt_id=e.attempt_id and r.server_verified
     where e.attempt_id=(entry->>'attempt_id')::uuid and e.student_id=actor
     order by r.run_version desc limit 1;
   else
     select jsonb_build_object('attempt_id',w.attempt_id,'word_count',w.word_count,'occurred_at',w.submitted_at,
       'evidence_kind',w.evidence_kind,'conditions_need_review',private.ielts_screener_integrity_incident(w.attempt_id),
       'review',case when r.id is null then null else jsonb_build_object('id',r.id,
         'reviewer_name',coalesce(u.username,'Your teacher'),'reviewed_at',r.reviewed_at,'next_step',r.next_step,
         'conditions_note',r.delivery_comment,'observations',(select jsonb_object_agg(k,jsonb_build_object(
           'status',v->>'status','comment',v->>'comment')) from jsonb_each(r.criterion_observations) o(k,v))) end)
     into item from private.ielts_writing_screener_submissions w
     join private.ielts_diagnostic_attempt_evidence e on e.attempt_id=w.attempt_id and e.student_id=actor
     left join lateral (select x.id,x.reviewed_by,x.reviewed_at,x.next_step,x.delivery_comment,x.criterion_observations
       from private.ielts_writing_screener_reviews x where x.attempt_id=w.attempt_id
       and x.response_sha256=w.response_sha256 order by x.run_version desc limit 1) r on true
     left join public.users u on u.id=r.reviewed_by
     where w.attempt_id=(entry->>'attempt_id')::uuid;
   end if;
   results := results || jsonb_build_object(skill,item);
 end loop;
 speaking := public.rpc_ielts_speaking_workspace(null,'');
 -- Resume an active interview first; otherwise show the latest saved interview, not another student's workspace.
 select s.id into session_id from private.ielts_speaking_sessions s
 where s.student_id=actor and private.can_access_ielts_speaking(s.id)
 order by (s.status='in_progress') desc,s.created_at desc,s.id limit 1;
 if session_id is not null then
   select jsonb_build_object('attempt_id',s.id,'status',s.status,'occurred_at',coalesce(s.submitted_at,s.created_at),
     'evidence_kind',s.evidence_kind,'conditions_need_review',exists(select 1 from private.ielts_speaking_incidents i where i.session_id=s.id),
     'review',case when r.id is null then null else jsonb_build_object('id',r.id,
       'reviewer_name',coalesce(u.username,'Your teacher'),'reviewed_at',r.reviewed_at,'next_step',r.fields->>'next_step',
       'conditions_note',r.fields->>'delivery_comment','observations',(select jsonb_object_agg(k,jsonb_build_object(
         'status',v->>'status','comment',v->>'comment')) from jsonb_each(r.fields->'observations') o(k,v))) end)
   into speaking_result from private.ielts_speaking_sessions s
   left join lateral (select x.id,x.reviewer_id,x.reviewed_at,x.fields from private.ielts_speaking_reviews x
     where x.session_id=s.id and x.teacher_confirmed and s.status='submitted'
     order by x.reviewed_at desc,x.id limit 1) r on true
   left join public.users u on u.id=r.reviewer_id where s.id=session_id and s.student_id=actor;
 end if;
 return jsonb_build_object('student_name',(select username from public.users where id=actor),
   'school_managed',(select school_id is not null from public.users where id=actor),'catalog',catalog,
   'results',results || jsonb_build_object('speaking',speaking_result),
   'speaking_available',coalesce((speaking->>'available')::boolean,false),'confidence','low',
   'readiness_available',false,'band_estimate',null);
end; $$;
revoke all on function public.rpc_ielts_starting_point_summary() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_starting_point_summary() to authenticated;
notify pgrst,'reload schema';
