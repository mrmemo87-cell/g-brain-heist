# School IELTS programme workspace

Contract: IELTS Diagnostic Bible 1.2.0. This is an operational and permission change; content, scoring, calibration and release gates are unchanged.

School Administration → IELTS Programme opens Programme Home. The shared teacher entry point is `/ielts/programme`; staff `/ielts` uses the same workspace. Today, Student progress, Review desk and Programme team connect the existing Speaking interview, Writing review, practice allocation and exam workflows. Platform-only content and launch analytics remain secondary tools.

## Programme lead allocation

In Programme team, a school administrator chooses an active teacher from that school's active membership, confirms the scope and saves. One current lead per school is allowed. No account is selected automatically, and user roles are never promoted. Leads can manage school IELTS practice/exams and review the school's eligible students. Normally allocated teachers retain their existing student scope. Allocation changes are immutable, audited, optimistic-concurrency checked and safe to retry with the same request ID.

Replacing/removing a lead revokes delegated access on the next server request. Banning the teacher or ending their active school membership also revokes it. Saved submissions, original recordings, scoring runs and shared feedback remain intact. School administration, billing and platform content publication are not delegated.

## Evidence and review

The student view shows the latest saved single-skill Listening/Reading screener result and original Writing/Speaking work within the caller's authorized scope. Objective results link to the canonical governed result RPC. Mixed forms are excluded from single-skill screener cards. Empty cells say “No submitted evidence”; they do not imply weakness. Confidence remains low; no overall band or readiness is calculated. The review desk prioritizes the 30 oldest submitted essays/interviews awaiting a shared review. Student search uses 50-row pagination.

AI remains an editable draft and requires the teacher's existing explicit confirmation before sharing. Marketing events never supply assessment evidence. Gulzada's original account, attempts, audio and feedback are preserved.

## Validation

PGlite integration executes the migration against the actual Writing reviewer, Speaking and governed-result functions. It exercises active same-school selection, cross-school and student rejection, replay, conflicting allocation, replacement, removal, bans, membership revocation, private history protection, anonymous RPC denial and original result access. DOM interaction tests bundle the actual React workspace and exercise confirmed administrator allocation, scoped RPC payloads, evidence rendering and hidden allocation controls on teacher accounts. Full repository verification includes the portal integrity guard, typecheck, migration security, production build and regression/database tests.

A Chromium browser preview could not run because its browser download failed in the execution environment. DOM tests do not prove visual rendering on Safari or physical devices.

No live teacher is allocated by an automated test. School administrators select the intended teacher. Automated checks do not substitute for human acceptance on phone/MacBook or establish assessment calibration.
