# Brain Heist Reference — `bh_reference.md`

> **Purpose:** durable implementation reference for future Brain Heist development, audits, migrations, debugging, Codex/AI-agent work, and architectural review.
>
> **Last consolidated:** 2026-09-24
>
> **Important:** this file documents the intended architecture **and** the last verified live state. When code, migrations, and the live database disagree, do not guess. Read the relevant section here, inspect the current code/migration/function, then verify the live database before changing behaviour.

---

## REFERENCE INDEX

Use these section IDs when giving work to another AI/model. Example:  
**“Read `BH-EVIDENCE-FOCUS` and `BH-INTERVENTION` in `bh_reference.md` before editing intervention matching.”**

| Section ID | Topic |
| --- | --- |
| `BH-CORE` | Product architecture and non-negotiable principles |
| `BH-ENV` | Repository, Supabase, Vercel, stack |
| `BH-ROLES` | Roles, school scoping, authorization |
| `BH-PILOT` | Current Silk Road ESL pilot context |
| `BH-QUESTION-AUTHORITY` | My Pool, School Verified, Brains Heist Verified |
| `BH-ASSIGNMENTS` | Assignment creation, publishing, removal, pool behaviour |
| `BH-REGISTRY` | Canonical Academic Skill Registries |
| `BH-CAMBRIDGE` | Cambridge alignment and crosswalk rules |
| `BH-TAXONOMY` | Verified diagnostic taxonomy lifecycle |
| `BH-EVIDENCE-FOCUS` | Governed Evidence Focus layer |
| `BH-MANUAL-QUESTIONS` | Manual “Create New Question” workflow |
| `BH-AI-QUESTION-GEN` | PDF/AI question-generation governance |
| `BH-ACADEMIC-PROFILE` | Learning evidence and longitudinal reporting |
| `BH-INTERVENTION` | Weakness targeting and intervention matching |
| `BH-MASTERY` | Mastery / improvement rules |
| `BH-SECURITY` | RLS, SECURITY DEFINER, access boundaries |
| `BH-DB-OBJECTS` | Important tables, views, RPCs, functions |
| `BH-MIGRATIONS` | Key migration history |
| `BH-UI` | Teacher/admin UX contracts |
| `BH-TESTING` | Regression and smoke-test expectations |
| `BH-LIVE-STATE` | Last verified live counts/state |
| `BH-KNOWN-GAPS` | Remaining incomplete / unverified work |
| `BH-DO-NOT-BREAK` | Hard invariants for future edits |
| `BH-EDIT-CHECKLIST` | Checklist before merging future changes |

---

<a id="BH-CORE"></a>
# BH-CORE — Product Architecture and Non-Negotiable Principles

Brain Heist is a school learning platform with a strong distinction between:

1. **classroom content**, which teachers may create and use freely;
2. **verified academic evidence**, which is allowed to affect Academic Profile / longitudinal learning intelligence;
3. **intervention practice**, which targets diagnosed weaknesses but does not itself establish mastery.

The core academic chain is:

```text
School / Cambridge curriculum
        ↓
Brain Heist canonical registry
        ↓
Stable canonical skill
        ↓
Stable canonical subskill
        ↓
Governed Evidence Focus
        ↓
Question-specific evidence statement
        ↓
Verified student evidence
        ↓
Longitudinal observation history
        ↓
Recurring / improving / unresolved weakness
        ↓
Targeted intervention
        ↓
Independent verified reassessment
```

## Core invariants

- Do **not** let teacher-created labels become permanent academic identities.
- Do **not** let an AI model invent official skills/subskills.
- Do **not** overwrite historical learning observations.
- Do **not** allow targeted practice to prove mastery.
- Do **not** let unverified/My Pool questions affect Academic Profile.
- Do **not** flatten School Verified and Brains Heist Verified into the same authority source; both are official evidence, but provenance matters.
- Do **not** treat Cambridge labels as Brain Heist’s permanent internal identity.
- Do **not** duplicate a permanent skill just to represent a narrower misconception. Use **Evidence Focus**.
- Do **not** silently broaden scope if a canonical match is unavailable. Fail closed and require governance.

---

<a id="BH-ENV"></a>
# BH-ENV — Repository, Supabase, Vercel, Stack

## Repository

- GitHub repository: `mrmemo87-cell/g-brain-heist`
- Main branch: `main`

## Supabase

- Project ref: `sozodkxwhubespiedgxm`
- Supabase is authoritative for database schema, RLS, RPCs, Edge Functions, academic evidence, question governance, and longitudinal learning data.
- For any Supabase edit: inspect current schema/function definitions first, apply live changes carefully, then create/commit reproducible migrations.

## Vercel

- Project: `g-brain-heist`
- Team: `Sobbi's projects`
- Production host includes `brainsheist.com`
- Never assume a GitHub commit is live until the corresponding Vercel deployment is verified `READY`.

## Frontend / app

- React/Vite-oriented frontend architecture.
- Supabase frontend services are concentrated in files such as:
  - `services/gameService.ts`
  - `services/adminQuestionBankService.ts`
  - `services/teacherQuestionBatchService.ts`
- Core teacher UI:
  - `components/TeacherPortal.tsx`
  - `components/teacher/AssignmentWizard.tsx`
  - `components/teacher/QuestionBank.tsx`
  - `components/teacher/questionPool.ts`
- Core question governance admin UI:
  - `components/admin/tabs/QuestionBankInspectorTab.tsx`

---

<a id="BH-ROLES"></a>
# BH-ROLES — Roles, School Scoping, Authorization

## Roles

Brain Heist uses role boundaries including:

- student
- teacher
- school admin
- admin / platform admin
- superadmin

## Important authority rule

**School academic verification is a platform-superadmin-governed action in the current architecture.**

Teachers may propose taxonomy/evidence metadata, but teacher input is not authoritative.

School admins and teachers must not be able to bypass official question governance merely by updating authority columns.

## Teacher ownership model

A teacher question is owned via the **teacher profile id**, not the auth user UUID. Code that checks ownership must resolve the teacher profile from `teachers.user_id = auth.uid()`.

This distinction has already caused a smoke-test setup error in the past; the RPC correctly rejected the incorrectly-owned question.

## School scoping

School-scoped features must resolve an active school context and enforce school boundaries in backend logic. Never rely on frontend filtering alone.

---

<a id="BH-PILOT"></a>
# BH-PILOT — Current Silk Road ESL Pilot Context

Current pilot context relevant to regression testing:

- School: **Silk Road International School**
- Pilot subject: **ESL**
- Current key group: **Grade 7 ESL**
- Teacher: **Jess**
- Current pilot roster previously verified as extremely small; do not infer additional students from old test data.
- ESL is mapped to the canonical English academic subject internally.
- Teacher subject catalog and Grade 7 ESL offering were previously repaired to use the current academic year and canonical English mapping correctly.

When testing teacher workflows, Grade 7 ESL is the highest-value real pilot path.

---

<a id="BH-QUESTION-AUTHORITY"></a>
# BH-QUESTION-AUTHORITY — My Pool, School Verified, Brains Heist Verified

Brain Heist has three meaningful question authority classes.

## 1. My Pool

Purpose:

- teacher-created classroom questions
- usable in assignments
- usable in classroom grading/reporting
- **not official Academic Profile evidence**

Typical state:

- `content_origin = teacher`
- `pool_scope = teacher`
- `verification_status = unverified`
- `analytics_eligible = false`

Teacher-created questions must remain non-authoritative unless formally submitted and approved.

## 2. School Verified

Purpose:

- teacher-origin question
- reviewed/governed against school curriculum
- canonical taxonomy approved
- allowed to affect official Academic Profile / Intervention

Typical state after approval:

- `pool_scope = school`
- `verification_status = verified`
- `analytics_eligible = true`
- canonical taxonomy active and approved
- school ownership/provenance retained

## 3. Brains Heist Verified

Purpose:

- platform-authoritative verified question bank
- canonical taxonomy approved
- allowed to affect official Academic Profile / Intervention

## Assignment-pool contract

Assignment creation must show:

- **All pools**
- **Brains Heist Verified**
- **School Verified**
- **My Pool**

Both **Brains Heist Verified** and **School Verified** count as official Academic Profile evidence.

**My Pool** remains classroom-only.

Relevant helper logic lives in:

- `components/teacher/questionPool.ts`
- `components/teacher/AssignmentWizard.tsx`

Expected authority labels:

- `Brains Heist Verified · Profile evidence`
- `School Verified · Profile evidence`
- `My Pool · Classroom only`

---

<a id="BH-ASSIGNMENTS"></a>
# BH-ASSIGNMENTS — Assignment Creation, Publishing, Removal, Pool Behaviour

## Publishing model

Teacher assignment management is locked to support:

- save as draft
- publish immediately
- schedule publication for a date/time
- optional “Notify students by email?” setting

## Removal model

Teachers can remove:

- selected students
- selected assignment content/questions
- the entire published assignment

Removal must:

- require a clear confirmation dialog
- **not** require a reason field
- clean dependent academic data for the removed scope, including:
  - submissions
  - scores
  - completion/progress
  - generated weakness/focus observations
  - assignment-related rewards
  - reporting references
- retain only a minimal invisible backend audit event

## Question eligibility

Verified questions should respect intended grade eligibility.

A My Pool question can be flexible for classroom use; official Academic Profile evidence must remain aligned to the verified grade/curriculum/taxonomy context.

---

<a id="BH-REGISTRY"></a>
# BH-REGISTRY — Canonical Academic Skill Registries

## Design principle

The **Brain Heist registry is canonical**.

External frameworks such as Cambridge are alignment/crosswalk metadata, not the permanent learner identity.

Permanent identity should look like:

```text
Brain Heist Registry
→ Strand
→ Skill
→ Subskill
```

Question-specific detail goes below this in **Evidence Focus** and the evidence statement.

## Core registry tables

- `public.academic_skill_registry_versions`
- `public.academic_skill_registry_nodes`
- `public.academic_skill_registry_aliases` / subject alias support
- `public.academic_skill_registry_subject_aliases`
- `public.academic_skill_framework_crosswalks`

## Subject alias design

A shared registry may serve related subjects, but aliases can restrict:

- allowed strands
- allowed external/Cambridge programmes

Examples:

- Biology, Chemistry, Physics share the Science registry, but each specialist alias is restricted to appropriate Science strands.
- German, Russian, Kyrgyz share the Modern Languages registry, but Russian/Kyrgyz must **not** inherit German IGCSE 0525.
- Computing and Digital Literacy share Digital Technology infrastructure but are not interchangeable.

## Current published registries — last verified 2026-09-24

| Registry | Domain | Strands | Skills | Subskills |
| --- | --- | ---: | ---: | ---: |
| `bh-english-core-v1` | English / ESL | 5 | 52 | 165 |
| `bh-mathematics-core-v1` | Mathematics / Maths | 5 | 28 | 61 |
| `bh-science-core-v1` | Science / Biology / Chemistry / Physics | 6 | 32 | 76 |
| `bh-global-perspectives-core-v1` | Global Perspectives | 6 | 18 | 29 |
| `bh-digital-technology-core-v1` | Computing / Digital Literacy / ICT | 7 | 23 | 41 |
| `bh-geography-core-v1` | Geography / Humanities bridge | 6 | 23 | 36 |
| `bh-modern-languages-core-v1` | Modern Languages | 7 | 20 | 31 |
| `bh-travel-tourism-core-v1` | Travel & Tourism | 6 | 15 | 21 |

Total active published subskills last verified: **460**.

## Registry generation RPC

`public.rpc_academic_skill_registry_for_generation(subject, grade, phase)`

Responsibilities:

- normalize subject via alias
- resolve registry
- determine phase
- apply allowed-strand restriction
- return flattened strand/skill/subskill leaves
- return permitted Cambridge programmes
- fail safely if subject/phase unsupported

Operational phase convention:

- Grades 1–6 → `primary`
- Grades 7–9 → `lower_secondary`
- Grades 10–12 → `upper_secondary`

This is an operational convention, not a claim of exact Cambridge year equivalence.

---

<a id="BH-CAMBRIDGE"></a>
# BH-CAMBRIDGE — Cambridge Alignment and Crosswalk Rules

## Fundamental rule

Brain Heist does **not** copy Cambridge proprietary framework wording as its internal taxonomy.

The model is:

```text
Cambridge programme / syllabus
        ↓ crosswalk metadata
Brain Heist canonical competency
```

## Programme examples

### Mathematics

- Primary Mathematics 0096
- Lower Secondary Mathematics 0862
- IGCSE Mathematics 0580

### Science

- Primary Science 0097
- Lower Secondary Science 0893
- IGCSE Combined Science 0653
- IGCSE Biology 0610
- IGCSE Chemistry 0620
- IGCSE Physics 0625

### Global Perspectives

- Primary Global Perspectives 0838
- Lower Secondary Global Perspectives 1129
- IGCSE Global Perspectives 0457

### Digital / Computing

- Primary Computing 0059
- Lower Secondary Computing 0860
- Primary Digital Literacy 0072
- Lower Secondary Digital Literacy 0082
- IGCSE Computer Science 0478
- IGCSE ICT 0417

### Geography / Humanities

- Primary Humanities 0065
- Lower Secondary Humanities 0839
- IGCSE Geography 0460

### Modern Languages

- Primary Modern Foreign Language 0064
- Lower Secondary Modern Foreign Language 0771
- IGCSE German Foreign Language 0525 — only where appropriate

### Travel & Tourism

- IGCSE Travel & Tourism 0471

## AO namespace warning

Cambridge AO labels must remain separate from Brain Heist internal assessment-process labels.

Example historical conflict:

- Cambridge IGCSE ESL AO1 = Reading
- Brain Heist internal AO1 has been used for knowledge/comprehension-style cognitive process

Never silently merge those namespaces.

---

<a id="BH-TAXONOMY"></a>
# BH-TAXONOMY — Verified Diagnostic Taxonomy Lifecycle

## Main table

`public.verified_question_diagnostic_taxonomy`

Important concepts include:

- question id
- question content hash
- curriculum scope/objective
- primary canonical skill code/name
- atomic canonical subskill code/name
- assessment process
- cognitive process
- evidence statement
- confidence
- review status
- supersession history
- review authority
- Evidence Focus code/name

## Active taxonomy view

`private.active_verified_question_diagnostic_taxonomy`

The active view must:

- include only approved, non-human-review-required taxonomy
- exclude taxonomy rows superseded by a later approved/retired row
- preserve history through append-only successor rows
- expose Evidence Focus fields

## Append-only rule

Do not rewrite an old verified taxonomy row to “fix” identity.

Use:

`supersedes_taxonomy_id`

to create a successor.

This protects:

- auditability
- historical longitudinal evidence
- old report interpretation
- governance provenance

## Canonical enforcement

Registry-enabled verified school questions are guarded by canonical code/name resolution.

Generic enforcement replaced the original English-only guard.

Key private helper:

`private.resolve_canonical_skill_pair(...)`

Key trigger function:

`private.enforce_school_canonical_taxonomy_registry()`

---

<a id="BH-EVIDENCE-FOCUS"></a>
# BH-EVIDENCE-FOCUS — Governed Evidence Focus Layer

## Why Evidence Focus exists

Canonical subskills should be **stable and reusable**.

A specific misconception such as:

> Forming present continuous verbs

is too narrow to become a new permanent canonical subskill every time.

Instead:

```text
Use of English
→ Verb aspect
→ Simple versus progressive aspect
→ Evidence Focus: Forming present continuous verbs
```

Evidence Focus gives Intervention precision without fragmenting Academic Profile taxonomy.

## Core table

`public.academic_skill_evidence_focuses`

Important fields:

- `registry_version_id`
- `atomic_subskill_node_id`
- `code`
- `name`
- `description`
- `applicable_phases`
- `source_method`
- `source_fingerprint`
- `status`

Allowed `source_method` values:

- `verified_bank_backfill`
- `human_governed`
- `platform_seed`

## Evidence Focus is controlled, not free text

Teachers and reviewers select from a governed catalogue.

A verified taxonomy row is invalid if:

- Evidence Focus code is missing
- Evidence Focus name is missing
- focus does not belong to the selected canonical subskill
- focus name/code mismatch

Validator errors include concepts equivalent to:

- `verified_question_evidence_focus_required`
- `verified_question_evidence_focus_registry_match_required`
- `verified_question_evidence_focus_name_code_mismatch`

## Evidence Focus lookup

Public authenticated RPC:

`public.rpc_academic_evidence_focuses_for_subskill(subject, grade, atomic_subskill_code)`

Private resolver:

`private.resolve_canonical_evidence_focus(...)`

Superadmin helper:

`private.resolve_or_create_evidence_focus_for_superadmin(...)`

## Existing verified bank backfill

Evidence Focus v1 was introduced append-only.

Verified taxonomy rows without a focus were given successor rows rather than edited in place.

Last verified live state 2026-09-24:

- active verified taxonomy rows: **1,709**
- active verified taxonomy rows with Evidence Focus: **1,709**
- active Evidence Focus catalogue entries: **1,366**
- active canonical subskills: **460**
- active canonical subskills without any focus option: **0**

These are dated live counts, not permanent constants.

## Fallback focus

Every published subskill receives at least one controlled fallback:

`Core demonstration: <subskill name>`

This prevents the UI from having a canonical subskill with no selectable Evidence Focus.

As real reviewed questions introduce more precise focuses, the teacher/reviewer should prefer those over the generic fallback.

## Curated example

A platform-seeded focus exists for:

`Forming present continuous verbs`

under:

`eng.use-of-english.verb-aspect.simple-progressive`

Purpose:

- distinguish present-continuous formation from past-continuous practice
- allow intervention to target the actual diagnosed behaviour

---

<a id="BH-MANUAL-QUESTIONS"></a>
# BH-MANUAL-QUESTIONS — Manual “Create New Question” Workflow

## Default behaviour

A manually created teacher question remains **My Pool** by default.

It may be used in classroom assignments without affecting official Academic Profile.

## Current intended UX

The Academic Skill Registry area should remain visible.

For registry-enabled subjects the teacher follows:

1. **Strand**
2. **Skill**
3. **Subskill**
4. **Evidence Focus**

Then optionally:

**Submit for Academic Verification**

## Grade behaviour

- Academic Verification requires **exactly one target grade**.
- Classroom-only/My Pool questions may support multiple suggested grades.
- If the teacher has exactly one assigned grade for the selected subject, the UI may auto-select it.
- Assigned grades should be visibly labelled as the teacher’s own class/allocation.

## Submission sequence

```text
Teacher creates question
        ↓
Question saved safely to My Pool
        ↓
Teacher selects canonical Strand/Skill/Subskill/Evidence Focus
        ↓
Teacher checks “Submit for Academic Verification”
        ↓
Frozen manual submission snapshot created
        ↓
Question becomes in_review
        ↓
Still analytics_eligible = false
        ↓
Superadmin reviews curriculum + cognition + evidence + focus
        ↓
School Verified if approved
```

If submission to governance fails after the question is saved, the question must remain safely in My Pool; do not lose teacher work.

## Manual submission table

`public.teacher_question_manual_submissions`

Properties:

- append-only
- immutable snapshot
- direct authenticated table access intentionally restricted
- governance uses RPC rather than permissive direct policies
- stores question snapshot and taxonomy proposal
- manual provenance must remain honest: do not invent PDF/source metadata

## Manual submit RPC

Current Evidence-Focus-aware signature:

`public.rpc_teacher_submit_manual_question_for_governance(question_id, primary_skill_code, atomic_subskill_code, evidence_focus_code)`

Teacher proposal is not authority.

The superadmin still confirms:

- exact school curriculum mapping/objective
- canonical skill/subskill
- Evidence Focus
- assessment process
- cognitive process
- evidence statement
- confidence/rationale

---

<a id="BH-AI-QUESTION-GEN"></a>
# BH-AI-QUESTION-GEN — PDF / AI Question-Generation Governance

## Edge function

`supabase/functions/teacher_question_pdf_extract/index.ts`

Question-generation logic must:

- load the published canonical registry for the selected subject/grade
- require exact canonical skill/subskill codes
- never invent/paraphrase permanent taxonomy
- fail closed if registry unavailable
- mark no-fit cases for human review
- preserve source/provenance truthfully

## Current batch taxonomy rule

AI-generated candidates must carry canonical registry identity, including:

- registry version
- primary skill code/name
- atomic subskill code/name
- evidence statement
- human-attention flag when needed

## Evidence Focus requirement

**Target architecture:** AI/PDF-generated candidates should also propose a governed Evidence Focus, preferably selected from the controlled catalogue for the chosen subskill.

The final verified row must always have a valid Evidence Focus.

See `BH-KNOWN-GAPS` for rollout status of automatic AI/PDF focus proposal.

---

<a id="BH-ACADEMIC-PROFILE"></a>
# BH-ACADEMIC-PROFILE — Learning Evidence and Longitudinal Reporting

## Longitudinal model

Student weaknesses/focus areas are append-only observations.

Do not overwrite previous observations when new work arrives.

Each observation should preserve enough context to understand:

- subject
- skill/topic/subskill
- Evidence Focus where applicable
- source assignment/task
- timestamp
- evidence/score
- current status
- whether the evidence is qualified/verified

Reports should identify:

- recurring weaknesses
- improved areas
- unresolved areas
- persistent issues
- recommended next intervention

## Stable identity vs precise focus

The permanent `skill_key` should remain based on stable canonical taxonomy.

Evidence Focus adds precision **inside** that stable skill identity.

Do not change `skill_key` for every small focus variation, or longitudinal identity becomes fragmented.

## Verified evidence only

Only verified/qualified evidence should affect official Academic Profile.

My Pool classroom questions:

- may be graded
- may appear in classroom reports
- must not alter official strengths/weaknesses/intervention state

Writing:

- should only become authoritative after the required final teacher review/finalization path

## Evidence materialization

Important private functions include:

- `private.materialize_verified_assignment_item_evidence(...)`
- `private.ingest_verified_assignment_diagnostic_evidence(...)`

Evidence snapshots now include Evidence Focus metadata.

Ingestion should keep stable canonical identity while carrying:

- `evidence_focus_code`
- `evidence_focus_name`

Evidence granularity uses the concept:

`diagnostic_evidence_focus`

---

<a id="BH-INTERVENTION"></a>
# BH-INTERVENTION — Weakness Targeting and Intervention Matching

## Principle

Intervention should remediate the **specific diagnosed behaviour**, not simply repeat random questions from the same broad canonical subskill.

## Example

Weakness:

`Forming present continuous verbs`

Canonical identity:

```text
Use of English
→ Verb aspect
→ Simple versus progressive aspect
```

Precise remediation target:

```text
Evidence Focus
→ Forming present continuous verbs
```

Appropriate practice progression might include:

- choose `am / is / are`
- form `-ing`
- affirmative form
- negative form
- question form
- contextual present-continuous use
- present simple vs present continuous as a harder related step

Past continuous should **not** be treated as an exact match merely because it shares the same broad canonical subskill.

## Matching tiers

Current intended focus-aware matching order:

### Tier 1 — exact Evidence Focus

Same:

- subject/scope
- canonical skill
- canonical subskill
- `evidence_focus_code`

This is the preferred targeted-practice source.

### Tier 2 — same canonical subskill

Different or broader Evidence Focus, but same canonical subskill.

Use as related practice, not first-choice remediation.

### Tier 3 — same broader canonical skill family

Use as broader related practice only.

Do not silently substitute these when exact-focus practice exists.

## Important matcher

`private.verified_questions_for_learning_focus(..., evidence_focus_code)`

Expected output includes concepts such as:

- exact/recommended ids
- same-subskill ids
- broader-skill ids
- counts by tier

## Intervention intelligence

`public.rpc_teacher_student_intervention_intelligence(...)`

Should surface the specific Evidence Focus where known, rather than only the broad skill label.

## Practice question count

Historical intervention logic has selected up to roughly **6** verified questions for targeted practice. Preserve sane limits and avoid dumping an entire bank into one intervention.

---

<a id="BH-MASTERY"></a>
# BH-MASTERY — Improvement and Mastery Rules

Targeted practice does **not** establish mastery.

This is a hard rule.

Correct model:

```text
diagnosed weakness
→ targeted practice
→ practice may show support/progress
→ later independent verified assessment
→ only then may weakness become improved/resolved/mastered
```

Why:

- practice is scaffolded and targeted
- repeated practice can inflate apparent mastery
- independent evidence is required to verify transfer

Do not mark a weakness resolved merely because the student completed the intervention assignment.

---

<a id="BH-SECURITY"></a>
# BH-SECURITY — RLS, SECURITY DEFINER, Access Boundaries

## General rule

Frontend filtering is never the authorization boundary.

Sensitive question governance and academic evidence must be enforced in SQL/RPC.

## RLS

All exposed public tables should have appropriate RLS.

Special case:

`teacher_question_manual_submissions`

RLS is enabled with no permissive authenticated direct-write policy by design. Teachers act through ownership-validating RPC.

Do not add a broad policy merely to silence an advisor warning.

## SECURITY DEFINER

Some governance RPCs are intentionally `SECURITY DEFINER`.

When using `SECURITY DEFINER`:

- set `search_path = ''`
- explicitly validate `auth.uid()`
- resolve role/profile
- validate ownership
- validate school
- validate question state
- validate canonical registry
- validate Evidence Focus
- revoke default broad execution
- grant only intended roles
- run Supabase advisors

Do not use SECURITY DEFINER as a generic fix for permission errors.

## Service role

Never expose the service-role key to browser/client code.

---

<a id="BH-DB-OBJECTS"></a>
# BH-DB-OBJECTS — Important Tables, Views, RPCs, Functions

This list is intentionally focused on academic question governance / profile / intervention.

## Registry

### Tables

- `public.academic_skill_registry_versions`
- `public.academic_skill_registry_nodes`
- `public.academic_skill_registry_subject_aliases`
- `public.academic_skill_framework_crosswalks`

### RPC

- `public.rpc_academic_skill_registry_for_generation(...)`

### Helpers

- `private.resolve_canonical_skill_pair(...)`
- `private.enforce_school_canonical_taxonomy_registry()`

## Evidence Focus

### Table

- `public.academic_skill_evidence_focuses`

### Columns added to taxonomy

- `evidence_focus_code`
- `evidence_focus_name`

### RPC/helper

- `public.rpc_academic_evidence_focuses_for_subskill(...)`
- `private.resolve_canonical_evidence_focus(...)`
- `private.resolve_or_create_evidence_focus_for_superadmin(...)`

## Question taxonomy

- `public.verified_question_diagnostic_taxonomy`
- `private.active_verified_question_diagnostic_taxonomy`
- `private.validate_verified_question_diagnostic_taxonomy()`

## Manual teacher governance

- `public.teacher_question_manual_submissions`
- `private.teacher_question_governance_submissions`
- `public.rpc_teacher_submit_manual_question_for_governance(...)`
- `public.rpc_superadmin_school_question_curriculum_options(...)`
- `public.rpc_superadmin_govern_school_question(...)`

## Platform taxonomy review

- `public.rpc_superadmin_question_taxonomy_review_queue(...)`
- `public.rpc_superadmin_decide_question_taxonomy_review(...)`

## Evidence ingestion / learner intelligence

- `private.materialize_verified_assignment_item_evidence(...)`
- `private.ingest_verified_assignment_diagnostic_evidence(...)`
- `public.student_learning_observations`
- `public.student_learning_observation_is_qualified(...)`

## Intervention

- `private.verified_questions_for_learning_focus(...)`
- `public.rpc_teacher_student_intervention_intelligence(...)`
- intervention assignment creation RPCs, including `rpc_create_intervention_practice_assignment` family

---

<a id="BH-MIGRATIONS"></a>
# BH-MIGRATIONS — Key Migration History

The exact repository migration file is the reproducible source; inspect it before editing.

## English registry / taxonomy

- `20260924024223_create_cambridge_aligned_english_skill_registry_v1`
- `20260924024638_enforce_canonical_english_taxonomy_for_school_questions`
- `20260924032941_extend_english_registry_for_cambridge_first_language`
- `20260924033042_extend_english_registry_verb_and_compound_forms`
- `20260924033300_complete_english_registry_extension_and_phase_guard`
- `20260924033355_align_primary_english_registry_phase_coverage`
- `20260924033707_migrate_existing_english_taxonomy_to_canonical_registry`
- `20260924033846_complete_cambridge_crosswalks_for_english_registry`

## Manual governance

- `20260924040538_manual_question_registry_governance`
- `20260924041116_index_manual_question_governance_foreign_keys`

## Multi-subject registries

- `20260924043545_create_multisubject_cambridge_skill_registries_v1.sql`
- `20260924043703_generalize_canonical_registry_governance.sql`
- `20260924043823_add_global_perspective_registry_alias.sql`
- `20260924043853_extend_mathematics_registry_calculus.sql`
- `20260924044042_extend_multisubject_registries_from_bank_audit.sql`
- `20260924044214_complete_geography_hazard_subskills.sql`
- `20260924044544_refine_multisubject_registry_phase_coverage.sql`
- `20260924044851_migrate_existing_multisubject_taxonomy_to_canonical_registries.sql`
- `20260924045426_refine_multisubject_cambridge_crosswalk_scope.sql`
- `20260924045505_scope_registry_programmes_by_subject_alias.sql`

## Evidence Focus

- `20260924052000_add_governed_evidence_focus_layer.sql`

This migration is the main reference for:

- Evidence Focus table
- active taxonomy focus columns
- append-only backfill
- default focus coverage
- focus resolver
- manual verification signature
- superadmin school governance
- evidence propagation
- focus-aware intervention matcher
- global taxonomy review support
- integrity audit

---

<a id="BH-UI"></a>
# BH-UI — Teacher/Admin UX Contracts

## Teacher “Create New Question”

Professional flow:

```text
Subject
Target Grade
Academic Skill Registry
  1. Strand
  2. Skill
  3. Subskill
  4. Evidence Focus
Submit for Academic Verification
```

The registry panel should remain visible even before it is unlocked.

Good locked-state copy:

> Select exactly one target grade to unlock Strand → Skill → Subskill → Evidence Focus.

When loaded:

- show `Ready`
- show registry version
- show phase
- show Cambridge programme badges
- show descriptions
- show selected academic path
- show `Intervention target selected` once Evidence Focus is chosen

## Superadmin School Verification Gate

Must include controlled:

- school curriculum objective
- canonical skill
- canonical subskill
- Evidence Focus
- assessment objective/process
- cognitive process
- evidence statement
- confidence/rationale

Evidence Focus must be loaded from the catalogue for the final selected subskill.

Do not let the admin type an arbitrary free-text focus as the authoritative code.

## Assignment Wizard

Pool selector:

- All pools
- Brains Heist Verified
- School Verified
- My Pool

Official-evidence summary should distinguish Brains Heist Verified and School Verified counts.

---

<a id="BH-TESTING"></a>
# BH-TESTING — Regression and Smoke-Test Expectations

## Relevant regression tests

Examples currently used/added:

- `tests/academicSkillRegistry.test.ts`
- `tests/multiSubjectAcademicSkillRegistry.test.ts`
- `tests/manualQuestionAcademicVerification.test.ts`
- `tests/evidenceFocusGovernance.test.ts`
- `tests/teacherWorkspaceRedesign.test.ts`
- other longitudinal / learning intelligence tests in the existing suite

## Required checks after meaningful edits

At minimum:

1. `npm run typecheck`
2. `npm test`
3. production build
4. `git diff --check`
5. relevant Supabase live query / rollback-only smoke test
6. Supabase security advisor when auth/RLS/functions changed
7. Supabase performance advisor when indexes/query paths changed
8. Vercel deployment must be checked for `READY`

## Academic governance smoke test

For manual school verification:

1. create temporary teacher-owned active unverified question
2. exact one grade
3. select registry skill/subskill
4. select Evidence Focus
5. teacher submits governance RPC
6. verify question becomes `in_review`, `analytics_eligible=false`
7. superadmin loads curriculum options
8. superadmin approves with canonical taxonomy/focus
9. verify:
   - `pool_scope=school`
   - `verification_status=verified`
   - `analytics_eligible=true`
   - canonical taxonomy active
   - Evidence Focus active
10. rollback transaction / remove temporary data

## Intervention smoke test

High-value end-to-end test:

1. use a verified question with a known Evidence Focus
2. create qualified student evidence showing failure
3. verify observation stores stable skill identity + Evidence Focus
4. run intervention intelligence
5. confirm exact-focus questions rank before:
   - same-subskill/different-focus questions
   - broader-skill questions
6. create targeted practice
7. confirm targeted practice does not directly establish mastery
8. use separate later verified assessment to confirm improvement/resolution

---

<a id="BH-LIVE-STATE"></a>
# BH-LIVE-STATE — Last Verified Live State

**Snapshot date:** 2026-09-24

## Registry state

Published registries: **8**

Published active canonical subskills: **460**

## Verified taxonomy

Active verified taxonomy rows: **1,709**

Active verified taxonomy rows carrying Evidence Focus: **1,709**

Active verified taxonomy rows missing Evidence Focus: **0**

## Evidence Focus catalogue

Active focus options: **1,366**

Active published subskills with no focus option: **0**

## Multi-subject bank status before Evidence Focus rollout

The verified English + non-English registry-enabled banks had already been canonicalized.

Earlier verified audit result:

- verified registry-enabled questions: **1,709**
- canonical: **1,709**
- non-clean verified taxonomy: **0**

## School Verified content

The system has real School Verified content; School Pool is not theoretical.

The Assignment Wizard was updated so School Verified is a first-class filter and official evidence source.

## Edge function

Teacher PDF extraction has previously been deployed as an active Supabase Edge Function after multi-subject registry generalization.

Always re-check the current deployed version before claiming a specific version is live.

---

<a id="BH-KNOWN-GAPS"></a>
# BH-KNOWN-GAPS — Remaining Incomplete / Unverified Work

This section is deliberately explicit. Future AI agents must not claim “finished” unless these are rechecked.

## 1. AI/PDF automatic Evidence Focus proposal

The database and governance layer require/understand Evidence Focus.

The remaining production-quality AI path should ensure:

- PDF/AI generation loads controlled Evidence Focus options for the selected canonical subskill
- model selects/proposes an existing focus
- candidate schema carries `evidence_focus_code/name`
- batch validation requires focus when a governed catalogue is available
- no arbitrary focus code can be invented
- no-fit → human review

At the point this reference was consolidated, this automatic proposal path still required final completion/verification.

## 2. Latest Evidence Focus frontend build/deployment

Manual teacher UI and admin-review code were edited to include Evidence Focus.

Before relying on production:

- check latest GitHub commit
- check TypeScript/tests/build
- check latest Vercel deployment is `READY`
- visually smoke test:
  - Create New Question
  - Evidence Focus dropdown
  - School Verification Gate

## 3. Full Evidence Focus end-to-end smoke

Still required as a definitive production proof:

```text
verified question with focus
→ student failure
→ qualified observation with focus
→ intervention intelligence
→ exact-focus question ranking
→ targeted practice
→ independent reassessment
```

## 4. Evidence Focus catalogue quality

The backfill guarantees coverage, not perfect semantic consolidation.

Some focus entries came from historical evidence statements and may be very specific or phrased inconsistently.

Future refinement should:

- merge duplicate semantic focuses where appropriate
- preserve aliases/history
- avoid rewriting old evidence
- keep focus codes stable once used in learner evidence
- prefer human-governed curated focuses for common competencies

Do not solve catalogue quality by deleting historical focus identities already referenced by evidence.

---

<a id="BH-DO-NOT-BREAK"></a>
# BH-DO-NOT-BREAK — Hard Invariants for Future Edits

1. **Never let My Pool affect Academic Profile.**
2. **Never let targeted intervention practice establish mastery.**
3. **Never overwrite longitudinal weakness/focus history.**
4. **Never rewrite verified taxonomy history in place; supersede it.**
5. **Never invent canonical skill/subskill codes in AI generation.**
6. **Never invent Evidence Focus codes outside the governed catalogue.**
7. **Never merge Cambridge AO namespace with Brain Heist AO namespace.**
8. **Never allow Biology to select Chemistry-only canonical leaves, etc.**
9. **Never allow Russian/Kyrgyz to inherit German-only IGCSE alignment.**
10. **Never remove School Verified as a first-class assignment pool.**
11. **Never classify School Verified questions as classroom-only evidence.**
12. **Never use frontend filtering as authorization.**
13. **Never expose service-role credentials client-side.**
14. **Never add permissive RLS just to silence an advisor warning.**
15. **Never broaden a failed canonical match silently; require review.**
16. **Never create a tiny permanent canonical subskill for every misconception; use Evidence Focus.**
17. **Never change stable `skill_key` identity merely because Evidence Focus becomes more precise.**
18. **Never claim production completion until live DB + tests + deployment are verified.**

---

<a id="BH-EDIT-CHECKLIST"></a>
# BH-EDIT-CHECKLIST — Checklist Before Merging Future Changes

## If editing question creation

Read:

- `BH-QUESTION-AUTHORITY`
- `BH-REGISTRY`
- `BH-EVIDENCE-FOCUS`
- `BH-MANUAL-QUESTIONS`

Check:

- My Pool remains default
- exact grade required only for Academic Verification
- canonical taxonomy controlled
- Evidence Focus controlled
- failure leaves teacher question safely saved

## If editing AI/PDF generation

Read:

- `BH-AI-QUESTION-GEN`
- `BH-REGISTRY`
- `BH-EVIDENCE-FOCUS`

Check:

- registry fetched before generation
- codes selected from supplied list
- Evidence Focus selected from governed list
- no invented taxonomy
- no-fit is explicit human review

## If editing School Verification

Read:

- `BH-TAXONOMY`
- `BH-EVIDENCE-FOCUS`
- `BH-SECURITY`

Check:

- frozen content hash
- school ownership
- exact curriculum mapping
- canonical skill/subskill
- Evidence Focus belongs to subskill
- assessment/cognitive/evidence reviewed
- approved row becomes analytics eligible only through governed path

## If editing assignments

Read:

- `BH-QUESTION-AUTHORITY`
- `BH-ASSIGNMENTS`

Check:

- All / BH Verified / School Verified / My Pool filters
- School Verified + BH Verified count as official evidence
- My Pool stays classroom-only
- grade eligibility
- deletion cleanup model

## If editing Academic Profile

Read:

- `BH-ACADEMIC-PROFILE`
- `BH-MASTERY`

Check:

- append-only observations
- verified evidence only
- stable skill identity
- Evidence Focus retained in evidence payload
- recurring/improved/unresolved logic preserves chronology

## If editing Intervention

Read:

- `BH-INTERVENTION`
- `BH-EVIDENCE-FOCUS`
- `BH-MASTERY`

Check ranking:

1. exact Evidence Focus
2. same canonical subskill
3. same canonical skill family

Check:

- no random broad practice ahead of exact remediation
- no targeted-practice mastery
- independent reassessment required

## If editing security / RPCs

Read:

- `BH-ROLES`
- `BH-SECURITY`

Check:

- `auth.uid()`
- teacher profile ownership
- school scope
- RLS
- grants/revokes
- `search_path=''`
- advisor output
- rollback-only smoke test

---

# Final Mental Model

The safest way to reason about Brain Heist academic intelligence is:

```text
QUESTION AUTHORITY
My Pool
    └─ classroom only

School Verified / Brains Heist Verified
    └─ official evidence eligible
          ↓
CANONICAL ACADEMIC IDENTITY
Registry
→ Strand
→ Skill
→ Subskill
          ↓
PRECISE DIAGNOSTIC TARGET
Evidence Focus
          ↓
QUESTION-SPECIFIC PROOF
Evidence statement
          ↓
STUDENT HISTORY
Append-only qualified observations
          ↓
LEARNING INTELLIGENCE
Recurring / improving / unresolved
          ↓
INTERVENTION
Exact focus first
→ same subskill second
→ broader skill third
          ↓
MASTERY
Only independent later verified evidence can resolve the weakness
```

That chain should remain intact across every future feature, UI redesign, migration, reporting enhancement, and AI-generation workflow.
