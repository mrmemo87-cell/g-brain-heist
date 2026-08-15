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

The importer defaults to this latest package. To rehearse or re-check an older release, pass its directory explicitly with `--package-dir`.

## 2026.1.1 repair record

The repair migration creates five new immutable records for answer-key or option defects, copies their approved curriculum mappings, and retires the originals. It also records and retires the 96 reviewed exact duplicate rows without changing assignment snapshots, attempts or student answers. The temporary Grade 8 QA framework is retired after its eight school mappings are archived.
