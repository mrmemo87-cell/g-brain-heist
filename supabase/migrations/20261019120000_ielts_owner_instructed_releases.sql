-- Owner instruction, 2026-10-19 06:57 Asia/Bishkek: "Do what you see best ... And approve and release the materials
-- that you told me about" (the three pending review queues: practice-bank-01, construct mappings for the 18 released
-- catalogue materials, and construct mappings for the 240 mock items).
-- These decisions are recorded under the owner's admin account on that explicit instruction. The sample checks were
-- carried out by Claude (AI assistant), not by the owner in person; every decision note says so. Nothing else is approved.

-- 1. Corrections found during the sample check: "What does the speaker say about each gallery/walk?" items describe
--    places, not opinions, so their main skill is paraphrase recognition, not speaker attitude.
update private.ielts_material_construct_maps m set status = 'superseded'
 from public.academic_skill_registry_nodes n
 where n.id = m.node_id and m.material_type = 'mock' and m.status = 'proposed' and n.code = 'bh-ielts-listening-v1-speaker-attitude'
  and ((m.material_id = 'IELTS-M1' and m.item_key in ('L15','L16','L17','L18','L19','L20'))
    or (m.material_id = 'IELTS-M3' and m.item_key in ('L16','L17','L18','L19','L20')));
insert into private.ielts_material_construct_maps(batch_id, material_type, material_id, item_key, node_id, role, rationale)
select b.id, 'mock', x.code, x.item, n.id, 'primary', 'Matching descriptions of places to the recording: paraphrase recognition (corrected in sample check).'
from private.ielts_content_review_batches b
cross join (values ('IELTS-M1','L15'),('IELTS-M1','L16'),('IELTS-M1','L17'),('IELTS-M1','L18'),('IELTS-M1','L19'),('IELTS-M1','L20'),
                   ('IELTS-M3','L16'),('IELTS-M3','L17'),('IELTS-M3','L18'),('IELTS-M3','L19'),('IELTS-M3','L20')) x(code,item)
join public.academic_skill_registry_nodes n on n.code = 'bh-ielts-listening-v1-paraphrase-recognition'
where b.title like 'Construct mappings: mock tests M1–M3%' and b.status = 'pending'
on conflict do nothing;

-- 2. Decisions under the owner's account.
do $decide$
declare owner uuid; b record; note text; sample uuid[]; refs text[];
begin
 select id into strict owner from public.users where role = 'admin' and username = 'Mr. Sobbi' and not coalesce(is_banned,false);
 perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated')::text, true);
 note := 'Owner instruction 2026-10-19 06:57 (Asia/Bishkek): "approve and release the materials that you told me about". Recorded under the owner''s account on that instruction. Sample check performed by Claude (AI assistant), not by the owner in person: ';

 for b in select * from private.ielts_content_review_batches where kind = 'construct_mapping' and status = 'pending' order by created_at loop
  select array_agg(id) into sample from (select id from private.ielts_material_construct_maps where batch_id = b.id and status = 'proposed'
    order by md5(id::text) limit greatest(3, ceil(0.2 * (select count(*) from private.ielts_material_construct_maps where batch_id = b.id and status = 'proposed'))::int)) s;
  perform public.rpc_ielts_construct_mapping_decide(b.id, private.ielts_mapping_batch_sha(b.id), 'approved', sample, '{}',
   note || 'sampled mappings checked against each question''s type, wording and key; mock matching items about places corrected from speaker attitude to paraphrase recognition before approval.');
 end loop;

 for b in select * from private.ielts_content_review_batches where kind = 'practice_content' and status = 'pending' order by created_at loop
  select array_agg(material_type || ':' || material_id) into refs from private.ielts_content_batch_items i
   where i.batch_id = b.id and i.item_key in ('rb01','rb04','wb03','sb04','sb08');
  perform public.rpc_ielts_practice_content_decide(b.id, private.ielts_content_batch_sha(b.id), 'approved', refs, '{}',
   note || 'Reading rb01 and rb04 read in full (every key, TRUE/FALSE/NOT GIVEN judgement and quoted evidence checked against the passage), Writing wb03 and Speaking sb04, sb08 checked for task fit and skill tags; automated contract passed for all 21; no originality flags.');
 end loop;
end $decide$;
