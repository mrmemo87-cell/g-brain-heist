-- IELTS Speaking: pronunciation words never list a word the student used wrongly (Diagnostic Bible 2.6.1, 10.7).
--
-- Interview analysis bh-ielts-speaking-interview-analysis-v5 uses pronunciation prompt
-- bh-ielts-speaking-pronunciation-words-v3 and the server filter that drops word swaps ("Use 'respond'").
-- Interviews not yet shared with the student are re-analysed when a teacher opens them; the kept Scribe words are
-- reused, so nothing is transcribed again. Shared interviews keep what the student received (rpc_ielts_speaking_
-- session_extras, 20261120234500). Every earlier analysis stays as history.
create or replace function private.ielts_speaking_analysis_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-interview-analysis-v5'::text $$;
revoke all on function private.ielts_speaking_analysis_version() from public, anon, authenticated;
