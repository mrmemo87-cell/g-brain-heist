import { supabase } from "./supabaseClient";
import { retryAssignmentOperation } from "./assignmentReliability";
import {
  paperOptions,
  type PaperWorkspace,
  type PaperAnswers,
} from "./assignmentPaperService";
import type { ScanSession, DetectedRow } from "../src/lib/paperScan/layout";
export interface GuestResult {
  id: string;
  name: string;
  reference: string;
  number: number;
  sessionId: string;
  assessedAt: string;
  heldAt: string | null;
  linkedAt: string | null;
  studentId: string | null;
  versionMatches: boolean;
  firstSheetId: string;
}
export interface GuestLinkCandidate {
  id: string;
  name: string;
  username: string;
  className: string;
  completed: boolean;
  existingAnswerCount: number;
}
const errors: Record<string, string> = {
  GUEST_RESULT_LOCKED: "This result is sealed and ready for linking.",
  GUEST_ALREADY_LINKED: "This booklet is already linked to another student.",
  GUEST_NAME_REQUIRED:
    "Enter the name written on the sheet (up to 120 characters).",
  GUEST_NOT_REVIEWED: "Review every page before linking this booklet.",
  STUDENT_NOT_ELIGIBLE:
    "The student must join your school and authorised teaching roster first.",
  IDENTITY_CONFIRMATION_REQUIRED:
    "Confirm that this account belongs to the student.",
  ASSIGNMENT_NOT_PUBLISHED:
    "Publish the assignment before issuing unnamed sheets.",
  ASSIGNMENT_CLOSED: "This test date falls after the assignment closed.",
  WRONG_ASSIGNMENT: "This sheet belongs to a different assignment.",
  NOT_AUTHORIZED: "Only the assignment teacher can scan these sheets.",
  PAPER_VERSION_CHANGED: "The assignment changed. Print a new set of sheets.",
  SCAN_SESSION_CONFLICT: "This print session changed. Start a new set.",
  ALREADY_COMPLETED: "This student already has a completed result.",
  SCAN_PAGES_INCOMPLETE: "Review every page before confirming this student.",
  SCAN_CHANGED: "A newer scan exists. Reopen the sheet.",
  SCAN_REVIEW_LOCKED:
    "This page was already reviewed. Scan it again to make a correction.",
  INVALID_ASSESSMENT_DATE:
    "Choose an assessment time between publication and now.",
  SHEET_NOT_FOUND: "This sheet could not be found.",
  ONLINE_PROGRESS_EXISTS:
    "Confirm replacement of unfinished online answers first.",
};
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await retryAssignmentOperation(async () => {
      const { data, error } = await supabase.rpc(name, args);
      if (error) throw error;
      return data as T;
    });
  } catch (error) {
    const message = (error as { message?: string })?.message || "";
    throw new Error(
      Object.entries(errors).find(([key]) => message.includes(key))?.[1] ||
        "Could not save. Keep this screen open and try again.",
    );
  }
}
export function issueScanSheets(
  packet: PaperWorkspace,
  sessionId: string,
  studentIds: string[],
  assessedAt: string,
) {
  return rpc<ScanSession>("rpc_teacher_issue_scan_sheets", {
    p_assignment_id: packet.assignment.id,
    p_session_id: sessionId,
    p_student_ids: studentIds,
    p_assessed_at: assessedAt,
    p_option_order: Object.fromEntries(
      packet.questions.map((q) => [
        q.questionId,
        paperOptions(q).map((o) => o.text),
      ]),
    ),
  });
}
export function resolveScanSheet(sheetId: string, assignmentId: string) {
  return rpc<ScanSession>("rpc_teacher_resolve_scan_sheet", {
    p_sheet_id: sheetId,
    p_assignment_id: assignmentId,
  });
}
export function saveScan(
  scanId: string,
  sheetId: string,
  imageHash: string,
  detected: Record<string, DetectedRow>,
) {
  return rpc<ScanSession>("rpc_teacher_save_scan", {
    p_scan_id: scanId,
    p_sheet_id: sheetId,
    p_image_hash: imageHash,
    p_detected: detected,
  });
}
export function reviewScan(scanId: string, answers: PaperAnswers) {
  return rpc<ScanSession>("rpc_teacher_review_scan", {
    p_scan_id: scanId,
    p_answers: answers,
  });
}
export async function confirmScan(
  sessionId: string,
  studentId: string,
  replacePartial: boolean,
) {
  const result = await rpc<{ success: boolean }>("rpc_teacher_confirm_scan", {
    p_session_id: sessionId,
    p_student_id: studentId,
    p_replace_partial: replacePartial,
  });
  if (result?.success !== true)
    throw new Error("The result was not confirmed. Please retry.");
}

export function issueUnnamedSheets(
  packet: PaperWorkspace,
  sessionId: string,
  count: number,
  assessedAt: string,
) {
  return rpc<ScanSession>("rpc_teacher_issue_unnamed_sheets", {
    p_assignment_id: packet.assignment.id,
    p_session_id: sessionId,
    p_count: count,
    p_assessed_at: assessedAt,
    p_option_order: Object.fromEntries(
      packet.questions.map((q) => [
        q.questionId,
        paperOptions(q).map((o) => o.text),
      ]),
    ),
  });
}
export const fetchGuestResults = (assignmentId: string) =>
  rpc<GuestResult[]>("rpc_teacher_guest_results", {
    p_assignment_id: assignmentId,
  });
export const fetchGuestCandidates = (assignmentId: string) =>
  rpc<GuestLinkCandidate[]>("rpc_teacher_guest_link_candidates", {
    p_assignment_id: assignmentId,
  });
export const holdGuest = (guestId: string, name: string, reference: string) =>
  rpc<ScanSession>("rpc_teacher_hold_guest", {
    p_guest_id: guestId,
    p_name: name,
    p_reference: reference,
  });
export async function linkGuest(
  guestId: string,
  studentId: string,
  replacePartial: boolean,
) {
  const result = await rpc<{ success: boolean }>("rpc_teacher_link_guest", {
    p_guest_id: guestId,
    p_student_id: studentId,
    p_identity_confirmed: true,
    p_replace_partial: replacePartial,
  });
  if (result?.success !== true)
    throw new Error("The result was not linked. Please retry.");
}
