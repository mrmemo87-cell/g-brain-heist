# Admission Bank Release Process

This release process is fail-closed for every Brain Heist International School Admission Test subject/grade bank.

## Required sequence

1. Approve a production curriculum map for the exact subject, school grade, programme mode (`cambridge_linked` or `brain_heist_international`), source basis, map ID and map version.
2. Author or review the official seed JSON without changing approved question wording, answers, difficulty or subskill during release orchestration.
3. Validate the official bank and curriculum maps:
   - `node scripts/validate-admission-curriculum-maps.mjs --allow-empty`
   - `node scripts/validate-admission-official-bank.mjs`
4. Complete academic review and department-head approval using real reviewer names and dates only.
5. Verify the import in staging.
6. Record a release manifest that conforms to `supabase/seed/admission-official-bank/release-manifests/schema.json`.
7. Run `node scripts/audit-admission-bank-ship-readiness.mjs`; production release is allowed only when the requested banks are `SHIP_READY`.
8. Import to production with explicit production confirmation.

## Non-negotiable blockers

- `legacy_review_required` banks cannot be `SHIP_READY`.
- Missing or unapproved maps block release. Cambridge-linked maps require Cambridge-specific metadata; Brain Heist International maps require approved public reference frameworks and original-question policy approval.
- Missing or unknown objective IDs block release.
- Validator failures block release.
- Missing academic review, department-head approval, or staging verification blocks release.
- Do not create placeholder reviewer names, approval dates, staging confirmations, or production import dates. Do not imply Cambridge endorsement in public release labels.

## Manifest location

Store bank release manifests under `supabase/seed/admission-official-bank/release-manifests/` and validate them against the manifest schema before release.
