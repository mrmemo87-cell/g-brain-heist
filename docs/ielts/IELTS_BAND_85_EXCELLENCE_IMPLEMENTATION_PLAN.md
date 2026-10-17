# Brains Heist IELTS Academic — Band 8.5 Excellence Programme
**Execution blueprint · 2026-10-17 · proposed, not a published learner offer**

Canonical authority: [Diagnostic Bible v1.10.0](IELTS_DIAGNOSTIC_BIBLE.md), [Lessons Bible v1.1.0](IELTS_LESSONS_BIBLE.md), [Visual & UX Bible v1.1.0](IELTS_VISUAL_UX_BIBLE.md), [24-lesson roadmap v1.0.1](IELTS_COURSE_ROADMAP.md), repository `AGENTS.md`. Higher-authority contracts win. The working foundation PR [#1644](https://github.com/mrmemo87-cell/g-brain-heist/pull/1644) proposes Bible versions 1.11.0/1.2.0 and additive course-tracking features, but remains **draft, unmerged/unreleased for the scope described there**. Reconcile its reviewed changes before implementing equivalent features; do not cherry-pick old copies of the shared school portal.

## Mission and honest learner promise
- **Overall Band 8.5 is an aspirational high-performance outcome, never a promised result.** A 12-week, two-class-per-week course is the **core instructional sequence**, not evidence that a B1 entrant can attain 8.5 in that span.
- A student's actual starting point, goal, exam date, language experience, circumstances and independent evidence determine personalized workload and how long the advanced pathway lasts. B1 is a programme entry teaching assumption, **not** a measured IELTS band.
- IELTS Academic is the programme route. Do not assign General Training Reading or Writing to the Academic core. Preserve legitimate existing GT content as explicitly labelled separate optional material.
- Distinguish **learning objective achieved in guided practice**, **independently demonstrated subskill**, **qualified change on comparable reassessment**, and **official IELTS score issued by an external provider**. No internal short screener yields a trusted automatic band; approved, separately attributed provisional teacher readiness can follow Bible §9.4 only.

## Official examination anchors, verified 2026-10-17
- IELTS Academic Listening: approximately 30 minutes, 4 parts, 40 questions; one mark per correct answer; skills include distractor resistance, paraphrase, multiple speakers and academic lectures. Listening recordings in an exam are ordinarily played once. Source: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening
- Academic Reading: 60 minutes, three sections totaling 2,150–2,750 words, 40 questions, increasing complexity. Source: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading
- Academic Writing: 60 minutes, Task 1 at least 150 words (approximately 20 minutes), Task 2 at least 250 words (approximately 40 minutes); four official criteria, Task 2 weighted more heavily in the Writing score. Source: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing
- Speaking: 11–14 minutes in three parts; Part 2 includes one-minute preparation and an extended turn up to two minutes; four criteria including Pronunciation, assessed from audio or direct hearing. Source: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking
- Overall band: arithmetic mean of the four official component bands, rounded to the nearest half band; e.g. L8.5/R8.5/W8/S8 averages 8.25, reported as 8.5. This is a **score example, not a learner prediction**. Source: https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail

## Existing implementation: status at plan creation
| Area | Verified source state | Release meaning |
| --- | --- | --- |
| IELTS-01 | Implemented, with device/playback acceptance gaps | Existing teacher lesson; no blanket QA claim |
| IELTS-02 | Private draft and teacher-only delivery implementation; separate live release must be confirmed | Cannot count as general student release |
| IELTS-03 and -04 | Owner-approved immutable Silk Road teacher ZIPs and private library release recorded on main | Teacher delivery only; students' assignable tasks and diagnostic use remain separate |
| IELTS-05 to -24 | Roadmap planned; other independent practice resources exist | Do not count as 20 published full lesson packs |
| Targeted practice | Four-skill source-linked tasks, reviewed versions, allocation/exposure guards | Human teacher selects; practice is not longitudinal mastery |
| Broader school/batch assignments | Released course-material catalogue, per-recipient allocations | Selector is not an adaptive achievement-level engine |
| Teacher reports | Append-only plans and reports with evidence provenance | Current reports deliberately do not establish sustained improvement |
| PR #1644 | Proposed paper practice, coverage, teacher readiness, print improvements; reported test results | Draft code only, no proof of deployed hosted/security/device acceptance |

Sources: existing roadmap, `docs/ielts/releases/LESSONS_03_04_TEACHER_RELEASE_2026_10_17.md`, `docs/ielts/practice/REVIEWED_RELEASE_2026-10-16.md`, `docs/ielts/IELTS_MONTHLY_LEARNING_REPORTS_2026-10-09.md`, PR #1644.

## Four evidence-separated learning lanes
These lanes are **teaching scaffolds**, not a numeric band prediction or permission to auto-promote learners.

| Lane | Instructional emphasis | Progression decision (not an IELTS band score) |
| --- | --- | --- |
| A. Foundation | Sentence control, listening accuracy, literal/paraphrased reading, basic paragraph logic, intelligible short turns | Teacher sees independent, task-appropriate work; reduce hints only where justified |
| B. Applied | Multi-paragraph organization, academic vocabulary in context, multiple question types, developed spontaneous responses | New tasks without frames show consistent, valid application |
| C. Advanced | Nuance, inference, complex distractors, argument qualification, error control, abstract Part 3 analysis | Reviewed fresh harder tasks show transfer across topic and form |
| D. High-band challenge | Full exam demand, accurate linguistic flexibility, precise task fulfilment, efficiency under pressure, careful error diagnosis | Only reviewed, appropriate full-format evidence and later follow-ups support readiness judgments |

Every lesson must supply *core*, *supported* and *extension* variants. Difficulty is not "more words" alone: manipulate inference, competing propositions, discourse density, information distribution, vocabulary precision, abstractness, timing, and independence. Do not make listening difficult with poor audio, illegible text, harsh accents, or trick keys.

## Learner journey and weekly study design
1. **Intake:** save intended test type, target and date, completed/missing screeners, productive review states, source versions and testing conditions. If evidence is missing, plan collection; no invented score, trait, diagnosis or readiness band.
2. **Teacher plan:** one current priority plus at most two supported actionable subskill goals, evidence references, check method, follow-up date, lesson and homework choices, accommodations, help/exposure states.
3. **Teaching week:** two 60-minute live lessons (the canonical 24 lesson reference), plus a personalized independent practice budget set with the learner. For a highly ambitious adult/older learner, an *illustrative* plan is 5–8 additional hours per week, adjusted for access, workload, wellbeing and starting skill; never impose this as a completion/entitlement rule.
4. **Practice mix:** Reading and Listening distribute question types/context complexity; Writing includes criterion-aware Task 1 and Task 2 cycles; Speaking includes short, extended and abstract recorded/spoken work. Require deliberate feedback-driven revisions **and** genuinely fresh independent tasks, and do not conflate them.
5. **Feedback:** teacher-confirmed strength, exact evidence, one major improvement focus, repair exercise, and planned new check. Writing reviews apply actual task-specific criteria; Speaking pronunciation requires audio/direct observation. AI drafts remain private until teacher approval.
6. **Progress checkpoint:** use fresh reviewed sources with verified content/difficulty/conditions, compare only where approved equivalence and policy exist; show "improvement not yet established" otherwise. Retain source-instance, support, accommodations and conflicting evidence.
7. **High-band extension:** beyond the 12-week course, continue qualified advanced assignments, full-format practices and targeted clinics as required. There is no automatic time-based graduation, fixed score gain, or guaranteed exam outcome.

## 24-lesson teaching matrix and advanced extensions
Each lesson is 60 minutes; full-length mock sections, full Writing papers, Speaking interviews and thorough grading must be scheduled **outside** any single lesson when time exceeds 60 minutes. Lesson IDs remain unchanged. **Proposed instructional content below does not change production status.**

| Week | Lesson | Core lesson outcome | High-band extension / evidence task |
| --- | --- | --- | --- |
| 1 | 01 Listening corrections / Reading start | Distinguish a corrected detail and record Reading baseline | Explain why a spoken self-correction changes the key; note support/replay |
| 1 | 02 Reading evidence / developed answers | Separate entailment, contradiction and missing information; developed paragraph/answer | Justify difficult NOT GIVEN decisions; construct a qualified counterpoint |
| 2 | 03 Listening spelling / constraints | Accurate names, numbers, word limits and clear notes | Accent variation and morphology without compromising clarity |
| 2 | 04 Paragraphs / Speaking Part 1 | Logical explanation and extended direct Part 1 answers | Precise lexical paraphrase and unprompted elaboration |
| 3 | 05 Listening distractors | Follow opinion changes, options and correction cues | Multi-speaker agreement/reversal in longer academic dialogue |
| 3 | 06 Reading information location | Locate specific claims, scan and validate paraphrases | Mixed matching tasks, unfamiliar topic, lexical/distractor audit |
| 4 | 07 Task 2 reasoning | Thesis, argument mechanism, example quality and concession | Timed complete Task 2; evaluate and repair nuanced counterarguments |
| 4 | 08 Speaking development / checkpoint | Extend answers with why/how/examples; first individual plan review | Spontaneous Part 3 abstract reasoning; fresh independent speech sample |
| 5 | 09 Reading headings & purpose | Distinguish topic, argument and paragraph function | Complex rhetorical shifts and competing headings |
| 5 | 10 Listening notes & summaries | Predict grammatical answer type; handle paraphrase | Longer lecture with signposting and distant reference |
| 6 | 11 Academic Task 1 comparison | Overall trends, selection and relevant comparison | Timed whole Task 1, exception handling, accurate data language |
| 6 | 12 Speaking Part 2 organization | One-minute preparation, coherent sustained turn | Unscripted two-minute turn with detail/tense/repair control |
| 7 | 13 TFNG / YNNG distinction | Facts vs author claims; qualified evidence | Multiple reasonable distractors and reasoning under time pressure |
| 7 | 14 Longer Listening tracking | Academic listening discourse and reference | Part 3/4 dense multi-clause information and delayed answers |
| 8 | 15 Full Task 2 | Write a complete response with organization and development | Sophisticated stance, purposeful concession, precision edit under 40 minutes |
| 8 | 16 Speaking Part 3 / checkpoint | Analyze general and abstract propositions; second plan review | Sustained comparative reasoning and counterfactual speculation |
| 9 | 17 Timed Listening | Complete protected reviewed timed practice outside class, analyze errors in class | Diagnose repeat distractor/word-limit issue by item evidence |
| 9 | 18 Timed Academic Reading | Complete protected timed practice outside class, analyze errors in class | Strategic question ordering and explanation of remaining uncertainty |
| 10 | 19 Writing revision workshop | Compare original/edited Task 1 & 2 against criteria | Fresh essays and reviewer moderation of high-band descriptors |
| 10 | 20 Speaking interview / repair | Structured 3-part interview and pinpoint feedback | Examiner-style probing on unfamiliar abstract themes; audio check |
| 11 | 21 Fresh receptive-skill checks | Distinct assessed forms and error explanations | Independent full-format listening/reading mock blocks outside 60m lesson |
| 11 | 22 Fresh productive evidence | New writing and spoken tasks with controlled conditions | Separate complete Writing paper and 11–14-minute interview outside lesson |
| 12 | 23 Personalized repair | Choose two evidence-qualified development areas | High-band precision clinic using unfamiliar fresh tasks |
| 12 | 24 Final review / next plan | Compare only qualified work, document next steps | Schedule later comparable evidence and external test decision |

**Checkpoint design:** formative observations every lesson; separate, genuinely independent small checks after skills are taught; teacher review around Lessons 08, 16 and 24; optional/full mocks scheduled apart from 60-minute classes. Never call differently difficult tasks "comparable" without review/validation.

## Full course pack definition of done — EACH IELTS-05 to IELTS-24
- Immutable lesson ID/version, Academic scope, prerequisites, subskill taxonomy candidates awaiting human review; objectives and success criteria.
- Complete 60-minute staged teacher plan with actual stage timings, teacher talk/checks, core/support/extension and homework; protected student workbook and private correct keys/rationales/models.
- For Listening: licensed/original script, natural voice recordings, approved measured pauses/clean audio, exact delivered-file hash, playback/device acceptance and no answer cues. Missing approved audio = **not releasable**.
- For Writing: accurate Academic Task 1 data/visual stimulus as appropriate, and full Task 2 prompts where specified; models marked as examples, not certified bands. Proofread feedback and teacher criterion calibration anchors.
- For Speaking: parts and timings labelled, authentic follow-ups, audio observation requirements and teacher rubric calibration; short guided exercises not promoted to whole-interview scores.
- A **separate withheld fresh check** with no pre-exposure, mapped construct and reviewed difficulty, plus an independent later follow-up; no artificial equivalence claim.
- Editable PowerPoint, manual/motion-free alternative, accessible HTML, printable A4 student workbook, private scripts/keys, version manifest, start guide, available genuine audio, secure scoped ZIP and teacher-only distribution.
- Editorial, answer-key, taxonomy, difficulty, originality/licensing, privacy and release sign-offs recorded against exact content+asset hashes; no AI-only approval.
- Validated student/teacher access, replays/resumes, phone/tablet/desktop/zoom/keyboard, print, PowerPoint, supported-device audio and relevant capacity. Published states reflect actual gate results.

## Workstreams in safe dependency order

### G0 — Existing foundation reconciliation and deployment proof
- Inspect PR #1644 against **current main** and the separate private Lessons 03–04 release; integrate only nonconflicting, reviewed updates.
- Keep #1644 draft until hosted staging schema/RLS with real role tests, mobile/zoom/print/PowerPoint validation, teacher/student pilot, migration order and AI failure paths are verified.
- Verify actual course pack availability on main and database; no claim that a prepared file is a student task. No destructive attempt resets; do not rewrite immutable source history.

### G1 — Curriculum supply and internal content quality
- Finish human-reviewed Lesson 02 release state; produce packs 05–08 next, then 09–16, then 17–24.
- Review Academic vs GT catalog classification; index task content by exam type, main skill, question type, mapped subskill, practice purpose, allowed assistance, graded demand, source/version and reuse group.
- Add original, reviewed diverse practice: all Listening parts, three Academic Reading styles and question varieties, both Writing tasks, all Speaking parts; include fresh unseen forms for checkpoints. Build variety, not cloned questions with names changed.
- Introduce full-task demonstrations and realistic timed practice **earlier** than the old roadmap while preserving stable lesson IDs. Use draft versioned lesson packs; do not silently change approved source assets.

### G2 — Criterion-rich assignment progression
- Server-validated metadata + teacher selection: Academic-only default, subskill target, teacher rationale, reviewed difficulty, guidance level, prior exposure and comparability group; no hidden automatic graduation.
- Offer teacher a **suggestion** grounded in actual source evidence and availability; keep the existing canonical allocator, recipient-school checks and explicit confirmation.
- Put guided repair, independent check and delayed follow-up into visibly different phases; do not treat attempt submission, question count, grade or task completion as mastery.
- Explicit non-support: pending productive review, missing source, unavailable approved material, exposed check, mismatched GT/Academic or insufficient evidence.

### G3 — Governed longitudinal observation and change engine
- Implement Bible §8A in dependency order: approved taxonomy/crosswalk → append-only observation ledger → source qualification/exclusion → reviewer view → teacher intervention → comparable independent reassessment → versioned approved change policy → later follow-up → student projection and immutable report snapshot.
- Expose observed / incomplete / needs review first. Hold back strength, persistence, improvement, resolution and mastery labels until academic-owner-approved evidence thresholds and validation are actually established.
- Retain old and contradictory evidence, revisions, source version/hash, assistance, uncertainty and delivery conditions. Guard school scope, cost, performance and repeat counting. A manual teacher judgment cannot waive evidence gates.

### G4 — Assessment calibration and examiner consistency
- Train teachers on Writing Task Achievement/Task Response, Coherence/Cohesion, Lexical Resource and Grammatical Range/Accuracy; Speaking Fluency/Coherence, Lexical Resource, Grammatical Range/Accuracy and Pronunciation.
- Human moderation on anchor scripts/responses, same-task double scoring in sampled cases, disagreement logs, rubric explanations referencing actual work; no automated official-examiner claim.
- Use full-format equivalent mock evidence only when form review and appropriate calibration allow. Compare with real external IELTS results only where the student voluntarily provides verifiable evidence and proper authorization; distinguish external results from internal estimates.

### G5 — Operational school readiness
- Teacher: actual classes/rosters, released packs, approved Academic tasks, allocation, feedback, safe next actions, reports, absence/catch-up, appropriate next checks.
- Student: one next action, save/resume, objective result vs teacher-shared productive feedback, learning trail, honest missing-data labels.
- QA: explicit role matrix (anonymous, student, teacher, school admin, admin), multi-school isolation, audio interruption and mobile devices, production-safe load tests, 320/375/768/1440 widths, 200% zoom, accessible focus, print/output hashes, backfill/history preservation.
- Publish only after sign-offs; no hidden content auto-publication, fabricated readiness, stale offline answers or unsafe access shortcuts.

## Deployment truth / owner approval gates
| Release state | Minimum criterion | Who authorizes |
| --- | --- | --- |
| Teacher-only draft | Teacher plan/source exists but a content/QA gate remains | Content authors and authorized teacher reviewers |
| Reviewed teacher pack | Exact original content/audio hash and human approval + scoped teacher delivery | Human academic owner + authorized release process |
| Assigned student practice | Correct catalogue registration, eligibility, originality, teacher review and exposure control | Owner/material publisher and authorized assigning teacher |
| Independent reassessment | Approved source, no prior exposure, appropriate difficultly/comparability and grading conditions | Academic owner under Diagnostic Bible |
| Progress/change claim | Qualifying independent evidence + approved threshold/change policies, versioned projection + teacher confirmation | Academic owner + teacher |
| Ready for high-band pathway marketing | Complete course and above relevant operational gates, externally honest outcome claims | Product/academic owner |
| "Students achieved 8.5" | Authentic official external results for those students with lawful permission | External issuer evidence, not internal projection |

**Stop conditions:** missing audio approval; unreleased or unauthorized material; weak key/originality; score/band from a short practice; GT material mislabeled Academic; exposed independent check; failed real-role RLS; unresolved stale/contradictory record; missing physical/visual acceptance where required. A passing TypeScript build does not override these.

## Verification and handoff checklist
- [ ] Current main and PR #1644 diff reconciled; no stale portal overwrite.
- [ ] All 24 lesson statuses checked against actual installed, owner-reviewed content, not document presence.
- [ ] Lessons 02 and 05–24 have exact-version reviewed source + printed/offline delivery + human sign-offs.
- [ ] Approved original Listening audio covers every assigned Listening task.
- [ ] Academic/GT catalogue filters and validated metadata prevent cross-route mistakes.
- [ ] Each student has authorized evidence-led priorities, targeted tasks, revisions and safe fresh checks.
- [ ] Independent reassessment inventory validated for item exposure, form difficulty and comparability.
- [ ] Bible §8A projections and their exclusions/thresholds validated before displaying improvement/mastery.
- [ ] Teacher Writing/Speaking moderation calibrated; audio supports any pronunciation comment.
- [ ] Full mock session fits actual format outside 60-minute teaching slots.
- [ ] Hosted staging/pilot RLS/device/browser/print/audio/capacity and rollback evidence documented.
- [ ] Production deploy, real student/teacher flow, school isolation and source/event integrity confirmed.

## Implementation policy for Codex or human engineering
Perform one dependency-bounded PR per workstream. Prefer surgical/additive changes, current branch, no new Supabase project, no unauthorized test students, no production mutation until verified. Preserve current allocations, answers, reviews, report history, entitlements, school isolation, quality/release checks, and existing IELTS Student Journey routes. For each PR report exact change, before/after academic invariants, applicable Bible versions, tests performed with real output and untested gates. **Do not mark the system ready based on this plan alone.**
