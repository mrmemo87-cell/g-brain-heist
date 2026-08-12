# Academic Performance Scope & Question Bank — Implementation Report

## Outcome

The app now has one enforceable academic flow:

1. A school creates its current academic year.
2. It selects a reviewed, published framework version.
3. It configures each grade separately.
4. Each grade subject is marked required or elective.
5. Students are enrolled into the current year from their class placement.
6. Elective students are enrolled individually.
7. Student Learn retrieves only questions matching the student's current school, year, grade, subject and elective enrolment.
8. Completed school assignments create objective-level academic evidence only when their questions have current, approved curriculum mappings.

Standalone game practice remains useful practice but does not affect the longitudinal academic profile. This prevents reward-driven play from being mistaken for assessed school evidence.

## Phase 1 — School academic setup and student scope

Implemented:

- A professional Academic Setup workspace inside **School Administration → Curriculum & Subjects**.
- Current-year creation with start/end dates.
- Published-framework selection.
- Grade-by-grade subject configuration for Grades 1–12.
- Required versus elective subject rules.
- Student-specific elective enrolment.
- Automatic baseline enrolment of existing class students into the current year.
- A fail-closed student subject catalogue.
- A fail-closed student question catalogue.
- Stable academic-profile subject switching based on the student's enrolled subjects, rather than the currently filtered evidence response.
- Clear timeline provenance labels, including an explicit synthetic-QA label.
- Removal of the two broad question-read policies that previously allowed an authenticated student to read the global active bank directly.

Student visibility is now:

`school + current academic year + grade + published framework version + offered subject + elective enrolment (when applicable)`

Teacher assignments additionally preserve the class or named-student audience. Existing assignment enrichment continues to snapshot year, term, grade and class context.

## Phase 2 — Existing question bank

The production audit found 1,055 active questions across nine current subjects. Of those, 1,054 are public app-pool questions and one is private teacher content.

The migration performs the following without duplicating question content:

- Adds explicit question fields for strand, skill, subskill, objective, eligible grade levels and review status.
- Classifies all 1,055 active questions with a documented deterministic ruleset.
- Keeps the private teacher question in review.
- Registers and approves the 1,054 public questions in the governed assessment-item registry.
- Publishes **Brains Heist International 2026.1**, an original Brains Heist framework. It makes no Cambridge, IB, SAT or other external endorsement claim.
- Creates Grades 1–12 as framework stages.
- Keeps all 13 active canonical subjects available to schools; subjects without reviewed bank content show zero approved questions.
- Maps the current bank only to supported Grades 6–9:
  - easy: Grades 6 and 7;
  - medium: Grades 7 and 8;
  - hard: Grades 8 and 9.
- Creates two approved primary grade-scope mappings for each public source question, while retaining one source question record.
- Preserves content and curriculum hashes, ruleset provenance, confidence, reviewer authority and approver authority.
- Requires all future public questions to have approved academic metadata and at least one eligible grade.
- Requires teacher-created questions to specify the full academic classification before saving; they remain private and in review until governed publication.
- Displays skill, subskill, objective and eligible grades in the teacher Question Bank.

Expected post-migration governed-bank totals:

| Measure | Expected |
| --- | ---: |
| Active questions classified | 1,055 |
| Public questions registered | 1,054 |
| Approved primary grade-scope mappings | 2,108 |
| Existing bank subjects | 9 |
| Current supported grade stages | 6–9 |

Grades 1–5 and 10–12 can be configured by a school, but the current bank reports zero approved questions there. That is intentional: missing content is shown honestly instead of being silently assigned to an unsuitable grade.

## Academic evidence behavior

For a completed assignment, the evidence adapter now resolves:

`assignment → source question → approved assessment item → exact school grade scope → objective → subskill → skill → topic → subject`

The objective ID is the atomic analytical key. Results can roll up to subskill, skill, topic/strand and subject without relying on free-text tags. Incomplete assignments, out-of-scope questions, stale mappings and standalone game missions do not contribute to focus/strength states.

## What a school must do

1. Open **School Administration → Curriculum & Subjects**.
2. Save the current academic year.
3. Select the published Brains Heist framework.
4. Open each grade and choose its subjects.
5. Mark additional languages and other optional subjects as elective where appropriate.
6. Save each grade to create student academic enrolments from current classes.
7. Enrol individual students into their electives.
8. Confirm classes and teacher assignments in their existing admin tabs.
9. Test Learn and Academic Progress with a student from each configured grade.

## Important boundary

Cambridge, IB and American standards packages are deliberately not presented as active merely because the app contains related assessment experiences. A framework becomes selectable only after its content, licence/reference basis, version and mappings pass the governed publication process. SAT should be modelled later as an exam-preparation programme, not as a school curriculum.

## Deployment and verification

The pull request contains database migrations and frontend changes. Merging the PR does not by itself prove that production migrations have executed. After deployment:

1. confirm the three new migrations are present in Supabase;
2. run the Supabase security and performance advisors;
3. verify the expected question/mapping totals;
4. configure a test school year and one grade;
5. enrol the test student in required/elective subjects;
6. verify Learn shows only those subjects and grade mappings;
7. complete a mapped teacher assignment;
8. confirm the academic timeline names the assignment and objective;
9. confirm standalone game practice creates no academic observation.
