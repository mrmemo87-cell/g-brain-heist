import { supabase } from './supabaseClient';

/** Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A: construct mappings proposed in bulk, approved by a named content administrator. */
export interface ConstructMappingItem {
  id: string;
  material_type: string;
  material_id: string;
  display_code: string;
  title: string;
  item_key: string | null;
  item_text: string | null;
  node_code: string;
  node_name: string;
  role: 'primary' | 'supporting';
  rationale: string;
  status: 'proposed' | 'approved' | 'rejected' | 'superseded';
}
export interface ConstructMappingBatch {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'changes_requested' | 'superseded';
  proposed_by: string;
  proposal_basis: string;
  created_at: string;
  decided_at: string | null;
  decision_notes: string | null;
  reviewer: string | null;
  sha256: string;
  minimum_sample: number;
  items: ConstructMappingItem[];
}

const messages: Record<string, string> = {
  forbidden: 'Only a platform content administrator can review construct mappings.',
  batch_changed: 'This batch changed after you opened it. Reload and review the current version.',
  batch_already_decided: 'Someone already decided this batch. Reload to see the result.',
  sample_too_small: 'Check at least the minimum sample before approving.',
  notes_required: 'Add a short note (at least 10 characters) describing what you checked.',
};
const friendly = (message: string) => Object.entries(messages).find(([key]) => message.includes(key))?.[1]
  ?? 'The review could not be saved. Check your connection and retry.';

export async function constructMappingQueue(): Promise<ConstructMappingBatch[]> {
  const { data, error } = await supabase.rpc('rpc_ielts_construct_mapping_queue');
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as ConstructMappingBatch[];
}

export async function decideConstructMappingBatch(batch: ConstructMappingBatch, decision: 'approved' | 'changes_requested', sample: string[], rejected: string[], notes: string) {
  const { data, error } = await supabase.rpc('rpc_ielts_construct_mapping_decide', {
    p_batch: batch.id, p_sha256: batch.sha256, p_decision: decision, p_sample: sample, p_rejected: rejected, p_notes: notes,
  });
  if (error) throw new Error(friendly(error.message));
  return data as { status: string; approved: number; total: number };
}

/** A random sample of the requested size, so reviewers do not only check the first rows. */
export function randomSample<T>(items: T[], size: number, random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(size, copy.length));
}

/** Practice-content batches (Diagnostic Bible 2.0.0 section 15E.2A): AI-drafted materials released by batch sample review. */
export interface PracticeContentItem {
  ref: string; material_type: string; material_id: string; item_key: string; display_code: string | null; status: string;
  preview: { title?: string; level?: string; passage?: string; prompt?: string; part?: number; follow_ups?: string[]; task_type?: string;
    questions?: { n: number; question: string; options: string[] | null; answer: unknown; evidence: string }[] } | null;
  matches: { display_code: string; reason: string; similarity?: number }[];
  constructs: { item_key: string | null; role: string; name: string; code: string }[];
}
export interface PracticeContentBatch extends Omit<ConstructMappingBatch, 'items'> { items: PracticeContentItem[] }
const contentMessages: Record<string, string> = {
  ...messages, notes_required: 'Add a note of at least 20 characters describing what you checked.',
  flagged_item_not_sampled: 'Every item with an originality flag must be in your sample. Open and check the flagged items.',
  item_needs_individual_review: 'One item shares content with existing material. Reject it here and review it individually.',
};
export async function practiceContentQueue(): Promise<PracticeContentBatch[]> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_content_queue');
  if (error) throw new Error(Object.entries(contentMessages).find(([k]) => error.message.includes(k))?.[1] ?? 'The practice bank could not load.');
  return (data ?? []) as PracticeContentBatch[];
}
export async function decidePracticeContent(batch: PracticeContentBatch, decision: 'approved' | 'changes_requested', sample: string[], rejected: string[], notes: string) {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_content_decide', { p_batch: batch.id, p_sha256: batch.sha256, p_decision: decision, p_sample: sample, p_rejected: rejected, p_notes: notes });
  if (error) throw new Error(Object.entries(contentMessages).find(([k]) => error.message.includes(k))?.[1] ?? 'The review could not be saved. Check your connection and retry.');
  return data as { status: string; approved: number; total: number };
}
