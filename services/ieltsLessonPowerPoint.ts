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
): Uint8Array {
  const tokens: Record<string, string> = { SCHOOL_NAME: lesson.school.name };
  for (const m of lesson.materials) {
    const n =
      m.display_code === "L-003" ? 3 : m.display_code === "L-004" ? 4 : null;
    if (n === null) throw new Error("Unexpected lesson material");
    tokens[`L${n}_TITLE`] = `${m.display_code}: ${m.title}`;
    tokens[`L${n}_INSTRUCTIONS`] = m.instructions;
    m.questions.forEach((q, i) => (tokens[`L${n}_Q${i + 1}`] = q.prompt));
  }
  const files = unzipSync(template);
  let replaced = 0;
  for (const path of Object.keys(files))
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
      let value = strFromU8(files[path]);
      value = value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
        if (!(key in tokens)) throw new Error("Missing presentation content");
        replaced++;
        return xml(tokens[key]);
      });
      files[path] = strToU8(value);
    }
  if (replaced < 20)
    throw new Error("Presentation template could not be verified");
  return zipSync(files);
}
export async function lessonPowerPoint(lesson: TeacherLesson): Promise<Blob> {
  const response = await fetch("/ielts/lessons/ielts-01-v1-template.pptx");
  if (!response.ok) throw new Error("Presentation could not load");
  const bytes = populateLessonPowerPoint(
    new Uint8Array(await response.arrayBuffer()),
    lesson,
  );
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
