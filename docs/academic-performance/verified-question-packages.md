# Verified question packages

Brains Heist Verified content is immutable academic evidence. It is published through a service-role-only package importer, never through the browser or a teacher account.

## Release workflow

1. Create a versioned folder under `content/verified-question-packages/` with a manifest and one or more subject files.
2. Run `npm run questions:validate-verified-package`. With no path, the validator checks every reviewed package in the repository.
3. Apply the schema/curriculum migrations to the target Supabase project.
4. For schema v2 visual packages, deploy the checksum-addressed files under `public/question-assets/` before the database import. Production imports download every deployed asset and reject any byte or content-type mismatch.
5. Rehearse against the target database:

   ```bash
   SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   VERIFIED_QUESTION_IMPORT_TARGET=staging \
   node scripts/import-verified-question-package.mjs --dry-run
   ```

6. Import only after review. Production requires the explicit confirmation flag:

   ```bash
   SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   VERIFIED_QUESTION_IMPORT_TARGET=production \
   node scripts/import-verified-question-package.mjs --confirm-production
   ```

The database validates the package again, acquires a transaction-scoped advisory lock, rejects changed content under an existing package version, checks every subject/scope/objective, blocks active duplicates, and commits questions, assessment items, approved mappings, batch provenance and the release receipt atomically. Schema v2 also records immutable visual metadata and question-to-asset links. SVG validation rejects scripts, event handlers, embedded images, external references, invalid dimensions, missing titles, weak alt text and checksum/path mismatches.

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

## 2026.7 Grade 6 visual pilot

`brain-heist-grade-6-core-2026-7@2026.7.0` contains 80 original multiple-choice questions:

- Grade 6 Mathematics: 20
- Grade 6 English: 20
- Grade 6 Integrated Science: 20
- Grade 6 Geography: 20

This is the first schema v2 release. It includes 24 original 640×360 SVG learning assets: seven Mathematics diagrams, three English visual stimuli, seven Science diagrams and seven Geography maps/charts. Every asset uses a content-addressed filename, SHA-256 receipt, reviewed source/licence metadata and an answer-safe accessibility description.

The package targets `brain-heist-international@2026-7`. In the four pilot scopes, broad legacy auto-classified objectives remain in history but become non-assessable; five curated objectives per subject become the governed mapping targets. Each subject retains the production balance of four questions per objective, 5 easy / 10 medium / 5 hard questions and five correct answers in each A–D position.

## 2026.8 Grade 7 visual pilot

`brain-heist-grade-7-core-2026-8@2026.8.0` contains 80 original multiple-choice questions:

- Grade 7 Mathematics: 20
- Grade 7 English: 20
- Grade 7 Integrated Science: 20
- Grade 7 Geography: 20

The package includes 24 original 640×360 SVG assets: six Mathematics diagrams, four English visual stimuli, eight Science diagrams and six Geography maps/charts. The visuals use the locked Brains Heist educational art system, content-addressed immutable filenames, SHA-256 receipts, reviewed source/licence metadata and answer-safe alt text. Each subject covers five governed curriculum objectives with four questions per objective.

The package targets `brain-heist-international@2026-8`. In the four Grade 7 scopes, inherited auto-classified objectives remain in history but become non-assessable; five curated objectives per subject become the governed targets. Difficulty and correct-answer positions retain the same reviewed balance as the Grade 6 pilot.

## 2026.10 Grade 5 lower-school pilot

`brain-heist-grade-5-core-2026-10@2026.10.0` contains 80 original multiple-choice questions:

- Grade 5 Mathematics: 20
- Grade 5 English: 20
- Grade 5 Integrated Science: 20
- Grade 5 Geography: 20

The package increases visual support to 32 original 640×360 SVG assets, eight per subject. It preserves the governed balance of five objectives and four questions per objective, 5 easy / 10 medium / 5 hard questions per subject, and five correct answers in every A–D position. Prompts use shorter sentences and concrete contexts while retaining explanations, curriculum mappings, immutable checksums, accessible descriptions and the full production QA gates.

Version `2026.9.0` remains reserved for the separate Grade 8 draft. The Grade 5 package therefore uses `2026.10.0` and targets the immutable `brain-heist-international@2026-10` curriculum snapshot.

## 2026.1.1 repair record

The repair migration creates five new immutable records for answer-key or option defects, copies their approved curriculum mappings, and retires the originals. It also records and retires the 96 reviewed exact duplicate rows without changing assignment snapshots, attempts or student answers. The temporary Grade 8 QA framework is retired after its eight school mappings are archived.
