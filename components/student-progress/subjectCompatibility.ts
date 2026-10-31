// Schools name subjects their own way ("ESL", "English as a Second Language") while the governed
// question bank files the same content under the registry subject ("English"). The intervention RPC
// already resolves that alias when it selects exact/related questions, so UI that re-checks subject
// must accept the same family rather than require a byte-equal label.
const normalize = (value?: string | null) => (value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const SUBJECT_FAMILIES: string[][] = [
  ['english', 'esl', 'efl', 'english language', 'english as a second language', 'english as an additional language', 'english esl'],
  ['mathematics', 'maths', 'math'],
  ['digital technology', 'ict', 'computing', 'computer science'],
  ['science', 'biology', 'chemistry', 'physics', 'coordinated sciences', 'combined science'],
];

export const subjectsCompatible = (a?: string | null, b?: string | null): boolean => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return SUBJECT_FAMILIES.some((family) => family.includes(left) && family.includes(right));
};
