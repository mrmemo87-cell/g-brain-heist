# Brains Heist FTUE Product Architecture & Onboarding Segmentation Proposal

## Executive recommendation

Brains Heist should treat onboarding as a **segmented role-and-context router**, not as one fixed tutorial. The product is becoming three things at once:

1. A student-facing gamified learning world.
2. A teacher/admin-facing school operating system for assignments, analytics, Cambridge-style preparation, moderation, and class management.
3. A public acquisition surface for independent learners, parents, and prospective schools.

The scalable FTUE should therefore be built around a single question hierarchy:

> **“Are you here as a learner, educator/admin, or visitor/evaluator — and are you connected to a school?”**

The current implementation already has useful primitives: roles (`student`, `teacher`, `school_admin`, `admin`), school membership (`school_id`), grade/class fields, account tiers, invite-code school joining, solo setup, and role-restricted navigation. The next generation should formalize these primitives into a durable onboarding architecture.


## Related design direction

This architecture proposal defines who onboarding is for and how routing should work. For the companion visual, motion, role-based aesthetic, reward, mission, and dashboard-reveal direction, see [`FTUE_VISUAL_EXPERIENCE_DIRECTION.md`](./FTUE_VISUAL_EXPERIENCE_DIRECTION.md).

## Phase 1 implementation blueprint

For the practical minimum viable production rollout plan derived from this architecture, see [`FTUE_PHASE_1_IMPLEMENTATION_SPEC.md`](./FTUE_PHASE_1_IMPLEMENTATION_SPEC.md).

---

## 1. Major user personas / segments

### A. School-connected student

**Definition:** A learner invited by a school, teacher, class, or district.

**Primary goals**

- Join the correct school/class quickly.
- Understand what to do today.
- Earn XP, rewards, rank, and visible progress.
- Complete teacher-assigned work without friction.
- Prepare for tests such as Cambridge-style exams when relevant.

**Fears / blockers**

- “Am I in the right class?”
- “Will my teacher see my mistakes?”
- “This looks like a game; is it actually for school?”
- Getting overwhelmed by PvP, clans, shops, raids, assignments, reports, and exams at once.

**Motivations**

- Status among classmates.
- Streaks, XP, cosmetic identity, leaderboard rank.
- Teacher recognition.
- Feeling that Byte helps rather than judges.

**Aha moment**

- “I completed one mission, earned XP, and my class/school progress updated.”

### B. Independent student / solo learner

**Definition:** A learner outside a school who wants practice, progression, and AI support.

**Primary goals**

- Start immediately without school friction.
- Choose a goal such as “general learning,” “Cambridge prep,” “IELTS prep,” “competition,” or “daily practice.”
- See a path that feels personalized, not institution-bound.

**Fears / blockers**

- “Do I need a school code?”
- “Will I be locked out of the useful content?”
- “Is this only for classrooms?”

**Motivations**

- Self-improvement.
- Solo progression, streaks, mastery, and unlocks.
- Safe competitive features against public/AI peers.

**Aha moment**

- “I can play and learn right now, and I can join a school later if I get a code.”

### C. Teacher

**Definition:** A classroom instructor responsible for students, assignments, feedback, and reports.

**Primary goals**

- Get a class live quickly.
- Invite students or connect to an existing school.
- Assign missions/tests.
- View actionable learning gaps.
- Trust AI-generated feedback and analytics.

**Fears / blockers**

- Losing class time to setup.
- Students joining the wrong class.
- Too much game noise.
- AI accuracy, fairness, explainability, and moderation.
- Reporting not matching school expectations.

**Motivations**

- Time saved on marking and differentiation.
- Student engagement.
- Evidence for interventions.
- Easy Cambridge-style preparation.

**Aha moment**

- “I created or joined a class, assigned a mission, and can see who needs help.”

### D. School admin

**Definition:** School-level operator responsible for account governance, teachers, classes, visibility, moderation, reports, and school analytics.

**Primary goals**

- Configure school safely.
- Invite teachers/admins.
- Manage classes, roles, and content visibility.
- Monitor progress across cohorts.
- Export/share reports.
- Control student safety, moderation, and access.

**Fears / blockers**

- Students accessing inappropriate or distracting features.
- Role/permission leakage.
- Messy rosters.
- Analytics that are not credible enough for leadership.
- Gamification undermining academic seriousness.

**Motivations**

- Whole-school adoption.
- Reduced admin overhead.
- Improved learning outcomes.
- Demonstrable engagement and performance metrics.

**Aha moment**

- “I can see school-wide activity and control what teachers/students can access.”

### E. District / enterprise buyer

**Definition:** Multi-school decision-maker, often evaluating compliance, procurement, data governance, and rollout planning.

**Primary goals**

- Understand security, data isolation, deployment, pricing, support, and impact.
- Pilot with one or more schools.
- Aggregate analytics across schools without micromanaging classrooms.

**Fears / blockers**

- Data privacy and student safety.
- Insufficient audit controls.
- Vendor lock-in.
- Unclear ROI.
- No migration path from pilot to district deployment.

**Motivations**

- Standardized learning data.
- Scalable engagement.
- Administrative consistency.
- Procurement-ready evidence.

**Aha moment**

- “This can scale from a pilot to a district without rebuilding onboarding, permissions, or analytics.”

### F. Demo visitor / prospective school evaluator

**Definition:** A principal, department head, teacher, parent, or procurement stakeholder visiting before creating a real school account.

**Primary goals**

- Understand the product in under two minutes.
- Experience student magic without entering real student data.
- See teacher/admin outcomes.
- Request a pilot or demo.

**Fears / blockers**

- Signup wall too early.
- Product seems too game-like or too complex.
- No clear route to school rollout.

**Motivations**

- Curiosity.
- Proof of engagement.
- Fast evaluation.

**Aha moment**

- “I can see both the student experience and the school analytics promise.”

### G. Parent / guardian sponsor

**Definition:** A buyer or supporter for a solo learner, not necessarily the learner.

**Primary goals**

- Know what the child will learn.
- Understand safety, progress, price, and time commitment.
- See progress reports.

**Fears / blockers**

- Too much screen-time/gameplay.
- Public social/competitive exposure.
- No academic credibility.

**Motivations**

- Confidence, grades, exam readiness, positive study habits.

**Aha moment**

- “This is motivating like a game but structured like a learning plan.”

### H. Platform superadmin / internal operator

**Definition:** Brains Heist team member with global operational access.

**Primary goals**

- Manage schools, content, safety, entitlements, templates, pilots, and support.
- Diagnose setup problems.
- Operate demos and migrations.

**Fears / blockers**

- Irreversible changes.
- Ambiguous account state.
- Manual support burden.

**Motivations**

- Reliable operations and clean tenant data.

**Aha moment**

- “Every account has clear context, entitlement, state, and next action.”

### I. Byte, the AI assistant, as a product actor

**Definition:** Not a user account in the same sense, but a persistent guide that shapes FTUE, learning, and support.

**Primary goals**

- Explain the next best action.
- Reduce confusion.
- Personalize practice.
- Convert complex product architecture into friendly guidance.

**Fears / blockers to design around**

- Over-personification or inaccurate authority.
- Too much chat before the user has context.
- AI feels like surveillance in school contexts.

**Aha moment**

- “Byte knows what I should do next and helps me succeed without making the product feel complicated.”

---

## 2. Recommended FTUE flow by segment

### School-connected student FTUE

**Entry condition:** Invite code, deep link from school/class, pre-provisioned roster, or `school_id` plus role `student`.

**Flow**

1. Welcome: “You’re joining [School/Class].”
2. Confirm identity: display name, avatar, optional nickname policy.
3. Confirm academic placement only if missing: grade/class/batch.
4. Byte micro-intro: one sentence plus “I’ll guide your first mission.”
5. First mission: 3–5 minute diagnostic or teacher-assigned starter.
6. Reward reveal: XP, streak, class position, next unlock.
7. Dashboard unlock: show only today’s mission, assignments, progress, and maybe class leaderboard.

**Do not show initially**

- Full shop economy.
- PvP attack mechanics.
- Clan management.
- Admin/reporting language.
- All exams and all hubs at once.

### Independent learner FTUE

**Entry condition:** No school membership and self-selected learner path.

**Flow**

1. Welcome: “Start solo. Join a school later if you get a code.”
2. Goal selection: daily practice, Cambridge-style prep, IELTS, science/subject mastery, competition mode.
3. Level/age calibration: lightweight self-selection or quick diagnostic.
4. Byte creates a first mission path.
5. First win: complete a mission, earn XP, select reward/cosmetic.
6. Upgrade/join-school prompt later, after value is experienced.

**Do not show initially**

- School setup prompts unless the learner actively chooses “I have a school code.”
- Teacher/admin features.
- Dense reports.
- Payment prompt before first learning success.

### Teacher FTUE

**Entry condition:** Role `teacher`, invite link/code, or selected “I teach students.”

**Flow**

1. Choose context: join existing school, create trial class, or explore demo.
2. If school invite exists: verify school and role.
3. Create/import first class or select assigned class.
4. Choose first outcome: assign mission, run live competition, create Cambridge prep set, or view demo analytics.
5. Invite students or generate class code.
6. Show “first class ready” checklist.

**Aha target:** Teacher gets a class activation artifact, not a general product tour.

### School admin FTUE

**Entry condition:** Role `school_admin`, admin invite, school creation flow, or Brains Heist operator provisioning.

**Flow**

1. School verification and governance confirmation.
2. Setup checklist:
   - School profile.
   - Invite teachers/admins.
   - Create/import classes.
   - Configure student access and content visibility.
   - Review analytics/reporting tabs.
3. Present dashboard as control center, not a game.
4. Offer guided demo data if no real users exist yet.

**Aha target:** School admin sees controllability and analytics before gamified elements.

### Demo visitor FTUE

**Entry condition:** Public landing page, demo route, marketing campaign, prospective school CTA.

**Flow**

1. Pick demo lens: Student, Teacher, School Leader.
2. No account required for the first interactive preview.
3. Show a simulated first mission and simulated analytics.
4. CTA: book demo, create pilot school, invite teacher, or continue as solo learner.

**Aha target:** The visitor understands both engagement and school value without configuring anything.

### Parent / guardian FTUE

**Entry condition:** Public pricing page, parent CTA, learner account sponsor flow.

**Flow**

1. Explain learning outcomes and safety.
2. Create learner profile or invite child.
3. Choose learning goal and time plan.
4. Show sample report and limits/controls.
5. Let learner complete first mission.

### District / enterprise FTUE

**Entry condition:** Sales-led invite, enterprise plan, district admin role.

**Flow**

1. Organization verification.
2. Pilot plan setup: schools, cohorts, timeline, success metrics.
3. Compliance and data settings.
4. Provision school admins.
5. View aggregate demo dashboard.

---

## 3. Shared onboarding components vs separate experiences

### Shared components

These should be reusable across segments:

- Identity capture: name, username, avatar.
- Context router: school / solo / educator / demo.
- Invite-code validation.
- Role selection where safe.
- Byte introduction component.
- Goal picker.
- Academic placement selector.
- First mission launcher.
- Progress/reward reveal.
- Checklist component for adults.
- Empty-state cards with next best action.
- Feature-unlock coach marks.
- Upgrade / request pilot / join-school CTA cards.

### Components that require separate UX shells

- **Student shell:** immersive, emotional, mission-first, low settings complexity.
- **Teacher shell:** workflow-first, class setup, assignment/reporting outcomes.
- **School admin shell:** governance-first, dashboards, safety, access, analytics.
- **Demo shell:** reversible sandbox, no real data, fast value preview.
- **Enterprise shell:** procurement/configuration-first, often sales-assisted.

### Rule of thumb

Share primitives, not journeys. A student and a school admin may both use an “identity step,” but they should never feel like they are in the same product tour.

---

## 4. Independent learners: same or different progression/economy?

Independent learners should have a **compatible but distinct progression economy**.

### What should be shared

- XP, levels, streaks, mission completion, cosmetic rewards, Byte coaching, achievements.
- Core skill mastery model.
- Optional public challenges where age/safety rules allow.
- Upgrade mechanics that are understandable across the product.

### What should differ

| Area | School-connected users | Independent learners |
| --- | --- | --- |
| Leaderboards | Class/school/cohort scoped by default | Solo/global/opt-in public leagues |
| Assignments | Teacher-controlled | Self-assigned or Byte-recommended |
| Rewards | Can be tuned by school policy | Product-owned economy |
| Content visibility | School/admin controlled | Tier and goal controlled |
| Reports | Teacher/admin-facing | Learner/parent-facing |
| Competitive features | Governed by school safety settings | Opt-in and age/safety constrained |
| Progression pacing | Aligned to class/exam calendar | Personalized streak/mastery plan |

### Recommendation

Use one underlying progression ledger, but introduce `progression_context`:

- `school_context`: class assignments, school leaderboards, policy-governed economy.
- `solo_context`: personal goals, public opt-in competitions, monetization-led unlocks.
- `demo_context`: simulated state only.

This avoids duplicating reward code while allowing school policies and solo monetization to differ.

---

## 5. Schools, classrooms, and individuals: modes or unified system?

Use **one unified system with context modes**, not separate products.

### Why not separate products?

Separate products would create duplicated accounts, duplicated content, duplicated analytics, migration pain, and confusing transitions when a solo learner joins a school.

### Recommended architecture

- A user has one account.
- A user can have zero or more organization memberships over time.
- The app session resolves an active context:
  - `solo`
  - `school_member`
  - `teacher_workspace`
  - `school_admin_workspace`
  - `district_workspace`
  - `demo`
- Features read from context + role + entitlements + policy.

### Product principle

“Modes” should exist at the experience layer, not as separate data silos.

---

## 6. Recommended role hierarchy and permissions architecture

### Account-level roles

- `learner`: default student/independent learner capability.
- `educator`: can teach/manage assigned classes.
- `school_admin`: can manage school settings, teachers, classes, visibility, analytics.
- `district_admin`: can manage multiple schools and aggregate reporting.
- `platform_admin`: internal Brains Heist operational role.
- `guardian`: optional sponsor/report recipient.

### Membership-level roles

A user’s role should be scoped to an organization or class where possible:

- `student` in school/class.
- `teacher` in school/class/subject.
- `class_owner` for a specific class.
- `department_lead` or `exam_coordinator` for scoped content/report control.
- `school_admin` for a school.
- `district_admin` for an organization containing schools.

### Permissions model

Move toward capability-based permissions:

- `school.manage_profile`
- `school.manage_members`
- `school.manage_classes`
- `school.manage_content_visibility`
- `school.view_analytics`
- `class.assign_work`
- `class.view_reports`
- `student.play_missions`
- `student.join_competitions`
- `student.use_ai_assistant`
- `platform.manage_tenants`
- `platform.impersonate_support_readonly`

### Important guardrails

- Role is not enough; always evaluate active context and school policy.
- School admins should be blocked from student game surfaces unless explicitly impersonating a demo/read-only student view.
- Teachers can be school admins, but the UI must make the active workspace obvious.
- Students should not see SaaS/admin language.

---

## 7. Recommended tiering structure

### Free individual

**Audience:** Solo learners trying the product.

**Includes**

- Basic missions.
- Basic XP/streaks.
- Limited Byte help.
- Limited cosmetics.
- Optional limited public leaderboard.
- Join-school capability.

**Limits**

- Advanced reports.
- Premium exam prep.
- Deep AI feedback.
- Extended historical analytics.

### Premium individual

**Audience:** Independent learners / parent-sponsored learners.

**Includes**

- Full solo learning paths.
- Enhanced Byte coaching.
- Advanced practice/exam packs.
- More analytics.
- More cosmetics/economy features.
- Parent/guardian report add-on if needed.

### Teacher trial / classroom starter

**Audience:** Individual teachers evaluating.

**Includes**

- One or limited number of classes.
- Limited student seats.
- Assignment creation.
- Basic reports.
- Demo/pilot analytics.

### School plan

**Audience:** Single school.

**Includes**

- School admin portal.
- Teacher and class management.
- Student seats.
- School leaderboards/competitions.
- Cambridge-style preparation visibility controls.
- Reports and exports.
- Moderation/safety tools.
- School-specific policies.

### School plus / premium school

**Audience:** Schools needing advanced analytics and support.

**Includes**

- Advanced analytics.
- Custom onboarding support.
- Enhanced AI/reporting.
- Integrations/imports.
- More configuration and support SLAs.

### District / enterprise

**Audience:** Multi-school organizations.

**Includes**

- Multi-school dashboard.
- District-level roles and policies.
- Procurement/security package.
- SSO/SIS integration roadmap.
- Dedicated support.
- Custom reporting/export.

### Demo / sandbox

**Audience:** Evaluators.

**Includes**

- Simulated student, teacher, and admin views.
- No real student data.
- CTA into trial/pilot.

---

## 8. Recommended onboarding decision tree

### Pre-auth / public decision tree

Ask the fewest possible questions:

1. “What brings you here?”
   - I’m a student / learner.
   - I’m a teacher.
   - I manage a school.
   - I’m exploring for a school.
   - I’m a parent.
2. If student/learner: “Do you have a school code?”
   - Yes: school invite path.
   - No: solo path.
   - Not sure: solo path with persistent “Join school later.”
3. If teacher/admin: “Do you have an invite from your school?”
   - Yes: join school.
   - No: create trial / request school setup / explore demo.
4. If evaluator: offer demo immediately before requiring account.

### Post-auth decision tree

Use deterministic account state before asking questions:

1. Is this a demo session?
   - Show demo FTUE.
2. Is user authenticated but missing required setup?
   - Show setup router.
3. Does user have an invite/deep-link token?
   - Validate and prioritize school/class join.
4. Does user have active memberships?
   - Resolve active workspace.
5. Does user have role but no school?
   - Solo learner or teacher trial depending on role.
6. Does user have school role?
   - Show segment-specific FTUE state.
7. Has user completed first value event for active context?
   - If no, continue FTUE.
   - If yes, show dashboard with progressive prompts.

### First questions to ask

**Students**

- “Do you have a school code?”
- “What is your learning goal?” only if solo or after school join.
- “What grade/class are you in?” only if needed and not provided by invite/roster.

**Teachers**

- “Are you joining a school or creating a trial class?”
- “What class do you want to set up first?”

**Admins**

- “Are you setting up a school, joining an existing school, or exploring a demo?”

**Demo visitors**

- “Which view do you want to preview: student, teacher, or school leader?”

---

## 9. Information to collect immediately vs progressively

### Collect immediately

**Everyone**

- Authentication identity.
- Display name / username.
- Role intent.
- School invite code if present.
- Consent/required policy acknowledgement where applicable.

**Students**

- School/class from invite when possible.
- Grade/class only if required to place assignments or content.

**Solo learners**

- Primary goal.
- Approximate level/grade only if needed for content calibration.

**Teachers**

- School/trial choice.
- First class name or imported class.

**Admins**

- School identity.
- Admin verification/invite.

### Collect progressively later

- Avatar customization beyond first quick choice.
- Subject interests.
- Detailed learning preferences.
- Parent/guardian email.
- Accessibility preferences.
- AI tutoring style.
- Exam target dates.
- Detailed class roster/imports.
- Advanced school policies.
- Notification preferences.
- Payment details.

### Principle

Do not ask for anything unless it changes the next screen or first success moment.

---

## 10. Features to hide until later stages

### For students

Hide until after first mission:

- Full navigation menu.
- PvP attacks.
- Clan territory/raids.
- Shop/inventory complexity.
- Multiple exam hubs.
- Advanced analytics.
- Upgrade prompts.

Reveal after:

1. First mission completion.
2. Streak established.
3. Class leaderboard introduced.
4. Teacher assignment completed.
5. Level threshold reached.

### For independent learners

Hide until after first success:

- Payment wall.
- School admin concepts.
- Dense leaderboards.
- Complex clan/team systems.

Reveal after:

- Goal path selected.
- First diagnostic or mission completed.
- Clear “next 7 days” plan generated.

### For teachers

Hide until after first class setup:

- School-wide admin settings.
- Complex reports.
- Economy tuning.
- Multi-feature game map.

Reveal after:

- Class exists.
- At least one assignment or live mission is launched.
- Student data starts arriving.

### For school admins

Hide until after baseline setup:

- Student game details.
- Cosmetic/economy mechanics.
- Fine-grained content settings.

Reveal after:

- Teachers/classes configured.
- First dashboard has real or demo data.
- Safety and visibility defaults are chosen.

---

## 11. Potential UX risks and mitigations

### Risk: overwhelming users

**Cause:** Brains Heist has missions, XP, leaderboards, reports, class systems, Cambridge prep, Byte, clans, shops, raids, and analytics.

**Mitigation:** One first job per segment:

- Student: complete first mission.
- Solo learner: choose goal and complete first mission.
- Teacher: create class and assign first mission.
- Admin: configure school and invite first teachers.
- Demo visitor: preview the promise.

### Risk: conflicting school vs individual flows

**Cause:** Solo users can later join schools; school users may want independent practice.

**Mitigation:** Maintain one account with explicit active context. Show “personal practice” and “school work” as separate tabs/lanes, not separate accounts.

### Risk: too much gamification for admins

**Cause:** School leaders evaluate safety, outcomes, and controls, not avatars and attacks.

**Mitigation:** Admin FTUE should use professional language: engagement, mastery, cohorts, visibility, reports, safety. Keep game features summarized as configurable student engagement mechanics.

### Risk: too much SaaS complexity for students

**Cause:** Role/tier/school/class concepts are adult/system concepts.

**Mitigation:** Students see missions, progress, team/class, and Byte. Never expose entitlements, setup states, or policy internals unless required.

### Risk: premature data collection

**Cause:** Onboarding forms become a proxy for product uncertainty.

**Mitigation:** Ask only what determines routing, placement, safety, or first mission.

### Risk: teacher setup failure harms whole-class adoption

**Cause:** If the teacher cannot get students in quickly, product value collapses.

**Mitigation:** Provide class codes, roster import later, demo students, and a “launch with one test student” path.

### Risk: analytics without data feels empty

**Cause:** Admin/teacher dashboards are blank before student activity.

**Mitigation:** Use sample/demo data toggles and explicit activation checklists.

---

## 12. Recommended long-term scalable onboarding architecture

### A. Onboarding state machine

Represent onboarding as durable state, not only component state:

- `not_started`
- `intent_captured`
- `context_resolved`
- `identity_complete`
- `placement_complete`
- `workspace_ready`
- `first_value_started`
- `first_value_completed`
- `core_ftue_completed`
- `progressive_onboarding_active`
- `complete`

Track this per user **and per context**. A teacher can complete personal setup but still need school admin setup for a newly created school.

### B. Segment router

Create a single resolver that returns:

- `persona_segment`
- `active_context`
- `role_scope`
- `required_next_step`
- `allowed_features`
- `hidden_features`
- `primary_cta`

The UI should not scatter these decisions across many components.

### C. Progressive disclosure engine

Use feature gates that unlock based on:

- Role.
- Context.
- Entitlement/tier.
- School policy.
- First-value milestones.
- Level/XP milestones.
- Assignment state.

### D. FTUE content registry

Define reusable modules:

- `choose_context`
- `enter_invite_code`
- `confirm_school`
- `select_role`
- `select_goal`
- `select_grade_class`
- `byte_intro`
- `first_mission`
- `reward_reveal`
- `create_first_class`
- `invite_students`
- `school_setup_checklist`
- `demo_preview`

Each module should declare:

- Eligible segments.
- Required data.
- Data it collects.
- Completion event.
- Next possible modules.

### E. Analytics events

Minimum event taxonomy:

- `ftue_started`
- `intent_selected`
- `invite_code_entered`
- `invite_code_validated`
- `role_selected`
- `goal_selected`
- `placement_completed`
- `workspace_created`
- `first_mission_started`
- `first_mission_completed`
- `first_reward_seen`
- `dashboard_entered`
- `join_school_later_clicked`
- `setup_abandoned`
- `setup_resumed`
- `upgrade_prompt_seen`
- `demo_completed`

### F. Byte as orchestration layer, not routing source of truth

Byte should narrate and personalize, but deterministic app state should decide what is allowed. Byte can explain, suggest, and celebrate; it should not be the sole permission or placement authority.

---

## 13. Recommended data model implications

### Current useful primitives to preserve

- Account role.
- School membership via `school_id`.
- Grade/class/batch placement.
- Setup flags.
- Tutorial completion.
- Account tier.
- XP, coins, gems, streak, AP, and other progression fields.

### Recommended additions / refinements

#### `organizations`

Represents schools, districts, demo organizations, and possibly tutoring centers.

Fields:

- `id`
- `type`: `school`, `district`, `demo`, `tutoring_center`
- `name`
- `parent_org_id`
- `status`: `trial`, `active`, `suspended`, `demo`
- `plan_id`
- `settings`

#### `memberships`

Avoid relying on a single `school_id` forever.

Fields:

- `user_id`
- `org_id`
- `role`
- `status`
- `joined_at`
- `source`: `invite_code`, `roster_import`, `manual`, `demo`, `self_signup`
- `active_context_default`

#### `classes`

Fields:

- `id`
- `org_id`
- `name`
- `grade_level`
- `subject`
- `academic_year`
- `teacher_owner_id`
- `settings`

#### `class_memberships`

Fields:

- `class_id`
- `user_id`
- `role`: `student`, `teacher`, `assistant`
- `status`

#### `onboarding_states`

Fields:

- `user_id`
- `context_type`
- `context_id`
- `segment`
- `state`
- `current_step`
- `completed_steps`
- `first_value_event`
- `started_at`
- `completed_at`
- `metadata`

#### `user_goals`

Fields:

- `user_id`
- `context_id`
- `goal_type`: `daily_practice`, `cambridge`, `ielts`, `science_mastery`, `competition`, `teacher_class_setup`, `school_rollout`
- `target_date`
- `level_hint`
- `active`

#### `entitlements`

Fields:

- `subject_type`: `user`, `organization`, `district`
- `subject_id`
- `plan_id`
- `features`
- `limits`
- `starts_at`
- `ends_at`

#### `school_policies`

Fields:

- `org_id`
- `feature_key`
- `enabled`
- `config`
- `applies_to`: school, grade, class, role.

#### `progression_ledger`

A normalized history of XP/reward events that can be scoped:

- `user_id`
- `context_type`
- `context_id`
- `source_type`: mission, assignment, PvP, achievement, exam, admin_adjustment.
- `xp_delta`
- `coin_delta`
- `gem_delta`
- `metadata`

### Migration principle

Do not remove current simple fields immediately. Add normalized models behind compatibility views/services, then migrate screens gradually.

---

## 14. Recommended north star onboarding experience

The best north star is:

> **“Byte opens the right door, delivers one meaningful win, then reveals the rest of Brains Heist only when it becomes useful.”**

### North star flow

1. **Landing:** “Choose your mission.”
   - Learn solo.
   - Join my school.
   - Teach a class.
   - Manage a school.
   - Explore demo.
2. **Context resolution:** Invite/deep link first, then role/intent fallback.
3. **Byte greeting:** Segment-specific, short, and action-oriented.
4. **One setup action only:** The minimum needed to launch the first value event.
5. **First value event:**
   - Student/solo: complete first mission.
   - Teacher: create class + assign starter mission.
   - Admin: invite teacher + view school setup checklist/dashboard.
   - Demo: preview student mission + analytics.
6. **Reward/control reveal:**
   - Students see XP and progress.
   - Teachers see assignment status.
   - Admins see controllability and visibility.
7. **Progressive next step:** Reveal exactly one next feature based on segment.

### Emotional design target

- Students feel: “This is exciting and I know what to do.”
- Solo learners feel: “I belong here even without a school.”
- Teachers feel: “This will save me time next lesson.”
- Admins feel: “This is controllable and credible.”
- Demo visitors feel: “I understand the product without committing.”

---

## 15. Implementation sequencing recommendation

Although this document does not implement FTUE, the recommended build order is:

1. **Document current onboarding states and feature gates.**
2. **Add analytics around current setup drop-off.**
3. **Introduce a central onboarding resolver service.**
4. **Normalize contexts and memberships conceptually before UI expansion.**
5. **Redesign student/solo first mission FTUE.**
6. **Redesign teacher first class FTUE.**
7. **Redesign school admin setup checklist.**
8. **Add demo visitor sandbox.**
9. **Introduce progressive feature unlocks.**
10. **Expand data model to multi-membership/district only after resolver is stable.**

---

## Final product principles

1. **One account, many contexts.**
2. **One first success per segment.**
3. **Ask less before value, ask more after trust.**
4. **Byte guides; permissions decide.**
5. **School users need governance; students need momentum.**
6. **Solo users should not feel like second-class school users.**
7. **Progression should be shared, but scoped by context.**
8. **Do not expose product architecture to users; translate it into missions, classes, schools, and goals.**
