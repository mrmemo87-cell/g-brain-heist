# Brains Heist FTUE Visual Direction & Experience Design Proposal

## Purpose

This proposal defines the visual and experiential direction for Brains Heist onboarding before any implementation work. It complements the product architecture proposal by translating segmentation into concrete experience design principles: how the first-time experience should look, feel, move, reveal information, and emotionally retain students, teachers, admins, independent learners, and prospective schools.

The goal is to create an FTUE that feels:

- Futuristic and mission-driven without becoming childish.
- Trustworthy enough for schools and parents.
- Emotionally engaging enough for students to return.
- Calm and clear enough for teachers and admins to adopt.
- Premium enough to support paid individual, school, and enterprise plans.


## Related implementation blueprint

For the practical Phase 1 FTUE build plan that applies this visual direction without overengineering, see [`FTUE_PHASE_1_IMPLEMENTATION_SPEC.md`](./FTUE_PHASE_1_IMPLEMENTATION_SPEC.md).

---

## Executive creative direction

Brains Heist should feel like a **premium learning command center disguised as a mission world**.

The student-facing layer can use cyberpunk mission energy, XP, Byte, and reward moments, but the underlying UI should preserve the polish and restraint of modern productivity tools. Teachers and admins should feel they are using a serious education platform with tasteful game signals, not a game dashboard with reporting bolted on.

### North-star visual sentence

> **“A sleek AI mission interface where learners feel heroic, teachers feel in control, and schools feel safe.”**

### Product experience pillars

1. **Mission-first, not menu-first.** New users should see one clear next action before they see the full product surface.
2. **Premium restraint.** Use glow, motion, and reward effects as punctuation, not wallpaper.
3. **Role-aware atmosphere.** Student screens can feel immersive; teacher/admin screens should feel calm, capable, and professional.
4. **Byte as emotional continuity.** Byte should make the system feel personal without turning onboarding into a chat app.
5. **Progressive reveal.** Every new concept should be introduced only after it becomes useful.
6. **Trust through clarity.** Schools should immediately understand governance, safety, data visibility, and class structure.

---

## Inspiration translation

The listed inspirations should influence Brains Heist as design principles, not as visual copies.

| Inspiration | What to borrow | What to avoid |
| --- | --- | --- |
| Duolingo onboarding psychology | Tiny commitments, immediate success, streak/reward anticipation, friendly guide, one-screen decisions | Childlike mascots, cartoon overload, manipulative pressure |
| Linear polish | Crisp layout, sharp typography, subtle motion, beautiful empty states, low-friction flows | Being too austere or developer-tool-like for students |
| Notion clarity | Calm information hierarchy, readable cards, progressive organization, low intimidation | Generic white SaaS blandness |
| Modern cyberpunk mission UI | Mission framing, neon accents, scanning/terminal motifs, map/briefing language | Cluttered HUDs, illegible effects, aggressive dark UI everywhere |
| Premium gaming HUD minimalism | Sparse overlays, satisfying rewards, cinematic transitions, clear status indicators | Stat overload, too many currencies upfront, combat-first framing for school users |

---

## Visual identity

### Brand personality

Brains Heist should visually communicate five traits:

1. **Intelligent** — AI-powered, adaptive, precise.
2. **Adventurous** — missions, progress, agency, discovery.
3. **Trustworthy** — school-safe, organized, measurable.
4. **Premium** — polished, intentional, calm under the spectacle.
5. **Human** — Byte, encouragement, friendly progress language.

### Core visual metaphor

The recommended metaphor is **“mission control for learning.”**

- Students are agents on learning missions.
- Teachers are mission directors.
- School admins are operations commanders.
- Byte is the AI navigator.
- Classes are squads/cohorts, but the copy should stay academically appropriate in school settings.
- Reports are intel, but adult-facing screens should prefer “insights,” “progress,” and “evidence.”

### Logo and symbol usage

- Use the Brains Heist mark as a premium signal, not a constantly animated toy.
- In student FTUE, the logo can appear as an animated boot sequence or mission seal.
- In teacher/admin FTUE, use the logo more quietly: top-left identity, welcome header, or setup checklist badge.
- Avoid covering every screen with skull/heist/crime motifs. “Heist” should feel like clever strategy, not delinquency.

### Color system direction

Use a restrained dark premium base with role-specific accents.

#### Base palette

- **Deep space navy / slate:** primary background for student mission surfaces.
- **Graphite / near-black:** elevated cards and HUD panels.
- **Soft off-white:** primary text, never pure glowing white everywhere.
- **Muted gray-blue:** secondary text and dividers.
- **Cyan:** core Brains Heist intelligence/mission accent.
- **Violet:** mastery, AI, premium, and solo exploration.
- **Emerald:** success, school safety, completion, positive analytics.
- **Amber:** caution, streaks, urgency, deadlines.
- **Rose/red:** errors, risk, moderation only; avoid using red as excitement default.

#### Role accent mapping

| Segment | Accent direction | Reason |
| --- | --- | --- |
| School student | Cyan + emerald | Mission energy plus school-safe success |
| Independent learner | Violet + cyan | Self-directed, AI-guided exploration |
| Teacher | Blue + emerald | Calm workflow, clarity, evidence |
| School admin | Indigo + graphite + emerald | Authority, governance, dashboards |
| Demo visitor | Cyan + neutral gradients | Premium introduction without role overload |
| Enterprise/district | Indigo + slate + minimal accent | Procurement-safe, serious, scalable |

### Typography direction

Use a two-tier typography system:

- **Display/mission type:** for student mission titles, reward reveals, and major onboarding moments. It can be slightly futuristic, but must remain highly legible.
- **Product UI type:** for forms, teacher/admin dashboards, reports, and body copy. It should be clean, modern, and readable.

Guidelines:

- Avoid overly sci-fi fonts for body text.
- Avoid all-caps paragraphs.
- Use all-caps only for small labels like “MISSION BRIEF,” “NEXT STEP,” or “CLASS READY.”
- Keep numbers and progress stats crisp and tabular where possible.

### Shape and surface language

- Use rounded rectangles with moderate radius, not bubble-like pill everything.
- Student mission cards can have layered depth, faint grid lines, and subtle glows.
- Teacher/admin cards should use flatter surfaces, clearer borders, and less glow.
- Use glassmorphism sparingly. It should imply premium depth, not reduce readability.
- Avoid noisy backgrounds behind forms.

---

## Emotional tone

### Student tone

Student onboarding should feel:

- Encouraging.
- Secret-mission exciting.
- Competence-building.
- Safe to fail.
- Fast.

Sample emotional arc:

1. Curiosity: “What is this?”
2. Identity: “I’m an agent/learner here.”
3. Confidence: “I know my first mission.”
4. Reward: “I made progress.”
5. Anticipation: “Something unlocks next.”

Avoid:

- Sarcasm.
- Shame around wrong answers.
- Aggressive combat language in school flows.
- Too many currencies before the learner understands learning value.

### Independent learner tone

Independent learners should feel that solo mode is intentional, not a fallback.

Use language like:

- “Start your own mission path.”
- “Join a school later if you get a code.”
- “Byte will build your first route.”
- “Your progress belongs to you.”

Avoid:

- “No school? Continue anyway.”
- “Limited mode.”
- “Ask your teacher.” as the default empty state.

### Teacher tone

Teacher onboarding should feel:

- Time-saving.
- Calm.
- Classroom-ready.
- Respectful of expertise.
- Practical.

Use language like:

- “Set up your first class.”
- “Assign a starter mission.”
- “See learning gaps as students complete work.”
- “Use demo students first if you want to explore.”

Avoid:

- “Hack your classroom.”
- Overly playful mission copy where a teacher expects workflow clarity.
- Showing leaderboards before setup value is clear.

### Admin tone

Admin onboarding should feel:

- Controlled.
- Governed.
- Secure.
- Strategic.
- Professional.

Use language like:

- “Configure school access.”
- “Invite staff.”
- “Control student-facing features.”
- “Review engagement and progress across cohorts.”

Avoid:

- Large animated avatars as the main admin hero.
- “Battle,” “attack,” or “raid” copy in admin FTUE.
- Dense student game mechanics before policy controls.

### Demo visitor tone

Demo visitor onboarding should feel:

- Immediate.
- Impressive.
- Low-commitment.
- Credible.

Use language like:

- “Preview the student experience.”
- “See what teachers get after the first mission.”
- “Explore sample school analytics.”

Avoid:

- Account creation before any value.
- Asking for school size, phone number, procurement role, or budget upfront.

---

## Onboarding pacing

### Recommended pacing model

FTUE should be structured as **three short beats plus one reveal**:

1. **Orient** — Who are you and what context are you in?
2. **Commit** — Choose one path or goal.
3. **Act** — Complete one meaningful setup or learning action.
4. **Reveal** — Show progress, next step, and only the relevant dashboard slice.

### Time targets

| Segment | Target time to first value | First value event |
| --- | ---: | --- |
| School student | 2–4 minutes | Completes first mission or opens assigned task |
| Independent learner | 3–5 minutes | Completes first solo mission/diagnostic |
| Teacher | 4–7 minutes | Creates/selects class and assigns starter mission |
| School admin | 5–10 minutes | Completes school setup checklist step and sees dashboard |
| Demo visitor | 60–120 seconds | Previews mission + sample analytics |

### Screen count guidance

| Segment | Ideal first-run screen count | Notes |
| --- | ---: | --- |
| Student | 3–5 screens | Include reward reveal as a screen/overlay |
| Solo learner | 4–6 screens | Include goal choice and first mission |
| Teacher | 4–7 screens | Checklist may replace linear wizard after intent capture |
| Admin | 5–8 screens | Setup checklist is better than wizard for complex setup |
| Demo visitor | 2–4 screens | Fast preview before signup CTA |

### Micro-commitment strategy

Borrow from Duolingo psychology by making every step small and satisfying:

- One decision per screen.
- Use large tappable choices.
- Confirm progress visually after each choice.
- Avoid backtracking anxiety; users can change setup later.
- Make the first action feel safe and low-stakes.

---

## Animation philosophy

### Core rule

Motion should **explain state, celebrate progress, and guide attention**. It should not be constant decoration.

### Motion personality by role

| Segment | Motion style | Intensity |
| --- | --- | --- |
| Student | Mission boot, card lift, reward pulse, Byte reactions | Medium |
| Solo learner | Path-building, goal selection glow, calm reward moments | Medium-low |
| Teacher | Smooth checklist completion, panel transitions, subtle success states | Low |
| Admin | Minimal fades/slides, dashboard counters easing in | Very low |
| Demo visitor | Cinematic but short transitions | Medium |

### Recommended motion patterns

- **Boot sequence:** 800–1200ms max for first student welcome only.
- **Card selection:** slight scale, border glow, checkmark snap.
- **Step transitions:** horizontal slide or fade-through, not page-spin effects.
- **Byte entrance:** small hover/fade, not bouncing constantly.
- **Reward reveal:** burst/pulse once, then settle quickly.
- **Dashboard reveal:** staged fade of 3 key cards, not full-page explosion.

### Motion restraint rules

- No infinite pulsing on primary content after onboarding.
- No animated background that competes with form entry.
- No large confetti for adult admin setup.
- Respect reduced-motion preferences.
- Keep transitions under 300ms for repeated UI, under 1200ms for one-time cinematic moments.

---

## UI density

### Student density

Students need low density during FTUE:

- One primary card per screen.
- One primary CTA.
- Maximum 2–3 secondary concepts.
- Large touch targets.
- Minimal nav.
- Progress indicator visible but not dominant.

After first mission, reveal:

1. Today’s mission.
2. XP/streak.
3. Class or personal progress.
4. One next unlock teaser.

### Teacher density

Teachers can handle moderate density if organized around tasks:

- Checklist layout.
- “Recommended next action” card.
- Class cards with status.
- Assignment shortcuts.
- Empty states with demo data option.

Avoid showing:

- Every report tab.
- Every game feature.
- Full school admin settings.

### Admin density

Admins need information density, but not during the first minute.

First admin view should show:

- Setup status.
- Staff/classes/student counts.
- Safety/content visibility summary.
- Analytics preview or empty-state sample.
- One next governance action.

Avoid:

- Student shop/economy details.
- PvP/clan mechanics as front-and-center modules.
- Long forms without progress grouping.

### Demo density

Demo should use curated density:

- Show enough to create confidence.
- Use annotations and sample data labels.
- Do not expose raw product complexity.

---

## Progressive reveal strategy

### Reveal order for students

1. **Mission identity:** “You are here to complete missions and grow.”
2. **First mission:** one task, one CTA.
3. **Reward:** XP/streak/cosmetic preview.
4. **Progress:** personal or class progress.
5. **Social proof:** class leaderboard or squad, if school policy allows.
6. **Economy:** coins/shop/inventory only after reward relevance is understood.
7. **Advanced game modes:** PvP, clans, raids, tournaments later by level, assignment completion, or teacher/school policy.
8. **Exam hubs:** only when goal, school visibility, or teacher assignment makes them relevant.

### Reveal order for independent learners

1. Goal path.
2. First mission/diagnostic.
3. Personalized next plan.
4. Streak and level.
5. Optional competitive features.
6. Premium features after demonstrated value.
7. Join-school prompt only as a secondary persistent option.

### Reveal order for teachers

1. Class setup.
2. Starter assignment/live mission.
3. Student invite.
4. First activity status.
5. Learning gaps/report preview.
6. Content library.
7. Advanced reports and Cambridge controls.
8. Game settings only after class activation.

### Reveal order for admins

1. School identity and access.
2. Staff/class setup.
3. Safety and content defaults.
4. Engagement/progress dashboard.
5. Reporting exports.
6. Advanced policies.
7. Detailed game economy configuration if needed.

### Feature lock presentation

Locked features should feel like future value, not punishment.

Use:

- “Unlocks after your first mission.”
- “Available when your teacher enables competitions.”
- “Included in School Plan.”
- “Preview with demo data.”

Avoid:

- Red disabled states for normal progression.
- “Access denied” for students unless a safety rule truly blocks access.
- Upgrade modals before first value.

---

## Role-based visual differentiation

### Shared visual DNA

All roles should share:

- Brains Heist identity.
- Byte as a guide/helper.
- Clean card system.
- High-quality typography.
- Subtle futuristic accents.
- Consistent progress language.

### Student aesthetic

**Look:** Mission HUD, neon accents, energetic cards, immersive but sparse.

**Key elements:**

- Mission brief card.
- XP meter.
- Byte companion bubble.
- Reward reveal overlay.
- Limited nav.
- Cinematic first mission entry.

**Do:**

- Use cyan/violet glow carefully.
- Use bold mission titles.
- Make success feel tangible.

**Do not:**

- Show admin-like tables.
- Use dense settings.
- Show five currencies or ten modes upfront.

### Independent learner aesthetic

**Look:** Personal AI learning path, slightly more exploratory and self-directed than school students.

**Key elements:**

- Goal path selector.
- “Your route” timeline.
- Byte plan summary.
- Solo progress dashboard.
- Join-school secondary CTA.

**Do:**

- Make solo feel premium.
- Emphasize autonomy and growth.

**Do not:**

- Make solo look like a stripped school mode.

### Teacher aesthetic

**Look:** Premium classroom cockpit with calm task completion.

**Key elements:**

- Setup checklist.
- Class cards.
- Assignment launcher.
- Student activity summary.
- Report preview.

**Do:**

- Use polished SaaS clarity.
- Keep game elements contextual.
- Surface time-saving benefits.

**Do not:**

- Use intense cyberpunk backgrounds behind teacher workflows.
- Lead with clans/PvP.

### School admin aesthetic

**Look:** Executive operations dashboard.

**Key elements:**

- School setup progress.
- Governance cards.
- Staff/classes summary.
- Content visibility controls.
- Cohort analytics.

**Do:**

- Use professional hierarchy and data clarity.
- Keep accent colors restrained.
- Label demo/sample data clearly.

**Do not:**

- Use student reward effects.
- Put gamified features above safety and setup.

### Demo visitor aesthetic

**Look:** Guided showcase with cinematic polish and annotated clarity.

**Key elements:**

- Choose preview lens.
- Sample student mission.
- Sample teacher insight.
- Sample school dashboard.
- CTA to pilot/demo.

**Do:**

- Move fast.
- Make value obvious.
- Avoid requiring configuration.

**Do not:**

- Expose raw empty dashboards.

---

## Byte’s visual role

### Byte’s job in FTUE

Byte should be the emotional and explanatory bridge between a complex platform and a simple next action.

Byte should:

- Welcome users.
- Explain one decision at a time.
- Reassure users they can change choices later.
- Celebrate first progress.
- Point to the next best action.
- Translate complex school/product concepts into human language.

Byte should not:

- Dominate every screen.
- Replace deterministic navigation.
- Pretend to be a teacher or admin decision-maker.
- Over-chat before the user has completed an action.

### Visual treatment

Recommended Byte form:

- A compact AI orb/assistant icon with expressive states.
- Subtle face/eyes optional, but avoid childish mascot styling.
- Small animation vocabulary: idle shimmer, attentive pulse, success sparkle, thinking scan.
- Can expand into a message card when needed.

### Byte by role

| Segment | Byte behavior | Visual intensity |
| --- | --- | --- |
| Student | Companion and encourager | Medium |
| Solo learner | Coach and path builder | Medium-low |
| Teacher | Setup assistant | Low |
| Admin | Help/guide panel, not mascot | Very low |
| Demo visitor | Tour guide | Medium-low |

### Byte message format

Keep messages short:

- 1–2 sentences.
- One action-oriented CTA.
- Avoid paragraphs.
- Use segment vocabulary.

Example student:

> “Your first mission is ready. Finish it to unlock your progress map.”

Example teacher:

> “Create one class first. You can import rosters later.”

Example admin:

> “Start with access controls. These settings decide what students and teachers can see.”

---

## Sound and motion recommendations

### Sound principles

Sound should be optional, subtle, and never required for comprehension.

Use sound only for:

- First mission launch.
- Correct/complete moment.
- Reward reveal.
- Level-up.
- Demo showcase transitions.

Avoid sound for:

- Admin setup completion by default.
- Form errors beyond accessible visual feedback.
- Repeated hover effects.
- Background loops in school environments.

### Sound style

- Short, soft synth tones.
- Warm success chimes.
- Low-volume UI ticks for mission boot only.
- No arcade blasts.
- No alarm-like failure sounds.

### Accessibility

- Default sound off or very conservative in school contexts.
- Provide user-level sound controls.
- Respect system reduced-motion preferences.
- Ensure all sound feedback has visual equivalents.

---

## Mobile-first interaction patterns

### General mobile principles

- One decision per viewport.
- Bottom-fixed primary CTA where appropriate.
- Thumb-friendly cards.
- Avoid hover-dependent affordances.
- Keep forms short and forgiving.
- Use progress indicators, but do not compress content into tiny steppers.
- Save state after each step.

### Student mobile FTUE

Recommended pattern:

1. Full-screen welcome/mission card.
2. Large path buttons.
3. Swipe or tap through mission brief.
4. First question/task in focused mode.
5. Reward overlay.
6. Dashboard reveal with 2–3 cards.

Avoid:

- Sidebar navigation during FTUE.
- Dense tables.
- Multi-column layouts.
- Tiny leaderboard rows before first mission.

### Teacher mobile FTUE

Recommended pattern:

- Checklist cards stacked vertically.
- Class creation as a short bottom sheet or full-screen form.
- Invite code/share sheet optimized for quick classroom projection or copy.
- Reports summarized as cards, with detail later on desktop.

### Admin mobile FTUE

Admin can be mobile-supported but should not be mobile-optimized at the cost of clarity.

Recommended:

- Show setup checklist and critical approvals.
- Defer dense analytics and bulk management to desktop.
- Make “copy invite link,” “approve teacher,” and “toggle feature visibility” easy.

---

## Reward presentation style

### Reward hierarchy

Rewards should appear in this order of importance:

1. Learning progress: “You improved / completed / mastered.”
2. XP/level progress.
3. Streak or consistency.
4. Currency/cosmetic.
5. Social standing or leaderboard, if appropriate.

This keeps the product educationally credible while still emotionally rewarding.

### First reward reveal

The first reward should be cinematic but focused:

- Darkened overlay or elevated card.
- XP bar fills smoothly.
- Byte gives a concise celebratory message.
- One reward item appears.
- One next action appears.

Avoid:

- Multiple currencies flying everywhere.
- Leaderboard pressure immediately after one task.
- Loot-box mechanics in school contexts.
- Any reward animation that obscures learning feedback.

### Reward language

Use:

- “Mission complete.”
- “XP earned.”
- “New progress unlocked.”
- “Streak started.”
- “Your next mission is ready.”

Avoid:

- “You destroyed them.”
- “Attack unlocked.” during school FTUE.
- “Buy now to continue” immediately after first success.

---

## Mission presentation style

### Mission card anatomy

A mission card should include:

1. Mission title.
2. Why it matters.
3. Estimated time.
4. Difficulty or confidence label.
5. Reward preview.
6. Primary CTA.
7. Optional teacher/school tag if assigned.

Example structure:

- **Mission:** Bio Molecules: First Intel
- **Why:** Find the concepts Byte should train next.
- **Time:** 4 minutes
- **Reward:** 80 XP + streak start
- **CTA:** Start Mission

### Mission brief style

Student mission briefs can feel like a clean HUD:

- Subtle grid background.
- One accent line.
- Byte hint chip.
- Reward preview.
- No more than three supporting facts.

Teacher mission launch should use classroom language:

- “Assign starter mission.”
- “Estimated completion time.”
- “Skills covered.”
- “Students included.”
- “What you will see afterward.”

Admin mission equivalent should be setup-oriented:

- “Configure student access.”
- “Invite first teachers.”
- “Review content visibility.”

---

## Dashboard reveal strategy

### Student dashboard reveal

Do not show the full dashboard immediately after signup. Reveal a simplified home after the first mission:

1. Hero card: next mission.
2. Progress card: XP/streak/level.
3. Context card: class or solo path.
4. One unlock teaser.

Then reveal navigation gradually:

- After first mission: missions, progress.
- After level/streak milestone: shop/cosmetics.
- After teacher assignment or school policy: class leaderboard.
- Later: clans, raids, PvP, tournaments.

### Independent learner dashboard reveal

First solo dashboard should show:

1. Goal path.
2. Today’s recommended mission.
3. Progress streak.
4. Byte recommendation.
5. Join-school later CTA in secondary position.

Premium prompts should appear only after the user sees a plan or completes a meaningful action.

### Teacher dashboard reveal

First teacher dashboard should show:

1. Setup checklist.
2. First class card.
3. Student invite/share action.
4. Starter assignment launcher.
5. Report preview empty state or demo sample.

After student activity:

- Replace empty states with real insights.
- Surface “students needing help.”
- Introduce deeper reports.

### School admin dashboard reveal

First admin dashboard should show:

1. School setup progress.
2. Staff/classes/students summary.
3. Safety/content visibility status.
4. Analytics preview or demo data toggle.
5. One next setup action.

Do not lead with:

- Game modes.
- Student cosmetics.
- PvP/clan mechanics.
- Monetization settings.

### Demo dashboard reveal

Demo should show a choreographed sequence:

1. Student completes sample mission.
2. Teacher sees instant class insight.
3. Admin sees school-level summary.
4. CTA: “Run a pilot” or “Create trial school.”

This is the fastest way to connect emotional engagement to institutional value.

---

## Screen-by-screen north-star FTUE concepts

### School student concept

1. **School confirmation**
   - “You’re joining [School Name].”
   - School logo, class if known, Byte small greeting.
2. **Agent identity**
   - Username/avatar quick confirm.
   - “You can update this later.”
3. **Mission brief**
   - One starter mission or teacher assignment.
   - Estimated time and reward preview.
4. **Focused mission**
   - Minimal chrome.
   - Byte hint available.
5. **Reward reveal**
   - XP, streak, next mission.
6. **Simplified dashboard**
   - Today’s mission, progress, class context.

### Independent learner concept

1. **Solo welcome**
   - “Build your own learning route.”
2. **Goal selector**
   - Daily practice, Cambridge-style prep, IELTS, subject mastery, competition.
3. **Calibration**
   - Quick self-level or diagnostic.
4. **Byte route build**
   - Lightweight animated path creation.
5. **First mission**
   - Focused mission.
6. **Reward + plan reveal**
   - “Your next 3 missions.”

### Teacher concept

1. **Teacher welcome**
   - “Set up your first class in minutes.”
2. **School/trial choice**
   - Join school, create trial class, explore demo.
3. **First class setup**
   - Class name, grade/subject optional.
4. **Starter assignment**
   - Pick recommended mission.
5. **Invite students**
   - Code/link/share.
6. **Teacher dashboard reveal**
   - Checklist + first class ready.

### School admin concept

1. **School setup welcome**
   - Professional, minimal animation.
2. **Verify school context**
   - School name/logo, plan, admin role.
3. **Setup checklist**
   - Staff, classes, student access, content visibility.
4. **Policy defaults**
   - Competitions, AI assistant, leaderboards, exam visibility.
5. **Dashboard preview**
   - Sample or real data.
6. **Next action**
   - Invite teachers or create first class.

### Demo visitor concept

1. **Choose preview lens**
   - Student, teacher, school leader.
2. **Interactive sample**
   - Complete or watch a 60-second mission flow.
3. **Insight reveal**
   - Show what teacher/admin sees.
4. **CTA**
   - Book demo, create trial, continue solo.

---

## Premium SaaS polish rules

### Layout

- Use consistent spacing scale.
- Align content precisely.
- Avoid mixed card styles on one screen.
- Keep max-width readable on desktop.
- Use empty states as designed product moments, not placeholders.

### Copy

- Short, specific, action-oriented.
- Replace generic “Welcome” with context-aware statements.
- Avoid buzzword overload.
- Use school-safe language.

### Forms

- Validate inline.
- Explain why a field is needed.
- Allow skipping where not essential.
- Use forgiving inputs for invite codes.
- Preserve progress if users leave.

### Loading states

- Student: Byte can “prepare mission.”
- Teacher: “Setting up class…”
- Admin: “Applying school settings…”
- Avoid generic spinners when a branded loading state can explain what is happening.

### Empty states

Good empty state formula:

1. What is empty.
2. Why it matters.
3. What to do next.
4. Optional sample/demo data.

---

## What to avoid

### Avoid childish visuals

- Cartoon overload.
- Oversized mascot dominance.
- Bubble typography.
- Random stickers/confetti.
- Patronizing language.

### Avoid excessive clutter

- Multiple competing CTAs.
- Full nav before first value.
- Too many stats/currencies at once.
- Animated backgrounds behind every panel.
- Dense modals stacked on modals.

### Avoid over-gamification

- Combat metaphors in school/admin onboarding.
- Leaderboard pressure before confidence.
- Loot-box reward framing.
- PvP prompts before learning trust.

### Avoid generic SaaS onboarding

- “Tell us about your organization” as the first screen for everyone.
- Multi-step forms before product value.
- Blank dashboards after setup.
- Tooltips over a complicated UI instead of a guided first action.

### Avoid overwhelming first-time users

- Do not explain the whole economy.
- Do not introduce every mode.
- Do not ask for all profile details.
- Do not show reports before data exists unless using a clearly marked sample.

---

## Experience quality checklist before implementation

Before building FTUE screens, each proposed screen should answer:

1. Which segment is this for?
2. What emotion should the user feel?
3. What single action should the user take?
4. What information is intentionally hidden?
5. What does Byte add here, if anything?
6. What is the mobile version of this screen?
7. What happens with reduced motion?
8. What is the first-value metric this screen supports?
9. What is the next reveal after completion?
10. Does this screen feel premium, trustworthy, and specific to Brains Heist?

---

## Recommended design system deliverables before code

1. **FTUE moodboard**
   - Student mission HUD.
   - Teacher classroom cockpit.
   - Admin operations dashboard.
   - Demo showcase.
2. **Role color/token map**
   - Base colors, accents, semantic states, dark/light usage.
3. **Motion samples**
   - Step transition, Byte entrance, reward reveal, dashboard reveal.
4. **Byte visual states**
   - Idle, thinking, hint, success, caution.
5. **Mission card component spec**
   - Student, teacher assignment, admin setup variants.
6. **Reward reveal storyboard**
   - First mission complete, level-up, streak start.
7. **Mobile FTUE wireframes**
   - Student, solo, teacher, admin, demo.
8. **Dashboard reveal wireframes**
   - First-run, post-first-value, returning user.
9. **Copy tone guide**
   - Student, solo, teacher, admin, demo examples.
10. **Accessibility spec**
   - Reduced motion, contrast, keyboard navigation, screen-reader labels, sound controls.

---

## Final recommendation

Brains Heist FTUE should not start as a generic signup wizard. It should start as a **role-aware first mission experience**.

The strongest direction is:

- **Students:** cinematic but minimal mission onboarding.
- **Independent learners:** personal AI learning route with a meaningful first win.
- **Teachers:** calm setup checklist that gets a class ready fast.
- **School admins:** professional control-center setup with governance first.
- **Demo visitors:** short guided showcase connecting student delight to school analytics.
- **Byte:** a restrained AI navigator that explains, reassures, and celebrates without taking over.

If implemented this way, Brains Heist can balance futuristic gamified engagement with educational trust, school professionalism, emotional retention, and premium SaaS polish.
