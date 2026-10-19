import React from "react";

export type IeltsTeacherNavKey =
  | "today" | "reviews" | "students" | "practice" | "batches" | "lessons" | "exams" | "team";

// Visual & UX Bible 1.2.0 section 2: the Programme tabs stay visible as plain tabs (no dropdown groups),
// each with its own tappable box; on phones they wrap into a two-column grid instead of hiding.
const entries: { key: IeltsTeacherNavKey; label: string; manageOnly?: boolean }[] = [
  { key: "today", label: "Today" },
  { key: "reviews", label: "Review desk" },
  { key: "students", label: "Student progress" },
  { key: "practice", label: "Practice & assignments", manageOnly: true },
  { key: "batches", label: "Course batches", manageOnly: true },
  { key: "lessons", label: "Lessons", manageOnly: true },
  { key: "exams", label: "Exams", manageOnly: true },
  { key: "team", label: "Programme team" },
];

export default function IeltsTeacherNavigation({
  active, onNavigate, canManage, disabled = false, reviewCount = 0,
}: {
  active: IeltsTeacherNavKey;
  onNavigate: (key: IeltsTeacherNavKey) => void;
  canManage: boolean;
  disabled?: boolean;
  reviewCount?: number;
}) {
  return (
    <nav aria-label="IELTS teacher workspace" className="ip-tabs">
      {entries.filter(e => canManage || !e.manageOnly).map(entry => (
        <button key={entry.key} type="button" className={"ip-tab" + (active === entry.key ? " ip-tab-active" : "")}
          aria-current={active === entry.key ? "page" : undefined} disabled={disabled}
          onClick={() => onNavigate(entry.key)}>
          <span>{entry.label}</span>
          {entry.key === "reviews" && reviewCount > 0 && <span className="ip-tab-count" aria-label={`${reviewCount} waiting`}>{reviewCount}</span>}
        </button>
      ))}
    </nav>
  );
}
