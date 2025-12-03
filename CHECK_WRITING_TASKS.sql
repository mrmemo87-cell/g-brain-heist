-- Check what writing tasks exist in the database
SELECT id, slug, title, task_type, LEFT(prompt, 300) as prompt_start 
FROM ielts_writing_tasks;
