# Brains Heist Admission Bank Authoring Rulebook

This is the permanent authoring standard for the Brains Heist International School Admission Test banks for Grades 1–10 English, Maths and Science. No new bank may be authored, generated, imported, staged, or labelled department-head-ready unless it starts from a validated locked curriculum map.

## Fail-closed workflow

`source -> curriculum map -> blueprint -> generation -> item validation -> bank coverage validation -> deterministic form simulation -> staging form -> academic sign-off -> production`

If any step is missing, the work stops. Production RPCs, migrations, seed imports, and existing production questions are outside the authoring step.

## Curriculum lock

- AI may generate only from a locked curriculum map with approved `objective_id` records.
- Every generated question must reference one approved `curriculum_objective_id`.
- Each item tests one primary objective. Secondary context may appear only when it is prerequisite knowledge, not a second assessed objective.
- Grade and Cambridge stage are separate when a map is `cambridge_linked`; Brains Heist International maps use explicit grade/level definitions instead of implying Cambridge stages.
- Two curriculum-map modes are valid: `cambridge_linked` and `brain_heist_international`.
- Cambridge-linked content requires Cambridge-specific sources, stage/programme metadata, and Grade 10 IGCSE syllabus metadata when the programme explicitly uses `cambridge_igcse` or Cambridge IGCSE.
- Brains Heist International content uses `programme: "brain_heist_international"`, approved public reference frameworks, independent Brains Heist objectives, and no claim of official Cambridge affiliation.
- Brains Heist International Grade 10 maps may define general international admission-readiness levels and prerequisites; they must not require IGCSE syllabus or examination-year metadata unless the map explicitly uses `programme: "cambridge_igcse"`.

## Objective granularity

Atomic assessable subskills are mandatory. Broad labels are not sufficient as canonical subskills, including:

- Number and operations
- Biology / living things
- Chemistry / materials
- Earth and space
- Grammar
- Reading

A valid subskill names the observable action and content boundary, for example a specific calculation, evidence move, grammatical distinction, reading inference, measurement choice, or enquiry decision.

## Difficulty and placement

- Difficulty is based on cognitive demand, number of steps, representation load, and precision required.
- Difficulty must not be created by importing later-stage content into an earlier grade.
- Placement band and difficulty remain separate: placement band describes admissions interpretation; difficulty describes item demand.

## Option, distractor, and explanation quality

- Distractors must correspond to plausible misconceptions documented for the objective or prerequisite.
- Correct answers must not be exposed through wording, grammar, position, option length, uniqueness of style, or repeated vocabulary.
- No AI residue, placeholder stems, meta distractor language, template language, unsupported symbols, or visible box/replacement glyphs may appear.
- No duplicate normalized stems or artificial paraphrase families are allowed.
- Explanations must independently establish the correct answer, not merely restate the answer letter.

## Subject-specific rules

### English

- Reading items must cite textual evidence and assess a defined reading move, not generic “reading”.
- Grammar and language items must assess one named convention or effect.
- Writing prompts must have rubrics, audience, purpose, and age-appropriate constraints.

### Maths

- Maths items must separate calculation demand from reading load.
- Distractors should reflect known errors such as place-value confusion, inverse-operation misuse, unit conversion mistakes, or premature rounding.
- Multi-step items must declare the intended steps in validation metadata.

### Science

- Science items must distinguish knowledge, application, data interpretation, and working-scientifically objectives.
- Enquiry items must identify the variable, evidence, measurement, or conclusion being assessed.
- Later-stage scientific vocabulary cannot be used to inflate difficulty.

## Diversity and coverage

- Generated-bank diversity must be proven before import.
- Generated forms must reach the theoretical maximum distinct concepts possible under their blueprint before accepting repeated concepts.
- Bank coverage validation must prove objective, strand, subskill, question-type, difficulty, cognitive-level, answer-position, and misconception diversity.

## Source and affiliation policy

- Public marketing and test titles must not imply Cambridge endorsement. The product name is **Brains Heist International School Admission Test**.
- All questions and passages must be original Brains Heist work.
- Third-party tests may be used only to study topics, difficulty and task patterns unless their licence explicitly permits adaptation.
- Cambridge-linked content requires Cambridge-specific sources and metadata. Brains Heist International content requires approved public sources and independently authored objectives.

## Future linked-bank production path

`approved source basis -> human-approved curriculum map -> map validator -> linked question generation -> official-bank cross-validator -> coverage audit -> deterministic form simulation -> staging test -> academic sign-off -> production`

Newly authored production-intended bank files must use `curriculum_linkage_status: "linked"`, name `curriculum_map_id` and `curriculum_map_version`, and give every question a `curriculum_objective_id`. Existing reviewed files may remain under `curriculum_linkage_status: "legacy_review_required"` until academic curriculum-linkage review is completed; no new grade file may use that compatibility status.

## Readiness label

Content cannot be labelled department-head-ready until academic sign-off is recorded after staging-form review.

## Gold-standard reference

The current Grade 6 Science bank and its regression tests are the gold-standard workflow example for validation discipline, anti-template checks, answer distribution, duplicate prevention, and deterministic generation safety. Do not copy its specific curriculum content into other grades.
