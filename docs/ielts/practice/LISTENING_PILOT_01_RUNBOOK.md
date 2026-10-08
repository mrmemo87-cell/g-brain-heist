# Reviewed Listening practice pilot

Bible: 1.5.0. Scope: the two owner-reviewed L1/L2 tasks only; Gulzada and the allocated SRIS programme team. Other Starter Pack tasks remain authoring drafts. No general student release.

## Jess and Gulzada
1. Jess opens the school IELTS programme workspace, then Assign practice.
2. Select Gulzada, inspect her linked Listening evidence, choose Photography workshop (guided practice) and write a simple reason for this assignment. Confirm assignment. The system does not invent the teacher’s diagnosis.
3. Gulzada opens IELTS Journey → Open your next targeted task. Listen, answer, save and submit. Replay is available for guided practice.
4. Jess opens Review desk, checks the saved answers and result, fills the four simple-language feedback fields, then confirms and shares. Gulzada sees an explicitly attributed teacher feedback card.
5. Assign Museum visit as an independent check when appropriate. It cannot be reassigned as fresh evidence after exposure. The two forms have not been calibrated as equivalent.

## Integrity and delivery
- Published canonical Listening registry mappings and immutable resource versions are recorded in LISTENING_PILOT_01.json. Each question has a primary construct and distractor-resistance supporting mapping.
- Approved MP3 files retain the reviewed SHA-256 hashes in private storage, with 30-second reading and 15-second response intervals. Signed access requires a scoped allocation or authorised programme teacher.
- Scripts and accepted keys stay out of pre-submit learner payloads. Scoring runs on the server; submissions are immutable and retries are idempotent.
- Revision-checked, dirty-only saves protect concurrent edits. Local recovery asks the learner to choose; failed saves block submission. Audio checkpoint recovery uses the exact recording hash, never autoplays, and retries seeking when playable.
- Source evidence must be server-verified and submitted, never void. Practice totals do not change screener results, produce bands, or prove improvement.
- Interruptions and replay metadata support teacher interpretation; they are not proof of independent conditions.
- Teacher feedback is confirmed before sharing and append-only. Historical practice links remain available; legacy evidence is preserved.
- Database migrations: 20261008195545 and 20261008201324. The temporary audio installer is retired with HTTP 410 and no installation capability.

## Verification and remaining gates
Automated database and DOM checks cover authorisation, concealed keys, draft conflicts, failed-save recovery, server marking, repeat exposure and teacher review. Production role checks used rollback-only transactions; no synthetic learner work was persisted.

Before wider release, Jess/Gulzada must complete the normal account pilot on phone and Mac: play/pause/resume, background/refresh checkpoint, offline edits and reconnect, submission/result, teacher sharing and student visibility. Confirm the final source and assigned reason against actual evidence. Record acceptance explicitly.

This implementation uses bounded reads, allocation-level locks and jittered autosave. No 500-user load result is claimed. The capacity rehearsal and other skill material review remain separate release gates. Public reuse/rights and difficulty/comparability review are also pending.
