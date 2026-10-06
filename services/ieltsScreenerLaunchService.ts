import { supabase } from './supabaseClient';

export type IeltsScreenerStatus = 'ready' | 'scheduled' | 'paused' | 'in_progress' | 'completed' | 'expired' | 'unavailable';
export interface IeltsScreenerEntry {
  title: string;
  code: string;
  exam_event_id: string;
  assignment_id: string | null;
  attempt_id: string | null;
  status: IeltsScreenerStatus;
  duration_minutes: number;
  starts_at: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set<IeltsScreenerStatus>(['ready', 'scheduled', 'paused', 'in_progress', 'completed', 'expired', 'unavailable']);

export function parseIeltsScreenerCatalog(value: unknown): IeltsScreenerEntry[] {
  if (!Array.isArray(value)) throw new Error('We could not check your screener. Please try again.');
  return value.map((entry: IeltsScreenerEntry) => {
    if (!entry || typeof entry.title !== 'string' || typeof entry.code !== 'string'
      || !uuid.test(entry.exam_event_id) || !statuses.has(entry.status)
      || !Number.isInteger(entry.duration_minutes) || entry.duration_minutes < 1
      || (entry.assignment_id !== null && !uuid.test(entry.assignment_id))
      || (entry.attempt_id !== null && !uuid.test(entry.attempt_id))) {
      throw new Error('We could not check your screener. Please try again.');
    }
    // Only this explicit public projection reaches the UI.
    return { title: entry.title, code: entry.code, exam_event_id: entry.exam_event_id,
      assignment_id: entry.assignment_id, attempt_id: entry.attempt_id, status: entry.status,
      duration_minutes: entry.duration_minutes, starts_at: entry.starts_at };
  });
}

export async function fetchIeltsScreenerCatalog(): Promise<IeltsScreenerEntry[]> {
  const { data, error } = await supabase.rpc('rpc_ielts_screener_catalog');
  if (error) throw new Error('We could not check your screener. Please try again.');
  return parseIeltsScreenerCatalog(data);
}

export async function launchIeltsScreener(entry: IeltsScreenerEntry): Promise<string> {
  if (entry.assignment_id && entry.status !== 'completed') return `/ielts/exam/${entry.exam_event_id}`;
  const { data, error } = await supabase.rpc('rpc_ielts_screener_self_assign', { p_code: entry.code });
  if (error || !data || !uuid.test(data.exam_event_id) || data.exam_event_id !== entry.exam_event_id) {
    throw new Error('The screener could not open. Please check your connection and try again.');
  }
  return `/ielts/exam/${data.exam_event_id}`;
}
