import React, { useEffect, useRef, useState } from "react";
import {
  issueScanSheets,
  resolveScanSheet,
  saveScan,
  reviewScan,
  confirmScan,
} from "../../services/paperScanService";
import {
  detectedAnswers,
  loadScanPhoto,
  rowPreviews,
  type ProcessedPhoto,
} from "../../services/paperScanImage";
import {
  openSheetPrintWindow,
  renderSheetPrintWindow,
} from "../../services/scanSheetPrintService";
import { supabase } from "../../services/supabaseClient";
import {
  paperOptions,
  supportsPaperEntry,
  type PaperWorkspace,
  type PaperAnswers,
} from "../../services/assignmentPaperService";
import type {
  ScanSession,
  ScanSheet,
  DetectedRow,
} from "../../src/lib/paperScan/layout";
import "./PaperScanWorkspace.css";
type Props = {
  packet: PaperWorkspace;
  userId: string;
  schoolName: string;
  schoolLogoUrl?: string | null;
  flush: React.MutableRefObject<() => Promise<void>>;
  canLeave: React.MutableRefObject<() => boolean>;
  onConfirmed: () => Promise<void>;
};
const dateInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Could not save. Try again.";
const choiceLabel = (index: number) => String.fromCharCode(65 + index);
const statuses: Record<DetectedRow["state"], string> = {
  clear: "Clear mark",
  blank: "Check blank",
  uncertain: "Faint or erased",
  multiple: "Two marks",
};
export default function PaperScanWorkspace({
  packet,
  userId,
  schoolName,
  schoolLogoUrl,
  flush,
  canLeave,
  onConfirmed,
}: Props) {
  const pending = packet.students.filter((s) => s.status !== "completed");
  const [tab, setTab] = useState<"print" | "scan">("print");
  const [selected, setSelected] = useState(
    () => new Set(pending.map((s) => s.id)),
  );
  const [date, setDate] = useState(() => dateInput(new Date().toISOString()));
  const [session, setSession] = useState<ScanSession | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [crops, setCrops] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<PaperAnswers>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [replace, setReplace] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [onlyChecks, setOnlyChecks] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const unsafeCorrections = useRef(false);
  const sessionIdentity = useRef("");
  const sessionKey = `bh:scan-session:v1:${userId}:${packet.assignment.id}`;
  const supported =
    supportsPaperEntry(packet.questions) &&
    packet.questions.length <= 200 &&
    packet.questions.every((q) => paperOptions(q).length <= 4);
  const sheet = session?.sheets.find((s) => s.id === sheetId);
  const currentStudent = packet.students.find((s) => s.id === sheet?.studentId);
  const studentPages =
    session?.sheets.filter((s) => s.studentId === sheet?.studentId) || [];
  const completePages = studentPages.filter((s) => s.reviewedAnswers).length;
  const allPagesReviewed =
    studentPages.length > 0 && completePages === studentPages.length;
  const needsReplacement =
    !!currentStudent?.existingAnswerCount &&
    currentStudent.status !== "completed";
  const reviewed = !!sheet?.reviewedAnswers;
  const detected = sheet?.detected || {};
  const unresolved =
    sheet?.questions.filter(
      (q) => !Object.prototype.hasOwnProperty.call(answers, q.questionId),
    ) || [];
  const checks =
    sheet?.questions.filter((q) => detected[q.questionId]?.state !== "clear") ||
    [];
  const rows = sheet
    ? onlyChecks && checks.length
      ? checks
      : sheet.questions
    : [];
  useEffect(() => {
    flush.current = () =>
      busyRef.current
        ? Promise.reject(
            new Error("Please wait for the current scan to finish."),
          )
        : unsafeCorrections.current
          ? Promise.reject(
              new Error(
                "Save the reviewed page before closing. Device storage is unavailable.",
              ),
            )
          : Promise.resolve();
    canLeave.current = () => !busyRef.current && !unsafeCorrections.current;
    return () => {
      flush.current = async () => {};
      canLeave.current = () => false;
      abort.current?.abort();
    };
  }, [flush, canLeave]);
  useEffect(() => {
    let active = true;
    let id: string | null = null;
    try {
      id = localStorage.getItem(sessionKey);
    } catch {}
    if (id)
      void supabase
        .rpc("rpc_teacher_scan_session", { p_session_id: id })
        .then(({ data, error }) => {
          if (
            active &&
            !error &&
            data &&
            (!sessionIdentity.current || sessionIdentity.current === id)
          ) {
            sessionIdentity.current = id!;
            setSession(data as ScanSession);
          }
        });
    return () => {
      active = false;
    };
  }, [sessionKey]);
  const remember = (value: ScanSession) => {
    sessionIdentity.current = value.id;
    setSession(value);
    try {
      localStorage.setItem(sessionKey, value.id);
    } catch {
      /* scans remain on server */
    }
  };
  const correctionKey = (id: string) => `bh:scan-review:v1:${userId}:${id}`;
  const storeAnswers = (id: string, next: PaperAnswers) => {
    try {
      localStorage.setItem(correctionKey(id), JSON.stringify(next));
      unsafeCorrections.current = false;
      return true;
    } catch {
      unsafeCorrections.current = true;
      return false;
    }
  };
  const choose = (questionId: string, answer: string | null) => {
    if (!sheet?.scanId || reviewed) return;
    const next = { ...answers, [questionId]: answer };
    setAnswers(next);
    setAccepted(false);
    if (!storeAnswers(sheet.scanId, next))
      setError(
        "Device storage is unavailable. Keep this screen open until the page is saved.",
      );
  };
  const print = async () => {
    if (busyRef.current) return;
    busyRef.current = "Preparing sheets…";
    let win: Window | undefined;
    setError("");
    setMessage("");
    try {
      if (!selected.size) throw new Error("Choose at least one student.");
      if (!date || !Number.isFinite(Date.parse(date)))
        throw new Error("Choose an assessment date.");
      win = openSheetPrintWindow();
      setBusy("Preparing sheets…");
      const ids = [...selected].sort();
      const assessedAt = new Date(date).toISOString();
      const key = JSON.stringify({ ids, assessedAt, hash: packet.formHash });
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const result = await issueScanSheets(
        packet,
        request.current.id,
        ids,
        assessedAt,
      );
      remember(result);
      renderSheetPrintWindow(win, result, packet, schoolName, schoolLogoUrl);
      setMessage(`${result.sheets.length} personalised sheets ready.`);
    } catch (e) {
      win?.close();
      setError(errorText(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  };
  const process = async (file: File) => {
    if (busyRef.current) return;
    if (unsafeCorrections.current) {
      setError(
        "Save this page before scanning another. Device storage is unavailable.",
      );
      return;
    }
    busyRef.current = "Reading your sheet…";
    setError("");
    setMessage("");
    setBusy("Reading your sheet…");
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const nextPhoto = await loadScanPhoto(file, controller.signal);
      setBusy("Checking student and assignment…");
      const result = await resolveScanSheet(
        nextPhoto.sheetId,
        packet.assignment.id,
      );
      if (controller.signal.aborted) return;
      const nextSheet = result.sheets.find((s) => s.id === nextPhoto.sheetId);
      if (!nextSheet) throw new Error("This sheet could not be found.");
      const student = packet.students.find((s) => s.id === nextSheet.studentId);
      if (student?.status === "completed" || nextSheet.confirmedAt)
        throw new Error("This student already has a completed result.");
      const marks = detectedAnswers(nextPhoto, nextSheet);
      setBusy("Saving scan…");
      const saved =
        nextSheet.imageHash === nextPhoto.hash && nextSheet.scanId
          ? result
          : await saveScan(
              crypto.randomUUID(),
              nextSheet.id,
              nextPhoto.hash,
              marks,
            );
      if (controller.signal.aborted) return;
      remember(saved);
      const stored = saved.sheets.find((s) => s.id === nextSheet.id)!;
      if (stored.imageHash !== nextPhoto.hash)
        throw new Error(
          "A newer photo was saved in another tab. Re-upload that photo to review it.",
        );
      const initial: PaperAnswers = {};
      nextSheet.questions.forEach((q) => {
        const mark = marks[q.questionId];
        if (mark.state === "clear" && mark.choice !== null)
          initial[q.questionId] = q.options[mark.choice];
      });
      if (stored.reviewedAnswers)
        Object.assign(initial, stored.reviewedAnswers);
      else if (stored.scanId && stored.imageHash === nextPhoto.hash) {
        try {
          const local = JSON.parse(
            localStorage.getItem(correctionKey(stored.scanId)) || "null",
          );
          if (local && typeof local === "object")
            nextSheet.questions.forEach((q) => {
              if (
                Object.prototype.hasOwnProperty.call(local, q.questionId) &&
                (local[q.questionId] === null ||
                  q.options.includes(local[q.questionId]))
              )
                initial[q.questionId] = local[q.questionId];
            });
        } catch {}
      }
      setPhoto(nextPhoto);
      setSheetId(nextSheet.id);
      unsafeCorrections.current = false;
      setAnswers(initial);
      setCrops(rowPreviews(nextPhoto, nextSheet));
      setReplace(false);
      setAccepted(false);
      setOnlyChecks(true);
      setTab("scan");
      if (stored.scanId && !storeAnswers(stored.scanId, initial))
        setError(
          "Device storage is unavailable. Keep this screen open until the page is saved.",
        );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(errorText(e));
    } finally {
      if (!controller.signal.aborted) {
        busyRef.current = "";
        setBusy("");
      }
    }
  };
  const finishPage = async () => {
    if (busyRef.current) return;
    if (!sheet?.scanId || unresolved.length || !accepted || !photo) return;
    busyRef.current = "Saving reviewed page…";
    setError("");
    setBusy("Saving reviewed page…");
    try {
      const next = await reviewScan(sheet.scanId, answers);
      remember(next);
      unsafeCorrections.current = false;
      try {
        localStorage.removeItem(correctionKey(sheet.scanId));
      } catch {}
      setMessage("Page reviewed and saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  };
  const finalize = async () => {
    if (busyRef.current) return;
    if (
      !session ||
      !sheet ||
      !allPagesReviewed ||
      (needsReplacement && !replace)
    )
      return;
    busyRef.current = "Confirming result…";
    setError("");
    setBusy("Confirming result…");
    try {
      await confirmScan(session.id, sheet.studentId, replace);
      setMessage(`${sheet.studentName} · Result confirmed.`);
      setSheetId("");
      setPhoto(null);
      setCrops({});
      await onConfirmed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  };
  const resetReview = () => {
    if (unsafeCorrections.current) {
      setError(
        "Save this page before scanning another. Device storage is unavailable.",
      );
      return;
    }
    setSheetId("");
    setPhoto(null);
    setCrops({});
    setAnswers({});
    setAccepted(false);
    setMessage("");
  };
  return (
    <div className="psc">
      <div
        className="psc-nav"
        role="tablist"
        aria-label="Print and scan"
        onKeyDown={(event) => {
          if (
            !busy &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight")
          ) {
            event.preventDefault();
            if (unsafeCorrections.current) return;
            const next = tab === "print" ? "scan" : "print";
            setTab(next);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>("[role=tab]")
              [next === "print" ? 0 : 1]?.focus();
          }
        }}
      >
        <button
          role="tab"
          aria-selected={tab === "print"}
          tabIndex={tab === "print" ? 0 : -1}
          disabled={!!busy}
          onClick={() => {
            if (unsafeCorrections.current) {
              setError(
                "Save this page before leaving. Device storage is unavailable.",
              );
              return;
            }
            setTab("print");
          }}
        >
          ▤ Print sheets
        </button>
        <button
          role="tab"
          aria-selected={tab === "scan"}
          tabIndex={tab === "scan" ? 0 : -1}
          disabled={!!busy}
          onClick={() => setTab("scan")}
        >
          ▣ Scan & review
        </button>
      </div>
      {error ? (
        <div className="paw-error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="psc-success" role="status">
          ✓ {message}
        </div>
      ) : null}
      {!supported ? (
        <div className="paw-empty">
          Scanning supports up to 200 multiple-choice or true/false questions
          with 2–4 text choices. Use manual paper entry for this assignment.
        </div>
      ) : tab === "print" ? (
        <div className="psc-print-grid">
          <section className="psc-card">
            <span className="paw-eyebrow">Personalised for your class</span>
            <h3>Paper in. Progress out.</h3>
            <p>Names, QR codes, and answer bubbles. Ready to hand out.</p>
            <label className="psc-date">
              Assessment time
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!!busy}
              />
            </label>
            <div className="psc-select-heading">
              <strong>
                {selected.size} {selected.size === 1 ? "student" : "students"}{" "}
                selected
              </strong>
              <button
                className="psc-link"
                disabled={!!busy}
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
            <div className="psc-students">
              {pending.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    disabled={!!busy}
                    onChange={() =>
                      setSelected((old) => {
                        const next = new Set(old);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        return next;
                      })
                    }
                  />
                  <span>{s.name}</span>
                </label>
              ))}
              {pending.length === 0 ? (
                <p>Everyone has completed this assignment.</p>
              ) : null}
            </div>
            <button
              className="paw-button primary psc-wide"
              disabled={!!busy || !selected.size}
              onClick={() => void print()}
            >
              {busy || "Print personalised sheets"}
            </button>
          </section>
          <div
            className="psc-sheet-preview"
            aria-label="Illustration of a bubble sheet"
          >
            <div className="psc-mini-corner tl" />
            <div className="psc-mini-corner tr" />
            <span className="psc-mini-brand">BRAINS HEIST</span>
            <h4>Answer sheet</h4>
            <div className="psc-mini-qr" aria-hidden="true">
              ▦
            </div>
            <p>Student name · Assignment · Date</p>
            <div className="psc-mini-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i}>
                  <strong>{i + 1}</strong>
                  {["A", "B", "C", "D"].map((l, n) => (
                    <span className={n === i % 4 ? "filled" : ""} key={l}>
                      {l}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="psc-mini-note">Fill one bubble fully.</div>
            <div className="psc-mini-corner bl" />
            <div className="psc-mini-corner br" />
          </div>
        </div>
      ) : (
        <>
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="psc-file"
            aria-label="Choose answer sheet photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void process(file);
            }}
          />
          <input
            ref={camera}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="psc-file"
            aria-label="Take answer sheet photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void process(file);
            }}
          />
          {!sheet ? (
            <section className="psc-capture">
              <div className="psc-viewfinder" aria-hidden="true">
                <span>▣</span>
              </div>
              <span className="paw-eyebrow">Your phone is the scanner</span>
              <h3>One clear photo. All the answers.</h3>
              <p>Include the QR code and all four corner squares.</p>
              <div className="psc-capture-actions">
                <button
                  className="paw-button primary"
                  disabled={!!busy}
                  onClick={() => camera.current?.click()}
                >
                  Take photo
                </button>
                <button
                  className="paw-button"
                  disabled={!!busy}
                  onClick={() => upload.current?.click()}
                >
                  Choose photo
                </button>
              </div>
              <small>
                Photos stay on this device. Reviewed answers are saved securely.
              </small>
              {session ? (
                <div className="psc-session-list">
                  <strong>Latest print session</strong>
                  <span>
                    {session.sheets.filter((s) => s.reviewedAnswers).length}/
                    {session.sheets.length} pages reviewed
                  </span>
                  {session.sheets
                    .filter(
                      (s) =>
                        s.scanId &&
                        !s.confirmedAt &&
                        packet.students.find((p) => p.id === s.studentId)
                          ?.status !== "completed",
                    )
                    .map((s) => (
                      <button
                        key={s.id}
                        className="psc-session-row"
                        disabled={!!busy}
                        onClick={() => {
                          setSheetId(s.id);
                          setPhoto(null);
                          setCrops({});
                          setAnswers(s.reviewedAnswers || {});
                          setReplace(false);
                          setAccepted(false);
                        }}
                      >
                        {s.studentName}
                        <span>
                          Page {s.pageNumber}/{s.pageCount} ·{" "}
                          {s.reviewedAnswers ? "Reviewed" : "Resume review"} →
                        </span>
                      </button>
                    ))}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="psc-review">
              <header className="psc-review-heading">
                <div>
                  <span className="paw-eyebrow">
                    Page {sheet.pageNumber}/{sheet.pageCount} · {packet.code}
                  </span>
                  <h3>{sheet.studentName}</h3>
                  <p>{new Date(session!.assessedAt).toLocaleString()}</p>
                </div>
                <button
                  className="paw-button"
                  disabled={!!busy}
                  onClick={resetReview}
                >
                  Scan another
                </button>
              </header>
              {!reviewed ? (
                <>
                  {!photo ? (
                    <div className="psc-reupload">
                      <span>
                        Choose the original photo to resume this review.
                      </span>
                      <button
                        className="paw-button"
                        disabled={!!busy}
                        onClick={() => upload.current?.click()}
                      >
                        Choose photo
                      </button>
                    </div>
                  ) : null}
                  <div className="psc-review-summary">
                    <strong>
                      {unresolved.length
                        ? `${unresolved.length} answers to check`
                        : "All answers resolved"}
                    </strong>
                    <button
                      className="psc-link"
                      onClick={() => setOnlyChecks((v) => !v)}
                    >
                      {onlyChecks ? "Show all answers" : "Show checks"}
                    </button>
                  </div>
                  <div className="psc-answer-list">
                    {rows.map((q) => (
                      <article
                        key={q.questionId}
                        className={`psc-answer-row ${detected[q.questionId]?.state !== "clear" ? "check" : ""}`}
                      >
                        <div className="psc-answer-label">
                          <strong>Question {q.orderIndex}</strong>
                          <span>
                            {
                              statuses[
                                detected[q.questionId]?.state || "uncertain"
                              ]
                            }
                          </span>
                        </div>
                        {crops[q.questionId] ? (
                          <img
                            src={crops[q.questionId]}
                            alt={`Photographed bubbles for question ${q.orderIndex}`}
                          />
                        ) : (
                          <span className="psc-hint">
                            Re-upload the photo to inspect the marks.
                          </span>
                        )}
                        <div
                          className="psc-choices"
                          role="group"
                          aria-label={`Question ${q.orderIndex} answer`}
                        >
                          {q.options.map((option, index) => (
                            <button
                              key={option}
                              disabled={!!busy}
                              aria-pressed={answers[q.questionId] === option}
                              title={option}
                              onClick={() => choose(q.questionId, option)}
                            >
                              {choiceLabel(index)}
                            </button>
                          ))}
                          <button
                            disabled={!!busy}
                            aria-pressed={
                              Object.prototype.hasOwnProperty.call(
                                answers,
                                q.questionId,
                              ) && answers[q.questionId] === null
                            }
                            onClick={() => choose(q.questionId, null)}
                          >
                            Blank
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="psc-review-actions">
                    <label className="psc-accept">
                      <input
                        type="checkbox"
                        checked={accepted}
                        disabled={!!busy || unresolved.length > 0 || !photo}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      I checked this page’s answers.
                    </label>
                    <button
                      className="paw-button primary psc-wide"
                      disabled={
                        !!busy || unresolved.length > 0 || !accepted || !photo
                      }
                      onClick={() => void finishPage()}
                    >
                      Save reviewed page
                    </button>
                  </div>
                </>
              ) : (
                <div className="psc-reviewed">
                  <span>✓</span>
                  <h4>Page checked and saved</h4>
                  <p>
                    {completePages}/{studentPages.length} pages reviewed for
                    this student.
                  </p>
                  {!allPagesReviewed ? (
                    <button
                      className="paw-button primary"
                      disabled={!!busy}
                      onClick={() => upload.current?.click()}
                    >
                      Scan the next page
                    </button>
                  ) : null}
                </div>
              )}
              {allPagesReviewed ? (
                <div className="psc-confirm">
                  {needsReplacement ? (
                    <label className="psc-replace">
                      <input
                        type="checkbox"
                        checked={replace}
                        disabled={!!busy}
                        onChange={(e) => setReplace(e.target.checked)}
                      />
                      Replace this student’s unfinished online answers. Their
                      previous answers will be kept in the audit history.
                    </label>
                  ) : null}
                  <button
                    className="paw-button primary psc-wide"
                    disabled={!!busy || (needsReplacement && !replace)}
                    onClick={() => void finalize()}
                  >
                    Confirm student result
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </>
      )}
      {busy ? (
        <div className="psc-busy" role="status" aria-live="polite">
          <span className="paw-loader" />
          {busy}
        </div>
      ) : null}
    </div>
  );
}
