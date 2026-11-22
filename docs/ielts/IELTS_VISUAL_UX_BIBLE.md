# Brains Heist IELTS Visual & UX Bible

**Status:** CANONICAL DESIGN CONTRACT — repository acceptance policy
**Version:** 1.19.0
**Effective date:** 2026-11-22\
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
- **Navigation:** the teacher tab bar (section 13.12: Today, Reviews, Students, Speaking, then the management tabs) is the canonical top-level structure, and Today's IELTS map lists the same destinations. Within the Practice Desk keep the genuine Practice history / Assign targeted practice / School assignments controls. Avoid redundant parallel sidebars or nav duplicates.
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
Calm Programme header and school context; the teacher tab bar of section 13.12; actionable summary first, not a wall of competing cards. Each panel has a clear owner, status and next decision. Preserve school scope, existing permissions, all live filters and real data.

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
| Programme | Today / Reviews / Students / Speaking / Assign / Batches / Lessons / Exams / Team | Section 13.12. Permissions per tab are unchanged; Speaking is open to every reviewing teacher. |
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

## 13. Closed-loop presentation contract — v1.2.0

This section adds the presentation rules for Diagnostic Bible 2.0.0. The Diagnostic Bible decides what these elements mean; this section decides how they look.

### 13.1 Indicative band range (Diagnostic Bible section 9.5)
- Show the range as the headline, for example **6.0–7.0**, set in the same weight as the raw score. Never show the central value alone or larger than the range.
- Always visible beside it:
  - "Indicative band range";
  - "Not an official IELTS result";
  - a confidence chip in text (for example "Confidence: low"), not colour alone;
  - the form code, the date and the raw score (for example "M1 · 29/40").
- A range bar on the 0–9 scale may show the span. It never animates up to a score.
- Ineligible evidence, such as practice, screeners or partial forms, shows the raw score and constructs, with "Indicative range needs a full mock".

### 13.2 Learning states (Diagnostic Bible section 8A.4A)
- Teacher views show the state name followed by "(provisional policy v1)" in secondary text, plus a "Why?" disclosure listing the sources, counts and dates.
- Student views use the plain section 15B.2 wording and no policy names.
- States use icon, text and colour together. "Persistent difficulty" is never red-alarm styling; use the neutral attention style plus a next-step action.

### 13.3 AI practice feedback (Diagnostic Bible section 10.5)
- Place the label "AI practice feedback — your teacher may adjust it" at the top of the feedback panel, not in a footnote.
- For learners without a school (Diagnostic Bible 10.6) the label at the top is "Brains Heist feedback — an estimate, not an official IELTS result". Never show "teacher" wording to them.
- When a teacher has confirmed the feedback, the label changes to "Checked by [teacher name], [date]".
- Quoted examples from the student's work are highlighted inline, each with one revision action.
- Practice indications appear as ranges per criterion, never as an overall band. Writing practice adds the AI estimated task band of 13.10.

### 13.4 Weekly loop batch view (Diagnostic Bible section 15B.5)
- One screen per batch, with four groups in this order:
  - needs next step;
  - improving;
  - stuck after practice;
  - practice bank gaps.
- One primary action: "Assign this week's practice".
- Shared targets show the matching extension lesson as a secondary suggestion.
- The batch view must load as one scoped, paginated read; no per-student requests.

### 13.5 Report a problem and paper capture
- Every practice task has a quiet "Report a problem" text control, reachable by keyboard, that opens a short form.
- The mock capture screen is keyboard-first: one row per student, one column per item, Tab moves to the next item, and the save state is visible per row.

### 13.6 Self-paced course (Diagnostic Bible section 10.6)
- The course map is a single winding path of units; milestones group units; the current unit is always identifiable by text ("You are here"), not only by colour or motion.
- A lesson is shown one section per card with visible step progress and Previous/Next buttons (44 px), swipe optional; every card remains readable with reduced motion.
- Celebration motion (confetti) is decorative, short, never blocks input and is skipped under reduced motion.
- Criterion estimate ranges may be drawn on a 0–9 scale bar; the bar always carries the text range and never an overall band.

### 13.9 Speaking transcripts and Part bands (Diagnostic Bible section 10.7) — v1.8.0
- Criterion colours: Fluency & Coherence blue, Lexical Resource violet, Grammar amber, Pronunciation rose. Every highlight also carries a text tag (FC, LR, GR, P with a number) and a numbered note, so meaning never relies on colour alone; a colour key with counts sits above the transcript.
- *To improve* highlights add a wavy underline; *done well* highlights do not. Tapping or pressing Enter on a highlight shows its note.
- Pronunciation words show the word, the dictionary transcription between slashes and a 44 px ▶ Play button; the source of the transcription is named in small print. Without device speech, the button is hidden.
- Teachers see transcripts open. Students see them in a collapsible section, closed by default.
- Interviews read as a dialogue: each teacher question sits on its own grey line with a "T" tag and is never coloured or marked; the colour key adds "Teacher's questions".
- Feedback made before highlights existed shows a short note instead of an empty colour key, and teachers get an "Upgrade with highlights and pronunciation" button. "Word-by-word pronunciation was not checked" replaces any claim that no words stood out.
- **Interview review is one guided screen (1.9.0).** A three-step bar (1 Listen and read, 2 Check feedback, 3 Bands and share) shows what is done. Transcripts, the feedback editor and the band panel sit in that order on one page; the AI draft starts by itself when the teacher has written nothing yet, and "Restore my notes" undoes it. Step 3 has a 0–9 half-band picker for each criterion, each Part and the Teacher Speaking band; the plain criterion average is shown as "Average of your criterion bands", never pre-filled. One "Share with student" button sends feedback and bands together; the button stays enabled and says exactly what is still missing when pressed. No message ever asks the teacher to share before grading.
- **AI estimates (1.11.0, Diagnostic Bible 10.10).** Step 3 opens with a violet bar: a spinner while AI estimates, then "AI estimates are ready" with the basis and a "Use the AI estimates" button. Each band tile shows an "AI estimate 5.5" chip and the one-line reason; the chip turns orange when the teacher's band differs. The overall panel shows the AI estimate under the criterion average. Nothing about Speaking AI estimates appears in any student view.
- **Result polish (1.12.0).** Once feedback is shared, the student page opens straight on the result hero (the "Your Speaking starting point" card stays only while waiting, or for same-form and interruption notes). People are shown by full name when stored. On phones the criterion tiles sit two by two, Part names stay readable on the dark card and the hero labels wrap left. In step 3 a short amber note appears when the Teacher Speaking band is above or below every criterion band. The AI's "Pronunciation was not assessed" placeholder can never be shared: Share lists it as still to do, and the server refuses it. Cached AI drafts written with older instructions are not reused.
- **Floating player and listening-based Pronunciation draft (1.13.0, owner request 2026-11-18).** The recording played last stays in a small bar fixed to the bottom of the interview page (play/pause, back and forward 5 seconds, position, speed, close; 44 px targets, labelled controls). It controls the clip's own audio element, never starts by itself, and the page gains bottom padding while it is open so it cannot cover Share or any other action. When the AI draft leaves the "not assessed" Pronunciation placeholder and the audio listening pass (Diagnostic Bible 10.7) listed mispronounced words, those words and tips become the Pronunciation draft with the recording they were heard in as its audio span; the teacher checks and confirms it like every other criterion. When the listening pass listed nothing, the placeholder stays, still cannot be shared, and Share tells the teacher the comment is theirs and shows the teacher-only AI listening note. No band is set and nothing is built from transcript text.
- **Words in time with the audio (1.14.0, owner request 2026-11-18).** When a recording has word times, the word being spoken is ringed and underlined in its transcript while that recording plays (never colour alone), and tapping any word, the teacher's questions included, opens a small "Play from here? 1:23" prompt with Play and Cancel (44 px targets, Escape and outside tap close it). Play opens the recording if needed and starts it at that word in the floating player. The page never scrolls by itself to follow the audio. Word times come from the transcription the AI draft already makes; a recording without them shows the teacher a "Match words to the audio" button that says it runs one extra transcription per recording. The timed words are never displayed, scored or used as evidence; they only place times on the transcript already shown, and students get them only for transcripts they may already see. Without word times the transcript reads exactly as before.
- The interview student result leads with the **Teacher Speaking band** as the hero number, then the three Part tiles and four criterion tiles, then feedback and collapsible transcripts, with "Checked by", the date, "Not an official IELTS result" and "Confidence: low".
- The student result leads with a hero card: the teacher's Part band as the headline, "Checked by [teacher], [date]" and "Not an official IELTS result", then one tile per criterion, then the transcript, then teacher feedback. Interview results show three Part tiles. No band animates up to its value.

### 13.10 Writing highlights and the AI estimated task band (Diagnostic Bible section 10.9) — v1.10.0
- Writing uses the same highlight panel as Speaking. Criterion colours: Task Response / Task Achievement teal (TR / TA), Coherence & Cohesion blue (CC), Vocabulary violet (LR), Grammar amber (GR). Each highlight carries its tag and number, and a colour key with counts sits above the essay.
- The essay keeps its paragraphs and uses the reading font. *To improve* highlights have a wavy underline. The note shows the student's words struck through, an arrow, and the correction in a green chip, so the fix is readable without colour.
- Filter buttons show All, To improve and Done well with counts.
- The AI estimated band sits in a gradient card above the criteria: "AI estimated band · Task N", the number, "Likely range x–y" directly under it, and "Not an official IELTS result". School learners see "Waiting for your teacher to confirm"; teachers see "Suggestion only · you confirm or change it in Your bands".
- Teachers see the highlighted essay open. Students see it in a collapsible section, closed by default inside the practice panel and open on the finalized result.
- The teacher's "Your bands" panel shows the AI estimate with a "Use AI bands, then check" button and an "AI estimates x · you decide" hint under the task band. Nothing is filled in automatically.
- The finalized student result uses the 13.9 hero: "Task N band" from the teacher, "Checked by your teacher, date", the earlier AI estimate in a quiet chip, criterion tiles, the essay, then teacher feedback.
- On a screener, the teacher's AI draft shows the highlighted essay under the original, with the line "Only you see these highlights".
- **Writing screener starting band (1.15.0, Diagnostic Bible 10.11).** In the teacher review a "Starting band" card sits above the next step: the AI starting band in the 13.10 gradient card (label "AI starting band · Task 2", the number, "Likely range x–y", "Suggestion only · you confirm or change it", "Not an official IELTS result"), then a band menu (44 px, 1.0–9.0 in half bands) with "Use AI band x" and, once feedback is shared, "Save starting band". A changed band shows "You changed the AI band (x → y)". Sharing an answered essay without a band shows "Choose a starting band for this essay before sharing." The student result shows the teacher's band in the same gradient card under the result heading: "Writing starting point · Task 2", the number, "Likely range x–y", and chips "Checked by your teacher", "Not an official IELTS result" and "One Task 2 essay · Confidence: low"; while waiting a quiet blue note says the starting band will appear after the teacher checks the essay. The AI band alone never appears in any student view.
- Highlights now include fixed-check findings (missing spaces, capitals, double spaces, common misspellings) styled like any other *To improve* highlight, so the filter counts can be higher.

### 13.11 Speaking practice mock with a recorded examiner (Diagnostic Bible section 10.12) — v1.16.0
- **Low-distraction recording canvas** (section 6.5): one centred card at most 640 px wide on the light canvas, no navigation chrome, no animation except a pulsing recording dot that stops under reduced motion.
- **Labels on every screen:** three pills reading "Speaking practice mock", "Recorded examiner" and "Not an official IELTS test", then the current part ("Introduction", "Part 1", "Part 2", "Part 3", "End").
- **One action per screen,** in this order: Before you start (time, quiet place, headphones, each question plays once) → the exact recording wording with "I agree, continue" → the voice-improvement question only where the school has recorded parents' agreement, with "Yes" and "No" as two equal buttons → loading the examiner's voice → sound check → room check → microphone check (record, hear yourself back) → the test → saving → Done.
- **Big targets:** main buttons are at least 56 px high and 18 px text, full width on phones. Body text on these screens is 18–20 px.
- **Recording state in text, not colour alone:** a red dot plus the word "Recording", and the time left in large tabular digits. "I've finished" stays disabled for the first 3 seconds to prevent an accidental tap. In Part 1 "Hear the question again (once)" sits beside it; using it pauses the recording and the timer while the question plays.
- **Part 2:** the cue card has a blue border and stays visible while the student prepares (one-minute timer from the server clock) and, shortened to the topic, while they speak (up to 2:00, stops by itself). A notes box is labelled "Notes (not saved)".
- **Questions are heard, not shown,** in Parts 1 and 3. The examiner's words never appear on screen apart from the cue card.
- **Connection problems** show "Waiting for connection…" with "Your answers are safe", never an error that suggests work was lost. A quiet line under the card counts answers still being saved. Leaving the page during the test asks for confirmation; the screen is kept awake where the browser allows.
- **No praise, scores or bands** anywhere in the mock or on its Done screen ("Your teacher will check them and share feedback with you"). The Journey shows a card only while a mock is ready or in progress.
- **Teacher panel (1.17.0).** In the Speaking studio, under the selected student, a "Speaking practice mock" card with the pill "Practice mock · Recorded examiner · Not an official IELTS test", one sentence on what it is, and one primary "Assign to [name]" button, disabled with a reason while that student has the mock open. Rows show the true state in words: Assigned · not started (Cancel), Started by the student, Finished · still saving (Retry saving), Ready for your review (Review →), Feedback shared, Cancelled, plus the count of interrupted or lost answers. The mock choice defaults to "Automatic · one they have not had" (1.17.1); specific mocks stay listed. When the teacher has found more than one student, a secondary "Give everyone listed a mock (N)" button mixes the mocks across them, and one plain message says how many were assigned and how many were skipped because a mock is open or every mock is done.
- **Review (1.17.0).** The sitting line reads "Practice mock · Recorded examiner · unsupervised". Under the original recordings, "Questions and answers" lists each part's answers with the question text and a 44 px "▶ 0:32" button that plays from that answer, marks interrupted answers in words and names questions with no surviving audio. The student result's hero reads "Speaking practice mock · Recorded examiner · teacher-checked", "Teacher Speaking band · practice mock", and adds a "Recorded examiner · unsupervised practice" chip; the student's answer list shows times only, never the question text.
- **Owner studio (1.17.0), /ielts/speaking-mock-studio.** Packages with their approval and publication state, then each script version. A version shows "Still needing a voice: N lines · C characters" and says nothing is generated until the owner agrees. Each line shows its number, kind, part, answer time and exact text; "Approve" stays disabled until the owner has opened the audio player for that exact file, and "Reject" needs a short note. "Use this version for students" is available only when every line is approved and the package is approved. Package approval needs six named checks and a note; publication needs a note.

### 13.12 Teacher IELTS map and Speaking desk — v1.18.0

Owner request (2026-11-22): teacher pages "are in several areas and not clearly following a unified pattern"; make the IELTS map easy to see.

- **One tab bar.** Today · Reviews · Students · Speaking, then (programme managers) Assign · Batches · Lessons · Exams, then Team. Phones show Today, Reviews, Students and Speaking, and the rest under More. Every teacher destination is reachable from this bar; nothing teacher-facing lives only in a folded box.
- **IELTS map on Today.** After "Needs you now", one card lists every area once, grouped by the teacher's job: Check work, Give work, Teach, Know your students, Run tests, Set up. Each entry has an icon, a name, one plain line and a count where one is known. It replaces the separate shortcut tiles and "More tools". Areas a teacher may not use are not shown.
- **Speaking desk (Speaking tab).** Practice mocks first: one button gives a new mock to everyone without one open (the server's mix rule, Diagnostic Bible 10.12), filter chips with counts (To review, Doing it now, Not started, No mock, Reviewed), and one row per student with the true state and one action (Review, Open, or Give a mock). Finished mocks waiting for the teacher sort first. Then the face-to-face interviews card. Mock rows never show a band; they are practice.
- **Assign (1.19.0).** The former Practice tab is **Assign** ("Assign work"). It opens with **Give new work**: four choices side by side — a whole class, a course batch, one student (targeted), a Speaking practice mock — each opening its existing governed flow. Everything already given follows below, and the Practice Desk keeps its own Practice history / Assign targeted practice / School assignments controls (section 12.2). The separate "Create an assignment" scope screen is retired; its links open Assign.
- **Reviews include Speaking practice mocks (1.19.0).** A finished, unreviewed mock appears in Reviews and in Today's "Needs you now" as "Speaking practice mock · mock X", for every teacher allowed to review that student, and counts toward "To review".
- **Acceptance.** Rendered at 375, 768 and 1440 px with no overflow, readable chips and 40 px or larger controls; DOM tests cover the tab list, the map groups for managers and non-managers, desk ordering and the give action.

## 14. Native app motivation layer — v1.4.0

This section applies **only inside the installed iPhone and Android apps** (`isNativeApp()`). The website keeps sections 12.4 and 13.6 unchanged. Where this section allows more than 12.4 or 13.6, it overrides them for the app only.

### 14.1 Allowed surfaces
The 3D Blaze, lighting, sound and haptics may appear on: the course map (`/ielts/course`), the IELTS home, course unit pages, vocabulary steps, the streak bar and streak sheet, the habit and unit-complete celebrations, league, growth and journey screens, and the Android home-screen widget. Continuous animation (Blaze idling, flickering, embers) is allowed on these surfaces.

### 14.1a Website: animated Blaze only
On the website, the animated 3D Blaze (14.2) may appear on the same 14.1 surfaces, and only there. It is silent (no sound, no vibration, no motion-permission prompt) and adds no other effect from this layer; 12.4 and 13.6 still govern everything else on the website. The model is loaded after the page, from a compressed file of about 1.4 MB that the browser keeps, and only while Blaze is visible; the still Blaze shows until the 3D one is ready. "Auto" keeps him still on low-end devices (browser reports ≤2 GB memory, or, when memory is unknown, ≤2 CPU cores, because browsers report cores unreliably); reduce motion and Effects Off keep him still everywhere; the Effects control (14.5) is shown with Blaze on the website too, without the sounds switch. 14.3 applies unchanged.

### 14.2 Interaction
In the app, the live Blaze is the animated 3D Blaze character (public/mascot/brains-heist-blaze.glb, made from the owner's Blaze artwork) with eight moves: idle, greet, jump, cheer, dance, clap, laugh and a sad droop (laugh is kept in the file but not used in the app). He greets once when he appears, idles, cheers in celebrations and droops when weak. Blaze reacts to taps (a short move such as jump, cheer, wave or clap with flare, sound and vibration; the sad droop and a yawn when weak) and to tilting the phone. It grows with the streak: spark (0 days), flame (1+), bigger blaze (7+), blue fire (30+), crowned legend (100+). In the evening (from 18:00) when a streak exists and today is not done, Blaze is visibly weak and flickering. A local evening reminder (about 19:00, never at night) may say so.

### 14.3 Quiet surfaces — never
No motivation animation, sound or haptic from this layer during IELTS screeners, diagnostics, mocks, Exam Mode, timed tests, practice tasks, recordings, results or reviews (anything under `/ielts/` other than the 14.1 list, plus `/exam`). Assessment screens keep section 6.5.

### 14.4 Celebrations
Up to about 4 seconds, tap-dismissable, never block input, saving or the next step, and never delay feedback (12.4 still applies to application state).

### 14.5 Student control and accessibility
An "Effects: Full / Light / Off" setting is always available with Blaze. Sounds have their own on/off switch and use the phone's media audio (on iPhone the silent switch also mutes them). The phone's Reduce Motion setting turns the layer off and shows the still Blaze. Phones with ≤4 CPU cores or ≤3 GB memory default to Light (30 fps, fewer embers, no lighting effects). The 2D SVG Blaze remains the fallback when WebGL is unavailable.

### 14.5a Shared sound set
The app uses one recorded sound set for Brains Heist and IELTS (public/sounds/mascot, about 190 KB): answer chime and gentle "boop", unit/lesson complete, streak whoosh and milestone roar, a sleepy yawn when Blaze is tapped before today's practice, an icy shimmer once when a streak freeze was used, cat greeting and tap sounds, and a battle win. Each is 0.8–3 s, quieter than the device's normal media level, and follows 14.5 (Sounds switch, Effects Off, Reduce Motion) and 14.3 (never on quiet surfaces). The IELTS website stays silent.

### 14.6 Honest meaning
Blaze's size, colour and crown show only the practice streak. They never imply an IELTS level, band, readiness or progress beyond the streak; section 2's "no misleading gamification" still applies.

### 14.26 Revision record — 1.19.0 (2026-11-22)

Step 2 of the owner-approved teacher IELTS map: the Practice tab becomes Assign with "Give new work" (four ways to give work); the "Create an assignment" scope screen is retired; finished Speaking practice mocks join Reviews and "Needs you now". Assessment, access and review rules are unchanged.

### 14.25 Revision record — 1.18.0 (2026-11-22)

Owner request (2026-11-22, "Go and stay creative and smart"): one IELTS map for teachers. Adds section 13.12 (tab bar with Speaking, the IELTS map on Today, the Speaking desk) and updates sections 4, 6.1 and 12.2 to the real tab set. Removes the 1.17.2 Speaking button from the independent IELTS home: teachers land in the programme workspace, so it never reached them. Assessment, access and evidence rules are unchanged.

### 14.24 Revision record — 1.17.2 (2026-11-22)

Owner report: a teacher could not find the Speaking page. IELTS home's School tools now show "🎙️ Speaking: interviews and practice mocks →" (to `/ielts/speaking-pilot`) to the same teachers who see the Review Queue. No other change.

### 14.23 Revision record — 1.17.1 (2026-11-22)

Owner request (2026-11-22): more mocks so students do not all answer the same questions, with an automatic mix. The Speaking practice mock teacher panel (section 13.11) gains the "Automatic" default and the "Give everyone listed a mock" button. Diagnostic Bible 2.7.1 section 10.12. No other screen changes.

### 14.22 Revision record — 1.17.0 (2026-11-21)

Teacher, review and owner screens for the Speaking practice mock (section 13.11, Diagnostic Bible 2.7.0 section 10.12). Owner instruction: show the exact lines and their number before any paid generation, and approve audio per line. The only existing-screen changes are the sitting label, one panel in the Speaking studio, one answer list in the review, and practice-mock labels on the student result.

### 14.21 Revision record — 1.16.0 (2026-11-21)

Owner request (2026-11-21): a Speaking mock students take alone with a recorded examiner, "very simple and easy" for young students with weak English, with one clear action per screen, big buttons, a microphone check, visible timers and a clear recording state. New section 13.11. Diagnostic Bible 2.7.0 section 10.12. No existing screen changes, apart from one card added to the student Journey.

### 14.20 Revision record — 1.15.0 (2026-11-21)

Owner request: every Writing screener shows a starting point to the teacher and the student, and the essay check marks every mistake. Section 13.10 adds the starting band card for teacher and student. Diagnostic Bible 2.6.0 sections 10.9 and 10.11.

### 14.19 Revision record — 1.14.0 (2026-11-18)

The owner approved word-by-word highlighting during playback and "play from here", with no extra cost for new interviews and one extra transcription per older recording only when a teacher asks. Section 13.9 adds the presentation rules. Diagnostic Bible 2.5.1 is unchanged: the transcript still carries no score, timed words are not shown or assessed, and access follows the transcript.

### 14.18 Revision record — 1.13.0 (2026-11-18)

Owner request after reviewing the interview screen: keep the recording controls in reach while scrolling, and stop asking the teacher to replace the "not assessed" Pronunciation note when the listening pass already heard specific words. Section 13.9 adds the floating player and the listening-based Pronunciation draft. Diagnostic Bible 2.5.1 is unchanged: pronunciation still comes only from audio, the placeholder still cannot be shared, and the teacher confirms everything. Word-by-word highlighting during playback and "play from here" need word timings that are not stored yet and are not part of this version.

### 14.17 Revision record — 1.12.0 (2026-11-14)

After the owner reviewed what Aitegin and Dair saw: result-first student page, full names, phone layout, overall-band check, no shared placeholders, no stale AI drafts.

### 14.16 Revision record — 1.11.0 (2026-11-14)

Teacher-only Speaking AI band estimates in step 3 (Diagnostic Bible 2.5.0 section 10.10).

### 14.15 Revision record — 1.10.0 (2026-11-14)
**Authority.** Owner request on 2026-11-14 for Writing review with the Speaking-style colour highlights, an estimated band the teacher confirms, and feedback students find genuinely useful. Diagnostic Bible 2.4.0 section 10.9 defines what these mean.

**Change.** Added 13.10; 13.3 cross-reference.

### 14.14 Revision record — 1.9.0 (2026-11-14)

Guided one-screen interview review and the Teacher Speaking band hero (Diagnostic Bible 2.3.0 section 10.8), after the owner found the separate share-then-grade step confusing.

### 14.13 Revision record — 1.8.1 (2026-11-14)
**Change.** 13.9: interview dialogue layout with grey teacher lines, legacy-feedback note and upgrade button, honest wording when pronunciation was not checked.

### 14.12 Revision record — 1.8.0 (2026-11-13)
**Authority.** Owner request on 2026-11-13 for colour-highlighted Speaking transcripts, pronunciation transcription with a play button, Part bands, and a premium student result with a collapsible transcript. Diagnostic Bible 2.2.0 section 10.7 defines what these mean.

**Change.** Added 13.9 (criterion colours with text tags, highlight notes, pronunciation word cards, collapsible student transcript, Speaking result hero).

### 14.11 Revision record — 1.7.1 (2026-11-07)
**Change.** 14.1a low-end rule for the website now uses reported memory first (cores only when memory is unknown); the owner's 16 GB laptop reporting 2 cores was wrongly kept still. Diagnostic Bible unaffected.

### 14.10 Revision record — 1.7.0 (2026-11-07)
**Authority.** Owner decision on 2026-11-07 to show the full animated Blaze on the website, after the download, battery and calm-website trade-offs were explained. Diagnostic Bible 2.1.0 unchanged; no scoring or assessment impact.

**Change.** Added 14.1a (website animated Blaze, silent, same surfaces, still on low-end devices). The IELTS website remains silent (14.5a); quiet surfaces (14.3) are unchanged.

### 14.9 Revision record — 1.6.0 (2026-11-07)
**Authority.** Owner instruction on 2026-11-07 to use the owner's Blaze artwork as the animated 3D Blaze in the app. Diagnostic Bible 2.1.0 unchanged; no scoring or assessment impact.

**Change.** 14.2 now names the animated character and its moves. Surfaces (14.1), quiet surfaces (14.3), celebration limits (14.4), controls and fallbacks (14.5) and growth meaning (14.6) are unchanged; streak tiers still show through size, glow, embers and crown.

### 14.8 Revision record — 1.5.0 (2026-11-06)
**Authority.** Owner instruction on 2026-11-06 to use the shared Brains Heist sound set in Brains Heist and IELTS. Diagnostic Bible 2.1.0 unchanged; no scoring or assessment impact.

**Change.** Added 14.5a. No other section changed.

### 14.7 Revision record — 1.4.0 (2026-11-05)
**Authority.** Owner approval on 2026-11-05 of the native app motivation layer (3D Blaze with tap and tilt, growth tiers, evening weakness and reminder, home-screen widget, unit-complete celebration, app-wide haptics), after the conflict with 12.4 and 13.6 was raised. Diagnostic Bible 2.1.0 unchanged.

**Change.** New section 14. Sections 1–13 are unchanged for the website.

### 13.7 Revision record — 1.3.0 (2026-11-01)
**Authority.** Owner instruction on 2026-11-01 (self-paced learners have no teacher; premium course presentation) and Diagnostic Bible 2.1.0.

**Change.** Section 13.3 adds the label for learners without a school; new section 13.6 covers the course map, lesson cards, celebration motion and estimate range bars.

### 13.8 Revision record — 1.2.0 (2026-10-19)
**Authority.** Owner instruction on 2026-10-19 aligning the Bibles with best practice for results, and Diagnostic Bible 2.0.0.

**Change.** New presentation contracts for:
- indicative ranges;
- provisional learning states;
- AI feedback labels;
- the weekly batch view;
- problem reporting;
- mock capture.

Sections 1–12 are unchanged, and the release evidence in sections 7A and 10 applies to all new screens.
