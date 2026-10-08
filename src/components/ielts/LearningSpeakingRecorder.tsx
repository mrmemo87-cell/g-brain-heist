import React, { useEffect, useState } from "react";
import { SpeakingRecorder, type RecordingWorkflow } from "./SpeakingRecorder";
import {
  beginLearningRecording,
  uploadLearningRecording,
  abandonLearningRecording,
  learningIncident,
  type LearningDetail,
} from "../../../services/ieltsLearningService";
import { localSpeaking } from "../../../services/ieltsSpeakingPilotService";
import "../../styles/ielts-speaking-pilot.css";
const workflow: RecordingWorkflow<LearningDetail> = {
  begin: beginLearningRecording,
  upload: uploadLearningRecording,
  abandon: abandonLearningRecording,
  incident: (id) => learningIncident(id, "interruption"),
};
export default function LearningSpeakingRecorder({
  detail,
  onSaved,
  onActiveChange,
  enabled,
}: {
  detail: LearningDetail;
  onSaved: (d: LearningDetail) => void;
  onActiveChange: (active: boolean) => void;
  enabled: boolean;
}) {
  const [consent, setConsent] = useState(false),
    [missing, setMissing] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    localSpeaking("list")
      .then((rows) => {
        if (active)
          setMissing(
            (detail.pending_recordings ?? []).filter(
              (id) =>
                !rows.some(
                  (row) =>
                    row.id === id &&
                    row.ownerId === detail.student_id &&
                    row.sessionId === detail.id,
                ),
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [detail.id, detail.pending_recordings, detail.student_id]);
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {missing.map((id) => (
        <div className="il-alert" key={id}>
          <p>
            An earlier capture has not been saved. This device has no
            recoverable copy. If it is on another device, save it there first.
          </p>
          <button
            disabled={!enabled}
            onClick={async () => {
              try {
                await abandonLearningRecording(detail.id, id);
                setMissing((old) => old.filter((value) => value !== id));
              } catch {
                setError(
                  "We could not close the interrupted capture. Retry when connected.",
                );
              }
            }}
          >
            Record this capture as interrupted and start again
          </button>
        </div>
      ))}
      <label className="il-answer">
        <span>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          I agree to record my voice and share it with my assigned teacher for
          this task.
        </span>
      </label>
      <SpeakingRecorder
        session={detail}
        part={1}
        onSaved={onSaved}
        onActiveChange={onActiveChange}
        enabled={enabled && consent}
        workflow={workflow}
      />
    </div>
  );
}
