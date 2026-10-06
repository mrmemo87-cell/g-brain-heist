# IELTS evidence foundation — implementation decision

Bible: **v1.2.0** (audio requirements added on 2026-10-06). Audited main: `dab82cb24e03e7d9a24cb474c7711b0594b01606`.

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

Human editorial/key/taxonomy review, audio transcript fidelity and provider-rights confirmation, real mobile/desktop interruption testing, class-load testing, and school pilot signoff remain required. The current original Listening package is AI-authored **draft only**. On 2026-10-06, the owner approved audio v2 production (voices and timed pauses) and selected it for the screener. That approval is scoped; it does not certify the outstanding academic gates. Do not substitute browser speech synthesis as assessment audio.

Production migration applied as `20261005163109_ielts_governed_evidence_foundation.sql`; repository filename matches the Supabase migration ledger. Post-apply verification: six private RLS tables; no published diagnostics; authenticated/anonymous key access denied; legacy band/readiness helpers remain inaccessible; readiness evidence remains empty. Security advisor notices for policy-free private tables and the authenticated, explicitly authorized SECURITY DEFINER read wrapper are intentional boundaries, not grants to raw data.


## Selected Listening audio — v2

- Exact delivered SHA-256: `f9c48bc1233e40bd7c4cb29cb8c277234be36ddf9bdc6ef50eac4e6887ef3f65`.
- Durable object: existing Supabase `ielts-audio` bucket, `governed/listening-screener-a/audio-v2/f9c48bc1233e40bd7c4cb29cb8c277234be36ddf9bdc6ef50eac4e6887ef3f65.mp3`. The existing bucket is public; this selected replayable screener recording is not a secure unseen baseline/reassessment asset. No transcript or answer key is stored with the public object.
- 392.002 seconds of decoded audio; MP3, mono, 44.1 kHz, 192 kbps. Instructions: Miriam; passages: Paula, James, Marlene. Runway narration at normal speed, with separately assembled silence and volume normalization.
- Three 30-second reading intervals, 15 seconds after each passage, and a 2-second final tail. Encoded-file silence detection and a hosted-file hash round-trip were verified; HTTP byte-range playback returns 206.
- Definition `bh-listening-screener-a`, form code `BH-LS-A-1`, diagnostic version 1 references this audio. Twelve items remain in draft with private keys, unapproved taxonomy and no student assignments. The draft event has no school/scheduled delivery; the academic owner must choose those before activation.
- The private audio provenance record retains source task IDs, script hashes, settings, assembly choices and the owner's exact scoped approval. No expiring Runway URL is used for delivery.
- The one-time authenticated transfer accepted only the exact approved SHA-256/size at a fixed new path, denied anonymous requests, and used no overwrite. It was retired after upload; its deployed replacement requires JWT and contains no storage access. No storage policy or bucket visibility was changed.
- Publication and activation rejection were verified in a rolled-back transaction. Existing bands/readiness remain fail-closed. Actual school-device listening/interruption tests remain outstanding.
