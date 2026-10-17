import { lessonPrintRuntime } from "./ieltsPrintRuntime.generated";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function lessonLogo(url: string | null) {
  if (url)
    try {
      const u = new URL(url);
      if (u.protocol === "https:")
        return `<img class="pack-logo" src="${esc(u.href)}" alt="School logo">`;
    } catch {
      /* Show missing logo explicitly. */
    }
  return "<small>School logo unavailable · ask your school administrator to add it.</small>";
}
export function smartLessonPrint(html: string, title: string) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html),
    main = /<main[^>]*>([\s\S]*)<\/main>/.exec(html),
    source = (body?.[1] ?? main?.[1] ?? "").replace(
      /<main[^>]*>([\s\S]*)<\/main>/,
      "$1",
    );
  if (!source) throw Error("Printable content is unavailable");
  const bar =
    '<div class="bar"><button id="lesson-print" disabled>Print / Save PDF</button><label><input id="lesson-duplex" type="checkbox" checked>Double-sided</label><label>Pages per side<select id="lesson-pages"><option>1</option><option>2</option><option>4</option></select></label><label><input id="lesson-keep" type="checkbox" checked>Keep booklets together</label><span id="lesson-print-status" role="status">Preparing…</span></div>';
  return html
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(
      body ? /<body[^>]*>[\s\S]*<\/body>/ : /<main[^>]*>[\s\S]*<\/main>/,
      () =>
        `<body>${bar}<div class="preview-viewport"><main data-lesson-print class="preview-stage"><article class="student-booklet"><section class="question-pack">${source}</section></article></main></div><script>${lessonPrintRuntime.replace(/<\/script/gi, "<\\/script")}</script></body>`,
    );
}
