# IELTS teacher and student clarity pass — 2026-10-19

Owner request: "the UX and UI are horrible and very confusing to teachers and maybe to the students as well". Audited as Jess (teacher), Sobbi (admin, teacher view) and Gulzada (student, pilot), browse only.

Scope is visual and copy only (Visual & UX Bible 1.2.0 §8). There are no changes to scoring, eligibility, authentication, schema, RLS or RPCs. The review desk and student home now read two existing RPCs: `rpc_ielts_review_queue` and `rpc_ielts_practice_student_assignments`.

## Teacher

| Problem found | Change |
| --- | --- |
| Navigation hid every destination inside four dropdown groups | Plain tabs (Bible §2). Teachers who manage practice get 8 tabs. Other staff get the 4 canonical tabs. On phones the tabs wrap into a two-column grid. |
| The review desk said "clear" while assigned practice essays sat in two collapsed sections | One queue, oldest first. It combines screener essays and interviews with assigned practice writing and speaking. A waiting count shows on the tab. Targeted practice is shown open, with shared items marked as done. |
| The essay review page was dark navy, had an invisible title and unreadable AI notes, and was about 56,000px tall on a phone | Light Evidence Blue page with a responsive two-column to one-column grid (6,395px on a phone). A "read-only" notice appears when finalized. Each field explains itself. The governed AI-safety copy is kept. |
| Today always said "get your lesson ready" and repeated its headings | Today now opens on "Needs you now" with the real waiting work. The rest are plain sections with no nested collapsibles. |
| Batches: the create form was always open and "Archive" carried the same weight as "Assign" | The create form opens from "New batch". Active and Archived use a segmented control. Archive is a quiet action. |
| Practice desk: card nested and centred inside a card, slogan heading, lowercase skills, duplicate titles | Full-width layout, "Practice & assignments" heading, capitalised skills, no duplicate titles, quieter row actions. |
| "All practice reviews" page: raw Class ID and Student ID text inputs | Removed. Filters are skill and status, and statuses have plain labels. |

## Student

| Problem found | Change |
| --- | --- |
| School assignments were not on the home page (the pilot student could not find W-010) | A "Your work" list leads the home page: open assignments, then targeted tasks, then feedback that is ready, plus a link to finished work. |
| The nav tabs were numbered 01–04 and "Screeners" was the home | The tabs are now Home, Assignments, Targeted practice and My journey. |
| The teacher's evidence note "(provisional policy v1)" was shown to students as the assignment description | New batch assignments say "Practice focus: …". Older descriptions are rewritten the same way on screen. |
| A teacher's reason ("She needs more to practice.") appeared without context | It is labelled "From your teacher:". |
| "View submission details" gave no sense of what was inside | The button now says "See results and feedback", "Start: show tasks" or "Continue: show tasks". `?assignment=` deep-links from home. |
| A finished essay showed "Feedback not finalized yet" even after the teacher finalized it | The progress RPC carries no review metadata. The finished essay now links to its own page, which shows the AI feedback and the finalized-review link. |
| The listening page was green, purple and yellow with emoji, and showed "Band: -" | Evidence Blue tokens (now also loaded on the practice pages). The band line is shown only when it has values. |
| The writing result page had invisible AI feedback text and generic "Personalized" tips | Readable ink, and the teacher feedback link is moved to the top. The generic tips and the "0:01 time spent" figure are removed. |
| Finished checks still used heavy navy primary buttons | Primary actions use Evidence Blue. Finished checks use the quiet style. |
| My journey repeated the targeted-task panel | The duplicate panel is removed. |

## Evidence

Screenshots were taken at 375, 768 and 1440px (390px for the "before" set) against the live database:
- Teacher: Today, Review desk, Batches, Practice desk, Essay review, All reviews.
- Student: Home, Journey, Assignments, L-015, W-010.

Horizontal overflow was 0px on every page at every width. Focus rings come from the existing `--bh-ielts-focus` rules. All tap targets are at least 44px except the inline text links.

Known residuals:
- The writing page re-opened from an assignment still shows the assignment progress block as "0 of 1" until progress reloads.
- The duplicate access-check overload remains, as before.
