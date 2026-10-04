# Academic Profile dashboard

The teacher profile now uses the supplied premium dashboard reference: school workspace header, navy existing navigation, student identity, four summary cards, a structured teacher snapshot, visible learning trends and compact evidence panels. The screen owns its scoped tokens in `AcademicProfilePremium.css`; the workspace treatment is enabled only for the Academic Profiles tool.

## Evidence and report contracts

- Profile RPCs, authorization, academic-year scope, source eligibility, classification and the official assignment average are unchanged.
- Summary and preview counts use the full filtered collection. View all expands the same collection without fetching or reclassifying it.
- The result overview plots official assignment outcomes as disconnected points. Comparable skill trends retain the existing same-skill/focus and separate-date rules.
- Writing sources, finalized feedback and pending-review notices remain distinguishable. Writing scores do not enter the assignment average.
- Missing results remain missing, low-data results remain provisional, and zero confirmed support areas does not imply an absence of learning needs.
- Report generation retains role and archived-year restrictions. The report is rendered in its existing body portal and keeps its existing print styling.

## Visual differences from the generated reference

The real navigation retains Brains Heist's working destinations and uses a 160 px expanded sidebar so longer labels fit. The profile uses the application's existing IBM Plex Sans font and readable 12 px table text. Real evidence and the expandable methodology reference can make the page taller than the generated image. The year field is informational because year selection remains owned by the existing selection page. None of the example's names, scores or counts are hard-coded into the application.

## Verification

The synthetic browser fixture mounts the actual `TeacherPortalShell` and profile through the existing selection flow. It mocks the backend only inside the fixture and never reads or mutates production student data. The fixture HTML is a development entry, not an application production entry.

Run the repository checks with `npm run verify`. Run the browser checks from the repository root with `node scripts/verify-academic-profile-premium.mjs` when Playwright is installed. `PLAYWRIGHT_MODULE_PATH` can point to an existing Playwright module; `PROFILE_BROWSER_EXECUTABLE` and `PROFILE_BROWSER_ARGS` support an existing Chromium installation. `PROFILE_ARTIFACTS_DIRECTORY` chooses the output directory, defaulting to `/tmp/academic-profile-premium`.

The browser checks cover:

- The four summary slots and visible dashboard sections.
- Complete assessment expansion and stable full counts.
- Assessment → skill → question evidence expansion.
- Report preview, print isolation and generated A4 PDF.
- Desktop/tablet/mobile widths: 1448, 1280, 1024, 768, 390 and 360 px.
- Date filtering, rejected inverted ranges and preservation of the last valid scope.
- Returning to selection and restoring the ordinary teacher workspace.
- Empty, archived, long-text, assignment-plus-writing, comparable-date and multiple-subject states.
- Subject switching without retaining another subject's skill rows.
- Browser exceptions, console errors, error overlays and page-level horizontal overflow.

For repeatable screenshots, optional `PROFILE_FONT_DIRECTORY` points to an offline mirror of the application's existing Google font containing `plex-local.css` and its referenced `plex-0.ttf` through `plex-3.ttf` files. Production continues to use its existing font setup.

No database migration, production fixture data or application dependency is added by this change.
