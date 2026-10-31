import QRCode from "qrcode";
import { questionHtml } from "./teacherAssignmentPrintService.js";
import { paperOptions } from "./assignmentPaperService.js";
import { LAYOUT, guestBookletCode, QR_PREFIX, bubblePosition, rowLabelPosition, } from "../src/lib/paperScan/layout.js";
import { escapeSchoolDocumentHtml as escape } from "../src/lib/schoolDocument.js";
import { BOOKLET_PRINT_CSS, DEFAULT_BOOKLET_PRINT_SETTINGS, prepareBookletPrint, } from "../src/lib/paperScan/printBooklets.js";
import { normalizeBrandLogoUrl, PRODUCT_LOGO_URL, } from "../src/lib/schoolBranding.js";
const text = (x, y, value, size = 20, weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="#172438">${escape(value)}</text>`;
const short = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
export function buildBubbleSheetSvg(sheet, session, packet, schoolName, schoolLogoUrl) {
    const logo = normalizeBrandLogoUrl(schoolLogoUrl);
    const schoolLogo = logo !== PRODUCT_LOGO_URL ? logo : null;
    const qr = QRCode.create(QR_PREFIX + sheet.id, { errorCorrectionLevel: "M" });
    const unit = LAYOUT.qr.size / (qr.modules.size + 8);
    let qrPath = "";
    for (let row = 0; row < qr.modules.size; row++)
        for (let col = 0; col < qr.modules.size; col++)
            if (qr.modules.get(row, col)) {
                const x = LAYOUT.qr.x + (col + 4) * unit, y = LAYOUT.qr.y + (row + 4) * unit;
                qrPath += `M${x} ${y}h${unit}v${unit}h-${unit}z`;
            }
    const columns = [210, 650];
    const grid = sheet.questions
        .map((q, row) => {
        const label = rowLabelPosition(row);
        return (text(label.x, label.y + 7, String(q.orderIndex), 22, 700) +
            q.options
                .map((_, i) => {
                const p = bubblePosition(row, i);
                return `<circle cx="${p.x}" cy="${p.y}" r="${LAYOUT.radius}" fill="white" stroke="#172438" stroke-width="1.7"/>`;
            })
                .join(""));
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
 ${sheet.guestId && !sheet.studentId ? text(90, 285, `Booklet ${guestBookletCode(sheet.guestId, sheet.guestNumber)} · Name: ______________`, 21, 700) : text(90, 300, short(sheet.studentName, 39), 27, 700)}
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
export function openSheetPrintWindow() {
    const win = window.open("", "_blank");
    if (!win)
        throw new Error("Allow pop-ups to print your sheets.");
    win.document.write('<!doctype html><title>Preparing answer sheets</title><p style="font:18px Arial;padding:32px">Preparing your sheets…</p>');
    win.document.close();
    return win;
}
export function renderSheetPrintWindow(win, session, packet, schoolName, schoolLogoUrl, includeQuestions = false, questionsOnlyCopies = 0, printSettings = DEFAULT_BOOKLET_PRINT_SETTINGS) {
    if (win.closed)
        throw new Error("The print window was closed. Try again.");
    const questionPack = (name, rows, booklet) => {
        const logo = normalizeBrandLogoUrl(schoolLogoUrl);
        const badge = logo && logo !== PRODUCT_LOGO_URL
            ? `<img class="pack-logo" src="${escape(logo)}" alt="School logo">`
            : "";
        const frozen = new Map(rows?.map((q) => [q.questionId, q.options]));
        const testDate = new Date(session.assessedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        return `<section class="question-pack"><header>${badge}<strong>BRAINS HEIST</strong><span>${escape(schoolName)}</span></header><h1>${escape(packet.assignment.title)}</h1><p class="pack-meta">${escape(packet.code)} · Questions · ${packet.questions.length} items · ${escape(testDate)}${booklet ? ` · Booklet ${escape(booklet)}` : ""}</p><p class="pack-name">Name: ${escape(name)}${name ? "" : "____________________________"}</p><p class="pack-instruction">${escape(packet.assignment.instructions?.trim() || (includeQuestions ? "Write your answers on the matching QR bubble sheet." : "Follow your teacher’s instructions for answering."))}</p>${packet.questions.map((q) => questionHtml({ ...q, options: frozen.has(q.questionId) ? frozen.get(q.questionId).map((text) => paperOptions(q).find((o) => o.text === text) || { text }) : paperOptions(q), optionOrderPolicy: "assignment-balanced-v1" })).join("")}</section>`;
    };
    let content = "";
    if (questionsOnlyCopies) {
        content = Array.from({ length: questionsOnlyCopies }, (_, index) => `<article class="student-booklet" data-booklet="${index + 1}">${questionPack("")}</article>`).join("");
    }
    else {
        const groups = new Map();
        session.sheets.forEach((s) => {
            const key = s.guestId || s.studentId;
            groups.set(key, [...(groups.get(key) || []), s]);
        });
        content = [...groups.values()]
            .map((pages) => {
            pages.sort((a, b) => a.pageNumber - b.pageNumber);
            const first = pages[0];
            return `<article class="student-booklet" data-booklet="${escape(first.guestId || first.studentId || "")}">` + ((includeQuestions
                ? questionPack(first.guestId && !first.studentId ? "" : first.studentName, pages.flatMap((p) => p.questions), first.guestId
                    ? guestBookletCode(first.guestId, first.guestNumber)
                    : null)
                : "") +
                pages
                    .map((sheet) => `<section class="sheet print-page">${buildBubbleSheetSvg(sheet, session, packet, schoolName, schoolLogoUrl)}</section>`)
                    .join("")) + "</article>";
        })
            .join("");
    }
    win.document.open();
    win.document
        .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(packet.code)} · Answer sheets</title><style>
 ${BOOKLET_PRINT_CSS}
 </style></head><body><div class="bar"><button id="print" disabled>Preparing…</button><div class="bar-copy"><strong id="print-status" role="status">Counting pages and preparing booklets…</strong><span id="printer-reminder"></span></div></div><div class="preview-viewport"><main class="preview-stage">${content}</main></div></body></html>`);
    win.document.close();
    win.document
        .getElementById("print")
        ?.addEventListener("click", () => win.print());
    // Question visuals must finish loading before a pack can be printed.
    const visuals = Array.from(win.document.querySelectorAll("svg image, img"));
    const sourceOf = (element) => element.getAttribute("href") || element.getAttribute("src");
    const sources = [
        ...new Set(visuals.map(sourceOf).filter((src) => !!src)),
    ];
    void Promise.all(sources.map(async (src) => {
        const image = win.document.createElement("img");
        image.src = src;
        let timer;
        try {
            await Promise.race([
                image.decode(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Image unavailable")), 10000);
                }),
            ]);
            return { src, loaded: true };
        }
        catch {
            return { src, loaded: false };
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    })).then(async (results) => {
        if (win.closed)
            return;
        let missingQuestion = false, missingLogo = false;
        results
            .filter((result) => !result.loaded)
            .forEach(({ src }) => {
            visuals
                .filter((element) => sourceOf(element) === src)
                .forEach((element) => {
                if (element.matches("svg image, .pack-logo")) {
                    missingLogo = true;
                    element.remove();
                }
                else
                    missingQuestion = true;
            });
        });
        const button = win.document.getElementById("print");
        const status = win.document.getElementById("print-status");
        if (missingQuestion) {
            if (button) {
                button.disabled = true;
                button.textContent = "Images unavailable";
            }
            if (status)
                status.textContent = "A question image could not load. Close this preview and try again.";
            return;
        }
        try {
            await win.document.fonts?.ready;
            if (win.closed)
                return;
            const plan = prepareBookletPrint(win.document, printSettings);
            if (status)
                status.textContent = `${plan.physicalSheets} physical sheets · ${plan.contentPages} content pages · ${plan.blankPages} added blank pages`;
            const reminder = win.document.getElementById("printer-reminder");
            if (reminder)
                reminder.textContent = `${printSettings.duplex ? "Double-sided" : "Single-sided"} · ${printSettings.pagesPerSide} page${printSettings.pagesPerSide === 1 ? "" : "s"} per side · A4 · Actual size · Headers & footers off · Copies: 1 · Print all pages. Use these same settings in the printer dialog.${printSettings.keepTogether ? " Keep blank pages: each booklet starts on a fresh sheet." : " Student separation is off."}${missingLogo ? " School logo unavailable." : ""}`;
            const stage = win.document.querySelector(".preview-stage");
            const viewport = win.document.querySelector(".preview-viewport");
            const scalePreview = () => {
                if (!stage || !viewport)
                    return;
                const width = stage.offsetWidth;
                const scale = Math.min(1, Math.max(200, win.innerWidth - 24) / width);
                stage.style.transform = `scale(${scale})`;
                viewport.style.width = `${width * scale}px`;
                viewport.style.height = `${stage.offsetHeight * scale}px`;
            };
            scalePreview();
            win.addEventListener("resize", scalePreview);
            if (button) {
                button.disabled = false;
                button.textContent = "Print / Save PDF";
            }
        }
        catch (error) {
            if (status)
                status.textContent = error instanceof Error ? error.message : "This pack could not be paginated. Close the preview and try again.";
            if (button) {
                button.disabled = true;
                button.textContent = "Check page layout";
            }
        }
    });
}
