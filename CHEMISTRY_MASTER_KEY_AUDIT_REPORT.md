# Chemistry master answer-key strategy audit (post-migration status)

## Scope
Target strategy:
- One source of truth: `public/cambridge-tests/Chemistry/chemistry_master_answer_key.js`
- Canonical question-code based lookup for all chemistry chapter tests
- Chapter/part/order independent scoring

## Compliance status (latest)
✅ Centralization implemented.

### What is now enforced
1. Chemistry chapter pages load `chemistry_master_answer_key.js` and derive `ANSWER_KEY` from question codes at runtime.
2. Local per-file hardcoded answer maps have been removed from chapter pages.
3. Master helper supports canonical `paper|question` and legacy `paper Q: question` parsing via normalization.
4. Question codes are currently unique and all map to master entries.

## Verification snapshot
- Used canonical codes: **1222**
- Duplicate canonical codes: **0**
- Invalid code formats: **0**
- Missing from master: **0**
- Unused in master: **0**

## Artifacts
- `CHEMISTRY_CODE_AUDIT.json`
- `CHEMISTRY_MASTER_UNUSED_CODES_REPORT.json`
