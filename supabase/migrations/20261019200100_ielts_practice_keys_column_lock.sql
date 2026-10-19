-- Applied after the client that reads questions without keys was deployed (see 20261019200000).
-- Column-level reads: no direct access to keys or evidence through the Data API.
revoke select on public.ielts_reading_questions from anon, authenticated;
revoke select on public.ielts_listening_questions from anon, authenticated;
grant select (id, set_id, question_order, question_type, body, options) on public.ielts_reading_questions to authenticated;
grant select (id, set_id, question_order, question_type, body, options) on public.ielts_listening_questions to authenticated;

