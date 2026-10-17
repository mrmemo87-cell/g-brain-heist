# IELTS current-state audit and readiness report

2026-10-17 (Asia/Bishkek). Prepared against `main` at `edff597` and read-only queries on the verified Supabase project `g-brain-heist` (`sozodkxwhubespiedgxm`). No production data, schema, Storage object, role or release state was changed during this audit.

Governing versions on `main`: Diagnostic Bible 1.10.0, Lessons Bible 1.1.0, Visual & UX Bible 1.1.0, course roadmap 1.0.2. The 1.11.0 / 1.2.0 Bible proposals exist only in draft PR #1644 and are **not** current policy.

## 1. Verified facts

| Area | Evidence | Finding |
|---|---|---|
| IELTS-01 | Roadmap, lesson audit docs | Implemented; device and PowerPoint playback acceptance gaps remain recorded. |
| IELTS-02 | `private.ielts_teacher_lesson_two_content`: 1 row, 1 released | Teacher content released; human review of the exact source and student task publication remain separate. |
| IELTS-03/04 | `private.ielts_teacher_pack_templates`: 2 rows; release record `releases/LESSONS_03_04_ALL_SCHOOLS_2026_10_17.md` | Owner-approved all-school teacher packs with server-authorized branding. Student tasks unreleased. |
| IELTS-05–24 | Repository | Planned only before this change. Lessons 05–08 now exist as private review drafts (section 3). |
| Targeted practice tasks | `private.ielts_learning_tasks`: 10 tasks, v0.1.0 — Listening 4, Reading 2, Writing 2, Speaking 2; 8 flagged `requires_review` | Narrow bank. No Academic Writing Task 1, no full Task 2, no matching headings/information/features, no map/plan labelling, no Speaking Part 2/3 tasks. |
| Reviewed practice releases | `private.ielts_reviewed_practice_releases`: 15 events | Controlled release workflow exists and works; it does not establish question-type coverage. |
| Storage | Buckets: `ielts-audio`, `ielts-recordings`, `ielts-speaking-pilot`, `ielts-targeted-listening`, `ielts-teacher-course-packs` (4 objects) | Private pack storage in place. |
| Latest applied migration | `20261017092925` | PR #1644 migrations (`ielts_course_learning_record`, `ielts_teacher_readiness_decisions`) are **not** applied. |
| PR #1644 | Draft, `mergeable_state: dirty` (conflicts with main), 48 files, 2 migrations, Bible edits, an AI readiness-estimate function and a 357-line readiness-estimate UI | Not mergeable as-is. Needs owner decisions (section 4). |
| PR #1648 | Open, clean, docs only | Blueprint is consistent with main's Bibles; it is a plan, not an implementation. |
| Issues #1647, #1649–1652 | Open | Tracker and four workstreams; none closed. |

## 2. Gaps against the Band 8.5 programme

1. **Curriculum:** 20 of 24 lessons had no pack. Writing Task 1, Speaking Part 2/3 and timed full-format work had no teaching material.
2. **Task bank:** 10 short targeted tasks cannot support evidence-led progression across all IELTS Academic question types, and there are no unseen parallel forms for fresh checks.
3. **Audio:** every new Listening lesson needs new recordings through the approved workflow. This is the critical path for Lessons 05, 10, 14, 17 and 21.
4. **Progression engine (#1650):** two assignment routes exist (targeted practice; school/batch allocation). No guided → independent → fresh-check phase metadata or teacher suggestion engine yet.
5. **Longitudinal engine (#1651):** reports keep history; the §8A observation ledger and approved change policy do not exist. Improvement/persistence labels must stay disabled until they do.
6. **Assessment quality (#1652):** no teacher calibration set or moderation/disagreement records; no full-format mock forms.
7. **PR #1644:** proposes course tracking, paper evidence and a teacher readiness estimate, but it conflicts with main and edits both Bibles.

## 3. Work completed in this change

- **Lesson factory** (`docs/ielts/lessons/LESSON_FACTORY.md`): schema-2 lesson source, an automated source contract with key verification, a generic pack builder and a pack validator. 18 tests added to `test:ielts:programme`, including mutation tests for each guard.
- **Lessons 05–08** as private teacher-review drafts v0.1.0 with differentiated A–D pathways, guided and independent work, withheld fresh checks and delayed follow-up plans. Details and hashes: `lessons/LESSONS_05_08_REVIEW_DRAFT_2026-10-17.md`.
- No runtime code, RPC, migration, RLS, Storage, catalogue entry, assignment or student record changed.

## 4. Decisions needed from the owner

1. **Review Lessons 05–08** content and keys using the review record in each pack; record real decisions.
2. **Commission recordings** IELTS-05-L1, IELTS-05-L2 and IELTS-05-C1 through the approved audio workflow (scripts are in the Lesson 05 source).
3. **PR #1644:** decide whether the teacher readiness-estimate feature (Diagnostic Bible §9.4 route) should proceed. If yes, it should be rebased onto current main as a separate PR without the Bible edits, and the Bible changes proposed separately with justification. Until then, leave it draft.
4. **Confirm next batch order:** Lessons 09–16, beginning with the non-audio lessons (09, 11, 12, 13, 15, 16) while recordings for 10 and 14 are produced.

## 5. Production readiness by area

| Area | State |
|---|---|
| Lessons 01, 03, 04 teacher packs | Implemented, awaiting human or operational acceptance (device/playback gaps recorded) |
| Lesson 02 teacher pack | Implemented, awaiting human or operational acceptance |
| Lesson factory (source contract, builder, validator, tests) | Implemented and verified (automated); not yet accepted by the owner |
| Lessons 05–08 | Draft, unreleased |
| Lesson 05 recordings | Blocked: approved audio workflow must produce and review three recordings |
| Lessons 09–24 | Not yet implemented |
| Advanced task bank (all question types, parallel forms) | Not yet implemented |
| Assignment progression engine | Not yet implemented (existing routes preserved) |
| Longitudinal learning intelligence (§8A) | Not yet implemented; blocked on an approved, versioned evidence policy |
| Writing/Speaking calibration and moderation | Not yet implemented |
| Full-format mock pathway | Not yet implemented |
| Course tracking and readiness (PR #1644) | Blocked: draft with merge conflicts and Bible edits needing owner decision |

The complete programme is **not** production-ready. This report makes no claim about student attainment, band outcomes or calibration.
