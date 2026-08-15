# Verified question packages

Brains Heist Verified content is immutable academic evidence. It is published through a service-role-only package importer, never through the browser or a teacher account.

## Release workflow

1. Create a versioned folder under `content/verified-question-packages/` with a manifest and one or more subject files.
2. Run `npm run questions:validate-verified-package`. With no path, the validator checks every reviewed package in the repository.
3. Apply the schema/curriculum migrations to the target Supabase project.
4. Rehearse against the target database:

   ```bash
   SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   VERIFIED_QUESTION_IMPORT_TARGET=staging \
   node scripts/import-verified-question-package.mjs --dry-run
   ```

5. Import only after review. Production requires the explicit confirmation flag:

   ```bash
   SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   VERIFIED_QUESTION_IMPORT_TARGET=production \
   node scripts/import-verified-question-package.mjs --confirm-production
   ```

The database validates the package again, acquires a transaction-scoped advisory lock, rejects changed content under an existing package version, checks every subject/scope/objective, blocks active duplicates, and commits questions, assessment items, approved mappings, batch provenance and the release receipt atomically.

## Ways questions enter the product

| Path | Owner | Visibility | Official Academic Profile evidence |
|---|---|---|---|
| Versioned verified package | Brains Heist Academic Governance | Brains Heist Verified pool | Yes |
| Teacher form | Signed-in teacher | That teacher’s My Pool | No |
| Teacher CSV/TSV import | Signed-in teacher | That teacher’s My Pool | No |
| Immutable repair migration | Brains Heist Academic Governance | Replacement in Verified pool; original retired | Yes, for the replacement only |

Teacher imports intentionally cannot promote questions into the verified pool.

## 2026.2 first package

`brain-heist-g11-g12-core-2026-2@2026.2.0` contains 80 original multiple-choice questions:

- Grade 11 Chemistry: 20
- Grade 11 English: 20
- Grade 11 Biology: 20
- Grade 12 Travel & Tourism: 20

Each subject has five assessable objectives, four questions per objective, a 5 easy / 10 medium / 5 hard distribution, and a 5 / 5 / 5 / 5 correct-option distribution across A–D.

## 2026.3 Grade 12 core package

`brain-heist-g12-core-2026-3@2026.3.0` contains 80 original multiple-choice questions:

- Grade 12 Chemistry: 20
- Grade 12 Biology: 20
- Grade 12 English: 20
- Grade 12 Physics: 20

The package targets the immutable `brain-heist-international@2026-3` curriculum snapshot. Each subject again contains five objectives with four questions each, 5 easy / 10 medium / 5 hard questions, balanced A–D answer positions, explanations and one approved primary mapping per question.

The importer defaults to the repository's current latest package. To rehearse or re-check an older release, pass its directory explicitly with `--package-dir`.

## 2026.4 Grade 11 completion package

`brain-heist-g11-completion-2026-4@2026.4.0` contains 80 original multiple-choice questions:

- Grade 11 Chemistry depth set: 20
- Grade 11 Biology depth set: 20
- Grade 11 Physics: 20
- Grade 11 Travel & Tourism: 20

The release adds five deeper application objectives to Chemistry and Biology and supplies the first five assessable objectives for Grade 11 Physics and Travel & Tourism. It targets the immutable `brain-heist-international@2026-4` curriculum snapshot and preserves the same balance, explanation and mapping requirements as earlier packages.

## 2026.5 Mathematics and ICT foundation package

`brain-heist-mathematics-ict-2026-5@2026.5.0` contains 80 original multiple-choice questions:

- Grade 11 Mathematics: 20
- Grade 12 Mathematics: 20
- Grade 11 ICT: 20
- Grade 12 ICT: 20

The release supplies the first five assessable objectives for each grade-subject scope and targets the immutable `brain-heist-international@2026-5` curriculum snapshot. Every 20-question grade set contains four questions for each objective, 5 easy / 10 medium / 5 hard questions, balanced A–D answer positions, explanations and one approved primary mapping per question.

## 2026.6 Geography and Global Perspectives foundation package

`brain-heist-geography-global-perspectives-2026-6@2026.6.0` contains 80 original multiple-choice questions:

- Grade 11 Geography: 20
- Grade 12 Geography: 20
- Grade 11 Global Perspectives: 20
- Grade 12 Global Perspectives: 20

The release supplies the first five assessable objectives for each grade-subject scope and targets the immutable `brain-heist-international@2026-6` curriculum snapshot. It applies the same four-questions-per-objective, difficulty, answer-position, explanation and approved-mapping controls as the earlier production packages.

## 2026.1.1 repair record

The repair migration creates five new immutable records for answer-key or option defects, copies their approved curriculum mappings, and retires the originals. It also records and retires the 96 reviewed exact duplicate rows without changing assignment snapshots, attempts or student answers. The temporary Grade 8 QA framework is retired after its eight school mappings are archived.
