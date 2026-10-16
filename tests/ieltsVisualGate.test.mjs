import fs from "node:fs";
import { discover } from "../scripts/visual/inventory.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { audit } from "../scripts/visual/policy.mjs";
const input = () => ({
  inventory: [
    {
      id: "Reading",
      routes: ["/ielts/reading"],
      roles: ["student"],
      requiredStates: ["populated"],
    },
  ],
  cases: [{ id: "reading", surface: "Reading", state: "populated" }],
  projects: ["chromium-phone"],
  modes: ["normal"],
  hash: "version-one",
  evidence: {
    sourceHash: "version-one",
    status: "passed",
    tests: [
      {
        case: "reading--normal",
        project: "chromium-phone",
        status: "passed",
        expectedStatus: "passed",
      },
    ],
  },
  reviews: {
    devices: [
      {
        surface: "Reading",
        sourceHash: "version-one",
        device: "A real device",
        browser: "Safari",
        reviewer: "Explicit fixture reviewer",
        reviewedAt: "2026-10-15T09:00:00Z",
        result: "pass",
      },
    ],
    screenshots: [
      {
        case: "reading--normal",
        project: "chromium-phone",
        sourceHash: "version-one",
        reviewer: "Explicit fixture reviewer",
        reviewedAt: "2026-10-15T09:00:00Z",
        evidenceURL: "https://example.test/synthetic-review",
        imageSha256: "image-hash",
        result: "approved",
      },
    ],
  },
  baselineHash: () => "image-hash",
});
test("release acceptance requires browser, coverage, device and exact approved image evidence", () => {
  assert.equal(audit(input()).failures.length, 0);
});
test("a new source version, failed or interrupted run cannot inherit acceptance", () => {
  for (const change of [
    { hash: "version-two" },
    { evidence: null },
    { evidence: { ...input().evidence, status: "failed" } },
    { evidence: { ...input().evidence, status: "interrupted" } },
  ])
    assert.ok(audit({ ...input(), ...change }).failures.length);
});
test("candidate screenshots, missing references and changed image bytes are never auto-approved", () => {
  for (const change of [
    { reviews: { devices: [], screenshots: [] } },
    { baselineHash: () => null },
    { baselineHash: () => "changed-bytes" },
  ])
    assert.ok(
      audit({ ...input(), ...change }).failures.some((f) =>
        /screenshot/.test(f),
      ),
    );
});
test("new pages, required states and roles remain visible gaps even when old screenshots pass", () => {
  const x = input();
  x.inventory[0].roles.push("teacher");
  x.inventory.push({
    id: "Speaking",
    routes: ["/ielts/speaking"],
    roles: ["teacher"],
    requiredStates: ["populated", "error"],
  });
  const report = audit(x);
  assert.ok(report.failures.some((f) => /Reading: missing role coverage teacher\/populated/.test(f)));
  assert.ok(
    report.failures.some((f) => /Speaking: missing fixture states/.test(f)),
  );
  assert.equal(report.surfaces[1].status, "Unchecked");
});
test("skipped browser cases and stale/missing device receipts fail closed", () => {
  const x = input();
  x.evidence.tests[0].status = "skipped";
  x.reviews.devices[0].sourceHash = "old";
  const r = audit(x);
  assert.ok(r.failures.some((f) => /passing browser check/.test(f)));
  assert.ok(r.failures.some((f) => /real-device/.test(f)));
});

test("inventory includes the current route, embedded screen and shared component sources", () => {
  const saved = JSON.parse(
    fs.readFileSync("e2e/visual/inventory.json", "utf8"),
  );
  assert.deepEqual(
    saved.map(({ id, source, routes }) => ({ id, source, routes })),
    discover(),
  );
  assert.equal(new Set(saved.map((s) => s.id)).size, saved.length);
});
