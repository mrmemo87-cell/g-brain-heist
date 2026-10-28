# 0654 Physics graph and circuit questions, set 2 (v1.0.0)

12 original AI-drafted AO2 questions with 5 visuals drawn from stored data,
built by `build.mjs` (run `node content/physics-0654-graphs-2/build.mjs`).
Same pipeline and importer as `content/physics-0654-graphs`; this set adds
circuit diagrams (`visualSpec.type = "diagram"`) using Cambridge symbols.

| Visual | Questions | Syllabus points |
| --- | --- | --- |
| Current–voltage graphs, resistors X and Y | 001–002 | P4.2.4.3 (Supplement) |
| Series circuit, 12 V, 4.0 Ω + 8.0 Ω | 003–004 | P4.3.2.3, P4.2.4.1 (Core) |
| Parallel circuit, 6.0 V, 3.0 Ω ∥ 6.0 Ω | 005–006 | P4.3.2.8, P4.3.2.7 (Supplement) |
| Displacement–distance graph of a wave | 007–009 | P3.1.3, P3.1.5 (Core) |
| Speed–time graph, train (non-zero start) | 010–012 | P1.2.7 (Core); P1.2.11, P1.2.12 (Supplement) |

Following the external review of set 1: unfamiliar scales (a speed–time graph
that starts at 10 m/s and runs to 120 s; a wave in centimetres needing
conversion to metres), multi-step items (circuit current from total
resistance; parallel supply current; wave speed from graph plus frequency).

Core/Supplement tiers follow the numbering in the official 0654 2025–2027
syllabus, where Core points are numbered before Supplement points in each
sub-topic. Correct answers sit 3 times each at A–D; numeric options ascend;
every distractor is a named student mistake. Difficulty is editorial.

## Release

Same as set 1: deploy the SVGs, run `focus-release.sql` (9 new Evidence
Focuses; three P1 focuses from set 1 are reused), import with
`rpc_import_registry_verified_mcq_package(package, false)` and an authority
containing `AI-drafted`, map each question to its `curriculumObjectiveCode`
(`p1-2`, `p3-1`, `p4-2-4`, `p4-3-2`) for grades 9–11. Questions then wait in
the super admin AI recheck queue.
