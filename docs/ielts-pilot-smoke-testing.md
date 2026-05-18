# IELTS Pilot QA / Playwright smoke testing

This repository now has a Playwright smoke-test foundation for the existing IELTS Academy classroom loops. The suite is intentionally small and mocks Supabase at the HTTP boundary so CI can validate UI wiring without requiring live school data.

## Covered smoke flows

- School admin practice assignment creation:
  - authenticated school admin lands in the School Admin Portal
  - opens the IELTS Practice tab
  - chooses a class and catalog content
  - creates and assigns practice
  - verifies the assignment appears
- Student assigned practice:
  - authenticated student opens Assigned Practice
  - opens the assigned reading item
  - submits the reading item
  - verifies completion status and progress
- Multi-item auto-completion:
  - verifies all required item rows and parent assignment render completed
- Teacher/admin progress:
  - opens IELTS Practice progress and verifies the completed student row
- IELTS Results:
  - opens IELTS Results
  - verifies summary cards and a student row render

## Commands

```bash
npm run test:e2e:ielts
```

The smoke command expects the Playwright CLI to be available in the CI image or local environment. If it is not already installed, add Playwright first and then install Chromium:

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

If CI already starts the app, set `PLAYWRIGHT_SKIP_WEBSERVER=1` and optionally `PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e:ielts
```

## Fixture strategy

The smoke suite seeds deterministic in-test fixtures through Playwright route mocks:

- one school
- one IELTS class
- one school admin
- one student
- one assignment
- one reading catalog item and question

These fixtures are deliberately lightweight. They should catch broken navigation, selector regressions, RPC contract drift, and completion/progress display regressions before larger feature work starts.

## Known manual-testing blockers and risk areas

- Live Supabase RLS/policy behavior is not validated by these mocked smoke tests.
- Browser media/audio behavior for listening and speaking practice remains out of scope.
- Exam Mode and Assignment architecture are intentionally untouched.
- Network timing and real catalog volume still require staging validation.

## Recommended next QA phase

After this foundation is stable in CI, add a small staging-backed Playwright project that uses real seeded Supabase data for the same five flows, then add one cross-browser pass for Chromium/WebKit without expanding into analytics, reports, band estimation, or AI speaking systems.
