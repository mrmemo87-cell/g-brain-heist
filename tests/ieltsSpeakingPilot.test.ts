import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeakingRecorder } from "../src/components/ielts/SpeakingRecorder";
import type { SpeakingSession } from "../services/ieltsSpeakingPilot";
import {
  emptySpeakingFeedback,
  validateSpeakingFeedback,
  encodeSpeakingWav,
  SPEAKING_CRITERIA,
} from "../services/ieltsSpeakingPilot";
import {
  inspectSpeakingWav,
  SPEAKING_AI_INSTRUCTIONS,
} from "../supabase/functions/_shared/ieltsSpeakingAudio";
test("canonical mono PCM WAV has server-verifiable duration and rejects malformed formats", () => {
  const bytes = encodeSpeakingWav(new Float32Array(32000));
  assert.equal(inspectSpeakingWav(bytes).duration, 2);
  const bad = bytes.slice(0);
  new DataView(bad).setUint16(22, 2, true);
  assert.throws(() => inspectSpeakingWav(bad));
  assert.throws(() => inspectSpeakingWav(new ArrayBuffer(10)));
  assert.throws(() =>
    inspectSpeakingWav(encodeSpeakingWav(new Float32Array(16000 * 361))),
  );
});
test("feedback requires four observations and valid audio evidence; missing is separate from developing", () => {
  const clips = [
    {
      id: "clip",
      part: 1,
      path: "test",
      sha256: "a".repeat(64),
      duration_seconds: 30,
      interrupted: false,
      mime_type: "audio/wav",
    },
  ];
  const f = emptySpeakingFeedback();
  f.next_step = "Give a reason, then add one example.";
  for (const c of SPEAKING_CRITERIA)
    f.observations[c.key].comment =
      "We need a clearer recording to check this area.";
  assert.equal(validateSpeakingFeedback(f, clips), f);
  f.observations.pronunciation.status = "developing";
  assert.throws(() => validateSpeakingFeedback(f, clips));
  f.observations.pronunciation.evidence = [
    { clip_id: "clip", start_seconds: 5, end_seconds: 10 },
  ];
  assert.doesNotThrow(() => validateSpeakingFeedback(f, clips));
  f.observations.pronunciation.evidence[0].end_seconds = 31;
  assert.throws(() => validateSpeakingFeedback(f, clips));
});
test("AI instructions require listening, speaker attribution, simple language and human confirmation", () => {
  assert.match(SPEAKING_AI_INSTRUCTIONS, /Listen to ALL supplied audio/);
  assert.match(SPEAKING_AI_INSTRUCTIONS, /Never assess the teacher/);
  assert.match(
    SPEAKING_AI_INSTRUCTIONS,
    /Never judge pronunciation from a transcript/,
  );
  assert.match(SPEAKING_AI_INSTRUCTIONS, /simple English/);
  assert.match(SPEAKING_AI_INSTRUCTIONS, /untrusted evidence/);
  assert.match(SPEAKING_AI_INSTRUCTIONS, /Never publish or share/);
});
test("the recorder gives an accessible microphone check and blocks an untested Part 2 recording", () => {
  const session = { id: "synthetic-session" } as SpeakingSession;
  const html = renderToStaticMarkup(
    React.createElement(SpeakingRecorder, {
      session,
      part: 2,
      enabled: false,
      onSaved: () => {},
      onActiveChange: () => {},
    }),
  );
  assert.match(html, /aria-label="Interview recording"/);
  assert.match(html, /Check microphone/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Record Part 2<\/button>/);
  assert.doesNotMatch(html, /Recording ·|autoplay/i);
});
