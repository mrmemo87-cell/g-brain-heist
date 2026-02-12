-- ============================================================
-- ADMISSION HUB — Import Mathematics Stage 9 Question Pool
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql (tables must exist)
-- This loads the 96 questions from math_stage9_pool.json
-- into adm_question_pools + adm_questions.
--
-- NOTE: This creates a GLOBAL pool (school_id = NULL) so all
-- schools can use it. Change school_id if you want school-specific.
-- ============================================================

-- Step 1: Create the pool
INSERT INTO adm_question_pools (id, school_id, subject, stage, grade_level, name, description, is_active)
VALUES (
    '00000000-0000-0000-0000-e09119000003'::uuid,
    NULL,  -- global pool
    'math',
    9,
    8,  -- Grade 8 ≈ Stage 9
    'Mathematics Stage 9 — Admission Assessment',
    'Original questions aligned to Lower Secondary maths curriculum. 96 questions across number, algebra, geometry, statistics, and probability. Types: mcq, gap_fill, short_answer, structured.',
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Step 2: Insert all 96 questions
DO $$
DECLARE
    v_pool_id UUID := '00000000-0000-0000-0000-e09119000003'::uuid;
BEGIN

-- ════════════════════════════════════
-- MCQ — 62 questions (MS9-001 to MS9-062)
-- ════════════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
-- integers_and_powers
(v_pool_id, 'mcq', 'What is the value of 2⁵?', '["10","25","32","64"]', '"32"', 2, 1, 'easy', 'knowledge', 'integers_and_powers', 'math_number', '2⁵ = 2 × 2 × 2 × 2 × 2 = 32.', 'published'),
(v_pool_id, 'mcq', 'Evaluate (−3)³.', '["−27","27","−9","9"]', '"−27"', 0, 1, 'easy', 'knowledge', 'integers_and_powers', 'math_number', '(−3)³ = (−3) × (−3) × (−3) = 9 × (−3) = −27. An odd power of a negative number is negative.', 'published'),
(v_pool_id, 'mcq', 'Simplify 3⁴ ÷ 3².', '["3","9","27","81"]', '"9"', 1, 1, 'medium', 'application', 'integers_and_powers', 'math_number', 'When dividing powers with the same base, subtract the exponents: 3⁴ ÷ 3² = 3² = 9.', 'published'),
(v_pool_id, 'mcq', 'Which of these is equal to 10⁰?', '["0","1","10","100"]', '"1"', 1, 1, 'medium', 'application', 'integers_and_powers', 'math_number', 'Any non-zero number raised to the power 0 equals 1.', 'published'),
(v_pool_id, 'mcq', 'Simplify (2³ × 2⁴) ÷ 2⁵.', '["2","4","8","16"]', '"4"', 1, 1, 'hard', 'reasoning', 'integers_and_powers', 'math_number', '(2³ × 2⁴) ÷ 2⁵ = 2⁷ ÷ 2⁵ = 2² = 4.', 'published'),
-- expressions_and_formulae
(v_pool_id, 'mcq', 'Simplify 3a + 5a − 2a.', '["6a","8a","10a","a"]', '"6a"', 0, 1, 'easy', 'knowledge', 'expressions_and_formulae', 'math_algebra', 'Combine like terms: 3a + 5a − 2a = (3 + 5 − 2)a = 6a.', 'published'),
(v_pool_id, 'mcq', 'Expand 4(2x + 3).', '["8x + 3","8x + 12","6x + 12","8x + 7"]', '"8x + 12"', 1, 1, 'easy', 'application', 'expressions_and_formulae', 'math_algebra', 'Multiply each term inside the bracket by 4: 4 × 2x + 4 × 3 = 8x + 12.', 'published'),
(v_pool_id, 'mcq', 'Factorise completely 6x² + 9x.', '["3(2x² + 3x)","3x(2x + 3)","x(6x + 9)","6x(x + 9)"]', '"3x(2x + 3)"', 1, 1, 'medium', 'application', 'expressions_and_formulae', 'math_algebra', 'The HCF of 6x² and 9x is 3x. Factoring: 3x(2x + 3).', 'published'),
(v_pool_id, 'mcq', 'Given P = 2(l + w), find P when l = 12 and w = 5.', '["29","34","60","120"]', '"34"', 1, 1, 'medium', 'application', 'expressions_and_formulae', 'math_algebra', 'P = 2(12 + 5) = 2 × 17 = 34.', 'published'),
(v_pool_id, 'mcq', 'Expand and simplify (x + 3)(x − 2).', '["x² + x − 6","x² − x − 6","x² + 5x − 6","x² + x + 6"]', '"x² + x − 6"', 0, 1, 'hard', 'reasoning', 'expressions_and_formulae', 'math_algebra', '(x + 3)(x − 2) = x² − 2x + 3x − 6 = x² + x − 6.', 'published'),
-- place_value_and_rounding
(v_pool_id, 'mcq', 'Round 5.6749 to 2 decimal places.', '["5.67","5.68","5.7","5.674"]', '"5.67"', 0, 1, 'easy', 'knowledge', 'place_value_and_rounding', 'math_number', 'The digit in the 3rd decimal place is 4 (< 5), so round down to 5.67.', 'published'),
(v_pool_id, 'mcq', 'Write 45 000 in standard form.', '["4.5 × 10³","4.5 × 10⁴","45 × 10³","0.45 × 10⁵"]', '"4.5 × 10⁴"', 1, 1, 'easy', 'knowledge', 'place_value_and_rounding', 'math_number', '45 000 = 4.5 × 10 000 = 4.5 × 10⁴.', 'published'),
(v_pool_id, 'mcq', 'A rope is 3.45 m long, correct to the nearest centimetre. What is the minimum possible length?', '["3.445 m","3.449 m","3.44 m","3.4 m"]', '"3.445 m"', 0, 1, 'medium', 'application', 'place_value_and_rounding', 'math_number', 'Correct to nearest 0.01 m means ± 0.005 m. Minimum = 3.45 − 0.005 = 3.445 m.', 'published'),
-- fractions_decimals_percentages
(v_pool_id, 'mcq', 'Convert ³⁄₈ to a decimal.', '["0.35","0.375","0.38","0.83"]', '"0.375"', 1, 1, 'easy', 'knowledge', 'fractions_decimals_percentages', 'math_number', '3 ÷ 8 = 0.375.', 'published'),
(v_pool_id, 'mcq', 'Find 15% of 240.', '["24","30","36","48"]', '"36"', 2, 1, 'easy', 'application', 'fractions_decimals_percentages', 'math_number', '15% of 240 = 0.15 × 240 = 36.', 'published'),
(v_pool_id, 'mcq', 'A shirt costs $80. In a sale, it is reduced by 30%. What is the sale price?', '["$24","$50","$56","$60"]', '"$56"', 2, 1, 'medium', 'application', 'fractions_decimals_percentages', 'math_number', 'Discount = 30% of $80 = $24. Sale price = $80 − $24 = $56.', 'published'),
(v_pool_id, 'mcq', 'A population grows from 2000 to 2500. What is the percentage increase?', '["20%","25%","50%","125%"]', '"25%"', 1, 1, 'medium', 'application', 'fractions_decimals_percentages', 'math_number', 'Increase = 500. Percentage increase = (500 / 2000) × 100 = 25%.', 'published'),
(v_pool_id, 'mcq', 'After a 20% increase, a price is $60. What was the original price?', '["$48","$50","$52","$72"]', '"$50"', 1, 1, 'hard', 'reasoning', 'fractions_decimals_percentages', 'math_number', 'Original × 1.20 = 60. Original = 60 ÷ 1.20 = $50.', 'published'),
-- equations_and_inequalities
(v_pool_id, 'mcq', 'Solve 3x + 7 = 22.', '["x = 3","x = 5","x = 7","x = 9.67"]', '"x = 5"', 1, 1, 'easy', 'application', 'equations_and_inequalities', 'math_algebra', '3x = 22 − 7 = 15, so x = 15 ÷ 3 = 5.', 'published'),
(v_pool_id, 'mcq', 'Solve 2(x − 4) = 10.', '["x = 3","x = 7","x = 9","x = 14"]', '"x = 9"', 2, 1, 'easy', 'application', 'equations_and_inequalities', 'math_algebra', '2(x − 4) = 10 → x − 4 = 5 → x = 9.', 'published'),
(v_pool_id, 'mcq', 'Solve 5x − 3 = 2x + 12.', '["x = 3","x = 5","x = 9","x = 15"]', '"x = 5"', 1, 1, 'medium', 'application', 'equations_and_inequalities', 'math_algebra', '5x − 2x = 12 + 3 → 3x = 15 → x = 5.', 'published'),
(v_pool_id, 'mcq', 'Which values of x satisfy 2x + 1 > 9?', '["x > 4","x > 5","x > 8","x < 4"]', '"x > 4"', 0, 1, 'medium', 'application', 'equations_and_inequalities', 'math_algebra', '2x + 1 > 9 → 2x > 8 → x > 4.', 'published'),
(v_pool_id, 'mcq', 'Solve simultaneously: x + y = 10 and 2x − y = 5.', '["x = 5, y = 5","x = 3, y = 7","x = 7, y = 3","x = 4, y = 6"]', '"x = 5, y = 5"', 0, 1, 'hard', 'reasoning', 'equations_and_inequalities', 'math_algebra', 'Adding: 3x = 15 → x = 5. Then y = 10 − 5 = 5.', 'published'),
-- angles_and_constructions
(v_pool_id, 'mcq', 'What is the sum of angles in a triangle?', '["90°","180°","270°","360°"]', '"180°"', 1, 1, 'easy', 'knowledge', 'angles_and_constructions', 'math_geometry', 'The angles in any triangle always add up to 180°.', 'published'),
(v_pool_id, 'mcq', 'Two angles of a triangle are 65° and 50°. Find the third angle.', '["55°","60°","65°","75°"]', '"65°"', 2, 1, 'easy', 'application', 'angles_and_constructions', 'math_geometry', 'Third angle = 180° − 65° − 50° = 65°.', 'published'),
(v_pool_id, 'mcq', 'Each interior angle of a regular polygon is 120°. How many sides does the polygon have?', '["4","5","6","8"]', '"6"', 2, 1, 'medium', 'application', 'angles_and_constructions', 'math_geometry', 'Exterior angle = 180° − 120° = 60°. Number of sides = 360° ÷ 60° = 6.', 'published'),
(v_pool_id, 'mcq', 'Lines AB and CD are parallel. A transversal crosses them making an angle of 72° with AB. What is the co-interior (same-side) angle at CD?', '["72°","108°","288°","18°"]', '"108°"', 1, 1, 'medium', 'application', 'angles_and_constructions', 'math_geometry', 'Co-interior angles add up to 180°. So the angle = 180° − 72° = 108°.', 'published'),
-- collecting_and_organising_data
(v_pool_id, 'mcq', 'Which type of data can only take particular values (e.g. shoe sizes)?', '["Continuous","Discrete","Qualitative","Grouped"]', '"Discrete"', 1, 1, 'easy', 'knowledge', 'collecting_and_organising_data', 'math_statistics', 'Discrete data takes specific, separate values and cannot be split further.', 'published'),
(v_pool_id, 'mcq', 'A researcher wants to find out the favourite sport of 200 students. The best method is:', '["Experiment","Observation","Questionnaire","Census"]', '"Questionnaire"', 2, 1, 'easy', 'knowledge', 'collecting_and_organising_data', 'math_statistics', 'A questionnaire is the most efficient way to collect categorical opinion data from a large group.', 'published'),
(v_pool_id, 'mcq', 'The frequency table shows test scores: 5(×3), 6(×5), 7(×8), 8(×4). What is the modal score?', '["5","6","7","8"]', '"7"', 2, 1, 'medium', 'application', 'collecting_and_organising_data', 'math_statistics', 'The mode is the value with the highest frequency. Score 7 appears 8 times.', 'published'),
-- fractions_and_standard_form
(v_pool_id, 'mcq', 'Calculate ²⁄₅ + ¹⁄₃.', '["³⁄₈","⁷⁄₁₅","¹¹⁄₁₅","³⁄₅"]', '"¹¹⁄₁₅"', 2, 1, 'easy', 'application', 'fractions_and_standard_form', 'math_number', 'Common denominator = 15. ²⁄₅ = ⁶⁄₁₅, ¹⁄₃ = ⁵⁄₁₅. Sum = ¹¹⁄₁₅.', 'published'),
(v_pool_id, 'mcq', 'Calculate (3 × 10⁴) × (2 × 10³) and give your answer in standard form.', '["6 × 10⁷","6 × 10¹²","5 × 10⁷","6 × 10⁸"]', '"6 × 10⁷"', 0, 1, 'medium', 'application', 'fractions_and_standard_form', 'math_number', 'Multiply coefficients: 3 × 2 = 6. Add powers: 10⁴ × 10³ = 10⁷. Answer: 6 × 10⁷.', 'published'),
-- sequences
(v_pool_id, 'mcq', 'What is the next term in the sequence 3, 7, 11, 15, …?', '["17","18","19","21"]', '"19"', 2, 1, 'easy', 'knowledge', 'sequences', 'math_algebra', 'Common difference = 4. Next term = 15 + 4 = 19.', 'published'),
(v_pool_id, 'mcq', 'The nth term of a sequence is 4n − 1. What is the 20th term?', '["19","39","79","81"]', '"79"', 2, 1, 'medium', 'application', 'sequences', 'math_algebra', 'Substitute n = 20: 4(20) − 1 = 80 − 1 = 79.', 'published'),
(v_pool_id, 'mcq', 'A sequence starts 5, 8, 11, 14, … Find the nth term formula.', '["3n + 5","3n + 2","n + 3","5n − 3"]', '"3n + 2"', 1, 1, 'medium', 'reasoning', 'sequences', 'math_algebra', 'Common difference d = 3. First term = 5 = 3(1) + 2. So nth term = 3n + 2.', 'published'),
(v_pool_id, 'mcq', 'The nth term of a sequence is n² + 1. Which term has value 50?', '["5th","6th","7th","8th"]', '"7th"', 2, 1, 'hard', 'reasoning', 'sequences', 'math_algebra', 'n² + 1 = 50 → n² = 49 → n = 7.', 'published'),
-- functions_and_graphs
(v_pool_id, 'mcq', 'What is the gradient of the line y = 3x − 5?', '["−5","3","−3","5"]', '"3"', 1, 1, 'easy', 'knowledge', 'functions_and_graphs', 'math_algebra', 'In y = mx + c, the gradient m = 3.', 'published'),
(v_pool_id, 'mcq', 'Where does the line y = 2x + 7 cross the y-axis?', '["(0, 2)","(0, 7)","(7, 0)","(2, 7)"]', '"(0, 7)"', 1, 1, 'easy', 'knowledge', 'functions_and_graphs', 'math_algebra', 'The y-intercept is the constant c = 7, so the line crosses at (0, 7).', 'published'),
(v_pool_id, 'mcq', 'A line passes through (0, 1) and (3, 7). What is its equation?', '["y = 2x + 1","y = 3x + 1","y = 2x + 3","y = x + 1"]', '"y = 2x + 1"', 0, 1, 'medium', 'application', 'functions_and_graphs', 'math_algebra', 'Gradient = (7 − 1) / (3 − 0) = 6/3 = 2. y-intercept = 1. Equation: y = 2x + 1.', 'published'),
(v_pool_id, 'mcq', 'Two lines are y = 3x + 2 and y = 3x − 4. Which statement is true?', '["They are perpendicular","They intersect at (0, 2)","They are parallel","They are the same line"]', '"They are parallel"', 2, 1, 'hard', 'reasoning', 'functions_and_graphs', 'math_algebra', 'Both lines have gradient 3. Lines with equal gradients but different y-intercepts are parallel.', 'published'),
-- area_and_perimeter
(v_pool_id, 'mcq', 'Find the area of a triangle with base 12 cm and height 8 cm.', '["20 cm²","48 cm²","96 cm²","40 cm²"]', '"48 cm²"', 1, 1, 'easy', 'application', 'area_and_perimeter', 'math_geometry', 'Area = ½ × base × height = ½ × 12 × 8 = 48 cm².', 'published'),
(v_pool_id, 'mcq', 'Find the circumference of a circle with radius 7 cm. (Use π ≈ 3.14)', '["21.98 cm","43.96 cm","153.86 cm","14 cm"]', '"43.96 cm"', 1, 1, 'easy', 'application', 'area_and_perimeter', 'math_geometry', 'Circumference = 2πr = 2 × 3.14 × 7 = 43.96 cm.', 'published'),
(v_pool_id, 'mcq', 'A trapezium has parallel sides of 8 cm and 12 cm, and a height of 5 cm. Find its area.', '["40 cm²","50 cm²","60 cm²","100 cm²"]', '"50 cm²"', 1, 1, 'medium', 'application', 'area_and_perimeter', 'math_geometry', 'Area = ½(a + b)h = ½(8 + 12)(5) = ½ × 20 × 5 = 50 cm².', 'published'),
(v_pool_id, 'mcq', 'A semicircle has diameter 10 cm. Find its area. (Use π ≈ 3.14)', '["15.7 cm²","39.25 cm²","78.5 cm²","31.4 cm²"]', '"39.25 cm²"', 1, 1, 'hard', 'reasoning', 'area_and_perimeter', 'math_geometry', 'Radius = 5. Area of semicircle = ½πr² = ½ × 3.14 × 25 = 39.25 cm².', 'published'),
-- interpreting_data
(v_pool_id, 'mcq', 'Which average is found by arranging values in order and selecting the middle value?', '["Mean","Median","Mode","Range"]', '"Median"', 1, 1, 'easy', 'knowledge', 'interpreting_data', 'math_statistics', 'The median is the middle value when data is ordered.', 'published'),
(v_pool_id, 'mcq', 'Find the mean of: 4, 7, 9, 12, 8.', '["7","8","9","10"]', '"8"', 1, 1, 'easy', 'application', 'interpreting_data', 'math_statistics', 'Mean = (4 + 7 + 9 + 12 + 8) ÷ 5 = 40 ÷ 5 = 8.', 'published'),
(v_pool_id, 'mcq', 'The mean of 5 numbers is 12. Four of the numbers are 10, 14, 11, 15. Find the fifth number.', '["8","10","12","14"]', '"10"', 1, 1, 'medium', 'application', 'interpreting_data', 'math_statistics', 'Total = 5 × 12 = 60. Sum of four = 50. Fifth number = 60 − 50 = 10.', 'published'),
(v_pool_id, 'mcq', 'A pie chart shows ''Football'' as a sector of 90°. What percentage chose football?', '["20%","25%","30%","90%"]', '"25%"', 1, 1, 'medium', 'reasoning', 'interpreting_data', 'math_statistics', 'Percentage = (90 / 360) × 100 = 25%.', 'published'),
-- ratio_and_proportion
(v_pool_id, 'mcq', 'Share $120 in the ratio 3 : 5.', '["$36 and $84","$45 and $75","$40 and $80","$30 and $90"]', '"$45 and $75"', 1, 1, 'easy', 'application', 'ratio_and_proportion', 'math_number', 'Total parts = 8. Each part = $15. Shares: 3 × 15 = $45, 5 × 15 = $75.', 'published'),
(v_pool_id, 'mcq', 'Simplify the ratio 24 : 36.', '["2 : 3","3 : 4","4 : 6","12 : 18"]', '"2 : 3"', 0, 1, 'easy', 'application', 'ratio_and_proportion', 'math_number', 'HCF of 24 and 36 is 12. 24 ÷ 12 : 36 ÷ 12 = 2 : 3.', 'published'),
(v_pool_id, 'mcq', 'A recipe for 4 people needs 300 g of flour. How much flour is needed for 10 people?', '["600 g","700 g","750 g","1200 g"]', '"750 g"', 2, 1, 'medium', 'application', 'ratio_and_proportion', 'math_number', 'Scale factor = 10/4 = 2.5. Flour = 300 × 2.5 = 750 g.', 'published'),
(v_pool_id, 'mcq', 'The ratio of boys to girls in a class is 3 : 4. There are 12 boys. If 3 more boys join, what is the new ratio?', '["15 : 16","5 : 4","3 : 5","15 : 4"]', '"15 : 16"', 0, 1, 'hard', 'reasoning', 'ratio_and_proportion', 'math_number', 'Girls = (4/3) × 12 = 16. New boys = 15. Ratio = 15 : 16.', 'published'),
-- probability
(v_pool_id, 'mcq', 'A fair die is rolled. What is the probability of getting a number greater than 4?', '["¹⁄₆","²⁄₆","⁴⁄₆","⁵⁄₆"]', '"²⁄₆"', 1, 1, 'easy', 'knowledge', 'probability', 'math_statistics', 'Numbers greater than 4 are 5 and 6, so P = 2/6 = 1/3.', 'published'),
(v_pool_id, 'mcq', 'A bag contains 3 red, 5 blue, and 2 green balls. What is the probability of picking a blue ball?', '["³⁄₁₀","⁵⁄₁₀","²⁄₁₀","⁵⁄₈"]', '"⁵⁄₁₀"', 1, 1, 'easy', 'knowledge', 'probability', 'math_statistics', 'Total balls = 10. P(blue) = 5/10 = 1/2.', 'published'),
(v_pool_id, 'mcq', 'The probability of rain tomorrow is 0.3. What is the probability it does NOT rain?', '["0.3","0.7","1.3","0.03"]', '"0.7"', 1, 1, 'medium', 'application', 'probability', 'math_statistics', 'P(not rain) = 1 − P(rain) = 1 − 0.3 = 0.7.', 'published'),
-- symmetry_and_transformations
(v_pool_id, 'mcq', 'How many lines of symmetry does a regular hexagon have?', '["2","3","4","6"]', '"6"', 3, 1, 'easy', 'knowledge', 'symmetry_and_transformations', 'math_geometry', 'A regular hexagon has 6 lines of symmetry.', 'published'),
(v_pool_id, 'mcq', 'A shape is rotated 90° clockwise about the origin. The point (2, 5) maps to:', '["(5, −2)","(−5, 2)","(−2, −5)","(5, 2)"]', '"(5, −2)"', 0, 1, 'medium', 'application', 'symmetry_and_transformations', 'math_geometry', 'For a 90° clockwise rotation about the origin: (x, y) → (y, −x). So (2, 5) → (5, −2).', 'published'),
(v_pool_id, 'mcq', 'A shape is reflected in the line y = x. The point (3, 1) maps to:', '["(1, 3)","(−3, −1)","(3, −1)","(−1, 3)"]', '"(1, 3)"', 0, 1, 'medium', 'application', 'symmetry_and_transformations', 'math_geometry', 'Reflection in y = x swaps the coordinates: (3, 1) → (1, 3).', 'published'),
-- 3d_shapes
(v_pool_id, 'mcq', 'How many faces does a triangular prism have?', '["3","4","5","6"]', '"5"', 2, 1, 'easy', 'knowledge', '3d_shapes', 'math_geometry', 'A triangular prism has 2 triangular faces + 3 rectangular faces = 5 faces.', 'published'),
(v_pool_id, 'mcq', 'Find the volume of a cuboid with length 8 cm, width 5 cm, and height 3 cm.', '["16 cm³","80 cm³","120 cm³","240 cm³"]', '"120 cm³"', 2, 1, 'medium', 'application', '3d_shapes', 'math_geometry', 'Volume = l × w × h = 8 × 5 × 3 = 120 cm³.', 'published'),
(v_pool_id, 'mcq', 'Find the surface area of a cube with side length 4 cm.', '["16 cm²","64 cm²","96 cm²","128 cm²"]', '"96 cm²"', 2, 1, 'medium', 'application', '3d_shapes', 'math_geometry', 'Surface area = 6 × 4² = 6 × 16 = 96 cm².', 'published'),
(v_pool_id, 'mcq', 'A cylinder has radius 5 cm and height 10 cm. Find its volume. (Use π ≈ 3.14)', '["157 cm³","314 cm³","785 cm³","1570 cm³"]', '"785 cm³"', 2, 1, 'hard', 'reasoning', '3d_shapes', 'math_geometry', 'V = πr²h = 3.14 × 25 × 10 = 785 cm³.', 'published');

-- ════════════════════════════════════
-- GAP FILL — 20 questions (MS9-063 to MS9-082)
-- ════════════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'gap_fill', 'The square root of 144 is ______.', '"12"', 1, 'easy', 'knowledge', 'integers_and_powers', 'math_number', '√144 = 12 because 12 × 12 = 144.', 'published'),
(v_pool_id, 'gap_fill', 'The cube root of 27 is ______.', '"3"', 1, 'easy', 'knowledge', 'integers_and_powers', 'math_number', '∛27 = 3 because 3 × 3 × 3 = 27.', 'published'),
(v_pool_id, 'gap_fill', 'If x = 4, the value of 3x² − 5 is ______.', '"43"', 1, 'easy', 'application', 'expressions_and_formulae', 'math_algebra', '3(4)² − 5 = 3 × 16 − 5 = 48 − 5 = 43.', 'published'),
(v_pool_id, 'gap_fill', 'Simplify 4a²b × 3ab³ = ______.', '"12a³b⁴"', 1, 'medium', 'application', 'expressions_and_formulae', 'math_algebra', 'Multiply coefficients: 4 × 3 = 12. Add powers: a² × a = a³, b × b³ = b⁴.', 'published'),
(v_pool_id, 'gap_fill', 'If 4x = 28, then x = ______.', '"7"', 1, 'easy', 'application', 'equations_and_inequalities', 'math_algebra', 'x = 28 ÷ 4 = 7.', 'published'),
(v_pool_id, 'gap_fill', 'Solve: 3(x − 2) = 2x + 7. x = ______.', '"13"', 1, 'medium', 'application', 'equations_and_inequalities', 'math_algebra', '3x − 6 = 2x + 7 → x = 13.', 'published'),
(v_pool_id, 'gap_fill', '0.6 as a fraction in simplest form is ______.', '"3/5"', 1, 'easy', 'knowledge', 'fractions_decimals_percentages', 'math_number', '0.6 = 6/10 = 3/5.', 'published'),
(v_pool_id, 'gap_fill', 'A jacket costs $80 before tax. After 12.5% tax, the total price is $______.', '"90"', 1, 'medium', 'application', 'fractions_decimals_percentages', 'math_number', 'Tax = 12.5% of 80 = $10. Total = 80 + 10 = $90.', 'published'),
(v_pool_id, 'gap_fill', 'The nth term of a sequence is 2n + 5. The 15th term is ______.', '"35"', 1, 'medium', 'application', 'sequences', 'math_algebra', '2(15) + 5 = 30 + 5 = 35.', 'published'),
(v_pool_id, 'gap_fill', 'The first term of a geometric sequence is 3 and the common ratio is 2. The 5th term is ______.', '"48"', 1, 'hard', 'reasoning', 'sequences', 'math_algebra', '5th term = 3 × 2⁴ = 3 × 16 = 48.', 'published'),
(v_pool_id, 'gap_fill', 'The gradient of the line passing through (1, 3) and (4, 9) is ______.', '"2"', 1, 'medium', 'application', 'functions_and_graphs', 'math_algebra', 'Gradient = (9 − 3) / (4 − 1) = 6/3 = 2.', 'published'),
(v_pool_id, 'gap_fill', 'The sum of interior angles of a pentagon is ______ degrees.', '"540"', 1, 'medium', 'application', 'angles_and_constructions', 'math_geometry', '(5 − 2) × 180 = 3 × 180 = 540°.', 'published'),
(v_pool_id, 'gap_fill', 'The area of a circle with radius 10 cm is ______ cm². (Use π ≈ 3.14)', '"314"', 1, 'medium', 'application', 'area_and_perimeter', 'math_geometry', 'A = πr² = 3.14 × 100 = 314 cm².', 'published'),
(v_pool_id, 'gap_fill', 'A parallelogram has base 15 cm and area 90 cm². Its perpendicular height is ______ cm.', '"6"', 1, 'hard', 'reasoning', 'area_and_perimeter', 'math_geometry', 'Area = base × height → 90 = 15 × h → h = 6.', 'published'),
(v_pool_id, 'gap_fill', 'If the ratio of cats to dogs is 5 : 3 and there are 40 cats, there are ______ dogs.', '"24"', 1, 'medium', 'application', 'ratio_and_proportion', 'math_number', 'Each part = 40 ÷ 5 = 8. Dogs = 3 × 8 = 24.', 'published'),
(v_pool_id, 'gap_fill', 'Two fair coins are flipped. The probability of getting two heads is ______. (Write as a fraction)', '"1/4"', 1, 'medium', 'application', 'probability', 'math_statistics', 'P(HH) = ½ × ½ = ¼.', 'published'),
(v_pool_id, 'gap_fill', 'The volume of a cube with side 6 cm is ______ cm³.', '"216"', 1, 'medium', 'application', '3d_shapes', 'math_geometry', 'V = 6³ = 216 cm³.', 'published'),
(v_pool_id, 'gap_fill', 'Find the range of: 3, 8, 15, 4, 10. The range is ______.', '"12"', 1, 'easy', 'application', 'interpreting_data', 'math_statistics', 'Range = 15 − 3 = 12.', 'published'),
(v_pool_id, 'gap_fill', 'The median of 2, 5, 9, 3, 7 is ______.', '"5"', 1, 'medium', 'application', 'interpreting_data', 'math_statistics', 'Ordered: 2, 3, 5, 7, 9. Middle value = 5.', 'published'),
(v_pool_id, 'gap_fill', 'Round 3456 to the nearest hundred: ______.', '"3500"', 1, 'easy', 'knowledge', 'place_value_and_rounding', 'math_number', 'The tens digit is 5, so round up: 3500.', 'published');

-- ════════════════════════════════════
-- SHORT ANSWER — 8 questions (MS9-083 to MS9-090)
-- ════════════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'short_answer', 'A map has a scale of 1 : 50 000. Two towns are 6 cm apart on the map. What is the real distance in kilometres?', '"3"', 2, 'medium', 'reasoning', 'ratio_and_proportion', 'math_number', 'Real distance = 6 × 50 000 = 300 000 cm = 3 000 m = 3 km.', 'published'),
(v_pool_id, 'short_answer', 'The sum of three consecutive integers is 72. What is the smallest of the three integers?', '"23"', 2, 'medium', 'application', 'equations_and_inequalities', 'math_algebra', 'Let the integers be n, n+1, n+2. 3n + 3 = 72 → 3n = 69 → n = 23.', 'published'),
(v_pool_id, 'short_answer', 'A car was bought for $12 000 and sold for $9 000. Express the loss as a percentage of the cost price.', '"25%"', 2, 'hard', 'reasoning', 'fractions_decimals_percentages', 'math_number', 'Loss = $3000. Percentage loss = (3000/12000) × 100 = 25%.', 'published'),
(v_pool_id, 'short_answer', 'A rectangular garden is 20 m long and 14 m wide. A path 2 m wide runs around the outside. Find the area of the path only, in m².', '"152"', 2, 'hard', 'reasoning', 'area_and_perimeter', 'math_geometry', 'Outer dimensions: 24 × 18 = 432 m². Inner: 20 × 14 = 280 m². Path area = 432 − 280 = 152 m².', 'published'),
(v_pool_id, 'short_answer', 'A spinner has 5 equal sections numbered 1 to 5. It is spun twice. What is the probability of getting a total of 6? (Write as a fraction)', '"1/5"', 2, 'medium', 'reasoning', 'probability', 'math_statistics', 'Outcomes totalling 6: (1,5), (2,4), (3,3), (4,2), (5,1) = 5 out of 25. P = 5/25 = 1/5.', 'published'),
(v_pool_id, 'short_answer', 'Find the coordinates of the point where the lines y = 2x + 1 and y = −x + 7 intersect.', '"(2, 5)"', 2, 'hard', 'reasoning', 'functions_and_graphs', 'math_algebra', 'Set equal: 2x + 1 = −x + 7 → 3x = 6 → x = 2. y = 2(2) + 1 = 5. Point: (2, 5).', 'published'),
(v_pool_id, 'short_answer', 'A cone has radius 3 cm and height 4 cm. Calculate its slant height using Pythagoras'' theorem.', '"5"', 2, 'hard', 'reasoning', '3d_shapes', 'math_geometry', 'Slant height = √(3² + 4²) = √(9 + 16) = √25 = 5 cm.', 'published'),
(v_pool_id, 'short_answer', 'A sequence has nth term 3n − 5. Find the first value of n for which the term exceeds 100.', '"36"', 2, 'hard', 'reasoning', 'sequences', 'math_algebra', '3n − 5 > 100 → 3n > 105 → n > 35. First integer n = 36.', 'published');

-- ════════════════════════════════════
-- STRUCTURED — 6 questions (MS9-091 to MS9-096)
-- ════════════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'structured', 'Solve simultaneously: 3x + 2y = 16 and x − y = 2. Give your answer as x = ?, y = ? (e.g. x=4, y=2).', '"x=4, y=2"', 2, 'hard', 'reasoning', 'equations_and_inequalities', 'math_algebra', 'From equation 2: x = y + 2. Substitute: 3(y+2) + 2y = 16 → 3y + 6 + 2y = 16 → 5y = 10 → y = 2. x = 4.', 'published'),
(v_pool_id, 'structured', 'In a quadrilateral, three angles are 85°, 110°, and 70°. Find the fourth angle.', '"95"', 2, 'medium', 'application', 'angles_and_constructions', 'math_geometry', 'Sum of angles in quadrilateral = 360°. Fourth angle = 360 − 85 − 110 − 70 = 95°.', 'published'),
(v_pool_id, 'structured', 'The heights (cm) of 7 plants are: 12, 15, 8, 22, 18, 10, 15. Find: (a) the median and (b) the mean. Give as median, mean (e.g. 15, 14.3).', '"15, 14.3"', 2, 'medium', 'application', 'interpreting_data', 'math_statistics', '(a) Ordered: 8, 10, 12, 15, 15, 18, 22 → median = 15. (b) Mean = 100/7 ≈ 14.3.', 'published'),
(v_pool_id, 'structured', 'A triangle has vertices A(1, 2), B(4, 2), C(1, 6). After a translation by vector (3, −1), what are the new coordinates of C?', '"(4, 5)"', 2, 'medium', 'application', 'symmetry_and_transformations', 'math_geometry', 'C(1, 6) + (3, −1) = (1+3, 6−1) = (4, 5).', 'published'),
(v_pool_id, 'structured', 'The formula for the volume of a cone is V = ⅓πr²h. Rearrange to make h the subject.', '"h = 3V/(πr²)"', 2, 'hard', 'reasoning', 'expressions_and_formulae', 'math_algebra', 'V = ⅓πr²h → 3V = πr²h → h = 3V / (πr²).', 'published'),
(v_pool_id, 'structured', 'A bag has 4 red and 6 blue marbles. Two marbles are drawn without replacement. What is the probability that both are red? (Give as a fraction)', '"2/15"', 2, 'hard', 'reasoning', 'probability', 'math_statistics', 'P(1st red) = 4/10. P(2nd red | 1st red) = 3/9. P(both red) = 4/10 × 3/9 = 12/90 = 2/15.', 'published');

-- ════════════════════════════════════
-- Default Math Blueprint (global)
-- ════════════════════════════════════

INSERT INTO adm_blueprints (
    id, school_id, name, subject, target_stage, total_marks, duration_minutes,
    question_distribution, pass_percentage, delivery_mode, is_active
) VALUES (
    '00000000-0000-0000-0000-e09119000004'::uuid,
    NULL,
    'Mathematics Stage 9 — Standard Admission Test',
    'math',
    9,
    30,
    60,
    '{
      "mcq": {"easy": 6, "medium": 8, "hard": 2},
      "gap_fill": {"easy": 2, "medium": 3, "hard": 1},
      "short_answer": {"medium": 2, "hard": 1},
      "structured": {"medium": 2, "hard": 1}
    }'::jsonb,
    50,
    'exam',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    question_distribution = EXCLUDED.question_distribution,
    updated_at = NOW();

END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run these to confirm the import:
-- SELECT count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e09119000003'::uuid;
-- → should return 96
-- SELECT question_type, difficulty, count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e09119000003'::uuid GROUP BY 1,2 ORDER BY 1,2;
