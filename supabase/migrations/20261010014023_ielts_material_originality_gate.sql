-- Bible 1.9.0. Originality is a publication gate, never an IELTS score or calibration claim.
create table private.ielts_material_fingerprints (
 material_type text not null,material_id text not null,skill text not null,
 content_hash text not null,fingerprint_hash text not null,complete boolean not null,primary_hash text,questions_hash text,audio_key text,script_key text,
 recorded_at timestamptz not null default clock_timestamp(),policy_version text not null default 'ielts-originality-v1',tokens text[] not null,snapshot jsonb not null,legacy_hash text,primary key(material_type,material_id,content_hash)
);
create index ielts_originality_skill on private.ielts_material_fingerprints(skill);
create index ielts_originality_exact on private.ielts_material_fingerprints(fingerprint_hash);
create table private.ielts_material_originality_reviews (
 id uuid primary key default gen_random_uuid(),material_type text not null,material_id text not null,
 content_hash text not null,match_hash text not null,policy_version text not null default 'ielts-originality-v1',
 parent_hash text,decision text not null check(decision in ('fresh','variant')),parent_type text,parent_id text,
 rationale text not null,content_checked boolean not null,recording_checked boolean not null,
 reviewed_by uuid not null references public.users(id),reviewed_at timestamptz not null default now(),
 check((decision='fresh' and parent_type is null and parent_id is null) or (decision='variant' and parent_type is not null and parent_id is not null))
);
create index ielts_originality_review_lookup on private.ielts_material_originality_reviews(material_type,material_id,content_hash,reviewed_at desc);
alter table private.ielts_material_fingerprints enable row level security;
alter table private.ielts_material_originality_reviews enable row level security;
revoke all on private.ielts_material_fingerprints,private.ielts_material_originality_reviews from public,anon,authenticated,service_role;

create function private.ielts_originality_normalize(p text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(lower(normalize(coalesce(p,''),NFKC)),'[^[:alnum:]]+',' ','g'));
$$;
create function private.ielts_originality_hash(p text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p,'UTF8')),'hex');
$$;
create function private.ielts_originality_json(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb; kv record;
begin
 if p is null then return 'null'::jsonb; end if;
 case jsonb_typeof(p)
 when 'string' then return to_jsonb(private.ielts_originality_normalize(p#>>'{}'));
 when 'array' then select coalesce(jsonb_agg(private.ielts_originality_json(value) order by ordinal),'[]') into r from jsonb_array_elements(p) with ordinality x(value,ordinal); return r;
 when 'object' then r:='{}'; for kv in select * from jsonb_each(p) loop r:=r||jsonb_build_object(kv.key,private.ielts_originality_json(kv.value)); end loop;return r;
 else return p; end case;
end;$$;

-- Accepted alternatives form a set: reordering them does not create a new answer key.
create function private.ielts_originality_answers(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 with normalized as(select private.ielts_originality_json(p) value),
 alternatives as(select case when jsonb_typeof(value)='string' then jsonb_build_array(value) else value end value from normalized)
 select case when jsonb_typeof(value)='array' then (select coalesce(jsonb_agg(v order by v::text),'[]') from (select distinct v from jsonb_array_elements(value) x(v)) a) else value end from alternatives;
$$;

-- Builds only task-bearing content. IDs, codes, titles and author/taxonomy metadata cannot disguise a copy.
create function private.ielts_originality_payload(p_type text,p_id text,p_row jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r jsonb:=p_row; q jsonb:='[]'; raw_q jsonb:='[]'; primary_text text; core jsonb; audio text; script text; skill text; tokens text[]; source_text text;
begin
 if p_type='targeted' then
  if r is null then select to_jsonb(t) into r from private.ielts_learning_tasks t where code=p_id; end if;
  raw_q:=r->'questions';skill:=r->>'skill';primary_text:=coalesce(r#>>'{content,passage}',r#>>'{content,prompt}',r#>>'{content,transcript}','');
  select coalesce(jsonb_agg(private.ielts_originality_json(jsonb_build_object('prompt',x->>'prompt','options',x->'options','answers',private.ielts_originality_answers(x->'accepted_answers'))) order by private.ielts_originality_normalize(x->>'prompt')),'[]') into q from jsonb_array_elements(case when jsonb_typeof(r->'questions')='array' then r->'questions' else '[]'::jsonb end) x;
  if skill in ('writing','speaking') then q:='[]';end if;
  audio:=nullif(r->>'audio_sha256','');script:=nullif(r#>>'{review_record,script_sha256}','');
 elsif p_type='ielts_reading_set' then
  if r is null then select to_jsonb(t) into r from public.ielts_reading_sets t where id::text=p_id;end if;
  skill:='reading';primary_text:=r->>'passage_text';
  select coalesce(jsonb_agg(private.ielts_originality_json(jsonb_build_object('prompt',body,'options',options,'answers',private.ielts_originality_answers(correct_answer))) order by private.ielts_originality_normalize(body)),'[]') into q from public.ielts_reading_questions where set_id::text=p_id;
  select coalesce(jsonb_agg(jsonb_build_object('prompt',body,'options',options,'answers',correct_answer,'order',to_jsonb(t)->'question_order','type',to_jsonb(t)->'question_type','explanation',to_jsonb(t)->'explanation') order by coalesce((to_jsonb(t)->>'question_order')::int,0),body),'[]') into raw_q from public.ielts_reading_questions t where set_id::text=p_id;
 elsif p_type='ielts_listening_set' then
  if r is null then select to_jsonb(t) into r from public.ielts_listening_sets t where id::text=p_id;end if;
  skill:='listening';select transcript into primary_text from private.ielts_material_transcripts where material_id=p_id;
  -- URL identity is only a reuse signal, not a verified recording-content hash.
  audio:=nullif(split_part(split_part(trim(coalesce(r->>'audio_url','')),'?',1),'#',1),'');
  select coalesce(jsonb_agg(private.ielts_originality_json(jsonb_build_object('prompt',body,'options',options,'answers',private.ielts_originality_answers(correct_answer))) order by private.ielts_originality_normalize(body)),'[]') into q from public.ielts_listening_questions where set_id::text=p_id;
  select coalesce(jsonb_agg(jsonb_build_object('prompt',body,'options',options,'answers',correct_answer,'order',to_jsonb(t)->'question_order','type',to_jsonb(t)->'question_type','explanation',to_jsonb(t)->'explanation') order by coalesce((to_jsonb(t)->>'question_order')::int,0),body),'[]') into raw_q from public.ielts_listening_questions t where set_id::text=p_id;
 elsif p_type='ielts_writing_task' then
  if r is null then select to_jsonb(t) into r from public.ielts_writing_tasks t where id::text=p_id;end if;
  skill:='writing';primary_text:=r->>'prompt';
 elsif p_type='ielts_speaking_task' then
  if r is null then select to_jsonb(t) into r from public.ielts_speaking_tasks t where id::text=p_id;end if;
  skill:='speaking';primary_text:=r->>'prompt';raw_q:=r->'follow_ups';q:=private.ielts_originality_json(coalesce(r->'follow_ups','{}'));
 else raise exception 'invalid_material_type';end if;
 if r is null then raise exception 'material_not_found';end if;
 if skill in ('reading','listening') then select coalesce(jsonb_agg(value order by value::text),'[]') into q from jsonb_array_elements(q);end if;
 source_text:=primary_text;primary_text:=private.ielts_originality_normalize(primary_text);
 core:=jsonb_build_object('primary',primary_text,'questions',q,'audio',audio,'script',script,'scaffold',private.ielts_originality_normalize(r#>>'{content,scaffold}'),'instructions',private.ielts_originality_normalize(r->>'instructions'),'response_type',private.ielts_originality_normalize(coalesce(r->>'task_type',r->>'part')));
 select coalesce(array_agg(t order by t),'{}') into tokens from (select distinct t from regexp_split_to_table(primary_text||' '||private.ielts_originality_normalize(q::text),' ') t where length(t)>2 and t not in ('the','and','for','that','with','this','you','your','are','was','were','from','have','has','not','null','prompt','answers','options')) x;
 return jsonb_build_object('skill',skill,'complete',case when skill in ('writing','speaking') then length(primary_text)>0 when skill='reading' then length(primary_text)>0 and q<>'[]'::jsonb else audio is not null and q<>'[]'::jsonb end,'content_hash',private.ielts_originality_hash(jsonb_build_object('primary',source_text,'questions',raw_q,'audio',audio,'script',script,'instructions',r->'instructions','content',r->'content','sample_answer',r->'sample_answer','response_type',coalesce(r->'task_type',r->'part'))::text),'fingerprint_hash',private.ielts_originality_hash(core::text),
 'primary_hash',case when length(primary_text)>0 then private.ielts_originality_hash(primary_text) end,
 'questions_hash',case when q not in ('[]'::jsonb,'{}'::jsonb,'null'::jsonb) then private.ielts_originality_hash(q::text) end,
 'audio_key',audio,'script_key',script,'tokens',to_jsonb(tokens),'snapshot',jsonb_build_object('passage_or_prompt',source_text,'questions',raw_q,'recording_reference',audio,'audio_preview_url',case when p_type='ielts_listening_set' then r->>'audio_url' end),'primary_present',length(primary_text)>0);
end;$$;

create table private.ielts_material_transcripts(material_id text primary key,transcript text not null);
alter table private.ielts_material_transcripts enable row level security;
revoke all on private.ielts_material_transcripts from public,anon,authenticated,service_role;
-- Private review metadata is projected as a short label, never as answers or private catalogue content.
alter table public.ielts_reading_sets add column originality_label text;
alter table public.ielts_listening_sets add column originality_label text;
alter table public.ielts_writing_tasks add column originality_label text;
alter table public.ielts_speaking_tasks add column originality_label text;

-- Cold path only: material edits, originality review and publication. No answer-save/score hooks.
create function private.ielts_originality_lock(p_skill text) returns void language sql volatile set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('ielts-originality:'||p_skill,0));
$$;
create function private.ielts_originality_store(p_type text,p_id text,p_legacy boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare p jsonb; duplicate text;
begin
 p:=private.ielts_originality_payload(p_type,p_id);perform private.ielts_originality_lock(p->>'skill');
 if exists(select 1 from private.ielts_material_fingerprints where material_type=p_type and material_id=p_id and content_hash=p->>'content_hash') then return;end if;
 if not p_legacy and (p->>'complete')::boolean then
 select private.ielts_material_code(material_type,material_id) into duplicate from private.ielts_material_fingerprints where complete and skill=p->>'skill' and fingerprint_hash=p->>'fingerprint_hash' and (material_type,material_id)<>(p_type,p_id) order by material_type,material_id limit 1;
 if duplicate is not null then raise exception using errcode='23505',message='This is an exact copy of '||duplicate||'. Reuse that material or change the task content; a new title or code is not a new task.'; end if;
 end if;
 insert into private.ielts_material_fingerprints as f(material_type,material_id,skill,content_hash,fingerprint_hash,complete,primary_hash,questions_hash,audio_key,script_key,tokens,snapshot,legacy_hash)
 values(p_type,p_id,p->>'skill',p->>'content_hash',p->>'fingerprint_hash',(p->>'complete')::boolean,p->>'primary_hash',p->>'questions_hash',p->>'audio_key',p->>'script_key',array(select jsonb_array_elements_text(p->'tokens')),p->'snapshot',case when p_legacy then p->>'content_hash' end)
 on conflict(material_type,material_id,content_hash) do nothing;
end;$$;

-- Similarity threshold is an internal editorial flag. It is not proof of novelty/comparability.
create function private.ielts_originality_matches(p_type text,p_id text,p_payload jsonb default null) returns jsonb
language sql volatile security definer set search_path='' as $$
 with recursive p as(select coalesce(p_payload,private.ielts_originality_payload(p_type,p_id)) d),
 -- A reviewed descendant is intentional reuse of this exact parent, not a new originality challenge to its original.
 descendants(material_type,material_id,content_hash) as(
 select r.material_type,r.material_id,r.content_hash from private.ielts_material_originality_reviews r cross join p
 where r.decision='variant' and r.parent_type=p_type and r.parent_id=p_id and r.parent_hash=p.d->>'content_hash'
 union
 select r.material_type,r.material_id,r.content_hash from private.ielts_material_originality_reviews r join descendants d
 on r.parent_type=d.material_type and r.parent_id=d.material_id and r.parent_hash=d.content_hash where r.decision='variant'),
 matches as(select f.material_type,f.material_id,f.content_hash,private.ielts_material_code(f.material_type,f.material_id) display_code,
 case when f.complete and (p.d->>'complete')::boolean and f.fingerprint_hash=p.d->>'fingerprint_hash' then 'exact_copy'
 when f.primary_hash is not null and f.primary_hash=p.d->>'primary_hash' then 'shared_text'
 when f.questions_hash is not null and f.questions_hash=p.d->>'questions_hash' then 'shared_questions'
 when f.audio_key is not null and f.audio_key=p.d->>'audio_key' then 'shared_recording'
 when f.script_key is not null and f.script_key=p.d->>'script_key' then 'shared_script'
 else 'similar_content' end reason,
 (select 2.0*count(*)/greatest(1,cardinality(f.tokens)+jsonb_array_length(p.d->'tokens')) from unnest(f.tokens) t where t in (select jsonb_array_elements_text(p.d->'tokens'))) similarity
 from private.ielts_material_fingerprints f cross join p where f.complete and f.skill=p.d->>'skill' and (f.material_type,f.material_id)<>(p_type,p_id) and not exists(select 1 from descendants d where d.material_type=f.material_type and d.material_id=f.material_id)),
 flagged as(select * from matches where reason<>'similar_content' or similarity>=0.72)
 select coalesce(jsonb_agg(to_jsonb(flagged) order by material_type,material_id,content_hash),'[]') from flagged;
$$;
create function private.ielts_originality_label(p_type text,p_id text,p_payload jsonb default null) returns text
language plpgsql volatile security definer set search_path='' as $$
declare p jsonb;m jsonb;review private.ielts_material_originality_reviews%rowtype;
begin
 if p_type not in ('targeted','ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then return null;end if;
 begin p:=coalesce(p_payload,private.ielts_originality_payload(p_type,p_id));exception when raise_exception then if sqlerrm='material_not_found' then return null;else raise;end if;end;
 m:=private.ielts_originality_matches(p_type,p_id,p);
 select * into review from private.ielts_material_originality_reviews where material_type=p_type and material_id=p_id and content_hash=p->>'content_hash' and match_hash=private.ielts_originality_hash(m::text) order by reviewed_at desc,id desc limit 1;
 if review.id is null then
 if exists(select 1 from private.ielts_material_fingerprints where material_type=p_type and material_id=p_id and legacy_hash=p->>'content_hash') then return 'Existing material';end if;
 return null;end if;
 return case when review.decision='variant' then 'Variant of '||private.ielts_material_code(review.parent_type,review.parent_id)||' · repeat practice' else 'Originality reviewed' end;
end;$$;
create function private.require_ielts_originality(p_type text,p_id text,p_payload jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare p jsonb:=coalesce(p_payload,private.ielts_originality_payload(p_type,p_id));m jsonb;
begin
 perform private.ielts_originality_lock(p->>'skill');
 if exists(select 1 from private.ielts_material_fingerprints where material_type=p_type and material_id=p_id and legacy_hash=p->>'content_hash') then return;end if;
 m:=private.ielts_originality_matches(p_type,p_id,p);
 if exists(select 1 from jsonb_array_elements(m) x where x->>'reason'='exact_copy') then raise exception 'Exact copy: reuse the existing task instead of publishing another code.';end if;
 if private.ielts_originality_label(p_type,p_id,p) is null then raise exception 'Originality review required. Save as a draft, compare the matching materials and ask a content administrator to review it.';end if;
end;$$;

create function private.ielts_originality_source_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb;
begin
 if auth.uid() is not null then perform private.ielts_originality_authorize(tg_argv[0]);end if;
 p:=private.ielts_originality_payload(tg_argv[0],new.id::text,to_jsonb(new));perform private.ielts_originality_lock(p->>'skill');
 if coalesce(new.is_active,false) then perform private.require_ielts_originality(tg_argv[0],new.id::text,p);end if;
 new.originality_label:=private.ielts_originality_label(tg_argv[0],new.id::text,p);return new;
end;$$;
create function private.ielts_originality_source_capture() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.ielts_originality_store(tg_argv[0],case when tg_argv[0]='targeted' then to_jsonb(new)->>'code' else to_jsonb(new)->>'id' end);return new;end;$$;
create function private.ielts_originality_questions_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare material_key text; old_key text; active boolean;
begin
 if auth.uid() is not null then perform private.ielts_originality_authorize(tg_argv[0]);end if;
 material_key:=case when tg_op='DELETE' then old.set_id::text else new.set_id::text end;
 -- Row locks prevent concurrent parent edits/publication from observing half-written questions.
 if tg_argv[0]='ielts_reading_set' then select is_active into active from public.ielts_reading_sets where id::text=material_key for update;else select is_active into active from public.ielts_listening_sets where id::text=material_key for update;end if;
 if not found then return null;end if;
 perform private.ielts_originality_store(tg_argv[0],material_key);
 if active then perform private.require_ielts_originality(tg_argv[0],material_key);end if;
 if tg_op='UPDATE' and old.set_id is distinct from new.set_id then
 old_key:=old.set_id::text;perform private.ielts_originality_store(tg_argv[0],old_key);
 if tg_argv[0]='ielts_reading_set' then select is_active into active from public.ielts_reading_sets where id::text=old_key for update;else select is_active into active from public.ielts_listening_sets where id::text=old_key for update;end if;
 if active then perform private.require_ielts_originality(tg_argv[0],old_key);end if;end if;
 return null;
end;$$;

-- Capture the current inventory without updating source rows, evidence, scores or approved reports.
do $$ declare r record;begin
 for r in select 'targeted' type,code id from private.ielts_learning_tasks union all select 'ielts_reading_set',id::text from public.ielts_reading_sets union all select 'ielts_listening_set',id::text from public.ielts_listening_sets union all select 'ielts_writing_task',id::text from public.ielts_writing_tasks union all select 'ielts_speaking_task',id::text from public.ielts_speaking_tasks loop perform private.ielts_originality_store(r.type,r.id,true);end loop;
end;$$;

-- Only existing content-administration roles may inspect/review. Targeted private content is platform-admin only.
create function private.ielts_originality_authorize(p_type text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_type not in ('targeted','ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then raise exception 'invalid_material_type';end if;
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and not coalesce(is_banned,false) and
 (role in ('superadmin','admin') or (role='school_admin' and p_type<>'targeted'))) then raise exception 'forbidden';end if;
end;$$;
create function public.rpc_ielts_material_originality_check(p_type text,p_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb;m jsonb;transcript text;display_matches jsonb;
begin
 perform private.ielts_originality_authorize(p_type);p:=private.ielts_originality_payload(p_type,p_id);
 perform private.ielts_originality_lock(p->>'skill');m:=private.ielts_originality_matches(p_type,p_id);
 select coalesce(jsonb_agg(x.value||jsonb_build_object('preview',case when x.value->>'material_type'<>'targeted' or exists(select 1 from public.users where id=auth.uid() and role in ('superadmin','admin')) then f.snapshot end) order by x.ordinal),'[]') into display_matches from jsonb_array_elements(m) with ordinality x(value,ordinal) join private.ielts_material_fingerprints f on f.material_type=x.value->>'material_type' and f.material_id=x.value->>'material_id' and f.content_hash=x.value->>'content_hash';
 if p_type='ielts_listening_set' then select t.transcript into transcript from private.ielts_material_transcripts t where material_id=p_id;end if;
 return jsonb_build_object('display_code',private.ielts_material_code(p_type,p_id),'skill',p->>'skill','content_hash',p->>'content_hash',
 'match_hash',private.ielts_originality_hash(m::text),'matches',display_matches,'preview',p->'snapshot','label',private.ielts_originality_label(p_type,p_id),'transcript',transcript);
end;$$;
create function public.rpc_ielts_material_set_transcript(p_id text,p_transcript text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.ielts_originality_authorize('ielts_listening_set');
 perform 1 from public.ielts_listening_sets where id::text=p_id for update;
 if not found then raise exception 'material_not_found';end if;
 if exists(select 1 from public.ielts_listening_sets where id::text=p_id and is_active) then raise exception 'Save this material as a draft before changing its transcript.';end if;
 perform private.ielts_originality_lock('listening');
 insert into private.ielts_material_transcripts(material_id,transcript) values(p_id,coalesce(p_transcript,'')) on conflict(material_id) do update set transcript=excluded.transcript;
 perform private.ielts_originality_store('ielts_listening_set',p_id);
end;$$;
create function public.rpc_ielts_material_originality_review(p_type text,p_id text,p_content_hash text,p_match_hash text,p_decision text,p_parent_type text,p_parent_id text,p_parent_hash text,p_rationale text,p_content_checked boolean,p_recording_checked boolean,p_publish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb;m jsonb;table_name text;parent record;task_purpose text;
begin
 perform private.ielts_originality_authorize(p_type);
 table_name:=case p_type when 'ielts_reading_set' then 'ielts_reading_sets' when 'ielts_listening_set' then 'ielts_listening_sets' when 'ielts_writing_task' then 'ielts_writing_tasks' when 'ielts_speaking_task' then 'ielts_speaking_tasks' end;
 if table_name is not null then execute format('select id from public.%I where id::text=$1 for update',table_name) using p_id;
 else perform 1 from private.ielts_learning_tasks where code=p_id for update;end if;
 p:=private.ielts_originality_payload(p_type,p_id);perform private.ielts_originality_lock(p->>'skill');m:=private.ielts_originality_matches(p_type,p_id);
 if p_content_hash is distinct from p->>'content_hash' or p_match_hash is distinct from private.ielts_originality_hash(m::text) then raise exception 'Material or comparison inventory changed. Run the originality check again.';end if;
 if exists(select 1 from jsonb_array_elements(m) x where x->>'material_type'='targeted') then perform private.ielts_originality_authorize('targeted');end if;
 if p_decision is null or p_decision not in ('fresh','variant') or p_content_checked is distinct from true or length(trim(coalesce(p_rationale,''))) not between 20 and 2000 then raise exception 'Confirm the content comparison and explain the substantive differences (20–2000 characters).';end if;
 if exists(select 1 from jsonb_array_elements(m) x where x->>'reason'='exact_copy') then raise exception 'An exact copy cannot be approved. Reuse its existing code.';end if;
 if p->>'skill'<>'listening' and not (p->>'primary_present')::boolean then raise exception 'A passage or prompt is required.';end if;
 if p->>'skill'='listening' then
 if p_recording_checked is distinct from true then raise exception 'Listen to the actual recording and compare its script before approval.';end if;
 if not (p->>'primary_present')::boolean then raise exception 'A private listening transcript is required for originality review.';end if;
 if nullif(p->>'audio_key','') is null then raise exception 'A recording is required.';end if;
 end if;
 if p->>'skill' in ('reading','listening') and nullif(p->>'questions_hash','') is null then raise exception 'Questions are required.';end if;
 if p_decision='fresh' then
 if p_parent_type is not null or p_parent_id is not null or p_parent_hash is not null then raise exception 'A fresh task must not have a variant parent.';end if;
 if exists(select 1 from jsonb_array_elements(m) x where x->>'reason' in ('shared_text','shared_questions','shared_recording','shared_script')) then raise exception 'Shared material must be declared as a variant and used for repeat practice.';end if;
 else
 if not exists(select 1 from jsonb_array_elements(m) x where x->>'material_type'=p_parent_type and x->>'material_id'=p_parent_id and x->>'content_hash'=p_parent_hash) then raise exception 'Choose a matching parent material and its exact version.';end if;
 if not exists(select 1 from private.ielts_material_fingerprints parent_version join private.ielts_material_fingerprints variant_version on variant_version.material_type=p_type and variant_version.material_id=p_id and variant_version.content_hash=p->>'content_hash'
 where parent_version.material_type=p_parent_type and parent_version.material_id=p_parent_id and parent_version.content_hash=p_parent_hash and parent_version.recorded_at<=variant_version.recorded_at) then raise exception 'The original content version must be recorded before its variant. Do not re-label an earlier original as a variant of later material.';end if;
 if p_type='targeted' then select purpose into task_purpose from private.ielts_learning_tasks where code=p_id;if task_purpose='independent_check' then raise exception 'A variant must be guided repeat practice, never an independent check.';end if;end if;
 end if;
 -- Append-only audit: no administrator can overwrite an earlier decision through the Data API.
 insert into private.ielts_material_originality_reviews(material_type,material_id,content_hash,match_hash,decision,parent_type,parent_id,parent_hash,rationale,content_checked,recording_checked,reviewed_by)
 values(p_type,p_id,p->>'content_hash',private.ielts_originality_hash(m::text),p_decision,p_parent_type,p_parent_id,p_parent_hash,trim(p_rationale),true,coalesce(p_recording_checked,false),auth.uid());
 perform private.ielts_originality_store(p_type,p_id);
 if coalesce(p_publish,false) then
 if table_name is null then raise exception 'Targeted tasks still require the separate school content approval and pilot allocation gates.';end if;
 execute format('update public.%I set is_active=true where id::text=$1',table_name) using p_id;
 end if;
 return public.rpc_ielts_material_originality_check(p_type,p_id);
end;$$;

create function private.ielts_originality_targeted_gate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ielts_originality('targeted',new.task_code);
 if tg_table_name='ielts_learning_allocations' and exists(select 1 from private.ielts_learning_tasks where code=new.task_code and purpose='independent_check') then
 if exists(
 with recursive edges as(select material_type,material_id,parent_type,parent_id from private.ielts_material_originality_reviews where decision='variant'),
 family(material_type,material_id) as(
 select 'targeted'::text,new.task_code
 union
 select case when e.material_type=f.material_type and e.material_id=f.material_id then e.parent_type else e.material_type end,
 case when e.material_type=f.material_type and e.material_id=f.material_id then e.parent_id else e.material_id end
 from family f join edges e on (e.material_type=f.material_type and e.material_id=f.material_id) or (e.parent_type=f.material_type and e.parent_id=f.material_id)),
 exposure as(
 select 'targeted'::text material_type,a.task_code material_id from private.ielts_learning_allocations a where a.student_id=new.student_id
 union all select 'ielts_reading_set',a.set_id::text from public.ielts_reading_attempts a where a.user_id=new.student_id
 union all select 'ielts_listening_set',a.set_id::text from public.ielts_listening_attempts a where a.user_id=new.student_id
 union all select 'ielts_writing_task',a.task_id::text from public.ielts_writing_attempts a where a.user_id=new.student_id
 union all select 'ielts_speaking_task',a.task_id::text from public.ielts_speaking_attempts a where a.user_id=new.student_id
 union all select i.content_type,i.content_id from public.ielts_practice_assignment_items i join public.ielts_practice_assignment_students a on a.assignment_id=i.assignment_id where a.student_id=new.student_id)
 select 1 from exposure e join family f using(material_type,material_id)) then raise exception 'This student has already been exposed to this material or its variant family. Choose a genuinely unseen independent check.';end if;
 end if;
 if tg_table_name='ielts_learning_allocations' and exists(select 1 from private.ielts_learning_tasks where code=new.task_code and purpose='independent_check') and private.ielts_originality_label('targeted',new.task_code) like 'Variant of %' then raise exception 'Variants cannot be independent checks.';end if;
 return new;
end;$$;
create trigger originality_before_targeted_allocation before insert on private.ielts_learning_allocations for each row execute function private.ielts_originality_targeted_gate();
create trigger originality_before_targeted_approval before insert on private.ielts_learning_content_reviews for each row execute function private.ielts_originality_targeted_gate();
create trigger preserve_originality_reviews before update or delete on private.ielts_material_originality_reviews for each row execute function private.ielts_learning_immutable();
create trigger preserve_originality_inventory before update or delete on private.ielts_material_fingerprints for each row execute function private.ielts_learning_immutable();

do $$declare r record;begin
 for r in select * from (values('ielts_reading_sets','ielts_reading_set'),('ielts_listening_sets','ielts_listening_set'),('ielts_writing_tasks','ielts_writing_task'),('ielts_speaking_tasks','ielts_speaking_task')) t(table_name,material_type) loop
 execute format('create trigger originality_guard before insert or update on public.%I for each row execute function private.ielts_originality_source_guard(%L)',r.table_name,r.material_type);
 execute format('create trigger originality_capture after insert or update on public.%I for each row execute function private.ielts_originality_source_capture(%L)',r.table_name,r.material_type);
 end loop;
 for r in select * from (values('ielts_reading_questions','ielts_reading_set'),('ielts_listening_questions','ielts_listening_set')) t(table_name,material_type) loop
 execute format('create constraint trigger originality_questions after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.ielts_originality_questions_guard(%L)',r.table_name,r.material_type);
 end loop;
end;$$;
create trigger originality_capture after insert on private.ielts_learning_tasks for each row execute function private.ielts_originality_source_capture('targeted');

-- Deny all direct helper execution, including roles that ordinarily receive default function grants.
do $$declare r record;begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and (proname like 'ielts_originality_%' or proname='require_ielts_originality') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);end loop;
end;$$;
revoke all on function public.rpc_ielts_material_originality_check(text,text) from public,anon,service_role;
revoke all on function public.rpc_ielts_material_set_transcript(text,text) from public,anon,service_role;
revoke all on function public.rpc_ielts_material_originality_review(text,text,text,text,text,text,text,text,text,boolean,boolean,boolean) from public,anon,service_role;
grant execute on function public.rpc_ielts_material_originality_check(text,text),public.rpc_ielts_material_set_transcript(text,text),public.rpc_ielts_material_originality_review(text,text,text,text,text,text,text,text,text,boolean,boolean,boolean) to authenticated;

create function public.rpc_ielts_material_originality_queue() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'forbidden';end if;
 if not exists(select 1 from public.users where id=auth.uid() and role in ('superadmin','admin') and not coalesce(is_banned,false)) then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('type','targeted','id',code,'title',title,'display_code',private.ielts_material_code('targeted',code)) order by code),'[]') from private.ielts_learning_tasks where private.ielts_originality_label('targeted',code) is null);
end;$$;
revoke all on function public.rpc_ielts_material_originality_queue() from public,anon,service_role;
grant execute on function public.rpc_ielts_material_originality_queue() to authenticated;

-- New school allocations must use the current approved content. Existing answer saves are unaffected.
create function private.ielts_originality_school_allocation_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;begin
 if tg_table_name='ielts_practice_assignment_items' then
 if new.content_type in ('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then perform private.require_ielts_originality(new.content_type,new.content_id);end if;
 else
 for r in select content_type,content_id from public.ielts_practice_assignment_items where assignment_id=new.assignment_id and content_type in ('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') order by content_type,content_id loop perform private.require_ielts_originality(r.content_type,r.content_id);end loop;
 end if;return new;
end;$$;
revoke all on function private.ielts_originality_school_allocation_gate() from public,anon,authenticated,service_role;
create trigger originality_before_school_item before insert or update of content_type,content_id on public.ielts_practice_assignment_items for each row execute function private.ielts_originality_school_allocation_gate();
create trigger originality_before_school_recipient before insert on public.ielts_practice_assignment_students for each row execute function private.ielts_originality_school_allocation_gate();
