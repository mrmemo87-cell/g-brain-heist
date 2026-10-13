# Brains Heist IELTS Lessons Bible

**Version:** 1.0.0  
**Effective date:** 2026-10-13  
**Scope:** Lesson catalogue, teacher plans, presentations, audio references, student worksheets, keys, print packs and offline exports.

This is the lesson production contract. The Diagnostic Bible 1.9.0 governs assessment, evidence, audio provenance, security and release authority. The Visual & UX Bible 1.1.0 governs platform presentation and accessibility. Those contracts take precedence. This file does not certify every lesson or introduce new scoring rules.

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

Student printing excludes answers and scripts. Separate student and teacher documents. A4 print styles, deliberate page breaks and browser Save as PDF are supported. Do not claim automatic printer selection, duplex detection, class-copy counts or response capture until implemented and tested. Printing a teacher presentation exposes its answer slides and must be clearly labeled teacher-only. No paper response automatically becomes diagnostic evidence.

## 7. Platform evidence and follow-up — LB-07

Use the real governed Reading Screener in the normal student workflow. Never replace it with a lesson passage or expose hints during an independent attempt. Use authorized Student progress for saved evidence and existing assignment/source/exposure checks for follow-up. Keep course goals and reflection distinct from measured readiness. No new band, calibration, scoring or improvement claims arise from this lesson.

## 8. Verification and release — LB-08

Before releasing a changed pack, record the exact presentation and Bible versions and test all relevant requirements. Required evidence includes school escaping/isolation, student/teacher separation, content and ordering parity, audio hashes, click-only motion, static alternative, keyboard behavior, reduced motion, printable output, unauthorized access and failure paths. Inspect populated slides with representative approved content, including long prompts/school names, for clipping and overflow. Capture actual browser renderings at 375, 768 and 1440 px and inspect 320 px overflow. Record physical classroom audio and PowerPoint playback acceptance separately.

A green build or DOM test does not replace visual/device acceptance. Record uncovered checks explicitly. Preserve release blockers from the governing Bibles. Do not change a contract to make a failing implementation pass. Save test evidence with the lesson implementation record.

## 9. Versioning and automation — LB-09

Keep the presentation source reproducible. The shared lesson sequence generates both formats. Public templates remain generic. The download manifest binds school, lesson source version, presentation version, Bible version, material versions and content/audio hashes. Changing visual presentation does not falsely bump or replace approved material versions. New lesson/content versions require their existing review gates.

Lesson 1 implementation uses `services/ieltsLessonPresentation.ts`, the existing scoped teacher RPC, and `scripts/ielts/build-lesson-one-presentation.mjs`. Lesson production contract 1.0.0 and presentation 2.0.0 are distinct from approved material identities. Do not claim future lessons are automated until they are implemented and accepted.
