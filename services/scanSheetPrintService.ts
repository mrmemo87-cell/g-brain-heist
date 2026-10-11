import QRCode from "qrcode";
import {
  LAYOUT,
  QR_PREFIX,
  bubblePosition,
  rowLabelPosition,
  type ScanSession,
  type ScanSheet,
} from "../src/lib/paperScan/layout";
import { escapeSchoolDocumentHtml as escape } from "../src/lib/schoolDocument";
import type { PaperWorkspace } from "./assignmentPaperService";
import { normalizeBrandLogoUrl, PRODUCT_LOGO_URL } from "../src/lib/schoolBranding";
const text = (x: number, y: number, value: string, size = 20, weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="#172438">${escape(value)}</text>`;
const short = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;
export function buildBubbleSheetSvg(
  sheet: ScanSheet,
  session: ScanSession,
  packet: PaperWorkspace,
  schoolName: string,
  schoolLogoUrl?: string | null,
): string {
  const logo = normalizeBrandLogoUrl(schoolLogoUrl);
  const schoolLogo = logo !== PRODUCT_LOGO_URL ? logo : null;
  const qr = QRCode.create(QR_PREFIX + sheet.id, { errorCorrectionLevel: "M" });
  const unit = LAYOUT.qr.size / (qr.modules.size + 8);
  let qrPath = "";
  for (let row = 0; row < qr.modules.size; row++)
    for (let col = 0; col < qr.modules.size; col++)
      if (qr.modules.get(row, col)) {
        const x = LAYOUT.qr.x + (col + 4) * unit,
          y = LAYOUT.qr.y + (row + 4) * unit;
        qrPath += `M${x} ${y}h${unit}v${unit}h-${unit}z`;
      }
  const columns = [210, 650];
  const grid = sheet.questions
    .map((q, row) => {
      const label = rowLabelPosition(row);
      return (
        text(label.x, label.y + 7, String(q.orderIndex), 22, 700) +
        q.options
          .map((_, i) => {
            const p = bubblePosition(row, i);
            return `<circle cx="${p.x}" cy="${p.y}" r="${LAYOUT.radius}" fill="white" stroke="#172438" stroke-width="1.7"/>`;
          })
          .join("")
      );
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LAYOUT.width} ${LAYOUT.height}" width="210mm" height="297mm" role="img" aria-label="Answer sheet for ${escape(sheet.studentName)}" style="font-family:Arial,sans-serif;background:white">
 <rect width="1000" height="1414" fill="white"/>
 ${LAYOUT.markers.map((p) => `<rect x="${p.x - 10}" y="${p.y - 10}" width="20" height="20" fill="black"/>`).join("")}
 ${text(90, 115, "BRAINS HEIST", 22, 800)}${text(90, 152, short(schoolName, 44), 19)}
 ${schoolLogo ? `<image href="${escape(schoolLogo)}" x="620" y="90" width="90" height="90" preserveAspectRatio="xMidYMid meet"/>` : ""}
 ${text(90, 181, "Answer sheet", 15, 700)}
 ${text(90, 210, short(packet.assignment.title, 35), 29, 700)}
 ${text(90, 255, `${packet.code} · Page ${sheet.pageNumber} of ${sheet.pageCount}`, 17)}
 <path d="${qrPath}" fill="black"/>
 ${text(90, 300, short(sheet.studentName, 39), 27, 700)}
 ${text(90, 329, `${packet.assignment.className || "Class"} · ${new Date(session.assessedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, 17)}
 ${columns.map((x) => ["A", "B", "C", "D"].map((letter, i) => text(x - 7 + i * 48, 370, letter, 20, 700)).join("")).join("")}
 ${grid}
 <line x1="500" y1="355" x2="500" y2="1180" stroke="#d4d9e0"/>
 <rect x="90" y="1200" width="820" height="105" rx="15" fill="#f2f4f7"/>
 <circle cx="125" cy="1240" r="12" fill="#172438"/>
 ${text(160, 1247, "Fill one bubble completely.", 21, 700)}
 ${text(160, 1277, "Use dark pencil or pen. Keep the corner squares clear.", 17)}
 ${text(90, 1338, `Form ${session.formHash.slice(0, 8)} · Sheet ${sheet.id.slice(0, 8).toUpperCase()} · ${LAYOUT.version}`, 15)}
 </svg>`;
}
export function openSheetPrintWindow(): Window {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups to print your sheets.");
  win.document.write(
    '<!doctype html><title>Preparing answer sheets</title><p style="font:18px Arial;padding:32px">Preparing your sheets…</p>',
  );
  win.document.close();
  return win;
}
export function renderSheetPrintWindow(
  win: Window,
  session: ScanSession,
  packet: PaperWorkspace,
  schoolName: string,
  schoolLogoUrl?: string | null,
) {
  if (win.closed) throw new Error("The print window was closed. Try again.");
  win.document.open();
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(packet.code)} · Answer sheets</title><style>
 @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8edf4;font-family:Arial,sans-serif}.bar{position:sticky;top:0;background:#172438;color:white;padding:16px;display:flex;align-items:center;gap:16px;z-index:2}.bar button{padding:10px 20px;border:0;border-radius:8px;background:white;color:#172438;font-weight:bold;cursor:pointer}.sheet{width:210mm;height:297mm;background:white;margin:20px auto;break-after:page}.sheet:last-child{break-after:auto}svg{display:block;width:210mm;height:297mm}@media print{body{background:white}.bar{display:none}.sheet{margin:0;box-shadow:none}}
 </style></head><body><div class="bar"><button id="print" disabled>Preparing…</button><span id="print-status" role="status">A4 · 100% / Actual size · Headers & footers off</span></div>${session.sheets.map((sheet) => `<section class="sheet">${buildBubbleSheetSvg(sheet, session, packet, schoolName, schoolLogoUrl)}</section>`).join("")}</body></html>`);
  win.document.close();
  win.document
    .getElementById("print")
    ?.addEventListener("click", () => win.print());
  // Wait for the school badge before offering print, including cached images.
  const logos = Array.from(win.document.querySelectorAll("svg image"));
  const sources = [...new Set(logos.map((logo) => logo.getAttribute("href")!))];
  void Promise.all(sources.map(async (src) => {
    const image = win.document.createElement("img");
    image.src = src;
    try {
      await image.decode();
      return true;
    } catch {
      logos.filter((logo) => logo.getAttribute("href") === src).forEach((logo) => logo.remove());
      return false;
    }
  })).then((loaded) => {
    if (win.closed) return;
    const button = win.document.getElementById("print") as HTMLButtonElement | null;
    if (button) { button.disabled = false; button.textContent = "Print sheets"; }
    if (loaded.includes(false)) {
      const status = win.document.getElementById("print-status");
      if (status) status.textContent = "School logo unavailable · A4 · Actual size · Headers & footers off";
    }
  });
}
