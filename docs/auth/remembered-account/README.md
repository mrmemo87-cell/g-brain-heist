# Remembered-account sign-in — 27 October 2026

Returning users can recognize their account on both the main Brains Heist sign-in and IELTS sign-in screens. One shared component and a versioned local hint support both screens. IELTS keeps its existing post-authentication destination.

## Behavior

- Remembering an account is opt-in. A successful authentication stores only user ID, display name, email, sign-in method and a 90-day expiry. No password, session token, school, role or academic data is copied into the hint.
- Google accounts offer **Continue as [name]**, passing an encoded OAuth login hint through the existing SDK. **Use another account** requests Google's account chooser.
- Password accounts prefill email and focus the password field, with browser password-manager autocomplete. The account card never authenticates anyone.
- **Use another account** dismisses the hint without deleting it. A successful sign-in with remembering unchecked removes the previous hint. **Forget this account** removes it immediately, including a pending consent intent. Refreshing an existing session cannot recreate a forgotten hint.
- Sign-out retains only an already-consented display hint. Existing SDK session persistence, token refresh, authoritative bootstrap, programme access and school isolation continue to govern actual access.
- Storage corruption/expiry fails closed. Blocked storage does not prevent sign-in. Private sessions cannot guarantee persistence after closure.
- IELTS now exposes the existing email/password sign-in service as an alternative. Google remains its account-creation path. No new authentication provider or database operation is introduced.
- Returning main-app users see the sign-in card before the marketing hero on phones/tablets. The help button sits below the card rather than floating over its controls. Choosing another account restores the visitor layout. Desktop branding is retained.

## Verification

Contract references: IELTS Diagnostic Bible **2.0.0**, Visual & UX Bible **1.2.0**, Evidence Blue token reference. Scoring, assessments, content, attempts, historical evidence, RLS, RPCs and entitlements are unchanged. No migration or extra network request is required for the display hint; no capacity claim follows.

- Eleven focused tests cover opt-in, successful-auth-only persistence, field allowlisting, expired/corrupt hints, forgetting, identity switching, Google login hints, repeated taps, password prefill/focus, route intent, provider failure/retry, blocked storage, and the shared auth observer.
- Real React screens with production-built CSS were rendered in headless Chromium at **320, 375, 768 and 1440px**. Long names/email addresses were included. No page overflow or browser exceptions were observed. Both screens were checked at 200% CSS zoom on a 768px viewport; this is not a physical-device or native browser-zoom certification.
- Browser interaction checks cover account switching and the IELTS email sign-in callback with a mocked authentication boundary. Keyboard focus after switching is covered by the DOM suite. Screenshots below show fictional QA accounts.
- Real Google OAuth completion, real Supabase session expiry/renewal and physical iPhone/Safari private-mode acceptance remain unverified. Existing route/bootstrap/authorization gates are retained; this harness does not certify a live sign-in.

### Screenshots

| Screen | Phone | Desktop |
| --- | --- | --- |
| IELTS | [375px](./ielts-mobile.png) | [1440px](./ielts-desktop.png) |
| Main app | [375px](./main-mobile.png) | [1440px](./main-desktop.png) |

Detailed dimensions: [browser-layout.json](./browser-layout.json).

## Repository checks

- School-admin integrity guard and security guard for all 471 migrations: passed.
- Typecheck and production build: passed (existing bundle-size/browser-data warnings).
- Core unit suite: 1,934 passed, 2 existing skips. IELTS programme: 345 passed. Local classroom database suite: 171 passed. Language DOM: 14 passed.
- Teacher assignment cards: 7 passed on rerun; one toolbar focus test had a transient null-element failure in the combined run and passed both in isolation and in its complete seven-test suite. No unrelated production code was changed for it.
- Remaining package-script suites (teacher/sidebar/student navigation, retention, teacher packs, event-load reduction, Physics, school coverage and curriculum catalogue): passed when run separately after the combined command stopped at that toolbar test. This is not a claim that the single `npm test` invocation completed green.
- The first core run lacked the container's native canvas binary. Rebuilding the local dependency resolved it; all seven image-scanning recognition cases and the complete core suite then passed. No lockfile or project dependency change was needed.
- `git diff --check`: passed. No production database, account, attempt or deployment was changed.
