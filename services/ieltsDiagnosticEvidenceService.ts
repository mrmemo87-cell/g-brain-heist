import { supabase } from './supabaseClient';

export interface IeltsDiagnosticResult {
  label: string;
  raw_score: number;
  marks_possible: number;
  confidence: { level: 'low'; items_answered: number; items_possible: number; constructs_sampled: number; constructs_with_responses: number };
  warnings: string[];
  integrity_state: 'unreviewed' | 'review_required';
  next_step: string;
  readiness_available: false;
  persistent_weakness_available: false;
}

export async function fetchIeltsDiagnosticResult(attemptId: string): Promise<IeltsDiagnosticResult | null> {
  const { data, error } = await supabase.rpc('rpc_ielts_diagnostic_result', { p_attempt_id: attemptId });
  if (error) throw new Error('Your answers are saved. The result could not be loaded. Please try again.');
  if (data === null) return null;
  const value = data as IeltsDiagnosticResult;
  if (!Number.isInteger(value.raw_score) || !Number.isInteger(value.marks_possible)
    || value.raw_score < 0 || value.marks_possible < 1 || value.raw_score > value.marks_possible
    || value.confidence?.level !== 'low' || value.readiness_available !== false
    || value.persistent_weakness_available !== false || !Array.isArray(value.warnings)) {
    throw new Error('Your answers are saved. Your result needs review before it can be shown.');
  }
  return value;
}

export function getIeltsScreenerAudio(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  if (value['assessment_mode'] !== 'screener' || typeof value['audio_url'] !== 'string') return null;
  try { const url = new URL(value['audio_url']); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}
