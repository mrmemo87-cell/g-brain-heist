import type { IeltsCourseSkill } from '../../../services/ieltsCourseService';

/** Visual identity for the self-paced course (Visual & UX Bible 13.6). Presentation only. */
export const skillTheme: Record<IeltsCourseSkill, { icon: string; label: string; tone: string; soft: string }> = {
  listening: { icon: '🎧', label: 'Listening', tone: '#0E7490', soft: '#ECFEFF' },
  reading: { icon: '📖', label: 'Reading', tone: '#1746B0', soft: '#EEF3FA' },
  writing: { icon: '✍️', label: 'Writing', tone: '#6D28D9', soft: '#F5F3FF' },
  speaking: { icon: '🎙️', label: 'Speaking', tone: '#B45309', soft: '#FFFBEB' },
  vocabulary: { icon: '🔤', label: 'Vocabulary', tone: '#047857', soft: '#ECFDF5' },
};

export type CourseChapter = { index: number; from: number; to: number; title: string; tagline: string; emblem: string };

export const courseChapters: CourseChapter[] = [
  { index: 1, from: 1, to: 5, title: 'Foundations', tagline: 'How the test works, and your first wins in every paper.', emblem: '🧭' },
  { index: 2, from: 6, to: 10, title: 'Core techniques', tagline: 'Plan essays, fill gaps fast, speak for two full minutes.', emblem: '🛠️' },
  { index: 3, from: 11, to: 15, title: 'Exam strategy', tagline: 'Paraphrase, data reports, lectures and long passages.', emblem: '🎯' },
  { index: 4, from: 16, to: 20, title: 'Exam ready', tagline: 'Discussion, letters and full timed practice.', emblem: '🏆' },
];

/** The vocabulary path is one chapter of six lessons. */
export const vocabularyChapters: CourseChapter[] = [
  { index: 1, from: 1, to: 6, title: 'Word power', tagline: 'Paraphrase, trends, arguments, speaking, word forms and topic collocations.', emblem: '🔤' },
];

export const chaptersFor = (track: 'main' | 'vocabulary' | undefined) => (track === 'vocabulary' ? vocabularyChapters : courseChapters);

export const chapterFor = (position: number, track?: 'main' | 'vocabulary') => {
  const list = chaptersFor(track);
  return list.find((c) => position >= c.from && position <= c.to) ?? list[list.length - 1];
};

export const primarySkill = (skills: IeltsCourseSkill[]): IeltsCourseSkill => skills[0] ?? 'reading';
