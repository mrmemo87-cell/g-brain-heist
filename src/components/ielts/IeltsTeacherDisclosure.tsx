import React from "react";
import "../../styles/ielts-teacher-disclosures.css";

type Props = {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  marker?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * A native, independently collapsible teacher-workspace section.
 * Retains mounted lesson/assessment state while closed and works with keyboards.
 */
export default function IeltsTeacherDisclosure({
  title,
  hint,
  icon,
  marker,
  defaultExpanded = true,
  children,
  className = "",
}: Props) {
  return (
    <details className={"ip-disclosure " + className} open={undefined} defaultOpen={defaultExpanded}>
      <summary className="ip-disclosure-toggle">
        <span className="ip-disclosure-icon" aria-hidden="true">{icon ?? "▦"}</span>
        <span className="ip-disclosure-heading">
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        {marker && <span className="ip-disclosure-marker">{marker}</span>}
        <svg className="ip-disclosure-chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div className="ip-disclosure-content">{children}</div>
    </details>
  );
}
