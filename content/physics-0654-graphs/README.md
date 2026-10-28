# 0654 Physics P1 graph questions (v1.0.0)

Status: **released 2026-10-28** (see `release-authorization.json`); all 12 questions are in the super admin AI recheck queue.

Original plan, kept for reference: Import only after this branch is
deployed, so the graph files exist at `https://www.brainsheist.com/question-assets/physics-0654-graphs-1-0-0/`.
Until then a question would show with its image hidden (`QuestView` hides
images that fail to load).

## What is here

- `build.mjs`: the single source. Graphs are defined as data, drawn to
  640×360 SVGs in the Brains Heist Visual System, and named by SHA-256 prefix.
  Numeric keys are recomputed from the same data; the build fails if a key,
  option set, A–D balance or asset link is wrong.
- `candidate-package.json`: registry MCQ package, **schema v2** (visual assets).
- `focus-proposal.json`, `focus-release.sql`: nine additive Evidence Focuses
  under `science.physics.motion-forces.motion` and `.forces`. Run before import.
- `public/question-assets/physics-0654-graphs-1-0-0/`: the five graphs.

Rebuild with `node content/physics-0654-graphs/build.mjs`. Changing a graph
changes its filename and checksum, and the image URL is part of the question
content hash, so a changed graph is a changed question.

## Content

12 original AI-drafted multiple-choice questions, all AO2 (graph reading):

| Graph | Questions | Syllabus points |
| --- | --- | --- |
| Distance–time, car | 001–003 | P1.2.5, P1.2.6, P1.2.2 (Core) |
| Speed–time, cyclist | 004–007 | P1.2.7 (Core); P1.2.11, P1.2.12 (Supplement) |
| Speed–time, runner (curve) | 008 | P1.2.10 (Supplement) |
| Distance–time, P/Q/R/S | 009–010 | P1.2.5 (Core) |
| Load–extension, spring | 011–012 | P1.5.1.9, P1.5.1.10 (Supplement) |

Syllabus numbers were read from the official 0654 2025–2027 syllabus text.
Correct answers sit 3 times each at A, B, C and D; numeric options are in
ascending order; every distractor is a named student mistake (see `build.mjs`).
Difficulty labels are editorial, not calibrated.

## Release

1. Merge and deploy this branch (migration `20261028073357_registry_mcq_visual_assets.sql`
   and the SVGs).
2. Confirm each `publicUrl` loads.
3. Run `focus-release.sql`, then import with
   `rpc_import_registry_verified_mcq_package(package, false)` using a non-`PENDING`
   authority that includes `AI-drafted`.
4. The questions then enter the super admin **AI recheck queue**: live for
   practice, excluded from student evidence until rechecked.
5. Map each question to its `curriculumObjectiveCode` (`p1-2` or `p1-5-1`) in the
   published `bh-cie-igcse-0654-physics` framework for grades 9–11.

A rolled-back production rehearsal on 2026-10-28 (migration, focus release,
dry-run and real import of a two-question subset) confirmed: images and
`visual_spec` stored, AI recheck flag set, image included in the content hash,
assessment profiles and taxonomy written, a tampered checksum rejected, and a
schema v1 package carrying visuals rejected.

## Known limits

- The 0654 profile validator only accepts syllabus references for P1, P2, P5
  and P6. P3 (Waves) and P4 (Electricity) questions need that validator widened
  first.
- Student views cap question images at 256 px high; graphs use 20 px labels so
  they stay readable at a 320 px phone width, but a tap-to-zoom view would help.
