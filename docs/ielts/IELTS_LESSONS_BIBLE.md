# Brains Heist IELTS Lessons Bible

**Version:** 1.2.0
**Effective date:** 2026-10-19
**Scope:** Lesson catalogue, teacher plans, presentations, audio references, student worksheets, keys, print packs and offline exports.

This is the lesson production contract. The Diagnostic Bible 2.0.0 governs assessment, evidence, audio provenance, security and release authority. The Visual & UX Bible 1.2.0 governs platform presentation and accessibility. Those contracts take precedence. This file does not certify every lesson or introduce new scoring rules.

## 1. School identity and access — LB-01

Resolve school name and permitted logo from the authorized school context. Never hardcode Sobhy, SRIS or another school into reusable materials. Escape school/content values in HTML and XML. Only HTTPS logo URLs are permitted. School-specific downloads must not finish under a superseded school context. The server authorizes teacher access. Client navigation and query parameters do not confer access.

Public templates contain placeholders and general instructions only. Private questions, scripts, answers and approved recordings come from the authorized versioned material source. Teacher packs are private instructional documents, not student handouts. No Reading Screener answers may enter lesson exports.

## 2. Complete lesson record — LB-02

Every published lesson needs a stable lesson code, learning purpose, prerequisites, ordered timed stages, teacher actions, student actions, source material versions/hashes, presentation version, Bible version, preparation list, adaptations, exit evidence and follow-up. An author must verify that stage durations fit the intended lesson and the platform assessment's published duration. If they do not fit, adjust the timetable before class.

Every catalogue entry must distinguish available lessons from planned/unpublished lessons. A completed Lesson 1 does not imply a complete course. Release each subsequent lesson independently with its complete pack.

## 3. Teaching sequence and creativity — LB-03

Use a concrete opening challenge, purposeful practice, student commitment, evidence discussion and a next step. Vary the composition to communicate purpose: dark opening/round slides, spacious question slides, clear answer reveals and quiet reading/reflective sections. Use a coherent type hierarchy and substantial whitespace. Creative choices must help learners notice, decide or explain. Avoid decorative loops, invented quotations, score promises and unrelated effects.

Each guided question precedes its answer reveal. Students commit before the teacher advances. The authorized accepted answer is verbatim, including permitted alternatives. The teacher uses the approved script to locate supporting detail. Generic reflection prompts must never masquerade as an item-specific explanation. Every question needs a corresponding workbook item and reveal. Presentations include speaker notes for conducting the activity.

## 4. Presentation and motion — LB-04

PowerPoint and offline HTML use the same ordered teaching sequence. Required slide identity: school, lesson code, presentation version and slide position. Use Evidence Blue: ink #15243A, primary #1746B0, white/light canvas, and readable contrasting text on dark slides. Use an available font and editable native PowerPoint text. Aim for title 48–60 px and body 30 px on the 1280×720 source canvas. Never truncate approved content to fit a template.

Finite fades are allowed at 250 ms. Advance and answer disclosure require a teacher action. No automatic slide advancement, timer-driven disclosure, audio autoplay or animation dependency. Answers occupy separate reveal slides, so motion-free presentation preserves the teaching sequence. Provide a motion-free PPTX and respect system reduced motion in HTML, with a manual control. HTML supports Previous/Next, arrow keys, Space, Home/End and a slide selector, clear keyboard focus, 44 px controls and live slide status. Keyboard shortcuts must not hijack focused controls. Teacher notes remain hidden unless requested.

Native PowerPoint transitions must be structurally valid, click-controlled and free of automatic advance. Validate actual playback in the intended PowerPoint version before claiming PowerPoint playback acceptance. Static renderings and XML tests cannot prove animation playback.

## 5. Approved audio — LB-05

Use the existing approved IELTS audio source. Audio policy is Diagnostic Bible sections 6.1–6.1.1, including immutable asset/script versions, measured pauses or explicit teacher-controlled player pauses. Never substitute regenerated speech, alter a track, add an answer cue, or auto-publish a new asset during a design upgrade.

Download only scoped authorized audio and verify the recorded SHA-256 before including it in a pack. Keep playback under teacher control and use the matching workbook/script. Students read all questions before playback. Do not reveal answers during the recording. Record help and replays. Guided listening remains rehearsal.

## 6. Downloads and smart printing — LB-06

Each available lesson includes teacher plan, editable presentation, motion-free alternative, offline presentation, student workbook, private scripts/keys, approved audio, offline player, start guide and a versions manifest. An offline ZIP retains everything required for guided practice. Platform assessments still require student access to Brains Heist.

Student printing excludes answers and scripts. Separate student and teacher documents. A4 print styles, deliberate page breaks and browser Save as PDF are supported. Do not claim automatic printer selection, duplex detection, class-copy counts or response capture until implemented and tested. Printing a teacher presentation exposes its answer slides and must be clearly labeled teacher-only. No paper response automatically becomes diagnostic evidence; it enters the learning record only through the teacher capture route in Diagnostic Bible section 12A.

## 7. Platform evidence and follow-up — LB-07

Use the real governed Reading Screener in the normal student workflow. Never replace it with a lesson passage or expose hints during an independent attempt. Use authorized Student progress for saved evidence and existing assignment/source/exposure checks for follow-up. Keep course goals and reflection distinct from measured readiness. A lesson creates no band, calibration, scoring or improvement claim by itself. Its designated fresh checks feed the learning record under Diagnostic Bible section 12A, and indicative band ranges arise only from eligible full forms under section 9.5.

## 8. Verification and release — LB-08

Before releasing a changed pack, record the exact presentation and Bible versions and test all relevant requirements. Required evidence includes school escaping/isolation, student/teacher separation, content and ordering parity, audio hashes, click-only motion, static alternative, keyboard behavior, reduced motion, printable output, unauthorized access and failure paths. Inspect populated slides with representative approved content, including long prompts/school names, for clipping and overflow. Capture actual browser renderings at 375, 768 and 1440 px and inspect 320 px overflow. Record physical classroom audio and PowerPoint playback acceptance separately.

A green build or DOM test does not replace visual/device acceptance. Record uncovered checks explicitly. Preserve release blockers from the governing Bibles. Do not change a contract to make a failing implementation pass. Save test evidence with the lesson implementation record.

## 9. Versioning and automation — LB-09

Keep the presentation source reproducible. The shared lesson sequence generates both formats. Public templates remain generic. The download manifest binds school, lesson source version, presentation version, Bible version, material versions and content/audio hashes. Changing visual presentation does not falsely bump or replace approved material versions. New lesson/content versions require their existing review gates.

Lesson 1 implementation uses `services/ieltsLessonPresentation.ts`, the existing scoped teacher RPC, and `scripts/ielts/build-lesson-one-presentation.mjs`. Lesson production contract 1.0.0 and presentation 2.0.0 are distinct from approved material identities. Do not claim future lessons are automated until they are implemented and accepted.

## 10. Course continuity and post-screener teaching — LB-10

The owner-requested reference course has 12 teaching weeks and 24 lessons, two 60-minute lessons per week. This is a teaching framework, not a guaranteed attainment timeline. The ordered reference sequence and release inventory live in [IELTS_COURSE_ROADMAP.md](./IELTS_COURSE_ROADMAP.md). Keep stable lesson identities while allowing a teacher to revisit a strategy or adjust scaffolding from actual evidence. Record intended test type; the current draft sequence assumes Academic, subject to programme confirmation before release.

After screeners, inspect saved outcomes and required productive-skill reviews. Record up to two immediate evidence-linked priorities per learner, the next activity and the next check. Pending evidence requires a collection plan, not invented priorities. Teach a shared core lesson with foundation support and extension tasks. Alternate receptive and productive work across each teaching week. A repeated or corrected task remains practice. Check transfer using a fresh task, then later follow up, subject to Diagnostic Bible section 8A; never use the ESL course's six/four-question routine as an automatic IELTS scoring rule.

**The course is shared in class and personal in practice (v1.2.0).** The 24 lessons are the shared classroom core. Around them, every week runs the learning loop in Diagnostic Bible section 15B.5:
- batch targeted practice personalised to each student's qualified targets;
- AI first-pass feedback on Writing and Speaking practice;
- a short teacher confirmation queue;
- fresh checks that update the learning record.

Homework in each pack is the minimum shared task. Targeted practice is assigned in addition, not instead.

**Pace follows evidence.**
- A batch whose evidence shows a lesson's target is already secure may compress that lesson to a short check and spend the time on targeted practice or an extension lesson.
- A batch that is not ready may add a lesson-length review.
- Teachers record the decision and its evidence. Lesson identities and the order of the core sequence stay stable.

**Extension lessons X1–X8** are optional 60-minute lessons for task types that need more practice. The batch view suggests the matching extension lesson when several students share a qualified target in its constructs; the teacher decides.

**Mocks M1–M3** are full-length reassessments, scheduled outside the 60-minute lessons:
- the reference placement is M1 after Week 6, M2 in Week 9 and M3 in Week 12;
- deliver them on computer by default, or on paper with item capture (Diagnostic Bible section 12A);
- their results update each student's record and give an indicative band range (section 9.5);
- each mock is followed by a review lesson slot, using IELTS-21–24 where they fall, that turns the results into each student's next targets.

New students follow their own intake and essential catch-up pack, then join the current shared lesson. Do not restart the class, overwrite attempts or force retakes. Track joining date and missed teaching. Reports use actual exposure and period cutoffs under section 15C. Monthly reviews are scheduled teaching events, not evidence that improvement occurred. A full mock needs sufficient separately arranged time; never compress it into one 60-minute lesson.

## 11. Pack handoff, dependencies and review states — LB-11

Every pack begins with `01-START-HERE.html` stating lesson purpose, prerequisites, exact files to open/print, what needs internet, audio requirement or explicit 'No recording required', missing-evidence route, Plan B and next action. Include printable teacher guide, student workbook, homework, private keys/models and an observation/planning sheet. Paper work is classroom evidence unless it is entered through the governed capture route (Diagnostic Bible section 12A). Do not claim it appears in IELTS Journey automatically.

Keep question/reveal order, item identities and accepted answers aligned across HTML, PPTX, workbook and teacher keys. Keep fresh follow-up prompts in a separate teacher-controlled file, away from advance student homework. Log support and prior exposure. Do not call a new prompt comparable merely because it is fresh.

New AI-authored lessons and mocks are teacher-review drafts until the required human editorial/key/mapping/difficulty/originality checks pass. AI-produced targeted-practice materials may instead use the recorded batch sample review in Diagnostic Bible section 15E.2A. Preserve a blank review record with exact hashes and outstanding gates; generation and technical QA cannot record human approval. Preparation authority does not itself authorize publication. Drafts may be delivered privately to the owner for review, but must not be placed in public assets or listed as released student materials. Lesson-local worksheet IDs must not impersonate server-assigned L/R/W/S catalogue codes. Installation into a catalogue needs the existing section 15D/15E registration and release path.

## 12. Revision record — 1.1.0 (2026-10-14)

The owner requested permanent consistency and preparation of the next lesson after the agreed course discussion. LB-02 defined complete individual lessons but did not define course continuity, rolling intake or the post-screener handoff. LB-10/LB-11 now bind those teaching and packaging requirements to Diagnostic Bible 1.10.0. Basis: explicit owner instruction and existing assessment/release governance. No official IELTS format, grading, scoring, thresholds, published assets or saved student work change. Visual & UX Bible 1.1.0 remains unchanged because the visual contract already covers this work.

Affected production components: course roadmap, lesson authoring/export builders, teacher start guides, planning worksheets, release inventory and future scoped lesson-library installation. Lesson 2 is prepared as a private review pack; this revision does not certify its publication, phone acceptance, PowerPoint playback or programme availability.

## 13. Revision record — 1.2.0 (2026-10-19)

**Authority and basis.** The owner instructed on 2026-10-19 that the Bibles follow best practice for results ("nothing is sacred"). This revision aligns lesson production with Diagnostic Bible 2.0.0's closed learning loop.

**What changed**
- LB-10: the course is shared in class and personal in practice; pace follows evidence.
- LB-10: extension lessons X1–X8 and mocks M1–M3 are now part of the contract, and mocks feed the learning record.
- LB-06/LB-07/LB-11: paper work enters evidence only through section 12A capture, and practice materials may use batch review.

**What did not change.** Teacher-controlled motion and audio, student/teacher document separation, school identity, review states for lessons and mocks, and LB-08 acceptance evidence.

**Affected components**
- the course roadmap;
- the teacher batch view;
- mock delivery and capture;
- pack start guides, at the next pack revision.

Released packs keep the Bible versions they were approved under.
