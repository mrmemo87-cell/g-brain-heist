# Individual User Enjoyment Scan (No School Joined)

This note summarizes what a user **without a school link** can still enjoy in the app today.

## What they can enjoy immediately

1. **Quest gameplay loop (core learning missions)**
   - The mission console always exposes quest start, and app routing does not block quests for users without `school_id`.
   - This keeps a strong solo loop: answer questions, build XP/coins, and progress personal profile.

2. **Personal progression systems**
   - Daily/weekly tasks, caps tracking, profile progression, and dashboard feedback remain visible in the student dashboard experience.

3. **IELTS prep hub as an independent pathway**
   - IELTS pages are routed behind auth but are not school-bound routes.
   - IELTS home explicitly markets “Free to Start” and offers structured Reading, Listening, Writing, and Speaking practice cards.

4. **Prime personal purchase path**
   - Prime FAQ clarifies personal purchases are for individual use.
   - This provides a direct individual monetization + access path outside school-issued codes.

## What they cannot (or may not) access until joining a school

1. **School-specific social/competitive features**
   - Clan, school leaderboard, school competitions, and admissions/school-admin views are blocked when `school_id` is missing.
   - The UI explicitly prompts joining a school for “full access to school features.”

2. **School benefits highlighted in Join School card**
   - School leaderboards
   - Join school clans
   - School competitions
   - Teacher assignments

## Practical recommendation for product messaging

For independent users, emphasize this order:

1. Start with **Quest + Tasks** for daily habit-building.
2. Pivot to **IELTS Prep Center** for four-skill structured practice.
3. Offer **Prime** as the personal upgrade path.
4. Present **Join School** as optional for social/competitive school features.

This framing aligns what’s currently available in-product with what users can act on without school enrollment.
