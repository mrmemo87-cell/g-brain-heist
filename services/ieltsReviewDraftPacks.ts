import { supabase } from './supabaseClient';
import { teacherPackBucket } from './ieltsApprovedTeacherPacks';

export type ReviewDecisionKind = 'approved' | 'changes_requested';
export interface ReviewDecision { decision: ReviewDecisionKind; notes: string | null; decided_at: string; pack_sha256: string }
export interface ReviewRecording { id: string; status: string }
export interface ReviewDraftPack {
 lesson_code: string; title: string; version: string; source_sha256: string;
 object_path: string; sha256: string; size_bytes: number;
 recordings: ReviewRecording[]; published_at: string; decision: ReviewDecision | null;
}
export interface ReviewDraftCatalogue { canDecide: boolean; packs: ReviewDraftPack[] }

const hex64 = /^[a-f0-9]{64}$/;
// Core lessons 05-24, optional extension lessons X1-X8 and full mock tests M1-M3.
const lessonCode = /^IELTS-(0[5-9]|1[0-9]|2[0-4]|X[1-8]|M[1-3])$/;
const semver = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function validDecision(d: unknown): d is ReviewDecision {
 if (d === null) return true;
 const r = d as ReviewDecision;
 return !!r && (r.decision === 'approved' || r.decision === 'changes_requested') && typeof r.decided_at === 'string'
  && hex64.test(r.pack_sha256) && (r.notes === null || typeof r.notes === 'string');
}

export async function reviewDraftPacks(schoolId: string): Promise<ReviewDraftCatalogue> {
 const { data, error } = await supabase.rpc('rpc_ielts_review_draft_packs', { p_school: schoolId });
 // Teachers without programme-management rights simply have no review drafts; the server decides.
 if ((error as { code?: string } | null)?.code === '42501') return { canDecide: false, packs: [] };
 if (error || data?.school_id !== schoolId || data?.release !== 'review_draft' || typeof data?.can_decide !== 'boolean' || !Array.isArray(data.packs))
  throw new Error('Review drafts unavailable');
 for (const p of data.packs) {
  if (!lessonCode.test(p.lesson_code) || typeof p.title !== 'string' || !p.title.trim() || !semver.test(p.version)
   || !hex64.test(p.sha256) || !hex64.test(p.source_sha256) || !Number.isInteger(p.size_bytes) || p.size_bytes < 1 || p.size_bytes > 20000000
   || p.object_path !== `review-drafts/${schoolId}/${p.lesson_code}/${p.version}/${p.sha256}.zip`
   || !Array.isArray(p.recordings) || !p.recordings.every((r: ReviewRecording) => typeof r?.id === 'string' && typeof r?.status === 'string')
   || typeof p.published_at !== 'string' || !validDecision(p.decision ?? null))
   throw new Error('Review draft identity mismatch');
 }
 return { canDecide: data.can_decide, packs: data.packs.map((p: ReviewDraftPack) => ({ ...p, decision: p.decision ?? null })) };
}

export async function reviewDraftPackBlob(pack: ReviewDraftPack): Promise<Blob> {
 const { data, error } = await supabase.storage.from(teacherPackBucket).download(pack.object_path);
 if (error || !data || data.size !== pack.size_bytes) throw new Error('Review draft unavailable');
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await data.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
 if (hash !== pack.sha256) throw new Error('Review draft verification failed');
 return data;
}

export async function recordReviewDecision(schoolId: string, pack: ReviewDraftPack, decision: ReviewDecisionKind, notes: string): Promise<ReviewDecision> {
 const trimmed = notes.trim();
 if (decision === 'changes_requested' && !trimmed) throw new Error('Describe the changes you need.');
 if (trimmed.length > 4000) throw new Error('Notes are limited to 4,000 characters.');
 const { data, error } = await supabase.rpc('rpc_ielts_record_review_decision', {
  p_school: schoolId, p_lesson_code: pack.lesson_code, p_version: pack.version, p_pack_sha256: pack.sha256,
  p_decision: decision, p_notes: trimmed || null,
 });
 if (error || data?.lesson_code !== pack.lesson_code || data?.version !== pack.version || data?.decision !== decision || data?.pack_sha256 !== pack.sha256)
  throw new Error('The decision could not be saved. Please retry.');
 return { decision, notes: data.notes ?? null, decided_at: data.decided_at, pack_sha256: data.pack_sha256 };
}
