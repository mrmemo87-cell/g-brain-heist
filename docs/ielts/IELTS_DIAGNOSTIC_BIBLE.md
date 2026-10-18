# Brains Heist IELTS Diagnostic Bible

**Status:** LOCKED CANONICAL CONTRACT  
**Version:** 2.0.0\
**Effective date:** 2026-10-19\
**Scope:** Every Brains Heist IELTS diagnostic, screener, baseline assessment, band estimate, readiness estimate, result interpretation, weakness/strength conclusion, recommendation, school report, scoring service, AI evaluation prompt, question bank, audio asset, attempt table, RPC, migration, analytics event, and related UI.  
**Audience:** Human developers, Codex/ChatGPT/Claude/other AI agents, content authors, reviewers, school pilot operators, and future maintainers.

> **Mandatory rule:** Read this file before changing any IELTS diagnostic-related code, content, schema, scoring, prompts, copy, analytics, reporting, or school pilot behaviour.

> **Visual & UX companion:** All IELTS interfaces must follow [IELTS_VISUAL_UX_BIBLE.md](./IELTS_VISUAL_UX_BIBLE.md) for appearance, layout, navigation, responsiveness, accessibility, and interaction presentation, with [IELTS_DESIGN_SYSTEM_THEMELY.md](./IELTS_DESIGN_SYSTEM_THEMELY.md) as its technical token reference. **If a visual/UX requirement conflicts with academic validity, evidence, scoring, access, privacy, security, or review authority, this Diagnostic Bible always takes precedence.** Do not weaken a safeguard to satisfy a design preference.

This file exists to stop Brains Heist from drifting into invalid assessment claims while the product evolves. If current code, old documentation, old prompts, or a previous implementation conflicts with this Bible, **this Bible wins** unless the Bible itself is explicitly revised through a reviewed change.

> **Version 2.0 direction (owner decision, 2026-10-19):** Brains Heist optimises for the best student results, not for the most cautious possible product. Honesty about evidence and uncertainty remains absolute; withholding useful, clearly labelled information does not. Where earlier rules blocked a useful feature until a perfect policy existed, version 2.0 replaces them with **provisional, labelled, versioned policies that improve with data** (sections 0, 8A.4, 9.5, 10.5, 12A, 15E.2A and 18A).

---

## 0. What Brains Heist is for, and what makes it different

**North star:** every minute of a student's practice is aimed at a diagnosed, evidenced weakness; the teacher can see that weakness closing; and the programme's results are checked against real IELTS outcomes.

Most IELTS products do one of three things: a content library or video course that is the same for everyone; an AI scorer that returns one confident band with little explanation; or generic official practice material. Brains Heist must do the whole loop, inside real schools, with the teacher in charge:

**diagnose (screeners, mocks) → confirm targets per student → personalised targeted practice per batch → fast feedback → fresh independent check → updated learning record → report and next step**

The six commitments that define the product, and that every IELTS change must strengthen rather than weaken:

1. **Construct-level diagnosis.** Weaknesses are named, teachable subskills (section 7), never vague topics or a single band.
2. **Personalised practice at batch scale.** A teacher assigns once; each student receives material matched to their own qualified target (section 15F). Practice material must be mapped to the same taxonomy as the evidence that diagnosed the need (section 7.5).
3. **Closed loop.** Practice is followed by a fresh independent check, and the result updates the learning record automatically under a versioned policy (sections 8A, 12A). Lessons, extension lessons and mocks all feed this loop; nothing important stays paper-only without a capture route.
4. **Fast, high-volume feedback on Writing and Speaking.** AI gives first-pass criterion feedback on practice within minutes; teachers confirm what becomes evidence (section 10.5).
5. **Honest numbers students actually want.** Indicative band ranges with stated uncertainty on full-length evidence, never a falsely precise band (section 9.5), calibrated over time against real official results (section 18A).
6. **Built for our learners.** Taxonomy and practice cover the predictable error patterns of the programme's learners' first languages (section 7.6).

Every feature proposal should answer: *which step of the loop does this make faster, more accurate or more trustworthy?* A feature that answers none of them is lower priority.

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
- platform-calculated provisional readiness range **only when a validated calibration model exists**;
- separately attributed provisional teacher readiness estimate only under sections 1.4 and 9.4;
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

### 1.4 Provisional teacher readiness estimate

**Owner-authorized policy (2026-10-08):** After completion of all four screeners, an authorized IELTS teacher may publish a **Provisional teacher readiness estimate** as a low-confidence range on the IELTS band scale, subject to section 9.4. This is an attributed professional judgment for preparation planning, not a calibrated screener output, a full-baseline result, or an official IELTS result.

Teacher review of Writing and Speaking is useful evidence for that judgment. It does not validate the short-form band conversion or establish the predictive accuracy of the screeners. Completion of four screeners alone never triggers an estimate.

This narrowly scoped route is an explicit exception to the calibrated short-form output restriction in sections 1.1 and 9.3. It does not exempt automated estimates or trusted full-baseline claims from section 18.

### 1.5 Indicative band range

**Owner-authorized policy (2026-10-19):** A platform-calculated **Indicative band range** may be shown for full-length Listening or Academic Reading evidence (40 questions, complete parts) and for Writing/Speaking criterion ratings under the rules in section 9.5. It is a planning aid derived from IELTS's published average marks and teacher-confirmed criterion judgments, not a calibrated prediction and not an official result. It is always a range, always carries its confidence and the label **Not an official IELTS result**, and becomes a calibrated estimate only after section 18A's outcome data supports it.

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

### 2.1A Delivery mode

IELTS announced on 5 March 2026 that all IELTS tests will be delivered on computer from mid-2026, with timelines varying by market and an optional "Writing on Paper" in selected markets (section 23). Brains Heist therefore treats **computer delivery as the default** for mocks, independent checks and timed practice, so students rehearse the real interface. Paper remains a supported classroom fallback; paper results enter the learning record only through the governed capture route in section 12A.

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

### 6.1.1 Natural recording conditions and spoken copyright

**Owner-requested production policy, 2026-10-09:** Make original practice conversations natural without making successful listening depend on overcoming poor sound. British Council test-day advice asks candidates to check that recordings are clearly audible. The official Listening format supplies everyday social and education/training contexts; these sources do **not** establish distorted phone lines, whispers or added noise as required or endorsed IELTS test features.

- **Clear speech is the default.** No clipping, static, dropouts, masking noise, exaggerated accents or inaudible answer-bearing words. Do not score a learner's ability to overcome an artificial hearing or device obstacle as IELTS readiness.
- **Restrained realism is limited to declared guided/supplementary practice.** A gentle tonal phone effect or naturally softer, fully voiced conversation may be used after review of the exact file. All speech must remain intelligible at a comfortable playback level. Preserve a clear master for any processed track. Do not use true whispering or lower the answer words' volume. These are internal practice adaptations, not claimed official test conditions.
- **Background ambience is optional, never a difficulty mechanism.** Prefer clean dialogue. Any ambience must pass a speech-clarity review on the supported phone and desktop devices; establishing/transition sound outside assessed speech is preferable. If it compromises clarity, remove it. Effects are not a substitute for linguistic challenge, natural corrections, paraphrase or distractors.
- **Spoken rights introduction for newly created Brains Heist tracks:** “This recording is copyright Brains Heist LLC. All rights reserved.” Use the distinct instruction voice before the instructions and before the measured reading interval. Never insert a watermark into the assessed dialogue or subtract it from reading/response time. Record the notice in file metadata too. The notice does not itself establish provider licensing, prevent copying or imply IELTS endorsement.
- **Traceable conditions and review:** Preserve exact clean/delivered hashes, provider/voices/settings, processing parameters, measured encoded-file pauses and source-script linkage. Record sound/transcript fidelity, keys, mapping, difficulty, licensing and device acceptance as separate review scopes. Successful generation or technical level measurements do not equal human approval.
- **Evidence boundaries:** Record the delivery condition with the task version and attempt snapshot. A practice score from a treated recording cannot automatically become comparable independent evidence, a band, improvement or a persistent weakness. Any future assessment use requires the separate comparability, accessibility and validation gates.
- **Keep existing approved assets immutable.** Apply this notice and realism policy prospectively. A retrofit creates a new audio version and requires review; never overwrite an approved recording or its historical evidence.

Official basis rechecked 2026-10-09: IELTS Academic Listening format and British Council test-day advice in section 23. The proposed 30-second reading and 15-second response pauses for extension tasks L3/L4 are internal guided-practice timings, not official IELTS timing rules.

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

**Practice materials use the same taxonomy (v2.0).** Every targeted-practice item, extension-lesson task, mock item and fresh check must carry a reviewed mapping to the same versioned taxonomy IDs used by diagnostic evidence. This is what lets the system match a student's qualified target to the practice that trains it.
- Item-level mapping is required for objective items; task-level criterion and micro-skill mapping is required for Writing and Speaking tasks.
- Unmapped material may still be chosen manually by a teacher, but it is never offered by automatic target-to-practice matching and cannot produce evidence for a specific construct.
- AI may propose mappings in bulk. A named human reviewer approves them, either item by item or as a recorded batch review under section 15E.2A; AI never records the approval.
- Each construct used for targeting should have at least three reviewed, mutually independent practice materials and at least one unexposed fresh check per skill level before it is promoted in the teacher's matching view. Thin coverage is shown to teachers as **practice bank gap**, never filled with an unrelated task.

### 7.6 Learner-language error tags

**Owner-authorized (2026-10-19).** The taxonomy may include reviewed teaching tags for predictable first-language influence among the programme's learners (initially Russian, Kyrgyz, Uzbek and Kazakh speakers), for example article use, tense and aspect choice, prepositions, word order, and specific sound contrasts in Speaking.
- They are teaching tags under the existing Writing/Speaking micro-skills, not a separate ability scale, and follow the same evidence and mapping rules.
- A first language is used only when the student or school has recorded it. It is never inferred from a name, nationality or school, and a tag is never applied to a learner because of their first language alone; it needs that learner's own evidence.
- Pronunciation tags require audio (section 10.3).
- Tag lists are versioned and reviewed by an experienced teacher of these learners before use.

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

### 8A.4 Governed thresholds: a provisional default policy, refined by data

**Changed in v2.0 (owner decision, 2026-10-19).** Waiting for a perfect, validated threshold for every construct meant teachers saw no pattern or change labels at all. Version 2.0 enables the whole state model now under one owner-approved default policy, **bh-learning-policy-v1 (provisional)**, defined in section 8A.4A. It applies to every construct unless a construct-specific policy replaces it. Teachers always see that the policy is provisional.

Every policy, the default included, is versioned and registered, and must specify:
- minimum qualifying opportunities and independent source instances;
- task/context coverage, observation window, time separation, freshness and expiry/review rules;
- outcome/rubric thresholds for difficulty and strength, with a minimum confidence requirement;
- a defensible minimum change and treatment of measurement uncertainty for improvement;
- fresh follow-up requirements for sustained improvement and resolution;
- intervention opportunity and post-intervention evidence requirements for persistent difficulty;
- handling of mixed, contradictory, missing, assisted and integrity-flagged evidence;
- required teacher confirmation, reviewer disagreement and correction/supersession rules;
- validation basis, limitations, approver and effective version/date.

Repeated means evidence from more than one independent source instance; several questions in one sitting are not longitudinal repetition.

If the qualifying evidence is unavailable, keep the observation provisional or show **not enough evidence**. No agent, AI prompt or UI helper may invent a threshold outside a registered policy to make a status appear. Confidence remains separate from attainment, and current uncalibrated screeners retain their existing low-confidence limits.

### 8A.4A Default policy bh-learning-policy-v1 (provisional)

Approved by the owner on 2026-10-19 as a provisional teaching policy. These are reasoned starting values, not validated statistical cutoffs. Review is due after the first full cohort, and no later than 2027-03-01, using the outcome data in section 18A.

**Definitions**
- An *opportunity* is one scored item mapped to the construct, or one teacher-confirmed criterion/micro-skill observation on a Writing or Speaking task.
- A *source* is one independent task instance (section 8A.2): one form, one essay or one Speaking session. A whole sitting counts as one source.
- *Accuracy* is correct opportunities ÷ opportunities in qualifying, non-assisted evidence.

**Objective skills (Listening, Reading)**

| State | Default rule |
|---|---|
| Possible difficulty / strength | ≥ 2 opportunities in one source with accuracy ≤ 50% (difficulty) or 100% (strength) |
| Repeated difficulty | ≥ 2 independent sources, ≥ 4 opportunities in total, pooled accuracy ≤ 50%, and no later independent source above 75% |
| Repeated strength | ≥ 2 independent sources, ≥ 4 opportunities in total, pooled accuracy ≥ 80% |
| Improvement observed | After a recorded reference at repeated or possible difficulty: a fresh independent comparable source with ≥ 3 opportunities and accuracy ≥ 70%, and at least 25 percentage points above the reference |
| Improvement sustained | A further fresh independent source ≥ 14 days after the first improved source, again ≥ 70% |
| Persistent difficulty | Repeated difficulty, at least one completed targeted-practice assignment for the construct, then a fresh post-practice source still ≤ 50%, with the evidence spanning ≥ 21 days and teacher confirmation |
| Resolved for the assessed scope | Improvement sustained, plus teacher confirmation |
| Evidence needs updating | The newest qualifying source is more than 90 days old |

**Productive skills (Writing, Speaking)**

| State | Default rule |
|---|---|
| Possible difficulty | One teacher-confirmed observation of the micro-skill as a problem |
| Repeated difficulty | Teacher-confirmed in ≥ 2 independent tasks of the same task type (for example, two Task 2 essays) |
| Improvement observed | A fresh, comparable task of the same type in which the teacher confirms the problem is no longer present, or the related criterion rating rises by ≥ 1.0 band |
| Improvement sustained | Confirmed again in a further fresh task ≥ 14 days later |
| Persistent difficulty / resolved / needs updating | As for objective skills, with teacher-confirmed observations in place of accuracy |

**Always applied**
- Assisted, guided, repeated or exposed work never counts toward improvement, strength or resolution (section 8A.3).
- Mixed evidence overrides a simple rule: if the newest two independent sources point in opposite directions, show **Mixed evidence / teacher review needed**.
- Teacher confirmation remains required for persistent and resolved. A teacher may also reject or downgrade any automatic label with a reason.
- Label text in teacher views ends with **(provisional policy v1)**. Student views use the plain wording in section 15B.2, without the policy name.

Agents may implement exactly these values. Changing them requires a new registered policy version with the owner's approval; it does not require a Bible revision unless the definitions above change.

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

1. **Inventory and governance:** audit current journey/Academic Profile sources and policies; approve taxonomy crosswalks and evidence qualification. Numeric parameters come from the registered default policy in section 8A.4A until a construct-specific policy replaces it.
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

A short screener may output a platform-calculated band range only if:
- it has been calibrated against an accepted external or internal benchmark;
- calibration method is documented;
- sample characteristics are documented;
- error/uncertainty is known;
- the UI shows confidence/range rather than false precision.

Until then, short forms report performance and constructs, not a definitive band. A separately stored and attributed provisional teacher judgment is permitted only under section 9.4; it is not a calibrated output of the short form.

### 9.5 Indicative band range policy bh-indicative-v1

**Owner-authorized (2026-10-19).** This policy implements section 1.5.

**Basis.** IELTS publishes the average number of marks out of 40 needed for bands 5 to 8. It states that the precise number "will vary slightly from test version to test version" (section 23, rechecked 2026-10-19):

| Band | Listening (/40) | Academic Reading (/40) |
|---|---:|---:|
| 5 | 16 | 15 |
| 6 | 23 | 23 |
| 7 | 30 | 30 |
| 8 | 35 | 35 |

**Eligibility (Listening and Reading)**
- A complete, original 40-question Academic form, such as mocks M1–M3 or a future computer-delivered form.
- Delivered under timed, unassisted, declared conditions, with every item scored on the server or captured item by item under section 12A.
- The form must be unexposed to that student.
- Practice sets, partial sections, guided lessons and screeners are not eligible. They continue to report raw scores and constructs.

**Calculation**
1. Find the highest published anchor at or below the raw score; that band is the *central value*.
2. If the raw score is at least halfway to the next anchor, add 0.5. For example:
   - Listening 27–29 → 6.5;
   - Listening 33–34 → 7.5.
3. Display **central value ± 0.5** as the range, for example 29/40 Listening → central 6.5 → **6.0–7.0**.
4. Below 16 (Listening) or 15 (Reading), display **Below 5.0**. From 38 upwards, display **8.0 or above**.
5. This mapping lives in a versioned scoring-policy record. It is never a generic percentage ladder (section 9.1), and it never applies to General Training.

**Writing and Speaking**
- An indicative range may be shown only from criterion ratings that a teacher has confirmed.
- Writing needs both Task 1 and Task 2, with Task 2 weighted double: (T1 + 2 × T2) ÷ 3, rounded to the nearest half band.
- Speaking needs Parts 1–3 and audio for Pronunciation.
- The range is ± 0.5 around the rounded criterion average.
- AI-only ratings may appear as a practice indication (section 10.5). They never produce an indicative band range.

**Overall**
- Only when all four skills have an eligible indicative range: the average of the four central values, using the official rounding rule in section 2.6, displayed ± 0.5.
- Label it **Indicative overall range**, never "overall band".

**Required presentation**
- Use the title **Indicative band range** and show **Not an official IELTS result**.
- Show **Confidence: low** until section 18A data supports a higher confidence for that form and skill.
- Show the form, the date and the raw score beside the range.
- Never show the central value alone, or larger than the range.

**Calibration.** When section 18A has collected at least 30 verified official results paired with a recent eligible form, re-estimate this mapping and the range width per skill. Publish the calibrated policy as bh-indicative-v2 with its measured error (within ±0.5 and ±1.0 band) and sample description. The range may narrow, and confidence may rise to medium, only when the measured error supports it.

---

### 9.4 Provisional teacher estimate: separate, evidence-linked route

This section permits the owner-requested provisional professional judgment under section 1.4. It defines required future implementation; it does not assert that this workflow is already deployed or that any named student has an approved range.

#### Eligibility and evidence review
- Require current IELTS entitlement, all four completed valid screeners, finalized teacher reviews for Writing and Speaking, and an authorized teacher competent in IELTS-style assessment who reviews the complete four-skill evidence.
- Existing finalized productive-skill reviews may be reused by exact source/review reference if current, relevant and sufficient. Do not reset, duplicate or silently upgrade them.
- Inspect actual writing and criterion-level judgments, speaking audio or documented live observation, objective item outcomes, task coverage, recency, delivery conditions and integrity. A completion flag, stored number or “teacher-reviewed” badge alone is insufficient.
- Identify Academic or General Training context and the limited scope of the writing tasks and speaking parts sampled. Missing Task 1/Task 2 or Speaking-part coverage must remain explicit and may require more evidence; one reviewed essay is not silently a complete Writing paper.
- A documented live teacher interview may support this provisional judgment when it records observed criteria, parts/coverage, reviewer and date. Transcript-only or AI text cannot supply pronunciation evidence. Do not fabricate an audio reference where no recording exists.
- Withhold a skill or overall range when evidence is insufficient, contradictory, stale, pending or materially compromised. Assign the specific missing check and explain why. Eligibility for IELTS does not guarantee eligibility for a numerical estimate.

#### Additional Listening and Reading evidence
- Teachers may assign original/licensed, editorially reviewed material from the new practice catalogue to gather missing evidence. Availability in the old catalogue is not approval.
- For estimation, designate a fresh task as an independent evidence check before delivery, with reviewed constructs/coverage, difficulty rationale, exact version, appropriate test type and declared delivery rules. Objective marking must be server-trusted and keys protected before submission.
- Retain known exposure, assistance and rehearsal metadata. Guided practice, repeated screener items, exposed keys and scaffolded corrections remain practice; they cannot fill an independent-evidence gap simply because their scores are higher.
- A small additional check may inform the teacher's scoped provisional judgment. It does not calibrate a raw-to-band mapping, prove improvement, or automatically qualify a full-baseline result.

#### Estimate, provenance and publication
- Record a teacher-entered lower and upper band-scale bound for each supported skill, a brief evidence-linked rationale, coverage limitations, supporting and contradictory source IDs, reviewer identity/date, test type, policy version and follow-up action.
- Use a range, not a single precise overall score. Bounds must be ordered and within the IELTS scale; a policy's permitted increments are input conventions, not proof of accuracy. Do not invent a fixed universal margin, claimed error rate or statistical confidence interval.
- Overall publication requires evidence-backed provisional judgments for all four skills and explicit teacher confirmation of the overall range and its rationale. Do not automatically average raw scores, partial skills or rubric snapshots. This is not the official four-band calculation in section 2.6.
- No generic percentage-to-band ladder, automatic AI publication or automatic conversion of existing saved screener results is authorized. AI may assist with evidence summaries; the named authorized teacher owns the estimate and sharing decision.
- Required visible title: **Provisional teacher readiness estimate**. Display **Confidence: low** and **Not an official IELTS result** alongside the range, reviewer/date and a concise limitation: **Based on short assessments and teacher judgment; not a calibrated prediction. Confirm with a fuller assessment.**
- Explain that this is a planning estimate, not a validated forecast or guaranteed exam outcome. Keep it separate from calibrated estimates in student views, school reports, exports and analytics. Do not use it as proof of mastery, intervention success, high-stakes selection or a validated school performance metric.
- Preserve finalized original reviews, responses and scoring runs. Store the estimate as a separate versioned teacher decision with append-only supersession history; invalidate/review it when supporting evidence is voided or superseded.
- Enforce existing student, teacher, programme and school boundaries for creation, reads, edits and sharing. Independent eligible students without an authorized reviewer see a supported review route or an unavailable state; never invent a teacher allocation.

#### Pilot and acceptance
Use Gulzada's existing account for the normal authorized pilot under AGENTS.md, without resets, role changes or invented review evidence. Verify all-four completion, finalized review reuse, missing-evidence assignment, withheld range, teacher sharing, student wording, corrections and cross-school denial before broader release. Applicable section 13 reliability/capacity gates remain mandatory; this policy certifies neither deployment nor 500-user capacity.

Continue collecting benchmark comparisons under section 18. Human review supports a professional judgment; it is not a substitute for calibration or independent validation of automated band predictions.

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

### 10.5 AI first-pass feedback on practice

**Owner-authorized (2026-10-19).** Writing and Speaking only improve through many attempts with fast feedback. Waiting for a teacher before any feedback limits a student to about one essay a week.

**What AI may do on practice tasks** (not screeners, mocks or independent checks)
- Return first-pass feedback to the student directly, within minutes.
- Comment on each of the four criteria, with two or three specific, quoted examples from the student's own text or transcript and one concrete revision action.
- Give an **AI practice indication**: a criterion range on the band scale, for example *Coherence and Cohesion: about 5.5–6.5*. Never a single number, and never an overall Writing or Speaking band.

**How it must be labelled**
- Every item carries the visible label **AI practice feedback: your teacher may adjust it**, with the model, prompt version and time recorded (section 10.2).

**Pronunciation**
- Pronunciation feedback needs audio analysis. A transcript-only system must say that pronunciation was not assessed.

**What remains teacher-only**
- AI feedback is not evidence. It never enters the learning record, reports or indicative band ranges until a teacher confirms or edits the observation; one click to confirm is enough.
- Teachers see AI and teacher ratings side by side. Disagreements are stored and reviewed monthly to improve the prompt (section 10.2).

**Revision is encouraged**
- A student may revise and resubmit the same task as many times as useful. Revisions stay labelled as guided practice (section 8A.3): they show effort and learning, but do not count as independent improvement.

**Volume target.** Design for three or four Writing tasks and three Speaking practice sessions per student per week without increasing teacher marking time. The teacher's job is to confirm, correct and prioritise, not to write first-pass comments.

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

## 12A. Mocks and fresh checks feed the learning record

**Owner-authorized (2026-10-19).** Full mocks (M1–M3 and successors), extension-lesson fresh checks and course fresh checks are reassessment evidence. They must not remain classroom-only records.

**Computer delivery (default)**
- Mocks and checks run in the platform under Exam Mode.
- Keys stay on the server, and objective items are marked automatically.
- Writing is captured as text.
- Speaking is recorded, or entered by the teacher as live criterion ratings.

**Paper capture (fallback)**
- Where devices are unavailable, the teacher enters each student's answers or marks item by item, using the platform's capture screen within 14 days of the sitting.
- Writing scripts may be photographed or transcribed, and are rated by the teacher.
- Captured evidence records the capture method, who entered it and when, and keeps the label **teacher-entered paper evidence**.
- It qualifies for section 8A in the same way as computer evidence, but is shown with one lower confidence step until a second, independent capture check is recorded.

**Rules for both**
- Item-level outcomes map to the taxonomy (section 7.5) and write qualified observations to the ledger.
- A mock that is complete and unexposed is eligible for an indicative band range (section 9.5).
- Exposure is recorded per student. A mock already used in class as guided practice, or whose key has been shown, is practice and not a fresh check for that student.
- Mocks remain separate from screeners (section 15F) and are never repurposed as screeners.

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
- provisional teacher readiness estimate under section 9.4, distinct from calibrated results;
- indicative band range under section 9.5, with its form, raw score and policy version;
- AI practice indication under section 10.5, which never appears in reports;
- student-reported or verified official IELTS results under section 18A;
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

Keep broad skill coverage visible without equating “completed four checks” with a full baseline or an IELTS band. A separately attributed low-confidence teacher range may be shared only after section 9.4 passes; completion alone must never generate it. For independent students, show only supported review/practice routes; never invent an allocated school teacher. Respect entitlement and reviewed-content availability.

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

Current short screeners and reviewed single submissions remain starting-point evidence. From v2.0, pattern and change states are enabled under the provisional default policy in section 8A.4A as soon as their qualifying evidence exists, labelled as provisional for teachers. They are computed from real qualified evidence, never simulated. A state whose evidence is missing shows what check is needed next.

### 15B.5 The weekly learning loop

The default teaching rhythm that the teacher workspace must make easy:

1. **After each teaching week**, the teacher opens the batch view, which shows each student's current qualified targets and a suggested practice set.
2. **One click assigns** batch targeted practice; each student receives material for their own target (section 15F).
3. **Students practise.** Objective items are marked instantly. Writing and Speaking get AI first-pass feedback (section 10.5).
4. **The teacher confirms** productive-skill observations in a short weekly review queue.
5. **The record updates.** Fresh checks and mocks update the record automatically (section 12A). The batch view highlights constructs shared by several students and suggests the matching extension lesson (Lessons Bible LB-10).

Each week the teacher view must answer, for the batch: *who needs what next, who is improving, who is stuck after practice, and where the practice bank has gaps.*

---

## 15C. Individual learning plans and reproducible IELTS reports

**Owner-authorized product contract (2026-10-09):** Extend the existing Brains Heist smart reporting system for individual IELTS learning plans and monthly progress reports. Reuse immutable snapshots, source references/hashes, versions, Draft → Final review and correction history. IELTS evidence must remain a distinct module; generic academic percentages, confidence scores and progress labels cannot be imported as IELTS conclusions without the reviewed crosswalk and qualification policies in section 8A.

### 15C.1 Learning plan

Store each plan as an append-only teacher decision, with student/school, author/date, previous version, policy version and source references. Include the student's study goal, two or three prioritised actionable goals where evidence permits, a next action, success criteria, follow-up method and review date. A plan can remain provisional when evidence is missing; do not force fabricated priorities. Each skill has its own pathway: Foundation + introductory IELTS, Focused IELTS preparation, or More evidence needed. Mixed profiles are valid. Pathways are revisable preparation decisions, never diagnoses, fixed ability labels, automatic band conversions or high-stakes selection criteria. Record a short evidence-linked rationale and the missing check before changing a pathway.

### 15C.2 Reporting period and historical truth

Support explicit monthly/course reporting dates as well as existing academic year/term reports. Display start/end dates and the exact evidence cutoff, reporting timezone and partial-period status. A current draft may cover a future course-period end but must clearly say interim; it must not imply that future lessons occurred. Capture only evidence, reviews and plans recorded by the cutoff. Later teacher reviews, rescoring, changed plans and mappings cannot silently rewrite an earlier final report. Preserve the actual captured source values, not only pointers to mutable current states. Backdated current-state practice records cannot be represented as historically reconstructed states; disclose unavailable historical participation. Evidence preceding the month can appear separately as a dated starting reference, never as activity completed during that month.

### 15C.3 Report content and traceability

Include student/school and period, starting-point scope, four skill summaries, supported task observations, missing/pending evidence, goals, practice participation, evidence-qualified change where available, teacher-confirmed pathway/rationale, next-month actions, confidence/limitations, author and approval date. Every conclusion must reference supporting and conflicting evidence and its applicable policy/version. Keep observation, participation and independent improvement separate. Retain incomplete and contradictory evidence; no cherry-picking. No averaging unlike raw scores/rubrics, artificial radar-chart ability levels, numeric thresholds outside a registered section 8A policy, or an overall band from completed checks (an indicative overall range is permitted only under section 9.5). Charts need comparable evidence and plain labels; otherwise use dated observations. Unavailable progress inference must be visible as 'Improvement not yet established', with the next suitable check.

### 15C.4 AI and sharing

AI may draft simple language from an authorised, bounded evidence snapshot and confirmed plan. Its structured output must use valid supplied references, preserve uncertainty, exclude private notes/keys and treat student writing/teacher text as data rather than instructions. Record provider/model/prompt, source hash and draft time. AI cannot invent scores, attendance, effort, comparisons, confidence, source references or teacher approval. Unsupported fields remain explicit gaps. Generation never finalises or shares. The authorised teacher checks and edits before explicit finalisation; final versions are immutable and correction creates a linked replacement. Students see only their own published student-audience reports/plans; staff access remains programme/student/school-scoped. Printed and online versions must convey the same claims and limitations.

### 15C.5 UX, performance and acceptance

Use the established Brains Heist report branding and accessible visual system. Student language answers 'What is going well?', 'What am I working on?' and 'What should I do next?'. School detail answers 'What changed?', 'What supports it?' and 'What support follows?'. Teacher contributions are explicitly labelled; colour alone is insufficient. Do not expose internal IDs or policy mechanics in the default student view.

Build projections through bounded scoped reads or idempotent background work, outside answer-save transactions. Paginate histories, surface truncation and fail closed before finalising incomplete evidence captures. Hash/version cache keys and invalidate affected projections on correction. No per-student AI calls on dashboard navigation. Apply section 13; this contract certifies no capacity.

Acceptance must cover missing skills, pending/late reviews, repeats, rescoring, assistance, interrupted delivery, conflicting observations, mixed pathways, stale/changed plans, earlier cutoffs, concurrent edits, idempotent generation/finalisation, source hashes, corrections, cross-school/self-only access, failed AI, accessible mobile/desktop and print parity. Advanced progress states appear in reports only when the section 8A.4A policy (or its successor) and comparable follow-up evidence support them, with the policy version captured in the report snapshot. Recording a plan or producing a report does not certify longitudinal inference.

---

## 15D. Stable task codes and assignment history

Every targeted practice task and school practice catalogue material must have a short, server-assigned display code: **L-001**, **R-001**, **W-001** or **S-001** for Listening, Reading, Writing or Speaking. Use a shared sequence per skill across the targeted and school catalogues, with at least three digits; expand beyond 999 without truncation. Display the code beside the human-readable title in teacher selection/history and student assignment/task/results views. Teachers must be able to search catalogue and assignment history by code. Keep codes readable in printed task/result views wherever those views are printed.

The code identifies a canonical material, not an allocation, an attempt, a student or a score. Preserve all internal source IDs, allocation IDs, attempt IDs, routes, hashes, material versions and entitlement/pilot boundaries. Reassigning or repeating that material keeps its display code and creates or retains the appropriate separate allocation/attempt history. Display the student's authoritative work and feedback status beside the task; a code or previous assignment does not prove completion, review, independence, improvement or readiness. Existing exact-identity exposure checks remain mandatory.

Assign codes atomically on the server. Never calculate them from a visible list index, accept a client-selected code, silently renumber existing materials, or reuse a retired code. Reserve codes for inactive materials too. An ordinary edit or in-place revision of the same canonical material retains its code with separate governed version/hash provenance. A new canonical material ID receives a new code; do not infer a common family by stripping ID suffixes or matching titles. Source content/version immutability and human publication approvals still apply: assigning a code confers no content approval or wider release permission.

Backfill current material codes without rewriting content, assessment evidence, allocations, submissions, feedback or scores. Preserve already-approved report snapshots exactly; codes may be captured prospectively in new report versions. Display codes are presentation metadata, not authorization credentials. Carry them in existing scoped, bounded reads; do not add per-card requests or expose a private global directory. Tests must verify uniqueness, immutable retention, automatic future allocation, scope/visibility, code search and separate statuses for repeated assignments. No capacity claim follows from these checks; affected wider-launch workloads still require section 13 evidence.

---

## 15E. Material originality and intentional variants

**Owner-authorized product contract (2026-10-10):** Creating a new IELTS material must involve a substantive new learning task, not merely a new title, code, scenario name or regenerated recording. Section 15D guarantees identity; this section governs content reuse. The implementation gate covers targeted practice and the four school practice catalogues. Diagnostic/screener forms retain their separate immutable form, exposure and human release gates; their authors must follow this originality policy too. Do not claim that the practice inventory automatically compares every diagnostic form or external material.

### 15E.1 Comparison before availability

Save new or changed catalogue material as an unavailable draft. Save the passage/prompt, questions, answer logic and listening transcript before review; multi-step saving must never publish half a task. Retain a created draft ID when a later save step fails so retry updates the same material. Compare task-bearing content against current, retired and retained earlier versions in the practice inventory, including across targeted/school catalogues within the same skill. Titles, display codes, taxonomy IDs and administrative metadata cannot make copied content new.

Maintain private, append-only normalized content fingerprints, separate exact source hashes and reviewer snapshots, with the comparison policy version. Cosmetic source edits can keep a duplicate fingerprint while still invalidating an exact-version approval. Normalize Unicode compatibility forms, case, spacing and punctuation for exact-copy checks. Include passage/prompt, question content/options/keys, relevant scaffolds and recording/script identity; compare question bundles independently of their display order. Block a complete exact copy under another identity, even as a draft. An incomplete draft is not an approved task and must not prevent a genuinely changed question bundle from being completed. Existing inventory is recorded as **Existing material**, not retrospectively certified as original or approved; preserve its existing availability and all separate release gates.

Flag shared passages/prompts, question bundles, recording references or script hashes and near wording. The initial **ielts-originality-v1** near-wording rule uses token-set Dice similarity of at least **0.72** as an internal editorial flag only. It is not a scientific novelty threshold, difficulty calibration, IELTS score, validated plagiarism detector or proof that an unflagged paraphrase is new. All new content requires a human content comparison, even when automatic checks flag nothing; from v2.0 that comparison may be a recorded batch review under section 15E.2A. AI may draft material and comparison notes but may never record human approval on a person's behalf.

### 15E.2 Human review and version binding

An authorised content administrator compares the actual task, related saved materials, question/answer logic and response demand. Record the reviewer, date, exact content hash, matching-inventory hash, policy, decision and a substantive explanation of differences. A genuinely new task changes the stimulus, evidence, answer reasoning or response demand meaningfully. Renaming people, changing decorative details, rearranging questions or paraphrasing the same answer logic is insufficient. Similar wording requires an explicit supported review; shared primary content/questions/script/recording cannot be approved as fresh.

A review approves only the captured content and comparison inventory. Changed content, questions or private transcript invalidates that approval. New related inventory also requires a refreshed comparison at the next publication or allocation; unrelated new material does not invalidate the review. A reviewed descendant linked to this exact parent version is intentional reuse and does not revoke the original’s approval; its student exposure still belongs to the same family. Completed unreviewed or differently linked matching drafts remain review challenges. Retained exploratory versions of a declared descendant stay in its same reuse family; they do not turn the earlier original into a derivative. Never re-label an earlier original as a variant of a later recorded version to manufacture a fresh claim. Server-side checks protect publication and new school/targeted allocations, including raw table/RPC bypass attempts. Existing student answer saves, submitted evidence and historical reports continue without rescoring or rewriting.

For Listening, keep transcripts and answer-bearing comparison snapshots private. New Listening material must include a reviewable private transcript, and the human reviewer must listen to the actual recording and compare its script and answers. A remote audio URL, even stripped of signed query parameters, is only a reuse hint: a new URL does not prove a new recording, and the same URL does not certify byte identity. Trusted installed audio/script checksums are additional signals; they do not replace human listening or the existing rights, editorial, mapping, device and release approvals.

### 15E.2A Batch review for AI-produced practice (v2.0)

**Owner-authorized (2026-10-19).** The closed loop needs hundreds of mapped practice tasks, and reviewing each one individually blocks that. AI-produced practice material may therefore be released through a recorded batch review.

1. **Automated gates on every item.** Each item passes, with zero errors:
   - the schema/source contract;
   - answer-key consistency, including the evidence sentence for each answer;
   - exact-copy blocking and the near-wording flag against the whole inventory;
   - mapping completeness (section 7.5);
   - word limits;
   - for Listening: an automatic speech-to-text comparison of the recording with its private transcript, and measured pauses (section 6.1).
2. **A human sample review, recorded with hashes.** A named content reviewer reviews:
   - every flagged item;
   - every Listening recording, by listening to at least the answer-bearing segments;
   - a random sample of at least 20% of the remaining items, and never fewer than 3 per batch.

   The reviewer records the batch hash, the sampled item IDs, the decisions and the reasons.
3. **The batch decision.**
   - If the sample has no substantive error, the batch is approved as a whole.
   - If any sampled item has a key, mapping or content error, the reviewer fixes it and reviews a further 20% sample. A second failure sends the whole batch to item-by-item review.
4. **Student and teacher reports.** Every practice task has a **Report a problem** control.
   - Two independent reports, or one teacher report, automatically hold the item from new assignments until it is reviewed.
   - Reports, holds and fixes are logged.

Batch approval covers practice materials only. Screeners, mocks, fresh checks designated as independent evidence and diagnostic forms keep item-by-item human review. The reviewer is always a named human; AI never records approval.

### 15E.3 Declared variants and exposure

Intentional reuse must be an explicit **variant**, linked to a matching parent's canonical identity and earlier recorded exact content version, with its practice purpose and substantive changes explained. Keep its own section 15D code. An exact complete copy has no override; reuse the existing material instead. Show **Variant of L-001 · repeat practice** (or the appropriate skill/code) in teacher selection and student task/assignment views. Keep the parent link and exposure family in the audit trail.

A variant is repeat/guided practice, never an unseen independent check or automatic proof of improvement. Before allocating an independent targeted check, consider prior allocations, school assignments and direct practice attempts involving its linked variant family, including transitive links across the practice catalogues. Reused material cannot become independent evidence simply because its code is different. Human source/exposure review and the separate section 8A qualification/comparability policies remain necessary; the originality gate does not certify learning progress or an IELTS band.

### 15E.4 Privacy, preservation and acceptance

Ordinary students/teachers cannot browse private comparison snapshots, transcripts, keys or a global protected task directory. Match previews and decisions use existing content-admin permissions; protected targeted content and matches require platform content-admin review. Check actual account roles and banned status on the server. Keep decisions and inventory append-only; retain historical content after retirement. Preserve existing codes, student work, feedback, scores and approved report versions exactly.

Acceptance covers disguised copies, shared sources, near wording, unflagged material requiring human review, incomplete/multi-step saves, changed/stale reviews, exact-copy override attempts, linked variants, family exposure, private transcripts/keys, role denial and retained history. Serialize creation/review/publication per skill on this cold path; do not add comparison scans to answer-save/scoring transactions. Apply section 13 before claiming wider-launch capacity. These checks reduce accidental reuse; neither automation nor a checked box can guarantee semantic uniqueness without competent human review.

---

## 15F. Screeners remain separate from later practice

**Owner-authorized policy (2026-10-15):** Screeners are initial assessments. They must never appear as selectable materials for later school, batch or targeted-practice assignments. The separate initial-assessment/late-joiner assessment route remains available under its existing release and entitlement rules; do not erase, revoke or repurpose historical attempts.

- Filter practice discovery and enforce the boundary again at allocation, including manual IDs, direct RPCs, new recipients and raw privileged application writes. A title change or new material ID cannot make a screener into a new practice task.
- Preserve private fingerprints of protected screener stimulus, substantive question prompts and recording references, including retained earlier versions. Register future screener publication on the content cold path. Exact source/stimulus/recording reuse must be blocked from new practice allocation. Fingerprints are private and are not semantic-originality or audio-byte equivalence guarantees; existing human originality/rights review remains necessary for paraphrases, transformed recordings and exposure families.
- Grandfathered catalogue availability is not evidence of current editorial, keys, rights or delivery approval. Hold unreviewed legacy material from new assignment without deleting its source, code, existing student work or approved reports. Releasing a held source requires a separate documented, exact-version human review; do not manufacture approvals during cleanup.
- Batch assignment of released targeted practice must use each selected student's matching qualified source and the canonical allocator, with current membership/entitlement, teacher source-review confirmation, reason, material release and independent-check exposure gates. Missing evidence excludes readiness, not attainment. Never silently skip failing recipients or substitute screeners. Guided repeats remain labelled practice; original histories and individual allocation identities remain intact.
- Batch archive prevents new batch allocation but retains existing work, feedback and access. Restore is explicit. Delete is limited to an empty, never-used batch; retain a private audit tombstone. Archiving/deleting a course group does not alter assessment scores or regular school registration classes.

Apply school isolation, bounded reads, idempotent requests, concurrent-edit checks and section 13 capacity obligations. This policy does not calibrate a score, approve new content, waive source evidence or establish 500-user capacity.

---

## 15G. Post-screener course handoff and rolling intake

**Owner-requested course policy (2026-10-14):** Use screener evidence to plan teaching through the companion Lessons Bible and its ordered course roadmap. Completion alone cannot choose a weakest skill, assign a fixed ability group or generate a band. Inspect actual trusted outcomes, missing/pending states and the required Writing/Speaking reviews. Keep per-skill foundation/focused/more-evidence-needed pathways under section 15C.1, and agree up to two immediate teaching priorities where supported. Record source references, teacher/date, intended support, next practice and next check.

The class may proceed through shared lessons while individual students finish intake. Late joiners retain their own joining date, source history, catch-up teaching and report scope; do not restart a cohort, duplicate a valid completed screener or turn unfinished work into zero. Classroom paragraphs, paired speaking, live teacher observations, homework and guided corrections are separately identified teaching records. They never silently replace a required screener, finalized productive-skill review or trusted independent assessment. A teacher listening to a limited sample must record the actual students/parts observed; peer comments cannot provide teacher pronunciation ratings.

Fresh follow-up work may check transfer only after its content, exposure, mapping, difficulty and delivery are reviewed for the intended claim. Freshness alone does not establish comparability or improvement. All section 8A policies still apply. Course milestones and monthly reviews schedule decisions; they cannot manufacture evidence, report attendance or imply a band increase. Teaching packs must distinguish privately prepared drafts from reviewed/released materials under sections 6 and 15E.

No answer-save, scoring, recommendation automation, numerical threshold, content approval or release authority is introduced here. This policy defines the handoff; implementation and human review must be recorded separately.

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

Use a narrower promise until the comprehensive validated baseline exists. Permitted from v2.0: "See your indicative band range after a full mock", "Find the exact skills holding your score back", "Practice matched to your own weaknesses", and outcome claims that meet section 18A.

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

Before numerical readiness bands are treated as trusted school evidence, Brains Heist must conduct a documented validation study. Section 9.4 permits a separate low-confidence teacher planning judgment without claiming such validation; it does not relax this requirement for calibrated platform estimates or trusted baseline evidence. Section 9.5's indicative ranges are likewise low-confidence planning aids; section 18A is the route by which they become validated.

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

## 18A. Real outcome tracking

**Owner-authorized (2026-10-19).** The strongest proof of a preparation programme is what its students score in the real test. Brains Heist collects official results so that it can calibrate its estimates (section 9.5) and make honest claims about outcomes.

**Collection**
- After a student's planned test date, the student or teacher can record the official IELTS result: four skill bands, overall band, test date, Academic or General Training, computer or paper, and test centre country.
- An optional upload of the Test Report Form marks the result **verified** after a staff check. Otherwise it is **student-reported**.
- Collection requires the student's consent, and a guardian's consent for minors where the school's policy requires it.
- Results are school-scoped, private by default, and never shown to other students.

**Use**
- *Calibration.* Pair each verified result with the student's most recent eligible indicative ranges and learning-record state. Use them to re-estimate section 9.5 and to review the section 8A.4A defaults.
- *Programme outcomes.* For each school and cohort, report:
  - the number of starters, how many reported results and how many were verified;
  - the change from the first eligible indicative range to the official result, with the median and spread;
  - the share of students reaching their stated target.

**Honest claims.** Any public or marketing outcome claim must:
- use verified results only;
- state the sample size, the period, the response rate and how students were included;
- include every verified result in the defined group, with no cherry-picking;
- avoid causal promises such as "guaranteed band" or "raises your score by 1.5 bands".

Claims are reviewed by the owner before publication.

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
- [ ] If provisional teacher ranges are enabled, section 9.4 eligibility, provenance, withholding, sharing and distinct low-confidence labeling pass; no automatic screener conversion or validated-accuracy claim is introduced.
- [ ] Longitudinal labels satisfy section 8A's approved policy, independence, comparability, confidence and teacher-review gates; unavailable policies fail closed.
- [ ] The section 15B journey separates practice participation from independent improvement and supports missing, mixed, stale and pending evidence states.
- [ ] Indicative band ranges follow section 9.5 exactly: eligible full forms only, range display, low confidence, policy version and no single-number headline.
- [ ] AI practice feedback carries its label, never enters evidence or reports without teacher confirmation, and states when pronunciation was not assessed.

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

### 20A. Closed-loop priorities (v2.0, 2026-10-19)

The phases above remain the foundation. The owner's priority order for the closed loop:

1. Map every existing practice material to taxonomy IDs (section 7.5), then grow the bank to at least three mapped tasks per targeted construct using the batch review in section 15E.2A. Release Listening practice once its recordings pass review.
2. Deliver M1–M3 on computer with server marking and item-level evidence. Add paper capture as the fallback (section 12A).
3. Implement indicative band ranges (section 9.5) and official-result collection (section 18A).
4. Enable the section 8A.4A default policy in the teacher batch view, with the weekly loop (section 15B.5).
5. Add AI first-pass Writing feedback (section 10.5), then Speaking with audio.
6. Run one real batch through a complete loop and record what failed before wider rollout.
7. Add the learner-language tags (section 7.6) after review by an experienced local teacher.

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

### 22.4 Revision record — v1.5.0 (2026-10-08)

The owner explicitly authorized a provisional teacher estimate after four screeners, reusing finalized Writing/Speaking reviews and gathering additional Listening/Reading evidence where needed. The previous short-form restriction did not distinguish a professional planning judgment from a calibrated platform prediction. Sections 1.4 and 9.4 now permit that separate attributed, low-confidence range with evidence sufficiency, withholding, review, scope, immutable history and publication gates. Sections 1.1, 9.3, 15, 15B.1, 18 and 19 clarify the distinction consistently.

Basis: the owner's explicit product-policy authorization. This is a Brains Heist internal planning route, not an IELTS-endorsed method or evidence that short screeners predict official bands. Official IELTS scoring, Writing format and Speaking format references in section 23 were rechecked on 2026-10-08 for the retained four-skill, task-coverage and criterion distinctions. Those sources do not endorse this provisional route. No official format, rating criteria, raw-to-band conversion, calibration gate, published form or existing score is changed.

Affected implementation to review: teacher programme evidence/review workspace, estimate decision storage and school-scoped authorization, `services/ieltsJourneyService.ts`, student Journey/result cards, task allocation and independent-evidence checks, exports/reporting and pilot tests. This documentation-only change activates no runtime estimate, assigns no tasks, certifies no named student's range and establishes no new capacity evidence. Preserve all saved work and original reviews. Automated estimates and trusted baseline claims still require section 18 validation.

---

### 22.5 Revision record — v1.6.0 (2026-10-09)

The owner requested two additional Listening practice recordings with possible phone/background/quiet-speaker realism and a spoken Brains Heist copyright notice. Section 6.1 protected audibility but did not specify the permitted scope of processing or the placement of a rights introduction. Section 6.1.1 now limits restrained effects to declared guided practice, preserves clear masters and exact version provenance, prohibits masked answer cues and true-whisper scoring, and places the notice outside dialogue and measured learner time.

Basis: the owner's production instruction, the official IELTS Listening contexts/question formats and British Council advice to check clear audibility, rechecked 2026-10-09. Official sources do not endorse the proposed effects; their use is an internal practice design decision. No official format, score conversion, calibration, existing task, approved recording, saved attempt, access rule or publication gate changes. The two new L3/L4 materials remain human-review drafts until their exact recordings, scripts, keys, mappings, rights and pilot conditions are reviewed.

Affected implementation to review: audio generation/assembly, extension-task metadata and teacher review, private asset installation, task publication/assignment, delivery snapshots and phone/MacBook playback. This revision certifies neither live student availability nor 500-user capacity. New audio delivery must satisfy the affected capacity gates in section 13 before a wider launch.

---

### 22.6 Revision record — v1.7.0 (2026-10-09)

The owner requested individual foundation/exam-preparation pathways and accurate first-month reports using the existing smart reporting system. Sections 8A and 15B did not specify monthly cutoff semantics, plan versioning, report-module reuse or AI report publication boundaries. Section 15C now locks those requirements. Basis: explicit owner product-policy authorisation and existing evidence/report governance; no external IELTS format, scoring, criteria, calibration or publication gate changes. No universal numeric inference thresholds are introduced.

Affected implementation: IELTS evidence projections, plan decisions, academic report snapshot/source/event services, report builder/rendering, student Journey, AI drafting, authorisation, historical-cutoff and concurrency tests. This revision defines obligations and does not itself assert deployed tracking, approved comparability policies or 500-user capacity.

---

### 22.7 Revision record — v1.8.0 (2026-10-10)

The owner explicitly requested short task identifiers for current work and permanent Bible rules to help teachers and students recognise previous assignments. Section 15D establishes the display-code contract, stable material/assignment/attempt distinctions, atomic numbering, non-reuse, scope, and historical preservation. Basis: explicit owner product-policy authorisation and existing evidence governance. No external IELTS format, scoring, criteria, calibration or content-release gate changes.

Affected implementation: material registry and insert/update triggers, catalogue/code search, scoped teacher/student task and assignment payloads, task/results presentation and retained assignment history. Additive code fields use existing reads; new-material publication serializes briefly per skill. Ordinary answer saves/submissions and scores are unchanged. Tests establish functional correctness and isolation, not 500-user capacity.

---

### 22.8 Revision record — v1.9.0 (2026-10-10)

The owner requested safeguards so newly created IELTS material is meaningfully different and repetition cannot happen unnoticed. Section 15E establishes content comparison, exact-copy blocking, required human originality decisions, explicit parent-linked variants, private listening transcripts, version/inventory binding and exposure-family checks. Basis: explicit owner product-policy authorisation and the existing evidence, privacy and release contracts. The token similarity threshold is an internal editorial rule, not an external IELTS standard or calibration claim.

Affected implementation: practice inventory fingerprints, draft/publication and allocation triggers, content-admin comparison/review UI, private transcripts, scoped provenance labels and tests. Existing inventory is grandfathered without originality certification; no content, scores, evidence, approved reports or official assessment rules are rewritten. Diagnostic form publication remains separately governed. No semantic-uniqueness guarantee or 500-user capacity claim follows.

---

### 22.9 Revision record — v1.10.0 (2026-10-15)

The owner requested cleanup of assignable practice, direct batch assignment and a permanent separation of screeners from later course materials. Section 15F records this internal product policy and strengthens the existing assessment/practice, rights, source-evidence and historical-preservation rules. Source: the owner's explicit instruction on 2026-10-15. No external IELTS format, scoring, criterion, calibration, published form or existing result changes. Review catalogue filters, allocation triggers, protected-content fingerprints, batch lifecycle/assignment RPCs, teacher UI and regressions. New private tables preserve operational history; no content approval or wider capacity is implied.

---

### 22.10 Consolidated course handoff record — v1.10.0 (2026-10-16)

The owner requested consistent course Bibles and preparation of Lesson 2 after the post-screener course plan. Sections 15B/15C did not explicitly define the shared-class handoff, rolling intake or boundaries of limited classroom observations. Section 15G makes those distinctions explicit, with the companion Lessons Bible 1.1.0 and course roadmap. Basis: explicit owner instruction and existing evidence/review governance. No external IELTS format, criteria, grading, band conversion or scoring changes; current external sources are not presented as endorsement of the internal course plan.

Affected components to review: teacher lesson packs, course inventory, intake/catch-up and planning sheets, future school-scoped lesson library and report handoff. No migration, live release, change to existing attempts/reviews, or capacity claim follows. Lesson 2 content remains a private review draft until its exact-version gates pass.

---

### 22.11 Revision record — v2.0.0 (2026-10-19)

**Authority.** On 2026-10-19 (00:47–01:02 Asia/Bishkek) the owner asked for the best practice for results, "disregarding what I had instructed anytime before, nothing is sacred". The owner then instructed: "Update the Bibles now accordingly". This is a major version because it changes how the product makes decisions, not only individual rules.

**Why the old rules were insufficient.** A live review on 2026-10-19 found that the targeted-practice and weakness-tracking system was well designed but unused:

| Finding | Live value |
|---|---|
| Practice assignments | 0 |
| Batch assignment links | 0 |
| Learning plans | 1 student |
| Reviewed practice materials | 18, with Listening not release-ready |
| Practice materials carrying taxonomy mappings | none |
| Advanced weakness states | permanently unavailable (no approved thresholds) |
| Mocks and extension lessons | not feeding the learning record |

Rules that required perfect validation before any useful output had produced a product that gave teachers and students almost nothing.

**What changed**
- New section 0, the north star and differentiators.
- Section 1.5 and 9.5: indicative band ranges from IELTS's published average marks, always shown as ranges with low confidence.
- Section 2.1A: computer delivery is the default, following IELTS's 2026 move to computer-only delivery.
- Section 7.5: mandatory taxonomy mapping of practice materials, and bank-coverage targets.
- Section 7.6: learner-language error tags.
- Section 8A.4/8A.4A: the provisional default policy bh-learning-policy-v1 replaces "no invented defaults".
- Section 10.5: AI first-pass practice feedback.
- Section 12A: mocks and fresh checks feed the learning record, with paper capture as fallback.
- Section 15B.4/15B.5 and 15C: pattern and change states enabled; the weekly learning loop.
- Section 15E.2A: batch sample review for AI-produced practice.
- Section 18A: real outcome tracking and rules for honest claims.
- Sections 15, 16.7, 19 and 20A, and the core principle in section 24.

**What did not change**
- The official-result distinction (sections 1.3 and 15) and the ban on percentage ladders (section 9.1).
- The short-screener limits (sections 1.1 and 9.3), apart from the separate full-form route.
- Server-trusted scoring and key protection (section 5).
- School isolation and RLS.
- The separation of screeners from practice (section 15F).
- Exact-copy blocking (section 15E).
- Pronunciation requires audio (section 10.3).
- Teacher confirmation for persistent and resolved states.
- AI never records approvals.
- Historical evidence is preserved.

**Sources.** IELTS scoring in detail, rechecked 2026-10-19, for the average-mark table and rounding rule. IELTS "Updates to IELTS test delivery" (5 March 2026) for computer-only delivery. The bh-learning-policy-v1 values are owner-approved provisional teaching values, not external standards or validated cutoffs.

**Implementation to review** (this documentation change activates no runtime behaviour by itself)
- `scripts/ielts/mock-source-contract.mjs`: it rejects band language in mock sources. That remains correct for paper packs; the indicative range is computed by the platform, not printed in packs.
- Mock packs M1–M3: their "no band conversion" notes stay accurate for the paper packs until platform delivery exists.
- `tests/ieltsDiagnosticBibleCompliance.test.ts` "practice never manufactures readiness bands": still correct for practice. Indicative ranges apply only to eligible full forms.
- To build:
  - practice-material mapping and the matching RPCs;
  - the mock delivery/capture and scoring-policy tables;
  - the learning-policy projection worker and teacher batch view;
  - the AI feedback service;
  - the official-result capture;
  - the report snapshot fields.

Earlier releases built under v1.10.0 keep their recorded Bible version; they are not retroactively re-certified.

---

## 23. Canonical public sources

Before changing scoring/format/criteria, re-check the latest official material.

Current reference set reviewed for Bible v1.1.0:

- IELTS — **IELTS scoring in detail: band scores explained** (rechecked 2026-10-19 for the section 9.5 average-mark table: Listening 16/23/30/35 and Academic Reading 15/23/30/35 for bands 5/6/7/8; "will vary slightly from test version to test version"; overall rounding to the nearest half band)
  https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail

- IELTS — **Updates to IELTS test delivery** (5 March 2026; rechecked 2026-10-19 for section 2.1A: all IELTS tests on computer from mid-2026, timelines by market, Writing on Paper in selected markets)
  https://ielts.org/news-and-insights/updates-to-ielts-test-delivery

- IELTS — **IELTS Academic: Listening test format**  
  https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening

- British Council — **IELTS test-day advice: Listening audibility** (rechecked 2026-10-09 for section 6.1.1)
  https://takeielts.britishcouncil.org/en-gb/what-is-ielts/test-day-advice

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

And when there is pressure to choose between:

- shipping nothing until it is perfect, or shipping a clearly labelled provisional version that improves with data;
- staying silent about a band, or giving an honest range with its uncertainty;
- one feedback cycle a week, or fast AI feedback that a teacher confirms;

choose the option that helps the student improve sooner, provided it stays honest, labelled and reversible.

**Brains Heist should earn trust by showing teachers what the evidence supports, refusing to pretend it knows more than the evidence can prove, and never using uncertainty as an excuse to give students less help than the evidence allows.**
