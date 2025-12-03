-- Run this to UPDATE the existing writing task with the proper chart data
-- The ON CONFLICT DO NOTHING in the main script won't update existing records

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
             2020 ████████████████ 2.8M'
WHERE slug = 'population-changes-cities';

-- Also update the internet usage chart
UPDATE ielts_writing_tasks
SET prompt = 'The bar chart below shows the percentage of adults who used the internet daily in five different age groups in 2010 and 2020.

Summarize the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAILY INTERNET USAGE BY AGE GROUP (%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Age Group    │  2010   │  2020
─────────────┼─────────┼─────────
18-24        │   75%   │   98%
25-34        │   68%   │   95%
35-44        │   52%   │   88%
45-54        │   38%   │   79%
55+          │   22%   │   61%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bar Chart Visualization:

18-24:  2010 ███████████████████████████████ 75%
        2020 ███████████████████████████████████████████████████ 98%

25-34:  2010 ████████████████████████████ 68%
        2020 ██████████████████████████████████████████████████ 95%

35-44:  2010 █████████████████████ 52%
        2020 █████████████████████████████████████████████ 88%

45-54:  2010 ████████████████ 38%
        2020 █████████████████████████████████████████ 79%

55+:    2010 █████████ 22%
        2020 ████████████████████████████████ 61%'
WHERE slug = 'internet-usage-graph';

-- Verify the updates
SELECT slug, title, LEFT(prompt, 200) as prompt_preview FROM ielts_writing_tasks;
