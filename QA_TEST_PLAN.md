# QA & Testing Strategy for Brains Heist

## 1. Scope & Goals
- Brains Heist blends missions, PvP hacks, clan collaboration, XP/coin progression, and educator tooling, so tests must protect quest integrity, PvP fairness, resource caps, and teacher workflows described in the player-facing overview.【F:README.md†L28-L149】
- Teacher customization relies on Supabase-backed question and quest template management inside `services/gameService.ts`, tying RPC calls and direct table access together.【F:services/gameService.ts†L2881-L3142】
- Existing RPC unit tests (`tests/rpcGateway.test.ts`) already verify parameter plumbing; this plan expands to DB, API, security, rate limits, and end-to-end coverage.【F:tests/rpcGateway.test.ts†L1-L98】

## 2. Test Categories
1. **Database Integrity & RLS** – schema validation, referential integrity, row-level security, and Supabase policies for students vs. teachers.
2. **RPC Functions** – contract tests for each exported helper in `services/rpcGateway.ts`, including payload validation, error surfacing, and edge cases.【F:services/rpcGateway.ts†L3-L74】
3. **Backend API Routes** – happy/edge cases for REST/RPC proxies that missions, PvP, homework scheduling, and analytics rely on.
4. **Security & Privacy** – ensure students cannot view others’ records, teacher-only dashboards are locked down, and sensitive events are redacted.
5. **Rate Limiting & Abuse Mitigation** – stress PvP, mission, and notification endpoints (extend existing k6 scripts noted in the README).【F:README.md†L272-L280】
6. **Core Flow Validation** – end-to-end tests for mission lifecycle, adaptive recommendations, PvP battle setup/resolution, teacher homework scheduling, and analytics reporting.
7. **Regression & Smoke** – fast suites triggered on every PR plus deeper nightly runs.

## 3. Database & RLS Test Cases
- **Foreign key enforcement** – insert invalid `quest_sessions` referencing non-existent missions or students; expect constraint failure.
- **Cascade behavior** – delete a student; ensure dependent rows (AP logs, mission attempts, PvP standings) either cascade or are prevented per spec.
- **Mission completion idempotency** – duplicate completion events for same session must be rejected.
- **RLS – student isolation** – using student JWT, attempt to select another student’s mission attempt row; expect `PGRST301` error.
- **RLS – teacher restricted view** – teacher JWT can see only their classes’ data; selecting outside assigned batches returns empty set.
- **RLS – admin bypass** – admin service role can perform maintenance (validate via `service_role` key and verify writes succeed).
- **Materialized analytics tables** – verify refresh procedures respect referential integrity and drop stale rows.

## 4. RPC Function Test Cases
For each helper in `services/rpcGateway.ts`:
- **Input validation** – pass invalid `userId`/payload type; expect the client to forward error messages from Supabase.
- **Notification RPCs** – ensure `notifyAttackIncoming`, `notifyCoinsLost`, `notifyRevengeAvailable`, and `notifyAttackDefended` include required contextual fields (attacker_id, defender_id, mission_id) and reject missing keys.
- **`regenerate_user_ap`** – confirm AP increases only up to configured caps and emits `notifyApFull` when threshold reached.
- **`rpc_hack_attempt`** – test win/loss/tie payloads, shield depletion, reward throttling, and error surfaces (e.g., attacking while banned).
- **`rpc_check_achievements`** – assert that new badges are only returned once per player per day.
- **Teacher RPCs** – `create_teacher_profile` must reject duplicates; `record_question_attempt` should calculate XP/coins consistently with mission logic.

## 5. Backend API Route Test Cases
- **Mission start (`POST /api/missions/start`)** – valid request returns session token; invalid mission ID yields 404; missing AP returns 409.
- **Mission complete (`POST /api/missions/:id/complete`)** – verifies scoring, XP/coin updates, gemstone caps, and activity feed logging.
- **Recommendation API (`GET /api/missions/next`)** – handles empty queue, subject filters, and ensures banned students get fallback content.
- **PvP endpoints (`POST /api/pvp/challenges`, `POST /api/pvp/:id/resolve`)** – enforce AP cost, shield/cracker usage, concurrency checks, and defender notifications.
- **Teacher homework scheduling (`POST /api/teacher/homework`)** – requires teacher JWT, rejects overlapping schedules, validates quest template IDs.
- **Teacher analytics (`GET /api/teacher/analytics`)** – confirm data aggregation windows, anonymization of student PII, and pagination.
- **Error envelope consistency** – any 4xx/5xx returns standardized `{ code, message, context }` payload for UI handling.

## 6. Security & Access Control Test Cases
- **Horizontal privilege escalation** – attempt to fetch another student’s PvP inbox via crafted IDs; expect 403.
- **Teacher vs. student separation** – students calling teacher CRUD endpoints receive 403; teachers cannot update admin-only settings.
- **Banned users** – verify `isBannedFlag` blocks RPCs and returns `BAN_MESSAGE` copy everywhere the UI reads it.【F:services/gameService.ts†L1-L90】
- **Token expiry** – simulate expired/invalid Supabase session; ensure refresh flow or logout is triggered.
- **Data minimization** – analytics exports remove email addresses/usernames when accessed by teachers.

## 7. Rate Limiting & Abuse Scenarios
- **PvP spam** – extend `load-tests/pvp.js` to spike concurrent hack attempts (e.g., 200 VUs) and verify rate limits/alerts.【F:README.md†L276-L280】
- **Mission submission flood** – simulate repeated completion posts without starts; expect throttling or deduplication.
- **Notification storms** – mass `notifyLevelUp` calls should be batched; ensure queue latency alerting.
- **Homework scheduling bursts** – prevent teachers from creating hundreds of assignments within seconds.

## 8. Core Flow Test Cases
### Student – Start & Complete Mission
- Happy path: start mission, answer MCQs, verify XP/coins/AP deltas, quest streak increments, gemstone caps.
- Error path: insufficient AP, mission expired mid-run, duplicate completion call.
- Accessibility: ensure mission UI works with keyboard navigation and persists after refresh.

### Student – Next Mission Recommendation
- With adaptive data: verifies subject/difficulty progression, respects teacher assignments.
- No history: returns default onboarding quest.
- Edge: banned topics or out-of-date templates gracefully fallback.

### Student – PvP Battles
- Challenge creation: ensures AP deduction, shield checks, event logging.
- Resolution: win/loss/tie scoring, revenge availability, notifications and AP regen.
- Abuse: repeated attacks on same defender trigger cooldown.

### Teacher – Schedule Homework
- Create schedule with quest template list, due dates, and target batches; verify DB rows and notifications.
- Conflict detection when overlapping assignments exist for same batch/time.
- Permission: teacher cannot schedule for batches they do not own.

### Teacher – View Analytics
- Happy path: load analytics dashboard, confirm metrics match mission data.
- Filtered view: date range and subject filters apply correctly.
- Security: aggregated data hides student identifiers when user is not class owner.

## 9. Automated Testing Strategy
### Unit Tests (TypeScript + Node test/Jest)
- Expand `tests/rpcGateway.test.ts` to cover every helper, injecting mock errors and boundary payloads.【F:tests/rpcGateway.test.ts†L1-L98】
- Add pure-function tests in `services/gameService.ts` for XP calculations, AP regeneration, gemstone caps, quest streak logic, and teacher question validation.【F:services/gameService.ts†L1-L90】【F:services/gameService.ts†L2881-L3142】
- Create tests for utility modules (e.g., `storageService` persistence helpers, adaptive recommendation selectors).

### Integration Tests (API + DB)
- Use Supabase test schema + seeded fixtures; run via Jest or Vitest + `@supabase/supabase-js` service role.
- Cover mission start/completion RPC interplay, teacher question CRUD, PvP resolution, and analytics queries.
- Validate RLS by executing queries with row-level tokens.

### E2E Tests (Playwright)
- Student journey: login, start mission, answer questions, receive XP, challenge another player, verify leaderboard.
- Teacher journey: sign in, create profile, schedule homework, review analytics cards.
- Smoke: ensure navigation between Missions, PvP, Clan, Shop, Teacher dashboards works in Chromium/Webkit/Firefox.

## 10. Example Test Snippets
### Jest Unit Test for Mission Scoring
```ts
import { describe, it, expect } from 'vitest';
import { applyQuestProgress } from '@/services/gameService';

describe('applyQuestProgress', () => {
  it('awards gemstones and notifications when streak milestone reached', () => {
    const { gemstoneDelta, notifications } = applyQuestProgress('student-1', true);
    expect(gemstoneDelta).toBeGreaterThanOrEqual(0);
    expect(notifications.length).toBeGreaterThan(0);
  });
});
```

### Integration Test for Mission Start/Complete
```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!);

test('student can start and finish a mission', async () => {
  const { data: session } = await supabase.rpc('mission_start', { p_student_id: 'student-1', p_mission_id: 'mission-42' });
  expect(session?.mission_session_id).toBeDefined();

  const { data: result } = await supabase.rpc('mission_complete', {
    p_mission_session_id: session!.mission_session_id,
    p_answers: [{ question_id: 'q1', selected: 'A' }]
  });
  expect(result?.xp_awarded).toBeGreaterThan(0);
});
```

### Playwright E2E for Mission Flow
```ts
import { test, expect } from '@playwright/test';

test('student completes a mission and sees XP gain', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[name="email"]', 'student@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button:has-text("Enter the Grid")');

  await page.click('button:has-text("Start Mission")');
  await page.getByRole('radio', { name: /Option A/i }).first().click();
  await page.click('button:has-text("Submit Answer")');
  await expect(page.getByText(/XP Reward/i)).toBeVisible();
});
```

### Playwright E2E for Teacher Scheduling
```ts
test('teacher schedules homework and sees confirmation', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[name="email"]', 'teacher@example.com');
  await page.fill('input[name="password"]', 'supersafe');
  await page.click('button:has-text("Enter the Grid")');
  await page.click('button:has-text("Teacher HQ")');
  await page.click('button:has-text("Schedule Homework")');
  await page.fill('input[name="title"]', 'Algebra Mission 1');
  await page.click('button:has-text("Assign")');
  await expect(page.getByText(/Homework scheduled/i)).toBeVisible();
});
```

## 11. Execution Cadence
- **PR gate** – lint, typecheck, unit tests, targeted API contract tests.
- **Nightly** – full integration suite (DB reset + seed), Playwright smoke (Chromium), load-tests for PvP.
- **Weekly** – cross-browser Playwright runs, extended k6 rate-limit exercises, manual exploratory on new missions.

## 12. Tooling & Reporting
- Run `npm run typecheck`, `npm run test`, and targeted `k6 run load-tests/*.js` as part of CI to keep parity with documented scripts.【F:README.md†L272-L280】
- Store Playwright videos/screenshots as artifacts; push Supabase SQL coverage metrics to QA dashboards.
- Tag flaky tests automatically and auto-create follow-up issues when reliability drops below SLO.
