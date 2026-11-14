-- Diagnostic Bible 2.2.1 section 10.7: interview transcripts now use the stronger speech-to-text model with a
-- completeness check (a looping or speech-dropping transcript is retried). Analyses made with the earlier version
-- are re-run automatically; they stay as history.
create or replace function private.ielts_speaking_analysis_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-interview-analysis-v3'::text $$;
revoke all on function private.ielts_speaking_analysis_version() from public, anon, authenticated;
