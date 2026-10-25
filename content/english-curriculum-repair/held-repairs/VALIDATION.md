# Validation evidence — 2026-10-26

- PR #1719 merged as `dece51119d95a6cc0b19c7c6d8b6d053e1410196` after its complete CI job passed. Vercel deployment `dpl_B9EqYpq5BCT2odC1692jJKuq3up4` reached READY with both `brainsheist.com` and `www.brainsheist.com` aliases.
- The shared catalogue is current. All 129 source question content hashes still match this repair snapshot.
- The normal registry importer validated the 12 self-contained reading candidates with `p_dry_run=true`: success, 12 questions, 12 taxonomy mappings, zero assessment profiles. Its returned package hash was `b2bba3c941a18160fb1e58061934a6fb9864676f56aca19b0b9e98130b414750`.
- A separate live query confirmed **zero candidate question rows and zero candidate release records**. Validation has not published content.
- 19 curriculum/catalogue/editorial/repair tests passed, including failure cases for missing passages, fabricated supporting quotes, stale source hashes, grade expansion, duplicate options, and falsely approved draft status. Typecheck and diff checks passed.
- All 129 items have exactly one proposed disposition: 105 precise-focus governance proposals, 12 new reading replacements, four new connective wording candidates, seven subject-scope reviews and one existing-focus mapping proposal.

## Boundaries

The importer dry run verifies package structure and canonical references. It does not supply editorial approval, fresh semantic validation of every historical answer key, empirical grade calibration or a school-adoption decision. Draft focus proposal keys are not registry codes. Existing questions, taxonomy, marks and evidence remain unchanged.

The new factual passages are original paraphrases. The WHO, NIH/NEI, CDC and research-team sources are linked in `reading-replacements.json` and `READING_REPLACEMENTS.md`; the narrative passage is original fiction. New external IDs preserve the original assessment history if these candidates are later released.

## Live selection safety gate

Migration `20261025233152_hold_context_incomplete_question_selection.sql` is applied in production. Exactly 12 current, verified source hashes have a private, reversible `missing_reading_context` selection hold. New bank reads, intervention-by-ID reads, inserts into assignments and draft scheduling/publication respect the hold. All existing authorisation, school, grade, scope and hash checks remain in place; the shared catalogue itself is unchanged.

All 22 teacher accounts were checked with full paginated `get_all_active_questions` results before and after the migration. Every result equals the previous set minus exactly those held IDs: three teachers lose 12, 11 and 11 items respectively; all other results are identical. One existing published assignment reference is grandfathered. No original question, snapshot, answer, score, mapping or school adoption was rewritten.

A production rollback test exercised the actual trigger functions: new insert, moving a grandfathered reference to another assignment, scheduling and publication are rejected; grandfathered publication, explicit release and a changed content hash are allowed. Holds are inaccessible to anonymous and authenticated roles. The local suite now passes 20 tests, including the same trigger behaviours plus all four bank read functions and cross-school access.

Release procedure: after real editorial approval, release a source hold only if the approved current content is usable. The proposed replacements use new IDs, so releasing a replacement does not justify releasing an incomplete original. Existing published work remains available through its stored snapshots.
