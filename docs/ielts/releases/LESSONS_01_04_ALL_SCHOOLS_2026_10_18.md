# Lessons 01–04 in the classroom format: teacher release to every eligible school

Release date 2026-10-18 (Asia/Bishkek). Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-01/02/04/05/06/08/09/11); Visual & UX Bible 1.1.0.

## Authority

On 2026-10-18 at 15:37 Asia/Bishkek the owner wrote in the review conversation: "I also need the first 4 lessons in the same way now and make sure all are published to all schools", and attached the four packs downloaded from the teacher library. The content was already approved:

| Lesson | Approved content carried over |
|---|---|
| IELTS-01 | Live Lesson 1 (teacher guide 1.1.0, presentation 2.0.0); released guided materials L-003, L-004, R-001; L-003/L-004 recordings approved by the owner after listening on 2026-10-09 |
| IELTS-02 | IELTS-02 v1.0.0, approved by the owner for teacher use on 2026-10-16 |
| IELTS-03 | Content revision 2026-10-17.1 and its exact recordings D03-A, D03-B, D03-F, approved by the owner on 2026-10-17 |
| IELTS-04 | Content revision 2026-10-17.1, approved by the owner on 2026-10-17 |

Each source (`docs/ielts/lessons/lesson-01..04/lesson.json`) records this in `approval_record` and lists, in `conversion.additions`, every editorial addition made during conversion (for example stage "say/check" lines where the original guide gave only the teacher action, differentiation summaries, and short reasons where an original key gave only the answer). These additions were not separately reviewed and are flagged in `release_blockers` for the owner's spot-check. No in-platform review decision was entered on the owner's behalf.

## What was released

School-neutral templates in the private `ielts-teacher-course-packs` bucket, registered in `private.ielts_teacher_pack_templates`. IELTS-01 and IELTS-02 are new rows; IELTS-03 and IELTS-04 replace the v1.0.1 templates (previous objects `templates/IELTS-03/1.0.0/875f6fe2….zip` and `templates/IELTS-04/1.0.0/ba40e529….zip` stay in storage but are no longer registered, so teachers can no longer read them). Every school with the IELTS module receives each lesson, branded in the browser with its own name and logo.

| Code | Title | Version | Template bytes | Template SHA-256 |
|---|---|---|---:|---|
| IELTS-01 | Listening corrections and Reading starting point | 1.2.0 | 7251929 | `b1285db2b9b6f231849a3b4507ec95ed83394a184ba873bc85b0751d16ee722c` |
| IELTS-02 | Reading evidence and developed answers | 1.1.0 | 1255748 | `79cfa234b9218fbe159f0dc2ea81f2d82ec85909dfc7247803470c0eb1b22dd6` |
| IELTS-03 | Listening details, spelling and word limits | 1.1.0 | 5987648 | `79250ab44984400dad6fc32b87fa387d715d1df2bf2989f4fcb15efd286fecdc` |
| IELTS-04 | Clear paragraphs and Speaking Part 1 | 1.1.0 | 1271707 | `be95ac685829738485c6cb05dbc97c6a565eb7627b0187334b6aa0d3aa0bc837` |

Recordings inside the packs are byte-identical to the approved files: L-003 `051a7be8…`, L-004 `df4c58e6…`, D03-A `db7c949b…`, D03-B `ba5801c6…`, D03-F `c1dfbb46…` (full hashes in the sources). D03-F, the withheld follow-up recording, is in `Teacher-private/Audio` and never appears on slides.

Templates were built with `scripts/ielts/build-lesson-pack.py --template --audio-dir` and validated with `validate-lesson-pack.py` (4/4, zero errors). They were uploaded through a one-time, capability-protected endpoint limited to these exact paths, sizes and hashes, re-downloaded and SHA-256 verified; the endpoint was then redeployed as a JWT-required HTTP 410 handler and the capability deleted. No capability or binary is committed.

## What stays as it was

- The in-app Lesson 1 overview and its existing downloads, and the Silk Road Lesson 2 panel, are unchanged. The new packs appear alongside them in the teacher pack library.
- No student tasks, assignments, scores, attempts or roles were changed.

## Verification

- Contract: all 24 sources pass; 57 contract tests pass (new tests cover the conversion record, absent fresh check, homework never revealed, model-free writing only in a fresh check, verbatim transcript evidence).
- Text fidelity: transcripts, answers, accepted variants and explanations for Lessons 1 and 3 were checked mechanically against the approved keys and approved source text (0 differences); Lesson 4 models, prompts, examples and samples likewise (one intended difference: the label "Follow-up:" before the approved follow-up question).
- Every slide of all four HTML presentations and all four PowerPoint decks (LibreOffice render) was inspected, plus the student workbooks, homework, catch-up, Plan B and support PDFs.
- Branding run with the production branding code: all four templates for Silk Road, Lessons 01 and 03 for Testopia. School name on every PDF page; name and logo in presentations and decks; no template token left in delivered files except the source manifest.
- In-presentation audio: L-003 and D03-A load (172.6 s, 117.5 s), play on the teacher's click and pause when the teacher leaves the recording's slide.
- Hosted authorization (read-only transaction, rolled back): the Silk Road programme lead and a Testopia school admin each see 24 lessons, 01–24, with their own school identity and can read the four new template objects; the Silk Road lead is refused for Testopia; Gulzada (student) is refused and can read no template objects.

## Not verified

Microsoft PowerPoint playback of animations and embedded audio, physical printing, projector legibility and classroom audio.
