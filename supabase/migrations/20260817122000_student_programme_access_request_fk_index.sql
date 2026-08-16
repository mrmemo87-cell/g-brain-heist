create index if not exists school_programme_access_requests_resolved_by_idx
  on public.school_programme_access_requests(resolved_by) where resolved_by is not null;
