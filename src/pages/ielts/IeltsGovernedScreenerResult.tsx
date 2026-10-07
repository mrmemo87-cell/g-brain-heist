import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchIeltsDiagnosticResult,
  type IeltsDiagnosticResult,
} from "../../../services/ieltsDiagnosticEvidenceService";
import "../../styles/ielts-speaking-pilot.css";
export default function IeltsGovernedScreenerResult() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<IeltsDiagnosticResult | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setResult(null);
    setError("");
    if (attemptId)
      fetchIeltsDiagnosticResult(attemptId)
        .then((r) => {
          if (alive) {
            setResult(r);
            if (!r) setError("No submitted result is available yet.");
          }
        })
        .catch(() => {
          if (alive)
            setError(
              "This result could not open. Check your access and connection, then try again.",
            );
        });
    return () => {
      alive = false;
    };
  }, [attemptId]);
  return (
    <main className="sp-page">
      <section className="sp-card">
        <a className="sp-back" href="/ielts/programme">
          ← IELTS programme
        </a>
        <h1>Screener evidence</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : result ? (
          <>
            <h2>
              {result.raw_score} / {result.marks_possible}
            </h2>
            <p>Screener score · Confidence: low</p>
            <p>
              {result.confidence.items_answered} items answered ·{" "}
              {result.confidence.constructs_with_responses} sampled skills have
              responses.
            </p>
            <p>{result.next_step}</p>
            <p>
              This short check does not give an IELTS band. One sitting cannot
              establish a persistent weakness.
            </p>
            {result.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </>
        ) : (
          <p role="status">Opening saved evidence…</p>
        )}
      </section>
    </main>
  );
}
