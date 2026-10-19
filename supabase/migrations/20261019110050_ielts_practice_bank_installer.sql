-- Installs a practice-bank batch document (schema bh-ielts-practice-bank/1) as unavailable drafts with proposed
-- construct mappings in one pending practice_content batch (Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A).
-- Idempotent per batch name. Not callable by clients; used only from migrations.
create or replace function private.ielts_install_practice_bank(p_bank jsonb) returns uuid
language plpgsql security definer set search_path to '' as $$
declare bid uuid; mid bigint; r jsonb; x jsonb; t jsonb; s jsonb; i int; expected int; desc_text text;
begin
 if p_bank->>'schema' <> 'bh-ielts-practice-bank/1' or coalesce(p_bank->>'status','') !~* 'pending' then raise exception 'invalid_bank'; end if;
 select id into bid from private.ielts_content_review_batches where title like (p_bank->>'batch') || ':%';
 if bid is not null then return bid; end if;
 insert into private.ielts_content_review_batches(kind, title, proposed_by, proposal_basis)
 values ('practice_content',
   (p_bank->>'batch') || ': ' || jsonb_array_length(p_bank->'reading') || ' Reading sets, ' || jsonb_array_length(p_bank->'writing') || ' Writing Task 2 prompts, ' || jsonb_array_length(p_bank->'speaking') || ' Speaking tasks',
   p_bank->>'authorship',
   'Automated gates passed: scripts/ielts/practice-bank-contract.mjs (structure, keys, evidence in passage, constructs). Originality is compared on review. Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A.')
 returning id into bid;
 desc_text := 'Practice reading set; not a full IELTS paper' || E'\n\n' || 'Fictional case study for practice.' || E'\n\n' ||
   'Answer every question using only the passage. For True/False/Not Given: True agrees, False contradicts, Not Given is not established. For gaps use ONE WORD AND/OR A NUMBER from the passage.';
 for r in select value from jsonb_array_elements(p_bank->'reading') loop
  insert into public.ielts_reading_sets(slug, title, description, level, duration_minutes, passage_text, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (r->>'key'), r->>'title', desc_text, r->>'level', 20, r->>'passage', false, 'free') returning id into mid;
  i := 0; expected := 0;
  for x in select value from jsonb_array_elements(r->'questions') loop
   i := i + 1;
   insert into public.ielts_reading_questions(set_id, question_order, question_type, body, options, correct_answer, explanation)
   values (mid, i, x->>'type', x->>'q', case when jsonb_typeof(x->'options') = 'array' then x->'options' end, x->'key', x->>'evidence');
   insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
   select bid, 'ielts_reading_set', mid::text, i::text, n.id, 'primary', 'Proposed from the ' || (x->>'type') || ' question and its evidence.'
   from public.academic_skill_registry_nodes n where n.code = x->>'construct';
   expected := expected + 1;
   if coalesce(x->>'supporting','') <> '' then
    insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
    select bid, 'ielts_reading_set', mid::text, i::text, n.id, 'supporting', 'Supporting construct for the same item.'
    from public.academic_skill_registry_nodes n where n.code = x->>'supporting';
    expected := expected + 1;
   end if;
  end loop;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_reading_set' and material_id = mid::text) <> expected
  then raise exception 'unresolved construct in %', r->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_reading_set', mid::text, r->>'key');
 end loop;
 for t in select value from jsonb_array_elements(p_bank->'writing') loop
  insert into public.ielts_writing_tasks(slug, task_type, title, prompt, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (t->>'key'), 'task2', t->>'title', t->>'prompt', false, 'free') returning id into mid;
  insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
  select bid, 'ielts_writing_task', mid::text, null, n.id, c->>1, c->>2
  from jsonb_array_elements(t->'constructs') c join public.academic_skill_registry_nodes n on n.code = c->>0;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_writing_task' and material_id = mid::text) <> jsonb_array_length(t->'constructs')
  then raise exception 'unresolved construct in %', t->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_writing_task', mid::text, t->>'key');
 end loop;
 for s in select value from jsonb_array_elements(p_bank->'speaking') loop
  insert into public.ielts_speaking_tasks(slug, part, prompt, follow_ups, is_active, required_tier)
  values ((p_bank->>'batch') || '-' || (s->>'key'), (s->>'part')::int, s->>'prompt',
          jsonb_build_object('questions', s->'follow_ups', 'prep_time', s->'prep', 'speaking_time', s->'turn'), false, 'free') returning id into mid;
  insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
  select bid, 'ielts_speaking_task', mid::text, null, n.id, c->>1, c->>2
  from jsonb_array_elements(s->'constructs') c join public.academic_skill_registry_nodes n on n.code = c->>0;
  if (select count(*) from private.ielts_material_construct_maps where batch_id = bid and material_type = 'ielts_speaking_task' and material_id = mid::text) <> jsonb_array_length(s->'constructs')
  then raise exception 'unresolved construct in %', s->>'key'; end if;
  insert into private.ielts_content_batch_items(batch_id, material_type, material_id, item_key) values (bid, 'ielts_speaking_task', mid::text, s->>'key');
 end loop;
 return bid;
end $$;
revoke all on function private.ielts_install_practice_bank(jsonb) from public, anon, authenticated, service_role;
