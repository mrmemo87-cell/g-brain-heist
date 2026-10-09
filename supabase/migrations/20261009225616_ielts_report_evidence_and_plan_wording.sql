-- Bible 1.7.0: restore terminal auto-submitted evidence, preserve final snapshots.
-- Current reads/new reports gain full profile names and applicable plain-language notes.
-- New AI prompt version invalidates cached wording without deleting drafts or plans.
do $patch$
declare definition text; signature text; anchor text;
begin
 signature := 'private.ielts_report_evidence(uuid,uuid,timestamp with time zone,timestamp with time zone)';
 definition := pg_get_functiondef(signature::regprocedure);
 if position('a.status=''submitted''' in definition)=0 then raise exception 'ielts_evidence_status_anchor_missing'; end if;
 definition := replace(definition,'a.status=''submitted''','a.status in (''submitted'',''auto_submitted'')');
 definition := replace(definition,'''occurred_at'',r.created_at,''kind'',''screener''','''occurred_at'',r.created_at,''submission_status'',(select a.status from public.ielts_exam_attempts a where a.id=e.attempt_id),''kind'',''screener''');
 definition := replace(definition,'u.username','coalesce(nullif(trim(u.full_name),''''),u.username)');
 execute definition;
 foreach signature in array array[
  'public.rpc_ielts_learning_report_context(uuid,uuid)',
  'public.rpc_ielts_generate_monthly_report(uuid,uuid,uuid,date,date,timestamp with time zone,uuid)',
  'public.rpc_ielts_monthly_report(uuid,boolean)'
 ] loop
  definition := pg_get_functiondef(signature::regprocedure);
  definition := replace(definition,'select username from public.users','select coalesce(nullif(trim(full_name),''''),username) from public.users');
  definition := replace(definition,'''author'',u.username','''author'',coalesce(nullif(trim(u.full_name),''''),u.username)');
  if signature like '%generate_monthly%' then
   anchor := '''Legacy school practice records show participation only; exact material versions and feedback may be unavailable.''';
   if position(anchor in definition)=0 then raise exception 'ielts_report_notes_anchor_missing'; end if;
   definition := replace(definition,','||anchor,') || case when exists(select 1 from jsonb_array_elements(sources) e where e->>''source_type''=''ielts_school_practice'') then jsonb_build_array(''For older school practice, the exact task version and feedback may be unavailable. Completion records participation.'') else ''[]''::jsonb end || jsonb_build_array(''Teacher preparation pathways are planning decisions, not language levels.''');
  end if;
  execute definition;
 end loop;
 definition := pg_get_functiondef('public.rpc_ielts_claim_plan_ai(uuid,uuid,text)'::regprocedure);
 anchor := 'd.source_hash=fingerprint and d.model=p_model';
 if position(anchor in definition)=0 then raise exception 'ielts_plan_prompt_anchor_missing'; end if;
 execute replace(definition,anchor,anchor||' and d.prompt_version=''bh-ielts-learning-plan-v2''');
end $patch$;
alter table private.ielts_plan_ai_drafts alter column prompt_version set default 'bh-ielts-learning-plan-v2';
notify pgrst,'reload schema';
