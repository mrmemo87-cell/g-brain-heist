import { supabase } from "./supabaseClient";
export interface LessonMaterial {
  code: string;
  display_code: string;
  title: string;
  version: string;
  content_sha256: string;
  instructions: string;
  teacher_notes: string | null;
  questions: { id: string; prompt: string; accepted_answers: string[] }[];
  audio_bucket: string;
  audio_path: string;
  audio_sha256: string;
}
export interface TeacherLesson {
  school: { id: string; name: string; logo_url: string | null };
  lesson_code: string;
  version: string;
  materials: LessonMaterial[];
  reading_backup?: {
    code: string;
    display_code: string;
    title: string;
    version: string;
    content_sha256: string;
    instructions: string;
    passage: string;
    teacher_notes: string | null;
    questions: { id: string; prompt: string; accepted_answers: string[] }[];
  } | null;
}
export { lessonStages } from "./ieltsLessonPlan";
export async function teacherLessonOne(
  schoolId: string,
): Promise<TeacherLesson> {
  const { data, error } = await supabase.rpc("rpc_ielts_teacher_lesson_one", {
    p_school: schoolId,
  });
  if (
    error ||
    !data ||
    data.school?.id !== schoolId ||
    data.lesson_code !== "IELTS-01" ||
    !Array.isArray(data.materials)
  )
    throw new Error(
      "The lesson pack could not open. Check your programme access and connection, then retry.",
    );
  const r = data.reading_backup;
  if (
    r &&
    (r.code !== "bh-ielts-targeted-reading-r1-v1" ||
      r.display_code !== "R-001" ||
      typeof r.passage !== "string" ||
      !r.passage.trim() ||
      !Array.isArray(r.questions) ||
      r.questions.length !== 6 ||
      r.questions.some(
        (q: { accepted_answers?: unknown }) =>
          !Array.isArray(q.accepted_answers) || !q.accepted_answers.length,
      ))
  )
    throw new Error(
      "The paper Reading task could not be verified. Please reopen the lesson pack.",
    );
  return data;
}
export async function lessonAudio(m: LessonMaterial): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(m.audio_bucket)
    .download(m.audio_path);
  if (error || !data || data.size > 15_000_000)
    throw new Error("The recording could not download. Please retry.");
  const bytes = await data.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== m.audio_sha256)
    throw new Error(
      "The recording could not be verified. Please retry before teaching.",
    );
  return data;
}
