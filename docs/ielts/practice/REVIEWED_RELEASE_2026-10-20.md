# Reviewed release, 2026-10-20

The owner (Sobbi) reviewed every item in the IELTS Approval Queue and sent his decision at 07:14 Asia/Bishkek. Nothing was marked as needing changes.

## Reading: released to all eligible students
R-019 to R-043 (25 tasks: Targeted Reading 03, 04 and 05). Each release is pinned to the exact content hash the owner saw. For each task, an originality review was recorded first ("fresh": the automated inventory comparison found no shared text, questions, recording or script). Migration: `20261020040000_ielts_targeted_reading_release_2026_10_20.sql`.

Every Reading skill on the Skill coverage tab now has a released practice task and a released fresh check.

## Listening: installed for the pilot (Gulzada)
L5 to L14 (Targeted Listening 05). The owner listened to each exact recording and approved it.
- The recordings are in the private `ielts-targeted-listening` bucket. They were uploaded by exact SHA-256 through a temporary capability-pinned function, verified by download, and the function was then retired with 410.
- The tasks are installed with `requires_review`. Jess confirms content in the app before allocation.
- No release row was created. Release to other students follows the pilot and needs a separate owner approval of each exact version.

Migrations:
- `20261020050000_ielts_targeted_listening_05_install.sql`
- `…050100_…_install_b.sql`
- `…050200_…_originality.sql`

## Limits
These are targeted practice tasks only. They are not calibrated equivalent forms and give no bands. Change is judged only by bh-practice-effect-v1 (provisional). School, entitlement, source-evidence and repeat-exposure checks still apply. Diagnostic Bible 2.0.0.

## Update 09:53: Listening released to all schools
The owner instructed: "release to all eligible students in any school". Listening L-020 to L-029 (codes l5–l14) are now released to all eligible students in every school. Each release is pinned to the exact content hash and the audio SHA-256 the owner listened to. Releases are not school-scoped. School membership, entitlement, source-evidence and repeat-exposure checks still apply when a teacher assigns. The named-student pilot had not been completed before this release; the release record notes this. Migration: `20261020060000_ielts_targeted_listening_05_release.sql`.

All 45 targeted tasks are now released.
