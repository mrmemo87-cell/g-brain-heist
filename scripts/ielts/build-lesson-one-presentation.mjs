// Run with CODEX_PRIMARY_RUNTIME_NODE and CODEX_PRIMARY_RUNTIME_NODE_MODULES.
// Generated public file contains placeholders only. Private material arrives
// exclusively through the authorized teacher RPC at download time.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
if (!runtime)
  throw new Error(
    "Set CODEX_PRIMARY_RUNTIME_NODE_MODULES to the Artifact Tool runtime",
  );
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(runtime, "@oai/artifact-tool/dist/artifact_tool.mjs"))
);
const bundle = await build({
  stdin: {
    contents:
      "export {lessonPresentation,lessonProduction} from './services/ieltsLessonPresentation'",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { lessonPresentation, lessonProduction } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const lesson = {
  materials: [3, 4].map((n) => ({
    display_code: `L-00${n}`,
    title: `{{L${n}_TITLE}}`,
    instructions: `{{L${n}_INSTRUCTIONS}}`,
    questions: Array.from({ length: 6 }, (_, i) => ({
      prompt: `{{L${n}_Q${i + 1}}}`,
      accepted_answers: [`{{L${n}_A${i + 1}}}`],
    })),
  })),
};
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const slides = lessonPresentation(lesson);
const out = process.env.IELTS_PREVIEW_DIR || "/tmp/ielts-lesson-two-preview";
await fs.mkdir(out, { recursive: true });
function text(
  slide,
  name,
  value,
  left,
  top,
  width,
  height,
  size,
  color,
  bold = false,
) {
  const shape = slide.shapes.add({
    name,
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = { typeface: "DejaVu Sans", fontSize: size, color, bold };
  return shape;
}
for (const [i, s] of slides.entries()) {
  const slide = deck.slides.add();
  const dark = false;
  slide.background.fill = dark ? "#15243A" : "#FFFFFF";
  text(
    slide,
    "school",
    "{{SCHOOL_NAME}}",
    64,
    36,
    1152,
    48,
    24,
    dark ? "#FFFFFF" : "#15243A",
  );
  text(
    slide,
    "phase",
    s.phase,
    64,
    113,
    1152,
    36,
    21,
    dark ? "#B6CEFF" : "#1746B0",
    true,
  );
  text(
    slide,
    "headline",
    s.title,
    64,
    185,
    1152,
    224,
    s.layout === "hero" ? 60 : 48,
    s.layout === "reveal" ? "#1746B0" : dark ? "#FFFFFF" : "#15243A",
    true,
  );
  text(
    slide,
    "body",
    s.body,
    64,
    444,
    1152,
    166,
    30,
    dark ? "#FFFFFF" : "#15243A",
  );
  text(
    slide,
    "footer",
    `Brains Heist IELTS · IELTS-01 · Presentation ${lessonProduction.presentationVersion} · ${i + 1} / ${slides.length}`,
    64,
    649,
    1152,
    30,
    17,
    dark ? "#B6CEFF" : "#4C6076",
  );
  slide.speakerNotes.text = s.notes;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(
    `${out}/slide-${String(i + 1).padStart(2, "0")}.png`,
    new Uint8Array(await png.arrayBuffer()),
  );
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${out}/slide-${i + 1}.json`, await layout.text());
}
const file = await PresentationFile.exportPptx(deck);
await file.save(`${out}/base.pptx`);
const files = unzipSync(new Uint8Array(await fs.readFile(`${out}/base.pptx`)));
// PresentationML transition: no advTm means teacher advance. Answers live on
// separate slides, keeping the sequence identical in animated/static modes.
for (const p of Object.keys(files))
  if (/^ppt\/slides\/slide\d+\.xml$/.test(p)) {
    const xml = strFromU8(files[p]).replace(
      "<p:sld ",
      '<p:sld xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" mc:Ignorable="p14" ',
    );
    const transition = `<p:transition spd="fast" advClick="1" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="${lessonProduction.motionMs}"><p:fade/></p:transition>`;
    files[p] = strToU8(xml.replace("</p:sld>", transition + "</p:sld>"));
  }
await fs.writeFile(
  "public/ielts/lessons/ielts-01-v2-template.pptx",
  zipSync(files),
);
console.log(
  JSON.stringify({
    slides: slides.length,
    presentation: lessonProduction.presentationVersion,
    preview: out,
  }),
);
