-- Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A: practice materials carry reviewed construct mappings,
-- proposed in bulk and approved by a named human content administrator through a recorded batch sample review.
-- AI proposals are stored as 'proposed'; nothing here approves a mapping.

-- 1. IELTS-specific supplement nodes (constructs absent from the English core and IELTS Listening registries).
insert into public.academic_skill_registry_versions(code, subject_key, title, description, authority_model, status, effective_from)
values ('bh-ielts-core-v1','ielts','Brains Heist IELTS supplement constructs v1',
 'IELTS task-specific constructs used alongside bh-english-core-v1 and bh-ielts-listening-v1 (Diagnostic Bible 2.0.0 section 7.5). Owner-requested 2026-10-19.',
 'Brains Heist original; IELTS Diagnostic Bible v2.0.0','published','2026-10-19')
on conflict (code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,node_type,code,name,description,applicable_phases)
select v.id,'strand','bh-ielts-core-v1-strand','IELTS task demands','IELTS task-specific demands supplementing the core English registry.',array['lower_secondary','upper_secondary','advanced']
from public.academic_skill_registry_versions v where v.code='bh-ielts-core-v1'
on conflict (code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases)
select v.id, s.id, 'skill', x.code, x.name, x.description, array['lower_secondary','upper_secondary','advanced']
from public.academic_skill_registry_versions v
join public.academic_skill_registry_nodes s on s.code='bh-ielts-core-v1-strand'
cross join (values
 ('bh-ielts-core-v1-writing-task1','Academic Writing Task 1','Reporting visual information in Academic Writing Task 1.'),
 ('bh-ielts-core-v1-listening-format','Listening answer format','Meeting IELTS Listening answer-format demands.')) x(code,name,description)
where v.code='bh-ielts-core-v1'
on conflict (code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases)
select v.id, p.id, 'subskill', x.code, x.name, x.description, array['lower_secondary','upper_secondary','advanced']
from public.academic_skill_registry_versions v
cross join (values
 ('bh-ielts-core-v1-writing-task1','bh-ielts-core-v1-task1-overview','Task 1 overview','Write a clear overview of the main trends, stages or changes.'),
 ('bh-ielts-core-v1-writing-task1','bh-ielts-core-v1-task1-key-features','Task 1 key features and comparisons','Select the key features and make accurate, relevant comparisons with data.'),
 ('bh-ielts-core-v1-writing-task1','bh-ielts-core-v1-task1-process','Task 1 process description','Describe the stages of a process in sequence with suitable passive and sequencing language.'),
 ('bh-ielts-core-v1-writing-task1','bh-ielts-core-v1-task1-map-change','Task 1 map comparison','Describe changes between maps using location and change language.'),
 ('bh-ielts-core-v1-listening-format','bh-ielts-core-v1-word-limit-spelling','Word limits and spelling','Write answers within the word limit and spell them correctly.'),
 ('bh-ielts-core-v1-listening-format','bh-ielts-core-v1-map-plan-labelling','Map and plan labelling','Follow spoken directions and locations to label a map or plan.'),
 ('bh-ielts-core-v1-listening-format','bh-ielts-core-v1-choose-multiple','Choose more than one answer','Select the correct set of answers when a question asks for two or more.')) x(parent,code,name,description)
join public.academic_skill_registry_nodes p on p.code=x.parent
where v.code='bh-ielts-core-v1'
on conflict (code) do nothing;

-- 2. Review batches and mappings.
create table if not exists private.ielts_content_review_batches (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('construct_mapping')),
 title text not null,
 proposed_by text not null,
 proposal_basis text not null,
 status text not null default 'pending' check (status in ('pending','approved','changes_requested','superseded')),
 reviewer_id uuid references public.users(id),
 approved_sha256 text,
 sample jsonb,
 decision_notes text,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 check ((status in ('approved','changes_requested')) = (reviewer_id is not null and decided_at is not null))
);
alter table private.ielts_content_review_batches enable row level security;

create table if not exists private.ielts_material_construct_maps (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references private.ielts_content_review_batches(id),
 material_type text not null check (material_type in ('ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task','targeted')),
 material_id text not null,
 item_key text,
 node_id uuid not null references public.academic_skill_registry_nodes(id),
 role text not null check (role in ('primary','supporting')),
 rationale text not null,
 status text not null default 'proposed' check (status in ('proposed','approved','rejected','superseded')),
 decided_at timestamptz,
 created_at timestamptz not null default now()
);
alter table private.ielts_material_construct_maps enable row level security;
create unique index if not exists ielts_material_construct_maps_live
 on private.ielts_material_construct_maps(material_type, material_id, coalesce(item_key,''), node_id, role)
 where status in ('proposed','approved');
create index if not exists ielts_material_construct_maps_node on private.ielts_material_construct_maps(node_id) where status='approved';
create index if not exists ielts_material_construct_maps_batch on private.ielts_material_construct_maps(batch_id);

create or replace function private.ielts_mapping_batch_sha(p_batch uuid) returns text
language sql stable security definer set search_path to '' as $$
 select encode(sha256(convert_to(coalesce(string_agg(
   m.material_type||'|'||m.material_id||'|'||coalesce(m.item_key,'')||'|'||n.code||'|'||m.role||'|'||m.rationale,
   E'\n' order by m.material_type, m.material_id, coalesce(m.item_key,''), m.role, n.code),''),'UTF8')),'hex')
 from private.ielts_material_construct_maps m join public.academic_skill_registry_nodes n on n.id=m.node_id
 where m.batch_id=p_batch and m.status<>'superseded';
$$;

create or replace function private.ielts_mapping_admin() returns void
language plpgsql stable security definer set search_path to '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and role in ('superadmin','admin') and not coalesce(is_banned,false))
 then raise exception 'forbidden'; end if;
end $$;

-- Approved construct IDs for a material: reviewed catalogue mappings, or the item mappings already stored on targeted tasks.
create or replace function private.ielts_material_constructs(p_type text, p_id text)
returns table(node_id uuid, role text, item_key text)
language sql stable security definer set search_path to '' as $$
 select m.node_id, m.role, m.item_key from private.ielts_material_construct_maps m
  where m.material_type=p_type and m.material_id=p_id and m.status='approved'
 union all
 select (q->>'taxonomy_node_id')::uuid, 'primary', q->>'id' from private.ielts_learning_tasks t, jsonb_array_elements(t.questions) q
  where p_type='targeted' and t.code=p_id and q ? 'taxonomy_node_id'
 union all
 select (q->>'supporting_node_id')::uuid, 'supporting', q->>'id' from private.ielts_learning_tasks t, jsonb_array_elements(t.questions) q
  where p_type='targeted' and t.code=p_id and q ? 'supporting_node_id';
$$;

-- 3. Content-administrator RPCs.
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
     order by m.material_type, m.material_id::text, nullif(regexp_replace(coalesce(m.item_key,''),'\D','','g'),'')::int nulls first, m.role desc),'[]')
   from private.ielts_material_construct_maps m
   join public.academic_skill_registry_nodes n on n.id=m.node_id
   left join private.ielts_reviewed_practice r on r.material_type=m.material_type and r.material_id=m.material_id
   where m.batch_id=b.id and m.status<>'superseded')) order by b.created_at desc) from private.ielts_content_review_batches b where b.kind='construct_mapping'),'[]');
end $$;

create or replace function public.rpc_ielts_construct_mapping_decide(p_batch uuid, p_sha256 text, p_decision text, p_sample uuid[], p_rejected uuid[], p_notes text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; total int; need int; approved int;
begin
 perform private.ielts_mapping_admin();
 select * into b from private.ielts_content_review_batches where id=p_batch for update;
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

revoke all on function public.rpc_ielts_construct_mapping_queue() from public, anon;
revoke all on function public.rpc_ielts_construct_mapping_decide(uuid,text,text,uuid[],uuid[],text) from public, anon;
grant execute on function public.rpc_ielts_construct_mapping_queue() to authenticated;
grant execute on function public.rpc_ielts_construct_mapping_decide(uuid,text,text,uuid[],uuid[],text) to authenticated;
revoke all on function private.ielts_mapping_batch_sha(uuid) from public, anon, authenticated;
revoke all on function private.ielts_mapping_admin() from public, anon, authenticated;
revoke all on function private.ielts_material_constructs(text,text) from public, anon, authenticated;

-- 4. AI-proposed mappings for the 18 reviewed catalogue materials (pending human batch review).
with b as (
 insert into private.ielts_content_review_batches(kind,title,proposed_by,proposal_basis)
 select 'construct_mapping','Construct mappings: 18 reviewed practice materials (L-011–013, R-008–012, W-004–009, S-006–009)',
  'Claude (AI assistant) on the owner''s instruction of 2026-10-19',
  'Item-level proposals from the question type, wording and key of each released catalogue material. Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A. A named content administrator must review a sample and approve or request changes.'
 where not exists(select 1 from private.ielts_content_review_batches where title like 'Construct mappings: 18 reviewed practice materials%')
 returning id)
insert into private.ielts_material_construct_maps(batch_id,material_type,material_id,item_key,node_id,role,rationale)
select b.id, x.t, x.i, x.k, n.id, x.r, x.w from b cross join (values
  ('ielts_listening_set','28','1','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','28','1','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','28','2','bh-ielts-listening-v1-dates-times','primary','Gap answer is a day or time in the recording.'),
  ('ielts_listening_set','28','2','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','28','3','bh-ielts-listening-v1-dates-times','primary','Gap answer is a day or time in the recording.'),
  ('ielts_listening_set','28','3','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','28','4','bh-ielts-listening-v1-numerical-information','primary','Gap answer is a number or price in the recording.'),
  ('ielts_listening_set','28','4','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','28','5','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','28','5','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','28','6','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','28','6','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','1','bh-ielts-listening-v1-dates-times','primary','Gap answer is a day or time in the recording.'),
  ('ielts_listening_set','29','1','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','2','bh-ielts-listening-v1-numerical-information','primary','Gap answer is a number or price in the recording.'),
  ('ielts_listening_set','29','2','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','3','bh-ielts-listening-v1-dates-times','primary','Gap answer is a day or time in the recording.'),
  ('ielts_listening_set','29','3','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','4','bh-ielts-listening-v1-numerical-information','primary','Gap answer is a number or price in the recording.'),
  ('ielts_listening_set','29','4','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','5','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','29','5','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','29','6','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','29','6','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','1','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','30','1','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','2','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','30','2','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','3','bh-ielts-listening-v1-dates-times','primary','Gap answer is a day or time in the recording.'),
  ('ielts_listening_set','30','3','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','4','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','30','4','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','5','bh-ielts-listening-v1-explicit-detail','primary','Gap answer is a stated detail in the recording.'),
  ('ielts_listening_set','30','5','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_listening_set','30','6','bh-ielts-listening-v1-numerical-information','primary','Gap answer is a number or price in the recording.'),
  ('ielts_listening_set','30','6','bh-ielts-core-v1-word-limit-spelling','supporting','ONE WORD AND/OR A NUMBER answer; spelling and word limit are marked.'),
  ('ielts_reading_set','30','1','eng.reading.explicit-information.locate-detail','primary','Stated reason located in the passage, expressed in different words.'),
  ('ielts_reading_set','30','1','eng.reading.main-ideas.summary','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','30','2','eng.reading.explicit-information.locate-detail','primary','Stated detail about what staff recorded.'),
  ('ielts_reading_set','30','3','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','30','3','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','30','4','eng.reading.explicit-information.locate-detail','primary','Gap filled with a word taken from the passage.'),
  ('ielts_reading_set','30','4','eng.reading.strategy-selection.scan','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','30','5','eng.reading.inference.unstated-meaning','primary','Asks what can be inferred from the decision.'),
  ('ielts_reading_set','30','6','eng.reading.main-ideas.gist','primary','Best title for the main idea.'),
  ('ielts_reading_set','31','1','eng.reading.explicit-information.locate-detail','primary','Stated benefit located in the passage.'),
  ('ielts_reading_set','31','2','eng.reading.connections.logical-relations','primary','Asks for the cause of a visible effect.'),
  ('ielts_reading_set','31','2','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','31','3','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','31','3','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','31','4','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','31','4','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','31','5','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','31','5','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','31','6','eng.reading.inference.purpose-intention','primary','Asks for the role of information in the text.'),
  ('ielts_reading_set','32','1','eng.reading.main-ideas.gist','primary','Main aim of the trial described in the passage.'),
  ('ielts_reading_set','32','2','eng.reading.explicit-information.locate-detail','primary','Stated difficulty located in the passage.'),
  ('ielts_reading_set','32','3','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','32','3','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','32','4','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','32','4','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','32','5','eng.reading.explicit-information.locate-detail','primary','Gap filled with a word taken from the passage.'),
  ('ielts_reading_set','32','5','eng.reading.strategy-selection.scan','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','32','6','eng.reading.main-ideas.main-supporting','primary','Identify the limitation acknowledged in the final paragraph.'),
  ('ielts_reading_set','32','6','eng.reading.connections.structure','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','33','1','eng.reading.inference.purpose-intention','primary','Why staff acted as they did.'),
  ('ielts_reading_set','33','2','eng.reading.inference.purpose-intention','primary','Why a detail was recorded.'),
  ('ielts_reading_set','33','3','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','33','3','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','33','4','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','33','4','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','33','5','eng.reading.explicit-information.locate-detail','primary','Gap filled with a word taken from the passage.'),
  ('ielts_reading_set','33','5','eng.reading.strategy-selection.scan','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','33','6','eng.reading.inference.purpose-intention','primary','Why one section was kept unchanged.'),
  ('ielts_reading_set','33','7','eng.reading.connections.structure','primary','Which paragraph contains a given function.'),
  ('ielts_reading_set','33','8','eng.reading.main-ideas.gist','primary','Best overall description of the approach.'),
  ('ielts_reading_set','33','8','eng.reading.purpose-viewpoint.viewpoint','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','34','1','eng.reading.explicit-information.locate-detail','primary','Stated detail about what was automated.'),
  ('ielts_reading_set','34','2','eng.reading.purpose-viewpoint.viewpoint','primary','Overall view expressed in the passage.'),
  ('ielts_reading_set','34','3','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','34','3','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','34','4','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','34','4','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','34','5','eng.reading.argument-evaluation.claims-evidence','primary','TRUE/FALSE/NOT GIVEN: judge whether the passage establishes, contradicts or does not address the claim.'),
  ('ielts_reading_set','34','5','eng.reading.explicit-information.locate-detail','supporting','Supporting construct for the same item.'),
  ('ielts_reading_set','34','6','eng.reading.explicit-information.locate-detail','primary','Stated detail about what the library provided.'),
  ('ielts_writing_task','2',null,'eng.writing.argumentation.claim-position','primary','Task 2 discussion: present both views and a clear position.'),
  ('ielts_writing_task','2',null,'eng.writing.content-development.develop-ideas','supporting','Each view needs developed explanation.'),
  ('ielts_writing_task','2',null,'eng.writing.content-development.support-examples','supporting','Ideas need relevant examples.'),
  ('ielts_writing_task','2',null,'eng.writing.organization-cohesion.paragraphing','supporting','Clear paragraph per view and opinion.'),
  ('ielts_writing_task','3',null,'eng.writing.argumentation.claim-position','primary','Task 2 discussion: present both views and a clear position.'),
  ('ielts_writing_task','3',null,'eng.writing.content-development.develop-ideas','supporting','Each view needs developed explanation.'),
  ('ielts_writing_task','3',null,'eng.writing.content-development.support-examples','supporting','Ideas need relevant examples.'),
  ('ielts_writing_task','3',null,'eng.writing.organization-cohesion.paragraphing','supporting','Clear paragraph per view and opinion.'),
  ('ielts_writing_task','14',null,'eng.writing.argumentation.claim-position','primary','Task 2 discussion: present both views and a clear position.'),
  ('ielts_writing_task','14',null,'eng.writing.content-development.develop-ideas','supporting','Each view needs developed explanation.'),
  ('ielts_writing_task','14',null,'eng.writing.content-development.support-examples','supporting','Ideas need relevant examples.'),
  ('ielts_writing_task','14',null,'eng.writing.organization-cohesion.paragraphing','supporting','Clear paragraph per view and opinion.'),
  ('ielts_writing_task','13',null,'bh-ielts-core-v1-task1-overview','primary','Academic Task 1 chart: report the main trends in an overview.'),
  ('ielts_writing_task','13',null,'bh-ielts-core-v1-task1-key-features','supporting','Select key features and make accurate comparisons.'),
  ('ielts_writing_task','17',null,'bh-ielts-core-v1-task1-overview','primary','Academic Task 1 chart: report the main trends in an overview.'),
  ('ielts_writing_task','17',null,'bh-ielts-core-v1-task1-key-features','supporting','Select key features and make accurate comparisons.'),
  ('ielts_writing_task','15',null,'eng.writing.purpose-register.text-conventions','primary','General Training letter conventions (not used for the Academic route).'),
  ('ielts_writing_task','15',null,'eng.writing.content-development.task-relevance','supporting','Cover all three bullet points.'),
  ('ielts_writing_task','15',null,'eng.writing.purpose-register.register-tone','supporting','Appropriate formal complaint tone.'),
  ('ielts_speaking_task','13',null,'eng.speaking.interaction.respond-develop','primary','Part 1: answer a familiar question and extend it.'),
  ('ielts_speaking_task','13',null,'eng.speaking.message-development.expand','supporting','Add reasons and detail.'),
  ('ielts_speaking_task','14',null,'eng.speaking.fluency-coherence.sustain','primary','Part 2: sustain a long turn.'),
  ('ielts_speaking_task','14',null,'eng.speaking.fluency-coherence.link-ideas','supporting','Organise the cue-card points coherently.'),
  ('ielts_speaking_task','15',null,'eng.speaking.functional-language.opinions','primary','Part 3: discuss an abstract issue and give opinions.'),
  ('ielts_speaking_task','15',null,'eng.speaking.message-development.expand','supporting','Justify and develop answers.'),
  ('ielts_speaking_task','16',null,'eng.speaking.fluency-coherence.sustain','primary','Part 2: sustain a long turn.'),
  ('ielts_speaking_task','16',null,'eng.speaking.functional-language.explaining','supporting','Describe and explain usefulness.')
) x(t,i,k,c,r,w) join public.academic_skill_registry_nodes n on n.code=x.c;

do $$ begin
 if (select count(*) from private.ielts_material_construct_maps m join private.ielts_content_review_batches b on b.id=m.batch_id
     where b.title like 'Construct mappings: 18 reviewed practice materials%') <> 113
 then raise exception 'expected 113 proposed mappings (a construct code did not resolve)'; end if;
end $$;
