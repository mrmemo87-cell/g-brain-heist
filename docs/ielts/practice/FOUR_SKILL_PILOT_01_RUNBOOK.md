# Four-skill targeted-practice pilot

Bible: **1.5.0**. Version **0.1.0**, SRIS/Gulzada only. Two existing Listening tasks plus six new Reading, Writing and Speaking tasks. New materials require Jess’s exact-version confirmation in the assignment page before allocation. This is not public content approval, a full IELTS test, a calibrated reassessment or a capacity result.

## Test flow

1. Jess: Teacher portal → IELTS programme → Assign practice. Choose a task; inspect its passage/prompt, key and mapping. Confirm the material with review notes. Link the matching reviewed screener evidence and add an assignment reason.
2. Gulzada: IELTS Journey → Open your next targeted task. Complete and submit each assignment. Writing saves the paragraph. Speaking requires consent, microphone check, recording and Save recording before submission.
3. Interruptions: edit offline, return and Save now; refresh with unsynced work and choose the device or server copy. For Speaking, stop/save the interrupted clip before recording another. Do not discard a device backup until upload is confirmed.
4. Jess: Review desk → targeted practice → Review saved work. Read/listen to the actual response. Write all four simple next-step fields; Writing and Speaking also need all four criterion comments. Speaking requires an explicit audio-check confirmation. Confirm and share.
5. Gulzada: reopen saved work and check the explicitly attributed teacher feedback. Then attempt the fresh task without coaching; record help or interruptions.

No student work was fabricated or original screener results reset to prepare this pilot. Production technical checks use transactions ending in ROLLBACK. Human review records remain pending until the teacher acts.

## Evidence and implementation

Reading choices are server marked out of six; explanations stay separate for teacher inspection. Writing and Speaking have no automatic numerical score. Uploaded Speaking WAV files are private and immutable; the Edge Function authenticates the caller, validates ownership and PCM audio bytes, computes the hash/duration and confirms metadata through a service-only RPC. Retry does not overwrite an uploaded file. Device audio chunks and pending uploads retain owner/assignment boundaries. An interruption or reported assistance is a condition for review, never an ability judgement.

Each assignment stores the task version, teacher content review and submitted response/recording snapshot. Reviews are append-only. An exposed fresh-check task cannot be reassigned as independent evidence. Canonical English skill IDs are references to the task focus; they do not establish an IELTS/English equivalence and are not pooled into Academic Profile or band/readiness estimates.

## Review materials

### bh-ielts-targeted-reading-r1-v1 — A statement is not always a match

guided_practice · 0.1.0

Read the passage. Choose TRUE, FALSE or NOT GIVEN for each statement. Explain each answer using a short quote or the information that is missing. Explanations are reviewed by your teacher, separately from the six answer marks.

A university library piloted a quiet study room for six weeks. Students booked a place online, and each booking lasted up to ninety minutes. During the pilot, the room opened at 8 a.m. on weekdays; weekend opening hours stayed unchanged. Staff moved the printers into the corridor after students complained about noise. In the final week, most survey respondents said the room helped them concentrate. However, only thirty-two students returned the survey, so the library decided to collect more feedback before extending the scheme.

1. Students could reserve a place using the internet. — **TRUE**
2. A booking had to last exactly ninety minutes. — **FALSE**
3. The pilot introduced longer weekend opening hours. — **FALSE**
4. Printers were moved because they disturbed students. — **TRUE**
5. Every student who used the room completed the survey. — **NOT GIVEN**
6. Students preferred the quiet room to studying at home. — **NOT GIVEN**

1 TRUE — “booked a place online”.
2 FALSE — “up to” permits shorter bookings.
3 FALSE — weekend hours “stayed unchanged”.
4 TRUE — moved after noise complaints.
5 NOT GIVEN — thirty-two responses; total users and their identities are unspecified.
6 NOT GIVEN — no home-study comparison.
Discuss 2/3 as qualifiers and 5/6 as missing information. Do not teach “not exactly the same words means false”.

Focus: Decide whether a statement agrees with the passage, contradicts it, or cannot be established; identify the supporting evidence or missing fact.

### bh-ielts-targeted-reading-r2-v1 — Evidence before assumption

independent_check · 0.1.0

Read the passage. Choose TRUE, FALSE or NOT GIVEN for each statement. Explain each answer using a short quote or the information that is missing. Explanations are reviewed by your teacher, separately from the six answer marks.

A community centre introduced an equipment-lending service in March. Adults could borrow gardening tools after attending a short safety session. Members paid no borrowing fee, but left a refundable deposit. Tools had to be returned within seven days. During April, the centre received more requests for drills than for any other item. Because several tools came back dirty, staff introduced a cleaning checklist in May. The centre plans to review the service in September before deciding whether to buy more equipment.

1. A safety session was required before adults borrowed tools. — **TRUE**
2. Members paid a fee that was never returned. — **FALSE**
3. Borrowers could keep tools for two weeks. — **FALSE**
4. Drills were the most requested item in April. — **TRUE**
5. The cleaning checklist began when the service opened. — **FALSE**
6. The centre will definitely purchase more equipment in September. — **NOT GIVEN**

1 TRUE — “after attending” establishes prerequisite.
2 FALSE — no borrowing fee; deposit refundable.
3 FALSE — seven-day limit.
4 TRUE — more requests than any other item.
5 FALSE — March opening, May checklist.
6 NOT GIVEN — decision pending; future purchase is not established.
Record answer and explanation separately. Review errors by construct; one total cannot establish every target. This passage is a different context with different demands, not calibrated equivalent to R1.

Focus: Decide whether a statement agrees with the passage, contradicts it, or cannot be established; identify the supporting evidence or missing fact.

### bh-ielts-targeted-writing-w1-v1 — Make an example do useful work

guided_practice · 0.1.0

Write one developed paragraph. Aim for 80–120 words; this is guidance, not a submission minimum. Include a clear point, an explanation, a specific plausible example and a link back to your point. Do not invent research statistics.

Some people think schools should teach practical life skills alongside academic subjects. Develop one paragraph supporting that position.

Guided support: A useful life skill is… This matters because… For example… This shows…

1. Your paragraph

Review the paragraph within its limited task scope. Preserve actual excerpts and contrary evidence. A short paragraph cannot support a full Writing band. Do not invent a minimum-length penalty.

Focus: Develop a clear point using explanation and a relevant example; explain the link between the example and the point.

### bh-ielts-targeted-writing-w2-v1 — Develop a new argument

independent_check · 0.1.0

Write one developed paragraph. Aim for 80–120 words; this is guidance, not a submission minimum. Include a clear point, an explanation, a specific plausible example and a link back to your point. Do not invent research statistics. Work without sentence starters, model answers or live correction. Tell your teacher about any help you used.

Some people think students benefit from volunteering in their local community. Write one developed paragraph supporting or challenging this view.

1. Your paragraph

Review the paragraph within its limited task scope. Preserve actual excerpts and contrary evidence. A short paragraph cannot support a full Writing band. Do not invent a minimum-length penalty.

Focus: Develop a clear point using explanation and a relevant example; explain the link between the example and the point.

### bh-ielts-targeted-speaking-s1-v1 — Explain beyond the first answer

guided_practice · 0.1.0

Prepare short notes, then record approximately 45–90 seconds of speech. Explain your reason and add a relevant detail. The length is a practice guide, not a minimum ability threshold. Keep this tab open and save your recording before submitting.

Describe a place where you enjoy studying. Explain what it is like and why it helps you.

Guided support: What makes it suitable? Can you give an example? Has your preference changed?

1. Preparation notes (optional)

Listen to the actual recording. Review development, relevant detail and organisation; note genuine timestamps where useful. Pronunciation observations require audio. Duration alone is not ability, and this short turn is not a complete Speaking interview.

Focus: Develop and justify a response, connect ideas and sustain a relevant spoken turn.

### bh-ielts-targeted-speaking-s2-v1 — Explain a choice

independent_check · 0.1.0

Prepare short notes, then record approximately 45–90 seconds of speech. Explain your reason and add a relevant detail. The length is a practice guide, not a minimum ability threshold. Keep this tab open and save your recording before submitting. Allow yourself one minute to prepare. Speak without coaching, and record any help or interruption.

Describe an activity you would like to learn. Explain why it interests you and how you would start learning it.

1. Preparation notes (optional)

Listen to the actual recording. Review development, relevant detail and organisation; note genuine timestamps where useful. Pronunciation observations require audio. Duration alone is not ability, and this short turn is not a complete Speaking interview.

Focus: Develop and justify a response, connect ideas and sustain a relevant spoken turn.

## Official format references

- https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-test-format
- https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail

The official format informs the selected construct and four productive criteria. These short tasks have practice-specific guidance and do not reproduce full paper timing.

## Remaining acceptance

Jess’s content review and Gulzada’s phone/MacBook delivery checks must be recorded for each exact version. Wider rollout and 500-user capacity remain separate gates. There is no claim of sustained improvement, persistent weakness, resolution or a band estimate from this pack.

## Technical verification — 8 October 2026

- Full regression: 1,832 unit passes (2 pre-existing skips), 23 DOM passes and 52 database passes. An additional teacher-page DOM check verifies exact-content confirmation and matching Writing-source assignment.
- Typecheck, production build, nine protected school-admin contracts and 368-migration security guard passed.
- Production rollback-only verification exercised confirmation, matching source allocation, save, submit and teacher sharing for all six new tasks. Reading scored 6/6 for synthetic keyed responses; Writing/Speaking scores stayed null. Pre-submit keys and teacher notes stayed hidden. Every transaction ended with ROLLBACK.
- New Edge Function deployment active; unauthenticated POST returned 401. A real phone/MacBook microphone recording/upload still needs Gulzada’s acceptance test; synthetic database metadata is not an audio/device acceptance result.
