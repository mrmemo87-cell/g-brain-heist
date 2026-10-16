-- Owner approval: “I reviewed and need to publish them for any eligible students” (2026-10-16).
-- This records content approval only; Listening recording acceptance remains a separate scope.
create table private.ielts_reviewed_practice (
 legacy_code text not null,revision text not null,revision_sha256 text not null,
 material_type text not null,material_id text not null,source_material_id text not null,
 content jsonb not null,owner_id uuid not null references public.users(id),
 approval_statement text not null,approved_at timestamptz not null default now(),
 release_ready boolean not null,primary key(legacy_code,revision),unique(material_type,material_id,revision),
 foreign key(legacy_code,revision) references private.ielts_legacy_cleanup_versions(code,revision)
);
create table private.ielts_reviewed_practice_releases (
 legacy_code text not null,revision text not null,released_by uuid not null references public.users(id),released_at timestamptz not null default now(),
 primary key(legacy_code,revision),foreign key(legacy_code,revision) references private.ielts_reviewed_practice(legacy_code,revision)
);
alter table private.ielts_reviewed_practice enable row level security;
alter table private.ielts_reviewed_practice_releases enable row level security;
revoke all on private.ielts_reviewed_practice,private.ielts_reviewed_practice_releases from public,anon,authenticated,service_role;
create trigger immutable_reviewed_practice before update or delete on private.ielts_reviewed_practice for each row execute function private.ielts_learning_immutable();
create trigger immutable_reviewed_release before update or delete on private.ielts_reviewed_practice_releases for each row execute function private.ielts_learning_immutable();
-- Existing prompts keep their canonical identity. Only availability/derived originality labels may change.
create or replace function private.ielts_preserve_legacy_source() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; old_id text; new_id text;
begin
 kind:=case tg_table_name when 'ielts_reading_questions' then 'ielts_reading_set' when 'ielts_listening_questions' then 'ielts_listening_set' else left(tg_table_name,-1) end;
 if tg_op<>'INSERT' then old_id:=case when tg_table_name like '%_questions' then to_jsonb(old)->>'set_id' else to_jsonb(old)->>'id' end;end if;
 if tg_op<>'DELETE' then new_id:=case when tg_table_name like '%_questions' then to_jsonb(new)->>'set_id' else to_jsonb(new)->>'id' end;end if;
 if exists(select 1 from private.ielts_legacy_cleanup_versions where material_type=kind and material_id in(old_id,new_id)) or exists(select 1 from private.ielts_reviewed_practice p join private.ielts_reviewed_practice_releases e using(legacy_code,revision) where p.material_type=kind and p.material_id in(old_id,new_id)) then
  if tg_op='UPDATE' and kind in('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task')
    and (to_jsonb(new)-'is_active'-'originality_label')=(to_jsonb(old)-'is_active'-'originality_label')
    and exists(select 1 from private.ielts_reviewed_practice p join private.ielts_reviewed_practice_releases r using(legacy_code,revision) where p.material_type=kind and p.material_id=old_id and p.release_ready)
  then return new;end if;
  raise exception 'Legacy source is frozen to preserve history. Use its approved version; do not overwrite content.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
do $install$ declare v record;c jsonb;new_id bigint;actor uuid;qt jsonb;key_value jsonb;begin
 select id into strict actor from public.users where role='admin' and username='Mr. Sobbi' and not coalesce(is_banned,false) and (banned_until is null or banned_until<=now());
 for v in select * from private.ielts_legacy_cleanup_versions where revision='2026-10-16.1' and disposition='revise' order by code loop
 c:=v.revision_payload->'content';
 if v.material_type='ielts_reading_set' then
 insert into public.ielts_reading_sets(slug,title,description,level,duration_minutes,passage_text,is_active,required_tier,created_by)
 values('reviewed-'||lower(v.code)||'-20261016',c->>'title',(c->>'scope')||E'\n\n'||coalesce(c->>'case_study_notice','')||E'\n\n'||(c->>'instructions'),case when c->>'scope' like 'Foundation%' then 'Foundation practice' else 'Extended practice' end,20,c->>'passage',false,'free',actor) returning id into new_id;
 for qt in select value from jsonb_array_elements(c->'questions') loop
 key_value:=case when qt->>'type'='multiple_choice' then to_jsonb(qt->'options'->>(ascii(qt->>'key')-65)) else qt->'key' end;
 insert into public.ielts_reading_questions(set_id,question_order,question_type,body,options,correct_answer,explanation)
 values(new_id,(qt->>'n')::int,qt->>'type',qt->>'question',qt->'options',key_value,qt->>'evidence');
 end loop;
 elsif v.material_type='ielts_listening_set' then
 insert into public.ielts_listening_sets(slug,title,description,level,duration_minutes,audio_url,is_active,required_tier,instructions,section_label,question_range_label,created_by)
 values('reviewed-'||lower(v.code)||'-20261016',c->>'title',c->>'scope','Guided practice',5,'',false,'free',c->>'instructions','Guided practice','Questions 1–6',actor) returning id into new_id;
 insert into private.ielts_material_transcripts(material_id,transcript) values(new_id::text,c->>'script');
 for qt in select value from jsonb_array_elements(c->'questions') loop
 insert into public.ielts_listening_questions(set_id,question_order,question_type,body,options,correct_answer,explanation)
 values(new_id,(qt->>'n')::int,qt->>'type',qt->>'question',qt->'options',qt->'key',qt->>'evidence');
 end loop;
 else new_id:=v.material_id::bigint;end if;
 insert into private.ielts_reviewed_practice(legacy_code,revision,revision_sha256,material_type,material_id,source_material_id,content,owner_id,approval_statement,release_ready)
 values(v.code,v.revision,v.revision_sha256,v.material_type,new_id::text,v.material_id,c,actor,'I reviewed and need to publish them for any eligible students',v.material_type<>'ielts_listening_set');
 end loop;
end;$install$;
-- Bounded, same-access-context delivery projection; transcripts, keys, source snapshots and global inventory stay private.
create function public.rpc_ielts_reviewed_practice_delivery(p_type text,p_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.ielts_reviewed_practice%rowtype;r jsonb;c jsonb;begin
 if auth.uid() is null then raise exception 'forbidden';end if;
 select v.* into p from private.ielts_reviewed_practice v join private.ielts_reviewed_practice_releases e using(legacy_code,revision) where v.material_type=p_type and v.material_id=p_id order by e.released_at desc limit 1;
 if not found then return null;end if;
 if p_type='ielts_writing_task' then select to_jsonb(t) into r from public.ielts_writing_tasks t where id::text=p_id;
 elsif p_type='ielts_speaking_task' then select to_jsonb(t) into r from public.ielts_speaking_tasks t where id::text=p_id;
 else return null;end if;
 if not private.ielts_can_access_practice_content(p_type,p_id,coalesce((r->>'is_active')::boolean,false),coalesce(r->>'required_tier','free'),private.ielts_extra_practice_access_context()) or not private.ielts_practice_material_allowed(p_type,p_id) then raise exception 'forbidden';end if;
 c:=p.content;
 return jsonb_build_object('practice_revision',p.revision,'practice_revision_sha256',p.revision_sha256,'practice_scope',c->>'scope','prompt',c->>'prompt','sample_answer',c->>'model_answer','chart',c->'chart','model_word_count',c->'model_word_count','minimum_words',c->'minimum_words','bands_target',null,
 'follow_ups',jsonb_build_object('questions',c->'follow_up_questions','preparation_time',c#>'{timing,preparation_seconds}','speaking_time',c#>'{timing,suggested_turn_seconds}'));
end;$$;
revoke all on function public.rpc_ielts_reviewed_practice_delivery(text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_reviewed_practice_delivery(text,text) to authenticated;
-- Deliberate activation, called only after the matching UI is deployed and delivery checks pass.
create function private.publish_reviewed_ielts_practice() returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;p jsonb;m jsonb;parent jsonb;decision text;result jsonb;table_name text;begin
 perform private.ielts_cleanup_authorize();
 if not exists(select 1 from private.ielts_reviewed_practice where owner_id=auth.uid()) then raise exception 'owner_approval_required';end if;
 for v in select * from private.ielts_reviewed_practice where release_ready order by material_type,legacy_code loop
 if exists(select 1 from private.ielts_reviewed_practice_releases where legacy_code=v.legacy_code and revision=v.revision) then continue;end if;
 p:=private.ielts_originality_payload(v.material_type,v.material_id);m:=private.ielts_originality_matches(v.material_type,v.material_id);
 if exists(select 1 from jsonb_array_elements(m) x where x->>'reason'='exact_copy') then raise exception 'Exact task copy requires canonical reuse: %',v.legacy_code;end if;
 select x into parent from jsonb_array_elements(m) x where x->>'reason' in('shared_text','shared_questions','shared_recording','shared_script') order by x->>'material_type',x->>'material_id' limit 1;
 decision:=case when parent is null then 'fresh' else 'variant' end;
 -- Genuine owner-provided review/release instruction, attributed rather than generated independent approval.
 result:=public.rpc_ielts_material_originality_review(v.material_type,v.material_id,p->>'content_hash',private.ielts_originality_hash(m::text),decision,parent->>'material_type',parent->>'material_id',parent->>'content_hash',
 'Owner reviewed exact corrected revision '||v.revision||' ('||v.revision_sha256||') and requested eligible-student publication. Existing Writing/Speaking prompts retain canonical identity; models, chart presentation and timing guidance are versioned delivery changes. Rewritten Reading has a new stimulus and answer evidence. Any shared earlier stimulus is labelled repeat practice.',true,false,false);
 insert into private.ielts_reviewed_practice_releases(legacy_code,revision,released_by) values(v.legacy_code,v.revision,auth.uid());
 table_name:=v.material_type||'s';execute format('update public.%I set is_active=true where id::text=$1',table_name) using v.material_id;
 delete from private.ielts_practice_material_holds where material_type=v.material_type and material_id=v.material_id;
 if not private.ielts_practice_material_allowed(v.material_type,v.material_id) then raise exception 'Protected screener or unavailable material: %',v.legacy_code;end if;
 parent:=null;
 end loop;
 return jsonb_build_object('published',(select count(*) from private.ielts_reviewed_practice_releases),'listening_held',(select count(*) from private.ielts_reviewed_practice where not release_ready));
end;$$;
revoke all on function private.publish_reviewed_ielts_practice() from public,anon,authenticated,service_role;
alter table public.ielts_reading_attempts add column practice_revision_sha256 text;
alter table public.ielts_writing_attempts add column practice_revision_sha256 text;
alter table public.ielts_speaking_attempts add column practice_revision_sha256 text;
create function private.ielts_reviewed_attempt_version() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;material_key text;v record;q record;answer text;correct int:=0;total int:=0;accepted jsonb;begin
 kind:=case tg_table_name when 'ielts_reading_attempts' then 'ielts_reading_set' when 'ielts_writing_attempts' then 'ielts_writing_task' else 'ielts_speaking_task' end;
 material_key:=coalesce(to_jsonb(new)->>'set_id',to_jsonb(new)->>'task_id');
 select p.* into v from private.ielts_reviewed_practice p join private.ielts_reviewed_practice_releases r using(legacy_code,revision) where material_type=kind and material_id=material_key order by released_at desc limit 1;
 if not found then new.practice_revision_sha256:=null;return new;end if;
 new.practice_revision_sha256:=v.revision_sha256;
 if kind='ielts_reading_set' then
 for q in select * from public.ielts_reading_questions where set_id::text=material_key loop
 total:=total+1;answer:=lower(trim(coalesce(new.answers->>q.id::text,'')));accepted:=case when jsonb_typeof(q.correct_answer)='array' then q.correct_answer else jsonb_build_array(q.correct_answer) end;
 if answer<>'' and exists(select 1 from jsonb_array_elements_text(accepted) k where lower(trim(k))=answer) then correct:=correct+1;end if;
 end loop;
 new.raw_score:=correct;new.total_questions:=total;new.percent:=case when total>0 then round(100.0*correct/total,2) else 0 end;new.est_band:=null;
 end if;return new;
end;$$;
revoke all on function private.ielts_reviewed_attempt_version() from public,anon,authenticated,service_role;
create trigger reviewed_practice_before_attempt before insert on public.ielts_reading_attempts for each row execute function private.ielts_reviewed_attempt_version();
create trigger reviewed_practice_before_attempt before insert on public.ielts_writing_attempts for each row execute function private.ielts_reviewed_attempt_version();
create trigger reviewed_practice_before_attempt before insert on public.ielts_speaking_attempts for each row execute function private.ielts_reviewed_attempt_version();
create function private.ielts_reviewed_publication(p_code text,p_revision text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('display_code',private.ielts_material_code(p.material_type,p.material_id),'status',case when r.legacy_code is not null then 'published' when p.release_ready then 'approved_preparing_delivery' else 'recording_acceptance_pending' end,'material_type',p.material_type,'material_id',p.material_id,'approved_at',p.approved_at,'reviewed_by',p.owner_id,'revision_sha256',p.revision_sha256)
 from private.ielts_reviewed_practice p left join private.ielts_reviewed_practice_releases r using(legacy_code,revision) where p.legacy_code=p_code and p.revision=p_revision;
$$;
revoke all on function private.ielts_reviewed_publication(text,text) from public,anon,authenticated,service_role;
create or replace function public.rpc_ielts_legacy_cleanup_detail(p_code text,p_revision text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.ielts_cleanup_authorize();select revision_payload into result from private.ielts_legacy_cleanup_versions where code=p_code and revision=p_revision;
 if result is null then raise exception 'revision_not_found';end if;
 return result||jsonb_build_object('publication',private.ielts_reviewed_publication(p_code,p_revision));
end;$$;
create or replace function public.rpc_ielts_legacy_cleanup_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.ielts_cleanup_authorize();
 return (select coalesce(jsonb_agg(x order by x.code),'[]') from (
 select distinct on(code) code,revision,disposition,revision_sha256,revision_payload->'content'->>'title' title,split_part(material_type,'_',2) skill,revision_payload->'changes' changes,revision_payload->'blockers' blockers,revision_payload->>'consolidate_into' consolidate_into,private.ielts_reviewed_publication(code,revision) publication
 from private.ielts_legacy_cleanup_versions order by code,created_at desc,revision desc limit 100)x);
end;$$;
revoke all on function public.rpc_ielts_legacy_cleanup_detail(text,text),public.rpc_ielts_legacy_cleanup_list() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_legacy_cleanup_detail(text,text),public.rpc_ielts_legacy_cleanup_list() to authenticated;
revoke all on function public.rpc_ielts_legacy_cleanup_list() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_legacy_cleanup_list() to authenticated;
-- Approved-version attempts retain identity and submitted objective evidence.
create function private.ielts_preserve_reviewed_attempt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.practice_revision_sha256 is null then if tg_op='DELETE' then return old;end if;return new;end if;
 if tg_op='DELETE' then raise exception 'Submitted reviewed-practice history is immutable';end if;
 if (to_jsonb(new)->'user_id',coalesce(to_jsonb(new)->'set_id',to_jsonb(new)->'task_id'),new.practice_revision_sha256) is distinct from (to_jsonb(old)->'user_id',coalesce(to_jsonb(old)->'set_id',to_jsonb(old)->'task_id'),old.practice_revision_sha256) then raise exception 'Reviewed-practice identity is immutable';end if;
 if tg_table_name='ielts_reading_attempts' and (to_jsonb(new)->'answers',to_jsonb(new)->'raw_score',to_jsonb(new)->'total_questions',to_jsonb(new)->'percent',to_jsonb(new)->'est_band') is distinct from (to_jsonb(old)->'answers',to_jsonb(old)->'raw_score',to_jsonb(old)->'total_questions',to_jsonb(old)->'percent',to_jsonb(old)->'est_band') then raise exception 'Submitted reviewed-practice score is immutable';end if;
 return new;
end;$$;
revoke all on function private.ielts_preserve_reviewed_attempt() from public,anon,authenticated,service_role;
create trigger preserve_reviewed_practice before update or delete on public.ielts_reading_attempts for each row execute function private.ielts_preserve_reviewed_attempt();
create trigger preserve_reviewed_practice before update or delete on public.ielts_writing_attempts for each row execute function private.ielts_preserve_reviewed_attempt();
create trigger preserve_reviewed_practice before update or delete on public.ielts_speaking_attempts for each row execute function private.ielts_preserve_reviewed_attempt();
-- Student library discovery uses the same entitlement context and practice/screener boundaries as allocation.
create function public.rpc_ielts_practice_available_ids(p_type text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare table_name text;result jsonb;context jsonb;begin
 if auth.uid() is null then raise exception 'forbidden';end if;
 table_name:=case p_type when 'ielts_reading_set' then 'ielts_reading_sets' when 'ielts_listening_set' then 'ielts_listening_sets' when 'ielts_writing_task' then 'ielts_writing_tasks' when 'ielts_speaking_task' then 'ielts_speaking_tasks' end;
 if table_name is null then raise exception 'invalid_material_type';end if;
 context:=private.ielts_extra_practice_access_context();
 execute format('select coalesce(jsonb_agg(id::text order by id),''[]'') from public.%I s where s.is_active and private.ielts_can_access_practice_content($1,id::text,is_active,coalesce(required_tier,''free''),$2) and private.ielts_practice_material_allowed($1,id::text) and private.ielts_originality_label($1,id::text) is not null',table_name) into result using p_type,context;
 return result;
end;$$;
revoke all on function public.rpc_ielts_practice_available_ids(text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_practice_available_ids(text) to authenticated;
