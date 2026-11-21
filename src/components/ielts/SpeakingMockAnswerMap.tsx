// Diagnostic Bible 2.7.0 section 10.12: in a recorded-examiner mock the examiner's voice is not in the
// recording, so the teacher sees which question each answer belongs to and can play from its start.
import React, { useEffect, useState } from "react";
import { mockSegments, type MockSegments } from "../../../services/ieltsSpeakingMockService";
import { playSpeakingClipFrom } from "./SpeakingAudioDock";
import "../../styles/ielts-speaking-mock.css";

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function SpeakingMockAnswerMap({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<MockSegments | null>(null);
  useEffect(() => {
    let live = true;
    mockSegments(sessionId).then((d) => live && setData(d)).catch(() => {});
    return () => { live = false; };
  }, [sessionId]);
  if (!data?.mock || !data.parts?.length) return null;
  const teacher = data.parts.some((p) => p.answers.some((a) => a.question));
  return (
    <section className="sp-card sp-mock-map" aria-labelledby="sp-mock-map-heading">
      <h2 id="sp-mock-map-heading">{teacher ? "Questions and answers" : "Your answers"}</h2>
      <p className="sp-note">
        Recorded examiner · the student took this practice mock alone, without supervision.
        {teacher && typeof data.replays === "number" ? ` Part 1 replays used: ${data.replays}.` : ""}
      </p>
      {data.parts.map((p) => (
        <div key={p.part} className="sp-mock-part">
          <h3>Part {p.part}</h3>
          <ol>
            {p.answers.map((a) => (
              <li key={a.line_key}>
                <button type="button" className="sp-secondary" onClick={() => playSpeakingClipFrom(p.clip_id, a.start)}
                  aria-label={`Play this answer from ${t(a.start)}`}>▶ {t(a.start)}</button>
                <span>{a.question ?? "Answer"}{a.interrupted ? " · interrupted" : ""}</span>
              </li>
            ))}
          </ol>
          {p.lost.length > 0 && <p className="sp-note">No audio survived for: {p.lost.join(" · ")}</p>}
        </div>
      ))}
    </section>
  );
}
