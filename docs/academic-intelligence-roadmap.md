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
