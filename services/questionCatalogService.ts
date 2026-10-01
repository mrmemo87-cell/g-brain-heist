import type { TeacherQuestion } from '../types';
import { supabase } from './supabaseClient';

export interface QuestionCatalogCursor {
  createdAt: string;
  id: string;
}

export type QuestionCatalogPool = 'all' | 'brains_heist' | 'school' | 'mine';

export interface QuestionCatalogPage {
  success: boolean;
  items: TeacherQuestion[];
  pageSize: number;
  hasMore: boolean;
  nextCursor: QuestionCatalogCursor | null;
}

export interface TeacherQuestionCatalogFilters {
  subject?: string | null;
  difficulty?: string | null;
  teacherId?: string | null;
  pageSize?: number;
  cursor?: QuestionCatalogCursor | null;
  search?: string | null;
  topic?: string | null;
  pool?: QuestionCatalogPool;
}

export interface StudentQuestionCatalogFilters {
  subjectCode: string;
  difficulty?: string | null;
  pageSize?: number;
  cursor?: QuestionCatalogCursor | null;
  search?: string | null;
  topic?: string | null;
}

export interface StudentQuestionProgressSummary {
  success: boolean;
  ready: boolean;
  academicYearId?: string | null;
  gradeLevel?: string | null;
  subjects: Array<{
    id: string;
    code: string;
    name: string;
    answeredCount: number;
    totalAvailable: number;
    difficulties: {
      easy: { total: number; completed: number };
      medium: { total: number; completed: number };
      hard: { total: number; completed: number };
    };
  }>;
}

const pageSize = (value?: number) => Math.max(1, Math.min(value ?? 40, 100));

export const fetchTeacherQuestionCatalogPage = async (
  filters: TeacherQuestionCatalogFilters = {},
): Promise<QuestionCatalogPage> => {
  const { data, error } = await supabase.rpc('rpc_teacher_question_catalog_page', {
    p_subject: filters.subject?.trim() || null,
    p_difficulty: filters.difficulty?.trim() || null,
    p_teacher_id: filters.teacherId || null,
    p_page_size: pageSize(filters.pageSize),
    p_cursor_created_at: filters.cursor?.createdAt || null,
    p_cursor_id: filters.cursor?.id || null,
    p_search: filters.search?.trim() || null,
    p_topic: filters.topic?.trim() || null,
    p_pool: filters.pool || 'all',
  });
  if (error) throw error;
  const payload = (data || {}) as Partial<QuestionCatalogPage>;
  return {
    success: payload.success !== false,
    items: Array.isArray(payload.items) ? payload.items : [],
    pageSize: Number(payload.pageSize || pageSize(filters.pageSize)),
    hasMore: Boolean(payload.hasMore),
    nextCursor: payload.nextCursor || null,
  };
};

export const fetchTeacherQuestionsByIds = async (
  questionIds: string[],
): Promise<TeacherQuestion[]> => {
  const uniqueIds = [...new Set(questionIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const chunks: string[][] = [];
  for (let start = 0; start < uniqueIds.length; start += 200) {
    chunks.push(uniqueIds.slice(start, start + 200));
  }

  const pages = await Promise.all(chunks.map(async (ids) => {
    const { data, error } = await supabase.rpc('rpc_teacher_question_catalog_by_ids', {
      p_question_ids: ids,
    });
    if (error) throw error;
    const payload = (data || {}) as { items?: TeacherQuestion[] };
    return Array.isArray(payload.items) ? payload.items : [];
  }));

  const byId = new Map(pages.flat().map((question) => [question.id, question]));
  return uniqueIds.map((id) => byId.get(id)).filter((question): question is TeacherQuestion => Boolean(question));
};

export const fetchStudentQuestionCatalogPage = async (
  filters: StudentQuestionCatalogFilters,
): Promise<QuestionCatalogPage & { ready?: boolean }> => {
  const { data, error } = await supabase.rpc('rpc_student_question_catalog_page', {
    p_subject_code: filters.subjectCode,
    p_difficulty: filters.difficulty?.trim() || null,
    p_page_size: pageSize(filters.pageSize),
    p_cursor_created_at: filters.cursor?.createdAt || null,
    p_cursor_id: filters.cursor?.id || null,
    p_search: filters.search?.trim() || null,
    p_topic: filters.topic?.trim() || null,
  });
  if (error) throw error;
  const payload = (data || {}) as Partial<QuestionCatalogPage> & { ready?: boolean };
  return {
    success: payload.success !== false,
    ready: payload.ready,
    items: Array.isArray(payload.items) ? payload.items : [],
    pageSize: Number(payload.pageSize || pageSize(filters.pageSize)),
    hasMore: Boolean(payload.hasMore),
    nextCursor: payload.nextCursor || null,
  };
};

export const fetchStudentQuestionProgressSummary = async (): Promise<StudentQuestionProgressSummary> => {
  const { data, error } = await supabase.rpc('rpc_student_question_progress_summary');
  if (error) throw error;
  const payload = (data || {}) as Partial<StudentQuestionProgressSummary>;
  return {
    success: payload.success !== false,
    ready: payload.ready !== false,
    academicYearId: payload.academicYearId || null,
    gradeLevel: payload.gradeLevel || null,
    subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
  };
};
