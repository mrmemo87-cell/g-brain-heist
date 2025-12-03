-- Direct update by ID (since URL shows /ielts/writing/1)
UPDATE ielts_writing_tasks
SET prompt = 'The bar chart below shows population changes in three cities between 2000 and 2020.

Summarize the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POPULATION OF THREE CITIES (in millions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

City          │  2000   │  2010   │  2020
──────────────┼─────────┼─────────┼─────────
Metro City    │   2.1   │   3.4   │   5.2
Riverside     │   1.8   │   2.0   │   1.9
Oldtown       │   3.5   │   3.2   │   2.8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bar Chart Visualization:

Metro City:  2000 ████████████ 2.1M
             2010 ████████████████████ 3.4M
             2020 ██████████████████████████████ 5.2M

Riverside:   2000 ██████████ 1.8M
             2010 ███████████ 2.0M
             2020 ██████████ 1.9M

Oldtown:     2000 ████████████████████ 3.5M
             2010 ██████████████████ 3.2M
             2020 ████████████████ 2.8M',
title = 'Population Changes Bar Chart'
WHERE id = 1;

-- Check result
SELECT id, slug, title, prompt FROM ielts_writing_tasks WHERE id = 1;
