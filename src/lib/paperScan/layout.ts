export const LAYOUT = {
  version: "bh-bubbles-v1",
  width: 1000,
  height: 1414,
  capacity: 40,
  radius: 12,
  qr: { x: 750, y: 95, size: 180 },
  markers: [
    { x: 45, y: 45 },
    { x: 955, y: 45 },
    { x: 955, y: 1369 },
    { x: 45, y: 1369 },
  ],
} as const;
export interface ScanQuestion {
  questionId: string;
  orderIndex: number;
  options: string[];
}
export interface ScanSheet {
  id: string;
  studentId: string | null;
  guestId?: string | null;
  guestNumber?: number | null;
  claimedName?: string;
  localReference?: string;
  heldAt?: string | null;
  studentName: string;
  pageNumber: number;
  pageCount: number;
  layoutVersion: string;
  questions: ScanQuestion[];
  scanId?: string | null;
  scannedAt?: string | null;
  imageHash?: string | null;
  detected?: Record<string, DetectedRow> | null;
  reviewedAnswers?: Record<string, string | null> | null;
  confirmedAt?: string | null;
}
export interface ScanSession {
  id: string;
  assignmentId: string;
  assessedAt: string;
  formHash: string;
  sheets: ScanSheet[];
}
export interface DetectedRow {
  choice: number | null;
  state: "clear" | "blank" | "uncertain" | "multiple";
  coverage: number[];
}
export const bubblePosition = (row: number, choice: number) => ({
  x: (row < 20 ? 210 : 650) + choice * 48,
  y: 395 + (row % 20) * 39,
});
export const rowLabelPosition = (row: number) => ({
  x: row < 20 ? 125 : 565,
  y: bubblePosition(row, 0).y,
});
export const QR_PREFIX = "BH1:";
export function parseSheetToken(text: string): string {
  if (
    !/^BH1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  )
    throw new Error("This is not a Brains Heist answer sheet.");
  return text.slice(QR_PREFIX.length).toLowerCase();
}

export const guestBookletCode = (guestId: string, number: number) =>
  `G${String(number).padStart(3, "0")}-${guestId.slice(0, 6).toUpperCase()}`;

/** Equal-width preview cells keep every photographed bubble over its answer button. */
export const bubblePreviewRegion = (row: number, choiceCount: number) => {
  const first = bubblePosition(row, 0);
  return { x: first.x - 24, y: first.y - 19, width: choiceCount * 48, height: 38 };
};
