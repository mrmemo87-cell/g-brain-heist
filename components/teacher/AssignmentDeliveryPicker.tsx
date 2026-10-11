import React from "react";
import type { AssignmentDelivery } from "../../services/assignmentPaperService";
export const DELIVERY_LABELS = {
  online: "Online",
  paper: "Paper",
  mixed: "Mixed",
} as const;
export default function AssignmentDeliveryPicker({
  value,
  onChange,
}: {
  value: AssignmentDelivery;
  onChange: (value: AssignmentDelivery) => void;
}) {
  return (
    <fieldset className="aw-delivery">
      <legend>How will students complete it?</legend>
      <div
        className="aw-delivery-options"
        role="radiogroup"
        aria-label="Assignment delivery"
      >
        {(["online", "paper", "mixed"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value === mode}
            className={value === mode ? "is-selected" : ""}
            onClick={() => onChange(mode)}
          >
            <span aria-hidden="true">
              {mode === "online" ? "▣" : mode === "paper" ? "▤" : "▦"}
            </span>
            <strong>{DELIVERY_LABELS[mode]}</strong>
            <small>
              {mode === "online"
                ? "On a device"
                : mode === "paper"
                  ? "Printed in class"
                  : "Either way"}
            </small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
