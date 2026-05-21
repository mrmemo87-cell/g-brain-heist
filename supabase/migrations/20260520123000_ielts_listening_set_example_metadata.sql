alter table public.ielts_listening_sets
  add column if not exists instructions text,
  add column if not exists example_prompt text,
  add column if not exists example_answer text,
  add column if not exists section_label text,
  add column if not exists question_range_label text;

update public.ielts_listening_sets
set
  instructions = 'Questions 1–10: Complete the form.',
  example_prompt = 'Time of travel',
  example_answer = 'September',
  section_label = 'Section 1',
  question_range_label = 'Questions 1 - 10'
where id = 3;
