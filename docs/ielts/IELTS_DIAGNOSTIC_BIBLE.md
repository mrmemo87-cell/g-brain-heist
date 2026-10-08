# Brains Heist IELTS Diagnostic Bible

**Status:** LOCKED CANONICAL CONTRACT  
**Version:** 1.4.0\
**Effective date:** 2026-10-08\
**Scope:** Every Brains Heist IELTS diagnostic, screener, baseline assessment, band estimate, readiness estimate, result interpretation, weakness/strength conclusion, recommendation, school report, scoring service, AI evaluation prompt, question bank, audio asset, attempt table, RPC, migration, analytics event, and related UI.  
**Audience:** Human developers, Codex/ChatGPT/Claude/other AI agents, content authors, reviewers, school pilot operators, and future maintainers.

> **Mandatory rule:** Read this file before changing any IELTS diagnostic-related code, content, schema, scoring, prompts, copy, analytics, reporting, or school pilot behaviour.

This file exists to stop Brains Heist from drifting into invalid assessment claims while the product evolves. If current code, old documentation, old prompts, or a previous implementation conflicts with this Bible, **this Bible wins** unless the Bible itself is explicitly revised through a reviewed change.

---

## 1. Product promise and terminology

Brains Heist is an **IELTS preparation and readiness platform**. It is not IELTS, is not an IELTS test centre, and must never imply official endorsement, official examiner status, or that an internal result is an official IELTS score.

The product must distinguish three assessment products:

### 1.1 Quick Readiness Screener

A short, school-friendly check designed to identify likely strengths, likely gaps, and what to test or practise next.

Allowed outputs:
- raw score;
- percentage where meaningful;
- construct-level performance;
- item-level evidence;
- provisional readiness range **only when a validated calibration model exists**;
- confidence level;
- next recommended assessment/practice.

Not allowed:
- “your real IELTS band”;
- an official-sounding four-skill overall band;
- high-confidence band claims from a short form that has not been calibrated;
- persistent weakness labels from one short sitting.

### 1.2 Full Baseline Diagnostic

A comprehensive Brains Heist assessment designed to estimate IELTS readiness across Listening, Reading, Writing, and Speaking.

Allowed outputs, after all gates in this Bible pass:
- estimated readiness band by skill;
- estimated overall readiness band;
- confidence by skill and overall;
- evidence/coverage summary;
- construct-level strengths and development areas;
- recommended interventions;
- teacher-reviewed productive-skill results where required.

Required wording:
- **Estimated IELTS readiness**
- **Brains Heist diagnostic estimate**
- **Not an official IELTS result**

### 1.3 Official IELTS result

Only an externally issued IELTS result may be called an official IELTS band score.

Brains Heist must never:
- call its own evaluator an “official IELTS examiner”;
- imply that its estimate is equivalent to an official Test Report Form;
- use “real IELTS band score” as a headline for an unvalidated short diagnostic.

---

## 2. Non-negotiable assessment truths

These rules reflect current public IELTS information and must be rechecked against current official sources before a scoring-policy change.

### 2.1 Four skills

IELTS reports four section scores:
- Listening
- Reading
- Writing
- Speaking

An overall IELTS-style estimate must not be produced when one or more required skills are missing, unless the UI explicitly labels the value as a partial or provisional readiness summary rather than an overall IELTS estimate.

### 2.2 Listening

The current IELTS Listening format uses:
- approximately 30 minutes;
- 4 parts;
- 40 questions;
- 1 mark per correct answer;
- a variety of question types and listening demands.

A 10-question single-context form-completion activity is therefore **not** a sufficient basis for claiming a full Listening band without an empirically validated short-form calibration model.

### 2.3 Reading

Reading band conversion must respect test type and validated scoring policy. Academic and General Training Reading do not share identical raw-score boundaries.

A generic percentage-to-band formula must never be treated as official or automatically portable across test forms.

### 2.4 Writing

Writing must be evaluated using the four IELTS-style criteria:
- Task Achievement for Task 1 / Task Response for Task 2;
- Coherence and Cohesion;
- Lexical Resource;
- Grammatical Range and Accuracy.

If Brains Heist produces a full Writing readiness band intended to approximate the complete IELTS Writing paper, both Task 1 and Task 2 evidence must be considered and Task 2 must receive the appropriate greater weighting.

AI-only evaluation may assist, but pilot-school Writing scores must not be presented as high-confidence final evidence until the AI scoring approach has been validated and the required human-review policy has been satisfied.

### 2.5 Speaking

Speaking must sample the required speaking behaviours across Parts 1, 2, and 3 when producing a full Speaking readiness estimate.

The four criteria are:
- Fluency and Coherence;
- Lexical Resource;
- Grammatical Range and Accuracy;
- Pronunciation.

**Pronunciation must not be scored from transcript text alone.** Audio evidence is required for pronunciation-related conclusions.

### 2.6 Overall band-style calculation

Only after all four eligible skill estimates exist may Brains Heist compute an IELTS-style overall readiness estimate.

The current official IELTS overall calculation is the average of the four section bands, rounded to the nearest whole or half band using the current IELTS rounding rules. This rule must be versioned and reverified before production scoring-policy changes.

---

## 3. Validity before polish

No UI quality, animation, funnel conversion, or attractive result card can compensate for weak assessment validity.

Every diagnostic change must answer:

1. **What ability is this item or task intended to measure?**
2. **Does the task actually elicit that ability?**
3. **What evidence is stored?**
4. **How much evidence is required before a conclusion is shown?**
5. **What is the uncertainty?**
6. **Can another reviewer reconstruct why this conclusion was produced?**
7. **Would the same logic still be defensible if shown to a school head, teacher, parent, or external assessment specialist?**

Do not make an inference broader than the evidence.

Examples:

- One missed time question may support:  
  “Missed a numerical-detail item.”

- Several reviewed items across independent tasks may support:  
  “Numerical-detail listening appears to be a development area.”

- Repeated qualified evidence over time may support:  
  “Persistent weakness: numerical-detail listening.”

One wrong question must never directly become a persistent weakness.

---

## 4. Evidence-first architecture

The canonical principle is:

**source evidence → immutable attempt → item outcomes → reviewed taxonomy → scoring run → confidence → rebuildable conclusion**

The result label is never the source of truth.

### 4.1 Required evidence objects

The implementation may evolve, but the system must preserve the following concepts:

#### Assessment form
Must identify:
- stable form ID;
- form version;
- assessment mode: screener / baseline / reassessment / benchmark / practice;
- Academic or General Training where relevant;
- item set / task set versions;
- taxonomy version;
- scoring-policy version;
- content provenance;
- publication/review state.

Published assessment forms are immutable. Corrections require a new version.

#### Attempt
Must identify:
- attempt ID;
- student/user ID;
- school/class context when relevant;
- form ID and exact version;
- started/completed/submitted timestamps;
- attempt status;
- resume/interruption state where applicable;
- integrity status;
- accommodations or delivery-mode metadata when relevant.

#### Item response
Must preserve:
- stable item key;
- response state;
- submitted response or safe normalized representation as appropriate;
- unanswered state separately from incorrect;
- marks awarded / possible where relevant;
- timing metadata where useful;
- exact item/version linkage.

#### Scoring run
Must preserve:
- scoring-policy version;
- source attempt ID;
- raw score;
- eligible band/readiness output;
- confidence;
- warnings/limitations;
- server-verification state;
- model/prompt/reviewer provenance for productive skills.

#### Result projection
Must be rebuildable from authoritative evidence and scoring policy.

It may be cached for speed, but the cache is not the academic source of truth.

### 4.2 Funnel analytics are not academic evidence

Tables/events created for marketing funnel analysis, including `ielts_funnel_events`, must never be the authoritative source for:
- student band readiness;
- strengths/weaknesses;
- teacher decisions;
- school reports;
- longitudinal learning conclusions.

Funnel events may record that a user started or completed a diagnostic, but the academic result must come from assessment attempt data.

---

## 5. Assessment integrity and server trust

### 5.1 Answer keys

For school diagnostics and any trusted readiness estimate:
- answer keys must not be shipped to the browser before submission;
- the browser must not be the authoritative scorer;
- server-side or trusted service-side scoring must recompute objective results.

Client-side display helpers may show results **after** a trusted score is returned, but cannot define the authoritative score.

### 5.2 Client claims are untrusted

Values stored in:
- localStorage;
- sessionStorage;
- query strings;
- browser state;
- client-generated metadata;
- client-supplied `estimated_band`;

must be treated as untrusted.

They can support UX recovery, but they cannot become academic truth without server verification.

### 5.3 School isolation

All school diagnostic data must preserve fail-closed authorization:
- students see only their permitted results;
- teachers see only authorized students/groups;
- school administrators remain school-scoped;
- cross-school access must fail closed;
- service-role credentials never reach the client.

### 5.4 Idempotency and append-only history

Submission and scoring must be idempotent.

A corrected score must not erase the historical scoring run. Supersede or version it.

Academic history must remain reconstructable.

---

## 6. Content provenance and rights

Brains Heist diagnostic content must be either:

1. original Brains Heist content; or
2. content for which Brains Heist has documented permission/licensing to redistribute and use.

Every publishable diagnostic package must have provenance metadata covering:
- author/source;
- ownership or licence basis;
- reviewer;
- review date;
- content version;
- content hash;
- audio provenance;
- publication status.

Do not copy questions, passages, answer keys, audio, transcripts, or complete tasks from random IELTS preparation websites.

Publicly visible third-party practice material is **not automatically licensed for redistribution**.

Official sample material may be used only in ways consistent with its permissions/terms and must not be republished by default.

AI-generated items or audio:
- are drafts, not automatically trusted content;
- require human editorial review;
- require answer-key review;
- require taxonomy review;
- require a difficulty/quality check;
- must not auto-publish.


### 6.1 Listening audio production and acceptance

Spoken directions are not a substitute for delivery behaviour. A recording that says to read questions must actually provide reading time before the passage begins.

Required for every published Listening audio version:
- **Measured reading and response intervals.** Insert real silence during audio assembly, or use an explicit player-controlled pause that waits for the learner. Do not rely on punctuation, line breaks, or a speech-generator pause tag to produce a required duration. State the interval or resume action clearly. Measure the final encoded file, not only the script.
- **Clear instruction/passage separation.** Use a distinct instruction voice or a reliably distinguishable, reviewed delivery style. Choose natural passage voices appropriate to the speakers and contexts; maintain consistent character voices within each passage. Do not use exaggerated emphasis that reveals an answer.
- **Calm, professional sound.** Use intelligible pronunciation, natural pace, consistent perceived volume and adequate headroom without clipping. Background music and decorative effects must not mask speech or add irrelevant listening difficulty. Do not accelerate audio just to shorten delivery.
- **Content fidelity.** Verify the complete rendered recording against the versioned transcript and answer key, including names, numbers, corrections, qualifications and word-limit instructions. Generation success is not a listening review.
- **Versioned production record.** Preserve the source script version/hash, provider, voice identities, generation settings and source asset/task references, editing/assembly decisions, measured cue timings, duration, format, exact delivered-file SHA-256, rights basis and durable delivery location. No expiring generation/download URL may be the permanent assessment source. Never overwrite an approved audio object; changes require a new audio version and review of the affected form.
- **Explicit review scope.** Record the actual reviewer, date, exact file hash and what they checked. Approval of sound, pacing or pauses does not silently approve the answer key, taxonomy, licensing, difficulty, calibration or school launch. Preserve each outstanding gate separately.
- **Reliable player behaviour.** No automatic passage playback on page load or teacher resume. Teacher pause, submission and void states must stop playback and prevent restart while inactive. Test loading, seeking/replay under the form's rules, buffering, backgrounding, interruption and resume on the pilot browsers/devices. Keep answers safe and give a clear next action when audio fails.

For the initial Brains Heist Listening Screener A audio v2, the owner-approved production design is **30 seconds to read each four-question group**, **15 seconds after each passage to finish responses**, distinct instruction and passage voices, and learner-controlled pause/replay. These are Brains Heist screener delivery conditions, **not official IELTS timing rules** and not universal baseline/benchmark defaults. Record them with the form and attempt delivery metadata; changes require review for their effect on comparability.

---

## 7. Diagnostic taxonomy

The diagnostic must measure named constructs, not vague labels.

Taxonomy must be versioned and reviewed.

### 7.1 Listening construct examples

Possible atomic/reviewed constructs include:
- explicit detail;
- numerical information;
- dates/times;
- spelling/orthographic accuracy where task-relevant;
- word-limit/task compliance;
- paraphrase recognition;
- distractor resistance;
- main idea/gist;
- speaker purpose;
- speaker attitude/opinion;
- sequencing;
- matching/reference tracking;
- academic-monologue comprehension.

### 7.2 Reading construct examples

Possible constructs include:
- locating explicit evidence;
- scanning;
- main idea;
- heading/paragraph purpose;
- paraphrase recognition;
- inference;
- True/False/Not Given reasoning;
- writer stance/purpose;
- vocabulary in context;
- reference/cohesion;
- detail discrimination.

### 7.3 Writing constructs

Two layers must be preserved:

**IELTS-style rating criteria**
- Task Achievement / Task Response;
- Coherence and Cohesion;
- Lexical Resource;
- Grammatical Range and Accuracy.

**teachable micro-skills**
- thesis/position clarity;
- idea development;
- paragraph control;
- evidence/example relevance;
- cohesion;
- referencing;
- lexical precision;
- collocation;
- grammatical range;
- grammatical error families;
- register/task fulfilment.

### 7.4 Speaking constructs

**IELTS-style rating criteria**
- Fluency and Coherence;
- Lexical Resource;
- Grammatical Range and Accuracy;
- Pronunciation.

**teachable micro-skills**
- sustained turn;
- hesitation/repetition pattern;
- topic development;
- discourse organization;
- paraphrase;
- lexical precision/range;
- grammatical range;
- grammatical control;
- intelligibility;
- stress/rhythm/intonation;
- connected speech where validly measurable.

### 7.5 Mapping governance

AI may suggest taxonomy mappings but must not silently approve them.

Published diagnostic items require reviewed mappings.

A meaningful item edit must invalidate or stale the old mapping until re-reviewed.

---

## 8. Strengths, weaknesses, and persistence

Brains Heist must separate:

- **item observation** — what happened on one item;
- **task pattern** — what happened across a single task;
- **diagnostic development area** — pattern supported by enough diagnostic evidence;
- **recurring weakness** — repeated across separate source instances;
- **persistent weakness** — repeated across time with sufficient qualified evidence;
- **improving** — later evidence shows meaningful recovery;
- **resolved** — recovery meets the governed threshold;
- **strength** — consistently strong evidence with sufficient coverage.

The diagnostic must integrate with the existing Brains Heist academic-confidence philosophy rather than creating a parallel “one miss = weakness” system.

A single diagnostic sitting may identify **development areas** or **lowest-performing constructs**, but must not create a “persistent weakness” unless the general academic-confidence policy's persistence requirements are satisfied.

Missing or unanswered data is not automatically evidence of inability.

---

## 8A. Longitudinal learning record and decision policy

**Owner requirement (2026-10-08):** Track each student's strengths, difficulties and response to practice through a traceable learning record. The rules below define the required future implementation; they do not assert that current screeners already establish persistence, sustained improvement or mastery.

### 8A.1 The unit of tracking

Track a reviewed construct/atomic subskill, with an Evidence Focus where governed, under a stable taxonomy ID and version. Keep the four IELTS skills, their rating criteria and their teachable subskills distinct. A skill total or a criterion rating cannot automatically diagnose every child subskill.

Example: an essay's Task Response rating alone does not establish difficulty with supporting examples. That subskill needs an explicit reviewed observation linked to the relevant essay evidence.

Reuse the canonical Academic Profile evidence/confidence approach and the identity rules in `docs/academic-skill-registry.md`. IELTS-specific constructs require a reviewed, versioned crosswalk before pooling with English/ESL evidence. Similar names, topic tags and AI-generated labels are not equivalence. Other English practice can inform teaching without automatically becoming IELTS readiness evidence.

### 8A.2 Required learning-record fields

For each observation, preserve:
- student and authorized school/programme context;
- canonical skill/subskill/focus IDs, taxonomy/crosswalk versions and claim scope;
- source attempt, exact form/task/item versions and content hash; original response/essay/audio reference, excerpt or timestamp where applicable;
- assessment purpose, occurrence/submission time, source-instance/independence group and known prior exposure;
- outcome or rubric observation, marks/opportunities where meaningful, supporting evidence and contradictory evidence;
- trusted scoring run/policy, verification state, reviewer identity and review time; AI model/prompt/draft provenance separately;
- integrity, delivery, assistance and accommodation metadata; comparability decision and reasons;
- whether it qualifies for a task observation, recurring pattern, improvement comparison or persistence decision, with exclusion reasons;
- linked intervention, its target and completion/participation evidence when relevant.

Resume, duplicate submission, rescoring and several excerpts from one essay do not create independent tasks. Count a source instance once for source diversity while retaining its item-level opportunities. Do not count a Writing rubric and its essay excerpt as two independent performances.

### 8A.3 Eligibility and comparability

Only trusted, reviewed-mapping evidence may drive academic conclusions. Apply the source's required human-review policy; AI drafts, client claims, marketing events and unverified free-text mappings do not qualify.

Missing/unanswered work, missing audio, pending scoring, a failed upload or a late teacher review are availability states, not zero attainment. An actual governed score may record an unanswered item under its existing marking rules, but that fact alone cannot diagnose inability in its mapped construct.

Before comparing performances, verify the same construct, compatible taxonomy and scoring, relevant task/test type, reviewed difficulty/coverage, delivery conditions, assistance and exposure. Do not pool Academic and General Training forms, Task 1 and Task 2 ratings, or distinct Speaking parts merely because they share a skill label. A cross-context claim needs its own qualified coverage.

Reused items, memorized prompts, exposed answers, guided corrections and scaffolded practice must retain their rehearsal/assistance labels. They may show participation or task observations but cannot independently prove improvement, strength, resolution or mastery. Difficulty adjustments require a documented validated method; raw percentages from unequal forms cannot serve as one.

Interruptions or accommodations are not automatic failure or automatic exclusion. Apply a documented integrity/comparability policy and retain the reason. Never exclude inconvenient incorrect evidence after seeing the result.

### 8A.4 Governed thresholds: no invented defaults

Before enabling a derived pattern or change label, register an academic-owner-approved, versioned policy for that construct, learner/task scope and evidence type. It must specify:
- minimum qualifying opportunities and independent source instances;
- task/context coverage, observation window, time separation, freshness and expiry/review rules;
- outcome/rubric thresholds for difficulty and strength, with a minimum confidence requirement;
- a defensible minimum change and treatment of measurement uncertainty for improvement;
- fresh follow-up requirements for sustained improvement and resolution;
- intervention opportunity and post-intervention evidence requirements for persistent difficulty;
- handling of mixed, contradictory, missing, assisted and integrity-flagged evidence;
- required teacher confirmation, reviewer disagreement and correction/supersession rules;
- validation basis, limitations, approver and effective version/date.

Repeated means evidence from more than one independent source instance; several questions in one sitting are not longitudinal repetition. This logical minimum is not a sufficient statistical threshold. Two essays, three misses, an arbitrary percentage increase or elapsed days must not silently become universal cutoffs.

If the relevant policy or its qualifying evidence is unavailable, keep the observation provisional or show **not enough evidence**. No agent, AI prompt or UI helper may invent a numeric threshold to make a status appear. Confidence remains separate from attainment, and current uncalibrated screeners retain their existing low-confidence limits.

### 8A.5 Pattern and change states

Store evidence availability/quality, attainment pattern and change trajectory as separate dimensions. A student can have a recurring difficulty and show improvement at the same time. Do not force every student through one linear badge ladder.

| State | Required meaning and gate |
| --- | --- |
| Not enough evidence | Required evidence, coverage, comparability or approved policy is missing. State what is needed next. |
| Possible strength / difficulty | An eligible item/task observation suggests a narrow area to check. It is not a confirmed learner trait. |
| Repeated strength / difficulty | The approved pattern policy passes across separate qualifying source instances, including counterevidence and confidence. |
| Improvement observed | Fresh independent comparable work shows a change meeting the approved improvement policy relative to a recorded reference. A higher total alone is insufficient. |
| Improvement sustained | Further independent follow-ups, separated as the policy requires, support maintained progress beyond the first improved task. |
| Persistent difficulty | The approved persistence policy passes across time, with documented opportunity for targeted learning, qualifying fresh post-intervention evidence and teacher confirmation. |
| Resolved for the assessed scope | The approved recovery/coverage/confidence policy passes and a teacher confirms the limited claim. Historical difficulty remains visible. |
| Mixed evidence / teacher review needed | Qualified observations conflict, conditions differ materially or reviewer disagreement is unresolved. Do not force a strong claim. |
| Evidence needs updating | Evidence is outside the approved freshness window. Lack of recent work does not imply deterioration or persistence. |
| Difficulty observed again | New evidence after recovery suggests recurrence; apply the pattern policy again before confirming regression or persistence. |

Use **sustained improvement**, not “resilient student”, as a performance label. Do not infer personality, effort, motivation, disability or psychological resilience from these records. Resolution is scoped to the assessed construct and conditions; it does not promise permanent mastery.

### 8A.6 Practice, reassessment and causal limits

The learning loop is:

**qualified observation → teacher-confirmed target → targeted practice → fresh comparable reassessment → review of change → later independent follow-up**

Record each intervention's subskill/focus, original evidence references, teacher confirmation, task/resource versions, intended action and success/check criteria, assignment/start/completion dates and linked reassessments. No suitable reviewed resource means “teacher planning needed”; do not silently substitute an unrelated task.

Practice completion is participation, not proof of learning. A missed or incomplete practice task does not prove persistent inability. If independent follow-up is missing or incomparable, report **improvement not yet established**, rather than “did not improve”.

Improvement observed after practice does not prove that the intervention caused it. Record other relevant teaching, assistance and conditions; show the observation without a causal guarantee.

Example: unclear supporting examples in an essay → teacher assigns explanation practice → a fresh comparable essay supports improvement → a later fresh essay checks maintenance. Rewriting the same essay with supplied feedback remains guided practice.

### 8A.7 Rebuildable decisions and teacher authority

Every conclusion must reference its supporting and contradictory source IDs, qualifying counts/coverage, comparison reference, applicable policy/version, confidence, as-of date, limitations and next action. Retain an append-only decision history, including teacher confirmation/disagreement and the reason for transitions.

Teacher confirmation cannot waive missing evidence or fabricate comparability. Teachers may annotate, reject or request further checks. AI may propose observations, explanations and practice drafts; it must not independently approve mappings, persistence, recovery or shared final feedback.

Corrections, voided attempts, superseded reviews and taxonomy/policy changes must invalidate affected projections and trigger a scoped rebuild. Preserve original evidence, old decisions and policy versions; do not rewrite history or count old and corrected runs twice. A changed algorithm is not student improvement.

Enforce the existing student/teacher/school access boundaries on every read, decision and intervention. Role changes must not expose another school's history. Cached summaries are derived views, not the source of academic truth.

### 8A.8 Implementation and acceptance sequence

1. **Inventory and governance:** audit current journey/Academic Profile sources and policies; approve taxonomy crosswalks, evidence qualification and numeric policy parameters. Keep advanced labels unavailable where approval is missing.
2. **Observation ledger:** connect original Listening/Reading outcomes and confirmed Writing/Speaking observations to stable identities with deduplication, provenance and availability states.
3. **Teacher evidence view:** show observations, confidence, source links and contradictions before enabling recurring/persistent conclusions.
4. **Intervention loop:** add teacher-confirmed targets and governed practice links; record participation separately from independent reassessment.
5. **Comparable reassessment:** publish reviewed alternate tasks/forms and evaluate improvement with policy-defined uncertainty and follow-ups.
6. **Derived journey:** enable approved pattern/change projections, teacher confirmation, simple student wording and audited corrections.
7. **Validation and scoped release:** use Gulzada's existing account for the normal authorized pilot without resets or role promotion; verify security, assessment validity, devices and applicable section 13 capacity gates before broader claims.

Compute projections through bounded, idempotent background work or scoped reads. Do not scan full histories or run AI/conclusion aggregation in each answer-save transaction. Index/paginate authorized reads and invalidate caches by source/policy version. Apply all section 13 concurrency requirements; this plan establishes no 500-user capacity claim.

Required acceptance cases include: one miss cannot create persistence; one success cannot create a confirmed strength; a whole sitting cannot masquerade as several sources; repeats/rescoring/duplicate AI reviews cannot inflate counts; assisted or easier work cannot establish independent improvement; missing data cannot become weakness; pending/failed processing cannot become zero; contradictory or stale evidence cannot silently retain a strong current claim; teacher approval cannot bypass evidence gates; fresh improvement can coexist with a remaining difficulty; sustained improvement and persistence each require their own policy; changed mappings/voids rebuild projections without erasing history; pronunciation requires audio; cross-school reads fail closed. Record expected outputs for each versioned policy, reviewed examples, disagreement handling and staged release results.

---

## 9. Objective scoring rules

### 9.1 No naïve percentage ladder

The following logic is prohibited as an authoritative diagnostic scoring rule unless supported by a validated calibration model:

- 90% = Band 9
- 80% = Band 8
- 70% = Band 7
- etc.

IELTS raw-score boundaries are not a generic percentage ladder and can vary by paper/test version.

### 9.2 Full-form objective estimates

For sufficiently full Listening/Reading forms, raw-to-band/readiness mapping must use:
- a versioned scoring policy;
- documented source/calibration;
- test type where relevant;
- exact form difficulty/version;
- explicit limitations.

### 9.3 Short-form estimates

A short screener may output a band range only if:
- it has been calibrated against an accepted external or internal benchmark;
- calibration method is documented;
- sample characteristics are documented;
- error/uncertainty is known;
- the UI shows confidence/range rather than false precision.

Until then, short forms report performance and constructs, not a definitive band.

---

## 10. Writing and Speaking evaluation

### 10.1 AI is an assistant, not an official examiner

Prompts must not say:

> “You are an official IELTS examiner.”

Use wording such as:

> “You are an assessment assistant applying the current public IELTS-style criteria for Brains Heist practice/readiness estimation. Your output is provisional and not an official IELTS result.”

### 10.2 Pilot-school human review

Before productive-skill AI scores can drive high-confidence school conclusions:
- a teacher/reviewer workflow must exist;
- AI and human ratings must be compared;
- disagreements must be observable;
- the scoring prompt/model version must be recorded;
- the final status must show whether the result is AI-provisional, teacher-reviewed, or otherwise verified.

### 10.3 Speaking audio requirement

Transcript-only analysis may support:
- vocabulary;
- some grammar;
- some discourse/topic development.

It may **not** independently support a valid pronunciation score.

Pronunciation requires the audio recording or another valid phonological evidence source.

### 10.4 Writing completeness

A full Writing readiness estimate requires appropriate Task 1 and Task 2 evidence.

A single Task 2 may be presented as:
- Task 2 diagnostic;
- writing-development snapshot;
- provisional Writing readiness evidence;

but not silently as a complete IELTS Writing band.

---

## 11. Confidence is separate from attainment

Every estimated band or readiness conclusion must carry confidence.

Confidence must reflect evidence quality, not student ability.

Possible inputs:
- number of qualifying items/tasks;
- construct coverage;
- test-form coverage;
- mapping quality;
- scoring mode;
- server verification;
- human review status;
- source diversity;
- recency;
- consistency;
- interruptions/integrity warnings.

Examples:
- Band-readiness estimate 6.5, **low confidence**;
- Band-readiness estimate 6.0–6.5, **medium confidence**;
- Band-readiness estimate 6.5, **high confidence** after sufficient validated evidence.

A short screener cannot produce **high confidence** merely because the student scored highly.

Teacher/admin views must not hide confidence.

---

## 12. Retakes and reassessment

Do not permanently block a student from future assessment.

Different purposes require different rules:

### Baseline
First valid diagnostic form.

### Practice
May reuse exposed concepts/items where appropriate, but practice evidence must be labelled as such.

### Reassessment
Must use a fresh or equivalently calibrated form when measuring improvement.

### Benchmark
Used for calibration/validation and may have stricter delivery conditions.

Do not claim improvement from:
- repeating the same memorized item set;
- a less difficult form without adjustment;
- exposed answer keys;
- a practice task presented as an independent reassessment.

Form A / Form B equivalence must be reviewed and eventually calibrated.

---

## 13. Delivery reliability

A school assessment is not ready until failure modes are tested.

Minimum test cases include:
- refresh during assessment;
- loss/recovery of connection;
- browser backgrounding;
- phone interruption;
- audio load failure;
- audio interruption;
- duplicate submit;
- repeated click;
- session expiry;
- sign-in/auth transition;
- resume after interruption;
- unanswered items;
- slow device;
- mobile browser;
- desktop browser;
- school network restrictions;
- simultaneous student submission;
- failed scoring service;
- failed AI service;
- teacher review delay.

Audio behaviour must be explicitly cross-browser tested for the browsers used in the pilot.

### 13.1 Concurrent-use architecture and capacity claims

**Owner requirement (2026-10-08):** IELTS must be designed for large numbers of students using it simultaneously. The initial capacity acceptance target is **500 concurrent active IELTS students**, with architecture that can be tested and scaled beyond that number. This is a Brains Heist engineering target, not an established capacity or an official IELTS requirement.

Assignment improvements do not automatically establish IELTS capacity. Verify each IELTS path and its shared infrastructure independently. Registered accounts, open idle tabs and concurrent active attempts are different measures. Never promise unlimited scale, failure-free operation, or support for 500/1,000 users without recorded evidence for that workload and environment.

Every IELTS implementation must:
- Separate lightweight discovery/status lists from the selected form's task payload. Scope reads to the authorized user, attempt and school; paginate reports and avoid downloading all attempts, responses or recordings on ordinary navigation.
- Keep answer persistence small and indexed. Record responses durably before acknowledging them; make retries and duplicate submissions idempotent. Preserve the distinction between locally pending work and server-saved work. Limit and jitter retries so recovery does not create a request storm.
- Preserve answer/finalization consistency under concurrent requests. Measure lock scope and duration; do not remove correctness locks without a tested replacement. Avoid shared form/question counter updates and unrelated reward, analytics or email work in the answer-save transaction.
- Deliver versioned audio through suitable storage/cache/CDN paths with the required access controls, rather than proxying every playback through database/scoring functions. Test simultaneous cold audio starts, buffering, expired delivery URLs, interrupted uploads and resume. Signed URLs, caching and previews must not expose protected content or answer keys.
- Persist Writing/Speaking submissions and recordings before acknowledging receipt. Run heavy AI/transcription/evaluation work through durable background jobs with explicit bounded worker/provider concurrency, idempotency, retry limits and failure recovery. Show queued/processing/failed states honestly; receipt is not a completed score or human review.
- Budget database connections across Auth, Data API, background workers and other app features. Use indexed query patterns, bounded batches/pools and controlled background-job overlap. Autoscaling frontend/API workers must not imply unlimited database or AI capacity.
- Keep browser state and subscriptions bounded. Avoid per-keystroke network saves, repeated full-form refetches, unnecessary polling and one subscription per item. Verify representative low-powered school devices as well as server load.

Performance work must preserve every evidence, scoring, authorization, review and publication rule in this Bible. Overload must never discard acknowledged answers, silently award zero for processing failures, duplicate scores/rewards, bypass school boundaries, or present provisional output as final.

### 13.2 Required IELTS staged concurrency tests

Before claiming capacity for the target audience, test **30 → 100 → 500 concurrent active students**, with distinct authenticated identities and fresh governed attempts. Stop escalation on failure. Tests above 500, including 1,000, require the same evidence before making that larger claim.

Use a faithful isolated hosted staging environment where possible: actual IELTS RPCs, schema, indexes, constraints, triggers, entitlement checks, background jobs and representative historic data, with recorded resource/connection/provider limits. A focused local API benchmark is useful diagnostic evidence but cannot certify production, browsers, audio or omitted services. Do not load production, send real emails, or incur new paid infrastructure/provider charges solely because this policy exists; those actions need authorization within the task.

Cover synchronized discovery/starts, Listening playback and answer saves, Reading navigation/saves, Writing draft persistence/submission, Speaking recording upload/submission, refresh/resume, session renewal/expiry, network recovery, duplicate requests and synchronized final submission. Include concurrent teacher reporting and representative background traffic. Test authentication bursts separately from already-authenticated assessment activity. Use approved synthetic/test data; a named student's pilot approval is not permission to clone their identity or overwrite their attempts.

Run realistic pacing as well as short bursts. Each stage must include at least 10 minutes of measured activity, and repeat the highest passing stage after recovery to expose sustained queue/connection problems. Supplement API load with real-browser/device checks and audio/upload delivery measurements. Never describe API virtual users as complete human browser sessions.

Record:
- exact code/form/scoring versions, harness version, environment, data size, stage duration and actual active concurrency;
- answer-save acknowledgment p95/p99, assignment/form load p95, Auth/Data API error counts/rates, timeouts and achieved request throughput;
- database connections, pool waits, blocking locks/deadlocks, query plans and CPU/I/O; queue depth, oldest-job age, completion latency, failures and provider rate limits;
- audio startup/buffering, recording upload/resume and Realtime end-to-end latency where used, plus browser responsiveness;
- expected versus stored responses, attempt completions and scoring runs; missing/duplicate writes, replay behavior, server-grade consistency and cross-school isolation.

Initial internal gates: answer-save acknowledgment **p95 <500 ms / p99 <1,500 ms** and scoped form/list/report API reads **p95 <1,500 ms**, measured end to end from the test client. All expected correctness/security checks must pass, with no missing acknowledged responses or unintended duplicate attempts/scoring runs. Audio, uploads, browser responsiveness, Auth, Realtime and asynchronous scoring require explicit numeric budgets and queue-drain deadlines recorded **before** the run. These are internal service targets, not official assessment standards or claims that the current implementation meets them. Do not hide failures behind overall averages or exclude failed/timed-out requests; retain failed stages and interrupted runs. Changes to gates require an explicit versioned policy revision, not a quieter retry.

### 13.3 Release and future-edit obligations

Every IELTS change affecting delivery, persistence, queries, subscriptions, audio/uploads, scoring jobs or shared infrastructure must identify its concurrency impact and the relevant test evidence. Changes to those paths invalidate applicable capacity evidence until the affected scenarios are rerun; unrelated copy-only edits need document checks, not a full load test.

A limited pilot may proceed within its documented scope under section 19; it must not inherit a 500-user capacity claim. Opening access at a larger intended concurrency requires passing evidence for that workload, monitoring and a documented stop/recovery plan. An interrupted run is not a pass. Background evaluation must drain within its declared deadline; a growing queue is not acceptable merely because submission returned quickly.


---

## 14. Accessibility and fairness

Diagnostic UX must not unintentionally measure unrelated friction.

Review:
- readable type and contrast;
- keyboard access;
- focus states;
- clear instructions;
- touch targets;
- audio controls consistent with assessment rules;
- no accidental hidden content;
- time/accommodation handling;
- device/network disadvantage;
- language in instructions appropriate to the task.

Accessibility support must not silently alter the construct being measured. If it does, record the accommodation/delivery mode so results can be interpreted correctly.

---

## 15. Reporting rules

Student and teacher results must clearly distinguish:
- official IELTS result;
- Brains Heist estimated readiness;
- short screener result;
- teacher-reviewed result;
- AI-provisional result;
- confidence level;
- evidence count/coverage;
- latest activity date;
- missing skills.

Never show an overall band when missing skills are silently ignored.

If an overall estimate is unavailable, say why.

Recommended school-facing language:
- “Estimated IELTS readiness”
- “Current evidence suggests…”
- “Confidence: medium”
- “Further evidence needed in Speaking”
- “Development area observed in this diagnostic”

Avoid:
- “Your real IELTS band”
- “Official band”
- “Guaranteed band”
- “You are Band 7” from a short screen
- “Weakness” when only one isolated item supports the claim

---

## 15A. School UX, language, and visual coherence

Academic validity and technical correctness are not enough. The IELTS experience must also feel **simple, professional, calm, school-appropriate, unmistakably Brains Heist, and visually coherent from beginning to end**.

### 15A.1 Complexity stays behind the interface

The underlying system may be sophisticated. The user experience must not feel sophisticated in a burdensome way.

Students and teachers should see:
- the next action;
- the information needed for that action;
- a short explanation when something matters;
- deeper evidence only when they choose to inspect it.

Use progressive disclosure. Do not dump scoring-policy details, taxonomy codes, database terminology, confidence formulas, internal statuses, or implementation language into ordinary school-facing screens.

A teacher should not need to understand the architecture to use the diagnostic correctly.

A student should not need instructions from a developer to know what to do next.

### 15A.2 School-appropriate language

Every student-, teacher-, parent-, and school-admin-facing surface must use clear, age-appropriate, professional educational language.

Do not expose:
- SQL/RPC/RLS terminology;
- raw exception messages;
- UUIDs or database field names;
- internal model/prompt terminology;
- developer shorthand;
- marketing language that exaggerates assessment certainty.

Role-specific wording should be deliberate:
- **students:** reassuring, concise, motivating, never childish or patronising;
- **teachers:** professional, actionable, evidence-led, quick to scan;
- **school leaders/admins:** concise operational language with appropriate evidence and limitations;
- **parents/guardians where applicable:** plain-language explanations without unnecessary technical jargon.

Error states must explain:
1. what happened in plain language;
2. whether work is safe;
3. what the user should do next.

Never show a raw technical error when a school-appropriate message can be provided.

### 15A.3 Brains Heist creative standard

The experience must have the creative care Brains Heist deserves without turning a serious school assessment into a game screen.

The design should feel:
- distinctive rather than generic;
- modern rather than corporate-grey;
- premium rather than decorative;
- energetic where helpful;
- calm during focused assessment;
- rewarding after completion;
- consistent across student, teacher, and admin surfaces.

Creative treatment must support comprehension. Decoration must never compete with instructions, answers, timing, accessibility, or result interpretation.

### 15A.4 One visual language

IELTS diagnostic surfaces must use a unified design system.

Maintain consistency in:
- typography;
- spacing;
- border radius;
- card hierarchy;
- buttons and interaction states;
- status treatments;
- progress indicators;
- colour meaning;
- charts;
- empty states;
- loading states;
- confirmation patterns;
- result cards;
- evidence/detail panels.

Do not create isolated “one-off” visual styles for individual diagnostic screens when an established Brains Heist component/pattern can be reused or extended.

### 15A.5 SVGs and icons

Icons and SVG illustrations must be treated as part of the product language, not filler.

Requirements:
- use a coherent icon family/style across the flow;
- prefer clean SVG/icon assets that scale sharply on school devices;
- align stroke weight, visual density, corner style, and sizing;
- use icons to improve recognition, navigation, status, and hierarchy;
- do not mix random icon packs/styles on the same experience;
- do not rely on emoji as the primary professional UI language when a proper icon exists;
- decorative SVGs must not distract from assessment tasks;
- meaningful icons need accessible labels or supporting text;
- colour must not be the only way an icon communicates state.

The same concept should use the same or clearly related icon wherever practical.

### 15A.6 Visual hierarchy and cognitive load

Every page should make the most important thing obvious within seconds.

Prefer:
- one primary action per decision point;
- short labels;
- clear sectioning;
- comfortable whitespace;
- scannable evidence summaries;
- expandable detail;
- concise teacher cards;
- focused student task screens.

Avoid:
- crowded dashboards;
- unnecessary counters;
- competing CTAs;
- unexplained badges;
- excessive tabs;
- decorative statistics;
- long walls of text;
- exposing every available control merely because the backend supports it.

If a feature makes the interface feel more complicated without improving the next decision, redesign or hide it behind a secondary detail layer.

### 15A.7 Motion and delight

Animation is allowed and encouraged when it:
- communicates progress;
- confirms completion;
- directs attention;
- makes transitions feel intentional;
- strengthens the Brains Heist identity.

Animation must not:
- distract during timed assessment;
- delay interaction;
- obscure content;
- make results feel like a casino/reward mechanic;
- create unnecessary cognitive load.

Respect reduced-motion preferences.

### 15A.8 Responsive school reality

Design for the real devices schools use, not only a designer's desktop.

Every important flow must remain usable on:
- school laptops;
- Chromebooks where applicable;
- tablets;
- student phones when permitted;
- common desktop browsers.

Long labels, translated text, smaller screens, browser zoom, keyboard navigation, and touch input must not break the layout.

### 15A.9 Visual accessibility is part of quality

Professional polish includes accessibility.

Required:
- sufficient contrast;
- visible focus states;
- readable type sizes;
- adequate touch targets;
- text labels for important controls;
- no colour-only status communication;
- keyboard support where relevant;
- sensible screen-reader semantics;
- reduced-motion support.

Accessibility fixes must preserve assessment validity and be documented when an accommodation changes delivery conditions.

### 15A.10 UX acceptance rule

No IELTS diagnostic feature is complete merely because it works technically.

Before acceptance, ask:
- Can a student understand the next step without help?
- Can a teacher interpret the result without training in our internal terminology?
- Does the interface hide irrelevant complexity?
- Does it look and feel like the same Brains Heist product as the surrounding flow?
- Are icons/SVGs purposeful, coherent, and accessible?
- Does the screen feel appropriate in a real school?
- Is the visual creativity helping comprehension rather than showing off?
- Would we be comfortable projecting this screen in front of students, teachers, parents, or a school head?

If the answer to any of these is no, the feature is not finished.

---

## 15B. Student journey and teacher monitoring

### 15B.1 One understandable learning path

The required journey is **starting point → understandable feedback → one next action → purposeful practice → fresh evidence → reviewed learning trail**.

The default student dashboard centres on:
- **Continue your work:** resume the existing authorized attempt, draft or upload with honest local-pending/server-saved status.
- **Your next step:** one prioritized, teacher-confirmed learning action, or the missing assessment/review needed before choosing one.
- **Teacher feedback:** clearly attributed teacher-confirmed comments and an actionable explanation.
- **Your learning trail:** original work, practice participation, independent checks and dated feedback, with detail available on demand.

Choose the primary action from the student's actual state: recover pending work, continue an active task, view newly shared feedback, complete an agreed practice step, gather missing evidence or await review. Do not start duplicate attempts, silently overwrite work or automatically play assessment audio.

Keep broad skill coverage visible without equating “completed four checks” with a full baseline or an IELTS band. For independent students, show only supported review/practice routes; never invent an allocated school teacher. Respect entitlement and reviewed-content availability.

### 15B.2 Feedback that students can act on

Use simple language: **what went well → what to work on → how to practise → how we will check again**. Link each statement to qualified source evidence and the reviewed subskill/focus behind it.

Examples:
- “We need another task before judging this area.”
- “Your examples were unclear in this essay. Practise explaining how each example supports your opinion.”
- “Your new essay explains examples more clearly. Let's check this in another essay.”
- “This difficulty has appeared in several independent tasks, including after practice. Your teacher will help choose a different next step.”

Match wording to the actual state and confidence. Do not call a person weak, promise a band increase, display unsupported “mastered/resolved” badges, or replace teacher feedback with an unconfirmed AI draft. Clearly label teacher input through text and visual hierarchy; colour alone is insufficient. Technical taxonomy/policy detail stays in the expandable evidence view.

### 15B.3 Teacher monitoring and next-step selection

For each authorized student, the teacher view must show:
- skill/subskill/focus, observation/pattern and change trajectory separately;
- qualifying evidence count, source diversity/coverage, dates, confidence and missing evidence;
- original source links, reasons for inclusion/exclusion and contradictory evidence;
- current agreed target, assigned practice and participation status;
- reassessment/follow-up status, reference comparison and policy-based change explanation;
- pending review, stale evidence, disagreement and the next decision needed.

Rank next actions by evidence quality, relevance to the student's goal, teacher priority and available reviewed resources. “Lowest score” or “tested skill” alone cannot determine the next weakness. Avoid overwhelming students with all flagged subskills at once.

School summaries must use only authorized qualified projections, retain confidence/coverage and distinguish unavailable evidence from difficulty. A school administrator allocates the programme lead; that allocation does not authorize a teacher to bypass evidence or sharing gates.

### 15B.4 Acceptance and current limitations

The teacher must be able to answer **why this conclusion, what evidence, what practice, what changed and what next**. The student must understand the next action without learning internal terminology. Test missing-evidence, waiting-for-review, interruption, no-resource and mixed-evidence paths as carefully as a completed journey.

Apply section 15A's accessible, coherent Brains Heist design and section 13's scoped-read/background-work requirements. A timeline, attractive progress bar, task completion or stored teacher feedback does not by itself implement longitudinal inference.

Current short screeners and reviewed single submissions remain starting-point evidence. Until the policies, comparable reassessment, implementation and validation in section 8A pass, persistence/sustained-improvement/resolution features must remain unavailable rather than simulated.

---

## 16. Current known legacy issues

The following current/legacy behaviours are **not** canonical and must not be preserved merely because they already exist.

### 16.1 `src/pages/ielts/TrialListeningTask2.tsx`

Known limitations:
- only 10 Listening items;
- one form-completion/travel context;
- percentage-to-band ladder;
- answer keys embedded in the client;
- authoritative scoring performed in the client;
- narrow skill inference;
- some accepted answers are more permissive than task wording;
- result presentation can look more precise than the evidence supports;
- retake is effectively blocked after completion;
- browser/audio interruption requires stronger real-device validation.

This component may be retained as a **practice/screener shell**, but it must not remain the authoritative full diagnostic without redesign.

### 16.2 `services/ieltsFunnelAnalytics.ts`

The funnel layer is a marketing/UX analytics layer.

Its `estimated_band` metadata must not be treated as authoritative academic assessment evidence.

Pending localStorage results are UX recovery data only.

### 16.3 `services/ieltsDashboardService.ts`

Current logic sets:

`weakestSkill = diagnosticCompleted ? 'listening' : null`

This is not valid diagnostic reasoning.

“Tested skill” must never automatically mean “weakest skill.”

### 16.4 School vs independent classification

Any hardcoded `userType = 'independent'` inside diagnostic flows must not override real school membership.

School pilot analytics and evidence must preserve correct school context.

### 16.5 Legacy prompt templates

`docs/IELTS_PROMPT_TEMPLATES.md` currently contains legacy wording such as:
- “You are an official IELTS examiner.”
- heuristic percentage-to-band conversion guidance.

Where these conflict with this Bible, they are legacy and must be revised before being used for trusted diagnostic scoring.

### 16.6 Legacy readiness conversion

Any generic helper that maps arbitrary percentage scores to readiness bands must be reviewed before diagnostic use.

A convenience readiness estimate in practice data is not automatically a validated diagnostic band model.

### 16.7 Marketing copy

Copy such as:

> “What’s Your Real IELTS Band Score?”

must not be used for the current short diagnostic.

Use a narrower promise until the comprehensive validated baseline exists.

### 16.8 Content provenance

The current travel-to-France Listening sample appears widely available online.

Its redistribution/audio rights must be verified. If provenance cannot be documented, replace it with original or licensed Brains Heist content before school diagnostic deployment.

---

## 17. Required target architecture for Brains Heist IELTS Diagnostic v1

The target system must contain two clearly separated experiences.

### 17.1 Quick Screener

Purpose:
- low-friction initial signal;
- class grouping support;
- identify what should be assessed next;
- student onboarding.

Required:
- server-trusted objective scoring;
- item-level evidence;
- taxonomy;
- confidence;
- no false overall band;
- explicit “screener” wording.

### 17.2 Full Baseline Diagnostic

Purpose:
- establish a defensible starting readiness profile for school intervention.

Required:
- Listening evidence with broad construct/task coverage;
- Reading evidence with broad construct/task coverage;
- Writing evidence adequate for the claim being made;
- Speaking evidence adequate for the claim being made;
- teacher/human moderation where required during pilot validation;
- confidence per skill;
- overall readiness only when all four skills qualify;
- original/licensed content;
- secure server scoring;
- immutable attempts;
- versioned scoring;
- versioned taxonomy;
- teacher-facing evidence trace;
- reassessment-compatible alternate forms.

The full baseline may be delivered across more than one school session. It does not need to imitate one uninterrupted official test sitting in order to be useful, but any claim must match the delivery design.

---

## 18. Validation and calibration

“Looks reasonable” is not calibration.

Before numerical readiness bands are treated as trusted school evidence, Brains Heist must conduct a documented validation study.

At minimum:
- compare Brains Heist estimates with a credible benchmark;
- include students across the ability range expected in the target schools;
- preserve blinded teacher/expert ratings where applicable;
- record agreement and disagreement;
- measure overprediction and underprediction;
- measure error within ±0.5 and ±1.0 band where band estimation is used;
- inspect construct-level error;
- inspect subgroup/device/delivery effects;
- document sample limitations.

A small early pilot is useful for finding bugs and obvious scoring problems but is **not by itself proof of psychometric validity**.

Calibration data, model version, and scoring-policy version must be traceable.

---

## 19. Silk Road / school pilot launch gate

No Grade 9–10 school baseline should be called “ready” until every required gate below is green or explicitly waived by the product/academic owner with documented risk.

### Academic/content
- [ ] Diagnostic mode and claim scope are clearly defined.
- [ ] Content is original or licensed with provenance.
- [ ] All published items are human reviewed.
- [ ] Answer keys are reviewed.
- [ ] Taxonomy mappings are reviewed.
- [ ] Full-baseline construct coverage is documented.
- [ ] Writing/Speaking rating policy is documented.
- [ ] Reassessment form strategy exists.

### Scoring/integrity
- [ ] Objective scoring is server-trusted.
- [ ] Answer keys are not exposed before submission.
- [ ] Client/localStorage values cannot become academic truth.
- [ ] Scoring is versioned.
- [ ] Duplicate submission is idempotent.
- [ ] Item responses are preserved.
- [ ] Unanswered is distinct from incorrect.
- [ ] Confidence is calculated separately from attainment.
- [ ] Overall result is impossible when required skills are missing.

### Security
- [ ] Student access is self-only where required.
- [ ] Teacher access is correctly scoped.
- [ ] School admin access is school-scoped.
- [ ] Cross-school attempts fail closed.
- [ ] RLS/RPC behavior is tested with real staging data.
- [ ] No service secret is exposed to the browser.

### UX/reliability
- [ ] Student-facing language is clear, age-appropriate, and school-appropriate.
- [ ] Teacher/admin language is professional, actionable, and free of developer jargon.
- [ ] Raw technical errors are replaced by safe, useful user-facing messages.
- [ ] Progressive disclosure keeps advanced evidence available without making the default view feel complicated.
- [ ] Typography, spacing, cards, controls, status treatments, and result surfaces follow one coherent Brains Heist visual system.
- [ ] SVGs/icons use a consistent visual language and are purposeful/accessibility-safe.
- [ ] No important state relies on colour alone.
- [ ] Motion is purposeful, assessment-safe, and respects reduced-motion preferences.
- [ ] Core flows remain visually coherent at mobile, tablet, laptop, and desktop sizes.
- [ ] Mobile browser pass.
- [ ] Desktop browser pass.
- [ ] Audio interruption pass.
- [ ] Network interruption/resume pass.
- [ ] Refresh/resume pass.
- [ ] Session-expiry pass.
- [ ] Double-submit pass.
- [ ] Simultaneous-class submission pass.
- [ ] Intended active-concurrency limit and environment are documented; IELTS-specific staged tests under section 13 pass for the claimed launch scope.
- [ ] Connection/lock pressure, Auth/Data API errors, audio/uploads and background scoring queue behavior meet the budgets declared before testing.
- [ ] Exact tested versions, failed/interrupted stages, capacity limitations, monitoring and stop/recovery plan are recorded.
- [ ] Error states do not lose completed work.

### Reporting
- [ ] Student copy says “estimated readiness,” not official result.
- [ ] Teacher report shows confidence.
- [ ] Teacher report shows missing evidence.
- [ ] School/independent context is correct.
- [ ] “Tested skill” cannot be auto-labelled weakest.
- [ ] One missed item cannot create a persistent weakness.
- [ ] Recommendations cite the evidence that caused them.
- [ ] Longitudinal labels satisfy section 8A's approved policy, independence, comparability, confidence and teacher-review gates; unavailable policies fail closed.
- [ ] The section 15B journey separates practice participation from independent improvement and supports missing, mixed, stale and pending evidence states.

### Validation
- [ ] Benchmark/calibration protocol approved.
- [ ] Pilot comparison data collected.
- [ ] Material over/underprediction investigated.
- [ ] Product limitations documented.
- [ ] School pilot owner signs off on the version being used.

**“100% ready” means every launch gate is passed for the agreed scope and no known critical risk is being hidden. It does not mean any assessment is literally 100% error-free.**

---

## 20. Implementation order

Agents must not skip foundational phases just to make the UI appear complete.

### Phase 0 — Governance
- create/maintain this Bible;
- wire mandatory agent instructions;
- mark conflicting legacy docs/code as legacy.

### Phase 1 — Stop overclaiming
- correct public/student copy;
- separate screener from baseline;
- remove unsupported “real band” language;
- prevent tested skill from becoming weakest skill automatically;
- preserve correct school context.

### Phase 2 — Canonical evidence model
- versioned forms;
- immutable attempts;
- item responses;
- provenance;
- taxonomy snapshots;
- scoring-run provenance;
- result projection.

### Phase 3 — Trusted scoring
- server-side objective marking;
- no pre-submit answer-key exposure;
- scoring policy versioning;
- idempotency;
- integrity states.

### Phase 4 — Original/reviewed diagnostic content
- Listening bank/forms;
- Reading bank/forms;
- Writing tasks;
- Speaking tasks;
- audio;
- editorial review;
- taxonomy review;
- alternate forms.

### Phase 5 — Productive-skill review
- safe AI-assisted evaluation;
- no “official examiner” prompt;
- teacher moderation;
- disagreement tracking;
- pronunciation from audio;
- prompt/model provenance.

### Phase 6 — Results intelligence
- construct profile;
- development-area logic;
- confidence;
- recommendations;
- school teacher view;
- integration with Brains Heist academic evidence rules;
- section 8A observation/policy/teacher-view gates and section 15B's evidence-linked next actions.

### Phase 7 — Reassessment
- alternate forms;
- exposure controls;
- comparable scoring;
- improvement logic;
- section 8A comparable independent checks, approved change thresholds, sustained follow-ups and audited transitions.

### Phase 8 — Staging and calibration
- real Supabase/RLS testing;
- browser/audio testing;
- IELTS-specific staged concurrency, sustained-load and recovery tests under section 13;
- benchmark comparisons;
- teacher-vs-system comparison;
- scoring adjustment.

### Phase 9 — School launch
- launch-gate review;
- freeze diagnostic version for the pilot;
- monitor incidents;
- do not silently change scoring mid-pilot.

---

## 21. AI/agent change protocol

Before an AI agent changes anything within IELTS diagnostic scope, it must:

1. Read `AGENTS.md`.
2. Read this entire Bible.
3. Inspect the current target-branch implementation.
4. Identify which Bible rules the requested change touches.
5. Prefer a minimal, additive change.
6. Preserve evidence/history.
7. Never copy a stale file over current code.
8. Never silently weaken a launch gate.
9. Never silently modify scoring claims.
10. Never edit this Bible merely to make an implementation easier to pass.
11. If the task legitimately changes the contract, update this Bible **explicitly**, state the rationale, cite the authoritative basis, and bump its version.
12. Run the relevant tests/guards or report exactly what could not be run.
13. State remaining risks honestly.
14. For concurrency-sensitive edits, apply sections 13.1–13.3 and report which capacity evidence remains valid or must be rerun.
15. For learning-pattern, intervention or journey edits, apply sections 8A and 15B; identify the approved policy/crosswalk, evidence eligibility, teacher-review gates and unavailable claims. Never infer implementation from this contract alone.

For diagnostic-affecting pull requests, include:
- Bible version used;
- assessment/scoring impact;
- data migration impact;
- backward-compatibility impact;
- validation performed;
- remaining limitations.

---

## 22. Change-control rules for this Bible

This file is intentionally harder to change than ordinary implementation docs.

A Bible change must:
- be deliberate;
- explain why the old rule is insufficient;
- preserve or improve assessment validity, security, traceability, and honesty;
- cite current authoritative IELTS/public assessment sources when the change affects format/scoring/criteria;
- bump the version;
- update the effective date;
- identify which implementation components must be reviewed because of the change.

Do not make opportunistic Bible edits in the same spirit as a quick bug fix.


### 22.1 Revision record — v1.2.0 (2026-10-06)

Owner-requested audio production requirements follow direct review of Screener A: the first generated track spoke reading instructions without sufficient silence and used indistinguishable instruction/passage delivery. Section 6.1 makes measured pauses, clear voice separation, artifact provenance and scoped review mandatory. This strengthens the existing content and delivery gates; no scoring, band, official IELTS format or review requirement is weakened. The 30/15-second design is an internal screener decision, not a claim about official test timing.

Affected implementation: Listening audio generation/assembly, asset hosting and version records, Exam Mode playback, content publication review, attempt delivery metadata, and audio/browser regression checks. Existing published forms must be assessed against these requirements without rewriting historical evidence. External scoring references below remain unchanged from v1.1.0.

---

### 22.2 Revision record — v1.3.0 (2026-10-08)

Owner-requested concurrency governance follows the assignment incident investigation and the explicit requirement to consider large simultaneous IELTS cohorts during every future edit. General interruption and simultaneous-submission checks were insufficient to define active concurrency, protect shared resources, or justify capacity claims. Sections 13.1–13.3 add architecture requirements, a 500-student acceptance target, separate IELTS 30 → 100 → 500 tests, recorded performance/correctness gates and capacity-evidence invalidation. Section 19, Phase 8 and the agent change protocol now reference these obligations.

Basis: the owner's requirement and internal engineering acceptance policy. Numeric load/latency targets are Brains Heist targets, not externally validated capacity or official IELTS timing/scoring rules. Existing local assignment tests do not establish IELTS or production capacity. No assessment format, scoring, taxonomy, confidence or human-review gate changes.

Affected implementation to review: IELTS discovery/form RPCs and reads, attempt/answer/finalization transactions and indexes, Auth/session recovery, Exam Mode rendering/subscriptions, Listening storage/playback/cache, Writing draft/submission and Speaking uploads, evaluation/transcription workers, background scheduling, teacher/school reports, monitoring and release/load-test tooling. Existing academic history must remain intact. This revision defines required future work; it does not assert that the current implementation passes it.

---

### 22.3 Revision record — v1.4.0 (2026-10-08)

Owner-requested precision follows the agreed student journey and the question of how strengths, recurring/persistent difficulties and improvement will be monitored. Section 8's terminology alone did not define source independence, comparable evidence, policy parameters, teacher authority or a delivery plan. Section 8A now defines the observation ledger, qualification/comparability, approved decision thresholds, separate pattern/change states, intervention/follow-up loop, rebuildable history and staged acceptance. Section 15B defines the matching student/teacher journey. Section 19, Phases 6–7 and the agent protocol reference these gates.

Basis: the owner's explicit instruction and Brains Heist's existing evidence, confidence, reassessment and Academic Skill Registry governance. This is an internal learning-evidence/product contract, not an official IELTS classification or a validated numerical threshold. Numeric parameters require documented academic approval and validation before enabling advanced conclusions; this revision supplies no fabricated universal cutoffs.

No IELTS format, band conversion, external rating criteria, existing scoring or published content changes. Section 13's v1.3.0 concurrency architecture and capacity requirements remain intact. No data migration or runtime feature is activated by this documentation change, and historical assessment evidence must remain intact.

Affected implementation to review: `services/ieltsJourneyService.ts`, `src/pages/ielts/IeltsJourneyDashboard.tsx`, student next-action cards, school programme/student evidence views, governed objective evidence/scoring projections, Writing/Speaking review services and AI drafts, canonical Academic Profile/registry crosswalks and confidence policies, intervention/alternate-form governance, projection workers/caches, school-scoped RPCs and regression/pilot/load-test tooling. These rules describe required future implementation and validation; they do not certify existing longitudinal tracking or 500-user capacity.

---

## 23. Canonical public sources

Before changing scoring/format/criteria, re-check the latest official material.

Current reference set reviewed for Bible v1.1.0:

- IELTS — **IELTS scoring in detail: band scores explained**  
  https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail

- IELTS — **IELTS Academic: Listening test format**  
  https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening

- IELTS — **IELTS Academic: Writing test format**  
  https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing

- IELTS — **IELTS Academic: Speaking test format**  
  https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking

- IELTS — **IELTS Writing Band Descriptors**  
  https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf

- IELTS — **IELTS Speaking Band Descriptors**  
  https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf

The public sources above define the external reference point. Brains Heist still needs its own validation for any original short form or internally authored diagnostic.

---

## 24. The core principle

When there is pressure to choose between:

- a more impressive score card, or a more defensible conclusion;
- a faster release, or traceable evidence;
- a confident claim, or honest uncertainty;
- a convenient client-side shortcut, or trusted server scoring;

choose the defensible, traceable, honest assessment.

**Brains Heist should earn trust by showing teachers what the evidence supports — and refusing to pretend it knows more than the evidence can prove.**
