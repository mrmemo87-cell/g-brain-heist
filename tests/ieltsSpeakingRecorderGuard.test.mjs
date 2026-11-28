// Speaking interview recorder guards (owner request 2026-11-28, after a Part 1 clip of half a second on 17 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recorder = readFileSync(new URL("../src/components/ielts/SpeakingRecorder.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/ielts/IeltsSpeakingPilot.tsx", import.meta.url), "utf8");

test("a recording that stops by itself shows a full-width Not recording bar and vibrates", () => {
  assert.match(recorder, /data-testid="speaking-not-recording"/);
  assert.match(recorder, /Not recording/);
  assert.match(recorder, /navigator\.vibrate\?\./);
  // The bar is cleared only when a new recording starts.
  assert.match(recorder, /started\.current = Date\.now\(\);\s*setLost\(null\);/);
});

test("losing the microphone track now explains what happened", () => {
  assert.match(recorder, /t\.onended = \(\) => \{\s*if \(r\.state === "recording"\) \{\s*stop\(true\);\s*if \(mounted\.current\)\s*setError\(/);
});

test("finishing an interview with a part under 20 seconds needs a re-record or an explicit confirmation", () => {
  assert.match(page, /p\.saved && p\.seconds < 20/);
  assert.match(page, /data-testid="speaking-short-parts"/);
  assert.match(page, /\(shortParts\.length > 0 && !shortConfirmed\)/);
});
