-- A curriculum outcome may deliberately cover several exact diagnostic focuses.
-- Keep registry identities unchanged; require an explicit reviewed allowlist.
create table private.curriculum_objective_focus_links (
 objective_id uuid not null,
 framework_version_id uuid not null,
 evidence_focus_id uuid not null references public.academic_skill_evidence_focuses(id) on delete restrict,
 review_status text not null default 'proposed' check(review_status in ('proposed','approved','rejected')),
 rationale text not null check(length(trim(rationale)) between 20 and 2000),
 reviewed_by uuid references public.users(id) on delete restrict,
 reviewed_at timestamptz,
 primary key(objective_id,evidence_focus_id),
 foreign key(objective_id,framework_version_id) references public.curriculum_objectives(id,framework_version_id) on delete restrict,
 check(review_status<>'approved' or (reviewed_by is not null and reviewed_at is not null))
);
create index curriculum_objective_focus_links_version_idx on private.curriculum_objective_focus_links(framework_version_id);
create index curriculum_objective_focus_links_focus_idx on private.curriculum_objective_focus_links(evidence_focus_id);
create index curriculum_objective_focus_links_reviewer_idx on private.curriculum_objective_focus_links(reviewed_by) where reviewed_by is not null;
alter table private.curriculum_objective_focus_links enable row level security;
revoke all on private.curriculum_objective_focus_links from public,anon,authenticated,service_role;

create or replace function private.guard_curriculum_objective_focus_link()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_subject text; v_registry uuid;
begin
 if private.curriculum_version_content_is_locked(case when tg_op='DELETE' then old.framework_version_id else new.framework_version_id end) then raise exception 'curriculum_version_content_locked';end if;
 if tg_op in ('UPDATE','DELETE') then
  if private.curriculum_version_content_is_locked(old.framework_version_id) then raise exception 'curriculum_version_content_locked';end if;
  if old.review_status='approved' then raise exception 'approved_curriculum_focus_link_is_immutable';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 select a.name into v_subject from public.curriculum_objectives o
 join public.curriculum_scopes s on s.id=o.curriculum_scope_id
 join public.academic_subjects a on a.id=s.academic_subject_id
 where o.id=new.objective_id and o.framework_version_id=new.framework_version_id;
 select registry_version_id into v_registry from public.academic_skill_evidence_focuses where id=new.evidence_focus_id and status='active';
 if v_subject is null or v_registry is null or not private.academic_registry_subject_matches(v_registry,v_subject) then raise exception 'curriculum_focus_link_subject_mismatch';end if;
 return new;
end;
$function$;
revoke all on function private.guard_curriculum_objective_focus_link() from public,anon,authenticated,service_role;
create trigger trg_curriculum_objective_focus_link before insert or update or delete on private.curriculum_objective_focus_links
for each row execute function private.guard_curriculum_objective_focus_link();

create or replace function private.guard_curriculum_precision_publication()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if tg_op='INSERT' and new.precision_policy<>'specific-v1' then raise exception 'new_curriculum_requires_specific_precision_policy';end if;
 if tg_op='UPDATE' and new.precision_policy is distinct from old.precision_policy then raise exception 'curriculum_precision_policy_is_immutable';end if;
 if new.precision_policy='specific-v1' and new.status in ('approved','published') then
  if exists(select 1 from private.curriculum_objective_focus_links l
   join public.academic_skill_evidence_focuses ef on ef.id=l.evidence_focus_id
   where l.framework_version_id=new.id and (l.review_status<>'approved' or ef.status<>'active')) then raise exception 'curriculum_focus_links_require_review';end if;
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
 if v_objective.registry_evidence_focus_id is not null or exists(
  select 1 from private.curriculum_objective_focus_links l where l.objective_id=v_objective.id
 ) then
  select * into v_item from public.curriculum_assessment_items where id=new.assessment_item_id;
  if v_item.source_type='question_bank' and not exists(
   select 1 from public.verified_question_registry_taxonomy tx
   join public.academic_skill_evidence_focuses ef on ef.id=tx.evidence_focus_id and ef.status='active'
   join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
   where tx.question_id::text=v_item.source_record_id and tx.question_content_hash=new.item_content_hash
    and tx.review_status='approved' and not tx.human_review_required
    and (tx.evidence_focus_id=v_objective.registry_evidence_focus_id or exists(
     select 1 from private.curriculum_objective_focus_links l where l.objective_id=v_objective.id
      and l.evidence_focus_id=tx.evidence_focus_id and l.review_status='approved'
    ))
  ) then raise exception 'question_evidence_focus_does_not_match_curriculum_objective';end if;
 end if;
 return new;
end;
$function$;
revoke all on function private.guard_curriculum_objective_precision_mapping() from public,anon,authenticated,service_role;
