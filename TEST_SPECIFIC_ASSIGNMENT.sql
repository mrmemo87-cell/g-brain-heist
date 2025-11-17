-- Test if questions are actually accessible for a specific assignment
-- This tests one of the assignments that should have 5 questions

-- Check the assignment itself
SELECT * FROM assignments 
WHERE id = 'c52f7a45-fade-4a69-aaa4-20b81b1a4e2d';

-- Check the assignment_questions links
SELECT * FROM assignment_questions 
WHERE assignment_id = 'c52f7a45-fade-4a69-aaa4-20b81b1a4e2d'
ORDER BY order_index;

-- Check if we can see the questions through the view
SELECT * FROM assignment_question_details
WHERE assignment_id = 'c52f7a45-fade-4a69-aaa4-20b81b1a4e2d'
ORDER BY order_index;

-- Check the actual questions
SELECT q.* FROM assignment_questions aq
JOIN questions q ON q.id = aq.question_id
WHERE aq.assignment_id = 'c52f7a45-fade-4a69-aaa4-20b81b1a4e2d'
ORDER BY aq.order_index;
