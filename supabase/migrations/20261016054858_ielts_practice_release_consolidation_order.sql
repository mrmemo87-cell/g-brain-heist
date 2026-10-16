-- Preserve chronological canonical identity while recording approved retirement lineage.
create or replace function private.publish_reviewed_ielts_practice() returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;p jsonb;m jsonb;parent jsonb;decision text;result jsonb;table_name text;shared jsonb;shared_p jsonb;shared_m jsonb;begin
 perform private.ielts_cleanup_authorize();
 if not exists(select 1 from private.ielts_reviewed_practice where owner_id=auth.uid()) then raise exception 'owner_approval_required';end if;
 for v in select * from private.ielts_reviewed_practice where release_ready order by material_type,legacy_code loop
 if exists(select 1 from private.ielts_reviewed_practice_releases where legacy_code=v.legacy_code and revision=v.revision) then continue;end if;
 p:=private.ielts_originality_payload(v.material_type,v.material_id);m:=private.ielts_originality_matches(v.material_type,v.material_id);
 if exists(select 1 from jsonb_array_elements(m) x where x->>'reason'='exact_copy') then raise exception 'Exact task copy requires canonical reuse: %',v.legacy_code;end if;
 -- Retired later reuse must not invert the earlier canonical task's identity.
 for shared in select value from jsonb_array_elements(m) x(value) where value->>'reason' in('shared_text','shared_questions') loop
 if exists(select 1 from private.ielts_legacy_cleanup_versions old where old.material_type=shared->>'material_type' and old.material_id=shared->>'material_id' and old.disposition='retire' and old.revision_payload->>'consolidate_into'=v.legacy_code)
 and exists(select 1 from private.ielts_material_fingerprints original join private.ielts_material_fingerprints duplicate on duplicate.material_type=shared->>'material_type' and duplicate.material_id=shared->>'material_id' and duplicate.content_hash=shared->>'content_hash' where original.material_type=v.material_type and original.material_id=v.material_id and original.content_hash=p->>'content_hash' and original.recorded_at<=duplicate.recorded_at) then
 shared_p:=private.ielts_originality_payload(shared->>'material_type',shared->>'material_id');shared_m:=private.ielts_originality_matches(shared->>'material_type',shared->>'material_id');
 perform public.rpc_ielts_material_originality_review(shared->>'material_type',shared->>'material_id',shared_p->>'content_hash',private.ielts_originality_hash(shared_m::text),'variant',v.material_type,v.material_id,p->>'content_hash',
 'Owner-reviewed retirement/consolidation: this later legacy task reuses the earlier canonical material. Retain the historical identity and exposure family; it remains held and unavailable for new assignments.',true,false,false);
 end if;
 end loop;
 m:=private.ielts_originality_matches(v.material_type,v.material_id);
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
