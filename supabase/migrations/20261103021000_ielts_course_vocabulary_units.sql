-- Seed the vocabulary path of the self-paced IELTS course: six units, one per released vocabulary lesson
-- (IELTS-V1 to IELTS-V6 v1.1.0), each linking its six step tasks in order (R-080 to R-115).
-- Owner approval for course learners: 2026-11-03 (Asia/Bishkek). V1 is the free preview.
-- Re-runnable: units upserted by slug; task links inserted once per step code.

create temp table _vocab_seed (
  position int, slug text, title text, subtitle text, minutes int, free boolean, lesson jsonb, first_task int
) on commit drop;

insert into _vocab_seed values
(1, 'vocab-paraphrase-power', 'Paraphrase power', 'Reading and Listening: same meaning, different words', 45, true, $j${
  "intro": "Reading and Listening questions almost never repeat the words of the passage. They say the same thing in different words. If you know exactly what common paraphrase words mean, you find answers faster and avoid near-misses.",
  "sections": [
    {"title": "Exact meaning matters", "body": "Many IELTS words carry a precise amount, certainty or time. 'Predominantly' means most, not all. 'Reluctant' means unwilling, not refusing. 'Likely' means probably, not certainly. One small difference turns a TRUE into a FALSE."},
    {"title": "Near-misses", "body": "A wrong option often changes only one thing: how much, how sure, when, why or who. Before you choose, check all five against the original sentence."},
    {"title": "How this lesson works", "body": "Six short steps. Each starts with a LEARN FIRST box and a worked example, then six questions. You see the answers and an explanation for every question after you submit. Step 6 mixes everything together."}
  ],
  "example": {"label": "Exact or near-miss?", "text": "Original: 'The new bridge is likely to reduce journey times.'\nExact: 'Journey times will probably become shorter.'\nNear-miss: 'Journey times will certainly become shorter.' (changes how sure)"},
  "tips": ["Read the whole option, not just the key word.", "Ask: does it change the amount, the certainty, the time, the cause or the person?", "After each step, use two of the new words in a sentence of your own."]
}$j$, 58),

(2, 'vocab-trends-comparisons', 'Trends and comparisons', 'Writing Task 1: describe data accurately', 45, false, $j${
  "intro": "Writing Task 1 Academic asks you to describe charts and tables. Examiners reward vocabulary that is accurate, not just varied: the word must match the size and direction of the change.",
  "sections": [
    {"title": "Strength matters", "body": "'Rose slightly', 'rose steadily' and 'soared' describe very different changes. Choose the word that matches the data. A 2% increase is not a surge."},
    {"title": "Grammar of trend words", "body": "Verbs and nouns work differently: 'Sales rose by 10%' but 'There was a 10% rise in sales'. Small words matter too: 'rose to 50' gives the end point, 'rose by 50' gives the size of the change."},
    {"title": "Comparing figures", "body": "Use multiples, fractions and approximations correctly: 'twice as many', 'roughly a third', 'just under half'. Check them against the numbers before you write."}
  ],
  "example": {"label": "Match the word to the data", "text": "Data: 40 to 44.\nWeak: 'The figure increased dramatically.'\nAccurate: 'The figure rose slightly, from 40 to 44.'"},
  "tips": ["Always check: how big is the change, and in which direction?", "Learn the preposition with the word: rise to, rise by, a rise in.", "Never invent figures that are not in the data."]
}$j$, 64),

(3, 'vocab-precise-arguments', 'Precise language for arguments', 'Writing Task 2: causes, effects and careful claims', 45, false, $j${
  "intro": "In Writing Task 2 you argue a position. Precise words and natural phrases make an argument sound controlled and convincing. Vague or exaggerated claims make it weaker.",
  "sections": [
    {"title": "Collocation", "body": "Some words simply go together: 'have an impact on', 'play a role in', 'raise awareness of'. Using the wrong small word ('impact to') is a common error that examiners notice."},
    {"title": "Careful claims", "body": "Strong writers avoid claiming more than they can prove. 'This may reduce crime' or 'This is likely to help' is better than 'This will solve crime completely'."},
    {"title": "Showing a view", "body": "Words such as although, despite and however link ideas and show what you think. Each needs its own grammar: 'Although it is expensive, ...' but 'Despite the cost, ...'."}
  ],
  "example": {"label": "Overclaim versus careful claim", "text": "Overclaim: 'Banning cars will end pollution in cities.'\nCareful: 'Restricting cars in city centres is likely to reduce air pollution significantly.'"},
  "tips": ["Learn phrases, not single words.", "Use hedging words such as may, tend to and is likely to when you cannot be sure.", "Check the grammar after although, despite and however."]
}$j$, 70),

(4, 'vocab-natural-speaking', 'Natural language for Speaking', 'Speaking: sound natural and keep going', 40, false, $j${
  "intro": "In the Speaking test, vocabulary is judged on how naturally and flexibly you use it. Natural phrases, good describing words and ways to keep going when you get stuck all help.",
  "sections": [
    {"title": "What phrases do", "body": "Phrases such as 'to be honest', 'the thing is' and 'as far as I know' each have a job: giving an opinion, explaining, or showing you are not sure. Use them for their job, not as decoration."},
    {"title": "Develop, don't memorise", "body": "Short, memorised answers sound flat. A developed answer gives a reason and an example in natural words."},
    {"title": "When you get stuck", "body": "If you cannot find a word, describe it: 'It's a kind of ...' or 'I can't think of the word, but it's the thing you use to ...'. Keeping going is better than stopping."}
  ],
  "example": {"label": "Short versus developed", "text": "Short: 'I like my town. It is nice.'\nDeveloped: 'To be honest, I really like my town. It's quite small, so you bump into people you know all the time, which makes it feel friendly.'"},
  "tips": ["Learn a few phrases for opinions, examples and repair.", "Use describing words that go together naturally: a lively market, a quiet street.", "Practise answering out loud, not just in your head."]
}$j$, 76),

(5, 'vocab-word-forms-spelling', 'Word forms and spelling', 'Completion answers: the exact form scores', 40, false, $j${
  "intro": "In completion questions, the right idea with the wrong form or spelling scores zero. This lesson trains you to decide what the gap needs and to copy or spell it exactly.",
  "sections": [
    {"title": "What does the gap need?", "body": "Look at the words around the gap. After 'the' or 'a' you usually need a noun. After 'to' or 'can' you need a verb. Before a noun you often need an adjective."},
    {"title": "Word families", "body": "Many words have several forms: economy, economic, economical, economically. Choose the form that fits the grammar of the sentence."},
    {"title": "Copy exactly", "body": "When the answer comes from the passage, copy it as it is written: plural, -ed and -ing endings all count. Common words such as 'accommodation' and 'environment' are often misspelled."}
  ],
  "example": {"label": "Choose the form", "text": "'The centre needs better energy ______.'\nThe gap follows 'energy', so it needs a noun.\nPassage: 'minimise energy consumption'. Answer: consumption."},
  "tips": ["Read the words before and after the gap.", "Check singular or plural against the passage.", "Spell carefully: a misspelled answer is wrong."]
}$j$, 82),

(6, 'vocab-topic-collocations', 'Topic collocations', 'Common IELTS themes: environment, health, education and more', 45, false, $j${
  "intro": "IELTS topics repeat: the environment, health, education, technology, work. Knowing the natural word partners for each topic helps you read faster and write and speak more precisely.",
  "sections": [
    {"title": "Verb plus noun", "body": "Topic nouns have verbs that go with them: 'reduce emissions', 'tackle a problem', 'raise standards'. 'Make emissions lower' is understandable but less natural."},
    {"title": "Better or worse?", "body": "Many collocations show direction: 'ease pressure' makes it better, 'worsen congestion' makes it worse. Notice which way a phrase points."},
    {"title": "Paraphrase in Reading", "body": "Passages often use a topic collocation where the question uses plainer words. 'Cut carbon emissions' and 'release less carbon' express the same idea."}
  ],
  "example": {"label": "Natural partners", "text": "Less natural: 'The government should do pollution less.'\nNatural: 'The government should take steps to reduce pollution.'"},
  "tips": ["Learn collocations in pairs or short phrases.", "Group them by topic in your notes.", "Use one new collocation in your next writing or speaking practice."]
}$j$, 88);

insert into public.ielts_course_units (track, position, slug, title, subtitle, focus_skills, lesson, estimated_minutes, is_free_preview, is_published)
select 'vocabulary', s.position, s.slug, s.title, s.subtitle, array['vocabulary'], s.lesson, s.minutes, s.free, true
from _vocab_seed s
on conflict (slug) do update set
  track = excluded.track, position = excluded.position, title = excluded.title, subtitle = excluded.subtitle,
  focus_skills = excluded.focus_skills, lesson = excluded.lesson, estimated_minutes = excluded.estimated_minutes,
  is_free_preview = excluded.is_free_preview, is_published = excluded.is_published, updated_at = now();

insert into public.ielts_course_unit_tasks (unit_id, position, skill, task_code)
select u.id, step, 'vocabulary', 'bh-ielts-targeted-reading-r' || (s.first_task + step - 1) || '-v1'
from _vocab_seed s
join public.ielts_course_units u on u.slug = s.slug
cross join generate_series(1, 6) as step
on conflict (task_code) do nothing;
