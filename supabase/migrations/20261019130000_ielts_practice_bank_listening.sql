-- Listening in practice-bank batches (Diagnostic Bible 2.0.0 sections 6.1, 15E.2 and 15E.2A).
-- AI-drafted Listening sets are installed as unavailable drafts with their stored recording, private transcript and
-- proposed construct mappings. A batch can only approve a Listening set when the deciding administrator has
-- personally played that exact recording through to the end in the review screen; every Listening set is checked
-- individually (it must be in the sample). AI cannot record a listening check: the RPC requires a signed-in
-- platform content administrator, and the originality review records recording_checked only from that check.

create table if not exists private.ielts_listening_recordings (
 material_id text primary key,
 audio_url text not null check (audio_url ~ '^https://[^/]+/storage/v1/object/public/ielts-audio/'),
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 bytes integer not null check (bytes > 0),
 duration_seconds numeric not null check (duration_seconds > 0),
 production jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table private.ielts_listening_recordings enable row level security;

create table if not exists private.ielts_content_listen_checks (
 batch_id uuid not null references private.ielts_content_review_batches(id),
 material_id text not null,
 audio_url text not null,
 reviewer_id uuid not null,
 played_seconds numeric not null,
 checked_at timestamptz not null default now(),
 primary key (batch_id, material_id, reviewer_id, audio_url)
);
alter table private.ielts_content_listen_checks enable row level security;

create or replace function private.ielts_install_practice_bank(p_bank jsonb) returns uuid
language plpgsql security definer set search_path to '' as $$
declare bid uuid; mid bigint; r jsonb; x jsonb; t jsonb; s jsonb; l jsonb; i int; expected int; desc_text text; title_parts text[] := '{}'; n int;
begin
 if p_bank->>'schema' <> 'bh-ielts-practice-bank/1' or coalesce(p_bank->>'status','') !~* 'pending' then raise exception 'invalid_bank'; end if;
 select id into bid from private.ielts_content_review_batches where title like (p_bank->>'batch') || ':%';
 if bid is not null then return bid; end if;
 n := coalesce(jsonb_array_length(p_bank->'reading'), 0); if n > 0 then title_parts := title_parts || (n || ' Reading sets'); end if;
 n := coalesce(jsonb_array_length(p_bank->'listening'), 0); if n > 0 then title_parts := title_parts || (n || ' Listening sets with recordings'); end if;
 n := coalesce(jsonb_array_length(p_bank->'writing'), 0); if n > 0 then title_parts := title_parts || (n || ' Writing Task 2 prompts'); end if;
 n := coalesce(jsonb_array_length(p_bank->'speaking'), 0); if n > 0 then title_parts := title_parts || (n || ' Speaking tasks'); end if;
 insert into private.ielts_content_review_batches(kind, title, proposed_by, proposal_basis)
 values ('practice_content', (p_bank->>'batch') || ': ' || array_to_string(title_parts, ', '), p_bank->>'authorship',
   'Automated gates passed: scripts/ielts/practice-bank-contract.mjs (structure, keys, evidence in passage or transcript, constructs, stored recording). Originality is compared on review. Listening sets need the reviewer to play each recording in full. Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A.')
 returning id into bid;
 desc_text := 'Practice reading set; not a full IELTS paper' || E'\n\n' || 'Fictional case study for practice.' || E'\n\n' ||
   'Answer every question using only the passage. For True/False/Not Given: True agrees, False contradicts, Not Given is not established. For gaps use ONE WORD AND/OR A NUMBER from the passage.';
 for r in select value from jsonb_array_elements(coalesce(p_bank->'reading', '[]')) loop
  insert into public.ielts_reading_sets(slug, title, description, level, duration_minutes, passage_text, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (r->>'key'), r->>'title', desc_text, r->>'level', 20, r->>'passage', false, 'free') returning id into mid;
  i := 0; expected := 0;
  for x in select value from jsonb_array_elements(r->'questions') loop
   i := i + 1;
   insert into public.ielts_reading_questions(set_id, question_order, question_type, body, options, correct_answer, explanation)
   values (mid, i, x->>'type', x->>'q', case when jsonb_typeof(x->'options') = 'array' then x->'options' end, x->'key', x->>'evidence');
   insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
   select bid, 'ielts_reading_set', mid::text, i::text, nd.id, 'primary', 'Proposed from the ' || (x->>'type') || ' question and its evidence.'
   from public.academic_skill_registry_nodes nd where nd.code = x->>'construct';
   expected := expected + 1;
   if coalesce(x->>'supporting','') <> '' then
    insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
    select bid, 'ielts_reading_set', mid::text, i::text, nd.id, 'supporting', 'Supporting construct for the same item.'
    from public.academic_skill_registry_nodes nd where nd.code = x->>'supporting';
    expected := expected + 1;
   end if;
  end loop;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_reading_set' and material_id = mid::text) <> expected
  then raise exception 'unresolved construct in %', r->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_reading_set', mid::text, r->>'key');
 end loop;
 for l in select value from jsonb_array_elements(coalesce(p_bank->'listening', '[]')) loop
  if coalesce(l#>>'{recording,url}','') !~ '^https://[^/]+/storage/v1/object/public/ielts-audio/' or coalesce(l#>>'{recording,human_listening}','') <> 'pending'
  then raise exception 'invalid recording in %', l->>'key'; end if;
  insert into public.ielts_listening_sets(slug, title, description, level, duration_minutes, audio_url, is_active, required_tier, instructions, section_label, question_range_label)
  values ((p_bank->>'batch') || '-' || (l->>'key'), l->>'title',
          'Practice listening set; not a full IELTS paper' || E'\n\n' || (l->>'intro') || E'\n\n' || 'Play the recording once without pausing. It includes 30 seconds to read the questions first and 15 seconds to check at the end.',
          l->>'level', greatest(3, ceil((l#>>'{recording,duration_seconds}')::numeric / 60)::int), l#>>'{recording,url}', false, 'free',
          l->>'instructions', 'Part ' || (l->>'part'), 'Questions 1–' || jsonb_array_length(l->'questions')) returning id into mid;
  insert into private.ielts_material_transcripts(material_id, transcript)
  values (mid::text, (select string_agg(value #>> '{}', E'\n' order by ord) from jsonb_array_elements(l->'lines') with ordinality as e(value, ord)));
  insert into private.ielts_listening_recordings(material_id, audio_url, sha256, bytes, duration_seconds, production)
  values (mid::text, l#>>'{recording,url}', l#>>'{recording,sha256}', (l#>>'{recording,bytes}')::int, (l#>>'{recording,duration_seconds}')::numeric,
          (l->'recording') - 'url' - 'sha256' - 'bytes' - 'duration_seconds' || jsonb_build_object('voices', l->'voices'));
  i := 0; expected := 0;
  for x in select value from jsonb_array_elements(l->'questions') loop
   i := i + 1;
   insert into public.ielts_listening_questions(set_id, question_order, question_type, body, options, correct_answer, explanation)
   values (mid, i, x->>'type', x->>'q', case when jsonb_typeof(x->'options') = 'array' then x->'options' end,
           case when jsonb_typeof(x->'key') = 'array' then x->'key' else jsonb_build_array(x->'key') end, 'You hear: "' || (x->>'evidence') || '"');
   insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
   select bid, 'ielts_listening_set', mid::text, i::text, nd.id, 'primary', 'Proposed from the ' || (x->>'type') || ' question and the transcript evidence.'
   from public.academic_skill_registry_nodes nd where nd.code = x->>'construct';
   expected := expected + 1;
   if coalesce(x->>'supporting','') <> '' then
    insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
    select bid, 'ielts_listening_set', mid::text, i::text, nd.id, 'supporting', 'Supporting construct for the same item.'
    from public.academic_skill_registry_nodes nd where nd.code = x->>'supporting';
    expected := expected + 1;
   end if;
  end loop;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_listening_set' and material_id = mid::text) <> expected
  then raise exception 'unresolved construct in %', l->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_listening_set', mid::text, l->>'key');
 end loop;
 for t in select value from jsonb_array_elements(coalesce(p_bank->'writing', '[]')) loop
  insert into public.ielts_writing_tasks(slug, task_type, title, prompt, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (t->>'key'), 'task2', t->>'title', t->>'prompt', false, 'free') returning id into mid;
  insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
  select bid, 'ielts_writing_task', mid::text, null, nd.id, c->>1, c->>2
  from jsonb_array_elements(t->'constructs') c join public.academic_skill_registry_nodes nd on nd.code = c->>0;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_writing_task' and material_id = mid::text) <> jsonb_array_length(t->'constructs')
  then raise exception 'unresolved construct in %', t->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_writing_task', mid::text, t->>'key');
 end loop;
 for s in select value from jsonb_array_elements(coalesce(p_bank->'speaking', '[]')) loop
  insert into public.ielts_speaking_tasks(slug, part, prompt, follow_ups, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (s->>'key'), (s->>'part')::int, s->>'prompt',
          jsonb_build_object('questions', s->'follow_ups', 'prep_time', s->'prep', 'speaking_time', s->'turn'), false, 'free') returning id into mid;
  insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
  select bid, 'ielts_speaking_task', mid::text, null, nd.id, c->>1, c->>2
  from jsonb_array_elements(s->'constructs') c join public.academic_skill_registry_nodes nd on nd.code = c->>0;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_speaking_task' and material_id = mid::text) <> jsonb_array_length(s->'constructs')
  then raise exception 'unresolved construct in %', s->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_speaking_task', mid::text, s->>'key');
 end loop;
 return bid;
end $$;
revoke all on function private.ielts_install_practice_bank(jsonb) from public, anon, authenticated, service_role;

create or replace function private.ielts_content_preview(p_type text, p_id text) returns jsonb
language sql stable security definer set search_path to '' as $$
 select case p_type
  when 'ielts_reading_set' then (select jsonb_build_object('title', s.title, 'level', s.level, 'passage', s.passage_text,
     'questions', (select jsonb_agg(jsonb_build_object('n', q.question_order, 'question', q.body, 'options', q.options, 'answer', q.correct_answer, 'evidence', q.explanation) order by q.question_order)
                   from public.ielts_reading_questions q where q.set_id = s.id)) from public.ielts_reading_sets s where s.id::text = p_id)
  when 'ielts_listening_set' then (select jsonb_build_object('title', s.title, 'level', s.level, 'part', nullif(regexp_replace(coalesce(s.section_label,''),'\D','','g'),'')::int,
     'instructions', s.instructions, 'audio_url', s.audio_url, 'duration_seconds', r.duration_seconds,
     'recording_matches', r.audio_url is not distinct from s.audio_url,
     'transcript', (select t.transcript from private.ielts_material_transcripts t where t.material_id = p_id),
     'questions', (select jsonb_agg(jsonb_build_object('n', q.question_order, 'question', q.body, 'options', q.options, 'answer', q.correct_answer, 'evidence', q.explanation) order by q.question_order)
                   from public.ielts_listening_questions q where q.set_id = s.id))
     from public.ielts_listening_sets s left join private.ielts_listening_recordings r on r.material_id = s.id::text where s.id::text = p_id)
  when 'ielts_writing_task' then (select jsonb_build_object('title', t.title, 'task_type', t.task_type, 'prompt', t.prompt) from public.ielts_writing_tasks t where t.id::text = p_id)
  when 'ielts_speaking_task' then (select jsonb_build_object('title', 'Speaking Part ' || t.part, 'part', t.part, 'prompt', t.prompt, 'follow_ups', t.follow_ups->'questions') from public.ielts_speaking_tasks t where t.id::text = p_id)
 end
$$;
revoke all on function private.ielts_content_preview(text,text) from public, anon, authenticated;

-- True when the given reviewer played the item's current recording through to the end in this batch.
create or replace function private.ielts_content_heard(p_batch uuid, p_material text, p_reviewer uuid) returns boolean
language sql stable security definer set search_path to '' as $$
 select exists(select 1 from private.ielts_content_listen_checks c
   join public.ielts_listening_sets s on s.id::text = c.material_id and s.audio_url = c.audio_url
   join private.ielts_listening_recordings r on r.material_id = c.material_id and r.audio_url = c.audio_url
   where c.batch_id = p_batch and c.material_id = p_material and c.reviewer_id = p_reviewer)
$$;
revoke all on function private.ielts_content_heard(uuid,text,uuid) from public, anon, authenticated;

create or replace function public.rpc_ielts_practice_content_listened(p_batch uuid, p_ref text, p_audio_url text, p_played_seconds numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; mat text; rec private.ielts_listening_recordings; cur text;
begin
 perform private.ielts_mapping_admin();
 if auth.uid() is null then raise exception 'forbidden'; end if;
 select * into b from private.ielts_content_review_batches where id = p_batch and kind = 'practice_content';
 if b.id is null then raise exception 'batch_not_found'; end if;
 if b.status <> 'pending' then raise exception 'batch_already_decided'; end if;
 if p_ref !~ '^ielts_listening_set:' then raise exception 'not_a_listening_item'; end if;
 mat := split_part(p_ref, ':', 2);
 if not exists(select 1 from private.ielts_content_batch_items i where i.batch_id = p_batch and i.material_type = 'ielts_listening_set' and i.material_id = mat) then raise exception 'item_outside_batch'; end if;
 select * into rec from private.ielts_listening_recordings where material_id = mat;
 select audio_url into cur from public.ielts_listening_sets where id::text = mat;
 if rec.material_id is null or cur is distinct from rec.audio_url or p_audio_url is distinct from cur then raise exception 'recording_changed'; end if;
 if p_played_seconds is null or p_played_seconds < rec.duration_seconds - 2 then raise exception 'recording_not_finished'; end if;
 insert into private.ielts_content_listen_checks(batch_id, material_id, audio_url, reviewer_id, played_seconds)
 values (p_batch, mat, cur, auth.uid(), p_played_seconds)
 on conflict (batch_id, material_id, reviewer_id, audio_url) do update set played_seconds = excluded.played_seconds, checked_at = now();
 return jsonb_build_object('ref', p_ref, 'heard', true);
end $$;
revoke all on function public.rpc_ielts_practice_content_listened(uuid,text,text,numeric) from public, anon;
grant execute on function public.rpc_ielts_practice_content_listened(uuid,text,text,numeric) to authenticated;

create or replace function public.rpc_ielts_practice_content_queue() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
 perform private.ielts_mapping_admin();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id', b.id, 'title', b.title, 'status', b.status, 'proposed_by', b.proposed_by, 'proposal_basis', b.proposal_basis,
  'created_at', b.created_at, 'decided_at', b.decided_at, 'decision_notes', b.decision_notes,
  'reviewer', (select coalesce(nullif(u.full_name,''), u.username) from public.users u where u.id = b.reviewer_id),
  'sha256', private.ielts_content_batch_sha(b.id),
  'minimum_sample', greatest(3, ceil(0.2 * (select count(*) from private.ielts_content_batch_items i where i.batch_id = b.id))::int),
  'items', (select coalesce(jsonb_agg(jsonb_build_object(
     'ref', i.material_type || ':' || i.material_id, 'material_type', i.material_type, 'material_id', i.material_id, 'item_key', i.item_key,
     'display_code', private.ielts_material_code(i.material_type, i.material_id), 'status', i.status,
     'preview', private.ielts_content_preview(i.material_type, i.material_id),
     'heard_by_me', case when i.material_type = 'ielts_listening_set' then private.ielts_content_heard(b.id, i.material_id, auth.uid()) end,
     'matches', (select coalesce(jsonb_agg(jsonb_build_object('display_code', x->>'display_code', 'reason', x->>'reason', 'similarity', x->'similarity')), '[]')
                 from jsonb_array_elements(private.ielts_originality_matches(i.material_type, i.material_id)) x),
     'constructs', (select coalesce(jsonb_agg(jsonb_build_object('item_key', m.item_key, 'role', m.role, 'name', nd.name, 'code', nd.code) order by nullif(regexp_replace(coalesce(m.item_key,''),'\D','','g'),'')::int nulls first, m.role), '[]')
                    from private.ielts_material_construct_maps m join public.academic_skill_registry_nodes nd on nd.id = m.node_id
                    where m.batch_id = b.id and m.material_type = i.material_type and m.material_id = i.material_id and m.status <> 'superseded'))
    order by i.material_type, i.item_key), '[]') from private.ielts_content_batch_items i where i.batch_id = b.id))
  order by b.created_at desc) from private.ielts_content_review_batches b where b.kind = 'practice_content'), '[]');
end $$;

create or replace function public.rpc_ielts_practice_content_decide(p_batch uuid, p_sha256 text, p_decision text, p_sample text[], p_rejected text[], p_notes text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; i record; total int; need int; p jsonb; m jsonb; approved int := 0; ref text; heard boolean;
begin
 perform private.ielts_mapping_admin();
 select * into b from private.ielts_content_review_batches where id = p_batch and kind = 'practice_content' for update;
 if b.id is null then raise exception 'batch_not_found'; end if;
 if b.status <> 'pending' then raise exception 'batch_already_decided'; end if;
 if p_sha256 is distinct from private.ielts_content_batch_sha(p_batch) then raise exception 'batch_changed'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'invalid_decision'; end if;
 if length(trim(coalesce(p_notes,''))) < 20 then raise exception 'notes_required'; end if;
 select count(*) into total from private.ielts_content_batch_items where batch_id = p_batch;
 need := greatest(3, ceil(0.2 * total)::int);
 if p_decision = 'approved' then
  if coalesce(array_length(p_sample,1),0) < least(need, total) then raise exception 'sample_too_small'; end if;
  if exists(select 1 from unnest(coalesce(p_sample,'{}') || coalesce(p_rejected,'{}')) s
            where not exists(select 1 from private.ielts_content_batch_items x where x.batch_id = p_batch and x.material_type || ':' || x.material_id = s)) then raise exception 'item_outside_batch'; end if;
  for i in select * from private.ielts_content_batch_items where batch_id = p_batch order by material_type, item_key loop
   ref := i.material_type || ':' || i.material_id;
   if ref = any(coalesce(p_rejected,'{}')) then
    update private.ielts_content_batch_items set status = 'rejected', decided_at = now() where material_type = i.material_type and material_id = i.material_id;
    update private.ielts_material_construct_maps set status = 'rejected', decided_at = now() where batch_id = p_batch and material_type = i.material_type and material_id = i.material_id and status = 'proposed';
    continue;
   end if;
   heard := false;
   if i.material_type = 'ielts_listening_set' then
    if not (ref = any(coalesce(p_sample,'{}'))) or not private.ielts_content_heard(p_batch, i.material_id, auth.uid())
    then raise exception 'recording_not_heard: %', coalesce(private.ielts_material_code(i.material_type, i.material_id), ref); end if;
    heard := true;
   end if;
   p := private.ielts_originality_payload(i.material_type, i.material_id);
   m := private.ielts_originality_matches(i.material_type, i.material_id);
   if exists(select 1 from jsonb_array_elements(m) x where x->>'reason' in ('exact_copy','shared_text','shared_questions','shared_recording','shared_script'))
   then raise exception 'item_needs_individual_review: %', coalesce(private.ielts_material_code(i.material_type, i.material_id), ref); end if;
   if jsonb_array_length(m) > 0 and not (ref = any(coalesce(p_sample,'{}'))) then raise exception 'flagged_item_not_sampled: %', coalesce(private.ielts_material_code(i.material_type, i.material_id), ref); end if;
   perform public.rpc_ielts_material_originality_review(i.material_type, i.material_id, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh', null, null, null,
     'Batch sample review ' || p_batch::text || ' (' || case when heard then 'recording played in full by the reviewer and checked against the transcript'
       when ref = any(coalesce(p_sample,'{}')) then 'sampled' else 'not sampled; automated checks passed' end || '): ' || left(trim(p_notes), 1700),
     true, heard, true);
   update private.ielts_content_batch_items set status = 'approved', decided_at = now() where material_type = i.material_type and material_id = i.material_id;
   update private.ielts_material_construct_maps set status = 'approved', decided_at = now() where batch_id = p_batch and material_type = i.material_type and material_id = i.material_id and status = 'proposed';
   approved := approved + 1;
  end loop;
 end if;
 update private.ielts_content_review_batches set status = p_decision, reviewer_id = auth.uid(), decided_at = now(),
  approved_sha256 = case when p_decision = 'approved' then p_sha256 end,
  sample = jsonb_build_object('checked', to_jsonb(coalesce(p_sample,'{}')), 'rejected', to_jsonb(coalesce(p_rejected,'{}')), 'minimum', need, 'total', total),
  decision_notes = trim(p_notes) where id = p_batch;
 return jsonb_build_object('status', p_decision, 'approved', approved, 'total', total);
end $$;

revoke all on function public.rpc_ielts_practice_content_queue() from public, anon;
grant execute on function public.rpc_ielts_practice_content_queue() to authenticated;
revoke all on function public.rpc_ielts_practice_content_decide(uuid,text,text,text[],text[],text) from public, anon;
grant execute on function public.rpc_ielts_practice_content_decide(uuid,text,text,text[],text[],text) to authenticated;
