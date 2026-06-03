-- ============================================================
-- Add Biology Ch1 (Cell structure) tests to cambridge_tests
-- ============================================================
-- 151 validated 2017–2024 questions split into 5 parts (31/31/31/31/27).
-- Source: [CH1] 9700 BIOLOGY P1.pdf, aligned to BIOLOGY_MASTER_ANSWER_KEY coverage
-- Run after ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql
-- Idempotent: uses ON CONFLICT DO UPDATE.
-- ============================================================

INSERT INTO cambridge_tests (id, name, description, duration, total_questions, difficulty, category, subject, test_url, requires_marking) VALUES
('as-biology-ch1-cell-structure-part-1', 'AS Biology Ch1 ( Cell structure ) (Part 1)', 'Chapter 1 Part 1 — Microscope in cell studies (Q1–Q31). 9700 AS Biology MCQ question pool.', '62 min', 31, 'Advanced', 'Science', 'Biology', '/cambridge-tests/Biology/cell_structure.html?part=1', false),
('as-biology-ch1-cell-structure-part-2', 'AS Biology Ch1 ( Cell structure ) (Part 2)', 'Chapter 1 Part 2 — Microscopy & cells as basic units (Q32–Q62). 9700 AS Biology MCQ question pool.', '62 min', 31, 'Advanced', 'Science', 'Biology', '/cambridge-tests/Biology/cell_structure.html?part=2', false),
('as-biology-ch1-cell-structure-part-3', 'AS Biology Ch1 ( Cell structure ) (Part 3)', 'Chapter 1 Part 3 — Cells as basic units of living organisms (Q63–Q93). 9700 AS Biology MCQ question pool.', '62 min', 31, 'Advanced', 'Science', 'Biology', '/cambridge-tests/Biology/cell_structure.html?part=3', false),
('as-biology-ch1-cell-structure-part-4', 'AS Biology Ch1 ( Cell structure ) (Part 4)', 'Chapter 1 Part 4 — Cells as basic units of living organisms (Q94–Q124). 9700 AS Biology MCQ question pool.', '62 min', 31, 'Advanced', 'Science', 'Biology', '/cambridge-tests/Biology/cell_structure.html?part=4', false),
('as-biology-ch1-cell-structure-part-5', 'AS Biology Ch1 ( Cell structure ) (Part 5)', 'Chapter 1 Part 5 — Cells as basic units of living organisms (Q125–Q151). 9700 AS Biology MCQ question pool.', '54 min', 27, 'Advanced', 'Science', 'Biology', '/cambridge-tests/Biology/cell_structure.html?part=5', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration = EXCLUDED.duration,
  total_questions = EXCLUDED.total_questions,
  test_url = EXCLUDED.test_url;
