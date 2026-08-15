-- Cover the release receipt's curriculum-version foreign key for joins and
-- future version-retirement checks.

create index if not exists verified_question_import_releases_framework_version_idx
  on public.verified_question_import_releases(framework_version_id);
