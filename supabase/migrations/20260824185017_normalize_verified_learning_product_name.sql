-- Keep production metadata aligned with the canonical Brains Heist name after
-- the verified-learning authority migrations were applied.

comment on function public.student_learning_ingest_assignment_result(
  uuid, uuid, timestamptz, integer, integer
) is
  'Compatibility adapter routed to strict, grade-eligible, hash-bound Brains Heist Verified diagnostic evidence; caller-supplied aggregate scores are not evidence.';

comment on table public.student_learning_item_evidence is
  'Append-only answer ledger produced only from immutable Brains Heist Verified assignment snapshots, current verified hashes, grade eligibility, active school scope, and approved objective mappings.';

comment on view private.student_verified_assignment_summaries is
  'Fail-closed official assignment totals recomputed only from current, hash-bound Brains Heist Verified answer snapshots; targeted practice is excluded.';

comment on function public.rpc_student_academic_profile(
  uuid, text, timestamptz, timestamptz
) is
  'Official student profile: assignment totals are recomputed from Brains Heist Verified items; timeline evidence is authority-qualified; automated Writing Hub analysis and targeted practice are excluded.';

comment on table public.verified_question_governance_events is
  'Append-only, hash-bound governance history for retiring or re-verifying immutable Brains Heist questions.';
