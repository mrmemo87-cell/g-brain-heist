# Brain Heist Academic Skill Registry

## Purpose

The Academic Skill Registry is the canonical vocabulary used by Academic Profiles, longitudinal learning memory, intervention planning and governed question analytics.

Its job is to answer one stable question:

> What transferable capability is the learner demonstrating or struggling with over time?

The registry is deliberately separate from:
- a specific question or answer,
- a teacher's lesson title,
- an external curriculum's exact wording,
- an assessment/cognitive process,
- a temporary AI-generated label.

Canonical identity belongs to Brain Heist. External curricula such as Cambridge are crosswalks to that stable identity.

## Version

Current published English registry: `bh-english-core-v1`.

The registry is versioned. Existing learner evidence must never silently change identity because a display label is edited. Changes to taxonomy meaning require a governed new version, alias/supersession strategy and migration review.

## Canonical hierarchy

English uses five top-level strands:

1. Reading
2. Writing
3. Use of English
4. Listening
5. Speaking

These align with the public strand structure of:
- Cambridge Primary English as a Second Language 0057
- Cambridge Lower Secondary English as a Second Language 0876

The same Brain Heist identities continue into Upper Secondary, where crosswalks can point to Cambridge IGCSE English as an Additional Language 0472 or Cambridge IGCSE English as a Second Language 0510/0511 depending the learner pathway.

Official public references:
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english-as-a-second-language/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english-as-a-second-language/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-as-an-additional-language-0472/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-oral-endorsement-0510/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-count-in-oral-0511/

Do not copy restricted Cambridge curriculum-framework wording into Brain Heist. Store exact external objectives only through an authorised, versioned curriculum import. Public crosswalks stay at the programme/strand/assessment-reference level unless licensed source material has been governed separately.

## Identity levels

### Strand

A broad language domain. Example:

`eng.use-of-english` — Use of English

### Skill

A durable competency family that can remain meaningful across years. Example:

`eng.use-of-english.verb-aspect` — Verb aspect

A skill must describe language knowledge or capability. It must not describe the mental action used by one question.

Bad:
- Analysing aspect-dependent meaning
- Applying non-continuous verb rules
- Selecting verb aspect from context

Good:
- Verb aspect
- Connectives and logical relations
- Inference and implied meaning
- Organisation and cohesion

### Atomic subskill

The smallest reusable diagnostic identity that should accumulate evidence across several questions, assignments and dates.

Example:

`eng.use-of-english.verb-aspect.stative-dynamic` — Stative and dynamic verb use

A subskill should normally be reusable across multiple questions. If a label describes the exact word, sentence or answer in one item, it is probably an evidence statement rather than a canonical subskill.

Bad:
- Distinguish opinion "think" from active consideration with "think"
- Use third-person singular "understands"
- Select whereas for two libraries

Good:
- Aspect-dependent meaning shifts
- Stative and dynamic verb use
- Contrast and concession

### Evidence statement

Question-specific evidence belongs here and may be highly precise.

Example:

> A correct response distinguishes opinion *think* from progressive *thinking about*.

The evidence statement does not become the learner's longitudinal identity.

## Assessment-process namespace

Brain Heist currently uses:
- BH-AO1: knowledge/comprehension
- BH-AO2: application/procedure
- BH-AO3: analysis/interpretation
- BH-AO4: evaluation/judgment

These codes describe **how the learner processes a task**, not what English skill the learner has.

Cambridge IGCSE English as a Second Language uses its own AO namespace in the 2027–2029 syllabus:
- Cambridge AO1: Reading
- Cambridge AO2: Writing
- Cambridge AO3: Listening
- Cambridge AO4: Speaking

These are different systems. Cambridge references are stored in `academic_skill_framework_crosswalks.external_reference_code`, for example `CIE0510-AO1`. They must never be written into Brain Heist's cognitive-process AO field.

## Phase model

The v1 registry supports:
- `primary`
- `lower_secondary`
- `upper_secondary`

The generation RPC currently defaults grades 1–6 to Primary, 7–9 to Lower Secondary and 10–12 to Upper Secondary. That default is a Brain Heist operational convenience, not a claim that every school's grade numbering is identical to Cambridge stages. A school's explicit programme/stage mapping should override the default when available.

## AI rules

Batch Question Creation must follow these rules:

1. Load the published registry for the subject and phase.
2. Select an existing `skillCode` and child `subskillCode`.
3. Copy the canonical names exactly.
4. Never create a new official skill as part of ordinary generation.
5. Never put example-specific vocabulary or answer tokens in canonical names.
6. Keep exact item evidence in `evidence_statement`.
7. Keep assessment process separate from skill identity.
8. If no suitable canonical leaf exists, return `registry_match=false`, mark the item for human taxonomy review and do not manufacture a code.
9. A coherent batch should normally reuse a small number of canonical skills/subskills.
10. The database remains the final fail-closed authority; prompt compliance is not trusted by itself.

## Human governance

For School Verified English questions:
- superadmin chooses the exact school curriculum objective separately,
- skill and subskill are selected from the published registry,
- the database verifies that the subskill is a child of the selected skill,
- the skill/subskill must be active for the learner phase,
- names must match their stable codes,
- invalid free-text taxonomy cannot become Academic Profile evidence.

The curriculum objective answers "where does this sit in the school's curriculum?"

The Brain Heist registry answers "what transferable learner capability does this measure?"

Both are retained.

## Longitudinal behaviour

Academic Profile diagnostic identity should ultimately use the stable registry code, not a generated label.

Example:

`diagnostic:english-grade-7:eng.use-of-english.verb-aspect:eng.use-of-english.verb-aspect.stative-dynamic`

Evidence from several different questions can therefore accumulate into one focus state.

Historical taxonomy is not overwritten. When old taxonomy is canonicalised:
- insert a new approved taxonomy row,
- link it with `supersedes_taxonomy_id`,
- preserve the old row for audit,
- future snapshots/evidence use the non-superseded canonical row.

## Intervention behaviour

An intervention target should reference the stable skill/subskill identity.

Good:
- Skill: Verb aspect
- Subskill: Stative and dynamic verb use
- Evidence: 4/7 verified questions across two independent assignments
- Target: improve independent accuracy to the governed mastery threshold

Avoid:
- Intervention: "Fix question 7"
- Skill: "Applying non-continuous verb rules"

Targeted practice may use exact subskill matches. Practice itself must not automatically prove mastery; later independent evidence is required.

## English v1 coverage

The registry contains:
- 5 strands
- 47 canonical skills
- 144 canonical subskills

It is intentionally broader than Jess's Grade 7 ESL pilot so the same learner identity can continue through Primary, Lower Secondary and Upper Secondary rather than being recreated each year.

Not every subskill applies to every phase. `applicable_phases` is part of governance.

## Expansion policy

A new canonical subskill may be added only when:
1. existing leaves do not accurately represent a recurring transferable capability,
2. the proposed identity is expected to accumulate evidence across multiple items,
3. it is not merely an assessment process,
4. it is not an item-specific example,
5. parent skill and phase applicability are explicit,
6. aliases/overlap with current taxonomy have been checked,
7. the addition receives human taxonomy review.

Do not expand the registry merely because an AI proposes a novel phrase.

## Subject expansion

This v1 registry governs English/ESL only.

Maths, Science and other subjects should receive their own canonical registries following the same architecture:
external framework → Brain Heist stable competency → reusable diagnostic leaf → process → item evidence.

Do not reuse English taxonomy assumptions for other subjects.
