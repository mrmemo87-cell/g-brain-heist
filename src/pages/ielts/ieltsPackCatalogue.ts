/** Presentation helpers shared by the teacher library: pack kind, course week and skill label. */
export type PackKind = 'course' | 'extension' | 'vocabulary' | 'mock';

export const packKind = (code: string): PackKind =>
  code.startsWith('IELTS-M') ? 'mock' : code.startsWith('IELTS-X') ? 'extension' : code.startsWith('IELTS-V') ? 'vocabulary' : 'course';

/** Short code shown in the number badge: 01, X1, V1, M1. */
export const packNumber = (code: string) => code.replace(/^IELTS-/, '');

/** The 24-lesson course runs two lessons a week. */
export const courseWeek = (code: string) => Math.ceil(Number(packNumber(code)) / 2);

const SKILLS: [RegExp, string][] = [
  [/mock test/i, 'All skills'],
  [/^vocabulary/i, 'Vocabulary'],
  [/fresh receptive|listening.*reading|reading.*listening/i, 'Listening + Reading'],
  [/fresh productive|essay.*long turn/i, 'Writing + Speaking'],
  [/paragraphs and speaking/i, 'Writing + Speaking'],
  [/listening/i, 'Listening'],
  [/reading/i, 'Reading'],
  [/writing|task 1|task 2/i, 'Writing'],
  [/speaking|interview/i, 'Speaking'],
];

export const packSkill = (title: string) => SKILLS.find(([re]) => re.test(title))?.[1] ?? 'Mixed skills';

export function groupBy<T>(items: T[], key: (item: T) => string | number): [string | number, T[]][] {
  const map = new Map<string | number, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return [...map.entries()];
}

export const kindLabel: Record<PackKind, string> = { course: 'Course lessons', extension: 'Extension lessons', vocabulary: 'Vocabulary lessons', mock: 'Mock tests' };
