# FTUE Training Mission: First Signal

## Route/state
- Add a controlled `ftue_training` quest state inside `QuestView`, not a new mission engine.
- Eligible learners are students in the dashboard-tour handoff (`dashboard_tour.first_mission_cta_clicked`) whose onboarding metadata does not have `ftue_training_mission.status` of `completed` or `skipped`.
- Teachers, admins, school admins, existing normal mission users, direct mission links, and assignment runs keep the existing quest flow.

## Question flow
- Mission name: **First Signal**.
- Three questions maximum, designed to take under two minutes.
- Each question demonstrates one interaction: choose an answer, continue after feedback, then finish the route.
- Byte guidance copy is fixed per step: “Choose an answer.”, “Nice — now continue.”, and “Final question. Finish the route.”

## UI behavior
- When eligible, the quest screen opens directly to the training route and hides the full mission library.
- Answers are local/symbolic for instruction only; no backend reward grant is attempted.
- Completion opens `MissionCompleteOverlay` with symbolic copy: “Starter access unlocked.”
- “Skip training” exits to the dashboard safely.

## Persistence
- Training start, skip, and completion update `user_onboarding.metadata.ftue_training_mission`.
- Completion also records `mission_started`, `reward_reveal`, first-value timestamps, and `core_completed_at` through existing onboarding completion helpers.
- Analytics events emitted: `training_mission_started`, `training_question_answered`, `training_mission_completed`, `training_mission_skipped`.

## Completion rules
- Completing the third question marks training completed, reveals the completion overlay, and allows the normal mission library on later quest visits.
- Skipping marks training skipped and returns to dashboard; normal missions are accessible because onboarding is explicitly skipped/completed.

## Fallback behavior
- If onboarding metadata cannot be read, existing quest behavior remains available.
- If metadata persistence fails, analytics still emits best-effort events and the user can return to dashboard.
- Pending assignments keep the assignment blocker behavior instead of being replaced by training.

## Not built yet
- No new mission authoring engine, database mission row, real reward grant, adaptive placement, teacher configuration, or long training campaign.
