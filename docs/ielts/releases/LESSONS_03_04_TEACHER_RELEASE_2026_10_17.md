# Lessons 03–04 private teacher library release

Owner approved content revision **2026-10-17.1**, source SHA-256 `3e2f36e5713d8cb7851e4eb4868413b05f013e79189f28aa65aabd0217dc5cd2`, then approved the exact review recordings and requested live availability on 2026-10-17. This release exposes immutable instructional downloads to authorized Silk Road International School programme teachers only. It does not publish student tasks or enable course tracking/readiness functionality from draft PR #1644.

## Exact artifacts

The archived owner-approved review ZIP has SHA-256 `66feb1c16b2ec3d2994d624aa9a17e4a53c91d59feb4d42645e6d32ef30c0775`. The two delivery ZIPs copy each lesson directory byte-for-byte, with the original manifest/start/acceptance records; they omit the production-source directory. Historical review-state language inside those original records describes preparation-time checks; this release record supplies the later owner approval and installation state. No content/audio was regenerated.

| Code | Canonical title | Version | ZIP bytes | ZIP SHA-256 |
|---|---|---|---:|---|
| IELTS-03 | Listening details, spelling and word limits | 1.0.1 | 9463445 | cd1859cd81b7715b91975d526e5278457f28b309bce03f617eede5a64fb63ef7 |
| IELTS-04 | Clear paragraphs and Speaking Part 1 | 1.0.1 | 6714742 | c1a062401bca9d55ea8619d47904e1210d6087cb5fa8d067c14c4d5891669d43 |

The original per-file manifest and audio records travel in each pack. School identity is bound to the exact authorized school, not interpolated into reusable templates. The teacher library offers the complete offline pack, light HTML presentation with its embedded authorized logo, editable PowerPoint, and student-only workbook PDF. Complete ZIPs are teacher-only and contain keys and protected follow-up tasks.

## Authority and scope

Target main contracts: Diagnostic Bible **1.10.0**, Lessons Bible **1.1.0**, Visual & UX Bible **1.1.0**. The artifacts were produced against the stronger draft foundation contracts Diagnostic **1.11.0** and Lessons **1.2.0**, including the owner's explicit light-theme and shared smart-print requirements. This scoped release does not alter any Bible. LB-01/02/04/05/06/08/09/11 govern this installation. Lesson-local worksheet IDs remain local; canonical taxonomy, assignable material registration, inventory comparison and student release/pilot gates remain separate and disabled. No scoring, band estimation, student assignment, attempts, reports or historical evidence change.

Runway provider rights checked against its official commercial-use FAQ and Terms §4.4 on 2026-10-17: outputs may be used commercially subject to the agreement; Runway does not claim output ownership. The records identify Runway's supplied preset voices and `eleven_multilingual_v2`; no custom voice cloning was used. This records provider permission, not a universal originality or third-party IP guarantee.

- https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes
- https://runway.com/terms-ofuse

## Security and deployment

Private `ielts-teacher-course-packs` Storage bucket; immutable school/code/version/hash paths. Server-side metadata and Storage authorization reuse `can_manage_ielts_practice_school`, require a real non-banned user, and deny students, anonymous users and unrelated schools. Restrictive boundaries protect against unrelated permissive Storage policies. Clients cannot insert/update/delete pack objects. Metadata is private; only the scoped RPC returns release entries. Browser download verifies size and SHA-256. A synchronous lock prevents duplicate clicks; a school/unmount generation suppresses stale completions.

The temporary upload function accepted only the exact two compiled hash/size/path identities behind a 256-bit installation capability. Both stored objects were downloaded and SHA-256 verified after upload. It was immediately replaced with a JWT-required HTTP 410 handler; no ingestion capability remains. No binary, answer keys or secret was committed to the public repository. Original owner artifacts remain retained with the private review package.

## Validation and limits

- Typecheck, production build, protected portal guard and migration security guard.
- Local Postgres tests: authorized teacher, student, anonymous, banned, other school, unreleased objects, private-table/function grants, and an unrelated permissive Storage policy.
- DOM tests: private pack controls, separate student workbook, embedded logo in standalone slides, no eager audio, duplicate-click lock, school-change race, denied-load retry.
- Service tests: school/path identity, exact size, actual SHA-256, same-size tampering rejection.
- Existing Lesson 1/2 regression tests; CI gates recorded on release PR.
- Hosted SQL role checks use actual existing identities without modifying their roles or student work: SRIS programme teacher sees exactly the two released objects; Gulzada remains an active student and sees zero objects. This is authorization verification, not a student lesson pilot or authenticated browser acceptance.
- Prior exact-artifact evidence: 37 slide renders; 22 Chromium presentation/print workflows at 320/375/768/1440; school logo, keyboard/reduced motion, separate student keys and audio timing checks. See the retained pack acceptance record for details.

Physical printer output, physical classroom speaker audibility, Microsoft PowerPoint playback and 500-student concurrency remain unverified. None is certified by this teacher-only availability release. General student publication and diagnostic use remain governed separately. No claim that the full 24-lesson system or PR #1644 is live.
