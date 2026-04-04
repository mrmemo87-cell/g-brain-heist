# Chemistry master answer-key strategy audit (post-fix)

Generated at: `2026-04-04T14:06:49Z`  
Generated from commit: `77e6664` (+ local working changes)

## Status
✅ Centralized scoring is active and fail-closed when answer key is missing/incomplete.

## Runtime checks now enforced
1. Master key lookup must exist (`window.CHEMISTRY_MASTER_ANSWER_KEY.getAnswerKeyForQuestions`).
2. Derived key must cover every question (`QUESTIONS.every(q => !!ANSWER_KEY[q.number])`).
3. Missing/incomplete key keeps `ANSWER_KEY = null`, shows warning, disables submit, and leaves scoring pending.

## Current snapshot (from `CHEMISTRY_CODE_AUDIT.json`)
- total_entries: **1222**
- canonical_parseable: **1222**
- invalid_format_count: **0**
- duplicate_canonical_count (runtime effective): **0**
- missing_in_master_count: **0**
- unused_master_count: **0**
- display_code_duplicate_count: **6**
- master_code_override_count: **9**
