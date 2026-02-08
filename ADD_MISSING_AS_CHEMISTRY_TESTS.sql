-- ============================================================================
-- ADD MISSING AS CHEMISTRY TESTS TO DATABASE
-- ============================================================================
-- This script adds the newly created AS Chemistry tests (Ch12-Ch18) to the 
-- cambridge_tests table so they appear in the teacher's visibility manager.

-- Insert the missing AS Chemistry tests
INSERT INTO cambridge_tests (id, name, description, duration, total_questions, difficulty, category, subject, test_url, requires_marking) VALUES
('as-chemistry-ch11-group-17-part-1', 'AS Chemistry Ch11 ( Group 17 ) (Part 1)', 'Chapter 11 part 1 practice on halogen trends, volatility, redox reactions, and halide tests.', '41 min', 41, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/group_17.html?part=1', false),
('as-chemistry-ch11-group-17-part-2', 'AS Chemistry Ch11 ( Group 17 ) (Part 2)', 'Chapter 11 part 2 practice on hydrogen halides, stability trends, and halogen displacement.', '40 min', 40, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/group_17.html?part=2', false),

('as-chemistry-ch12-nitrogen-sulfur-part-1', 'AS Chemistry Ch12 ( Nitrogen and sulfur ) (Part 1)', 'Chapter 12 part 1 - multiple-choice practice covering nitrogen oxides, ammonia, fertilisers, and atmospheric pollution.', '50 min', 25, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/nitrogen_sulfur.html?part=1', false),
('as-chemistry-ch12-nitrogen-sulfur-part-2', 'AS Chemistry Ch12 ( Nitrogen and sulfur ) (Part 2)', 'Chapter 12 part 2 - multiple-choice practice covering nitrogen oxides, ammonia, fertilisers, and atmospheric pollution.', '50 min', 25, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/nitrogen_sulfur.html?part=2', false),

('as-chemistry-ch13-introduction-as-level-organic-chemistry-part-1', 'AS Chemistry Ch13 ( An introduction to AS Level organic chemistry ) (Part 1)', 'Chapter 13 part 1 - multiple-choice practice on introductory organic chemistry structures, formulae, and bonding.', '76 min', 38, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/intro_as_level_organic_chemistry.html?part=1', false),
('as-chemistry-ch13-introduction-as-level-organic-chemistry-part-2', 'AS Chemistry Ch13 ( An introduction to AS Level organic chemistry ) (Part 2)', 'Chapter 13 part 2 - multiple-choice practice on reaction types, stereochemistry, and organic analysis fundamentals.', '76 min', 38, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/intro_as_level_organic_chemistry.html?part=2', false),

('as-chemistry-ch14-hydrocarbons-part-1', 'AS Chemistry Ch14 ( Hydrocarbons ) (Part 1)', 'Chapter 14 part 1 - multiple-choice practice on hydrocarbons, combustion, and free radical substitution basics.', '60 min', 30, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/hydrocarbons.html?part=1', false),
('as-chemistry-ch14-hydrocarbons-part-2', 'AS Chemistry Ch14 ( Hydrocarbons ) (Part 2)', 'Chapter 14 part 2 - multiple-choice practice on catalytic converters, alkenes, and reaction mechanisms.', '60 min', 30, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/hydrocarbons.html?part=2', false),

('as-chemistry-ch15-halogen-compounds-part-1', 'AS Chemistry Ch15 ( Halogen compounds ) (Part 1)', 'Chapter 15 part 1 - multiple-choice practice on halogenoalkanes, reaction rates, and nucleophilic substitution.', '56 min', 28, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/halogen_compounds.html?part=1', false),
('as-chemistry-ch15-halogen-compounds-part-2', 'AS Chemistry Ch15 ( Halogen compounds ) (Part 2)', 'Chapter 15 part 2 - multiple-choice practice on elimination, mechanisms, and halogen compound synthesis.', '56 min', 28, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/halogen_compounds.html?part=2', false),

('as-chemistry-ch16-hydroxy-compounds-part-1', 'AS Chemistry Ch16 ( Hydroxy compounds ) (Part 1)', 'Chapter 16 part 1 - multiple-choice practice on hydroxy compounds, oxidation, and alcohol reactions.', '88 min', 44, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/hydroxy_compounds.html?part=1', false),
('as-chemistry-ch16-hydroxy-compounds-part-2', 'AS Chemistry Ch16 ( Hydroxy compounds ) (Part 2)', 'Chapter 16 part 2 - multiple-choice practice on hydroxy compound synthesis, esterification, and reaction pathways.', '88 min', 44, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/hydroxy_compounds.html?part=2', false),

('as-chemistry-ch17-carbonyl-compounds-part-1', 'AS Chemistry Ch17 ( Carbonyl compounds ) (Part 1)', 'Chapter 17 part 1 - multiple-choice practice on aldehydes, ketones, carbonyl tests, and nucleophilic addition.', '65 min', 32, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/carbonyl_compounds.html?part=1', false),
('as-chemistry-ch17-carbonyl-compounds-part-2', 'AS Chemistry Ch17 ( Carbonyl compounds ) (Part 2)', 'Chapter 17 part 2 - multiple-choice practice on oxidation, carbonyl mechanisms, and analytical tests.', '62 min', 31, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/carbonyl_compounds.html?part=2', false),

('as-chemistry-ch18-carboxylic-acids-derivatives-part-1', 'AS Chemistry Ch18 ( Carboxylic acids and derivatives ) (Part 1)', 'Chapter 18 part 1 - multiple-choice practice on carboxylic acid properties, derivatives, and reactions.', '82 min', 41, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/carboxylic_acids_derivatives.html?part=1', false),
('as-chemistry-ch18-carboxylic-acids-derivatives-part-2', 'AS Chemistry Ch18 ( Carboxylic acids and derivatives ) (Part 2)', 'Chapter 18 part 2 - multiple-choice practice on carboxylic acid properties, derivatives, and reactions.', '82 min', 41, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/carboxylic_acids_derivatives.html?part=2', false),

('as-chemistry-ch19-nitrogen-compounds-part-1', 'AS Chemistry Ch19 ( Nitrogen compounds ) (Part 1)', 'Chapter 19 part 1 - multiple-choice practice on nitrogen compounds, nitriles, and reaction pathways.', '6 min', 3, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/nitrogen_compounds.html?part=1', false),
('as-chemistry-ch19-nitrogen-compounds-part-2', 'AS Chemistry Ch19 ( Nitrogen compounds ) (Part 2)', 'Chapter 19 part 2 - multiple-choice practice on nitrogen compounds, nitriles, and reaction pathways.', '6 min', 3, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/nitrogen_compounds.html?part=2', false),

('as-chemistry-ch20-polymerisation-part-1', 'AS Chemistry Ch20 ( Polymerisation ) (Part 1)', 'Chapter 20 part 1 - multiple-choice practice covering addition polymers, PVC properties, and monomer identification.', '16 min', 8, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/polymerisation.html?part=1', false),
('as-chemistry-ch20-polymerisation-part-2', 'AS Chemistry Ch20 ( Polymerisation ) (Part 2)', 'Chapter 20 part 2 - multiple-choice practice covering polymer structures, combustion, and disposal considerations.', '16 min', 8, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/polymerisation.html?part=2', false),

('as-chemistry-ch21-analytical-techniques-part-1', 'AS Chemistry Ch21 ( Analytical techniques ) (Part 1)', 'Chapter 21 part 1 - multiple-choice practice covering infrared spectroscopy, mass spectrometry, and analytical interpretation.', '35 min', 17, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/analytical_techniques.html?part=1', false),
('as-chemistry-ch21-analytical-techniques-part-2', 'AS Chemistry Ch21 ( Analytical techniques ) (Part 2)', 'Chapter 21 part 2 - multiple-choice practice covering infrared spectroscopy, mass spectrometry, and analytical interpretation.', '35 min', 17, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/analytical_techniques.html?part=2', false)
ON CONFLICT (id) DO NOTHING;

-- Verify the tests were added
SELECT COUNT(*) as total_tests FROM cambridge_tests WHERE subject = 'Chemistry' AND id LIKE 'as-chemistry%';
SELECT id, name FROM cambridge_tests WHERE subject = 'Chemistry' AND id LIKE 'as-chemistry%' ORDER BY id;
