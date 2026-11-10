-- Writing Hub: name the reader in every Cambridge bank task.
--
-- The bank scored "Communicative Achievement" (audience, purpose, register) while the task text only said
-- "the stated audience" and never stated one. Each task now tells the student who they are writing for, and the
-- trusted task rules sent to the assessor name the same reader.
--
-- Idempotent: rows that already carry their reader sentence are left alone. Stored assessments keep the prompt hash
-- they were marked against; only newly issued tasks use the new wording.

with readers(genre, reader_line, audience, register) as (values
  ('email',     'Write your email to your class teacher.',                              'the student''s class teacher',                         'neutral'),
  ('article',   'Write for your school magazine, which students and teachers read.',     'students and teachers who read the school magazine',  'neutral'),
  ('review',    'Write for other students at your school.',                              'other students at the writer''s school',               'neutral'),
  ('story',     'Write for readers of your own age.',                                    'readers of the writer''s own age',                     'neutral'),
  ('essay',     'Write for your English teacher.',                                       'the student''s English teacher',                       'formal'),
  ('report',    'Write your report for the head teacher.',                               'the head teacher',                                     'formal'),
  ('paragraph', 'Write for your classmates.',                                            'the writer''s classmates',                             'neutral')
), rewritten as (
  select
    pb.id,
    r.audience,
    r.register,
    case
      when pb.payload->>'prompt_text' like '%Develop your ideas for the stated audience and purpose.%'
        then replace(pb.payload->>'prompt_text', 'Develop your ideas for the stated audience and purpose.', r.reader_line)
      else replace(pb.payload->>'prompt_text', ' Your response must:', ' ' || r.reader_line || ' Your response must:')
    end as prompt_text
  from public.bh_writing_prompt_bank pb
  join readers r on r.genre = pb.payload->>'genre'
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and position(r.reader_line in pb.payload->>'prompt_text') = 0
    and (
      pb.payload->>'prompt_text' like '%Develop your ideas for the stated audience and purpose.%'
      or pb.payload->>'prompt_text' like '% Your response must:%'
    )
)
update public.bh_writing_prompt_bank pb
set payload = jsonb_set(
  jsonb_set(
    jsonb_set(pb.payload, '{prompt_text}', to_jsonb(w.prompt_text)),
    '{task_rules,audience}', to_jsonb(w.audience)
  ),
  '{task_rules,register}', to_jsonb(w.register)
)
from rewritten w
where pb.id = w.id;
