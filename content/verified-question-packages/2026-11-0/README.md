# Grade 4 visual core — release blueprint

This directory begins `brain-heist-grade-4-core-2026-11@2026.11.0` without making an incomplete package importable. A `manifest.json` must not be added until all 80 questions, 36 visual assets, the `2026-11` curriculum migration and every release gate below are complete.

## Locked release contract

- Curriculum: `brain-heist-international@2026-11`
- Grade: 4
- Language: English
- Questions: 80 multiple-choice items
- Allocation: 20 Mathematics, 20 English, 20 Integrated Science, 20 Geography
- Per subject: five objectives with four questions per objective
- Difficulty per subject: 5 easy, 10 medium, 5 hard, interpreted at Grade 4 level
- Correct-answer positions per subject: 5 each in A, B, C and D
- Visuals: 36 original 640×360 SVGs using the Brains Heist Visual System
- Visual allocation: 9 Mathematics, 9 English, 9 Science, 9 Geography
- Asset directory: `public/question-assets/2026-11-0/`
- Reading load: one direct task per prompt, concrete vocabulary and short answer options

## Governed objective matrix

| Subject | Objective code | Review focus |
| --- | --- | --- |
| Mathematics | `math4-number-place-value` | place value, comparison, addition, subtraction and estimation |
| Mathematics | `math4-multiplication-division` | equal groups, facts, remainders and practical sharing |
| Mathematics | `math4-fractions-decimals` | fraction models, equivalence, tenths and money contexts |
| Mathematics | `math4-geometry-measure` | shape properties, symmetry, angles, perimeter, time and units |
| Mathematics | `math4-data-patterns` | tables, charts, sequences and simple likelihood |
| English | `eng4-reading-retrieval-inference` | retrieve details and combine nearby clues for simple inference |
| English | `eng4-vocabulary-language` | context meaning, synonyms, imagery and precise word choice |
| English | `eng4-grammar-punctuation` | sentence agreement, tense, clauses, speech and punctuation |
| English | `eng4-writing-sequence` | sequence ideas, group details and choose openings or endings |
| English | `eng4-purpose-information` | audience, purpose, headings, notices and fact-file navigation |
| Science | `sci4-living-things-habitats` | classification, food chains, habitats and simple adaptations |
| Science | `sci4-materials-states` | properties, solids, liquids, gases and reversible changes |
| Science | `sci4-forces-magnets` | pushes, pulls, friction, gravity and magnetic interaction |
| Science | `sci4-light-sound-electricity` | shadows, reflection, vibration and complete simple circuits |
| Science | `sci4-enquiry-evidence` | fair comparisons, observation, tables, patterns and conclusions |
| Geography | `geo4-maps-place` | direction, keys, simple grids, routes and local scale |
| Geography | `geo4-weather-water` | weather instruments, seasons, rainfall and water-cycle stages |
| Geography | `geo4-landforms-environments` | rivers, coasts, mountains and contrasting environments |
| Geography | `geo4-settlements-connections` | settlement features, services, journeys and movement of goods |
| Geography | `geo4-resources-fieldwork` | resource choices, waste, observations and caring for places |

## Visual production slate

Mathematics (9): four-digit place-value frame; regrouping model; equal-groups array; sharing-with-remainder scene; fraction-wall comparison; money-and-decimal board; symmetry grid; perimeter route; pictogram and likelihood cards.

English (9): short story clue sequence; context-word spotlight; synonym strength ladder; speech-punctuation builder; tense timeline; sentence-joining cards; paragraph sequencing board; instruction strip; child-friendly notice and fact-file layout.

Integrated Science (9): animal-group key; habitat food chain; material-property test; three-state particle model; magnet prediction board; friction comparison; shadow setup; complete-circuit choice; fair-test results display.

Geography (9): compass route map; local map key; weather-instrument match; seasonal rainfall pictogram; labelled water-cycle model; river source-to-mouth sequence; settlement service map; goods journey flow; school waste and fieldwork chart.

The final slate must contain exactly 36 assets; one combined asset may support two closely related prompts only when both questions still have independent reasoning. Every diagram must remain readable at a 320-pixel phone width, use labels or patterns in addition to colour, and keep the keyed answer out of its title and alt text.

## Release gates

1. Add the immutable `2026-11` curriculum snapshot and exactly 20 assessable Grade 4 objectives above.
2. Author and subject-review 80 original questions; reject cross-grade prompt reuse and review high-similarity concept pairs manually.
3. Produce and inspect all 36 SVGs at desktop and phone sizes, including greyscale and high-zoom checks.
4. Generate schema v2 package files and `manifest.json` only after content and asset review is complete.
5. Pass package validation, migration security, TypeScript, production build and the full test suite.
6. Merge and wait for a Ready production deployment; verify every asset response, MIME type and checksum.
7. Apply the migration, run a production dry-run, import atomically, then independently verify release, question, mapping, objective, asset and link counts.
