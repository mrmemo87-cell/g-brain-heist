# Grade 8 visual core — release blueprint

This directory begins `brain-heist-grade-8-core-2026-9@2026.9.0` without making an incomplete package importable. A `manifest.json` must not be added until all 80 questions, 24 visual assets, the `2026-9` curriculum migration and every release gate below are complete.

## Locked release contract

- Curriculum: `brain-heist-international@2026-9`
- Grade: 8
- Language: English
- Questions: 80 multiple-choice items
- Allocation: 20 Mathematics, 20 English, 20 Integrated Science, 20 Geography
- Per subject: five objectives with four questions per objective
- Difficulty per subject: 5 easy, 10 medium, 5 hard
- Correct-answer positions per subject: 5 each in A, B, C and D
- Visuals: 24 original 640×360 SVGs using the Brains Heist Visual System
- Visual allocation: 6 Mathematics, 4 English, 8 Science, 6 Geography
- Asset directory: `public/question-assets/2026-9-0/`

## Governed objective matrix

| Subject | Objective code | Review focus |
| --- | --- | --- |
| Mathematics | `math8-number-rational` | rational numbers, powers and proportional reasoning |
| Mathematics | `math8-algebra-linear` | expressions, linear equations, sequences and graphs |
| Mathematics | `math8-geometry-transformations` | congruence, transformations, angle and measure reasoning |
| Mathematics | `math8-data-probability` | distributions, sampling and compound probability |
| Mathematics | `math8-rates-models` | rates, scale, units and multi-step mathematical models |
| English | `eng8-reading-analysis` | connected evidence, inference, viewpoint and comparison |
| English | `eng8-writers-methods` | language, structure and literary effects |
| English | `eng8-grammar-style` | deliberate sentence control, punctuation and cohesion |
| English | `eng8-argument-evidence` | claims, counterclaims, evidence and conclusions |
| English | `eng8-media-rhetoric` | audience, credibility, bias and multimodal persuasion |
| Science | `sci8-life-processes` | cells, body systems, reproduction and ecosystems |
| Science | `sci8-atoms-reactions` | atomic models, reactions, conservation and materials |
| Science | `sci8-forces-energy` | motion, forces, pressure, work and energy transfers |
| Science | `sci8-waves-electricity` | wave behaviour, light, sound and circuit relationships |
| Science | `sci8-scientific-enquiry` | variables, uncertainty, data analysis and evaluation |
| Geography | `geo8-map-fieldwork` | map interpretation, GIS thinking and representative fieldwork |
| Geography | `geo8-climate-ecosystems` | climate systems, biomes and human–environment interaction |
| Geography | `geo8-tectonics-hazards` | plate processes, hazard evidence, risk and resilience |
| Geography | `geo8-development-population` | population change, inequality, migration and development |
| Geography | `geo8-resources-sustainability` | resource security, trade-offs and sustainable decisions |

## Visual production slate

Mathematics (6): rational-number comparison; straight-line graph; equation balance model; transformation grid; sampling comparison; compound-probability tree.

English (4): paired-source evidence board; structure-and-effect timeline; formal argument plan; media-credibility comparison.

Integrated Science (8): organ-system interaction; ecosystem energy flow; atomic rearrangement; reaction-energy profile; force–motion graph; work-and-energy model; wave comparison; circuit measurement setup.

Geography (6): GIS-style layered map; climate-and-biome comparison; tectonic plate cross-section; hazard vulnerability map; development-indicator scatter plot; resource decision matrix.

Every asset must use answer-safe alt text, redundant labels or patterns where colour carries meaning, content-addressed filenames, source/licence metadata and SHA-256 receipts. No rasterized text, external image references, watermarks or generated-text artefacts are allowed.

## Release gates

1. Add the immutable `2026-9` curriculum snapshot and exactly 20 assessable Grade 8 objectives above.
2. Author and subject-review 80 original questions; run the cross-package normalized-prompt duplicate scan.
3. Produce and visually inspect all 24 SVGs at desktop and phone sizes.
4. Generate schema v2 package files and `manifest.json` only after content and asset review is complete.
5. Pass package validation, migration security, TypeScript, production build and the full test suite.
6. Merge and wait for a Ready production deployment; verify every asset response, MIME type and checksum.
7. Apply the migration, run a production dry-run, import atomically, then independently verify release, question, mapping, objective, asset and link counts.
