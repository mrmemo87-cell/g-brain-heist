-- Additive precision policy: retain published content, hashes, mappings and evidence.
-- New editions must distinguish a bounded assessment objective from a heading.
alter table public.curriculum_framework_versions add column precision_policy text not null default 'legacy'
 check(precision_policy in ('legacy','specific-v1'));
alter table public.curriculum_framework_versions alter column precision_policy set default 'specific-v1';
alter table public.curriculum_scopes add column coverage_status text not null default 'unconfigured'
 check(coverage_status in ('unconfigured','partial','complete'));
alter table public.curriculum_objectives add column assessment_boundary text;
alter table public.curriculum_objectives add column registry_evidence_focus_id uuid
 references public.academic_skill_evidence_focuses(id) on delete restrict;
create index curriculum_objectives_evidence_focus_idx on public.curriculum_objectives(registry_evidence_focus_id)
 where registry_evidence_focus_id is not null;

create or replace function private.curriculum_objective_is_generic(p_statement text)
returns boolean language sql immutable set search_path='' as $function$
 select coalesce(p_statement,'') ~* '(apply understanding of .+ accurately in a contextual learning task|recognise and use .+ accurately in a focused learning task|analyse and apply .+ accurately in a multi-step or unfamiliar task)';
$function$;
revoke all on function private.curriculum_objective_is_generic(text) from public,anon,authenticated,service_role;

create or replace function private.guard_curriculum_precision_publication()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if tg_op='INSERT' and new.precision_policy<>'specific-v1' then raise exception 'new_curriculum_requires_specific_precision_policy';end if;
 if tg_op='UPDATE' and new.precision_policy is distinct from old.precision_policy then raise exception 'curriculum_precision_policy_is_immutable';end if;
 if new.precision_policy='specific-v1' and new.status in ('approved','published') then
  if not exists(select 1 from public.curriculum_objectives o where o.framework_version_id=new.id and o.is_assessable) then raise exception 'curriculum_has_no_assessable_objectives';end if;
  if exists(select 1 from public.curriculum_objectives o where o.framework_version_id=new.id and o.is_assessable
   and (length(trim(coalesce(o.assessment_boundary,'')))<25 or private.curriculum_objective_is_generic(o.statement))) then raise exception 'curriculum_objectives_require_specific_outcomes_and_boundaries';end if;
  if exists(select 1 from public.curriculum_scopes s where s.framework_version_id=new.id
   and (s.coverage_status='unconfigured' or not exists(select 1 from public.curriculum_objectives o where o.curriculum_scope_id=s.id and o.is_assessable))) then raise exception 'curriculum_scope_requires_explicit_coverage_and_objectives';end if;
  if exists(select 1 from public.curriculum_objectives o
   join public.curriculum_scopes s on s.id=o.curriculum_scope_id
   join public.academic_subjects a on a.id=s.academic_subject_id
   left join public.academic_skill_evidence_focuses ef on ef.id=o.registry_evidence_focus_id
   where o.framework_version_id=new.id and o.registry_evidence_focus_id is not null
    and (ef.status<>'active' or not private.academic_registry_subject_matches(ef.registry_version_id,a.name))) then raise exception 'curriculum_objective_registry_focus_is_invalid';end if;
 end if;
 return new;
end;
$function$;
revoke all on function private.guard_curriculum_precision_publication() from public,anon,authenticated,service_role;
create trigger trg_curriculum_precision_publication before insert or update on public.curriculum_framework_versions
for each row execute function private.guard_curriculum_precision_publication();

create or replace function private.guard_curriculum_objective_precision_mapping()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_objective public.curriculum_objectives; v_item public.curriculum_assessment_items;
begin
 -- Preserve historical approvals and the append-only supersession workflow.
 if new.status<>'approved' then return new;end if;
 if tg_op='UPDATE' and old.status='approved' then return new;end if;
 select * into v_objective from public.curriculum_objectives where id=new.curriculum_objective_id;
 if not found or not v_objective.is_assessable then raise exception 'mapping_requires_assessable_objective';end if;
 if private.curriculum_objective_is_generic(v_objective.statement) then raise exception 'mapping_requires_specific_objective_use_new_curriculum_edition';end if;
 if v_objective.registry_evidence_focus_id is not null then
  select * into v_item from public.curriculum_assessment_items where id=new.assessment_item_id;
  if v_item.source_type='question_bank' and not exists(
   select 1 from public.verified_question_registry_taxonomy tx
   join public.academic_skill_evidence_focuses ef on ef.id=tx.evidence_focus_id and ef.status='active'
   join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
   where tx.question_id::text=v_item.source_record_id and tx.question_content_hash=new.item_content_hash
    and tx.review_status='approved' and not tx.human_review_required
    and tx.evidence_focus_id=v_objective.registry_evidence_focus_id
  ) then raise exception 'question_evidence_focus_does_not_match_curriculum_objective';end if;
 end if;
 return new;
end;
$function$;
revoke all on function private.guard_curriculum_objective_precision_mapping() from public,anon,authenticated,service_role;
create trigger trg_curriculum_objective_precision_mapping before insert or update on public.curriculum_item_objective_mappings
for each row execute function private.guard_curriculum_objective_precision_mapping();
