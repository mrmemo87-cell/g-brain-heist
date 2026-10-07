# Speaking Interview A — governed pilot

Bible: **1.2.0**, unchanged. Original content **0.1.0 / BH-SS-A-1**. This is an IELTS-aligned development snapshot, not an official test, calibrated Speaking band or full four-skill baseline. No numeric scoring or persistent-weakness inference is introduced.

## Owner and student journey

Open `/ielts/speaking-pilot` in the reviewer account. The first screen contains the exact original questions, rubric and instructions. Review editorial quality, task design, proposed construct mapping, difficulty/timing and rights, then explicitly approve that content hash. The server records the actual reviewer and time; deployment does not fabricate approval. The original pilot used only Gulzada’s named student ID. On 2026-10-07 the owner accepted that test and authorized publication for eligible IELTS users. A separate immutable release record binds that authorization to the approved content hash; student eligibility and the reviewer’s canonical allocation are still rechecked.

Confirm the student's agreement to recording and optional AI draft assistance. Conduct the conversation **in person**, using the teacher's signed-in device to capture both speakers. This is not a remote call platform. Begin with a microphone sample and listen for both voices. Part 1: familiar topics, 4–5 minutes. Part 2: one-minute preparation, up to two-minute long turn, then brief follow-up. Part 3: broader discussion, 4–5 minutes. Aim for 11–14 minutes total. Teachers can use neutral follow-ups, but must not coach or correct during the sitting. Extra questions/accommodations should be noted in conditions.

Eligible students can open the Speaking interview card in their IELTS screener hub. Teachers choose an authorized student, with name search limited to 50 matches; students see only their own saved interviews. Gulzada’s original evidence remains unchanged. During the interview, only Part 2's card is disclosed, after the teacher starts preparation; the student refreshes to open it. A paper card and notes are also suitable. Teacher questions are deliberately on the teacher screen. There is no claim of an AI examiner. After submission the teacher opens original audio and reviews all four criteria. The student reads clearly labelled teacher feedback and a next practice action from the saved interview. Repeats preserve all attempts and are labelled same-form practice, not evidence of improvement.

## Recording integrity and recovery

- Native MediaRecorder audio is checkpointed in an owner/session-scoped IndexedDB record every data event (requested every second). Final PCM WAV is retained before upload. Upload progress has explicit local/confirmed states.
- Backgrounding, microphone loss and interrupted recovery stop/qualify the clip; no silent recording restart. Offline recording can continue locally and is marked interrupted. Moving between parts or finishing is blocked while a recording/upload/local clip is pending.
- A crash can lose the last uncommitted browser buffer. Some truncated native containers may not decode. Recovery preserves available blobs and offers a device-backup download. After a failed recovery, the teacher can keep the interrupted local backup, record a server incident and record a new clip; the unusable backup is not claimed as submitted evidence. Actual browser interruption acceptance is required.
- Finished clips convert to 16 kHz, mono PCM WAV. The authenticated Edge Function downloads the immutable uploaded object and verifies its WAV structure, actual sample duration and SHA-256. The service-only receipt must match before the caller can attach it. The browser's claimed duration/hash never becomes academic truth.
- A new private bucket uses exact-session RLS, append-only paths, no authenticated update/delete policy and 12 MB object limits. Existing storage policies are bucket-specific and were inspected for overlap. Signed playback links expire after 15 minutes; failed/expired playback offers reopening.
- Up to nine clips retain interruptions/follow-ups. A two-minute long turn is captured independently; a brief follow-up can be recorded as another Part 2 clip. The preparation start is server-persisted and cannot be reset by refresh. The server authorizes a capture only after the preparation interval and the previous part is saved. Three parts must have uploaded clips before submission; short recordings remain limited evidence rather than being turned into language failure.
- Submission and clip attachment are idempotent. Original packages, session identity, completed sessions, clips, receipts and review history are immutable. Source hashes identify exact package plus audio evidence. Review updates append with concurrency checks.

## AI draft boundaries

Edge Function `ielts_speaking_pilot`, JWT required plus explicit Auth user validation. The browser supplies session ID and action only for drafting. Canonical permission is checked before claiming, after generation, and at final sharing. Service credentials and OpenAI key stay on the server. No student name, contact detail or account ID is sent in the task metadata; the recordings themselves can contain spoken personal information. Teachers should avoid unnecessary identity details.

The OpenAI Chat Completions audio API receives the actual WAV recordings, exact task/rubric and clip metadata. Default model is `gpt-audio-1.5`, configurable by server-only `IELTS_SPEAKING_DRAFT_MODEL`. This model alias is not a pinned snapshot; the requested model, provider-returned model identity, provider response ID and prompt version `bh-speaking-audio-simple-v1` are recorded for every draft. Before changing the model, run the owner pilot and an audio-grounded comparison. Audio models do not promise strict JSON-schema generation: the function parses output and validates it, and the database independently validates every criterion and time span before a ready draft is stored. One bounded retry, shared 85-second provider timeout; no unsafe transcript-only fallback.

Instructions require identifying student answers separately from the teacher, audio-based pronunciation, plain English, short sentences, evidence-related actions, neutral conditions wording, no native-accent requirement, no invented scores, no persistent labels, and ignoring spoken prompt injection. If the student cannot be identified or heard, use insufficient evidence. No transcript-only pronunciation claim is permitted.

AI timestamps are **proposed evidence locations**, not guaranteed forced alignment. Bounds are checked, but relevance and speaker attribution require teacher listening. The teacher must check all comments/clips, may edit every field, and must confirm before sharing. AI never submits a review. Existing notes can be restored from before drafting. Teacher final feedback and original AI fields remain separate in immutable history. A cached ready draft avoids repeat billing. Limits: 3 claims/10 minutes, 20/day per reviewer, one active request per session/reviewer; AI source duration capped at 20 minutes. Provider failure leaves teacher notes unchanged and manual review available.

## Validation and remaining gates

Automated validation covers WAV duration/structure, feedback evidence bounds, exact-version content approval, named-student/entitlement access, preparation enforcement, server audio receipts, immutable/idempotent submissions, teacher confirmation, draft provenance, concurrency and revocation. Normal repository typecheck, build, tests and migration security guard must pass.

Deployment does **not** establish real-device microphone/PCM conversion quality, IndexedDB recovery on Safari/Chrome, authenticated provider success/latency, speaker identification accuracy, audio timestamp accuracy, simple-language usefulness or calibration. Those need the owner/Gulzada acceptance on the exact deployed version. The eligible-user release adds no numerical readiness model. Independent students can view their workspace, but need an authorized reviewer to conduct an interview; publication does not create teacher allocations. These observations are not yet fed into calibrated readiness or Academic Profile persistence conclusions.

Official sources checked 2026-10-07:
- https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking
- https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf
- https://developers.openai.com/api/docs/guides/audio-chat-completions
- https://developers.openai.com/api/docs/models/gpt-audio-1.5
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder

## Eligible-user release — 2026-10-07

Content remains **0.1.0 / BH-SS-A-1**, exact hash `d40734da52eb22f3b03b839e4af65696681c554f30e84ce514561898c2f827ab`. Production records confirm owner approval of editorial/task/taxonomy/timing/rights, a submitted Gulzada interview with four audio clips, a ready AI draft and shared teacher feedback. The owner reported “We’re done with the speaking and was so great” and then explicitly authorized wider publication. This is user-reported acceptance; no additional device-specific passes or calibration are asserted.

`private.ielts_speaking_releases` records the approved hash, actual content approver, publication time and scope of acceptance without editing the immutable package. The release insert requires an approved package and completed, teacher-reviewed pilot with a ready AI draft. `rpc_ielts_speaking_workspace` lists only authorized eligible students, limits search results to 50, and returns up to 100 latest interviews for the selected student. Existing interview URLs remain accessible under the original permission checks. The old home/start endpoints remain compatible; the new start endpoint validates the selected student, published hash, reviewer permission, consent and idempotency.

Database regression tests cover broader eligibility, self-only history, student start rejection, cross-school reviewer rejection, unallocated teacher rejection, banned-user revocation, original pilot preservation, immutable release metadata and anonymous privilege denial. Capture, preparation, audio verification, teacher confirmation, AI instructions and assessment claims are unchanged.
