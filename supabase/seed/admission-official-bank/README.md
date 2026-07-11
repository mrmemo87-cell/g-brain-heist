# Brain Heist Official Admission Bank seeds

This folder is the staging area for platform-owned, locked Admission Hub content. It is intentionally small right now and contains **sample/dev content only** so the seed shape, validation, and import process can be reviewed before the real Grade 5–8 bank is authored.


## Authoring standard

No new official bank should be authored without a validated curriculum map. Follow the permanent [Admission Bank Authoring Rulebook](../../../docs/admissions/ADMISSION_BANK_AUTHORING_RULEBOOK.md) before creating any additional grade bank.

## Folder structure

```text
supabase/seed/admission-official-bank/
  README.md
  english/grade_5.json
  english/grade_6.json
  english/grade_7.json
  english/grade_8.json
  maths/grade_5.json
  maths/grade_6.json
  maths/grade_7.json
  maths/grade_8.json
  science/grade_5.json
  science/grade_6.json
  science/grade_7.json
  science/grade_8.json
  shared/reading_passages.json
  shared/writing_rubrics.json
```

## Validation

Run these fail-closed checks before any import or newly authored bank work:

```bash
node scripts/validate-admission-curriculum-maps.mjs
node scripts/validate-admission-official-bank.mjs
```

You can validate a different directory with:

```bash
node scripts/validate-admission-official-bank.mjs path/to/admission-official-bank
```

The validator fails on missing required metadata, duplicate `external_id`, invalid enum values, unsafe ownership/lock flags, bad scoring/timing fields, missing auto-scored answers, MCQs with fewer than 4 options, writing prompts without rubrics, and reading questions without a passage reference or inline passage.

## Curriculum linkage policy

Production-intended newly authored grade/subject files must set `curriculum_linkage_status: "linked"`, include `curriculum_map_id` and `curriculum_map_version`, and each question must include `curriculum_objective_id`. The official-bank validator cross-checks linked questions against the matching approved curriculum map. Current reviewed bank files are explicitly marked `curriculum_linkage_status: "legacy_review_required"`; this compatibility status is not allowed for new grade files.

## Pool schema

Each grade file has this shape:

```json
{
  "content_version": "2026.1-sample",
  "source_label": "Brain Heist Official Admission Bank — Sample/Dev Content",
  "pools": [
    {
      "external_id": "adm-official-english-g5-sample-foundation-pool",
      "subject": "english",
      "grade_level": 5,
      "stage_level": 5,
      "placement_band": "foundation",
      "name": "English Grade 5 Sample Foundation Pool",
      "description": "Sample/dev content only.",
      "content_version": "2026.1-sample",
      "source_label": "Brain Heist Official Admission Bank — Sample/Dev Content",
      "is_official": true,
      "is_locked": true,
      "content_owner": "brain_heist"
    }
  ],
  "questions": []
}
```

## Auto-scored question schema

Required question metadata:

- `external_id` — stable, unique external key for upserts.
- `pool_external_id` — stable pool key to link during import.
- `subject` — `english`, `maths`, or `science`.
- `grade_level` / `stage_level`.
- `placement_band` — `foundation`, `target`, or `stretch`.
- `diagnostic_skill` / `strand` / `subskill`.
- `difficulty` — `easy`, `medium`, or `hard`.
- `question_type` — no speaking content; supported seed values include `mcq`, `gap_fill`, `reading_comprehension`, `short_answer`, `structured`, `essay_writing`, and `writing_prompt`.
- `prompt` — maps to `adm_questions.stem` at import time.
- `options` — required for `mcq`; at least 4 options.
- `correct_answer` — required for auto-scored questions.
- `explanation`.
- `marks` — positive number.
- `estimated_seconds` — positive number.
- `content_version`.
- `source_label`.
- `is_official: true`.
- `is_locked: true`.
- `content_owner: "brain_heist"`.

## Reading passages

`shared/reading_passages.json` contains reusable passage records:

```json
{
  "passages": [
    {
      "external_id": "adm-reading-g5-sample-river-cleanup",
      "title": "The River Clean-up",
      "subject": "english",
      "grade_level": 5,
      "stage_level": 5,
      "text": "Passage text...",
      "content_version": "2026.1-sample",
      "source_label": "Brain Heist Official Admission Bank — Sample/Dev Content",
      "is_official": true,
      "is_locked": true,
      "content_owner": "brain_heist"
    }
  ]
}
```

Reading questions must include either `passage_external_id` referencing one of these shared passages or an inline `passage` string.

## Writing prompts and rubrics

Writing prompts are stored as questions with `question_type` of `essay_writing` or `writing_prompt`. They must have `rubric_external_id`, and the referenced rubric must exist in `shared/writing_rubrics.json`.

```json
{
  "rubrics": [
    {
      "external_id": "adm-writing-rubric-g5-sample-10pt",
      "name": "Grade 5 Sample Writing Rubric",
      "max_marks": 10,
      "criteria": [
        { "name": "Ideas", "marks": 4, "descriptors": ["Clear relevant ideas"] }
      ],
      "content_version": "2026.1-sample",
      "source_label": "Brain Heist Official Admission Bank — Sample/Dev Content",
      "is_official": true,
      "is_locked": true,
      "content_owner": "brain_heist"
    }
  ]
}
```

## Import guidance for platform/service role

1. Validate the seed JSON first with `node scripts/validate-admission-official-bank.mjs`.
2. Import only as Supabase service role or a platform admin. Never run official bank imports as a school admin.
3. Upsert by `external_id` through a staging/import function or script so imports are stable and repeatable.
4. Keep `school_id` null for official pools.
5. Map seed `prompt` to `adm_questions.stem`; map `passage_external_id`/shared passage text to the existing `passage`/`reading_passage_id` fields; map rubric JSON to `writing_rubric`.
6. Use `content_version` for batch updates. Prefer a new version such as `2026.2-g5-g8` when content changes materially.
7. Do not delete official questions that may have been used in attempts. Archive old content with `status = 'archived'` and seed replacement content with a new `external_id` or content version.
8. After import, verify records have `is_official = true`, `is_locked = true`, `content_owner = 'brain_heist'`, `school_id is null` for pools, and the expected `source_label`.
9. Generate a draft Admission Test Wizard form in staging to verify official pool selection and report metadata before production import.

## Next step for real content

After this structure is approved, generate and review the real Grade 5–8 English, Maths, and Science bank in small batches by subject/grade/placement band, validate every batch, import to staging, run candidate/report smoke tests, then promote to production with a new `content_version`.

## Import/upsert workflow

The import helper is intentionally service-role/platform-only and should be run after validation:

```bash
node scripts/validate-admission-official-bank.mjs
```

Dry-run a local or staging import without mutating Supabase:

```bash
ADMISSION_BANK_IMPORT_TARGET=staging \
SUPABASE_URL=https://your-staging-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/import-admission-official-bank.mjs --dry-run
```

Run a real staging import:

```bash
ADMISSION_BANK_IMPORT_TARGET=staging \
SUPABASE_URL=https://your-staging-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/import-admission-official-bank.mjs
```

Production imports require an explicit confirmation flag:

```bash
ADMISSION_BANK_IMPORT_TARGET=production \
SUPABASE_URL=https://your-production-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/import-admission-official-bank.mjs --confirm-production
```

> The committed sample/dev content is blocked from production imports by default. Do not use `--allow-sample-production` except for an intentionally disposable production-like smoke environment.

### Required environment variables

- `SUPABASE_URL` — target Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key only. Never use anon keys or school-admin browser credentials.
- `ADMISSION_BANK_IMPORT_TARGET` — must be `local`, `staging`, or `production` so the target environment is explicit.

### Import behavior

- Runs `scripts/validate-admission-official-bank.mjs` validation before any import.
- Refuses to run without service-role credentials or an explicit import target.
- Upserts pools and questions by stable `external_id`.
- Uses `school_id = null` for official pools.
- Preserves `is_official = true`, `is_locked = true`, and `content_owner = 'brain_heist'`.
- Maps seed `prompt` to `adm_questions.stem`.
- Maps seed `maths` subject to database `math` for compatibility with existing Admission Hub data.
- Resolves `passage_external_id` to `passage` and `reading_passage_id` on questions.
- Resolves `rubric_external_id` to `writing_rubric` JSON on writing questions.
- Throws on any failed row; it does not silently skip errors.
- Never deletes old official content.

### Archive and rollback guidance

Do not delete official content after it may have been used in candidate attempts. Use `adm_questions.status = 'archived'` for retired questions and `adm_question_pools.is_active = false` for retired pools. Keep the rows available for historical reports and attempts. If a future import requires replacing content, seed a new `external_id`/`content_version` and archive the older record after staging verification.

Example archive statements for a platform/service-role session:

```sql
update public.adm_questions
set status = 'archived'
where external_id = 'adm-official-example-question'
  and is_official = true
  and is_locked = true
  and content_owner = 'brain_heist';

update public.adm_question_pools
set is_active = false
where external_id = 'adm-official-example-pool'
  and is_official = true
  and is_locked = true
  and content_owner = 'brain_heist';
```

### Verification SQL after staging import

```sql
select subject, grade_level, stage_level, placement_band, content_version, count(*)
from public.adm_question_pools
where is_official = true
  and is_locked = true
  and content_owner = 'brain_heist'
group by 1,2,3,4,5
order by 1,2,4;

select qp.subject, q.question_type, q.difficulty, q.diagnostic_skill, count(*)
from public.adm_questions q
join public.adm_question_pools qp on qp.id = q.pool_id
where q.is_official = true
  and q.is_locked = true
  and q.content_owner = 'brain_heist'
  and q.status = 'published'
group by 1,2,3,4
order by 1,2,3,4;

select external_id, source_label, content_version, is_official, is_locked, content_owner
from public.adm_questions
where external_id like 'adm-sample-%'
order by external_id;
```

### Staging-first checklist

1. Run validation locally.
2. Run dry-run against staging with service-role credentials.
3. Run real import against staging.
4. Execute the verification SQL above. For the Grade 6 Science template-residue check, run `supabase/inspection/admission_g6_science_template_residue_check.sql`; it should return 0 rows after re-import.
5. Generate a draft Admission Test Wizard form from the official pool.
6. Register a test candidate, complete/submit a short attempt, and verify the candidate report shows diagnostic metadata.
7. Only then repeat with production credentials and `--confirm-production` for reviewed non-sample content.


## Generated form QA policy

Run `node scripts/validate-admission-official-bank.mjs` before importing official-bank content or generating Admission Hub forms. After any official-bank content change, generate fresh forms from the QA-passing bank before sending packages live. Existing pre-QA generated forms may remain for historical attempts and auditability, but package send cards should select the latest clean generated forms once fresh forms exist; do not delete old forms automatically and do not mutate submitted attempts.
