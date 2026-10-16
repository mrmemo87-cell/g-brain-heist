# IELTS visual verification

This is the implementation record for Visual & UX Bible 1.2.0. Diagnostic Bible 1.10.0 remains authoritative. This infrastructure does not certify the current product as visually verified.

## What runs

- `npm run visual:inventory`: detect page/route inventory drift. Includes route pages and embedded page files, not just the most visible dashboard.
- `npm run visual:candidates`: render actual shared, assessment, result and Programme components with isolated synthetic fixtures; capture candidates; run WCAG checks, browser error checks, network isolation, overflow and navigation-overlap checks. Existing committed references are compared too. Missing references remain unapproved.
- `npm run visual:check`: strict screenshot comparison. Missing references fail. This command never creates or approves reference images.
- `npm run visual:report`: write `.visual-results/coverage.md` and `.json`, including all unchecked surfaces and state gaps. Exit success is report generation only, not acceptance.
- `npm run visual:release`: require current passing browser evidence, complete fixture coverage, named screenshot approval with exact reference hashes, and real-device review. Missing/stale evidence exits nonzero.

The inventory currently tracks 57 route, embedded and shared screen/component surfaces across 33 routes; the initial case matrix contains 79 scenarios (948 browser/mode/viewport combinations). Many inventoried surfaces still need dedicated fixtures and remain unchecked.

Production and the harness bundle the same pinned IBM Plex Sans font files for the existing 400/500/600/700 weights and all supplied unicode subsets. The browser check explicitly loads and verifies those faces before capture. This prevents a fallback typeface from silently becoming a reference image. The font license is served at `/third-party/ibm-plex-sans-license.txt`.

The GitHub workflow installs pinned Playwright browsers, runs normal/performance modes at phone/tablet/desktop widths in Chromium and WebKit and uploads screenshots, accessibility JSON, failure traces, HTML browser report and coverage. Artifact names include the exact commit. Artifacts expire after 30 days: commit approved reference images and preserve the relevant review evidence before expiry. Never treat a missing/expired artifact as a pass.

## Isolation and scope

The visual Vite config only loads synthetic backend fixtures and actual production components/styles. No credentials are loaded from .env files. Unexpected external requests are blocked; unexpected fixture calls fail. It is not the production app entry point, a staging database, a security test or an auth/RLS test. The actual application build does not include this fixture entry point. Keep existing functional/security suites and the named-user pilot separately.

Initial cases cover shared dialogs, all three Exam Mode skill shells with paused/error states, Reading passage navigation/incomplete confirmation, objective result coverage by role, Programme's four top-level sections, loading/empty/error and student screener cards. Pages without fixtures remain explicitly unchecked in the inventory. Do not claim a whole route is verified because its shared button was tested. Extend cases for every required page/state/role, including assigned/targeted practice, Speaking recording, reviews, lessons, reports, content and administration before full release acceptance.

A layout screenshot does not prove audio audibility/playback, recording permissions, keyboard obstruction, recovery on a real school network, 200% zoom, large system text or physical iPhone Safari behavior. Record those device checks explicitly. Browser automation's WCAG scan finds some accessibility defects; it cannot prove complete accessibility.

## Review reference images

1. Open the exact commit's **IELTS browser evidence** workflow artifact. Review actual phone/tablet/desktop screenshots in both modes, WCAG results and failures. Never approve a failing or blank/incorrect fixture.
2. Fix genuine UI defects in production source; fix incorrect fixtures separately. Never hide content, disable a contrast rule or increase pixel tolerance to make a defect disappear.
3. Copy a reviewed candidate to `e2e/visual/baselines/<project>/<case>--<mode>.png`, preserving its exact bytes. Generate candidates and comparisons on the same OS/browser versions; local fallback Chromium captures are diagnostic evidence, not Linux CI reference images.
4. Add an actual review receipt to `reviews.json`: `case`, `project`, `sourceHash` from evidence.json, `imageSha256`, `reviewer`, `reviewedAt`, `evidenceURL`, `result: "approved"`. This is an explicit review decision. Agents must not invent human identity or approval. Use an actual person's approval only when given.
5. Add separate device receipts: `surface`, `sourceHash`, `device`, `browser`, `reviewer`, `reviewedAt`, `result: "pass"`. Include the observations/checks performed and any relevant limitations. No fabricated physical-device pass.
6. Run strict comparisons and the release gate. Any source change invalidates review receipts conservatively and requires review of the current version. Earlier history remains in Git/retained artifacts.

## Activate repository enforcement

In GitHub branch rules for main, require **IELTS browser evidence** and **IELTS visual release gate**, require pull requests, and disallow direct/bypass pushes as appropriate. The connected GitHub tooling currently supports reads of branch rules, not administrative rule writes. This setting is therefore **not configured by committing the workflow** and must be confirmed in repository administration. Vercel deploys main automatically; enforce the merge restriction before calling the visual gate production protection. Do not add a production build command that falsely relies on CI-only local artifacts.

Bootstrap may intentionally fail the strict release gate: initial references, missing page fixtures and device checks are not pre-approved. That failure is the honest coverage status, not a reason to bypass tests or certify all screens. The infrastructure PR is a concrete reviewable result; full visual acceptance remains blocked until the recorded checks pass.


## 16 October reconciliation

Current teacher Today and Lesson Library changes are included. Dedicated production-component fixtures now also cover Lesson Library for teacher/school-admin roles, student School Assignments, student Journey, course batches, released batch materials and the teacher review queue in populated/empty/loading/error states. Synthetic fixtures do not assert authorization, published content, human screenshot approval or real-device acceptance. All missing surfaces remain explicit release failures.

Automated browser checks reproduced insufficient contrast on School Assignments (back link, section label, metadata and retry control) and Journey (back link and subtitle). The production components now use the existing Evidence Blue primary/muted-foreground tokens. These are narrow presentation changes; routes, requests, scoring, saved work and permissions are unchanged.
