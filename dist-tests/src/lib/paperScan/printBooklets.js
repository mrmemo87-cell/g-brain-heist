export const DEFAULT_BOOKLET_PRINT_SETTINGS = {
    keepTogether: true,
    duplex: true,
    pagesPerSide: 1,
};
export const BOOKLET_PRINT_CSS = `
  @page { size:A4 portrait; margin:0; }
  * { box-sizing:border-box; }
  body { margin:0; background:#e8edf4; font-family:Arial,sans-serif; color:#172438; }
  .bar { position:sticky; top:0; background:#172438; color:white; padding:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; z-index:2; }
  .bar button { padding:10px 20px; border:0; border-radius:8px; background:white; color:#172438; font-weight:bold; cursor:pointer; }
  .bar button:disabled { opacity:.65; cursor:wait; }
  .bar-copy { display:grid; gap:5px; }
  #printer-reminder { font-size:12px; line-height:1.5; }
  .preview-viewport { margin:0 auto; }
  .preview-stage { width:210mm; transform-origin:top left; }
  .student-booklet { display:flow-root; }
  .print-page { width:210mm; height:297mm; margin:20px auto; background:white; }
  .sheet svg { display:block; width:210mm; height:297mm; }
  .question-pack { width:210mm; padding:16mm; background:white; }
  .question-page { padding:16mm; }
  .question-page-body { height:265mm; display:flow-root; overflow-wrap:anywhere; }
  .question-pack header,.question-page header { position:relative; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid #d4d9e0; padding:0 23mm 12px 0; min-height:20mm; }
  .pack-logo { position:absolute; right:0; top:0; width:18mm; height:18mm; object-fit:contain; }
  .question-pack h1,.question-page h1 { font-size:24px; margin:20px 0 8px; }
  .pack-meta,.pack-instruction { font-size:12px; }
  .pack-name { font-size:16px; margin:22px 0; }
  .document-card { border:1px solid #d4d9e0; border-radius:8px; padding:4mm; break-inside:avoid; }
  .document-card strong { font-size:14px!important; white-space:pre-wrap; }
  .question-page ol,.question-pack ol { font-size:14px; line-height:1.5; }
  .blank-page { display:flex; align-items:center; justify-content:center; color:#68788e; border:2px dashed #b9c4d4; }
  .blank-page span { font-size:16px; text-align:center; padding:30px; }
  @media print {
    html,body { background:white; margin:0; padding:0; }
    .bar { display:none; }
    .preview-viewport { width:auto!important; height:auto!important; margin:0; }
    .preview-stage { width:auto; transform:none!important; }
    .print-page { margin:0; break-inside:avoid; break-after:page; }
    .student-booklet:last-child .print-page:last-child { break-after:auto; }
    .blank-page { display:block; border:0; }
    .blank-page span { display:none; }
  }
  @media screen and (max-width:850px) { .bar { gap:10px; padding:12px; } }
`;
export function planBookletPrint(pageCounts, settings) {
    if (![1, 2, 4].includes(settings.pagesPerSide))
        throw new Error("Choose 1, 2 or 4 pages per side.");
    if (pageCounts.some((count) => !Number.isInteger(count) || count < 1))
        throw new Error("Every booklet must contain at least one complete page.");
    const pagesPerSheet = settings.pagesPerSide * (settings.duplex ? 2 : 1);
    let totalPages = 0;
    const padding = [], startPages = [];
    pageCounts.forEach((count, index) => {
        startPages.push(totalPages + 1);
        totalPages += count;
        // No spacer is needed after the final student.
        const blanks = settings.keepTogether && index < pageCounts.length - 1
            ? (pagesPerSheet - totalPages % pagesPerSheet) % pagesPerSheet : 0;
        padding.push(blanks);
        totalPages += blanks;
    });
    const contentPages = pageCounts.reduce((sum, count) => sum + count, 0);
    return {
        pagesPerSheet, padding, startPages, contentPages,
        blankPages: totalPages - contentPages, totalPages,
        physicalSheets: Math.ceil(totalPages / pagesPerSheet),
    };
}
/** Measure at physical A4 width after fonts/images load, before preview scaling. */
export function paginateQuestionPack(source) {
    const document = source.ownerDocument;
    const pages = [];
    let page;
    let body;
    const newPage = () => {
        page = document.createElement("section");
        page.className = "print-page question-page";
        body = document.createElement("div");
        body.className = "question-page-body";
        page.append(body);
        source.before(page);
        pages.push(page);
    };
    newPage();
    const fits = () => body.scrollHeight <= body.clientHeight;
    const place = (node, ancestors, originalNode = node) => {
        let outer = node, next = node;
        // Keep list lettering when an exceptionally long question spans pages.
        for (let i = ancestors.length - 1; i >= 0; i--) {
            const original = ancestors[i];
            const wrapper = original.cloneNode(false);
            if (original.tagName === "OL") {
                const child = ancestors[i + 1] || originalNode;
                const index = Array.from(original.children).indexOf(child);
                if (index >= 0)
                    wrapper.setAttribute("start", String(Number(original.getAttribute("start") || 1) + index));
            }
            wrapper.append(next);
            next = wrapper;
            outer = wrapper;
        }
        body.append(outer);
        return outer;
    };
    const append = (original, ancestors = []) => {
        if (original.nodeType === 3 && !original.textContent?.trim())
            return;
        let outer = place(original.cloneNode(true), ancestors, original);
        if (fits())
            return;
        outer.remove();
        if (body.childNodes.length) {
            newPage();
            outer = place(original.cloneNode(true), ancestors, original);
            if (fits())
                return;
            outer.remove();
        }
        if (original.nodeType === 1 && original.childNodes.length) {
            const element = original;
            Array.from(element.childNodes).forEach((child) => append(child, [...ancestors, element]));
            return;
        }
        if (original.nodeType !== 3)
            throw new Error("A question visual is too large for A4. Resize it before printing.");
        let remaining = original.textContent || "";
        while (remaining.length) {
            let low = 1, high = remaining.length, best = 0;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const trial = place(document.createTextNode(remaining.slice(0, mid)), ancestors);
                if (fits()) {
                    best = mid;
                    low = mid + 1;
                }
                else
                    high = mid - 1;
                trial.remove();
            }
            if (!best)
                throw new Error("The question cannot fit on an A4 page.");
            // Prefer a word boundary, without discarding any text.
            const boundary = remaining.slice(0, best).search(/\s+\S*$/);
            if (best < remaining.length && boundary > 0)
                best = boundary + 1;
            place(document.createTextNode(remaining.slice(0, best)), ancestors);
            remaining = remaining.slice(best);
            if (remaining.length)
                newPage();
        }
    };
    Array.from(source.childNodes).forEach((node) => append(node));
    source.remove();
    return pages;
}
export function prepareBookletPrint(document, settings) {
    const booklets = Array.from(document.querySelectorAll(".student-booklet"));
    booklets.forEach((booklet) => {
        booklet.querySelectorAll(".question-pack").forEach(paginateQuestionPack);
    });
    const counts = booklets.map((booklet) => booklet.querySelectorAll(".print-page").length);
    const plan = planBookletPrint(counts, settings);
    booklets.forEach((booklet, index) => {
        booklet.dataset['startPage'] = String(plan.startPages[index]);
        for (let i = 0; i < plan.padding[index]; i++) {
            const blank = document.createElement("section");
            blank.className = "print-page blank-page";
            blank.setAttribute("aria-label", "Blank spacer page");
            const label = document.createElement("span");
            label.textContent = "Blank spacer · the next student's papers start on a new sheet";
            blank.append(label);
            booklet.append(blank);
        }
    });
    return plan;
}
