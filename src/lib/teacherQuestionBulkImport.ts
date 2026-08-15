import type {
  CreateQuestionRequest,
  QuestionDifficulty,
  QuestionOption,
  QuestionType,
  Subject,
} from '../../types';

export interface TeacherQuestionImportRow extends CreateQuestionRequest {
  sourceRow: number;
}

export interface TeacherQuestionImportIssue {
  row: number;
  message: string;
}

export interface TeacherQuestionImportPreview {
  questions: TeacherQuestionImportRow[];
  issues: TeacherQuestionImportIssue[];
  duplicateRows: number[];
}

const SUBJECTS: Record<string, Subject> = {
  maths: 'Maths',
  math: 'Maths',
  mathematics: 'Maths',
  science: 'Science',
  biology: 'Biology',
  chemistry: 'Chemistry',
  physics: 'Physics',
  english: 'English',
  'english language': 'English',
  russian: 'Russian Language',
  'russian language': 'Russian Language',
  kyrgyz: 'Kyrgyz Language',
  'kyrgyz language': 'Kyrgyz Language',
  german: 'German Language',
  'german language': 'German Language',
  geography: 'Geography',
  'global perspective': 'Global Perspective',
  'global perspectives': 'Global Perspective',
  'travel & tourism': 'Travel & Tourism',
  'travel and tourism': 'Travel & Tourism',
  'travel tourism': 'Travel & Tourism',
  ict: 'ICT',
};

const normalizeHeader = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
const normalizeComparable = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const spreadsheetDatePattern = /^(?:20\d{2}[⁄/]\d{1,2}[⁄/]\d{1,2}|\d{1,2}月\d{1,2}日)$/;

const parseDelimitedRows = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  if (quoted) throw new Error('The file contains an unclosed quoted value.');
  return rows;
};

const parseDifficulty = (value: string): QuestionDifficulty | null => {
  const normalized = normalizeComparable(value);
  return normalized === 'easy' || normalized === 'medium' || normalized === 'hard' ? normalized : null;
};

const parseQuestionType = (value: string): QuestionType | null => {
  const normalized = normalizeHeader(value);
  if (normalized === 'multiple_choice' || normalized === 'mcq') return 'multiple_choice';
  if (normalized === 'true_false' || normalized === 'boolean') return 'true_false';
  if (normalized === 'short_answer' || normalized === 'shortanswer') return 'short_answer';
  return null;
};

const parseGrades = (value: string): number[] => {
  if (!value.trim()) return [];
  const grades = [...new Set(value.split(/[|;/,]+/).map((part) => Number.parseInt(part.trim(), 10)))];
  if (grades.some((grade) => !Number.isInteger(grade) || grade < 1 || grade > 12)) {
    throw new Error('grade_levels must contain only Grades 1–12, separated by |, ;, /, or commas');
  }
  return grades.sort((left, right) => left - right);
};

const optionText = (option: string | QuestionOption) => typeof option === 'string' ? option : option.text;

export const parseTeacherQuestionImport = (input: string): TeacherQuestionImportPreview => {
  const rows = parseDelimitedRows(input);
  if (rows.length < 2) throw new Error('Add a header row and at least one question.');

  const headers = rows[0].map(normalizeHeader);
  const column = (...aliases: string[]) => aliases.map((alias) => headers.indexOf(alias)).find((index) => index >= 0) ?? -1;
  const columns = {
    subject: column('subject'),
    topic: column('topic', 'topic_name'),
    gradeLevels: column('grade_levels', 'grades', 'grade_level'),
    difficulty: column('difficulty'),
    questionType: column('question_type', 'questiontype', 'type'),
    questionText: column('question_text', 'question'),
    option1: column('option1', 'option_1', 'option_a'),
    option2: column('option2', 'option_2', 'option_b'),
    option3: column('option3', 'option_3', 'option_c'),
    option4: column('option4', 'option_4', 'option_d'),
    correctAnswer: column('correct_answer', 'answer'),
    explanation: column('explanation'),
    points: column('points', 'xp'),
    timeLimit: column('time_limit', 'time_limit_seconds', 'seconds'),
  };
  const missing = [
    ['subject', columns.subject],
    ['difficulty', columns.difficulty],
    ['question_type', columns.questionType],
    ['question_text', columns.questionText],
    ['correct_answer', columns.correctAnswer],
  ].filter(([, index]) => Number(index) < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const questions: TeacherQuestionImportRow[] = [];
  const issues: TeacherQuestionImportIssue[] = [];
  const duplicateRows: number[] = [];
  const fingerprints = new Set<string>();

  rows.slice(1).forEach((cells, offset) => {
    const sourceRow = offset + 2;
    const read = (index: number) => index >= 0 ? (cells[index] || '').trim() : '';
    try {
      const subject = SUBJECTS[normalizeComparable(read(columns.subject))];
      const difficulty = parseDifficulty(read(columns.difficulty));
      const questionType = parseQuestionType(read(columns.questionType));
      const questionText = read(columns.questionText);
      const correctAnswer = read(columns.correctAnswer);
      if (!subject) throw new Error('Use a supported subject name');
      if (!difficulty) throw new Error('difficulty must be easy, medium, or hard');
      if (!questionType) throw new Error('question_type must be multiple_choice, true_false, or short_answer');
      if (!questionText) throw new Error('question_text is required');
      if (!correctAnswer) throw new Error('correct_answer is required');

      const rawOptions = [columns.option1, columns.option2, columns.option3, columns.option4]
        .map(read)
        .filter(Boolean);
      const options: string[] | undefined = questionType === 'multiple_choice'
        ? rawOptions
        : questionType === 'true_false' ? ['True', 'False'] : undefined;
      if (questionType === 'multiple_choice') {
        if (rawOptions.length < 2) throw new Error('multiple_choice questions require at least two options');
        const convertedValue = [...rawOptions, correctAnswer].find((value) => spreadsheetDatePattern.test(value));
        if (convertedValue) {
          throw new Error(`"${convertedValue}" looks like a fraction converted into a date. Format fraction cells as Text, restore the fraction, then import again`);
        }
        const normalizedOptions = rawOptions.map(normalizeComparable);
        if (new Set(normalizedOptions).size !== normalizedOptions.length) {
          throw new Error('answer options must be unique. Duplicate TRUE/FALSE values can mean a spreadsheet evaluated a comparison formula; format option cells as Text');
        }
        if (!normalizedOptions.includes(normalizeComparable(correctAnswer))) {
          throw new Error('correct_answer must match one of the answer options');
        }
      }
      if (questionType === 'true_false' && !['true', 'false'].includes(normalizeComparable(correctAnswer))) {
        throw new Error('true_false correct_answer must be True or False');
      }

      const points = Math.min(Math.max(Number.parseInt(read(columns.points), 10) || 10, 1), 30);
      const timeLimit = Math.min(Math.max(Number.parseInt(read(columns.timeLimit), 10) || 30, 5), 600);
      const eligibleGradeLevels = parseGrades(read(columns.gradeLevels));
      const fingerprint = [subject, normalizeComparable(questionText), normalizeComparable(correctAnswer), ...(options || []).map(optionText).map(normalizeComparable)].join('|');
      if (fingerprints.has(fingerprint)) {
        duplicateRows.push(sourceRow);
        return;
      }
      fingerprints.add(fingerprint);
      questions.push({
        sourceRow,
        subject,
        topic: read(columns.topic) || 'General',
        topic_name: read(columns.topic) || 'General',
        difficulty,
        question_text: questionText,
        question_type: questionType,
        options,
        correct_answer: correctAnswer,
        explanation: read(columns.explanation),
        points,
        time_limit: timeLimit,
        eligible_grade_levels: eligibleGradeLevels,
        grade_level: eligibleGradeLevels.join(','),
      });
    } catch (error) {
      issues.push({ row: sourceRow, message: error instanceof Error ? error.message : 'Invalid row' });
    }
  });

  if (questions.length > 500) throw new Error('A bulk import can contain at most 500 valid questions. Split this file into smaller batches.');
  return { questions, issues, duplicateRows };
};

export const TEACHER_QUESTION_IMPORT_TEMPLATE = `subject,topic,grade_levels,difficulty,question_type,question_text,option1,option2,option3,option4,correct_answer,explanation,points,time_limit
Maths,Fractions,6|7,easy,multiple_choice,"What is 1/2 + 1/4?","1/4","2/4","3/4","1","3/4","Add the fractions using a common denominator.",10,30
Science,Lab Safety,7,medium,true_false,"Safety glasses should be worn during practical work.","","","","","True","Eye protection reduces laboratory risk.",15,30`;
