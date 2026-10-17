import { supabase } from './supabaseClient';
export const teacherPackBucket = 'ielts-teacher-course-packs';
export interface ApprovedTeacherPack {
 lesson_code: 'IELTS-03' | 'IELTS-04'; title: string; version: string;
 object_path: string; sha256: string; size_bytes: number;
}
export async function approvedTeacherPacks(schoolId: string): Promise<ApprovedTeacherPack[]> {
 const {data,error}=await supabase.rpc('rpc_ielts_approved_teacher_packs',{p_school:schoolId});
 if(error || data?.school_id!==schoolId || data?.release!=='teacher_only' || !Array.isArray(data.packs))
  throw new Error('Teaching packs unavailable');
 for(const p of data.packs) {
  if(!['IELTS-03','IELTS-04'].includes(p.lesson_code) || typeof p.title!=='string' || !p.title.trim() ||
   typeof p.version!=='string' || !/^[a-f0-9]{64}$/.test(p.sha256) ||
   !Number.isInteger(p.size_bytes) || p.size_bytes<1 || p.size_bytes>20000000 ||
   p.object_path!==`${schoolId}/${p.lesson_code}/${p.version}/${p.sha256}.zip`)
    throw new Error('Teaching pack identity mismatch');
 }
 return data.packs;
}
export async function approvedTeacherPackBlob(pack: ApprovedTeacherPack): Promise<Blob> {
 const {data,error}=await supabase.storage.from(teacherPackBucket).download(pack.object_path);
 if(error || !data || data.size!==pack.size_bytes) throw new Error('Teaching pack unavailable');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await data.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==pack.sha256) throw new Error('Teaching pack verification failed');
 return data;
}
