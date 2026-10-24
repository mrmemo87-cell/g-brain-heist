-- Explicit offering activation after confirming programme AND exam years.
-- Set the authority, manifest checksum and exact offering ID in this transaction.
do $offering$
declare v_offering uuid:=nullif(current_setting('brains_heist.physics_offering_id',true),'')::uuid;
begin
  if v_offering is null or coalesce(current_setting('brains_heist.physics_review_authority',true),'')=''
     or current_setting('brains_heist.physics_review_manifest_sha256',true) is distinct from '56f65c4493bdc29650b08c5b46f099c0c01a6cb6d2d8ba5922c1c9bbb61fc387' then
    raise exception 'physics_offering_exact_version_review_required';
  end if;
  if not exists(select 1 from public.school_subject_offerings o
    join public.school_subjects ss on ss.id=o.school_subject_id and ss.school_id=o.school_id and ss.is_active
    join public.academic_subjects a on a.id=ss.academic_subject_id and a.code='physics'
    where o.id=v_offering and o.status='active') then raise exception 'active_physics_offering_required'; end if;
  if exists(select 1 from public.physics_programme_offering_mappings where offering_id=v_offering
    and (programme_code<>'0654' or source_version<>'2025-2027' or registry_phase<>'upper_secondary' or status<>'active')) then
    raise exception 'physics_offering_programme_conflict';
  end if;
  insert into public.physics_programme_offering_mappings(offering_id,programme_code,source_version,registry_phase,reviewed_by_authority)
  values(v_offering,'0654','2025-2027','upper_secondary',current_setting('brains_heist.physics_review_authority'))
  on conflict(offering_id) do nothing;
end;
$offering$;
