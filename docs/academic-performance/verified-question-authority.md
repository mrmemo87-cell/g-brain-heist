# Brains Heist Verified Question Authority

## Decision

The official Student Academic Profile accepts evidence only from **Brains Heist Verified Questions**. Teacher-created questions are private classroom resources. They remain useful for assignments, marking, and classroom reports, but they never influence official strengths, weak areas, persistent areas, objectives, skills, or progress trends.

This rule is enforced by PostgreSQL, not by labels in the interface.

## Question classes

| Question class | Owner | Visibility | Editable by teacher | Assignment use | Classroom reports | Official Academic Profile |
| --- | --- | --- | --- | --- | --- | --- |
| Brains Heist Verified | Brains Heist Academic Governance | Authorised school users in applicable workflows | No | Yes | Yes | Yes, when the exact approved objective mapping and school scope are current |
| My Pool | Creating teacher | That teacher only; students receive immutable assignment snapshots | Yes | Yes | Yes | Never |

## Verification contract

A question is eligible for official analytics only when every condition is true:

1. `content_origin = brain_heist`
2. `verification_status = verified`
3. `analytics_eligible = true`
4. it is active and published
5. its current content hash matches its verified content hash
6. its strand, skill, subskill, objective, and eligible grades are complete
7. its assessment item hash matches the question hash
8. it has a current approved primary objective mapping in the student's school year, grade, and subject scope

If any condition is absent or inconsistent, the question is excluded. The system does not guess.

## Teacher workflow

Teachers can create multiple-choice, true/false, and short-answer questions manually. Formal curriculum fields are intentionally absent from the form. Suggested grade levels are optional and organise My Pool only.

Bulk import supports CSV files and rows pasted from Excel or Google Sheets:

1. Download the template or paste a table with its header row.
2. Review the parsed preview and row-level errors.
3. Correct invalid answer options, spreadsheet-converted fractions, or unsupported values.
4. Confirm one atomic import of up to 500 valid questions.
5. Database duplicate protection skips questions already active in that teacher's pool.

Neither manual nor bulk teacher authoring accepts verification or official curriculum authority fields.

## Assignment behaviour

Assignments can mix both question classes. The review step shows how many selected questions are verified profile evidence and how many are classroom-only.

When a question is added, the system stores an immutable snapshot containing the content hash and its authority status at that time. Later teacher edits or deletion do not rewrite a student's assignment, answer history, or classroom report.

All questions still count toward assignment marking. Only the verified subset is grouped into official objective evidence. An assignment containing no verified questions produces classroom results without changing the Academic Profile.

Correctness, answer keys, final correct/incorrect totals, accuracy, and classroom score are recalculated on Supabase from the immutable snapshots. Browser-supplied correctness and answer-key fields are ignored.

## Legacy-data transition

The migration promotes only existing questions that already have an active assessment item, a matching content hash, and an approved primary objective mapping in a published or retired framework version. Every other existing question becomes private, unverified teacher content.

Legacy assignment observations that cannot prove all source questions are currently verified are removed from official learning memory and affected focus states are recalculated. Valid historical evidence receives explicit Brains Heist Verified provenance.

## Operating responsibilities after launch

Brains Heist Academic Governance must:

- author or review official questions outside teacher-facing workflows;
- verify the academic mapping and eligible grade scopes before publication;
- publish official content through a controlled service-role process;
- create a new version rather than editing verified question content;
- retire questionable content immediately and investigate affected evidence;
- periodically audit hash mismatches, missing mappings, and unexpected authority states;
- keep the verified bank large enough across every active school subject and grade scope.

School staff do not approve questions into the official bank. A future contribution workflow may let them submit candidates for Brains Heist review, but submission must never grant analytics authority automatically.

## Release verification

Before production rollout:

- apply the migration through the normal Supabase deployment path;
- run the Supabase security and performance advisors;
- verify a teacher sees only Brains Heist Verified plus their own My Pool;
- create one manual and one bulk-imported teacher question;
- assign teacher-only, verified-only, and mixed assignments to a test student;
- confirm all three are marked and reported;
- confirm teacher-only questions create no official observation;
- confirm mixed assignments create evidence only from verified questions;
- confirm editing a My Pool question does not change an existing assignment snapshot;
- confirm students receive only subjects and verified learning questions valid for their current school-year scope.
