// Diagnostic Bible 2.7.0 section 10.12: shows the student's assigned Speaking practice mocks on the
// Journey. Renders nothing when there are none, so other students see no change.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockHome, type MockHome } from "../../../services/ieltsSpeakingMockService";

const STATE_TEXT = {
  ready: "Ready to start · about 15 minutes",
  in_progress: "Started · you can continue where you stopped",
  finished: "Finished · your teacher will check it",
  reviewed: "Checked · your teacher shared feedback",
} as const;

export default function SpeakingMockCard() {
  const navigate = useNavigate();
  const [home, setHome] = useState<MockHome | null>(null);
  useEffect(() => {
    let live = true;
    mockHome().then((h) => live && setHome(h)).catch(() => {});
    return () => { live = false; };
  }, []);
  const open = (home?.mocks ?? []).filter((m) => m.state === "ready" || m.state === "in_progress");
  if (!home?.available || open.length === 0) return null;
  const m = open[0];
  return (
    <section className="ij-next" aria-labelledby="speaking-mock-heading">
      <div>
        <p className="ij-eyebrow">Speaking practice mock · Recorded examiner · Not an official IELTS test</p>
        <h3 id="speaking-mock-heading">{m.title}</h3>
        <p className="ij-meta">{STATE_TEXT[m.state]}</p>
      </div>
      <button type="button" className="ij-primary" onClick={() => navigate(`/ielts/speaking-mock/${m.assignment_id}`)}>
        {m.state === "ready" ? "Start the mock" : "Continue the mock"}
      </button>
    </section>
  );
}
