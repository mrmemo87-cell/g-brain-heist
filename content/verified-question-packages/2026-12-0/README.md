# Grade 3 visual core — release blueprint

This directory begins `brain-heist-grade-3-core-2026-12@2026.12.0` without making an incomplete package importable. A `manifest.json` must not be added until all 80 questions, 40 visual assets, the `2026-12` curriculum migration and every release gate below are complete.

## Locked release contract

- Curriculum: `brain-heist-international@2026-12`
- Grade: 3
- Language: English
- Questions: 80 multiple-choice items
- Allocation: 20 Mathematics, 20 English, 20 Integrated Science, 20 Geography
- Per subject: five objectives with four questions per objective
- Difficulty per subject: 5 easy, 10 medium, 5 hard, interpreted at Grade 3 level
- Correct-answer positions per subject: 5 each in A, B, C and D
- Visuals: exactly 40 original 640×360 SVGs using the Brains Heist Visual System
- Visual allocation: 10 Mathematics, 10 English, 10 Science, 10 Geography
- Asset directory: `public/question-assets/2026-12-0/`
- Reading load: one concrete task per prompt, familiar words, short options and no avoidable multi-step reading
- Visual independence: every non-visual item must remain fully answerable without an image; every visual item must require meaningful inspection rather than decorative artwork

## Governed objective matrix

| Subject | Objective code | Review focus |
| --- | --- | --- |
| Mathematics | `math3-number-place-value` | read, represent, compare and order numbers; use place value and simple estimation |
| Mathematics | `math3-addition-subtraction` | mental and written addition or subtraction in short practical contexts |
| Mathematics | `math3-multiplication-division` | equal groups, arrays, facts, sharing and simple remainders |
| Mathematics | `math3-fractions-measure` | unit fractions, equal parts, length, mass, capacity, money and time |
| Mathematics | `math3-geometry-data-patterns` | shape properties, turns, tables, pictograms and number or shape patterns |
| English | `eng3-reading-retrieval-sequence` | retrieve explicit details, order events and connect nearby picture or text clues |
| English | `eng3-vocabulary-context` | infer familiar word meanings and choose precise everyday vocabulary from context |
| English | `eng3-grammar-punctuation` | sentence boundaries, capitals, agreement, tense, conjunctions and speech marks |
| English | `eng3-writing-sentences` | order and combine ideas into clear sentences and short coherent paragraphs |
| English | `eng3-purpose-information` | identify purpose and use headings, labels, notices and simple fact-file features |
| Integrated Science | `sci3-living-things-habitats` | needs of living things, plant parts, life cycles, habitats and simple food links |
| Integrated Science | `sci3-materials-properties` | observe, group and select materials using visible or testable properties |
| Integrated Science | `sci3-forces-magnets` | pushes, pulls, motion, surfaces and simple magnetic attraction |
| Integrated Science | `sci3-light-sound` | light sources, shadows, reflection, vibration and changes in sound |
| Integrated Science | `sci3-enquiry-observation` | ask testable questions, make careful observations, read results and choose conclusions |
| Geography | `geo3-maps-local-place` | map keys, simple grids, compass directions, routes and familiar local features |
| Geography | `geo3-weather-seasons` | weather symbols and instruments, daily records and seasonal patterns |
| Geography | `geo3-landforms-water` | hills, valleys, rivers, coasts and the movement or use of water |
| Geography | `geo3-settlements-journeys` | settlement features, services, transport and reasons for everyday journeys |
| Geography | `geo3-resources-environment` | local resources, waste choices, observation evidence and care for places |

## Visual production slate

Mathematics (10): base-ten place-value board; marked number line; addition partition model; equal-groups array; sharing tray; unit-fraction strip; ruler reading; analogue clock; shape-property cards; pictogram and pattern board.

English (10): three-frame event sequence; setting-detail scene; character-clue panel; context-word card; punctuation repair board; sentence-order tiles; conjunction bridge; instruction sequence; child-friendly notice; labelled animal fact file.

Integrated Science (10): local habitat scene; flowering-plant parts; butterfly life cycle; material-property sort; absorbency comparison; magnet prediction board; toy-car surface test; shadow-position model; vibrating-string model; observation results chart.

Geography (10): neighbourhood map key; compass route; simple letter-number grid; weather-symbol diary; rain-gauge chart; seasonal clothing-and-tree comparison; labelled landform profile; river journey; settlement service map; reuse-and-waste sorting board.

Every asset must use a single instructional focal point, large geometry and restrained labelling. Diagrams use shape, line style, pattern or symbols as well as colour; map questions include an explicit key; charts state units; clocks and rulers retain readable marks at a 320-pixel viewport. No asset may highlight the correct option, encode the answer in its filename, title or alt text, or contain unreviewed generated text.

## Professional asset contract

Each SVG must be standalone and immutable, with its SHA-256 prefix in the filename. The package records question ID, package version, source file, public path, checksum, MIME type, 640×360 dimensions, answer-safe alt text, Brains Heist source and licence metadata. Visual review covers desktop, 320-pixel mobile, 200% zoom, greyscale, high contrast, label clipping, accidental watermarks and correspondence between the artwork, prompt, options and keyed answer.

## Release gates

1. Add the immutable `2026-12` curriculum snapshot and exactly 20 assessable Grade 3 objectives above.
2. Author and subject-review 80 original questions; reject copied Grade 4 wording and manually review high-similarity concept pairs.
3. Enforce the four-subject, five-objective, difficulty and answer-position matrices before visual production is locked.
4. Produce and inspect all 40 SVGs at desktop and phone sizes, including greyscale, zoom, answer-leakage and text-clipping checks.
5. Regenerate schema v2 package files and `manifest.json` only after content and asset review is complete.
6. Pass package validation, migration security, TypeScript, production build and the full test suite.
7. Merge and wait for a Ready production deployment; verify all 40 asset responses, MIME types and exact bytes.
8. Apply the migration, run a production dry-run, import atomically, repeat the import to prove idempotence, then independently verify release, question, mapping, objective, asset and link counts.
