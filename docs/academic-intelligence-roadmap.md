# Academic Intelligence delivery roadmap

Brains Heist's academic record is evidence-led: source results remain authoritative,
historical observations stay intact, and current conclusions are rebuildable projections.
The work is delivered through gated phases so later reports never outrun the quality of
their underlying evidence.

## Delivery order

1. **Academic context foundation** — canonical subjects, school years, terms, and
   effective-dated student enrolment snapshots.
2. **Curriculum model** — versioned frameworks, stages, strands, topics, skills,
   subskills, and assessable objectives.
3. **Question mapping** — reviewed many-to-many links from questions to curriculum
   objectives, with explicit mapping confidence.
4. **Evidence adapters** — Cambridge first, followed by other school assessment
   sources that can provide meaningful and traceable evidence.
5. **Confidence and coverage** — evidence sufficiency, recency, source diversity,
   mapping quality, and curriculum coverage.
6. **Progress validation** — golden student journeys and production shadow comparison
   for focus, recurring, persistent, improving, resolved, strength, and decline.
7. **Intervention pilot** — teacher-approved plans with frozen baselines, follow-up
   evidence, and recorded outcomes.
8. **Term and annual reporting** — reproducible student, class, grade, subject, and
   School Head reports with evidence links and missing-data disclosure.

## Phase 1 contract

The Phase 1 migration is additive. It does not rename existing subjects, delete learning
history, or reclassify focus states.

- `academic_subjects` defines stable global subject identities.
- `academic_subject_aliases` resolves existing labels such as Math, Maths, and
  Mathematics to the same subject while preserving the original source label.
- `school_academic_years` and `school_academic_terms` define explicit school calendars.
- `student_academic_enrolments` stores grade/class context for a bounded time period.
- Learning observations snapshot their subject, year, term, grade, class, context source,
  and whether the context is confirmed, estimated, or unknown.
- A source-agnostic trigger enriches assignment, Writing Hub, imported, and future
  evidence consistently.
- Calendar and baseline-enrolment setup is restricted to an authorised School Head or
  school administrator.
- The readiness RPC reports missing years, grades, and subject mappings. Missing data is
  never presented as successful coverage.

## Rollout gate

Phase 1 should be enabled in this order:

1. Apply the migration to an isolated Supabase branch.
2. Run schema, RLS, RPC-authorisation, and backfill validation.
3. Configure one pilot school's real academic-year and term dates.
4. Seed its current placements as `estimated` enrolments.
5. Have the school confirm or correct enrolment dates before treating them as confirmed.
6. Compare academic profiles before and after enrichment; marks and existing focus states
   must remain unchanged.
7. Merge and deploy only after the preview and database checks pass.

The initial Cambridge pilot covers English, Mathematics, and Science. Curriculum content
and grade-level mappings begin only after this foundation is verified.

## Phase 2 contract

Phase 2 defines the curriculum as governed, versioned reference data. It does not import
or reproduce any third-party curriculum content by itself.

- `curriculum_frameworks` identifies a global or school-owned curriculum authority.
- `curriculum_framework_versions` records exact source, licence, effective dates, review
  state, and a SHA-256 content hash. Published versions cannot be edited in place.
- `curriculum_framework_subjects`, `curriculum_stages`, and `curriculum_scopes` connect a
  framework version to the canonical academic subject layer from Phase 1.
- `curriculum_nodes` represents a validated strand, topic, skill, and subskill hierarchy
  while allowing a framework to omit levels it does not use.
- `curriculum_objectives` stores assessable objective wording, cognitive level, command
  terms, source references, and stable codes inside one immutable version.
- `curriculum_objective_prerequisites` supports required or recommended learning order
  without mixing objectives from different versions.
- `school_curriculum_scope_mappings` maps one school year, grade, and canonical subject
  to a published subject-stage scope with confirmed or estimated quality.
- Schools read the catalog and scope detail through membership-checked RPCs. Direct
  browser writes to global curriculum tables remain closed.

### Version lifecycle

Curriculum versions follow `draft → in_review → approved → published → retired`.
Review can return a version to the previous editable state, but a published curriculum
version is immutable. A correction, source update, or local adaptation must create a new
version so historic evidence and reports continue to resolve against the original content
hash.

### Phase 2 rollout gate

1. Validate the empty schema and permissions on an isolated database or rollback-only
   production-schema transaction.
2. Import one licensed or original English pilot version as `draft` with source and
   licence metadata.
3. Review its stages, hierarchy, objective wording, codes, and grade interpretation.
4. Approve it only when every scope has at least one assessable objective.
5. Publish through the readiness gate with a reproducible SHA-256 content hash.
6. Map one pilot school's academic year, grade, English subject, and curriculum scope.
7. Confirm teachers can read the mapped catalog but cannot mutate curriculum records.
8. Repeat the same governed process for Mathematics and Science before Phase 3 question
   mapping begins.

## Phase 3 contract

Phase 3 creates a reviewed mapping layer between assessment items and the immutable,
published curriculum objectives from Phase 2. It does not rewrite source questions,
copy answer content, or treat an AI suggestion as approved academic evidence.

- `curriculum_assessment_items` is a source-agnostic, content-free registry for standard
  Question Bank items, Admission Bank questions, Cambridge test items, Writing Hub
  prompts, and future imports. It stores stable locators, subject/grade context, and a
  SHA-256 content hash; raw prompts, passages, options, answers, and explanations are
  rejected.
- `curriculum_mapping_batches` records whether mappings were manual, imported,
  rule-based, or AI-assisted. AI batches require model and prompt-version provenance.
- `curriculum_item_objective_mappings` supports one reviewed primary objective plus
  secondary, prerequisite, and extension links. Every mapping records a numeric
  confidence score, rationale, provenance, item hash, and published curriculum-version
  hash.
- Suggested mappings must enter review before approval. The proposer cannot approve
  their own work, approval requires at least `0.70` confidence, and corrections create a
  superseding mapping instead of editing history.
- `curriculum_mapping_decisions` preserves an append-only audit trail of submission,
  review, approval, rejection, and supersession decisions.
- Changing a source item does not rewrite or delete its approved history. The hash
  mismatch makes the mapping stale, excludes it from evidence resolution, and requires
  re-review.
- The service-only resolver returns only current approved mappings. Future evidence
  adapters must use this boundary rather than trusting legacy topic strings or Admission
  Bank compatibility fields as canonical curriculum evidence.
- School membership-scoped RPCs disclose item coverage, objective coverage, unmapped
  items, stale mappings, missing grade context, and the review queue. Zero registered
  items is reported as `no_registered_items`, never as successful coverage.

### Source adapter contract

Each adapter computes a reproducible SHA-256 hash from the complete academically
meaningful item content in its authoritative source. A Cambridge test uses its test id as
the source record and a stable question key inside the paper; a Writing prompt uses its
prompt id; UUID-backed Question Bank and Admission Bank rows use their row ids. Adapters
send only the hash and non-content descriptors to the curriculum registry. Existing
`adm_questions.curriculum_objective_id` values remain compatibility metadata until they
are resolved to a published canonical objective and pass the Phase 3 review workflow.

### Phase 3 rollout gate

1. Verify the Phase 2 English, Mathematics, and Science pilot versions are published and
   mapped to a confirmed pilot-school year, grade, and subject scope.
2. Register a small, representative sample from each assessment source without copying
   raw question content into the mapping registry.
3. Validate adapter hashes are deterministic and that an academically meaningful source
   edit makes the prior mapping stale.
4. Run manual mappings first, then compare rule-based or AI-assisted suggestions against
   the reviewed set. Suggestions must never auto-approve.
5. Require a reviewer other than the proposer and record a rationale for every approved
   primary or secondary objective.
6. Confirm the evidence resolver returns current approved mappings only and excludes
   suggested, rejected, superseded, retired-item, and stale-hash rows.
7. Review school coverage for unmapped items, objectives with no item coverage, missing
   grade context, and mappings awaiting review.
8. Begin Phase 4 Cambridge evidence adaptation only when the pilot mapping sample meets
   the agreed coverage and review-quality threshold; missing data remains visible.

## Phase 4 contract

Phase 4 introduces the first traceable evidence adapter for Cambridge-labelled, original
Brains Heist assessments. It does not claim Cambridge endorsement, reproduce Cambridge
content, infer question-level attainment from an overall score, or let provisional data
change a student's current academic status.

- New submissions may include a versioned `item_results` array containing only stable
  item keys, outcome states, and marks. Raw question text, answer keys, and student
  response text are not copied into the evidence layer.
- `cambridge_evidence_runs` makes every adapter decision visible as `materialized`,
  `partial`, or `blocked`, with counts for unregistered, unmapped, stale, invalid, and
  unanswered items. Missing item results are `blocked`, never silently treated as no
  weaknesses.
- `cambridge_evidence_item_snapshots` captures the exact approved mapping ids,
  confidence, item hash, curriculum-version hash, role, scope, and objective used at the
  time of adaptation. Later mapping changes cannot rewrite historical evidence.
- Current approved mappings are resolved independently for each item. Unregistered,
  unmapped, or stale items are disclosed and excluded; mapped items may still produce a
  partial run so useful evidence is not discarded.
- Evidence is aggregated by canonical curriculum objective, with unanswered items kept
  separate from incorrect answers. One observation cannot masquerade as several because
  source keys are unique per run and objective.
- Unanswered items are kept separate from incorrect answers in both the immutable item
  trace and every objective-level percentage.
- Browser-scored outcomes are labelled `stored_client_result`. A service-only boundary
  accepts `teacher_verified` or `server_verified` outcomes without exposing service
  credentials to the browser.
- All Phase 4 Cambridge observations are `provisional` and
  `contributes_to_focus_state = false`. Phase 5 must qualify sufficiency, recency,
  source diversity, mapping confidence, and coverage before any observation affects a
  focus, persistence, improvement, or strength conclusion.
- Evidence tables are RLS protected and append-only. School users receive readiness
  totals through a membership-scoped RPC rather than direct table access.

### Item-result contract

Each result supplies `item_key`, `response_state`, `marks_awarded`, and
`marks_possible`. Allowed states are `correct`, `partial`, `incorrect`, `unanswered`,
and `unscored`. Item keys must be unique, marks must be internally consistent, and their
totals must equal the authoritative attempt row. A mismatch blocks the run. The first
pilot producer is the secure Stage 9 Listening Test 1 submission; other Cambridge test
shells remain explicitly unprocessed until they emit the same validated contract.

### Phase 4 rollout gate

1. Apply the migration on an isolated Supabase branch and verify trigger/RPC execution,
   append-only guards, RLS, and service-only grants.
2. Register and approve mappings for a reviewed sample of Stage 9 Listening Test 1 item
   keys (`q1` through `q30`) without copying question or answer content.
3. Submit correct, incorrect, and unanswered pilot responses; confirm outcome totals
   match the attempt and unanswered items never become weaknesses.
4. Change an item or curriculum content hash and confirm the run reports a stale mapping
   rather than reusing it.
5. Submit missing, duplicate, malformed, and score-mismatched item results; each must
   produce a visible blocked run with zero observations.
6. Re-run the same source payload and confirm idempotency. Run a corrected, verified
   payload and confirm the earlier snapshot remains immutable.
7. Compare readiness totals to source attempts and reconcile every unprocessed,
   unregistered, unmapped, stale, partial, and blocked count.
8. Begin Phase 5 only after the pilot school accepts the evidence trace and explicit
   missing-data disclosure; no Phase 4 observation may yet modify focus state.

## Phase 5 contract

Phase 5 turns traceable observations into transparent, confidence-gated conclusions and
curriculum-coverage disclosure. Confidence describes the quality of the evidence behind a
conclusion; it is not the student's attainment score. Coverage describes the breadth of
qualified evidence across a configured curriculum scope; it is not mastery.

- `academic_evidence_confidence_policies` versions the formula weights and minimum gates.
  An active or retired policy is immutable so a later policy change cannot silently alter
  the meaning of an earlier report.
- `student_learning_confidence_states` is a rebuildable, academic-year-scoped projection.
  It records qualifying observations, evidence volume and quality, recency, time span,
  source types and source instances, mapping quality, source coverage, consistency, every
  component score, every decision gate, the policy version, and projection time.
- Existing trusted assignment, Writing Hub, import, and teacher evidence qualifies only
  when its source adapter marks it as contributing. Cambridge evidence qualifies only
  when item outcomes are `teacher_verified` or `server_verified` and have mapping
  snapshots. `stored_client_result` observations remain visible but cannot drive a
  conclusion.
- The general decision gate requires at least two qualifying observations, four evidence
  items, a confidence score of 60, and evidence no older than 180 days. A persistent label
  additionally requires at least three focus observations from two source instances over
  21 days, a score of 70, and recent evidence. Resolution requires two prior focus
  observations followed by two recovery observations, two source instances, a score of
  70, and recent evidence. Consistent strength has its own two-observation, two-instance,
  seven-day, score-68 gate.
- Data that is missing, sparse, stale, or recently contradictory is reported as
  `not_assessed`, `low_data`, `stale`, or `contradictory`. It cannot produce persistent,
  resolved, or consistent-strength conclusions. Persistent, resolved, and contradictory
  cases are flagged for teacher review rather than presented as an autonomous diagnosis.
- The current focus projection stores its confidence state, policy result, academic year,
  assessment state, review requirement, and computation time. Inserting new evidence
  refreshes the affected skill only; the service-only rebuild RPC supports reproducible
  shadow projections without rewriting historical observations.
- `student_curriculum_coverage_states` reports assessable, observed, qualified,
  unassessed, low-data, focus, strength, outside-scope, and unmapped counts for each
  student/year/subject. Readiness is `curriculum_not_configured`, `no_evidence`,
  `low_coverage`, `partial_coverage`, or `broad_coverage`.
- An unassessed objective is never classified as a weakness. A broad-coverage result does
  not mean mastery. Estimated grade-to-scope mappings remain explicitly estimated.
- The student-confidence RPC uses the same self, School Head, school-admin, and assigned-
  subject teacher boundaries as the academic profile. Projection tables have fail-closed
  RLS and no direct authenticated-table access.

### Phase 5 rollout gate

1. Apply the migration on an isolated Supabase branch and validate schema, constraints,
   RLS, grants, trigger execution, concurrent ingestion, and service-only rebuild access.
2. Rebuild the reviewed pilot students at a fixed `as_of` time. Confirm identical inputs
   and policy version produce identical scores and gates without altering observations.
3. Reconcile excluded evidence by reason: provisional browser scoring, missing mapping,
   missing year/subject context, insufficient items, stale evidence, and contradictions.
4. Have subject teachers review borderline scores plus every persistent, resolved, and
   contradictory result. Record disputed journeys for Phase 6 golden-case validation.
5. Verify year transitions do not mix the previous academic year's evidence into current
   decisions, while the original observations remain available for historical reporting.
6. Compare configured objectives to observed and qualified coverage for each pilot
   grade/subject. Reconcile every outside-scope and unmapped signal; do not convert an
   unassessed objective into a focus area.
7. Run a production shadow comparison against the existing focus projection. Monitor
   label changes, confidence distributions, stale projections, and teacher disagreement;
   do not bulk backfill current conclusions until the school accepts the thresholds.
8. Begin Phase 6 only with approved golden journeys for weak, recurring, persistent,
   improving, resolved, strength, decline, missing, contradictory, stale, and grade/year
   transition cases.

## Phase 6 contract

Phase 6 validates progress conclusions before wider reporting or intervention automation.
It makes the classifier executable as one shared contract, proves that contract against
approved synthetic journeys, compares it with stored production conclusions at a fixed
evidence cutoff, and records professional teacher review. It does not rewrite evidence or
silently apply a shadow candidate to the learner record.

- `student_learning_classify_progress` is the single deterministic classifier used by the
  live focus refresh, golden validation, and shadow comparison. This prevents the test
  harness from validating a second implementation that can drift away from production.
- `academic_progress_golden_journeys` contains approved synthetic contracts for missing
  evidence, low-data focus, new focus, recurring focus, persistence, improvement,
  resolution, emerging and consistent strength, decline, contradiction, staleness, and
  academic-year transition. Approved and retired cases are immutable.
- A golden run records the active confidence policy, expected and actual outcome for every
  journey, pass/fail totals, and exact classifier version. A production shadow run is
  blocked unless the latest policy has a completed golden run with zero failures.
- Shadow comparison is school/year scoped, uses a fixed `as_of` cutoff, accepts an optional
  reviewed student sample, and is bounded to at most 1,000 student-skill comparisons per
  run. A school/year advisory lock prevents overlapping runs.
- Every shadow result records the stored and candidate states, comparison category, risk,
  confidence gates, evidence count, latest evidence time, and a SHA-256 hash of the exact
  observation snapshot. Results and completed runs are immutable.
- Comparison outcomes are `same`, `missing_current_state`, `confidence_withheld`,
  `contradiction_detected`, or `status_changed`. A changed persistent, resolved,
  consistent-strength, or contradictory conclusion is high risk.
- Shadow execution may refresh the rebuildable confidence/coverage projection, but it does
  not mutate observations, focus states, or source results and does not apply candidate
  conclusions. The disclosure states each of those boundaries explicitly.
- Teachers may review only students and subjects assigned to them. School Heads and school
  administrators may review their own school. Reviews are append-only, versioned, require
  a meaningful rationale, and support `agree`, `disagree`, or `needs_more_evidence`.
  Disagreement requires the teacher's expected status; a request for more evidence requires
  a specific evidence-gap code.
- Teacher review strengthens professional judgment but does not silently change the learner
  record. The latest review version is reported while every earlier version remains auditable.
- The validation read RPC returns only the School Head/admin scope or the assigned teacher's
  student-and-subject scope. Direct authenticated table access remains closed behind RLS.

### Phase 6 rollout gate

1. Apply Parts 1–6 on an isolated Supabase branch and run the approved golden suite. Do not
   begin shadow comparison if any journey fails or no active confidence policy is present.
2. Review every golden journey with English, Mathematics, and Science academic leads.
   Reviewer-authored changes create a new version rather than editing an approved contract.
3. Run a small fixed-time shadow sample first. Re-run the same cutoff and student sample;
   totals, candidate decisions, and evidence hashes must be identical.
4. Reconcile `missing_current_state`, `confidence_withheld`, `contradiction_detected`, and
   `status_changed` separately. Never treat a mismatch count alone as model accuracy.
5. Require teacher review for all high-risk differences, persistent/resolved candidates,
   contradictions, and a representative sample of exact matches and low-risk cases.
6. Measure agreement, disagreement, requests for more evidence, common evidence gaps,
   subject differences, grade differences, and year-transition errors. Keep free-text
   rationale available for academic review without feeding it back automatically.
7. Confirm teacher cross-class, cross-subject, and cross-school access is denied; confirm
   students and anonymous users cannot read or write validation records directly.
8. Define acceptance thresholds with the pilot school before Phase 7. Do not auto-apply
   candidate conclusions or start interventions from shadow results; Phase 7 remains a
   teacher-approved intervention pilot with frozen baselines.

## Phase 7 contract

Phase 7 turns a validated learning need into a small, teacher-controlled intervention
experiment. It upgrades the existing Student Support Plans workflow rather than creating a
second intervention system. Brains Heist may calculate and recommend, but a teacher decides
whether a plan starts and whether measured follow-up supports its final outcome.

- A plan can be drafted only from a current academic-year focus state with a confidence
  projection and a completed Part 6 shadow comparison. If that comparison requires review,
  the latest teacher validation must be complete and cannot request more evidence.
- Creation freezes the exact baseline cutoff, focus status/trend/priority, confidence policy
  and score, academic context, qualifying evidence totals, observation-level evidence, and a
  SHA-256 snapshot hash. Later evidence never rewrites that baseline.
- Every draft defines a measurable target status, review date, minimum qualifying follow-up
  observations, minimum successful observations, teacher goal, and intervention type.
  Free-text activity alone cannot prove improvement.
- Plans begin as `pending`. An authorised subject teacher, School Head, or school
  administrator must explicitly approve the frozen plan and record a professional rationale
  before it can become active. Approval does not automatically start the plan.
- Follow-up evaluation uses only same-year evidence recorded after the baseline cutoff. It
  stores the exact observation snapshots and evidence hash, compares them with the baseline,
  and reports `insufficient_follow_up`, `improved`, `resolved`, `no_change`, `declined`, or
  `contradictory`.
- A measured checkpoint never closes a plan automatically. The teacher must confirm the
  measured outcome, override it with a longer professional rationale, or continue collecting
  evidence. An insufficient follow-up cannot be confirmed as success.
- Approval, evidence snapshots, evaluated checkpoints, outcome reviews, and lifecycle events
  are append-only. Completed or evaluated academic records cannot be silently edited later.
- Existing observations and focus conclusions remain unchanged. Evaluation refreshes only
  the rebuildable confidence projection; it does not prescribe practice, apply a conclusion,
  reward activity volume, or change the learner record autonomously.
- Teacher access remains limited to active class-and-subject assignments. School Heads and
  administrators remain school-scoped. The enriched read RPC removes the older cross-subject
  intervention-history widening when a teacher opens an all-subject student view.
- Existing intervention RPCs remain compatible, but now inherit the approval, evidence,
  measurement, and confirmation gates. New UI calls use the explicit Part 7 draft contract.

### Phase 7 rollout gate

1. Apply Parts 1–7 on an isolated Supabase branch. Confirm baseline and follow-up tables are
   RLS-enabled, browser table access is closed, RPC execution is explicit, and every foreign
   key used for joins or cascades has a supporting index.
2. Select one authorised roster across English, Mathematics, and Science only after Part 6
   golden and shadow acceptance. Do not widen the pilot to a whole school automatically.
3. Draft plans for a reviewed mix of recurring, persistent, improving, stale/reassessment,
   and exact-match shadow cases. Confirm every baseline hash reproduces from its snapshots.
4. Require a teacher to approve each goal and measurement target before activation. Confirm
   pending and rejected plans cannot start and approval never starts a plan automatically.
5. Collect comparable post-baseline evidence. Separate assigned/completed activity from
   qualifying evidence and successful evidence; activity volume is not an academic outcome.
6. Re-run checkpoint evaluation at the same cutoff. Candidate decision, totals, comparison,
   and follow-up evidence hash must be identical while source observations and focus states
   remain unchanged.
7. Review all insufficient, contradictory, declined, no-change, improved, and resolved cases.
   Measure teacher confirmation, override, continue-collecting, rationale quality, time from
   alert to action, and outcome by subject/grade—without training on free text automatically.
8. Confirm students see only appropriate final support outcomes; internal rationale and
   evidence notes remain confidential professional records. Family-facing reporting must not
   expose private working notes.
9. Define pilot acceptance thresholds before Phase 8 reporting. Do not present intervention
   effectiveness school-wide until baseline coverage, follow-up comparability, and teacher
   review rates meet the school's agreed minimums.

## Phase 8 contract

Phase 8 makes term and annual reporting reproducible. Every report is generated from an
exact academic-year, optional term, enrolment, subject, audience, and evidence cutoff. It
is a versioned evidence record rather than an editable copy of whichever live dashboard a
staff member happened to open.

- Student, class, grade, subject, and whole-school scopes use effective-dated enrolments.
  Student and family audiences are restricted to one student; broader reports remain staff
  outputs. Teachers keep their assigned class-and-subject boundary, while School Heads and
  administrators remain school-scoped.
- A generated report starts as Draft. Explicit approval is required to make the same exact
  payload Final and exportable. Finalization is the only permitted snapshot update; source
  references and audit events are append-only.
- The snapshot stores the complete rendered payload, reporting period, evidence cutoff,
  source SHA-256 hash, payload SHA-256 hash, version, and predecessor. Identical inputs and
  sources reuse the identical report. Changed evidence creates a new version and never
  rewrites the historical report.
- Attainment, progress states, strengths, confidence, curriculum coverage, and reviewed
  intervention outcomes are scoped to the selected year and term. Historical focus and
  confidence projections are withheld when evidence after the requested cutoff means the
  current projection cannot truthfully represent that earlier point in time.
- Missing work is not zero. No evidence is `not_assessed`; sparse evidence is `low_data`;
  unassessed curriculum is not a weakness. Expected standards remain `not_configured`
  unless the school has an approved standards model.
- Confidence is not attainment and coverage is not mastery. Curriculum coverage is clearly
  labelled academic-year-to-cutoff even on a term report.
- Intervention activity volume is not an outcome. Reports include measured, approved
  lifecycle/outcome fields while excluding professional rationale, goals, private notes,
  raw evidence JSON, and internal validation commentary.
- Snapshot generation does not mutate observations, current focus states, source results,
  or intervention decisions. Tables are RLS-enabled with browser access closed; authorised
  users work through explicit RPCs only.
- The student profile and School Head intelligence view use one report builder and one
  database contract. Live dashboard filters do not silently become the historical record.

### Phase 8 rollout gate

1. Apply Parts 1–8 on an isolated Supabase branch. Confirm explicit grants, fail-closed RLS,
   immutable triggers, indexed foreign keys, RPC authorization, and no browser table access.
2. Generate student, class, grade, subject, and school reports across annual and term scopes.
   Reconcile student counts against effective-dated enrolment at both period boundaries.
3. Re-run every report with the same cutoff. Require the same report ID, source hash, payload
   hash, and version. Add controlled evidence, move the cutoff, and require a new version
   linked to its predecessor.
4. Review every `not_assessed`, `low_data`, stale, contradictory, and historical-projection-
   withheld disclosure. Confirm no missing value becomes a zero, weakness, or expected result.
5. Reconcile report subject totals to exact source references. Verify private rationale,
   notes, raw evidence JSON, and review commentary never appear in student/family payloads.
6. Require authorised staff to review Draft output before Final. Confirm Draft cannot be
   printed from the UI and student access requires a Final, student-audience report.
7. Confirm generating, regenerating, finalizing, and reading reports never changes source
   observations, focus states, confidence decisions, or intervention outcomes.
8. Pilot with one accepted year/term, reviewed evidence coverage, and approved Part 7 outcome
   thresholds. Do not present school-wide effectiveness or release family reports when the
   selected period lacks sufficient, mapped academic evidence.
9. Begin Phase 9 only after schools can reproduce sampled historical reports from their exact
   source references and approve the governance, retention, correction, and rollout process.

## Phase 9 contract

Phase 9 closes the academic-intelligence programme with school-owned governance and a
controlled release. It does not add operational school management or turn incomplete data
into academic conclusions. Staff can continue a bounded pilot, but student and family
publication fails closed until the School Head approves the rules, the selected academic
year passes those exact rules, and the relevant capability is explicitly enabled.

- The School Head approves an immutable, versioned governance policy for one academic year.
  It records minimum evidence and curriculum coverage, shadow and intervention review rates,
  historical report reproduction samples, retention duration, correction response time, and
  the school's written attestation. A new policy supersedes rather than edits the old one.
- Readiness is a deterministic evidence snapshot with exact source and readiness SHA-256
  hashes. It reconciles effective-dated enrolment, students with evidence, curriculum
  coverage, golden validation, the latest shadow comparison and reviews, reviewed measured
  intervention checkpoints, final reports, and identical report reproductions.
- A failed or missing gate creates a named blocker. No release button can convert `not_ready`
  to ready, and a readiness snapshot tied to an older policy cannot authorize a release.
- `student_reports`, `family_reports`, `schoolwide_reporting`, and
  `intervention_effectiveness` are separate append-only decisions. The latest enable, pause,
  or disable decision is authoritative. Only the School Head can decide release.
- Staff-only Draft and Final snapshots remain available during validation. Student/family
  finalization is blocked until its capability is enabled. Pausing student reports also
  blocks subsequent student reads of earlier Final snapshots while preserving staff audit.
- Corrections never edit a Final report. A request and its review events are append-only; an
  accepted correction links a later Final version in the same report scope and preserves the
  original source and payload hashes.
- Retention actions are a request-and-decision workflow. Export, restriction, or deletion
  review is recorded separately from execution. No browser RPC automatically deletes learner
  evidence, reports, corrections, or audit history.
- The audit manifest exports policy and readiness hashes plus release, report, source,
  correction, and retention counts for the selected year. It excludes raw evidence and
  private professional notes.
- Governance tables are RLS-enabled, browser table access is closed, foreign keys are
  indexed, and authorised users work only through explicit RPCs. All governance, readiness,
  release, correction, and retention records are append-only.

### Phase 9 launch and operating gate

1. Apply Parts 1–9 on an isolated Supabase branch and run the migration-security checks.
   Confirm fail-closed RLS, exact RPC grants, append-only triggers, indexed foreign keys, and
   that no governance table is directly available to `anon` or `authenticated`.
2. Have the School Head approve thresholds and terms before viewing readiness. Record why the
   chosen evidence coverage, curriculum coverage, review rates, reproduction sample, retention
   duration, and correction response target are appropriate for the school.
3. Evaluate one accepted academic year. Reconcile every metric to its source table and require
   zero unresolved high-risk shadow reviews. Re-evaluating unchanged sources must produce the
   same source and readiness hashes.
4. Change one governed input at a time and confirm the named blocker appears. A not-ready
   snapshot, an older-policy snapshot, or a School Admin account must never enable release.
5. Enable student and family reports separately. Confirm a Draft external report cannot be
   finalized before enablement, can be finalized after enablement, and student reads stop
   after a later pause without removing the staff audit copy.
6. Keep school-wide reporting and intervention effectiveness disabled until the school has
   explicitly reviewed what those labels mean. Intervention activity volume remains excluded
   from outcome claims.
7. Submit and resolve sampled correction cases. Confirm the original Final report is unchanged,
   a replacement must be a later Final version in the same scope, and all events remain visible.
8. Submit export, restriction, and deletion-review requests. Confirm none deletes data, every
   decision names an accountable actor, and destructive execution remains outside the browser
   workflow pending the school's legal and contractual review.
9. Export and archive the audit manifest with the school's release record. Re-run readiness on
   the agreed cadence and after policy, mapping, source-adapter, or confidence-model changes.
   Pause affected capabilities whenever the school can no longer evidence its approved gate.

Phase 9 is complete when the school—not an opaque score—owns the release decision and can
reproduce the policy, evidence, report, correction, retention, and audit chain for the entire
academic year.
