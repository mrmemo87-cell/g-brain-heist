# Academic Intelligence delivery roadmap

Brain Heist's academic record is evidence-led: source results remain authoritative,
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
Brain Heist assessments. It does not claim Cambridge endorsement, reproduce Cambridge
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
