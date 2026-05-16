import type { IeltsExamSection } from './ieltsExamModeService.js';

export type RenderableExamQuestion = {
  id: string;
  prompt: string;
  type?: string;
  options?: string[];
};

export type NormalizedExamSectionPayload = {
  title: string;
  instructions: string;
  questions: RenderableExamQuestion[];
};

const QUESTION_ARRAY_KEYS = ['questions', 'items', 'prompts'] as const;
const TASK_ARRAY_KEYS = ['tasks', 'parts', 'sections', 'passages'] as const;
const NESTED_PAYLOAD_KEYS = ['payload', 'content', 'section', 'body'] as const;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const textFromKeys = (source: Record<string, unknown>, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = asText(source[key]);
    if (value.trim()) return value;
  }
  return fallback;
};

const optionsFrom = (row: Record<string, unknown>): string[] | undefined => {
  const rawOptions = Array.isArray(row['options']) ? row['options'] : Array.isArray(row['choices']) ? row['choices'] : undefined;
  const options = rawOptions?.map((option) => asText(option)).filter((option) => option.trim());
  return options && options.length > 0 ? options : undefined;
};

const unwrapPayload = (payload: unknown, section: string): unknown => {
  let current = payload;
  const seen = new Set<unknown>();

  while (isObject(current) && !seen.has(current)) {
    seen.add(current);

    const sectionValue = current[section];
    if (isObject(sectionValue) || Array.isArray(sectionValue)) {
      current = sectionValue;
      continue;
    }

    const wrapperKey = NESTED_PAYLOAD_KEYS.find((key) => {
      const value = (current as Record<string, unknown>)[key];
      return isObject(value) || Array.isArray(value);
    });

    if (!wrapperKey) break;
    current = current[wrapperKey];
  }

  return current;
};

const makeQuestion = (item: unknown, section: string, index: number, prefix?: string): RenderableExamQuestion => {
  const row = isObject(item) ? item : { prompt: item };
  const id = textFromKeys(row, ['id', 'question_id', 'key', 'name'], `${section}-${index + 1}`);
  const prompt = textFromKeys(row, ['prompt', 'body', 'question', 'text', 'task', 'instructions'], `Question ${index + 1}`);
  return {
    id,
    prompt: prefix ? `${prefix}: ${prompt}` : prompt,
    type: textFromKeys(row, ['type', 'question_type', 'answer_type'], section === 'writing' ? 'essay' : 'text'),
    options: optionsFrom(row),
  };
};

const taskPrefix = (task: Record<string, unknown>, taskIndex: number): string => textFromKeys(
  task,
  ['title', 'name', 'heading'],
  textFromKeys(task, ['passage_title'], `Task ${taskIndex + 1}`)
);

const taskContext = (task: Record<string, unknown>): string => textFromKeys(task, ['passage', 'text', 'context', 'description', 'instructions']);

const findQuestionArray = (source: Record<string, unknown>): unknown[] | undefined => {
  for (const key of QUESTION_ARRAY_KEYS) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return undefined;
};

const extractFromTask = (task: unknown, section: string, taskIndex: number, startIndex: number): RenderableExamQuestion[] => {
  if (!isObject(task)) return [makeQuestion(task, section, startIndex)];

  const nestedQuestions = findQuestionArray(task);
  if (nestedQuestions && nestedQuestions.length > 0) {
    const prefixParts = [taskPrefix(task, taskIndex), taskContext(task)].filter((part) => part.trim());
    const prefix = prefixParts.length > 0 ? prefixParts.join(' — ') : undefined;
    return nestedQuestions.map((question, questionIndex) => makeQuestion(question, section, startIndex + questionIndex, prefix));
  }

  return [makeQuestion(task, section, startIndex)];
};

export const extractIeltsQuestions = (payload: unknown, section: IeltsExamSection | string): RenderableExamQuestion[] => {
  if (payload === null || payload === undefined || payload === '') return [];

  const sourcePayload = unwrapPayload(payload, section);

  if (Array.isArray(sourcePayload)) {
    return sourcePayload.flatMap((item, index) => extractFromTask(item, section, index, index));
  }

  const source = isObject(sourcePayload) ? sourcePayload : { body: sourcePayload };
  const directQuestions = findQuestionArray(source);
  if (directQuestions && directQuestions.length > 0) {
    return directQuestions.map((item, index) => makeQuestion(item, section, index));
  }

  for (const key of TASK_ARRAY_KEYS) {
    const tasks = source[key];
    if (Array.isArray(tasks) && tasks.length > 0) {
      let nextIndex = 0;
      return tasks.flatMap((task, taskIndex) => {
        const questions = extractFromTask(task, section, taskIndex, nextIndex);
        nextIndex += questions.length;
        return questions;
      });
    }
  }

  const prompt = textFromKeys(source, ['prompt', 'body', 'question', 'text', 'task', 'instructions', 'title']);
  if (!prompt.trim()) return [];

  return [{ id: `${section}-response`, prompt, type: section === 'writing' ? 'essay' : 'text' }];
};

export const getIeltsSectionTitle = (payload: unknown, section: IeltsExamSection | string, fallback: string): string => {
  const sourcePayload = unwrapPayload(payload, section);
  if (!isObject(sourcePayload)) return fallback;
  return textFromKeys(sourcePayload, ['title', 'name', 'heading'], fallback);
};

export const getIeltsSectionInstructions = (payload: unknown, section: IeltsExamSection | string): string => {
  const sourcePayload = unwrapPayload(payload, section);
  if (!isObject(sourcePayload)) return '';
  return textFromKeys(sourcePayload, ['instructions', 'description', 'directions']);
};

export const validateRenderableExamPayload = (payload: unknown, section: IeltsExamSection | string): { ok: boolean; questionCount: number; message?: string } => {
  const questionCount = extractIeltsQuestions(payload, section).length;
  if (questionCount > 0) return { ok: true, questionCount };
  return {
    ok: false,
    questionCount,
    message: 'Payload must include a non-empty questions/items/prompts array, tasks/parts/passages with nested questions, or a prompt/text/task string.',
  };
};
