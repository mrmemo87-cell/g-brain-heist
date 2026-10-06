-- Public discovery/start preserves IELTS agreements and student seat eligibility.
create or replace function private.ielts_screener_release_eligible(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from private.ielts_screener_releases r
    join private.ielts_diagnostic_versions v on v.id=r.version_id
    join public.ielts_exam_forms f on f.id=v.exam_form_id
    join public.users u on u.id=auth.uid()
    where r.exam_event_id=p_event and r.enabled and v.state='published' and f.is_active
      and not coalesce(u.is_banned,false)
      and ((r.scope='public' and private.actor_has_programme_access('ielts',true))
        or (r.scope='pilot' and auth.uid()=any(r.pilot_users)))
      and v.content_hash=r.published_content_hash and v.audio_provenance->>'sha256'=r.audio_sha256
  );
$$;
revoke all on function private.ielts_screener_release_eligible(uuid) from public,anon,authenticated,service_role;
