import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { TeacherLesson } from "./ieltsLessonService";
const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function populateLessonPowerPoint(
  template: Uint8Array,
  lesson: TeacherLesson,
  reducedMotion = false,
): Uint8Array {
  if (
    lesson.materials.length !== 2 ||
    new Set(lesson.materials.map((m) => m.display_code)).size !== 2 ||
    lesson.materials.some(
      (m) =>
        m.questions.length !== 6 ||
        m.questions.some((q) => !q.accepted_answers.length),
    )
  )
    throw new Error("Presentation needs both approved six-question activities");
  const tokens: Record<string, string> = { SCHOOL_NAME: lesson.school.name };
  for (const m of lesson.materials) {
    const n =
      m.display_code === "L-003" ? 3 : m.display_code === "L-004" ? 4 : null;
    if (n === null) throw new Error("Unexpected lesson material");
    tokens[`L${n}_TITLE`] = m.title;
    tokens[`L${n}_INSTRUCTIONS`] = m.instructions;
    m.questions.forEach((q, i) => {
      tokens[`L${n}_Q${i + 1}`] = q.prompt;
      tokens[`L${n}_A${i + 1}`] = q.accepted_answers.join(" / ");
    });
  }
  const files = unzipSync(template);
  let replaced = 0;
  for (const path of Object.keys(files))
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
      let value = strFromU8(files[path]);
      if (value.replace(/\{\{[A-Z0-9_]+\}\}/g, "").includes("{{"))
        throw new Error("Malformed presentation placeholder");
      value = value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
        if (!(key in tokens)) throw new Error("Missing presentation content");
        replaced++;
        return xml(tokens[key]);
      });
      if (reducedMotion)
        value = value.replace(
          /<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/g,
          "",
        );
      files[path] = strToU8(value);
    }
  if (replaced < 20)
    throw new Error("Presentation template could not be verified");
  return zipSync(files);
}
export async function lessonPowerPoint(
  lesson: TeacherLesson,
  reducedMotion = false,
): Promise<Blob> {
  const response = await fetch("/ielts/lessons/ielts-01-v2-template.pptx");
  if (!response.ok) throw new Error("Presentation could not load");
  const bytes = populateLessonPowerPoint(
    new Uint8Array(await response.arrayBuffer()),
    lesson,
    reducedMotion,
  );
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
