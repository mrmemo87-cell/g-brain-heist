import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  issueScanSheets,
  issueUnnamedSheets,
  holdGuest,
  resolveScanSheet,
  saveScan,
  reviewScan,
  confirmScan,
  fetchScanInbox,
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
import ClassroomPrintPanel, {
  type ClassroomPrintOrder,
} from "./ClassroomPrintPanel";
import GuestResultsPanel from "./GuestResultsPanel";
import { MAX_SCAN_BATCH, runScanBatch } from "../../src/lib/paperScan/batch";
import { saveRowPreviews, loadRowPreviews } from "../../services/paperScanPreviewCache";
import ScanPhotoCapture from "./ScanPhotoCapture";
import ScanCornerAdjust from "./ScanCornerAdjust";
import type { Point } from "../../src/lib/paperScan/omr";
import { scanInbox } from "../../src/lib/paperScan/inbox";
import "./PaperScanWorkspace.css";
type BatchDraft = {
  session: ScanSession;
  sheet: ScanSheet;
  photo: Pick<ProcessedPhoto, "sheetId" | "hash">;
  marks: Record<string, DetectedRow>;
  crops: Record<string, string>;
  answers: PaperAnswers;
  originalFile?: File;
};
type BatchItem = {
  id: string;
  name: string;
  file?: File;
  state: "queued" | "reading" | "ready" | "error" | "reviewed" | "completed";
  error?: string;
  draft?: BatchDraft;
  anchors?: Point[];
};
type Props = {
  packet: PaperWorkspace;
  userId: string;
  schoolName: string;
  schoolLogoUrl?: string | null;
  flush: React.MutableRefObject<() => Promise<void>>;
  canLeave: React.MutableRefObject<() => boolean>;
  onConfirmed: () => Promise<void>;
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Could not save. Try again.";
const choiceLabel = (index: number) => String.fromCharCode(65 + index);
const statuses: Record<DetectedRow["state"], string> = {
  clear: "Clear mark",
  blank: "No mark detected",
  uncertain: "Mark needs checking",
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
  const [tab, setTab] = useState<"print" | "scan" | "guests">("print");
  const [guestName, setGuestName] = useState("");
  const [guestReference, setGuestReference] = useState("");
  const [session, setSession] = useState<ScanSession | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [photo, setPhoto] = useState<Pick<ProcessedPhoto, "sheetId" | "hash"> | null>(null);
  const [photoMarks, setPhotoMarks] = useState<Record<string, DetectedRow>>({});
  const [crops, setCrops] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<PaperAnswers>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [replace, setReplace] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [onlyChecks, setOnlyChecks] = useState(true);
  const [flow, setFlow] = useState<"capture" | "review" | "finish">("capture");
  const [showOriginal, setShowOriginal] = useState(false);
  const [originalUrl, setOriginalUrl] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const batchRef = useRef<BatchItem[]>([]);
  const batchAbort = useRef<AbortController | null>(null);
  const updateBatch = (update: (items: BatchItem[]) => BatchItem[]) => {
    batchRef.current = update(batchRef.current);
    setBatch(batchRef.current);
  };
  const abort = useRef<AbortController | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<BatchItem | null>(null);
  const cameraOpenRef = useRef(cameraOpen);
  cameraOpenRef.current = cameraOpen || !!adjusting;
  const [inboxSessions, setInboxSessions] = useState<ScanSession[]>([]);
  const [inboxError, setInboxError] = useState("");
  const refreshInbox = useCallback(async () => {
    try { setInboxSessions(await fetchScanInbox(packet.assignment.id)); setInboxError(""); }
    catch (e) { setInboxError(errorText(e)); }
  }, [packet.assignment.id]);
  useEffect(() => {
    let active = true;
    void fetchScanInbox(packet.assignment.id).then(value => { if (active) setInboxSessions(value); }).catch(e => { if (active) setInboxError(errorText(e)); });
    return () => { active = false; };
  }, [packet.assignment.id]);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const guestBusyChange = useCallback((value: boolean) => {
    busyRef.current = value ? "Updating saved booklets…" : "";
    setBusy(busyRef.current);
  }, []);
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
    session?.sheets.filter((s) =>
      sheet?.guestId
        ? s.guestId === sheet.guestId
        : s.studentId === sheet?.studentId,
    ) || [];
  const completePages = studentPages.filter((s) => s.reviewedAnswers).length;
  const allPagesReviewed =
    studentPages.length > 0 && completePages === studentPages.length;
  const needsReplacement =
    !!currentStudent?.existingAnswerCount &&
    currentStudent.status !== "completed";
  const reviewed = !!sheet?.reviewedAnswers;
  const detected = photo ? photoMarks : sheet?.detected || {};
  const unresolved =
    sheet?.questions.filter(
      (q) => !Object.prototype.hasOwnProperty.call(answers, q.questionId),
    ) || [];
  const checks =
    sheet?.questions.filter(
      (q) => !["clear", "blank"].includes(detected[q.questionId]?.state || ""),
    ) ||
    [];
  const rows = sheet
    ? onlyChecks
      ? checks
      : sheet.questions
    : [];
  const booklets = scanInbox(inboxSessions, packet.students);
  const readyResultCount = booklets.filter(booklet => booklet.ready).length;
  const activeDraft = batch.find((item) => item.draft?.sheet.id === sheetId)?.draft;
  useEffect(() => {
    if (!activeDraft?.originalFile) { setOriginalUrl(""); return; }
    const url = URL.createObjectURL(activeDraft.originalFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [activeDraft?.originalFile]);
  useEffect(() => {
    if (sheetId && flow === "review") {
      reviewHeading.current?.scrollIntoView({ block: "start" });
      reviewHeading.current?.focus({ preventScroll: true });
    }
  }, [sheetId, flow]);
  useEffect(() => {
    flush.current = () =>
      (busyRef.current || cameraOpenRef.current)
        ? Promise.reject(
            new Error("Finish the camera tray or wait for the current scan to finish."),
          )
        : unsafeCorrections.current
          ? Promise.reject(
              new Error(
                "Save the reviewed page before closing. Device storage is unavailable.",
              ),
            )
          : Promise.resolve();
    canLeave.current = () => !busyRef.current && !cameraOpenRef.current && !unsafeCorrections.current;
    return () => {
      flush.current = async () => {};
      canLeave.current = () => false;
      batchAbort.current?.abort();
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
    setInboxSessions(values => {
      const previous = values.find(item => item.id === value.id);
      const next = { ...value, sheets: value.sheets.map(page => {
        const old = previous?.sheets.find(old => old.id === page.id && old.scanId === page.scanId);
        return { ...page, scannedAt: page.scannedAt || old?.scannedAt };
      }) };
      return previous ? values.map(item => item.id === value.id ? next : item) : [next, ...values];
    });
    updateBatch((items) => items.map((item) => {
      if (item.draft?.session.id !== value.id) return item;
      const nextSheet = value.sheets.find((page) => page.id === item.draft!.sheet.id);
      return nextSheet ? { ...item, state: nextSheet.confirmedAt || nextSheet.heldAt ? "completed" : nextSheet.reviewedAnswers ? "reviewed" : item.state,
        draft: { ...item.draft, session: value, sheet: nextSheet } } : item;
    }));
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
  const print = async (order: ClassroomPrintOrder) => {
    if (busyRef.current) return;
    busyRef.current = "Preparing print order…";
    let win: Window | undefined;
    setError("");
    setMessage("");
    setBusy(busyRef.current);
    try {
      if (
        !Number.isInteger(order.copies) ||
        order.copies < 1 ||
        order.copies > 200
      )
        throw new Error("Choose 1–200 copies.");
      win = openSheetPrintWindow();
      if (order.mode === "questions") {
        renderSheetPrintWindow(
          win,
          {
            id: "",
            assignmentId: packet.assignment.id,
            assessedAt: order.assessedAt,
            formHash: packet.formHash,
            sheets: [],
          },
          packet,
          schoolName,
          schoolLogoUrl,
          false,
          order.copies,
          order.printSettings,
        );
      } else {
        if (!supported)
          throw new Error(
            "Use question papers and manual marking for this assignment.",
          );
        if (!Number.isFinite(Date.parse(order.assessedAt)))
          throw new Error("Choose a test date.");
        const unnamed = order.mode === "unnamed";
        if (!unnamed && !order.studentIds.length)
          throw new Error("Choose at least one student.");
        const key = JSON.stringify({
          ids: unnamed ? [] : order.studentIds,
          count: unnamed ? order.copies : 0,
          date: order.assessedAt,
          hash: packet.formHash,
        });
        if (request.current?.key !== key)
          request.current = { key, id: crypto.randomUUID() };
        const result = unnamed
          ? await issueUnnamedSheets(
              packet,
              request.current.id,
              order.copies,
              order.assessedAt,
            )
          : await issueScanSheets(
              packet,
              request.current.id,
              order.studentIds,
              order.assessedAt,
            );
        remember(result);
        renderSheetPrintWindow(
          win,
          result,
          packet,
          schoolName,
          schoolLogoUrl,
          order.includeQuestions,
          0,
          order.printSettings,
        );
        // A successful preview completes this issuance. Next print gets fresh QR tokens; failed retries reuse the same request.
        request.current = null;
      }
      setMessage("Print order ready. Check the preview before printing.");
    } catch (e) {
      win?.close();
      setError(errorText(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  };
  const process = async (file: File, controller: AbortController, anchors?: Point[]): Promise<BatchDraft> => {
      const nextPhoto = await loadScanPhoto(file, controller.signal, anchors);
      setBusy("Checking student and assignment…");
      const result = await resolveScanSheet(
        nextPhoto.sheetId,
        packet.assignment.id,
      );
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const nextSheet = result.sheets.find((s) => s.id === nextPhoto.sheetId);
      if (!nextSheet) throw new Error("This sheet could not be found.");
      if (batchRef.current.some((item) => item.draft?.sheet.id === nextSheet.id))
        throw new Error("This page is already in your batch. Its first scan was kept.");
      const student = packet.students.find((s) => s.id === nextSheet.studentId);
      if (
        student?.status === "completed" ||
        nextSheet.confirmedAt ||
        nextSheet.heldAt
      )
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
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

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
        else if (mark.state === "blank") initial[q.questionId] = null;
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
      const previews = rowPreviews(nextPhoto, nextSheet);
      if (Object.keys(previews).length !== nextSheet.questions.length)
        throw new Error("Photo previews could not be prepared. Retry this photo before reviewing answers.");
      await saveRowPreviews(userId, packet.assignment.id, stored.id, nextPhoto.hash, previews);
      remember(saved);
      return { session: saved, sheet: stored, originalFile: file,
        photo: { sheetId: nextPhoto.sheetId, hash: nextPhoto.hash },
        marks, crops: previews, answers: initial };
  };
  const retainReview = () => {
    if (!sheet?.scanId || reviewed) return true;
    if (!storeAnswers(sheet.scanId, answers)) {
      setError("Save this page before switching. Device storage is unavailable.");
      return false;
    }
    updateBatch((items) => items.map((item) => item.draft?.sheet.id === sheet.id
      ? { ...item, draft: { ...item.draft, answers } } : item));
    return true;
  };
  const showDraft = (draft: BatchDraft) => {
    remember(draft.session);
    setSheetId(draft.sheet.id);
    setPhoto(draft.photo);
    setPhotoMarks(draft.marks);
    setCrops(draft.crops);
    setAnswers(draft.sheet.reviewedAnswers || draft.answers);
    setGuestName(draft.sheet.claimedName || "");
    setGuestReference(draft.sheet.localReference || "");
    setReplace(false);
    setAccepted(false);
    setOnlyChecks(true);
    setTab("scan");
    setFlow("review");
    setShowOriginal(false);
    unsafeCorrections.current = false;
  };
  const openBatchPage = async (item: BatchItem) => {
    if (busyRef.current || !item.draft || !retainReview()) return;
    busyRef.current = "Opening page…";
    setBusy(busyRef.current);
    setError("");
    try {
      const current = await resolveScanSheet(item.draft.sheet.id, packet.assignment.id);
      const found = current.sheets.find((page) => page.id === item.draft!.sheet.id);
      if (!found || found.imageHash !== item.draft.photo.hash)
        throw new Error("This page changed in another tab. Upload its latest photo again.");
      if (found.confirmedAt || found.heldAt) {
        remember(current);
        setMessage("This result is already saved. Choose the next page.");
        return;
      }
      showDraft({ ...item.draft, session: current, sheet: found });
    } catch (e) { setError(errorText(e)); }
    finally { busyRef.current = ""; setBusy(""); }
  };
  const openSavedPage = async (id: string) => {
    const cached = batchRef.current.find((item) => item.draft?.sheet.id === id);
    if (cached) { await openBatchPage(cached); return; }
    if (busyRef.current || !retainReview()) return;
    busyRef.current = "Restoring page previews…";
    setBusy(busyRef.current); setError("");
    try {
      const current = await resolveScanSheet(id, packet.assignment.id);
      const found = current.sheets.find((page) => page.id === id);
      if (!found) throw new Error("This sheet could not be found.");
      const previews = found.imageHash ? await loadRowPreviews(userId, packet.assignment.id, id, found.imageHash) : null;
      const initial: PaperAnswers = { ...found.reviewedAnswers };
      if (!found.reviewedAnswers) {
        found.questions.forEach((q) => {
          const mark = found.detected?.[q.questionId];
          if (mark?.state === "clear" && mark.choice !== null) initial[q.questionId] = q.options[mark.choice];
          else if (mark?.state === "blank") initial[q.questionId] = null;
        });
        try {
          const local = JSON.parse(localStorage.getItem(correctionKey(found.scanId || "")) || "null");
          found.questions.forEach((q) => {
            if (local && Object.prototype.hasOwnProperty.call(local, q.questionId) && (local[q.questionId] === null || q.options.includes(local[q.questionId]))) initial[q.questionId] = local[q.questionId];
          });
        } catch {}
      }
      remember(current); setSheetId(id); setCrops(previews || {}); setAnswers(initial);
      setPhoto(previews && found.imageHash && found.questions.every((q) => previews[q.questionId]) ? { sheetId: id, hash: found.imageHash } : null);
      setPhotoMarks(found.detected || {});
      setGuestName(found.claimedName || ""); setGuestReference(found.localReference || "");
      setOnlyChecks(true); setAccepted(false); setReplace(false); setFlow("review"); setShowOriginal(false);
    } catch (e) { setError(errorText(e)); }
    finally { busyRef.current = ""; setBusy(""); }
  };
  const nextReviewPage = async () => {
    const next = batchRef.current.find((item) => item.state === "ready" && item.draft?.sheet.id !== sheetId);
    if (next) await openBatchPage(next);
    else { resetReview(); setFlow("finish"); }
  };
  const readBatch = async (items: BatchItem[]) => {
    if (busyRef.current || !retainReview()) return;
    const controller = new AbortController();
    const stopping = new AbortController();
    abort.current = controller;
    batchAbort.current = stopping;
    busyRef.current = "Reading batch…";
    setBusy(busyRef.current);
    setError("");
    setMessage("");
    setTab("scan");
    let done = 0;
    try {
      await runScanBatch(items, async (item) => {
        if (!item.file) return;
        updateBatch((list) => list.map((page) => page.id === item.id ? { ...page, state: "reading", error: undefined } : page));
        setBusy(`Reading photo ${++done} of ${items.length}…`);
        const draft = await process(item.file, controller, item.anchors);
        if (controller.signal.aborted) return;
        updateBatch((list) => list.map((page) => page.id === item.id
          ? { ...page, file: undefined, draft, state: draft.sheet.reviewedAnswers ? "reviewed" : "ready" } : page));
      }, (item, e) => {
        updateBatch((list) => list.map((page) => page.id === item.id
          ? { ...page, state: "error", error: errorText(e) } : page));
      }, stopping.signal);
      if (controller.signal.aborted) return;
      await refreshInbox();
      // Capture stays in the tray until the teacher explicitly starts review.
      // A missing-preview resume is the one case that returns to that page.
      const restored = sheetId && !photo ? batchRef.current.find((item) => item.draft?.sheet.id === sheetId) : null;
      if (restored?.draft) showDraft(restored.draft);
      else setFlow("capture");
      setMessage(stopping.signal.aborted ? "Paused after this photo. Continue when ready." : "Photos are ready. Tap Start review to check one page at a time.");
    } finally {
      if (!controller.signal.aborted) { busyRef.current = ""; setBusy(""); }
      batchAbort.current = null;
    }
  };
  const addPhotos = (files: File[]) => {
    if (busyRef.current || !files.length || !retainReview()) return;
    if (batchRef.current.length + files.length > MAX_SCAN_BATCH) {
      setError(`Keep each batch to ${MAX_SCAN_BATCH} photos. Finish this batch before adding more.`);
      return;
    }
    if (photo || reviewed) {
      setSheetId(""); setPhoto(null); setCrops({}); setAnswers({}); setAccepted(false);
    }
    setFlow("capture");
    const additions: BatchItem[] = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, file, state: "queued" }));
    updateBatch((items) => [...items, ...additions]);
    void readBatch(additions);
  };
  const confirmBatch = async () => {
    if (busyRef.current || !retainReview()) return;
    busyRef.current = "Confirming reviewed results…";
    setBusy(busyRef.current);
    setError("");
    let confirmed = 0;
    const seen = new Set<string>();
    const failures: string[] = [];
    try {
      const latest = scanInbox(await fetchScanInbox(packet.assignment.id), packet.students);
      for (const booklet of booklets.filter(value => value.ready)) {
        const freshBooklet = latest.find(value => value.pages[0].studentId === booklet.pages[0].studentId);
        if (!freshBooklet?.ready || freshBooklet.session.id !== booklet.session.id) {
          failures.push(`${booklet.pages[0].studentName}: A newer or unfinished booklet needs review. Refresh saved reviews.`);
          continue;
        }
        const draftSheet = booklet.pages[0];
        const studentId = draftSheet.studentId!;
        const key = `${booklet.session.id}:${studentId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const current = await resolveScanSheet(draftSheet.id, packet.assignment.id);
          const pages = current.sheets.filter(page => page.studentId === studentId);
          if (!scanInbox([current], packet.students).some(value => value.ready && value.pages[0].studentId === studentId)) continue;
          if (pages.some(page => { const old = booklet.pages.find(old => old.id === page.id); return page.scanId !== old?.scanId || JSON.stringify(page.reviewedAnswers) !== JSON.stringify(old.reviewedAnswers); })) throw new Error("This booklet changed. Refresh and review it again.");
          await confirmScan(current.id, studentId, false);
          confirmed++;
          updateBatch(items => items.map(page => page.draft?.session.id === current.id && page.draft.sheet.studentId === studentId ? { ...page, state: "completed" } : page));
        } catch (e) { failures.push(`${draftSheet.studentName}: ${errorText(e)}`); }
      }
      if (confirmed) await onConfirmed();
      await refreshInbox();
      if (failures.length) setError(failures.join(" · "));
      setMessage(`${confirmed} student results confirmed. Incomplete booklets, unnamed sheets and unfinished online answers can be finished individually.`);
      if (batchRef.current.find((item) => item.draft?.sheet.id === sheetId)?.state === "completed") {
        setSheetId(""); setPhoto(null); setCrops({});
      }
    } catch (e) { setError(errorText(e)); }
    finally { busyRef.current = ""; setBusy(""); }
  };
  const finishPage = async (advance = false) => {
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
      await refreshInbox();
      setMessage("Review saved. Confirm the student result to complete the assignment and update their Academic Profile.");
      if (advance) {
        const nextPage = batchRef.current.find((item) => item.state === "ready" && item.draft?.sheet.id !== sheet.id);
        if (nextPage?.draft) {
          const fresh = await resolveScanSheet(nextPage.draft.sheet.id, packet.assignment.id);
          const page = fresh.sheets.find((value) => value.id === nextPage.draft!.sheet.id);
          if (!page || page.imageHash !== nextPage.draft.photo.hash) throw new Error("The next page changed. Open it again from the tray.");
          showDraft({ ...nextPage.draft, session: fresh, sheet: page });
        } else { setSheetId(""); setPhoto(null); setCrops({}); setFlow("finish"); }
      }
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
      if (sheet.guestId && !sheet.studentId) {
        if (!guestName.trim())
          throw new Error("Enter the name written on the sheet.");
        remember(
          await holdGuest(
            sheet.guestId,
            guestName.trim(),
            guestReference.trim(),
          ),
        );
        setMessage("Answers saved. Link this booklet after the student joins.");
        setSheetId("");
        setPhoto(null);
        setCrops({});
        setTab("guests");
        return;
      }
      if (!sheet.studentId)
        throw new Error("This sheet has no student account.");
      await confirmScan(session.id, sheet.studentId, replace);
      updateBatch((items) => items.map((item) => item.draft?.session.id === session.id && item.draft.sheet.studentId === sheet.studentId ? { ...item, state: "completed" } : item));
      setMessage(`${sheet.studentName} · Result confirmed.`);
      setSheetId("");
      setPhoto(null);
      setCrops({});
      await onConfirmed();
      await refreshInbox();
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
    if (!retainReview()) return;
    setSheetId("");
    setPhoto(null);
    setCrops({});
    setAnswers({});
    setAccepted(false);
    setFlow(batchRef.current.some((item) => item.state === "ready") ? "capture" : "finish");
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
            const tabs = ["print", "scan", "guests"] as const;
            const next =
              tabs[
                (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3
              ];
            setTab(next);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>("[role=tab]")
              [tabs.indexOf(next)]?.focus();
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
          ▤ Print
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
        <button
          role="tab"
          aria-selected={tab === "guests"}
          tabIndex={tab === "guests" ? 0 : -1}
          disabled={!!busy}
          onClick={() => {
            if (unsafeCorrections.current) {
              setError(
                "Save this page before leaving. Device storage is unavailable.",
              );
              return;
            }
            setTab("guests");
          }}
        >
          Awaiting link
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
      {tab === "guests" ? (
        <GuestResultsPanel
          assignmentId={packet.assignment.id}
          onBusyChange={guestBusyChange}
          onLinked={onConfirmed}
          onOpen={async (id) => {
            const result = await resolveScanSheet(id, packet.assignment.id);
            const found = result.sheets.find((s) => s.id === id);
            if (!found) throw new Error("Sheet not found.");
            remember(result);
            setSheetId(id);
            setPhoto(null);
            setCrops({});
            setAnswers(found.reviewedAnswers || {});
            setGuestName(found.claimedName || "");
            setGuestReference(found.localReference || "");
            setTab("scan");
          }}
        />
      ) : tab === "print" ? (
        <ClassroomPrintPanel
          packet={packet}
          supported={supported}
          busy={!!busy}
          onPrint={print}
        />
      ) : !supported ? (
        <div className="paw-empty">
          Use manual paper entry for this assignment.
        </div>
      ) : (
        <>
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="psc-file"
            multiple
            aria-label="Choose answer sheet photos"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              addPhotos(files);
            }}
          />
          {adjusting?.file ? <ScanCornerAdjust file={adjusting.file} onClose={() => setAdjusting(null)} onUse={anchors => { const item = { ...adjusting, anchors }; setAdjusting(null); updateBatch(items => items.map(old => old.id === item.id ? item : old)); void readBatch([item]); }} /> : null}
          {cameraOpen ? <ScanPhotoCapture limit={MAX_SCAN_BATCH - batch.length} onClose={() => setCameraOpen(false)} onUse={files => { setCameraOpen(false); addPhotos(files); }} /> : null}
          {!sheet ? <section className="psc-inbox" aria-label="Saved scan results">
            <span className="paw-eyebrow">{packet.students.filter(student => student.status === "completed").length}/{packet.students.length} students completed · saved across your scan sessions</span>
            <h3>{readyResultCount ? `${readyResultCount} ${readyResultCount === 1 ? "result is" : "results are"} ready to confirm` : "Saved reviews & results"}</h3>
            <p>Saving a review keeps the checked answers. Confirming the result completes the assignment and updates the student’s Academic Profile.</p>
            {inboxError ? <p role="alert">Could not load saved reviews: {inboxError}</p> : null}
            <div className="psc-batch-actions"><button className="paw-button primary" disabled={!!busy || !readyResultCount || !!inboxError} onClick={() => void confirmBatch()}>Confirm {readyResultCount} {readyResultCount === 1 ? "result" : "results"} & complete assignments</button><button className="psc-link" disabled={!!busy} onClick={() => void refreshInbox()}>Refresh saved reviews</button></div>
            <div className="psc-session-list">{booklets.map(booklet => <button key={`${booklet.session.id}:${booklet.pages[0].studentId || booklet.pages[0].guestId}`} className="psc-session-row" disabled={!!busy} onClick={() => void openSavedPage((booklet.pages.find(page => page.scanId && !page.reviewedAnswers) || booklet.pages.find(page => page.scanId)!).id)}><strong>{booklet.pages[0].studentName}</strong><span>{booklet.ready ? "Reviewed · ready to confirm" : !booklet.pages[0].studentId ? "Unnamed booklet · finish & link" : booklet.pages.filter(page => page.reviewedAnswers).length === booklet.pages[0].pageCount ? "Reviewed · finish individually" : `${booklet.pages.filter(page => page.reviewedAnswers).length}/${booklet.pages[0].pageCount} pages reviewed`} →</span></button>)}</div>
            {!booklets.length && !inboxError ? <small>No unfinished scanned booklets yet.</small> : null}
          </section> : null}
          {batch.length ? <ol className="psc-steps" aria-label="Scan progress">
            <li aria-current={flow === "capture" ? "step" : undefined}>1 · Add photos</li>
            <li aria-current={flow === "review" ? "step" : undefined}>2 · Review pages</li>
            <li aria-current={flow === "finish" ? "step" : undefined}>3 · Confirm results</li>
          </ol> : null}
          {batch.length && !sheet ? (
            <section className="psc-batch" aria-label="Scan batch">
              <header className="psc-batch-heading">
                <div><span className="paw-eyebrow">Your scan tray</span><h3>{flow === "finish" ? "Finish this batch" : `${batch.length} ${batch.length === 1 ? "photo" : "photos"} in your tray`}</h3>
                  <p>{batch.filter((item) => item.state === "ready").length} to review · {batch.filter((item) => item.state === "reviewed").length} reviewed · {batch.filter((item) => item.state === "completed").length} finished · {batch.filter(item => item.state === "error").length} need attention</p></div>
                <div className="psc-batch-actions">
                  <button className="paw-button" disabled={!!busy} onClick={() => setCameraOpen(true)}>+ Take photo</button>
                  <button className="paw-button" disabled={!!busy} onClick={() => upload.current?.click()}>+ Add photos</button>
                </div>
              </header>
              <div className="psc-batch-actions">
                {batch.some((item) => item.state === "ready") ? <button className="paw-button primary" disabled={!!busy} onClick={() => {
                  const first = batchRef.current.find((item) => item.state === "ready");
                  if (first) void openBatchPage(first);
                }}>{flow === "finish" ? "Continue review" : "Start review"} · {batch.filter((item) => item.state === "ready").length} {batch.filter((item) => item.state === "ready").length === 1 ? "page" : "pages"}</button> : null}
              </div>
              <div className="psc-batch-list">
                {batch.map((item, index) => (
                  <article key={item.id} className={`psc-batch-item ${item.state}`}>
                    <span className="psc-batch-number">{index + 1}</span>
                    <div><strong>{item.draft?.sheet.studentName || item.name}</strong>
                      <span>{item.draft ? `Page ${item.draft.sheet.pageNumber}/${item.draft.sheet.pageCount} · ` : ""}{item.state === "ready" ? "Ready to review" : item.state === "completed" ? "Result saved" : item.state === "error" ? "Needs another look" : item.state === "reading" ? "Reading…" : item.state === "queued" ? "Waiting" : "Page reviewed"}</span>
                      {item.error ? <p role="status">{item.error}</p> : null}</div>
                    {item.draft && item.state !== "completed" ? <button className="psc-link" disabled={!!busy} aria-pressed={sheetId === item.draft.sheet.id} onClick={() => void openBatchPage(item)}>{item.state === "reviewed" ? "Finish student →" : "Review page →"}</button> : null}
                    {item.state === "error" && item.file && /corners|corner|calibrat/i.test(item.error || "") ? <button className="paw-button" disabled={!!busy} onClick={() => setAdjusting(item)}>Adjust corners</button> : null}
                    {item.state === "error" ? <button className="psc-link" disabled={!!busy} onClick={() => void readBatch([item])}>Retry</button> : null}
                    {item.state !== "completed" ? <button className="psc-link" disabled={!!busy} aria-label={`Remove ${item.name} from tray`} onClick={() => {
                      if (!retainReview()) return;
                      if (item.draft?.sheet.id === sheetId) resetReview();
                      updateBatch((items) => items.filter((page) => page.id !== item.id));
                    }}>Remove</button> : null}
                  </article>
                ))}
              </div>
              <div className="psc-batch-actions">
                {batchAbort.current ? <button className="paw-button" onClick={() => batchAbort.current?.abort()}>Pause after this photo</button> : null}
                {batch.some((item) => item.state === "queued") ? <button className="paw-button" disabled={!!busy} onClick={() => void readBatch(batch.filter((item) => item.state === "queued"))}>Continue reading</button> : null}
                <button className="paw-button" disabled={!!busy || readyResultCount === 0 || !!inboxError} onClick={() => void confirmBatch()}>Confirm {readyResultCount} {readyResultCount === 1 ? "student result" : "student results"}</button>
                <button className="psc-link" disabled={!!busy || batch.some((item) => !["completed", "error"].includes(item.state))} onClick={() => { updateBatch(() => []); resetReview(); }}>Clear finished batch</button>
              </div>
              {flow === "finish" ? <p className="psc-hint">Reviewed pages are saved. Confirm student results to complete their assignments. Use Finish student for unnamed sheets, incomplete booklets or unfinished online work.</p> : null}
              <small>Each page must be checked and saved first. Photos stay on this device; page previews are kept on this device for seven days. Keep the originals until results are confirmed.</small>
            </section>
          ) : null}
          {!sheet ? (
            <section className="psc-capture">
              {!batch.length ? <>
              <div className="psc-viewfinder" aria-hidden="true">
                <span>▣</span>
              </div>
              <span className="paw-eyebrow">Your phone is the scanner</span>
              <h3>A stack of papers. One scan batch.</h3>
              <p>Take the whole stack one shot after another, then tap Use photos. You can also choose existing photos together. One page per photo, with its QR code and four corner squares visible.</p>
              <div className="psc-capture-actions">
                <button
                  className="paw-button primary"
                  disabled={!!busy}
                  onClick={() => setCameraOpen(true)}
                >
                  Take photo
                </button>
                <button
                  className="paw-button"
                  disabled={!!busy}
                  onClick={() => upload.current?.click()}
                >
                  Choose photos
                </button>
              </div>
              <small>
                Photos stay on this device. Reviewed answers are saved securely.
              </small>
              </> : null}
            </section>
          ) : (
            <section className="psc-review">
              <header className="psc-review-heading">
                <div>
                  <span className="paw-eyebrow">
                    Page {sheet.pageNumber}/{sheet.pageCount} · {packet.code}
                  </span>
                  <h3 ref={reviewHeading} tabIndex={-1}>{sheet.studentName}</h3>
                  <p>{new Date(session!.assessedAt).toLocaleString()}</p>
                </div>
                <button
                  className="paw-button"
                  disabled={!!busy}
                  onClick={resetReview}
                >
                  Back to tray
                </button>
              </header>
              {batch.length ? <p className="psc-review-position">Page {batch.findIndex((item) => item.draft?.sheet.id === sheetId) + 1 || "—"} of {batch.filter((item) => item.draft).length} · {batch.filter((item) => item.state === "ready").length} left to review</p> : null}
              {originalUrl ? <div className="psc-original">
                <button className="psc-link" aria-expanded={showOriginal} onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? "Hide full sheet" : "View full answer sheet"}</button>
                {showOriginal ? <img src={originalUrl} alt={`Original answer sheet for ${sheet.studentName}; compare the printed question numbers`} /> : null}
              </div> : null}
              {!reviewed ? (
                <>
                  {!photo ? (
                    <div className="psc-reupload">
                      <span>
                        This page’s previews are not on this device. Choose its original photo once to restore them.
                      </span>
                      <button
                        className="paw-button"
                        disabled={!!busy}
                        onClick={() => upload.current?.click()}
                      >
                        Choose photos
                      </button>
                    </div>
                  ) : null}
                  <div className="psc-review-summary">
                    <strong>
                      {unresolved.length
                        ? `${unresolved.length} ${unresolved.length === 1 ? "answer" : "answers"} to check`
                        : "Ready for page confirmation"}
                    </strong>
                    <button
                      className="psc-link"
                      onClick={() => setOnlyChecks((v) => !v)}
                    >
                      {onlyChecks ? "Show all answers" : "Show checks"}
                    </button>
                  </div>
                  <p className="psc-hint">
                    {sheet.questions.filter((q) => detected[q.questionId]?.state === "clear").length} clear answers ·{" "}
                    {sheet.questions.filter((q) => detected[q.questionId]?.state === "blank").length} blank ·{" "}
                    {checks.length} {checks.length === 1 ? "mark" : "marks"} flagged. Clear answers and blanks are filled in automatically. You can inspect and edit all answers before saving.
                  </p>
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
                        <div
                          className="psc-aligned-answers"
                          style={{ "--psc-option-count": q.options.length } as React.CSSProperties}
                        >
                        <div className="psc-bubble-labels" aria-hidden="true">
                          {q.options.map((_, index) => <span key={index}>{choiceLabel(index)}</span>)}
                        </div>
                        {crops[q.questionId] ? (
                          <img
                            src={crops[q.questionId]}
                            alt={`Photographed bubbles for question ${q.orderIndex}`}
                          />
                        ) : (
                          <div className="psc-preview-missing" role="alert">
                            This question’s photo preview is missing. Restore the original photo before choosing an answer.
                            <button className="paw-button" disabled={!!busy} onClick={() => upload.current?.click()}>Restore photo</button>
                          </div>
                        )}
                        <div
                          className="psc-choices"
                          role="group"
                          aria-label={`Question ${q.orderIndex} answer`}
                        >
                          {q.options.map((option, index) => (
                            <button
                              key={option}
                              disabled={!!busy || !crops[q.questionId]}
                              aria-pressed={answers[q.questionId] === option}
                              title={option}
                              onClick={() => choose(q.questionId, option)}
                            >
                              {choiceLabel(index)}
                            </button>
                          ))}
                          <button
                            className="psc-blank-choice"
                            disabled={!!busy || !crops[q.questionId]}
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
                      onClick={() => void finishPage(batch.length > 0)}
                    >
                      {batch.length ? "Save page & continue →" : "Save reviewed page"}
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
                  {batch.some((item) => item.state === "ready" && item.draft?.sheet.id !== sheetId) ? <button className="paw-button primary" disabled={!!busy} onClick={() => void nextReviewPage()}>Review next page →</button> : null}
                  {!allPagesReviewed ? (
                    <button
                      className="paw-button primary"
                      disabled={!!busy}
                      onClick={() => {
                        const next = batchRef.current.find((item) => item.state === "ready" && item.draft?.session.id === session?.id &&
                          (sheet.guestId ? item.draft.sheet.guestId === sheet.guestId : item.draft.sheet.studentId === sheet.studentId));
                        if (next) void openBatchPage(next);
                        else upload.current?.click();
                      }}
                    >
                      Continue to next page
                    </button>
                  ) : null}
                </div>
              )}
              {allPagesReviewed && !sheet.heldAt ? (
                <div className="psc-confirm">
                  {sheet.guestId && !sheet.studentId ? (
                    <div className="psc-guest-form">
                      <label className="psc-date">
                        Name written on the sheet
                        <input
                          value={guestName}
                          maxLength={120}
                          disabled={!!busy}
                          onChange={(e) => setGuestName(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <label className="psc-date">
                        School ID or class (optional)
                        <input
                          value={guestReference}
                          maxLength={80}
                          disabled={!!busy}
                          onChange={(e) => setGuestReference(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  ) : null}
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
                    disabled={
                      !!busy ||
                      (needsReplacement && !replace) ||
                      (!!sheet.guestId && !sheet.studentId && !guestName.trim())
                    }
                    onClick={() => void finalize()}
                  >
                    {sheet.guestId && !sheet.studentId
                      ? "Save for later linking"
                      : "Confirm student result"}
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


