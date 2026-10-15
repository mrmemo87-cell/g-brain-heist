# IELTS course batches — 15 October 2026

Uses Diagnostic Bible **1.9.0**, Visual & UX Bible **1.1.0** and Evidence Blue tokens. This is course administration, with no new assessment, band, confidence, content, release or learning-inference policy. No Bible contract revision is needed.

## Teacher flow

1. Open IELTS Programme → Programme team → Course batches.
2. Manage the course roster; names, usernames and original school classes are shown together. Only currently eligible school IELTS students can be added. Save roster explicitly.
3. Open school assignments → New assignment → choose the named batch in Assign to class or batch.
4. Add instructions and approved catalogue material. Review prior use for current batch members and acknowledge intentional repeats where required.
5. Review and confirm. Each student retains a separate assignment/progress record in the existing system.
6. Add a late joiner to the batch first. For catch-up, open an active batch assignment → View progress → Add batch members. Select the missing students, check material use and confirm. The original instructions and due date apply; completed work is retained. Nothing is allocated simply by joining a batch.

A batch is separate from registration classes and selected-subject teaching groups. It is scoped to a school and operational academic year. Jess's existing programme-lead authority manages Silk Road; creating a batch does not grant another teacher school-wide access. School agreements/seats and all material/source/exposure/review gates still apply.

## Persistence and access

Private tables contain batches, current/departed memberships, audit events and immutable assignment recipient snapshots. RLS is enabled and direct public/anonymous/authenticated access is revoked. Narrow authenticated RPCs check real actor identity, ban status, current school programme management and academic year. No client metadata grants access. No public roster directory exists.

Roster writes use optimistic revisions. New assignment creation has an explicit request identity and original request payload; replay returns the same draft, while changing an uncertain request's contents requires checking saved work. Allocation retries use the original draft roster snapshot. Explicit catch-up accepts only current eligible members on an open assignment and reuses the existing allocator, uniqueness constraints and item triggers. Closed/archived assignments reject new allocation. Removing a member retains academic history.

The existing scoped assignment payload gains optional batch name/identity only. All old class fields, source codes, provenance and progress behavior remain. No answer-save/scoring path is changed. Batch creation serializes one request; roster writes lock one batch; allocation locks one assignment. Queries are bounded (50 candidates plus next-page marker; 500 batch members; 50 material identities). This does not establish 500-user capacity; affected batch/dashboard/allocation workloads require staged load evidence before such claims.

## Verification

- 31 focused database/DOM regressions passed, including actual legacy allocator functions, cross-class membership, invalid/outside-school members, banned manager, stale revisions, request replay, assignment retries, preserved completion, explicit catch-up, closed assignments, scoped material use, error states and normal class recovery.
- Added tests are wired into the existing programme and database scripts. Existing lesson-library tests pass independently.
- Chromium rendered the real components with synthetic scoped RPC fixtures at **320, 375, 768 and 1440px**: roster save and assignment review worked at each width, no horizontal page overflow or browser errors. Phone roster and desktop assignment screenshots were visually inspected. Tests caught and fixed a list-refresh/roster-response race after saving.
- Protected portal, typecheck, migration-security and production build checks passed before publication. The first broad test run was blocked by the scratch installation's missing native canvas binding; rebuilding restored all seven scanner regressions. Broader hosted CI is required on the published head.
- Supabase migration applied to the existing verified g-brain-heist project. Silk Road's October batch was created through the authenticated Jess management RPC with nine currently eligible students from 11A/11B/11C/12A. Live scoped roster and history reads succeeded. Anonymous execution/direct roster reads are denied. The 12 existing school exam attempts retained the same status/update integrity hash across setup.
- Security advisors were reviewed: the new private deny-by-default tables have expected no-policy informational notices; authenticated definer endpoints have intentional notices and explicit internal authorization. No new anonymous batch endpoint or mutable-search-path finding was introduced. Unrelated existing project advisories remain outside this change.

Remaining checks: real signed-in teacher/student browsers, actual classroom devices, full role/device/zoom/assistive-technology matrix, concurrent 30→100→500 batch traffic and physical classroom acceptance. Synthetic Chromium checks do not certify these. No real learner assignment or attempt was created for testing.
