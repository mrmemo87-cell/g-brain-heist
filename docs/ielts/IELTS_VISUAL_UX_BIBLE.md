# Brains Heist IELTS Visual & UX Bible

**Status:** CANONICAL DESIGN CONTRACT — repository acceptance policy
**Version:** 1.1.0
**Effective date:** 2026-10-10  
**Scope:** All Brains Heist IELTS routes, embedded IELTS views, student experiences, teacher workspaces, school and platform administration, screeners, practice tasks, exam interfaces, results, feedback, billing and responsive states.  
**Audience:** Designers, frontend developers, maintainers, Codex/AI coding agents, QA, product reviewers.

> **Mandatory rule:** Read this Bible, [the IELTS Diagnostic Bible](./IELTS_DIAGNOSTIC_BIBLE.md), and [the Themely token reference](./IELTS_DESIGN_SYSTEM_THEMELY.md) before creating or modifying any IELTS interface.

## 1. Authority and conflict resolution

This file is the **source of truth for IELTS visual and UX presentation**. The [IELTS Diagnostic Bible](./IELTS_DIAGNOSTIC_BIBLE.md) remains the **higher authority** for academic meaning, grading, scoring, evidence, readiness estimates, access rules, privacy, assessments, review publication, assignment eligibility and workflow safeguards. A design decision must never alter or imply an exception to those rules. Server-side authority always remains server-side.

**Order of precedence:** (1) security/access and Diagnostic Bible invariants; (2) this Visual & UX Bible; (3) `IELTS_DESIGN_SYSTEM_THEMELY.md` and actual semantic CSS tokens; (4) page-specific implementation details; (5) legacy styling. In case of disagreement, explicitly resolve it in the PR, never silently bypass a higher authority.

This is a *governance document*, not evidence that every screen has passed visual QA. A token migration or green build alone does **not** establish pixel-perfect acceptance.

## 2. Product design character

**Identity:** Evidence Blue — calm, premium, credible, academically rigorous, inviting and readable. Brains Heist IELTS should feel like **one product** regardless of role or skill, not separate microsites.

- Prioritize one obvious next step and clear navigation context.
- Establish hierarchy through spacing, typography and surfaces, not decorative color overload.
- Use clear, concrete, student-safe copy. Never promise an official IELTS result or invent evidence.
- Minimize form friction without hiding the reason, eligibility, prior-use or review safeguards.
- Prefer a light academic canvas. Retain restrained distinctive hero treatments for Prime and low-distraction exam/recording modes.
- No speculative progress labels, decorative “mastered” badges, fake completed states, invented grades, or misleading gamification.

## 3. Themely tokens and source of truth

**Reference:** [Themely — Evidence Blue](./IELTS_DESIGN_SYSTEM_THEMELY.md). **Runtime tokens:** `src/styles/ielts-design-system.css`. **Page implementation:** `src/styles/ielts-experience.css` and existing IELTS-scoped stylesheets. Use semantic variables rather than hardcoded arbitrary colors.

| Purpose | Semantic token | Value |
|---|---|---|
| Canvas | `--bh-ielts-background` | `#F5F7FC` |
| Main surface | `--bh-ielts-surface` | `#FFFFFF` |
| Secondary surface | `--bh-ielts-surface-muted` | `#F5F8FC` |
| Primary ink | `--bh-ielts-foreground` | `#15243A` |
| Muted ink | `--bh-ielts-foreground-muted` | `#4C6076` |
| Primary action | `--bh-ielts-primary` | `#1746B0` |
| Primary action text | `--bh-ielts-primary-foreground` | `#FFFFFF` |
| Secondary action | `--bh-ielts-secondary` | `#EEF3FA` |
| Secondary action text | `--bh-ielts-secondary-foreground` | `#284B72` |
| Accent/focus | `--bh-ielts-accent`, `--bh-ielts-focus` | `#0E7490` |
| Borders | `--bh-ielts-border` | `#DCE5EF` |

Type: **IBM Plex Sans**, fallback Inter/system sans. Base 16px, small 14px; headings weight 700 and tracking `-0.02em`; typical body line-height 1.6. Spacing follows the 4/8/16/24/32/48px scale. Radius: 10/13/24px and pill 999px. Shadows use the three `--bh-ielts-shadow-*` tokens.

Preserve separate semantic success/warning/error treatment. Status must be expressed **in text and accessible metadata**, not color alone. Strong colored surfaces must be contrast-tested against actual foregrounds. Avoid global element selectors that recolor the non-IELTS Brains Heist game, and never normalize all colored cards if doing so obscures academic or workflow state.

### Token changes

To change branding, update the Themely specification, CSS variables, and this document **in the same reviewed PR**. Record the reason, affected components, contrast evidence and screenshots. Do not create page-local competing palettes or silently change token meanings.

## 4. Global page shell and layout

- **Header:** Brains Heist IELTS branding, current area, suitable breadcrumb/back navigation. On school screens show school/programme identity only where authorized.
- **Hero:** page title + purpose + one primary action if appropriate. Compact enough that meaningful content remains visible.
- **Content hierarchy:** summary or status, task/evidence content, then supporting history or secondary actions. Critical warnings appear beside the control they govern.
- **Navigation:** existing Programme tabs (“Today”, “Student progress”, “Review desk”, “Programme team”) remain the canonical top-level structure. Within the Practice Desk keep the genuine Practice history / Assign targeted practice / School assignments controls. Avoid redundant parallel sidebars or nav duplicates.
- **Content width:** readable prose generally 65–75 characters per line; practical workspace max-width around 1100–1200px; long forms use a narrow column with contextual evidence alongside only where space allows.
- **Density:** dashboards may use a tighter rhythm; reading, writing and review content need breathing room. Tables use real headings and horizontal scrolling on small screens rather than clipping.
- **Spacing:** use theme scale, consistent panel padding and section rhythm. Do not impose viewport-height scroll traps on embedded content.

## 5. Reusable component contracts

**Buttons:** one high-priority filled primary action per decision area; secondary actions quieter; links for navigation. Expose loading, disabled, failure and retry states. Disabling requires a nearby explanation when the user could reasonably act to unblock.

**Cards and panels:** white surface, subtle border, restrained shadow, theme radii. Distinguish selectable cards (keyboard-operable, selected state) from passive information panels. Never rely on a hover-only affordance.

**Forms:** labels remain visible, required/optional status explicit, helper/error text adjacent and associated with controls, entered data preserved on validation failure. Confirm irreversible actions. Respect existing academic preconditions.

**Tabs:** semantic buttons with `aria-selected`/`aria-pressed` (as appropriate), clearly visible active state, keyboard focus, stable tab content. Preserve routing and authorization semantics.

**Status and feedback:** distinguish `not started`, `started`, `submitted`, `meaningfully completed`, `review pending`, `review finalized`, and `feedback shared`. No UI decoration may collapse them into a single “done” state. Reading/Listening objective results must never be presented as teacher-reviewed feedback.

**Tables:** captions/headings, empty/loading/error states, sortable state announced when sortable, readable dates, and consistent compact typography; do not put protected answers in unauthorized views.

**Dialogs, menus and notices:** predictable focus management, escape/close behavior where safe, clear scope/action consequences, readable destructive confirmations, no overlay that blocks an in-progress exam or recording unexpectedly.

## 6. Screen-specific blueprints

### 6.1 Teacher Programme workspace
Calm Programme header and school context; four existing tabs; actionable summary first, not a wall of competing cards. Each panel has a clear owner, status and next decision. Preserve school scope, existing permissions, all live filters and real data.

### 6.2 Teacher Practice Desk
The decision flow is **select eligible student → inspect/select material → examine evidence/history/reuse restrictions → record pedagogical rationale → confirm**. Student search, page controls, eligibility, source screener link, task usage, prior assignments, repeat acknowledgement and server-side gates stay visible and functional. The evidence panel is contextual, not a mock score. Previously exposed independent-check material must not become eligible through visual changes.

### 6.3 Student Journey and assigned practice
Show immediate next action, assigned work, saved attempts and progress **with their true statuses**. Do not depict an assignment as completed when only submitted. Keep teacher-shared feedback distinct from automated objective results; explain missing evidence instead of displaying zeros or weaknesses.

### 6.4 Four skill practice flows
A consistent task header, progress orientation, answer area, save/submit action, and response states across Listening, Reading, Writing and Speaking. Accommodate passage/audio controls, timers, word counts, microphone permissions, recording preview and reconnection/interruptions without changing their governing rules. Mobile answer options must be touch-friendly and never obscure source material.

### 6.5 Screeners, exam mode and monitoring
Low-distraction exam canvas, stable timer/audio positions and honest progress. No decorative animation that competes with concentration. Warnings, connectivity, timed/locked states and accessibility must remain clear. Avoid accidental submission, losing responses, exposing answer keys or changing authorized launch restrictions.

### 6.6 Reviews and feedback
Review queues show ownership, skill, submission date, meaningful state and next action. A review editor separates evidence, provisional notes and finalized/shared feedback. Explicitly preserve when only school admin/admin can finalize Writing/Speaking. Prevent visual language from suggesting unpublished feedback is visible to students.

### 6.7 School and platform administration
Shared light administration cards, filters, tables, and confirmation UI across Practice, Results, Analytics, Exams, Settings, Content and monitoring. Preserve embedded host navigation and school scope. Analytics placeholder screens must remain candid when evidence is absent; never fabricate trends, ranks or bands.

### 6.8 Prime and acquisition
May use a restrained high-contrast premium hero, but typography, inputs, navigation and component spacing follow the design system. Keep pricing, entitlement, checkout, limitations and screener-versus-diagnostic claims precise. Theme work does not authorize changing billing behavior.

### 6.9 Empty, error, loading and denied states
Every route must have a specific, plain-language empty state; a usable loading state; actionable error/retry path; and a clear access-denied explanation without leaking protected data. No unexplained blank screens, fake content or spinner loops.

## 7. Responsive, accessibility and motion acceptance

**Mandatory target viewport widths:** 375px, 768px, 1440px. Also inspect 320px for overflow risks and common zoom levels. Cards and forms become single-column when necessary. Navigation remains discoverable without relying on hover; tables and long passages scroll *within intended containers*. No text clipping, overlapping CTAs, side-to-side page overflow or obscured timer/recording actions.

**WCAG 2.2 AA aim:** normal text contrast at least 4.5:1; large text at least 3:1; interactive boundary/focus indicators at least 3:1 against adjacent colors where applicable. Visible focus and accessible names, clear errors, logical tab/focus order, keyboard activation, labels, live status announcements, and adequate target sizes are mandatory. Respect `prefers-reduced-motion`; meaningful loading/progress must work without animation.

No “pixel-perfect” sign-off solely from a CSS change or desktop screenshot. Verify real rendered components, conditional states, representative browsers and role-specific permissions. Keep baseline screenshots in test artifacts when available.

## 7A. Strict responsive acceptance gates — release blockers

**A responsive bug is a release blocker, not a minor cosmetic issue.** A build, token compliance or a CSS media query does not prove a working mobile/tablet experience.

- **Zero overlapping navigation labels or controls.** Every Programme tab must have its own readable and tappable box; no clipped, superimposed or inaccessible labels at any supported viewport. At narrow widths prefer a two-column tab grid, wrapping labels, or an explicitly accessible horizontal scroll control with an obvious affordance; never force a single `nowrap` row that hides destinations.
- **Zero horizontal page overflow** at 320px, 375px, 390px, 768px, 1024px and 1440px except intentional inner scroll containers for wide tables or passages. Verify at 200% browser zoom and with larger system text.
- **No action obstruction:** browser chrome, sticky footers, safe-area insets, on-screen keyboard, audio player, timers or recording controls must not obscure primary actions, validation feedback or answer inputs.
- **Visual hierarchy on phones:** back/navigation, page purpose and next action must remain usable without excessive hero padding. Preserve important academic caveats and student/school identity where relevant rather than hiding them to save space.
- **Inputs, states and reachability:** each tab, action, error, search, form and confirmation must work via touch and keyboard. Verify active, hover-equivalent, focus, disabled, loading, empty and error states; selection remains recognizable without color alone.
- **Evidence is mandatory:** for each redesigned page family capture or review actual browser renderings at phone (375px), tablet (768px) and desktop (1440px), with a written pass/fail record covering navigation, overlap, clipping, scroll, focus, readable contrast and form interaction. Source inspection, screenshots of just one page, or green automated tests alone do not satisfy the gate.
- **Failure policy:** any reproduced responsive defect requires a linked issue/patch, regression check and reviewer verification before signing off a broad UX PR. Never label the experience “pixel-perfect,” “production-verified,” or “mobile complete” while a required viewport/state is untested or failing.

**Required QA matrix:** IELTS Programme Today, Student progress, Review desk and Programme team; Practice Desk history/assign; student Journey/assigned work; four skill practice flows; reviews; screeners/exam mode; school-admin management; Prime and results. Test genuinely populated states as well as loading/error/empty states where access allows. For exam/recording views, verify no timer, audio or submission controls are obstructed.

---

## 8. UX governance: the DO NOT BREAK list

**Never touch while executing a visual-only task:** assessment calculations, eligibility/repetition/exposure guards, submission thresholds, recording duration, score/result authority, review publication rules, school isolation, authorization, Supabase schema/RLS/RPC, paid entitlement/checkout, source provenance and stored student history.

Do not remove controls because they look cluttered. Instead improve grouping and presentation while preserving accessibility and functional affordances. Do not use `!important` or attribute-matching CSS as a blanket substitute for component refactors unless narrowly scoped and verified. Avoid replacing entire working screens with static mockups.

**Change strategy:** small, surgical diffs; preserve routes, state and event handling; prefer shared components and tokens; validate each role/skill before extending; avoid regression-prone global selectors. Significant visual changes need reviewed before/after comparisons at target widths.

## 9. Implementation map

- Canonical academic rules: `docs/ielts/IELTS_DIAGNOSTIC_BIBLE.md`
- Canonical visual/UX rules: **this file**
- Theme reference and token mapping: `docs/ielts/IELTS_DESIGN_SYSTEM_THEMELY.md`
- Semantic CSS: `src/styles/ielts-design-system.css`
- Route/embedded styling: `src/styles/ielts-experience.css`
- Existing page styles: `src/styles/ielts-*.css`, `src/styles/ielts.css`
- React routes: `index.tsx`; school admin IELTS surfaces under `components/school-admin/tabs/`
- Current feature implementation: `src/pages/ielts/`, `src/components/ielts/`, `components/ielts/`

## 10. Definition of done and evidence required

A visual change is **not finished** until all are true:

1. Relevant Diagnostic Bible invariants confirmed unchanged; permissions and evidence flow verified.
2. Theme tokens and component states conform to this Bible; no arbitrary palette introduced.
3. `npm run guard:school-admin-portal`, `npm run typecheck`, `npm run security:migrations`, `npm run build`, `npm test`, and `git diff --check` pass, or failures are disclosed and resolved.
4. At 375/768/1440px, verify populated, empty, loading, validation-error, submitted, completed, and reviewed states as relevant.
5. Test student, teacher, school admin and platform admin views; school permissions and protected data boundaries remain unchanged.
6. Keyboard, touch, focus, audio, recording, contrast, zoom and reduced-motion checks completed.
7. PR contains representative screenshot comparisons and lists any unverified routes or known visual debt. No acceptance claim without evidence.
8. No production merge for a broad redesign while required browser QA is pending; draft status is appropriate.

## 11. Change-control rule for Codex and all AI agents

Before coding: **read both Bibles**, inspect the affected components and their CSS, identify higher-order academic/security invariants, plan minimal UI-only diffs, and list roles/states to QA.

After coding: report files changed, screenshots reviewed, test outcomes, remaining gaps, and whether any nonvisual behavior changed. If a request contradicts a Bible, **stop that specific change and document the conflict** rather than silently weakening a rule.

This Visual & UX Bible is versioned alongside the code. Change it only through an explicit reviewed update. The Themely reference may evolve, but this document governs visual decision-making across the whole IELTS product.


## 12. Native interaction and navigation contract — v1.1.0

This revision implements the owner's request for professional IELTS frontend quality. It strengthens component ownership and testable acceptance without changing assessment, access, data or release rules. Diagnostic Bible **1.9.0** remains authoritative. It does not certify the untested screens or production capacity.

### 12.1 Shared components

`src/components/ielts/IeltsUi.tsx` and `src/styles/ielts-ui.css` define native Evidence Blue buttons, notices, confirmation dialogs, fields, rows, statuses and panels. `IeltsSkillTrack.tsx` owns the common independent/Prime skill-card interaction. New and migrated screens consume semantic classes directly. Do not add attribute-string matching or `!important` to compensate for incorrect markup. Keep compatibility CSS only for screens that have not yet migrated and list that debt in the acceptance record.

Use the loaded IBM Plex Sans faces: **400, 500, 600, 700**. Supported weights apply to headings, badges, SVG text and body text. Do not request invented 750–950 faces. The font token/reference must change together if the supported font is intentionally changed.

### 12.2 Canonical interaction dictionary

| Area | Label | Behavior / destination |
| --- | --- | --- |
| Programme | Today / Student progress / Review desk / Programme team | Retain the four governed sections and permissions. |
| Practice Desk | Practice history / Assign targeted practice / School assignments | Preserve distinct workflows; record selected tool in the URL. |
| Class assignments | New assignment | Opens the focused creation flow. |
| Assignment overview | Filter assignments by class | Filters visible assignment records; never sets creation recipients. |
| Creation | Assign to class | Selects the actual recipients of new work. |
| Creation | Class & instructions → Materials → Review & assign | Preserve entered data across steps and return to the overview. |
| Creation | Confirm & assign to class | Available only after content, recipient, prior-use and repeat checks pass. |
| Saved draft | Retry class allocation / Allocate saved assignment | Allocates the same saved identity; never creates another record. |
| Assignment | View progress | Loads the exact authorized assignment, including closed/archived history. |
| Assignment | Close to new work | Confirm read-only consequences; preserve saved work. |
| Assignment | Archive assignment | Confirm hiding from the active list; preserve history. |
| Archived assignment | Restore as closed | Confirm it returns closed, without accepting submissions. |
| Completed skill track | View progress & feedback | `/ielts/journey`; never invent a skill base route or task ID. |
| Public skill overview | Reading / Listening / Writing / Speaking | Informational cards until a verified discovery destination exists; never dead buttons. |
| Prime | Explore IELTS Prime | Clearly describes optional access; does not promise band improvement. |

A history deep link uses the existing Programme URL with `practice=school&assignment=<saved-id>`. Targeted mode uses `practice=targeted`; history removes these two keys. Preserve other query parameters. Query parameters select presentation only: scoped services must authorize the actual school and saved assignment. Browser back/forward must restore the tool, not silently create work.

### 12.3 Failure and async-state contracts

- Preserve a successfully created assignment identity when allocation fails. The UI must distinguish saved work from confirmed class allocation. Retry the existing class-allocation operation only, with its original class; the existing server uniqueness/authorization contracts still apply.
- Draft rows expose a recovery action after reopening the screen. If creation itself has an uncertain outcome, direct the user to check the list before creating again. This frontend behavior does not claim network-level idempotency for creation; an atomic/idempotent server API requires a separately reviewed change.
- Prevent rapid-click duplicate creation and lifecycle mutations synchronously. Disabled-state rendering alone is insufficient.
- Keep detail selection authoritative while status/class filters change. An assignment absent from the filtered list is not an authorization failure or a reason to discard its detail.
- Ignore stale list/catalogue/detail responses when a newer request, school context or unmount supersedes them. Never show earlier work under a newly selected title.
- Dialogs name their consequences, trap keyboard focus, isolate background interaction, restore focus, and retain failure state until the operation succeeds or the user cancels.
- Selected materials must preserve their provenance label. Changing skill clears the old material identity and stale metadata before another selection.

### 12.4 Release evidence

Navigation tests cover unavailable, unfinished, completed and locked skill cards; assignment tests cover scoped usage, intentional repeats, partial allocation recovery, rapid clicks, history outside active lists, independent list filters, and contextual browser back/forward. Existing authorization, academic and persistence suites remain mandatory.

Finite entrance motion may remain; remove continuous CTA movement and decorative loops. Presentational animation cannot decide application state or delay save/feedback. Keep GSAP targets component-scoped and respect reduced motion.

The full rendered-screen matrix in sections 7A and 10 remains a release gate. Passing DOM tests, typecheck or a build never replaces browser/device acceptance. Record covered and uncovered families in `IELTS_FRONTEND_QUALITY_2026-10-10.md` before promoting a broad redesign. Do not silently waive this gate or declare every screen professional without evidence.
