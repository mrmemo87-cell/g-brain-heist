import React, { useState } from "react";
import type { PaperWorkspace } from "../../services/assignmentPaperService";
import {
  DEFAULT_BOOKLET_PRINT_SETTINGS,
  type BookletPrintSettings,
} from "../../src/lib/paperScan/printBooklets";
export type ClassroomPrintMode = "questions" | "pack" | "bubbles" | "unnamed";
export interface ClassroomPrintOrder {
  mode: ClassroomPrintMode;
  studentIds: string[];
  copies: number;
  assessedAt: string;
  includeQuestions: boolean;
  printSettings: BookletPrintSettings;
}
const choices = [
  ["questions", "Questions only", "Use your own answer paper", "questions"],
  ["pack", "Questions + bubbles", "A complete pack per student", "pack"],
  ["bubbles", "Bubble sheets only", "Questions already printed", "bubbles"],
  [
    "unnamed",
    "Unnamed bubble sheets",
    "New students and spare copies",
    "guest",
  ],
] as const;
function PrintIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect
        x="8"
        y="4"
        width="25"
        height="32"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {kind === "questions" || kind === "pack" ? (
        <>
          <path
            d="M14 11h13M14 16h10M14 21h13M14 26h8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {kind === "pack" ? (
            <rect
              x="3"
              y="9"
              width="5"
              height="25"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          ) : null}
        </>
      ) : (
        <>
          {[13, 21, 29].flatMap((y) =>
            [14, 20, 26].map((x) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="2"
                fill={x === 20 ? "currentColor" : "none"}
                stroke="currentColor"
              />
            )),
          )}
          {kind === "guest" ? (
            <path
              d="M28 29h9m-4.5-4.5v9"
              stroke="currentColor"
              strokeWidth="2"
            />
          ) : null}
        </>
      )}
    </svg>
  );
}
export default function ClassroomPrintPanel({
  packet,
  supported,
  busy,
  onPrint,
}: {
  packet: PaperWorkspace;
  supported: boolean;
  busy: boolean;
  onPrint: (order: ClassroomPrintOrder) => Promise<void>;
}) {
  const pending = packet.students.filter((s) => s.status !== "completed");
  const [mode, setMode] = useState<ClassroomPrintMode>("pack");
  const [selected, setSelected] = useState(
    () => new Set(pending.map((s) => s.id)),
  );
  const [copies, setCopies] = useState(1),
    [guestCount, setGuestCount] = useState(5);
  const [guestQuestions, setGuestQuestions] = useState(true);
  const [printSettings, setPrintSettings] = useState<BookletPrintSettings>(
    () => ({ ...DEFAULT_BOOKLET_PRINT_SETTINGS }),
  );
  const [date, setDate] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [search, setSearch] = useState("");
  const actualMode = !supported ? "questions" : mode;
  const count =
    actualMode === "questions"
      ? copies
      : actualMode === "unnamed"
        ? guestCount
        : selected.size;
  const valid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 200 &&
    (actualMode === "questions" || Number.isFinite(Date.parse(date)));
  const submit = () =>
    onPrint({
      mode: actualMode,
      studentIds: [...selected].sort(),
      copies: count,
      assessedAt:
        actualMode === "questions"
          ? new Date().toISOString()
          : new Date(date).toISOString(),
      includeQuestions:
        actualMode === "pack" || (actualMode === "unnamed" && guestQuestions),
      printSettings,
    });
  return (
    <div className="psc-print-grid">
      <section className="psc-card">
        <span className="paw-eyebrow">One print order</span>
        <h3>Ready for your classroom.</h3>
        <div
          className="psc-print-options"
          role="group"
          aria-label="What to print"
        >
          {choices.map(([id, title, hint, kind]) => (
            <button
              key={id}
              type="button"
              aria-pressed={actualMode === id}
              disabled={busy || (id !== "questions" && !supported)}
              onClick={() => setMode(id)}
            >
              <PrintIcon kind={kind} />
              <strong>{title}</strong>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        {!supported ? (
          <p className="psc-hint">
            This question type uses question papers and manual marking.
          </p>
        ) : null}
        {actualMode === "questions" ? (
          <label className="psc-date">
            Copies
            <input
              type="number"
              min={1}
              max={200}
              value={copies || ""}
              disabled={busy}
              onChange={(e) => setCopies(Number(e.target.value))}
            />
          </label>
        ) : (
          <>
            <label className="psc-date">
              Test date and time
              <input
                type="datetime-local"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {actualMode === "unnamed" ? (
              <div className="psc-guest-settings">
                <label className="psc-date">
                  Number of booklets
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={guestCount || ""}
                    disabled={busy}
                    onChange={(e) => setGuestCount(Number(e.target.value))}
                  />
                </label>
                <label className="psc-accept">
                  <input
                    type="checkbox"
                    checked={guestQuestions}
                    disabled={busy}
                    onChange={(e) => setGuestQuestions(e.target.checked)}
                  />
                  Include question papers
                </label>
                <p className="psc-hint">
                  Each student needs a unique QR. Choose the full count here.
                </p>
              </div>
            ) : (
              <>
                <div className="psc-select-heading">
                  <strong>{selected.size} students selected</strong>
                  <button
                    className="psc-link"
                    disabled={busy}
                    onClick={() =>
                      setSelected(
                        selected.size === pending.length
                          ? new Set()
                          : new Set(pending.map((s) => s.id)),
                      )
                    }
                  >
                    {selected.size === pending.length ? "Clear" : "Select all"}
                  </button>
                </div>
                {pending.length > 8 ? (
                  <label className="psc-date">
                    Find a student
                    <input
                      type="search"
                      value={search}
                      disabled={busy}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                ) : null}
                <div className="psc-students">
                  {pending
                    .filter((s) =>
                      s.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          disabled={busy}
                          onChange={() =>
                            setSelected((old) => {
                              const next = new Set(old);
                              next.has(s.id)
                                ? next.delete(s.id)
                                : next.add(s.id);
                              return next;
                            })
                          }
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                  {!pending.length ? (
                    <p>Everyone has completed this assignment.</p>
                  ) : null}
                </div>
              </>
            )}
          </>
        )}
        <fieldset className="psc-printer-settings" disabled={busy}>
          <legend>Printer layout</legend>
          <label className="psc-accept">
            <input
              type="checkbox"
              checked={printSettings.keepTogether}
              onChange={(e) => setPrintSettings((old) => ({ ...old, keepTogether: e.target.checked }))}
            />
            Keep each student's papers together
          </label>
          <div className="psc-printer-options">
            <label className="psc-date">
              Print sides
              <select
                aria-label="Print sides"
                value={printSettings.duplex ? "double" : "single"}
                onChange={(e) => setPrintSettings((old) => ({ ...old, duplex: e.target.value === "double" }))}
              >
                <option value="single">Single-sided</option>
                <option value="double">Double-sided</option>
              </select>
            </label>
            <label className="psc-date">
              Pages per side
              <select
                aria-label="Pages per side"
                value={printSettings.pagesPerSide}
                onChange={(e) => setPrintSettings((old) => ({ ...old, pagesPerSide: Number(e.target.value) as 1 | 2 | 4 }))}
              >
                <option value={1}>1 page</option>
                <option value={2}>2 pages</option>
                <option value={4}>4 pages</option>
              </select>
            </label>
          </div>
          <p className="psc-hint">Use these same settings in the printer dialog. The preview shows exact sheets and added blanks.</p>
          {actualMode !== "questions" && printSettings.pagesPerSide > 1 ? (
            <p className="psc-hint">For the clearest bubble marks and scans, use 1 page per side.</p>
          ) : null}
        </fieldset>
        <div className="psc-order-summary" aria-live="polite">
          <strong>
            {count}{" "}
            {actualMode === "questions"
              ? "question papers"
              : actualMode === "unnamed"
                ? `unnamed ${guestQuestions ? "packs" : "booklets"}`
                : actualMode === "pack"
                  ? "student packs"
                  : "bubble booklets"}
          </strong>
          <span>
            {actualMode === "pack" ||
            (actualMode === "unnamed" && guestQuestions)
              ? "Questions → matching QR sheets · grouped by student"
              : "A4 · ready to preview"}
          </span>
        </div>
        <button
          className="paw-button primary psc-wide"
          disabled={busy || !valid}
          onClick={() => void submit()}
        >
          {busy ? "Preparing…" : "Preview print order"}
        </button>
      </section>
      <div className="psc-print-visual" aria-hidden="true">
        <div className="psc-sheet-preview">
          <div className="psc-mini-corner tl" />
          <div className="psc-mini-corner tr" />
          <span className="psc-mini-brand">BRAINS HEIST</span>
          <h4>
            {actualMode === "questions" ? "Question paper" : "Answer sheet"}
          </h4>
          <div className="psc-mini-qr">
            {actualMode === "questions" ? "▤" : "▦"}
          </div>
          <p>
            {actualMode === "unnamed"
              ? "Name: __________________"
              : "Student · Assignment · Date"}
          </p>
          <div className="psc-mini-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <strong>{i + 1}</strong>
                {actualMode === "questions" ? (
                  <div className="psc-mini-line" />
                ) : (
                  ["A", "B", "C", "D"].map((l, n) => (
                    <span className={n === i % 4 ? "filled" : ""} key={l}>
                      {l}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
          <div className="psc-mini-note">
            {actualMode === "unnamed"
              ? "Unique booklet · link later"
              : "Matching choices. Clear answers."}
          </div>
          <div className="psc-mini-corner bl" />
          <div className="psc-mini-corner br" />
        </div>
        <p className="psc-visual-caption">
          {actualMode === "pack"
            ? "One complete pack. One student."
            : actualMode === "unnamed"
              ? "No account needed to take the test."
              : "Print exactly what you need."}
        </p>
      </div>
    </div>
  );
}
