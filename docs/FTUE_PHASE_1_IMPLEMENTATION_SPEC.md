# Brains Heist Phase 1 FTUE Implementation Specification

## Purpose

This document converts the FTUE product architecture and visual experience direction into a practical Phase 1 implementation blueprint. It intentionally avoids code and avoids the long-term architecture becoming the first build. Phase 1 should deliver the smallest production-ready onboarding system that improves activation, keeps role-based experience quality high, and creates a clean foundation for later expansion.

Phase 1 should answer one product question:

> **Can a new user reach the right first value moment without confusion, overexposure, or manual support?**

---

## Phase 1 principles

1. **Build the router, not every route.** The most important engineering asset is a small onboarding resolver that reliably decides what the user should see next.
2. **Support the highest-volume/highest-risk segments first.** Start with students, independent learners, teachers, and school admins. Defer parents, districts, enterprise procurement, and full demo sandbox.
3. **Use current product primitives.** Reuse existing auth, roles, school invite codes, grade/class placement, XP/progression, dashboards, missions/tasks, and setup flags wherever possible.
4. **One first-value moment per segment.** Do not teach the whole product during onboarding.
5. **Persist just enough state.** Track phase, completed steps, active segment, and first-value completion. Do not introduce a large workflow engine yet.
6. **Progressive reveal beats feature tours.** Hide advanced systems until the user has completed the first meaningful action.
7. **Cinematic only where it helps.** Student/solo onboarding may feel like a mission launch; teacher/admin onboarding should feel premium and calm.
8. **Mobile-first by default.** Every Phase 1 flow must work well on a phone, even if teacher/admin power usage is better on desktop.

---

## Phase 1 segment prioritization

### Build in Phase 1

| Priority | Segment | Why now | First-value target |
| --- | --- | --- | --- |
| P0 | School-connected student | Highest activation risk; school rollout depends on students joining correctly | Join school/class context and complete/open first mission |
| P0 | Independent learner | Prevents non-school users from feeling blocked by invite codes | Choose goal and complete/open first solo mission |
| P0 | Teacher | Teacher activation drives school adoption and student invites | Create/select class context and launch/share starter mission |
| P1 | School admin | Needed for school governance and staff setup | Confirm school setup path and invite/configure first staff/class action |

### Defer to Phase 2+

| Segment | Reason to defer |
| --- | --- |
| Parent/guardian | Requires account sponsorship, reporting, and safety policy decisions not needed for core school/student activation |
| District/enterprise buyer | Requires multi-org hierarchy, procurement workflows, and advanced analytics |
| Public demo visitor sandbox | Valuable for acquisition, but can begin as a lightweight marketing/demo CTA before a true interactive sandbox |
| Platform superadmin FTUE | Internal operator workflows should be handled separately from public FTUE |

---

## Minimum viable FTUE product surface

Phase 1 should ship four role-aware flows powered by one resolver:

1. **School Student FTUE** — invite-code/deep-link path, placement confirmation, first mission launch, reward/dashboard reveal.
2. **Solo Learner FTUE** — solo path, learning goal selection, first mission launch, reward/dashboard reveal, join-school-later affordance.
3. **Teacher FTUE** — join school or continue as teacher trial, create/select first class placeholder, generate/share starter mission entry point.
4. **School Admin FTUE** — school confirmation, setup checklist, staff/class/content visibility first action, admin dashboard reveal.

Phase 1 should not attempt to redesign all dashboard pages. It should add an onboarding entry layer, completion state, and progressive reveal rules that adapt existing dashboard surfaces.

---

## Segment flow specifications

## 1. School-connected student flow

### Entry conditions

Use this flow when any of these are true:

- User arrives with a valid school invite/deep-link token.
- User selects “I have a school code.”
- User profile has `school_id` and role is `student` but first-value onboarding is incomplete.
- User has completed auth but `needs_setup` or grade/class placement is missing for a school student.

### Required data

| Data | Required? | Source |
| --- | --- | --- |
| Auth user id | Yes | Auth session |
| Username/display name | Yes | Existing profile or setup step |
| School id/name | Yes | Invite validation or existing profile |
| Role = student | Yes | Existing profile or role selection |
| Grade/class/batch | Required only if school placement missing | Existing profile, invite metadata, or placement screen |
| First mission id | Yes for mission launch; fallback allowed | Starter mission resolver or default task |
| Onboarding state | Yes | New persisted state |

### Screen sequence

#### Screen S1: School confirmation

**Goal:** Reassure the student they are joining the correct school.

- Show school name/logo if available.
- Show Byte as a small guide, not a full chat.
- Primary CTA: “Continue.”
- Secondary CTA: “Use a different code” only if invite was manually entered.

**Transition:** Fade/slide into identity or placement based on missing data.

#### Screen S2: Identity quick confirm

**Goal:** Confirm username/avatar with minimal friction.

- If username exists, show “You’re signed in as [username].”
- If missing, ask for username/display name.
- Optional avatar pick can be “choose later” in Phase 1.

**Transition:** Card selection/checkmark animation, then placement if needed.

#### Screen S3: Placement confirmation

**Goal:** Place the student correctly only if grade/batch/class is missing.

- Ask grade/class/batch only when not already known.
- Keep one field group per screen on mobile.
- Explain: “This helps your teacher assign the right missions.”

**Transition:** Save placement, then mission brief.

#### Screen S4: First mission brief

**Goal:** Start the first educational action.

- Show one recommended starter mission or active teacher assignment.
- Include estimated time, reward preview, and Byte hint.
- Primary CTA: “Start Mission.”
- If no mission resolver exists, use “Go to Today’s Missions” as fallback.

**Transition:** Mission launch animation under 800ms.

#### Screen S5: First value completion / dashboard reveal

**Goal:** Confirm progress and reveal the simplified dashboard.

- If a mission was completed during FTUE, show XP/streak/reward reveal.
- If the student only opened an assigned mission, mark “first mission started” and reveal dashboard with mission in progress.
- Dashboard shows only: next mission, XP/streak, school/class context, one unlock teaser.

### Completion rules

Mark core FTUE complete when all are true:

- User has authenticated profile.
- User has role `student`.
- User has school context.
- Required placement is present or explicitly deferred by school policy.
- User has started or completed first mission/assignment.
- Onboarding dashboard reveal has been shown once.

### Feature gates after completion

Immediately visible:

- Dashboard.
- Today’s mission/task list.
- XP/streak summary.
- School/class context.

Hidden until later:

- PvP, raids, clans, tournaments.
- Shop/inventory unless already part of existing default nav and cannot be safely hidden.
- Full leaderboard until first mission completion or school policy allows.
- Cambridge/IELTS unless assigned or school-visible.

### Aha moment

“I joined the right school, started a mission, earned/started progress, and know what to do next.”

---

## 2. Independent learner flow

### Entry conditions

Use this flow when:

- User selects “Continue solo” or “Learn solo.”
- User has no school membership and role is `student`/learner.
- User has role set but no first-value onboarding completion.

### Required data

| Data | Required? | Source |
| --- | --- | --- |
| Auth user id | Yes | Auth session |
| Username/display name | Yes | Profile/setup |
| Role = student/learner | Yes | Role selection or default solo learner role |
| Learning goal | Yes for Phase 1 personalization | Goal selection screen |
| Grade/level hint | Optional | Ask later unless needed by mission resolver |
| First mission id | Yes with fallback | Starter mission resolver/default mission |
| Onboarding state | Yes | New persisted state |

### Screen sequence

#### Screen L1: Solo welcome

**Goal:** Make solo mode feel intentional and premium.

- Copy: “Build your own learning route.”
- Secondary link: “I have a school code.”
- Byte: one sentence explaining solo progress can join a school later.

#### Screen L2: Goal selection

**Goal:** Personalize first mission without over-collecting data.

Options for Phase 1:

- Daily practice.
- Cambridge-style prep.
- IELTS prep.
- Science/subject mastery.
- Competition practice.

If some content is not ready, options can map to existing mission categories or a general starter mission with goal-specific copy.

#### Screen L3: Optional level hint

**Goal:** Avoid wrong difficulty if needed.

- Ask grade/level only when mission selection cannot be safely defaulted.
- Otherwise defer to after first mission.

#### Screen L4: First solo mission brief

**Goal:** Launch first learning action.

- Show mission title, why it matters, estimated time, reward preview.
- Primary CTA: “Start Mission.”

#### Screen L5: Reward + solo dashboard reveal

**Goal:** Show personal momentum.

- XP/streak reveal if mission completed.
- Show “Your route” with next 2–3 suggested missions. This can be a lightweight static list in Phase 1.
- Keep “Join a school later” as secondary card.

### Completion rules

Mark core FTUE complete when:

- User has authenticated profile.
- User has solo learner context.
- User has selected a learning goal.
- User has started or completed first solo mission.
- Solo dashboard reveal has been shown once.

### Feature gates after completion

Immediately visible:

- Solo dashboard.
- Today’s recommended mission.
- XP/streak.
- Join-school-later card.

Hidden until later:

- Advanced public competitions.
- Full economy explanation.
- Premium upsell before first mission completion.
- Teacher/admin concepts.

### Aha moment

“I can learn and progress right now without a school, and Byte has a path for me.”

---

## 3. Teacher flow

### Entry conditions

Use this flow when:

- User selects “I’m a teacher.”
- User joins a school with role `teacher`.
- Existing profile role is `teacher` and teacher first-value onboarding is incomplete.

### Required data

| Data | Required? | Source |
| --- | --- | --- |
| Auth user id | Yes | Auth session |
| Role = teacher | Yes | Role selection/invite/profile |
| School context | Optional in Phase 1 | Invite or teacher trial mode |
| First class name | Required for teacher trial; optional if school classes already exist | Setup screen/current classes |
| Starter mission assignment intent | Yes | Assignment launcher or mock prepared state |
| Onboarding state | Yes | New persisted state |

### Screen sequence

#### Screen T1: Teacher context choice

**Goal:** Route teacher into school or trial without confusion.

Options:

- “Join my school” — invite code path.
- “Create a trial class” — no school required.
- “Explore with demo data” — Phase 1 can be a non-persistent preview link or placeholder.

#### Screen T2: School confirmation or trial class setup

**School path:** confirm school and teacher role.

**Trial path:** ask class name and optional grade/subject.

Keep forms short. Do not ask for full rosters yet.

#### Screen T3: Starter mission launcher

**Goal:** Give the teacher an activation artifact.

- Show one recommended starter mission.
- Show what the teacher will see afterward: completion status and learning gaps.
- Primary CTA: “Create starter mission” or “Open assignment setup.”

Phase 1 may deep-link into existing assignment/task creation if available; otherwise create a lightweight “starter mission ready” state and route to teacher dashboard.

#### Screen T4: Invite/share step

**Goal:** Let teachers bring students in.

- Show class code/invite link if available.
- Copy button must work.
- If class invite infrastructure is not ready, show school invite code or “invite students later” fallback.

#### Screen T5: Teacher dashboard reveal

**Goal:** Show the teacher the operating model.

- Setup checklist.
- First class card.
- Starter mission status.
- Empty report preview or sample labeled demo data.

### Completion rules

Mark teacher FTUE complete when:

- User has role `teacher`.
- User has either school context or teacher trial context.
- User has created/selected a class-like context or explicitly skipped to existing teacher portal.
- User has seen starter mission/invite step.
- Teacher dashboard reveal has been shown once.

### Feature gates after completion

Immediately visible:

- Teacher dashboard/portal.
- Class card/setup checklist.
- Assignment entry point.
- Student invite/share affordance.

Hidden until later:

- School-wide settings unless the teacher is also school admin.
- Advanced reports before student activity.
- Game economy settings.
- Clan/PvP management.

### Aha moment

“I can get a class ready and launch a starter mission without learning the whole platform.”

---

## 4. School admin flow

### Entry conditions

Use this flow when:

- Existing role is `school_admin`.
- User joins a school invite as `school_admin` or is provisioned by Brains Heist.
- User is a teacher with school admin privileges and admin FTUE is incomplete.

### Required data

| Data | Required? | Source |
| --- | --- | --- |
| Auth user id | Yes | Auth session |
| Role/capability = school admin | Yes | Profile/membership/admin verification |
| School id/name | Yes | Existing school or provisioning |
| Setup checklist state | Yes | New persisted onboarding metadata or derived from school data |
| Staff/class counts | Optional but preferred | Existing school admin queries |
| Onboarding state | Yes | New persisted state |

### Screen sequence

#### Screen A1: School admin welcome

**Goal:** Establish this is a control center, not a student game.

- Show school name/logo.
- Show role: “School admin.”
- Byte appears as a small help panel only.

#### Screen A2: Setup checklist

**Goal:** Present the minimum governance path.

Checklist items:

1. Confirm school profile.
2. Invite teachers/admins.
3. Create or review classes.
4. Review student-facing feature defaults.
5. Open analytics dashboard.

Only the first one or two need to be fully actionable in Phase 1 if existing systems are limited.

#### Screen A3: First admin action

**Goal:** Complete one operational action.

Recommended Phase 1 priority:

- Invite teacher/admin if existing invite system supports it.
- Otherwise create/review class.
- Otherwise confirm feature defaults and continue.

#### Screen A4: Admin dashboard reveal

**Goal:** Show governance and visibility.

- School setup progress.
- Staff/classes/student summary if available.
- Content visibility/safety summary.
- Analytics preview or clearly labeled sample/empty state.

### Completion rules

Mark admin FTUE complete when:

- User has school admin capability.
- User has confirmed school context.
- User has seen setup checklist.
- User has completed or explicitly deferred the first admin action.
- Admin dashboard reveal has been shown once.

### Feature gates after completion

Immediately visible:

- School admin portal.
- Staff/classes/setup checklist.
- Content visibility/safety summary.
- Analytics overview/empty state.

Hidden until later:

- Student gameplay details.
- Economy tuning.
- District analytics.
- Procurement/billing workflows unless already required by plan management.

### Aha moment

“I can control school setup, access, and visibility before students experience the product.”

---

## Minimum onboarding resolver architecture

## Resolver responsibility

Create one small resolver function/service that determines:

- Active onboarding segment.
- Active context.
- Required next step.
- Whether core FTUE is complete.
- Which feature gates should apply during onboarding.

The resolver should be deterministic and testable. UI components should ask the resolver what to render; they should not independently re-derive onboarding state.

### Minimal resolver inputs

| Input | Source |
| --- | --- |
| Auth session/user id | Auth service |
| Profile row | Existing user/profile service |
| Role | Existing profile/membership data |
| `school_id` / school membership | Existing profile/school services |
| `needs_setup` | Existing profile flag |
| `tutorial_completed` | Existing tutorial field if present |
| Account tier | Existing profile field |
| Invite/deep-link token | URL/session storage |
| New onboarding state | New table or profile metadata |
| Active assignment/task availability | Existing task/mission service |

### Minimal resolver output

```text
OnboardingResolution
- segment: school_student | solo_learner | teacher | school_admin | none
- context: school | solo | teacher_trial | admin_school
- step: school_confirm | identity | placement | goal | mission_brief | reward_reveal | teacher_context | class_setup | starter_mission | invite_share | admin_checklist | admin_action | dashboard_reveal | complete
- required_data: string[]
- gates: string[]
- primary_cta: string
- fallback_route: string
```

### Resolver decision order

1. If no authenticated user: show public entry/auth flow, not FTUE.
2. If invite/deep-link token exists: validate and prioritize invite context.
3. If profile missing required identity/role: route to identity/role setup.
4. If role is `school_admin`: route to admin FTUE unless complete.
5. If role is `teacher`: route to teacher FTUE unless complete.
6. If role is `student` and `school_id` exists: route to school student FTUE unless complete.
7. If role is `student` and no `school_id`: route to solo learner FTUE unless complete.
8. If role is unknown: ask intent with only three options: learner, teacher, school admin.
9. If state is inconsistent: route to safe setup repair screen with logout/support fallback.

### Simplification for Phase 1

Do not build a full graph/state-machine framework. Implement a simple resolver with enumerated steps and a small persisted state record. A richer state machine can be introduced after onboarding analytics show where users drop off.

---

## Minimum database/state additions

## Recommended Phase 1 state model

Add the smallest durable state needed to support resumable onboarding and analytics.

### Option A: Dedicated `user_onboarding` table — recommended

Fields:

| Field | Purpose |
| --- | --- |
| `user_id` | Primary user reference |
| `segment` | Current segment selected/resolved |
| `context_type` | `school`, `solo`, `teacher_trial`, `admin_school` |
| `context_id` | School/class id if applicable; nullable for solo |
| `current_step` | Last incomplete step |
| `completed_steps` | JSON array of completed step keys |
| `core_completed_at` | Timestamp for core FTUE completion |
| `first_value_started_at` | Timestamp when first mission/setup action started |
| `first_value_completed_at` | Timestamp when first mission/setup action completed, nullable |
| `metadata` | Small JSON object for goal, selected route, last invite source |
| `created_at` / `updated_at` | Auditing |

### Option B: Profile JSON metadata — acceptable only as a temporary shortcut

If a table is too slow for Phase 1, store onboarding state in profile metadata. This is faster but less maintainable for analytics, multi-context onboarding, and future school/admin flows.

### Recommendation

Use the dedicated table if possible. It is small, clear, and avoids overloading `users` with workflow state. Keep the schema intentionally flat and avoid multi-context complexity until Phase 2.

### State keys for Phase 1

Allowed segments:

- `school_student`
- `solo_learner`
- `teacher`
- `school_admin`

Allowed steps:

- `intent`
- `school_confirm`
- `identity`
- `placement`
- `goal`
- `mission_brief`
- `mission_started`
- `reward_reveal`
- `teacher_context`
- `class_setup`
- `starter_mission`
- `invite_share`
- `admin_checklist`
- `admin_action`
- `dashboard_reveal`
- `complete`

---

## Persistence rules

### Save after every step

Each completed screen should persist state immediately. If the user refreshes or switches devices, the resolver should resume at the next incomplete step.

### Idempotency

All onboarding completion writes should be idempotent:

- Completing an already completed step should not error.
- Reopening onboarding should not duplicate XP or missions.
- Joining a school should not duplicate memberships.
- Starter mission creation should not duplicate assignments unless the teacher explicitly creates another.

### Relationship with existing flags

- Keep `needs_setup` as an existing compatibility flag, but do not rely on it as the only FTUE state.
- Keep `tutorial_completed` for legacy tutorial display, but Phase 1 FTUE should use `user_onboarding.core_completed_at` as the primary completion signal.
- If `user_onboarding` is missing for an existing user, resolver should infer completion from existing profile state and create a completed/legacy state lazily where safe.

---

## Immediate system integrations

## Auth

Must be fully implemented in Phase 1.

Integrate with:

- Existing sign-in/sign-up state.
- Email verification rules where school joining requires verification.
- Auth callback/deep-link handling.
- Logout fallback from onboarding.

Auth should not be redesigned beyond the minimum needed to route users after authentication.

## Schools

Must be fully implemented for school join/confirm flows.

Integrate with:

- Existing invite-code validation.
- Existing school join RPC/service.
- Existing `school_id`, `school_name`, grade, and batch fields.
- Existing school admin portal route where possible.

Do not build full multi-school membership in Phase 1 unless it already exists.

## Byte

Implement Byte as a lightweight guided UI element, not a full AI chat integration.

Phase 1 Byte can be:

- Static role-aware copy.
- Small animated/illustrated orb/icon.
- Contextual hint card.
- Loading/reward narrator.

Do not require live AI generation for onboarding copy in Phase 1. Deterministic copy is safer, cheaper, and more testable.

## XP/progression

Integrate only where a real mission completion already produces XP.

- Do not create fake XP ledger entries for onboarding screens.
- If first mission is completed through existing mission systems, show real XP results.
- If the user only starts a mission, show “progress started” instead of fake rewards.

## Missions/tasks

Must provide a first mission entry point.

Minimum acceptable implementation:

- Use active assignment if one exists.
- Otherwise use a default starter mission/task.
- Otherwise route to the existing task/quest dashboard with FTUE framing.

Do not build a new mission engine for Phase 1.

## Dashboards

Integrate with existing dashboards by adding first-run reveal states and gates.

- Student/solo: show simplified dashboard cards before full navigation where feasible.
- Teacher: route to teacher portal with setup checklist/empty state.
- Admin: route to school admin portal with setup checklist/empty state.

Avoid rebuilding dashboards wholesale.

---

## Progressive reveal logic for Phase 1

### Global rules

During active FTUE:

- Hide full navigation if possible.
- Show only one primary CTA.
- Suppress upgrade prompts until after first value.
- Suppress advanced game modes until FTUE completion.
- Keep settings/profile editing secondary unless needed for setup.

### Segment gates

| Feature | School student | Solo learner | Teacher | School admin |
| --- | --- | --- | --- | --- |
| Dashboard | After mission brief/start | After goal + mission brief/start | After class/starter step | After checklist |
| XP/streak | After mission start/completion | After mission start/completion | Hidden | Hidden |
| Leaderboard | After first mission and school policy | Later/optional | Report context only | Analytics context only |
| PvP/raids/clans | Hidden Phase 1 onboarding | Hidden Phase 1 onboarding | Hidden | Hidden |
| Shop/inventory | After first reward or level gate | After first reward or level gate | Hidden | Hidden |
| Cambridge/IELTS | If goal/assignment/school visibility | If selected goal and available | Assignment/content context | Visibility/reporting context |
| Reports | Hidden | Personal summary only | After class setup | Dashboard preview |
| Upgrade/paywall | After first value | After first value | Trial limits after setup | Plan context only |

### Dashboard reveal states

Use three reveal states:

1. `ftue_active` — focused onboarding screen, no full dashboard.
2. `first_run_dashboard` — simplified dashboard after first value.
3. `normal_dashboard` — regular product after completion and return visit.

---

## What to fake/mock temporarily vs fully implement

## Safe to fake/mock in Phase 1

| Item | Temporary approach | Guardrail |
| --- | --- | --- |
| Byte intelligence | Static role-aware copy and simple visual states | Do not imply live personalized AI if not true |
| Solo route plan | Static “next 2–3 missions” list based on selected goal | Label as recommendation, not adaptive mastery model |
| Teacher report preview | Clearly labeled sample/empty report state | Never mix sample data with real student data ambiguously |
| Admin analytics preview | Sample/empty state if no data | Label sample data clearly |
| Demo visitor | Lightweight preview CTA or static sample screens | Do not block core FTUE waiting for full demo sandbox |
| First mission fallback | Route to existing tasks/quest page with FTUE wrapper | Do not award fake completion XP |
| Avatar customization | Default avatar with “change later” | Do not block onboarding |

## Must be fully implemented in Phase 1

| Item | Why |
| --- | --- |
| Auth/session handling | Core routing depends on identity |
| Invite-code validation/join school | Critical for school student activation |
| Role selection/resolution | Prevents wrong UX and wrong permissions |
| Onboarding persistence/resume | Production users refresh, leave, and return |
| Completion rules | Prevents repeated onboarding loops |
| Safe fallbacks | Prevents blocked users and support load |
| Basic analytics events | Required to evaluate rollout |
| Feature gates during FTUE | Prevents overwhelm |
| Mobile layout for every FTUE screen | Many students onboard on phones/tablets |

---

## Mobile-first UX expectations

### Shared mobile requirements

- Single-column layout.
- One primary CTA per screen.
- Bottom-positioned CTA on long screens.
- Large cards and tap targets.
- No hover-only interactions.
- Inputs must be forgiving and auto-format invite codes.
- Each step must save independently.
- Back navigation should not destroy progress.
- Reduced motion mode must still communicate state.

### Student/solo mobile expectations

- Full-screen mission cards.
- Byte hint as compact bubble/card.
- Reward reveal fits one viewport.
- Dashboard reveal shows no more than three cards initially.
- Avoid sidebars and dense leaderboards.

### Teacher/admin mobile expectations

- Checklist cards stack vertically.
- Invite link/code actions are easy to copy/share.
- Dense analytics can be summarized with “open full report on desktop” messaging if needed.
- Bulk management is not required to be excellent on mobile in Phase 1.

---

## Analytics and observability

## Minimum analytics events

Track these events with `segment`, `context_type`, `step`, and `user_id` where permitted:

- `ftue_resolution_created`
- `ftue_started`
- `ftue_step_viewed`
- `ftue_step_completed`
- `ftue_invite_code_validated`
- `ftue_school_joined`
- `ftue_goal_selected`
- `ftue_first_mission_started`
- `ftue_first_mission_completed`
- `ftue_dashboard_revealed`
- `ftue_completed`
- `ftue_abandoned`
- `ftue_error`
- `ftue_fallback_used`

### Core metrics

- Signup/auth to FTUE start rate.
- FTUE start to first mission start rate.
- First mission start to first mission completion rate.
- FTUE completion rate by segment.
- Invite-code validation failure rate.
- Onboarding resume rate.
- Support fallback/error rate.
- Day 1 return by segment.

### Error monitoring

Log resolver failures with enough context to debug:

- Missing profile.
- Unknown role.
- Invalid invite.
- School join failed.
- Onboarding state inconsistent.
- Mission fallback used.

Do not expose raw technical errors to students.

---

## Safest rollout strategy

## Feature flags

Use at least these flags:

| Flag | Purpose |
| --- | --- |
| `ftue_phase1_enabled` | Global kill switch |
| `ftue_phase1_students_enabled` | Enable student/school learner FTUE |
| `ftue_phase1_solo_enabled` | Enable solo learner FTUE |
| `ftue_phase1_teachers_enabled` | Enable teacher FTUE |
| `ftue_phase1_admins_enabled` | Enable school admin FTUE |
| `ftue_phase1_byte_enabled` | Toggle Byte visual layer/copy |
| `ftue_phase1_dashboard_gates_enabled` | Toggle progressive reveal gates |

### Rollout phases

#### Phase 1A: Internal QA / staff only

- Enable resolver and persistence for internal accounts.
- Test all segment routing and fallbacks.
- Verify no existing users get stuck.

#### Phase 1B: New solo learners only

- Lowest institutional risk.
- Validate goal selection, first mission start, reward/dashboard reveal.

#### Phase 1C: New school students from one pilot school

- Validate invite code, placement, mission fallback, school context.
- Monitor support and teacher feedback.

#### Phase 1D: Teachers from pilot school

- Validate teacher context, class/starter mission setup, invite sharing.

#### Phase 1E: School admins

- Enable admin checklist once school support team is ready.

#### Phase 1F: Broader new-user rollout

- Enable for all new users after metrics show no major drop-off or loops.

### Existing users

Do not force existing active users through Phase 1 FTUE. For existing users:

- Infer completed onboarding if they have meaningful activity.
- Offer optional “new quick start” or “what’s new” card later.
- Only route existing users into repair/setup if required profile/school data is missing.

### Fallbacks

Every onboarding step must have a safe fallback:

- Invite validation fails: retry, use different code, continue solo if allowed.
- School join fails: support message and logout/retry.
- Mission unavailable: route to dashboard/task list.
- Onboarding state corrupt: reset FTUE state or route to safe setup repair.
- Feature flag disabled mid-flow: route to existing app behavior.

---

## Implementation risks and simplification opportunities

## Risk: onboarding loops

**Cause:** Conflict between `needs_setup`, `tutorial_completed`, role, school id, and new onboarding state.

**Mitigation:** Resolver must define one source of truth priority. New `user_onboarding.core_completed_at` should win for FTUE; existing flags remain compatibility inputs.

**Simplification:** For existing users with role set and activity, lazily mark FTUE complete.

## Risk: first mission engine is not ready

**Cause:** Existing tasks/quests may not support a clean starter mission for every segment.

**Mitigation:** Use a fallback route to existing dashboard/task list and mark first value as “mission started” only when the user actually opens a mission/task.

**Simplification:** Start with one default starter mission per broad context.

## Risk: teacher class setup becomes too complex

**Cause:** Roster imports, subjects, grades, assignments, and school policies can balloon quickly.

**Mitigation:** Phase 1 asks only for class name and optional grade/subject. Rosters and advanced assignment settings are later.

**Simplification:** Use “trial class” as a lightweight context even if full class schema is deferred.

## Risk: school admin checklist exposes unfinished systems

**Cause:** Admin setup crosses staff, classes, policies, analytics, reports, and visibility controls.

**Mitigation:** Make checklist items route to existing screens where real; mark unavailable items as “coming next” only outside critical setup.

**Simplification:** Require only one admin action for FTUE completion.

## Risk: Byte raises expectations of live AI

**Cause:** Users may expect conversational AI if Byte appears too intelligent.

**Mitigation:** Use deterministic copy and visual states. Avoid open text input in FTUE Phase 1.

**Simplification:** Byte is a component with role-based copy slots.

## Risk: progressive gates break existing navigation

**Cause:** Existing app may assume all nav items are available after login.

**Mitigation:** Start with visual hiding during FTUE only. Do not permanently change permissions in Phase 1 unless already enforced server-side.

**Simplification:** Gate by onboarding UI shell first, then add deeper feature gating after validation.

## Risk: mobile teacher/admin experience becomes too ambitious

**Cause:** Admin and teacher dashboards can be dense.

**Mitigation:** Mobile Phase 1 supports setup and summary only. Deep analytics can remain desktop-oriented.

**Simplification:** Build mobile checklist cards instead of full responsive admin tables.

---

## What should NOT be built yet

Do not build these in Phase 1:

- Full multi-organization/multi-school account switching.
- District/enterprise onboarding.
- Parent/guardian onboarding.
- Full public interactive demo sandbox.
- Live AI-generated onboarding conversations.
- New mission engine.
- New reward economy.
- New leaderboard system.
- Full class roster import workflow.
- SIS/SSO integrations.
- Advanced school policy builder.
- Economy tuning for admins.
- Comprehensive report builder redesign.
- Deep personalization model.
- Full design-system rebuild.
- Large animation framework if existing CSS/transitions are enough.
- Payment/pricing onboarding before first value.

---

## Phase 2+ backlog

Move these to Phase 2 or later:

1. Multi-school memberships and context switcher.
2. District admin hierarchy and aggregate analytics.
3. Parent/guardian sponsorship and learner reports.
4. Full interactive demo sandbox.
5. Advanced Byte conversational onboarding.
6. Adaptive diagnostic-driven mission pathing.
7. Rich role/capability permission editor.
8. Advanced school policies by grade/class/subject.
9. Teacher roster import and bulk class creation.
10. Deeper mobile analytics for admins.
11. More sophisticated reward/level unlock choreography.
12. A/B testing platform for onboarding variants.

---

## Engineering implementation blueprint

### Recommended build order

1. **Audit existing setup flags and routes.** Document current auth, setup, role, school join, tutorial, and dashboard routing behavior.
2. **Add `user_onboarding` persistence.** Include migrations/RLS/policies if required.
3. **Build resolver service.** Unit test all segment/step decisions.
4. **Add analytics event helper.** Track resolver and step events.
5. **Build shared FTUE shell.** Mobile-first layout, progress indicator, Byte slot, primary CTA slot.
6. **Implement school student flow.** Highest school rollout impact.
7. **Implement solo learner flow.** High acquisition/retention impact.
8. **Implement teacher flow.** Keep class/starter mission minimal.
9. **Implement school admin flow.** Checklist first, dashboard reveal second.
10. **Add dashboard reveal/gating layer.** Start as UI gating only.
11. **Add fallbacks and repair screen.** Avoid blocked users.
12. **Roll out behind flags.** Follow staged rollout sequence.

### Acceptance criteria

Phase 1 is production-ready when:

- A new school student can join by invite, confirm placement, start/open a mission, and reach a simplified dashboard.
- A new solo learner can select a goal, start/open a mission, and reach a solo dashboard with join-school-later option.
- A new teacher can choose school/trial context, create/select class-like context, see starter mission/invite step, and reach teacher dashboard.
- A school admin can confirm school context, see checklist, complete/defer one admin action, and reach school admin dashboard.
- Refreshing mid-onboarding resumes the correct step.
- Existing users are not forced into FTUE unless truly incomplete.
- Feature flags can disable FTUE and restore prior behavior.
- Analytics show step starts/completions/errors by segment.
- Mobile layouts are usable for every Phase 1 screen.

---

## Final Phase 1 recommendation

Phase 1 should be a **small, durable onboarding layer** rather than a full product redesign.

Build:

- One resolver.
- One persisted onboarding state record.
- One shared FTUE shell.
- Four focused segment flows.
- Minimal progressive reveal.
- Deterministic Byte guidance.
- Safe fallbacks and analytics.

Do not build the long-term onboarding universe yet. The right Phase 1 win is getting each priority segment to one meaningful first-value moment with confidence, polish, and no confusion.
