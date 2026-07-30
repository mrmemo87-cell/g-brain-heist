import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeClanWarSubject,
  questionBelongsToPool,
} from "../src/features/clanTerritory/questionPoolFilters.js";

test("Clan Wars matches qualification labels to question-bank subjects", () => {
  assert.equal(normalizeClanWarSubject("AS Chemistry"), "chemistry");
  assert.equal(normalizeClanWarSubject("Cambridge A Level Mathematics"), "maths");
  assert.equal(normalizeClanWarSubject("English Language"), "english");
});

test("all available questions are not discarded based on teacher profile ids", () => {
  const sharedQuestion = { teacher_id: "another-teacher-profile", is_mine: false };
  const ownQuestion = { teacher_id: "my-teacher-profile", is_mine: true };

  assert.equal(questionBelongsToPool(sharedQuestion, "all"), true);
  assert.equal(questionBelongsToPool(ownQuestion, "all"), true);
  assert.equal(questionBelongsToPool(sharedQuestion, "brains-heist"), true);
  assert.equal(questionBelongsToPool(ownQuestion, "brains-heist"), false);
  assert.equal(questionBelongsToPool(ownQuestion, "mine"), true);
});
