# Speaking practice mock with a recorded examiner — pilot plan

Bible: **2.7.0**, section 10.12. Status: **plan approved by the owner on 2026-11-21; nothing built yet.** This file records the agreed design and the pilot. It is updated with real evidence as each step ships.

## What this is

A full three-part IELTS-style Speaking sitting that a student takes alone. A recorded examiner voice asks every question; the student's answers are recorded and go to the teacher for review through the existing interview pipeline. It is labelled **Speaking practice mock · Recorded examiner · Not an official IELTS test** everywhere.

It is practice only. It never counts as a Speaking screener, a starting point or independent evidence. Whether it may count for screeners later is the owner's decision after the comparison below, and needs its own Bible revision.

## Owner decisions (2026-11-21)

| Question | Decision |
|---|---|
| Question set | A new original package, **Mock B**, drafted by Claude and approved by the owner by exact hash. Interview A stays a screener (Bible 15F). |
| Who runs it | The student, alone, in their own time and place. No group sessions. The teacher interview is booked separately. |
| Who starts it | A teacher assigns it; one attempt per assignment. |
| Questions on screen | Parts 1 and 3: heard only. Part 2: the cue card is shown. |
| Replay | Part 1 questions may be heard again once. Everything else plays once. |
| Answer files | Single-answer files are deleted once the joined recording for that part is verified. |
| Voice audio | Made once per package with Runway text-to-speech. The owner sees the exact lines, how many, and the cost before anything is generated. |
| Voice consent for improving Brains Heist | Asked of the student only where the school has recorded that it holds the parents' agreement. Stored, but not used for any training until the owner records a legal review. |

## Student flow (one action per screen)

1. **Mock card** in the IELTS hub, only when assigned: title, about 12–14 minutes, "you will be recorded", "your teacher will check it".
2. **Before you start:** find a quiet place, use headphones if you can, keep the screen open. Recording agreement in plain words. One button: **I agree, continue**.
3. **Voice consent** (only where the school holds parents' agreement): "May Brains Heist use your recording to improve the app and its AI?" **Yes / No**. No changes nothing.
4. **Sound check:** a short examiner line plays. **I can hear it**.
5. **Room check:** the app listens for 5 seconds. Too loud: "Too noisy. Find a quieter place and try again."
6. **Microphone check:** say one sentence, see the level bar, hear it back. **Sounds good** (cannot continue until a clear voice is heard).
7. **Part 1:** each question plays, then recording starts by itself: red dot, "Recording", time left. **I've finished** and, once, **Hear again**.
8. **Part 2:** instructions play, the cue card appears with a 1:00 preparation timer (kept on the server). "Please start speaking now" plays; recording runs up to 2:00 and stops by itself. Follow-up questions follow.
9. **Part 3:** like Part 1, without replay.
10. **End:** "Thank you. That is the end of the speaking test." Then "Saving your answers…" and **Done — your teacher will check it.** No score, band or AI comment.

If the tab closes, the phone sleeps or Wi-Fi drops, every answer already recorded is kept on the device and sent when possible. Opening the mock again continues at the next question.

## Teacher flow

- **Assign:** choose students, one attempt each.
- **Prepare examiner audio (owner, once per package version):** see every line with its number, approve the list and the cost, then listen to each generated line and approve it. Editing a line makes a new script version; only that line is made again.
- **Review:** the existing interview review, labelled **Practice mock · Recorded examiner · unsupervised**. Transcript (with the question each answer belongs to), highlights, pronunciation words, teacher-only AI estimates, bands and sharing work as today.

## Build steps (each a separate pull request with tests)

1. Bible 2.7.0 and this plan (this pull request).
2. Database: delivery mode and practice-mock evidence kind on sittings; mock assignments; examiner script and audio records; answer and part records; voice-consent and school parental-agreement records; private storage. Every existing reader of Speaking sittings checked so mocks never count as screeners.
3. Server step that verifies answers and joins each part into one recording, then hands it to the existing `attach` route.
4. Student screens.
5. Teacher screens: assignment, script and audio approval, review labels.
6. Mock B content for owner approval, then the voice lines after the owner's OK on lines and cost.

Unchanged throughout: `ielts_speaking_pilot` (attach, analyse, estimate, draft), `_shared/ieltsSpeechToText.ts` and its transcribe-once locking.

## Pilot

1. **Gulzada's account first** (AGENTS.md), through the normal assignment path, on a phone and on a laptop.
2. **6–8 students** each take the mock and a teacher interview within one week; half do the mock first.
3. The same teacher bands both sittings **before** opening the AI estimates.
4. Record per student: both sets of bands, which came first, device, interruptions, upload delays, transcript completeness, noisy-room warnings and where the student hesitated or asked for help.
5. Report agreement within ±0.5 and ±1.0 band and the main differences. A small pilot finds problems; it does not validate the mock.

## Open gates

- [ ] Mock B content approved by the owner (exact hash).
- [ ] Examiner lines approved; credit cost approved before generation.
- [ ] Every generated line listened to and approved by a named person.
- [ ] Legal review of voice-improvement consent for the students' countries (until then no recording is used for improvement).
- [ ] Real-device checks: phone and laptop, Chrome and Safari, closed tab, lost connection, sleep.
- [ ] Pilot comparison recorded.

No capacity claim is made by this pilot (Bible section 13).
