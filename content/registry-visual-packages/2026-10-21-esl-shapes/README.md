# ESL shapes visual set, 21 October 2026

Registry package `esl-g7-shapes-visual-20261021@1.0.0` (content version `esl-g7-shapes-visual-v1`) adds 27 original picture-based multiple-choice questions to the topic **3D Shapes and Geometry Vocabulary** for Grades 7–8 ESL. It complements the 20 text-only items released in `esl-g7-shapes-conditionals-partitives-prepositions-20261021`.

| Group | Items | Evidence |
|---|---|---|
| Name the solid from a drawing | 10 | BH-AO1 understand, vocabulary precision |
| Name a labelled solid among four | 3 | BH-AO1 understand |
| Name the solid an everyday object is shaped like | 4 | BH-AO1 understand |
| Face, edge and vertex | 3 | BH-AO1 remember |
| Which solid a net folds into | 4 | BH-AO2 apply |
| Flat (2D) versus solid (3D) | 3 | BH-AO3 analyze, lexical relationships |

## Assets

`build.py` deterministically generates every SVG into `public/question-assets/2026-10-21/` with a checksum-addressed filename, and writes `manifest.json` (asset path, SHA-256, answer-safe alt text and the question content). All artwork is original Brains Heist educational artwork in the locked 640×360 visual system: a `<title>`, no scripts, no event handlers, no embedded images and no external references. Hidden edges are dashed; amber marks the part a question asks about, so colour is never the only carrier of meaning.

## Release order

1. Merge and deploy the assets. Confirm each URL returns `image/svg+xml` with the exact SHA-256 in `manifest.json`.
2. Insert the questions in one transaction. The registry MCQ importer does not accept images, and `image_url` is part of the immutable content hash, so the insert mirrors the importer exactly (same column values, deterministic IDs from `registry-verified-question:<externalId>`, approved registry taxonomy) with `image_url` and `image_alt_text` set, and records a release receipt in `registry_verified_question_import_releases`.
3. Verify 27 active, verified, analytics-eligible questions whose `current_content_hash` equals `verified_content_hash`, each with an approved registry mapping.

## What was actually run (21 October 2026)

`apply_single.sql` is the statement that inserted the questions: one self-contained `DO` block that checks the md5 of a compact package, checks a per-field digest of the expanded package, runs the importer's dry run, then inserts. `rehearse_single.sql` is the same block ending in a deliberate exception, so it rolls back; it reported `REHEARSAL_OK questions=27 taxonomy=27`. The multi-statement `apply.sql`/`rehearse.sql` are equivalent but were not used. Before the insert, all 27 deployed SVGs returned HTTP 200 as `image/svg+xml`, with SHA-256 matching `manifest.json`.
