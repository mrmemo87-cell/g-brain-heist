# Owner-reviewed IELTS course release — 16 October 2026

Approval source: owner statement, **“I reviewed and need to publish them for any eligible students.”** The immutable `2026-10-16.1` candidates and their exact hashes are linked to this instruction. This is owner-stated content review, not an invented independent review or Listening recording acceptance.

Contracts: Diagnostic Bible **1.10.0**, Lessons Bible **1.0.0**, Visual & UX Bible **1.1.0**. Scope is guided practice; these short materials are not complete IELTS tests and model responses are not guaranteed bands.

## Intended activation

- **Reading:** five substantially rewritten tasks receive new identities, **R-008–R-012**, linked to legacy R-003–R-007. Their passages, 32 questions, option-text keys and evidence correspond to the approved revision. Foundation/extended labels remain explicit.
- **Writing:** **W-004–W-009** retain their canonical identities because the response demands are unchanged. An immutable delivery projection supplies the corrected model, word count and actual chart/data table. Original source rows and retained snapshots remain intact. W-008 remains General Training Task 1.
- **Speaking:** **S-006–S-009** retain their canonical identities. Versioned delivery supplies normalized preparation/turn timings. Part 2 follow-ups appear after the recorded long turn. Non-empty guided-practice submission is separate from teacher evaluation; recording duration is not a score or proof of mastery.
- **Listening:** reserved replacement identities **L-011–L-013** remain inactive. No legacy recording is paired with the corrected scripts. Empty draft audio references cannot be assigned or discovered. Actual MP3/script/key review, rights and supported-device acceptance remain separate requirements under Diagnostic Bible §6.1.

Existing Writing/Speaking stimuli are reused under the same codes; no copied prompt is disguised as new material. Consolidation respects chronological lineage: a later retired duplicate may be linked to the earlier canonical material, never the reverse. All seven retirement decisions remain in force.

## Controlled deployment

Migrations `20261016054557_ielts_reviewed_practice_release.sql` and `20261016054858_ielts_practice_release_consolidation_order.sql` install immutable approval/delivery records and an explicit activation routine. Installation does not publish. After the matching interface is deployed, the owner-authorized routine creates **15** release events, runs current originality checks, enables availability and removes only the corresponding practice holds. Screeners, retired sources, unapproved recordings and unrelated targeted releases remain excluded.

Eligibility is unchanged: publication does not enable a school's Extra Practice toggle. Eligible students can access their assigned course work even when free browsing is disabled. Jess uses **IELTS batch → Assign tasks → Course materials**. The existing **Targeted practice** option retains evidence-source, exposure and review requirements. Assignment creation and retry use the existing canonical batch APIs and idempotent requests.

## Validation and preservation

- Full regression, typecheck, production build, portal integrity and migration security checks pass; focused tests exercise both chronological consolidation orders, immutable source/version linkage, current student access, Listening holds and assignment retry without duplicate drafts.
- The actual student Writing component renders the approved grouped chart, exact values and accessible description. No certified model-band claim is shown.
- New Reading attempts are recomputed on the server from accepted keys; supplied raw totals/bands are ignored. Submitted objective evidence and version identity are protected from mutation. Prior attempts are not rescored. New Reading/Writing/Speaking attempts record the exact approved revision hash.
- A role-scoped production transaction exercised owner release, Jess's ordinary school assignment APIs and Gulzada's assigned Reading/Writing delivery, then rolled everything back. Gulzada's school currently disables Extra Practice browsing; assigned delivery works without changing that setting.
- Before/after integrity checks cover original task-bearing source data, original questions, 20 existing exam attempts and ten previously released targeted tasks. Only approved availability/derived labels may change on retained canonical sources. Immutable earlier review artifacts remain unchanged.

Activation must be confirmed against the release ledger and teacher/student scoped discovery after deployment. Automated browser/database checks do not establish physical-device or human Listening acceptance, semantic uniqueness or 500-user capacity.
