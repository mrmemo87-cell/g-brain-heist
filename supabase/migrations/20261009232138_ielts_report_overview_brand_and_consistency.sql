-- Bible 1.7.0: concise presentation, scoped school branding and evidence consistency.
-- No existing shared snapshot, attempt, score or teacher decision is rewritten.
create function private.check_ielts_plan_evidence(p_fields jsonb,p_sources jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare sk text; sentence text; prose text;
begin
 prose:=coalesce(p_fields->>'study_goal','')||E'\n'||coalesce(p_fields->>'next_action','')||E'\n'||coalesce((select string_agg(g->>'action',E'\n') from jsonb_array_elements(coalesce(p_fields->'goals','[]'::jsonb)) g),'');
 foreach sk in array array['writing','speaking'] loop
 if exists(select 1 from jsonb_array_elements(p_sources) e where e->>'skill'=sk and nullif(e->>'review_id','') is not null and e->>'kind'<>'guided_practice') then
  foreach sentence in array regexp_split_to_array(prose,E'[.!?\\n]') loop
   if sentence ~* ('\m'||sk||'\M') and sentence ~* '\m(assessments?|samples?|checks?|reviews?)\M'
    and sentence ~* '\m(arrange|schedule|missing|pending|await|need|take|complete|submit)\M'
    and sentence !~* '\m(fresh|new|next|follow.up|another|repeat|expand|revise|revising|feedback)\M' then
    raise exception 'plan_evidence_inconsistent';
   end if;
  end loop;
 end if;
 end loop;
end; $$;
revoke all on function private.check_ielts_plan_evidence(jsonb,jsonb) from public,anon,authenticated,service_role;

do $patch$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('private.validate_ielts_plan(jsonb,jsonb)'::regprocedure);
 anchor:=E' end loop;\nend;';
 if position(anchor in definition)=0 then raise exception 'ielts_validate_anchor_missing'; end if;
 execute replace(definition,anchor,E' end loop;\n perform private.check_ielts_plan_evidence(p_fields,p_sources);\nend;');
 definition:=pg_get_functiondef('public.rpc_ielts_generate_monthly_report(uuid,uuid,uuid,date,date,timestamp with time zone,uuid)'::regprocedure);
 anchor:='-- Include earlier dated baseline references but count only in-period work as activity.';
 if position(anchor in definition)=0 then raise exception 'ielts_generation_anchor_missing'; end if;
 definition:=replace(definition,anchor,'perform private.check_ielts_plan_evidence(l.fields,sources);'||E'\n '||anchor);
 anchor:='''school'',jsonb_build_object(''id'',p_school,''name'',(select name from public.schools where id=p_school))';
 if position(anchor in definition)=0 then raise exception 'ielts_brand_anchor_missing'; end if;
 definition:=replace(definition,anchor,'''school'',jsonb_build_object(''id'',p_school,''name'',(select name from public.schools where id=p_school),''logo_url'',(select logo_url from public.schools where id=p_school))');
 execute definition;
 definition:=pg_get_functiondef('public.rpc_ielts_monthly_report(uuid,boolean)'::regprocedure);
 anchor:='update public.academic_report_snapshots set status=''final''';
 if position(anchor in definition)=0 then raise exception 'ielts_finalize_anchor_missing'; end if;
 definition:=replace(definition,anchor,'perform private.check_ielts_plan_evidence(r.report_payload#>''{plan,fields}'',r.report_payload->''evidence'');'||E'\n '||anchor);
 -- Existing reports get current branding as presentation metadata, outside immutable payload/hash.
 anchor:='''payload_hash'',r.payload_hash,''payload'',r.report_payload';
 if position(anchor in definition)=0 then raise exception 'ielts_brand_read_anchor_missing'; end if;
 execute replace(definition,anchor,anchor||',''school_brand'',jsonb_build_object(''logo_url'',(select logo_url from public.schools where id=r.school_id))');
 -- New AI cache version must not reuse drafts retaining an outdated goal.
 definition:=pg_get_functiondef('public.rpc_ielts_claim_plan_ai(uuid,uuid,text)'::regprocedure);
 if position('bh-ielts-learning-plan-v2' in definition)=0 then raise exception 'ielts_prompt_anchor_missing'; end if;
 execute replace(definition,'bh-ielts-learning-plan-v2','bh-ielts-learning-plan-v3');
end $patch$;
alter table private.ielts_plan_ai_drafts alter column prompt_version set default 'bh-ielts-learning-plan-v3';
notify pgrst,'reload schema';
