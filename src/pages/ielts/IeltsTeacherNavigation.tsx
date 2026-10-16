import React, { useState } from "react";

export type IeltsTeacherNavKey =
  | "today" | "students" | "lessons" | "create" | "manage" | "history"
  | "reviews" | "interviews" | "exams" | "batches" | "team";

type Group = { title: string; icon: string; entries: { key: IeltsTeacherNavKey; label: string }[] };
const groups: Group[] = [
  { title: "Overview", icon: "◫", entries: [{ key: "today", label: "Today" }, { key: "students", label: "Student progress" }] },
  { title: "Teaching & Assignments", icon: "▤", entries: [{ key: "lessons", label: "Lesson library" }, { key: "create", label: "Create assignment" }, { key: "manage", label: "Manage assignments" }, { key: "history", label: "Practice history" }] },
  { title: "Assessment & Reviews", icon: "✓", entries: [{ key: "reviews", label: "Review desk" }, { key: "interviews", label: "Speaking interviews" }, { key: "exams", label: "Controlled exams" }] },
  { title: "Programme Management", icon: "♧", entries: [{ key: "batches", label: "Course batches" }, { key: "team", label: "Programme team" }] },
];

export default function IeltsTeacherNavigation({
  active, onNavigate, canManage, disabled = false,
}: {
  active: IeltsTeacherNavKey;
  onNavigate: (key: IeltsTeacherNavKey) => void;
  canManage: boolean;
  disabled?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="ip-nav-shell">
      <button className="ip-navigation-toggle" type="button" aria-controls="ielts-teacher-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>
        <span>☰ Teacher workspace navigation</span><span aria-hidden="true">{mobileOpen ? "⌃" : "⌄"}</span>
      </button>
      <nav id="ielts-teacher-navigation" aria-label="IELTS teacher workspace" className={"ip-teacher-navigation" + (mobileOpen ? " ip-teacher-navigation-open" : "")}>
        {groups.map((group, index) => {
          const entries = group.entries.filter(e => canManage || !["lessons","create","manage","history","interviews","exams","batches"].includes(e.key));
          if (!entries.length) return null;
          return (
            <details key={group.title + ":" + entries.some(e => e.key === active)} className="ip-nav-group" defaultOpen={index < 3 || entries.some(e => e.key === active)}>
              <summary><span className="ip-nav-group-symbol" aria-hidden="true">{group.icon}</span><span>{group.title}</span><span className="ip-nav-chevron" aria-hidden="true">⌄</span></summary>
              <div className="ip-nav-options">
                {entries.map(entry => (
                  <button key={entry.key} type="button" className={"ip-nav-item" + (active === entry.key ? " ip-nav-item-active" : "")}
                    aria-current={active === entry.key ? "page" : undefined} disabled={disabled}
                    onClick={() => { onNavigate(entry.key); setMobileOpen(false); }}>
                    {entry.label}
                    {active === entry.key && <span className="ip-nav-active-dot" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </nav>
    </div>
  );
}
