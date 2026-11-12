/**
 * Renders a genuine Brains Heist answer sheet with the app's own print code,
 * so the sheet shown in the video is pixel-identical to what teachers print.
 *
 * Run from the repository root:  npx tsx video/bubble-sheet-demo/scripts/generate-sheet.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBubbleSheetSvg } from "../../../services/scanSheetPrintService";
import type { ScanSession, ScanSheet } from "../../../src/lib/paperScan/layout";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public");
mkdirSync(out, { recursive: true });

const questions: ScanSheet["questions"] = Array.from({ length: 20 }, (_, i) => ({
  questionId: `q${i + 1}`,
  orderIndex: i + 1,
  options: ["A", "B", "C", "D"],
}));

const sheet: ScanSheet = {
  id: "7f3a9c2e-4b1d-4e8a-9c6f-2d5b8a1e3f47",
  studentId: "student-demo",
  studentName: "Layla Hassan",
  pageNumber: 1,
  pageCount: 1,
  layoutVersion: "bh-bubbles-v1",
  questions,
};

const session: ScanSession = {
  id: "session-demo",
  assignmentId: "assignment-demo",
  assessedAt: "2026-11-12T08:00:00.000Z",
  formHash: "a81f3c9d2e4b",
  sheets: [sheet],
};

// Only the fields the SVG builder reads are populated; the rest of the
// PaperWorkspace shape is irrelevant for rendering a sheet.
const packet = {
  code: "BH-4K7Q",
  assignment: { title: "Unit 4 Quiz: Cells & Organelles", className: "Grade 9 Biology" },
  questions: [],
} as unknown as Parameters<typeof buildBubbleSheetSvg>[2];

const svg = buildBubbleSheetSvg(sheet, session, packet, "Al Noor International School");
writeFileSync(join(out, "sheet.svg"), svg);
console.log(`Wrote ${join(out, "sheet.svg")} (${svg.length} bytes)`);
