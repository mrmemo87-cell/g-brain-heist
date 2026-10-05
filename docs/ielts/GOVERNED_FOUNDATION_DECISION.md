# IELTS evidence foundation — implementation decision

Bible: **v1.1.0**, unchanged. Audited main: `dab82cb24e03e7d9a24cb474c7711b0594b01606`.

| Component | Decision | Evidence and implementation |
|---|---|---|
| Question governance | EXTEND | Composer candidate pool verifies content hashes, reviewed atomic mappings and grade/subject eligibility. IELTS adds rights, audio and editorial review tied to a content hash. Existing practice rows are never promoted. |
| Taxonomy | REUSE | Reference `academic_skill_registry_versions` and atomic `academic_skill_registry_nodes`. Published snapshots freeze the actual mapping. An IELTS registry still requires human review; no registry is auto-approved. |
| Composer / presets | EXTEND | Existing 10/20/30/40-question composer and presets are four-option, grade-scoped MCQs. Keep their eligibility/breadth rules for MCQ sources. Do not shuffle audio tasks as independent random questions. IELTS publication adds ordered task/construct coverage. |
| Option order | REUSE where applicable | Existing assignment snapshots already balance answers. The Listening draft is balanced before human review; published diagnostic options are frozen, never reshuffled after approval. No change to canonical questions or old assignments. |
| Assignment delivery | REUSE | Existing `ielts_exam_events`, `ielts_exam_forms`, `ielts_exam_assignments` and Exam Mode. Existing academic Assignment Wizard remains untouched. Listening adds audio controls and excludes empty section tabs. |
| Attempts / resume | REUSE | Existing `ielts_exam_attempts`, drafts, lock token, owner checks, programme entitlement and idempotent submission RPC. No second attempt table or engine. |
| Immutable evidence | EXTEND | Private version/attempt envelopes and item responses reference existing forms, attempts and submissions. Freeze content, taxonomy and review provenance; historical edits fail. |
| Objective scoring | IELTS-SPECIFIC | Database trigger consumes the immutable snapshot and submitted responses. Version `ielts-objective-screener-v1`: exact reviewed key, case/whitespace normalization, optional word limit, one mark per item. Never trusts browser score or band. |
| Confidence / weaknesses | REUSE policy, EXTEND adapter later | Existing learning confidence considers source diversity, span, mapping and qualification. This slice conservatively reports low confidence with coverage. No observation is inserted into learning memory under a false `assignment_result` source; no new weakness engine. |
| Teacher reporting | EXTEND | Result RPC checks current programme access and exact class/school teacher allocation, or existing IELTS manager permission. It returns observations and coverage, never protected keys or readiness. Teacher UI integration remains a later delivery step. |
| Four-skill baseline | IELTS-SPECIFIC policy over shared evidence | Modes and four skills are represented. Baseline/reassessment/benchmark publication is explicitly blocked until their scoring, task coverage, review, equivalence and validation contracts are implemented. Readiness wrappers remain fail-closed. |

## Safe activation sequence

1. Create a **draft, inactive** existing IELTS exam form and attach its diagnostic version. Never attach to a form with historical attempts.
2. Author items privately; reference reviewed registry nodes. Keep answer keys and transcripts out of this public repository and public delivery JSON. Use a protected content repository or restricted review packet.
3. Obtain original/licensed audio; record its HTTPS URL, SHA-256, rights and human listening review. Existing Exam Mode supports one combined audio file for this initial slice; replay/pause is allowed for the screener and must be documented as a delivery condition.
4. Human review covers editorial quality, answer key, taxonomy, difficulty and delivery. Record reviewer user ID/date, notes and the reviewed content hash. The hash is SHA-256 of `private.ielts_diagnostic_snapshot(version_id) - 'version'` serialized as PostgreSQL JSONB text. Any content, audio-delivery or mapping change invalidates that approval hash.
5. Service-side publication checks all gates. Activate the existing form only after publication. Existing school assignments/start/resume/submission deliver it. The retired public trial remains retired.
6. Existing submission insertion atomically captures responses and a scoring run; failure rolls back submission, preserving autosaved work. Existing submission replay returns the committed result.

## Limits and rollout status

This is a **foundation**, not school-launch approval. No content is published or seeded by the migration. No bands, new readiness source, overall calculation, learning-memory adapter, productive-skill final scoring, independent-user assignment flow, or baseline publication is introduced.

The private schema models productive task responses and append-only superseding runs; delivery/publication for these remains blocked pending implemented review policies. Corrections require an additional reviewed scoring-run path; no mutable correction shortcut is exposed.

Human content/taxonomy/audio review, audio generation/rights confirmation, real mobile/desktop audio and interruption testing, class-load testing, and school pilot signoff remain required. The current original Listening package is AI-authored **draft only**. Audio generation was blocked by the connected workspace's credit balance. Do not mark it reviewed or substitute browser speech synthesis as assessment audio.
