import test from "node:test";
import assert from "node:assert/strict";
import {
  programmeEvidenceLabel,
  programmeEvidenceRoute,
} from "../services/ieltsProgrammeService";

test("programme missing evidence remains unknown and carries no result link", () => {
  for (const skill of ["listening", "reading", "writing", "speaking"]) {
    assert.equal(programmeEvidenceLabel(skill, null), "No submitted evidence");
    assert.equal(programmeEvidenceRoute(skill, null), null);
  }
});

test("programme distinguishes raw screener evidence from confirmed teacher feedback", () => {
  assert.equal(
    programmeEvidenceLabel("listening", {
      attempt_id: "a",
      raw_score: 8,
      total: 12,
    }),
    "8 / 12 · Screener",
  );
  assert.equal(
    programmeEvidenceLabel("writing", { attempt_id: "a", reviewed: false }),
    "Awaiting teacher review",
  );
  assert.equal(
    programmeEvidenceLabel("writing", { attempt_id: "a", reviewed: true }),
    "Teacher feedback ready",
  );
  assert.equal(
    programmeEvidenceLabel("speaking", {
      attempt_id: "a",
      status: "in_progress",
    }),
    "Interview in progress",
  );
});

test("programme evidence links open the original governed submission", () => {
  assert.equal(
    programmeEvidenceRoute("listening", { attempt_id: "a/b" }),
    "/ielts/screener-result/a%2Fb",
  );
  assert.equal(
    programmeEvidenceRoute("reading", { attempt_id: "a" }),
    "/ielts/screener-result/a",
  );
  assert.equal(
    programmeEvidenceRoute("writing", { attempt_id: "a" }),
    "/ielts/writing-screener/reviews/a",
  );
  assert.equal(
    programmeEvidenceRoute("speaking", { attempt_id: "a" }),
    "/ielts/speaking-pilot/a",
  );
});
