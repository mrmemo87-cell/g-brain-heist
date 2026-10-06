# Listening Screener A launch

Contract: IELTS Diagnostic Bible v1.2.0. The retired travel-to-France activity remains retired.

The old `/ielts/trial-test-2` entry and `/ielts/listening-screener` both open the governed screener discovery page. `/ielts` links to it. Users without a paid school IELTS allocation can access this free entry without gaining access to paid practice or other school exams.

Discovery reads a server projection. Starting reserves one assignment per user and release; resuming uses the same assignment and existing Exam Mode attempt. School context comes from the canonical user record; independent context remains null. No second runner, attempt engine or client scorer exists.

Published content remains immutable. Release records bind the exact published content hash and audio SHA-256. Rights attribution must be Brains Heist LLC; reviewer/provider identity is preserved separately. Public release requires recorded controlled delivery evidence matching both hashes. A controlled pilot may establish that evidence, but is restricted to its explicit participant list.

Server-only maintenance functions:

- `private.publish_ielts_screener`: verifies the reviewed content/audio hashes and invokes the existing publication trigger.
- `private.activate_ielts_screener_release`: validates the release, activates the matching form, performs the audited live transition and records authorization. Anonymous and authenticated clients cannot execute it.

The migration does not seed content, publish a diagnostic or enable public availability automatically.

Delivery guards:

- All assignment, attempt, draft, incident and submission writes use existing controlled RPCs.
- Older or duplicate autosave versions cannot replace a newer saved response.
- Resume hydrates the server draft version.
- Backgrounding, submission and inactive states stop audio.
- Expired self-service attempts finalize the last server-saved responses through the existing submission/scoring path. Late client answers cannot change that evidence.
- Results expose raw performance, low confidence and sampled evidence. They expose no band, overall readiness, persistent weakness, transcript or keys.

Validation performed for this change: IELTS regression checks, executable governed-evidence and classroom/auth database tests, typecheck, build, migration security guard, shared portal guard, diff check, real production rollback validation, and download/SHA-256 verification of the approved durable audio object.

**Remaining release gate:** real authenticated browser/device delivery checks, including school student context, interruptions, mobile/desktop audio and completed result persistence. Synthetic database tests do not replace these. Record their actual evidence and dates before broad activation; never mark an unperformed check as passed.
