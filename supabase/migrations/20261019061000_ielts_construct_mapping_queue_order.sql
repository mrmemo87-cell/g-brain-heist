-- Show mappings in reading order: material number, question number, main skill before supporting skills.
create or replace function public.rpc_ielts_construct_mapping_queue() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
 perform private.ielts_mapping_admin();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',b.id,'title',b.title,'status',b.status,'proposed_by',b.proposed_by,'proposal_basis',b.proposal_basis,
  'created_at',b.created_at,'decided_at',b.decided_at,'decision_notes',b.decision_notes,
  'reviewer',(select coalesce(nullif(u.full_name,''),u.username) from public.users u where u.id=b.reviewer_id),
  'sha256',private.ielts_mapping_batch_sha(b.id),
  'minimum_sample',greatest(3,ceil(0.2*(select count(*) from private.ielts_material_construct_maps m where m.batch_id=b.id and m.status<>'superseded'))::int),
  'items',(select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'material_type',m.material_type,'material_id',m.material_id,
     'display_code',coalesce(private.ielts_material_code(m.material_type,m.material_id),m.material_id),
     'title',coalesce(r.content->>'title',m.material_id),'item_key',m.item_key,
     'item_text',(select coalesce(q->>'question',q->>'prompt') from jsonb_array_elements(r.content->'questions') q where q->>'n'=m.item_key limit 1),
     'node_code',n.code,'node_name',n.name,'role',m.role,'rationale',m.rationale,'status',m.status)
     order by m.material_type, nullif(regexp_replace(m.material_id,'\D','','g'),'')::int, m.material_id, nullif(regexp_replace(coalesce(m.item_key,''),'\D','','g'),'')::int nulls first, m.role),'[]')
   from private.ielts_material_construct_maps m
   join public.academic_skill_registry_nodes n on n.id=m.node_id
   left join private.ielts_reviewed_practice r on r.material_type=m.material_type and r.material_id=m.material_id
   where m.batch_id=b.id and m.status<>'superseded')) order by b.created_at desc) from private.ielts_content_review_batches b where b.kind='construct_mapping'),'[]');
end $$;
