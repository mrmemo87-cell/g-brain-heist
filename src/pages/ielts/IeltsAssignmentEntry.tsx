import React, { useState } from "react";
import type { IeltsTeacherNavKey } from "./IeltsTeacherNavigation";

type Scope = "class" | "batch" | "student";
const options: { id: Scope; title: string; caption: string; icon: string }[] = [
  { id: "class", title: "Entire class", caption: "Assign approved practice to eligible learners in a school class.", icon: "▥" },
  { id: "batch", title: "IELTS course batch", caption: "Assign to a named cross-class IELTS course roster.", icon: "▦" },
  { id: "student", title: "Individual student", caption: "Personalized targeted practice using student-specific eligibility checks.", icon: "♙" },
];

export default function IeltsAssignmentEntry({ onContinue, onBack }: {
  onContinue: (scope: Scope) => void;
  onBack: () => void;
}) {
  const [scope, setScope] = useState<Scope>("class");
  return (
    <section className="ip-assignment-entry" aria-labelledby="ip-assignment-heading">
      <p className="sp-eyebrow">IELTS · Teaching & Assignments</p>
      <h2 id="ip-assignment-heading">Create an assignment</h2>
      <p className="ip-assignment-intro">Who is this assignment for? Choose the recipient group first. Then use the existing secure assignment workflow to select recipients, materials, instructions and due dates.</p>
      <fieldset className="ip-assignment-scopes">
        <legend>Select assignment recipients</legend>
        <div className="ip-assignment-options">
          {options.map(option => (
            <label key={option.id} className={"ip-assignment-option" + (scope === option.id ? " ip-assignment-option-selected" : "")}>
              <input type="radio" name="ielts-assignment-scope" value={option.id} checked={scope === option.id} onChange={() => setScope(option.id)} />
              <span className="ip-assignment-option-symbol" aria-hidden="true">{option.icon}</span>
              <span><strong>{option.title}</strong><small>{option.caption}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ip-assignment-footer">
        <button type="button" className="sp-secondary" onClick={onBack}>← Today</button>
        <button type="button" className="sp-primary" onClick={() => onContinue(scope)}>Continue to {scope === "student" ? "targeted practice" : scope === "batch" ? "batch assignment" : "class assignment"} →</button>
      </div>
      <p className="ip-assignment-footnote">Recipient lists, repeated-material warnings and student access are checked by the existing assignment system. Selecting a scope here does not publish anything.</p>
    </section>
  );
}
