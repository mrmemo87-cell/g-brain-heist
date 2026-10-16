import { supabase } from "./supabaseClient";

export interface LessonTwoItem {
  id: string;
  statement: string;
  answer: string;
  evidence: string;
  reason: string;
  focus?: string;
}

export interface LessonTwoStage {
  start: number;
  end: number;
  title: string;
  slides: string;
  student: string;
  teacher: string;
  say: string;
  check: string;
}

export interface LessonTwoSource {
  code: "IELTS-02";
  version: "1.0.0";
  title: string;
  duration: number;
  prerequisites: string[];
  objectives: string[];
  audio: string;
  reading: { id: string; title: string; instructions: string; paragraphs: string[]; items: LessonTwoItem[] };
  writing: { prompt: string; model: string; support: string; extension: string; feedback: string[] };
  speaking: { prompt: string; model: string; followup: string; instructions: string; support: string; extension: string; observation: string };
  stages: LessonTwoStage[];
  homework: string[];
  followup: { status: string; delivery: string; passage: string; items: LessonTwoItem[]; writing: string; speaking: string; review: string };
}

export interface TeacherLessonTwo {
  school: { id: string; name: string; logo_url: string | null };
  lesson_code: "IELTS-02";
  version: "1.0.0";
  source_blob_sha1: string;
  release: "teacher_only";
  content: LessonTwoSource;
}

export async function teacherLessonTwo(schoolId: string): Promise<TeacherLessonTwo> {
  const { data, error } = await supabase.rpc("rpc_ielts_teacher_lesson_two", { p_school: schoolId });
  if (error || !data || data.school?.id !== schoolId ||
      data.lesson_code !== "IELTS-02" || data.version !== "1.0.0" ||
      data.release !== "teacher_only" || data.content?.code !== "IELTS-02" ||
      data.content?.version !== data.version || data.content?.reading?.items?.length !== 6 ||
      data.content?.stages?.length !== 8 || data.content?.followup?.items?.length !== 4 ||
      !/^[a-f0-9]{40}$/.test(data.source_blob_sha1))
    throw new Error("Lesson 2 is not available for this authorized school.");
  return data as TeacherLessonTwo;
}
