# IGCSE Economics Teacher Intelligence

## Scope

Brains Heist Economics uses the platform's canonical Academic Skill Registry, evidence-focus layer, longitudinal learner evidence and intervention engine. It is not a separate exam-prep silo.

The first governed release is:

- Registry: `bh-economics-core-v1`
- Canonical subject key: `economics`
- Phase: `upper_secondary`
- External programme crosswalk: Cambridge IGCSE Economics 0455
- Cambridge source version: examinations in 2027–2029

Cambridge alignment is stored only as external metadata. Brains Heist owns the stable learner-skill identity. Do not copy restricted syllabus objective wording into the registry, AI prompts, analytics labels or reports.

## Canonical model

The registry contains seven strands:

1. Economic foundations
2. Markets and resource allocation
3. Microeconomic decision-makers
4. Government and the macroeconomy
5. Economic development
6. International economics
7. Economic reasoning and evidence

The first six organise subject knowledge. The seventh deliberately separates transferable exam/economic reasoning from content knowledge so teachers can distinguish, for example, a weak inflation concept from weak causal-chain development.

## Teacher-facing interpretation

Teacher analytics should always answer two separate questions:

**What economics does the learner understand?**

Examples include demand, PED, market failure, labour markets, fiscal policy, inflation, development and exchange rates.

**How well can the learner use economics?**

Examples include accurate terminology, calculations, data interpretation, diagrams, contextual application, causal analysis, stakeholder effects, conditional evaluation and supported judgement.

Do not collapse these into one percentage.

## Cambridge 0455 crosswalk

The 2027–2029 Cambridge IGCSE Economics programme is represented through external crosswalk records for:

- public content sections 1–6
- AO1 Knowledge and understanding
- AO2 Analysis
- AO3 Evaluation

The Cambridge AO namespace must remain separate from Brains Heist's internal BH-AO1..BH-AO4 assessment-process namespace.

Every crosswalk records provider, programme code, programme name, phase, public reference code, source URL and source version. Examination-year/version awareness is mandatory because the 2027–2029 syllabus and assessment structure differ from 2026.

## Evidence focuses

Each active Economics atomic subskill must have at least one active Evidence Focus. High-value misconceptions and exam behaviours have precise governed focuses, including:

- demand shift versus movement
- supply shift versus movement
- shortage/surplus adjustment
- PED calculation and interpretation
- PED and total revenue
- external costs/benefits
- micro-policy trade-offs
- labour demand/supply wage chains
- fiscal-policy transmission
- monetary-policy / interest-rate transmission
- supply-side productive-capacity chains
- unemployment types
- demand-side versus cost-side inflation
- living-standard indicator limitations
- exchange-rate direction and effects
- current-account causal chains
- data as evidence
- diagram causality
- multi-step economic analysis
- contextual application
- conditional evaluation
- short-run versus long-run evaluation
- supported judgement

A conservative `Core demonstration` focus is created only where no more precise governed focus exists.

## Longitudinal analytics

Economics must reuse the existing Academic Profile rules:

- only governed verified evidence affects the learner record
- teacher-created free-text labels never become permanent skill identities
- historical observations are append-only
- repeated weaknesses require qualifying evidence over time
- targeted intervention practice cannot itself prove mastery
- improvement/mastery requires later independent verified evidence
- provenance between School Verified and Brains Heist Verified evidence remains visible

A strong Economics teacher report should therefore be able to distinguish:

- content weakness: e.g. PED interpretation
- reasoning weakness: e.g. causal-chain development
- recurring misconception: e.g. confusing demand shifts with movements
- improving area: e.g. exchange-rate direction/effects
- unresolved area: e.g. evaluation/judgement
- curriculum coverage: which governed Economics skills have qualifying evidence
- evidence confidence: how much independent evidence supports the finding

## Teacher content creation

Economics is supported by the existing governed teacher pathways:

- manual teacher question creation
- PDF question extraction
- batch question workspace
- bulk import aliases
- canonical registry selection
- Evidence Focus selection
- school/platform governance
- assignment evidence
- Academic Profile
- intervention matching

The teacher batch RPC still checks actual teacher subject allocation; adding Economics to the platform allow-list does not bypass school scoping.

## Curriculum Navigator contract

A future generic Curriculum Navigator should consume `rpc_academic_skill_registry_for_generation` rather than hard-coded Economics data.

The RPC now exposes:

- `registryVersion`
- `phase`
- `cambridgeProgrammes`
- `frameworkAlignments`
- canonical strand / skill / subskill rows
- `evidenceFocusCount` for each subskill

The UI should group by strand and skill, show external alignment separately, and overlay school/class evidence such as coverage, mastery state and recurring focus areas.

## Current economic data

Live economic indicators should be a separate governed data-source layer, not embedded into the canonical registry. Recommended source classes include official national statistics, central banks, the World Bank and IMF.

Each future economic-data record should carry at minimum:

- geography
- indicator
- value and unit
- observation period
- source organisation
- source URL
- retrieved/updated timestamp
- relevant canonical Economics skill/subskill
- teacher note or suggested use
- revision status

Never invent or silently stale economic statistics in teacher guidance.

## Release verification

Before deploying this release:

1. Apply migrations in order.
2. Verify `bh-economics-core-v1` is published.
3. Verify 7 strands, 34 skills and 86 subskills.
4. Verify every active Economics subskill has an active Evidence Focus.
5. Verify Cambridge 0455 has six content crosswalks plus AO1/AO2/AO3.
6. Call `rpc_academic_skill_registry_for_generation('Economics', 10, null)`.
7. Confirm `supported=true`, `registryVersion='bh-economics-core-v1'`, programme 0455 and non-empty `frameworkAlignments`.
8. Smoke-test teacher PDF extraction and batch submission with an Economics-assigned teacher.
9. Confirm an unassigned teacher is still rejected by subject-scoping rules.
10. Run typecheck, unit tests and build.

## Class Hotspots and Reteach Next

Curriculum Intelligence now has a class-level action layer built on governed longitudinal evidence.

The teaching decision flow is:

**Curriculum → evidence readiness → longitudinal hotspot → content/reasoning dimension → reteach action → independent reassessment.**

Rules:

- A class hotspot is derived from existing qualified student learning focus states, not from raw averages or one isolated low score.
- `persistent` and `recurring` signals rank above `new_focus`; `improving` remains visible but reduces urgency; `resolved` is progress, not a current weakness.
- The view separates **Economics content** from **exam/reasoning skill**. The Economics reasoning strand covers data use, diagrams, causal-chain development, contextual application, evaluation conditions, time horizon and justified judgement.
- Teacher guidance is deterministic and curriculum-bound. It may suggest a misconception to test, a four-step reteach sequence, a classroom move, an independent reassessment pattern and an examiner lens.
- Suggested misconceptions are hypotheses for the teacher to check, not diagnoses asserted as fact.
- Targeted practice never proves mastery. Improvement/resolution requires later independent governed evidence.
- If the class has no qualified longitudinal hotspot, the product must say that evidence is insufficient rather than imply that no weakness exists.
- The class snapshot remains a single teaching-group-scoped RPC to keep load time independent of per-student request count.

For Cambridge IGCSE Economics 0455 (2027–2029), the action layer supports the current syllabus emphasis on economic terminology and concepts, data analysis and interpretation, analysis of relationships, evaluation, and application to real-world issues, while keeping Brains Heist internal evidence identities separate from external Cambridge metadata.

## Paper Readiness — governed assessment evidence

Paper Readiness is intentionally separate from curriculum mastery. A topic score does not automatically prove an assessment objective or paper-format skill.

For Cambridge IGCSE Economics 0455 examinations in 2027–2029, the product models:

- Paper 1: Multiple Choice, 1 hour, 40 marks, 30% of the qualification, AO1 + AO2.
- Paper 2: Structured Questions, 2 hours, 80 marks, 70% of the qualification, AO1 + AO2 + AO3.
- Paper 2 Section A: one compulsory 20-mark data-response question based on unseen information about a real economic situation.
- Paper 2 Section B: answer three questions from a choice of four; each question is worth 20 marks.
- Qualification AO weightings: AO1 43%, AO2 47%, AO3 10%.
- Component AO weightings: Paper 1 = AO1 50%, AO2 50%, AO3 0%; Paper 2 = AO1 40%, AO2 45%, AO3 15%.

### Assessment profile contract

`verified_question_assessment_profiles` is external assessment metadata attached to a specific Brains Heist Verified question content hash. It does not change the canonical Academic Skill Registry identity.

An active Cambridge 0455 profile records:

- provider and programme code
- source syllabus version
- paper component
- paper section when relevant
- evidence mode (`mcq`, `data_response`, `structured_response`)
- primary assessment objective
- complete assessment-objective set
- source reference and profile hash

Profiles can be governed only for current, analytics-eligible, Brains Heist Verified Economics questions. The governance RPC is service-role only. Historical assignment snapshots remain immutable; readiness evidence only counts when the assignment question content hash matches the governed assessment profile.

### Reporting policy

Paper Readiness uses three evidence states: `not_assessed`, `low_data`, and `evidence_established`. The current v1 class reporting policy requires at least three distinct verified questions, two assignments, and sufficient roster participation before a paper-format signal is called established.

Observed classroom accuracy is always displayed as evidence, never as:

- a predicted Cambridge mark
- a predicted grade
- a grade boundary
- a probability of examination success

If no verified Economics questions have governed Cambridge paper/AO profiles, the teacher UI must show the dependency explicitly and remain unassessed.


## Brains Heist Verified Paper 1 Readiness Bank v1

The first governed Economics assessment release is `economics-0455-paper1-readiness-v1`.

Design:
- 40 original multiple-choice questions
- Grade 10–11 eligible
- all six public Cambridge 0455 content areas represented
- exactly 20 AO1-primary and 20 AO2-primary question profiles
- 40 content taxonomies plus 19 selective secondary reasoning taxonomies
- every taxonomy resolves to `bh-economics-core-v1` skill → atomic subskill → governed Evidence Focus
- every question is hash-bound, globally Brains Heist Verified, analytics-eligible and immutable after publication
- no Cambridge specimen or past-paper question text is copied into the release

Secondary reasoning evidence is deliberately sparse. It is attached only when the MCQ genuinely tests a transferable reasoning behaviour such as calculation, diagram interpretation, contextual application, causal-chain development or conditional evaluation. A topic question does not automatically become reasoning evidence.

The package is published through `rpc_import_registry_verified_mcq_package(jsonb, boolean)`, a service-role-only, security-invoker importer. The complete release is validated before any question is inserted; taxonomy, duplicate, option, grade, AO or assessment-profile errors abort the transaction.


## Teacher Diagnostic Launcher

Curriculum Intelligence includes a governed Economics Diagnostic Launcher for current Economics teaching groups.

The launcher is intentionally assessment-first rather than question-bank-first. Teachers choose the amount of evidence they need and see the measurement design before publishing:

- **Paper 1 Quick Check** — 10 questions, approximately 12 minutes, 5 AO1 + 5 AO2, all six content areas.
- **Paper 1 Diagnostic** — 20 questions, approximately 25 minutes, 10 AO1 + 10 AO2, recommended default.
- **Full Paper 1 Readiness Check** — 40 questions, approximately 55 minutes, 20 AO1 + 20 AO2.

Every preset is built only from current Brains Heist Verified, hash-bound, grade-eligible questions with approved canonical registry taxonomy. The preview shows external AO balance, Cambridge content-area coverage and difficulty distribution without exposing answer keys.

Creation is atomic and reuses the established assignment authority. The launcher attaches the assignment to the selected teaching group, targets the current authorized roster, forces deferred verified-evidence guards before returning, and never registers the assignment as targeted intervention practice.

The resulting student work is **independent assessment evidence**. Completion can contribute to longitudinal Curriculum Intelligence and Paper Readiness; it does not create a predicted Cambridge grade.
