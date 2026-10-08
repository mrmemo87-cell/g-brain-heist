# Brains Heist Academic Skill Registry

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

Canonical identity belongs to Brains Heist. External curricula such as Cambridge are crosswalks to that stable identity.

## Version

Current published registries:

| Domain | Registry |
| --- | --- |
| English / ESL | `bh-english-core-v1` |
| Mathematics / Maths | `bh-mathematics-core-v1` |
| Science / Biology / Chemistry / Physics | `bh-science-core-v1` |
| Global Perspectives | `bh-global-perspectives-core-v1` |
| Computing / Digital Literacy / ICT | `bh-digital-technology-core-v1` |
| Geography / Humanities bridge | `bh-geography-core-v1` |
| Modern Languages | `bh-modern-languages-core-v1` |
| Travel & Tourism | `bh-travel-tourism-core-v1` |
| Economics | `bh-economics-core-v1` |

Subject aliases may share a registry while restricting allowed strands and Cambridge programmes. For example, Biology uses the Science registry but only Biology, Scientific Practice and Science in Context strands; Russian and Kyrgyz share Modern Languages but do not inherit the German IGCSE programme.

The registry is versioned. Existing learner evidence must never silently change identity because a display label is edited. Changes to taxonomy meaning require a governed new version, alias/supersession strategy and migration review.

## Canonical hierarchy

English uses five top-level strands:

1. Reading
2. Writing
3. Use of English
4. Listening
5. Speaking

The registry supports both Cambridge English pathways:

- Cambridge Primary English as a Second Language 0057
- Cambridge Primary English 0058
- Cambridge Lower Secondary English as a Second Language 0876
- Cambridge Lower Secondary English 0861

The same Brains Heist identities continue into Upper Secondary, where crosswalks can point to Cambridge IGCSE English as an Additional Language 0472, Cambridge IGCSE First Language English 0500, or Cambridge IGCSE English as a Second Language 0510/0511 depending the learner pathway.

Official public references:
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english-as-a-second-language/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english-as-a-second-language/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-first-language-0500/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-as-an-additional-language-0472/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-oral-endorsement-0510/
- https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-count-in-oral-0511/

Do not copy restricted Cambridge curriculum-framework wording into Brains Heist. Store exact external objectives only through an authorised, versioned curriculum import. Public crosswalks stay at the programme/strand/assessment-reference level unless licensed source material has been governed separately.

## Evidence Focus layer

Canonical Skill and Atomic Subskill remain the durable longitudinal identity. Evidence Focus is a governed child layer used for precise diagnosis and Intervention.

Example:

`Use of English → Verb aspect → Simple versus progressive aspect → Forming present continuous verbs`

Rules:

- Every active verified taxonomy row must have one governed Evidence Focus.
- Evidence Focus codes belong to one exact canonical subskill and come from a controlled catalogue.
- Manual teacher verification uses `Strand → Skill → Subskill → Evidence Focus`.
- School governance re-validates the focus before approval.
- Platform/global superadmin review resolves an existing focus or creates a human-governed focus from the reviewed evidence statement.
- Existing verified questions were migrated append-only; historical taxonomy rows were not rewritten.
- Learner observations store Evidence Focus in evidence metadata while the stable `skill_key` remains at canonical subskill level.
- Intervention ranking is exact Evidence Focus first, same subskill/different focus second, broader same-skill practice third.
- Only exact-focus questions are automatically selected for targeted practice.
- Targeted practice remains rehearsal; later independent assessed evidence is required for improvement/mastery decisions.
- Every published subskill has at least one controlled focus option. Unused subskills receive a conservative `Core demonstration` fallback until more precise governed focuses are established.

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

Brains Heist currently uses:
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

These are different systems. Cambridge references are stored in `academic_skill_framework_crosswalks.external_reference_code`, for example `CIE0510-AO1`. They must never be written into Brains Heist's cognitive-process AO field.

## Phase model

The v1 registry supports:
- `primary`
- `lower_secondary`
- `upper_secondary`

The generation RPC currently defaults grades 1–6 to Primary, 7–9 to Lower Secondary and 10–12 to Upper Secondary. That default is a Brains Heist operational convenience, not a claim that every school's grade numbering is identical to Cambridge stages. A school's explicit programme/stage mapping should override the default when available.

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

## Canonical verified-question mapping invariant

For every active School Verified or Brains Heist Verified question that is eligible for Academic Profile evidence, the authoritative diagnostic identity is the **current, hash-bound, approved registry-native mapping**:

`Registry → Strand → Skill → Atomic Subskill → Evidence Focus`

The source of truth is `public.verified_question_registry_taxonomy`, resolved against the published Academic Skill Registry. The mapping must match the question's current verified content hash.

The following are **not** authoritative diagnostic identity and must never be used as a fallback for verified evidence:

- topic or lesson title,
- `questions.curriculum_strand`,
- `questions.curriculum_skill`,
- `questions.curriculum_subskill`,
- tags,
- imported display labels,
- AI-generated free-text labels.

`public.verified_question_diagnostic_taxonomy` remains historical/compatibility governance data. Approved current legacy rows are bridged into the registry-native mapping; historical rows remain append-only for audit.

Verification must fail closed. A question must not remain both `verification_status='verified'` and `analytics_eligible=true` for its current verified hash unless a valid registry-native mapping exists. Shared-registry subject aliases such as Biology → Science, Maths → Mathematics, ICT → Digital Technology, and supported Modern Languages must resolve through `academic_skill_registry_subject_aliases` and obey any `allowed_strand_codes`.

### Rules for AI agents

When creating, importing, verifying, repairing or reviewing a question:

1. Resolve the governed subject alias and published registry first.
2. Select existing stable Skill, Subskill and Evidence Focus codes from that registry.
3. Never repair a missing mapping by copying the topic into Skill/Subskill fields.
4. Never invent a replacement canonical code or free-text taxonomy.
5. If no legitimate canonical match exists, stop official verification and require human governance.
6. Treat legacy curriculum fields as curriculum/display metadata only.
7. A verified-question UI must show the registry-native mapping. If that mapping is unavailable in the response, show an explicit “canonical mapping unavailable” state instead of substituting legacy labels.
8. Machine metadata tags such as `strand:`, `skill:`, `subskill:`, `evidence-focus:`, assessment-process tags, cognitive-process tags and registry tags must never be rendered as teacher-facing assessment labels. They may remain stored for historical/search compatibility without becoming diagnostic authority.

## Human governance

For any School Verified question whose subject has a published registry:
- superadmin chooses the exact school curriculum objective separately,
- skill and subskill are selected from the published registry,
- the database verifies that the subskill is a child of the selected skill,
- the skill/subskill must be active for the learner phase,
- names must match their stable codes,
- invalid free-text taxonomy cannot become Academic Profile evidence.

The curriculum objective answers "where does this sit in the school's curriculum?"

The Brains Heist registry answers "what transferable learner capability does this measure?"

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
- 52 canonical skills
- 165 canonical subskills

It is intentionally broader than Jess's Grade 7 ESL pilot so the same learner identity can continue through Primary, Lower Secondary and Upper Secondary rather than being recreated each year.

Not every subskill applies to every phase. `applicable_phases` is part of governance.

The September 2026 English-bank migration canonicalised every verified, analytics-eligible English question in the live bank. Historical taxonomy rows were preserved as superseded audit history. Teacher-only unverified drafts remain outside official Academic Profile evidence until they pass governance.

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

The multi-subject v1 system now governs English/ESL, Mathematics, Science and its specialist aliases, Global Perspectives, Computing/Digital Literacy/ICT, Geography, Modern Languages, Travel & Tourism and Economics.

All registries follow the same architecture:

external framework → subject alias/programme scope → Brains Heist stable competency → reusable diagnostic leaf → assessment process → item evidence.

The September 2026 multi-subject migration canonicalised all 816 previously verified active non-English taxonomy rows in these banks using append-only successors. Historical labels remain auditable through `supersedes_taxonomy_id`.

Do not force one subject's ontology onto another. Shared registries are allowed only where the durable competency model is genuinely shared, such as Biology/Chemistry/Physics within Science or German/Russian/Kyrgyz within Modern Languages.

Economics uses `bh-economics-core-v1` for upper-secondary longitudinal evidence. Cambridge IGCSE Economics 0455 (2027–2029) is stored as a versioned external crosswalk. Economics deliberately separates content competencies from `econ.reasoning` so teachers can distinguish conceptual gaps from weaknesses in data use, causal analysis and evaluation. See `docs/economics/igcse-0455-teacher-intelligence.md`.

## Registry-native verified assessment evidence

Brains Heist supports an additive registry-native evidence lane for verified question-bank work.

The canonical chain is:

**verified question content hash → governed registry taxonomy → immutable assignment snapshot → append-only registry item evidence → longitudinal observation → confidence/focus state**

`verified_question_registry_taxonomy` binds a current verified question hash to:
- a published registry version
- one canonical skill
- one atomic canonical subskill
- one governed Evidence Focus
- one internal Brains Heist assessment process (`BH-AO1`–`BH-AO4`)
- a cognitive process and evidence statement

This taxonomy is not a Cambridge syllabus identity. External programme/paper/AO metadata remains separate in crosswalks and assessment profiles.

`student_learning_registry_item_evidence` is append-only. It only materializes from analytics-eligible verified assignment snapshots whose content hash still matches the current immutable verified question. Targeted intervention practice may be recorded in the ledger, but it is explicitly non-independent and does not qualify as mastery evidence.

The registry-native lane runs alongside the mature curriculum-framework evidence lane. Existing subjects and historical evidence are not migrated or rewritten merely because registry-native evidence becomes available.


## Subject-native teacher experience

The canonical registry remains generic infrastructure, but Curriculum Intelligence presents each published registry in subject-appropriate school language.

The UI resolves a subject experience from the selected teaching group's registry/version and adapts:
- the two teaching dimensions
- curriculum search language
- Teaching Radar wording
- reteach guidance
- reassessment guidance
- assessment lens

This is presentation and teaching guidance only; canonical skill/subskill/Evidence Focus identities remain unchanged.

Reasoning/application dimensions are derived from the real registry strand design. Examples:
- `math.mathematical-practice`
- `science.scientific-practice`
- `geo.skills` / `geo.enquiry`
- `econ.reasoning`
- receptive/productive communication strands for English and Modern Languages

The system must preserve one evidence architecture across subjects rather than create subject-specific Academic Profile silos.
