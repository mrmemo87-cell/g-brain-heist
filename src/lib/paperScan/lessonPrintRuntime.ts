import {
  prepareBookletPrint,
  BOOKLET_PRINT_CSS,
  type BookletPrintSettings,
} from "./printBooklets";
async function start() {
  const style = document.createElement("style");
  style.textContent =
    BOOKLET_PRINT_CSS +
    "main[data-lesson-print]{padding:0;max-width:none;background:transparent}.question-pack .page,.question-page .page{min-height:0;break-after:auto}.question-page-body h1{font-size:24px}.question-page-body h2{font-size:20px}.bar label{display:flex;align-items:center;gap:6px}.bar select{min-height:44px}.bar input{min-width:24px;min-height:24px}";
  document.head.append(style);
  const content = document.querySelector<HTMLElement>("[data-lesson-print]");
  if (!content) return;
  const status = document.getElementById("lesson-print-status")!,
    button = document.getElementById("lesson-print") as HTMLButtonElement,
    original = content.innerHTML;
  let busy = false;
  async function prepare() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = "Preparing pages…";
    try {
      content!.innerHTML = original;
      await document.fonts?.ready;
      await Promise.all(
        Array.from(content!.querySelectorAll("img")).map(async (img) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              img.decode(),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      Error("School logo unavailable. Reload before printing."),
                    ),
                  10000,
                );
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        }),
      );
      const settings: BookletPrintSettings = {
        keepTogether: (
          document.getElementById("lesson-keep") as HTMLInputElement
        ).checked,
        duplex: (document.getElementById("lesson-duplex") as HTMLInputElement)
          .checked,
        pagesPerSide: Number(
          (document.getElementById("lesson-pages") as HTMLSelectElement).value,
        ) as 1 | 2 | 4,
      };
      // Preserve deliberate section boundaries, then let the shared engine measure each section.
      for (const source of Array.from(content!.querySelectorAll<HTMLElement>('.question-pack'))) {
        if (!source.querySelector(':scope > .page, :scope > .break')) continue;
        const header = source.querySelector(':scope > header');
        const fragment = document.createDocumentFragment();
        let group: Node[] = [];
        const flush = () => {
          if (!group.some(n => n.nodeType !== 3 || n.textContent?.trim())) { group = []; return; }
          const section = document.createElement('section'); section.className = 'question-pack';
          if (header) section.append(header.cloneNode(true));
          section.append(...group); fragment.append(section); group = [];
        };
        for (const child of Array.from(source.childNodes)) {
          if (child === header) continue;
          if (child instanceof HTMLElement && child.classList.contains('page')) {
            flush(); group = Array.from(child.childNodes).map(n => n.cloneNode(true)); flush();
          } else if (child instanceof HTMLElement && child.classList.contains('break')) flush();
          else group.push(child.cloneNode(true));
        }
        flush(); source.replaceWith(fragment);
      }
      const plan = prepareBookletPrint(document, settings);
      const pages = Array.from(
        content!.querySelectorAll<HTMLElement>(".question-page"),
      );
      pages.forEach((p, i) => {
        const footer = document.createElement("small");
        footer.textContent = `${document.title} · Page ${i + 1} of ${pages.length}`;
        footer.style.cssText =
          "position:absolute;bottom:5mm;left:16mm;right:16mm;font:10px Arial;color:#4c6076";
        p.style.position = "relative";
        p.append(footer);
      });
      status.textContent = `${plan.contentPages} pages · ${plan.physicalSheets} sheets. In the print dialog choose A4, ${settings.duplex ? "double-sided" : "single-sided"}, ${settings.pagesPerSide} page(s) per side, actual size, headers/footers off.`;
      button.disabled = false;
      queueMicrotask(() => window.dispatchEvent(new Event("resize")));
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : "Layout unavailable. Reload to retry.";
    } finally {
      busy = false;
    }
  }
  const scale = () => {
    const viewport = content!.parentElement;
    if (!viewport) return;
    const width = content!.offsetWidth;
    const ratio = Math.min(1, Math.max(200, window.innerWidth - 24) / width);
    content!.style.transform = `scale(${ratio})`;
    viewport.style.width = `${width * ratio}px`;
    viewport.style.height = `${content!.offsetHeight * ratio}px`;
  };
  window.addEventListener("resize", scale);
  button.onclick = () => window.print();
  document
    .querySelectorAll(".bar input,.bar select")
    .forEach((c) => c.addEventListener("change", () => void prepare()));
  await prepare();
}
void start();
