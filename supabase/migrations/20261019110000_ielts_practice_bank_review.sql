-- Diagnostic Bible 2.0.0 section 15E.2A: AI-drafted practice materials are installed as unavailable drafts and
-- released through a recorded batch sample review by a named content administrator. Every item passes the
-- automated originality comparison; any item with an originality flag must be in the human sample; exact or
-- shared copies cannot be batch-approved. Approval records one originality review per item (fresh, by the
-- reviewer, citing the batch) and approves the item's construct mappings.

alter table private.ielts_content_review_batches drop constraint if exists ielts_content_review_batches_kind_check;
alter table private.ielts_content_review_batches add constraint ielts_content_review_batches_kind_check check (kind in ('construct_mapping','practice_content'));

create table if not exists private.ielts_content_batch_items (
 batch_id uuid not null references private.ielts_content_review_batches(id),
 material_type text not null check (material_type in ('ielts_reading_set','ielts_writing_task','ielts_speaking_task','ielts_listening_set')),
 material_id text not null,
 item_key text not null,
 status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
 decided_at timestamptz,
 primary key (material_type, material_id)
);
alter table private.ielts_content_batch_items enable row level security;
create index if not exists ielts_content_batch_items_batch on private.ielts_content_batch_items(batch_id);

create or replace function private.ielts_content_batch_sha(p_batch uuid) returns text
language sql stable security definer set search_path to '' as $$
 select encode(sha256(convert_to(
  coalesce((select string_agg(i.material_type||'|'||i.material_id||'|'||coalesce(private.ielts_originality_payload(i.material_type,i.material_id)->>'content_hash',''), E'\n' order by i.material_type, i.material_id)
            from private.ielts_content_batch_items i where i.batch_id = p_batch), '') || E'\n#\n' ||
  coalesce(private.ielts_mapping_batch_sha(p_batch), ''), 'UTF8')), 'hex')
$$;

create or replace function private.ielts_content_preview(p_type text, p_id text) returns jsonb
language sql stable security definer set search_path to '' as $$
 select case p_type
  when 'ielts_reading_set' then (select jsonb_build_object('title', s.title, 'level', s.level, 'passage', s.passage_text,
     'questions', (select jsonb_agg(jsonb_build_object('n', q.question_order, 'question', q.body, 'options', q.options, 'answer', q.correct_answer, 'evidence', q.explanation) order by q.question_order)
                   from public.ielts_reading_questions q where q.set_id = s.id)) from public.ielts_reading_sets s where s.id::text = p_id)
  when 'ielts_writing_task' then (select jsonb_build_object('title', t.title, 'task_type', t.task_type, 'prompt', t.prompt) from public.ielts_writing_tasks t where t.id::text = p_id)
  when 'ielts_speaking_task' then (select jsonb_build_object('title', 'Speaking Part ' || t.part, 'part', t.part, 'prompt', t.prompt, 'follow_ups', t.follow_ups->'questions') from public.ielts_speaking_tasks t where t.id::text = p_id)
 end
$$;

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
     'matches', (select coalesce(jsonb_agg(jsonb_build_object('display_code', x->>'display_code', 'reason', x->>'reason', 'similarity', x->'similarity')), '[]')
                 from jsonb_array_elements(private.ielts_originality_matches(i.material_type, i.material_id)) x),
     'constructs', (select coalesce(jsonb_agg(jsonb_build_object('item_key', m.item_key, 'role', m.role, 'name', n.name, 'code', n.code) order by nullif(regexp_replace(coalesce(m.item_key,''),'\D','','g'),'')::int nulls first, m.role), '[]')
                    from private.ielts_material_construct_maps m join public.academic_skill_registry_nodes n on n.id = m.node_id
                    where m.batch_id = b.id and m.material_type = i.material_type and m.material_id = i.material_id and m.status <> 'superseded'))
    order by i.material_type, i.item_key), '[]') from private.ielts_content_batch_items i where i.batch_id = b.id))
  order by b.created_at desc) from private.ielts_content_review_batches b where b.kind = 'practice_content'), '[]');
end $$;

create or replace function public.rpc_ielts_practice_content_decide(p_batch uuid, p_sha256 text, p_decision text, p_sample text[], p_rejected text[], p_notes text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; i record; total int; need int; p jsonb; m jsonb; approved int := 0; ref text;
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
   p := private.ielts_originality_payload(i.material_type, i.material_id);
   m := private.ielts_originality_matches(i.material_type, i.material_id);
   if exists(select 1 from jsonb_array_elements(m) x where x->>'reason' in ('exact_copy','shared_text','shared_questions','shared_recording','shared_script'))
   then raise exception 'item_needs_individual_review: %', coalesce(private.ielts_material_code(i.material_type, i.material_id), ref); end if;
   if jsonb_array_length(m) > 0 and not (ref = any(coalesce(p_sample,'{}'))) then raise exception 'flagged_item_not_sampled: %', coalesce(private.ielts_material_code(i.material_type, i.material_id), ref); end if;
   perform public.rpc_ielts_material_originality_review(i.material_type, i.material_id, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh', null, null, null,
     'Batch sample review ' || p_batch::text || ' (' || case when ref = any(coalesce(p_sample,'{}')) then 'sampled' else 'not sampled; automated checks passed' end || '): ' || left(trim(p_notes), 1800),
     true, false, true);
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

-- Mapping-only decisions apply to construct-mapping batches; practice-content batches are decided with their content.
create or replace function public.rpc_ielts_construct_mapping_decide(p_batch uuid, p_sha256 text, p_decision text, p_sample uuid[], p_rejected uuid[], p_notes text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; total int; need int; approved int;
begin
 perform private.ielts_mapping_admin();
 select * into b from private.ielts_content_review_batches where id=p_batch and kind='construct_mapping' for update;
 if b.id is null then raise exception 'batch_not_found'; end if;
 if b.status<>'pending' then raise exception 'batch_already_decided'; end if;
 if p_sha256 is distinct from private.ielts_mapping_batch_sha(p_batch) then raise exception 'batch_changed'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'invalid_decision'; end if;
 if length(trim(coalesce(p_notes,'')))<10 then raise exception 'notes_required'; end if;
 select count(*) into total from private.ielts_material_construct_maps where batch_id=p_batch and status='proposed';
 need:=greatest(3,ceil(0.2*total)::int);
 if p_decision='approved' then
  if coalesce(array_length(p_sample,1),0)<least(need,total) then raise exception 'sample_too_small'; end if;
  if exists(select 1 from unnest(p_sample) s where not exists(select 1 from private.ielts_material_construct_maps m where m.id=s and m.batch_id=p_batch)) then raise exception 'sample_outside_batch'; end if;
  if exists(select 1 from unnest(coalesce(p_rejected,'{}')) s where not exists(select 1 from private.ielts_material_construct_maps m where m.id=s and m.batch_id=p_batch)) then raise exception 'rejection_outside_batch'; end if;
  update private.ielts_material_construct_maps set status=case when id=any(coalesce(p_rejected,'{}')) then 'rejected' else 'approved' end, decided_at=now()
   where batch_id=p_batch and status='proposed';
 end if;
 update private.ielts_content_review_batches set status=p_decision, reviewer_id=auth.uid(), decided_at=now(),
  approved_sha256=case when p_decision='approved' then p_sha256 end,
  sample=jsonb_build_object('checked',to_jsonb(coalesce(p_sample,'{}')),'rejected',to_jsonb(coalesce(p_rejected,'{}')),'minimum',need,'total',total),
  decision_notes=trim(p_notes) where id=p_batch;
 select count(*) into approved from private.ielts_material_construct_maps where batch_id=p_batch and status='approved';
 return jsonb_build_object('status',p_decision,'approved',approved,'total',total);
end $$;

revoke all on function private.ielts_content_batch_sha(uuid) from public, anon, authenticated;
revoke all on function private.ielts_content_preview(text,text) from public, anon, authenticated;
revoke all on function public.rpc_ielts_practice_content_queue() from public, anon;
revoke all on function public.rpc_ielts_practice_content_decide(uuid,text,text,text[],text[],text) from public, anon;
grant execute on function public.rpc_ielts_practice_content_queue() to authenticated;
grant execute on function public.rpc_ielts_practice_content_decide(uuid,text,text,text[],text[],text) to authenticated;
revoke all on function public.rpc_ielts_construct_mapping_decide(uuid,text,text,uuid[],uuid[],text) from public, anon;
grant execute on function public.rpc_ielts_construct_mapping_decide(uuid,text,text,uuid[],uuid[],text) to authenticated;
