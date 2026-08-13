# Writing Assessment Authority v2 rollout

The Writing Hub is an academic evidence source. A release is complete only when the evaluator is accurate enough for the student population and every downstream analytics unit reads verified or teacher-final evidence.

## Invariants

- Student UX, visual style, and cinematic playback stay unchanged.
- The heuristic scorer is a shadow/guardrail signal only. It is never `academic_profile_ready`.
- One `assessment_v2` response supplies rubric scores, evidence, weakness tags, corrections, and cinematic feedback.
- Missing, ungrounded, low-confidence, or disputed evidence is `needs_review`; it does not update Student Learning Memory.
- Automated assessments and teacher reviews are append-only. A final teacher review wins canonical reads without rewriting history.
- Paste/integrity telemetry is context for review, not authorship proof and not a score input.

## Required secrets/configuration

- `OPENAI_API_KEY`
- `BH_WRITING_ASSESSMENT_MODEL`: frozen primary evaluator model/configuration.
- `BH_WRITING_VERIFIER_MODEL`: frozen independent verifier model/configuration.
- `BH_WRITING_REASONING_EFFORT`: GPT-5 reasoning level. Defaults to `medium`; allowed values are `none`, `low`, `medium`, `high`, `xhigh`, and `max`.
- `BH_WRITING_ALWAYS_VERIFY`: defaults to `true`. Keep it true until calibration evidence supports conditional verification.

Changing either model is an evaluator-version event. Update `WRITING_EVALUATOR_VERSION`, rerun the complete benchmark, and preserve old records.

GPT-5-family assessment models use the OpenAI Responses API with strict structured output. GPT-4-family coaching and rollback models continue to use Chat Completions. Do not send GPT-4-only sampling parameters to a GPT-5 reasoning request.

## Benchmark data

The checked-in adversarial corpus lives at `tests/fixtures/writingAccuracyAdversarialV1.json`. It covers known failure families but is not a substitute for human-marked school work.

Before production cutover, add a de-identified teacher-marked corpus covering:

- Grades 6–12 and every supported genre.
- Every rubric band, including borderline scripts.
- Semantic paraphrase, keyword/linker stuffing, fluent off-topic writing, dense language errors, long valid sentences, short work, and instruction injection.
- Same-prompt revisions and prompt difficulty/word-count variation.
- A representative subset double-marked by teachers to establish teacher-to-teacher agreement.

Do not store student identifiers or unrestricted submission text in repository fixtures.

## Release gates

- At least 90% of criterion scores are within one band of the final teacher score.
- Per-criterion mean absolute error is no worse than teacher-to-teacher error plus 0.15.
- Directional bias is below 0.25 band by criterion, grade band, and genre.
- Zero ungrounded evidence spans.
- Zero silent/default scores.
- Same frozen input/config produces a stable outcome.
- All contract, security, type, build, and regression tests pass.

## Deployment order

1. Apply `20260812190000_writing_assessment_authority_v2.sql` to a non-production branch/database.
2. Deploy `bh_writing_ai` with primary/verifier models pinned and always-verification enabled.
3. Run contract and adversarial smoke tests against that environment.
4. Run the de-identified teacher corpus and review calibration metrics.
5. Deploy the app adapter only after the release gates pass.
6. Review `rpc_bh_writing_calibration_queue_v2` daily during the pilot.
7. Compare `rpc_bh_writing_calibration_metrics_v2` by criterion/grade/genre before widening the cohort.

Never deploy the app adapter before the migration and Edge Function; it deliberately fails closed when the assessment authority is unavailable.

## Rollback

- Roll back the app adapter first so no new v2 submissions start.
- Keep assessment/review records. They are evidence and must not be deleted or rewritten.
- Disable Student Learning Memory ingestion for affected evaluator versions if a calibration defect is discovered.
- Fix the evaluator under a new version and rerun the benchmark before resuming.
