import { supabase } from './supabaseClient';

/** Mock results capture (Diagnostic Bible 2.0.0 sections 9.5 and 12A). */
export type MockSection = 'listening' | 'reading' | 'writing' | 'speaking';
export interface Indicative { label: string; low: number | null; high: number | null; central: number | null }
export interface MockResult { section: MockSection; marks: string | null; criteria: Record<string, unknown> | null; revision: number; entered_at: string; raw: number | null; answered: number | null; exposed: boolean; indicative: Indicative | null }
export interface MockSittingSummary { id: string; mock_code: string; sat_on: string; delivery: 'paper' | 'computer'; results: number }
export interface MockSittingList { forms: { code: string; title: string; version: string }[]; sittings: MockSittingSummary[] }
export interface MockSitting {
  sitting: { id: string; mock_code: string; sat_on: string; delivery: 'paper' | 'computer'; batch_id: string };
  form: { code: string; title: string; version: string; items: { s: 'l' | 'r'; n: number; t: string }[] };
  policy: string;
  students: { id: string; name: string; exposed: boolean; results: Partial<Record<MockSection, MockResult>> }[];
}

const messages: Record<string, string> = {
  result_changed: 'Someone saved this result after you opened it. Reload the sitting, check it, then save again.',
  marks_need_40_items: 'Enter exactly 40 marks: 1 for correct, 0 for wrong, - for blank.',
  writing_needs_eight_ratings: 'Enter all eight Writing ratings (four per task) as whole or half bands.',
  speaking_needs_four_ratings: 'Enter all four Speaking ratings as whole or half bands.',
  student_not_in_batch: 'This student is no longer in the batch.',
  invalid_date: 'Choose the date the mock was taken (not in the future).',
  batch_access_required: 'You do not have access to this batch.',
  sitting_access_required: 'You do not have access to this sitting.',
  consent_required: 'The student must agree to share this result before it is recorded.',
  overall_mismatch: 'The overall band does not match the four section bands. Check the Test Report Form.',
  invalid_band: 'Bands must be whole or half bands from 0 to 9.',
  not_authorized: 'You cannot record or verify results for this student.',
};
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(Object.entries(messages).find(([k]) => error.message.includes(k))?.[1] ?? 'This could not be saved. Check your connection and retry; saved results are safe.');
  return data as T;
}
export const mockSittings = (batch: string) => rpc<MockSittingList>('rpc_ielts_mock_sittings', { p_batch: batch });
export const openMockSitting = (batch: string, mock: string, satOn: string, delivery: 'paper' | 'computer') =>
  rpc<string>('rpc_ielts_mock_sitting_open', { p_batch: batch, p_mock: mock, p_sat_on: satOn, p_delivery: delivery });
export const mockSitting = (sitting: string) => rpc<MockSitting>('rpc_ielts_mock_sitting', { p_sitting: sitting });
export const saveMockResult = (sitting: string, student: string, section: MockSection, marks: string | null, criteria: Record<string, unknown> | null, revision: number | null) =>
  rpc<MockResult>('rpc_ielts_mock_save', { p_sitting: sitting, p_student: student, p_section: section, p_marks: marks, p_criteria: criteria, p_revision: revision });

/** Normalises typed marks: accepts 1/0/- and the common alternatives ✓ x X ✗ and spaces between groups. */
export function normaliseMarks(input: string): string {
  return input.replace(/[\s,]/g, '').replace(/[✓✔yY+]/g, '1').replace(/[xX✗✘nN]/g, '0').replace(/[_.]/g, '-');
}
export function marksSummary(marks: string) {
  const valid = /^[10-]*$/.test(marks);
  return { valid, length: marks.length, correct: [...marks].filter(c => c === '1').length, answered: [...marks].filter(c => c !== '-').length, complete: valid && marks.length === 40 };
}

/** Real outcome tracking (Diagnostic Bible 2.0.0 section 18A). */
export interface OfficialResult { id: string; test_date: string; test_type: 'academic' | 'general_training'; delivery: 'computer' | 'paper'; listening: number; reading: number; writing: number; speaking: number; overall: number; verified: boolean }
export interface BatchOutcomes { students: { id: string; name: string; official: OfficialResult[]; mock_ranges: { mock: string; sat_on: string; section: MockSection; indicative: Indicative }[] }[] }
export const batchOutcomes = (batch: string) => rpc<BatchOutcomes>('rpc_ielts_batch_outcomes', { p_batch: batch });
export const recordOfficialResult = (student: string, r: { test_date: string; test_type: string; delivery: string; listening: number; reading: number; writing: number; speaking: number; overall: number; centre_country: string; trf_reference: string; consent: boolean }) =>
  rpc<string>('rpc_ielts_official_result_record', { p_student: student, p_test_date: r.test_date, p_test_type: r.test_type, p_delivery: r.delivery, p_listening: r.listening, p_reading: r.reading, p_writing: r.writing, p_speaking: r.speaking, p_overall: r.overall, p_centre_country: r.centre_country, p_trf_reference: r.trf_reference, p_consent: r.consent });
export const verifyOfficialResult = (id: string) => rpc<void>('rpc_ielts_official_result_verify', { p_result: id });
/** IELTS overall: average of the four bands rounded to the nearest half band (.25 and .75 round up). */
export const officialOverall = (l: number, r: number, w: number, s: number) => Math.floor(((l + r + w + s) / 4) * 2 + 0.5) / 2;
