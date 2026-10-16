# Targeted practice teacher review

Bible contract: 1.6.0, unchanged. No scoring, band, taxonomy, content publication, eligibility or pilot scope changes.

Jess's Review desk previously linked to a shared student task page. Teacher navigation now returns to the school Review desk, with a named student header, a separate answer key and teaching notes, and expandable original objective screener items. The original response, accepted answers, mark outcome and construct remain distinct from the targeted task. Writing links to the exact original teacher review; Speaking keeps its original session link.

The teacher-only context RPC repeats current allocation, school membership, student eligibility and actor authorization. Original objective evidence must belong to the allocated student and school and have a submitted attempt and server-verified scoring run. Missing/void evidence is unavailable, never fabricated. Learner key masking remains unchanged.

## AI draft scope

One AI help button fills all four feedback fields for submitted Listening/Reading targeted work. Writing and Speaking screener helpers remain unchanged; this release does not add a targeted productive-skill AI evaluator. No pronunciation conclusions are generated from notes.

The Edge Function authenticates the current user, claims an authorized immutable submission snapshot, uses the existing server-side OpenAI credential, and validates a strict four-field response with exact saved-answer references. Common words and short sentences are required. All-correct responses must not produce invented errors. Without verified notes/transcript, the prompt forbids fabricated dialogue, distractors and timestamps. The model is configured server-side (default gpt-4.1-2025-04-14); prompt version bh-targeted-objective-feedback-v1.

AI work is teacher-triggered, not part of saves/submissions or student landing. A teacher has at most six new drafts per hour, with a two-minute in-flight lease, cached successful drafts per teacher/task/model/prompt, one bounded provider retry and a 45-second overall provider deadline. Ready drafts are private and never enter academic conclusions. Before returning a new draft, access is rechecked. Model, prompt, original context, provider reference and draft output are retained. Explicit sharing links the draft to an append-only teacher review; edits are stored in the final review, leaving the AI original intact.

Existing feedback requires explicit replacement. The teacher can keep their wording, edit all fields, and must press Confirm and share. AI failure preserves feedback and allows manual review. No scores or historical results are modified, and no feedback is automatically shared.

## Validation and limits

Focused database tests cover teacher-only context, original source outcomes, no student key access, immutable submissions, cached/in-flight drafts, repeated shares and provenance. DOM tests cover teacher navigation, key/source panels, all four populated boxes, no automatic sharing, explicit replacement and provider failure. Validator tests reject invented answer references, incomplete fields, extraneous scores and complex language.

This adds one bounded teacher context read per selected review and optional teacher-only AI requests. It does not run AI for 500 students or establish a capacity claim. Relevant simultaneous teacher-review/provider workloads need staging evidence before a larger concurrency claim. Human browser and live-provider acceptance remain with Jess; automated tests use fixtures, not fabricated human reviews.

Rollback: disable/remove the new teacher AI UI or deploy a safe unavailable handler. Keep additive private draft/provenance records and all saved student work. Do not reset attempts or overwrite immutable task/audio versions.
